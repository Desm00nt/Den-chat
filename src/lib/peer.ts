import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export type MessagePayload = {
  type: 'chat-message';
  id: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  groupId?: string;
} | {
  type: 'status';
  status: 'online' | 'typing' | 'stopped-typing';
  from: string;
  fromName: string;
} | {
  type: 'delivery-receipt';
  messageId: string;
  from: string;
} | {
  type: 'call-signal';
  signal: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'busy';
  from: string;
  fromName: string;
} | {
  type: 'ping';
  from: string;
} | {
  type: 'pong';
  from: string;
} | {
  type: 'group-invite';
  groupId: string;
  groupName: string;
  members: string[];
  from: string;
  fromName: string;
} | {
  type: 'group-message';
  id: string;
  groupId: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
} | {
  type: 'group-update';
  groupId: string;
  action: 'member-added' | 'member-removed' | 'renamed';
  members?: string[];
  newName?: string;
  from: string;
};

// Multiple PeerJS signaling servers for failover
const SIGNALING_SERVERS = [
  { host: '0.peerjs.com', port: 443, secure: true, path: '/' },
  { host: '0.peerjs.com', port: 443, secure: true, path: '/' }, // retry same
];

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

interface QueuedMessage {
  peerId: string;
  data: MessagePayload;
  timestamp: number;
  retries: number;
}

type MessageHandler = (peerId: string, data: MessagePayload) => void;
type StatusHandler = (peerId: string, status: 'connected' | 'disconnected') => void;
type CallHandler = (peerId: string, call: MediaConnection) => void;

class PeerManager {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  activeCall: MediaConnection | null = null;
  localStream: MediaStream | null = null;

  onMessageCallback: MessageHandler | null = null;
  onStatusCallback: StatusHandler | null = null;
  onIncomingCallCallback: CallHandler | null = null;
  onCallStreamCallback: ((stream: MediaStream) => void) | null = null;
  onCallEndCallback: (() => void) | null = null;

  myPeerId: string = '';
  isReady: boolean = false;

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50; // Much more attempts
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private initResolve: ((id: string) => void) | null = null;
  private initReject: ((err: Error) => void) | null = null;
  private currentServerIndex = 0;
  private messageQueue: QueuedMessage[] = [];
  private queueProcessor: ReturnType<typeof setInterval> | null = null;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private contactsToWatch: Set<string> = new Set();
  private connectionRetryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // ========== INIT ==========

  init(peerId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.cleanup();
      this.myPeerId = peerId;
      this.reconnectAttempts = 0;
      this.currentServerIndex = 0;
      this.initResolve = resolve;
      this.initReject = reject;
      this.createPeer(peerId);
      this.startQueueProcessor();
      this.startKeepAlive();
    });
  }

  private createPeer(peerId: string) {
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) { /* */ }
      this.peer = null;
    }

    const server = SIGNALING_SERVERS[this.currentServerIndex % SIGNALING_SERVERS.length];
    console.log(`🔌 Connecting to server ${this.currentServerIndex}:`, server.host);

    try {
      this.peer = new Peer(peerId, {
        host: server.host,
        port: server.port,
        secure: server.secure,
        path: server.path,
        debug: 0,
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
        },
      });
    } catch (_) {
      // Fallback without explicit host
      this.peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
        },
      });
    }

    const timeout = setTimeout(() => {
      if (!this.isReady) {
        console.log('⏱️ Server connection timeout, trying next...');
        this.tryNextServer();
      }
    }, 15000);

    this.peer.on('open', (id) => {
      clearTimeout(timeout);
      console.log('✅ Connected to signaling server, ID:', id);
      this.myPeerId = id;
      this.isReady = true;
      this.reconnectAttempts = 0;

      if (this.initResolve) {
        this.initResolve(id);
        this.initResolve = null;
        this.initReject = null;
      }

      // Reconnect to all watched contacts
      this.reconnectToAllContacts();
    });

    this.peer.on('connection', (conn) => {
      console.log('📥 Incoming connection from:', conn.peer);
      this.setupConnection(conn);
    });

    this.peer.on('call', (call) => {
      this.onIncomingCallCallback?.(call.peer, call);
    });

    this.peer.on('error', (err) => {
      clearTimeout(timeout);
      console.error('❌ Peer error:', err.type, err.message);

      if (err.type === 'unavailable-id') {
        if (this.initReject) {
          this.initReject(new Error('ID уже занят'));
          this.initResolve = null;
          this.initReject = null;
        }
      } else if (err.type === 'peer-unavailable') {
        // Normal — peer is offline, don't reconnect
        console.log('👤 Peer is offline');
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error' || err.type === 'socket-closed') {
        this.isReady = false;
        this.scheduleReconnect();
      }
    });

    this.peer.on('disconnected', () => {
      console.log('⚠️ Disconnected from signaling server');
      this.isReady = false;

      // Try simple reconnect first
      if (this.peer && !this.peer.destroyed) {
        setTimeout(() => {
          if (this.peer && !this.peer.destroyed && !this.isReady) {
            try {
              console.log('🔄 Trying simple reconnect...');
              this.peer.reconnect();
            } catch (_) {
              this.scheduleReconnect();
            }
          }
        }, 1000);
      } else {
        this.scheduleReconnect();
      }
    });

    this.peer.on('close', () => {
      this.isReady = false;
    });
  }

  private tryNextServer() {
    this.currentServerIndex++;
    if (this.currentServerIndex >= SIGNALING_SERVERS.length * 3) {
      // Tried all servers multiple times, wait and restart
      this.currentServerIndex = 0;
      this.scheduleReconnect();
      return;
    }
    this.createPeer(this.myPeerId);
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnect attempts. Resetting counter in 30s...');
      // Reset and try again after 30s
      setTimeout(() => {
        this.reconnectAttempts = 0;
        this.currentServerIndex = 0;
        this.createPeer(this.myPeerId);
      }, 30000);
      return;
    }

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectAttempts++;
    // Fast first attempts, then slower
    const delay = this.reconnectAttempts <= 3 ? 2000
      : this.reconnectAttempts <= 6 ? 5000
      : this.reconnectAttempts <= 10 ? 10000
      : 20000;

    console.log(`🔄 Reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.createPeer(this.myPeerId);
    }, delay);
  }

  // ========== CONNECTION MANAGEMENT ==========

  private setupConnection(conn: DataConnection) {
    const peerId = conn.peer;

    conn.on('open', () => {
      console.log('🔗 Connection opened with:', peerId);
      // Replace old connection if exists
      const old = this.connections.get(peerId);
      if (old && old !== conn) {
        try { old.close(); } catch (_) { /* */ }
      }
      this.connections.set(peerId, conn);
      this.onStatusCallback?.(peerId, 'connected');
      this.startPing(peerId);
      // Flush queued messages for this peer
      this.flushQueueForPeer(peerId);
    });

    conn.on('data', (data) => {
      const payload = data as MessagePayload;
      if (payload.type === 'ping') {
        this.send(peerId, { type: 'pong', from: this.myPeerId });
        return;
      }
      if (payload.type === 'pong') return;
      this.onMessageCallback?.(peerId, payload);
    });

    conn.on('close', () => {
      console.log('🔌 Connection closed with:', peerId);
      this.handleConnectionLost(peerId);
    });

    conn.on('error', (err) => {
      console.error('❌ Connection error with:', peerId, err);
      this.handleConnectionLost(peerId);
    });
  }

  private handleConnectionLost(peerId: string) {
    this.stopPing(peerId);
    this.connections.delete(peerId);
    this.onStatusCallback?.(peerId, 'disconnected');

    // Auto-retry connection if peer is in watchlist
    if (this.contactsToWatch.has(peerId)) {
      this.scheduleContactReconnect(peerId);
    }
  }

  private scheduleContactReconnect(peerId: string) {
    // Don't schedule if already scheduled
    if (this.connectionRetryTimers.has(peerId)) return;

    const timer = setTimeout(async () => {
      this.connectionRetryTimers.delete(peerId);
      if (!this.isConnectedTo(peerId) && this.isReady) {
        try {
          await this.connectTo(peerId);
        } catch (_) {
          // Will retry on next cycle via keep-alive
        }
      }
    }, 10000); // Retry in 10s

    this.connectionRetryTimers.set(peerId, timer);
  }

  private reconnectToAllContacts() {
    for (const peerId of this.contactsToWatch) {
      if (!this.isConnectedTo(peerId)) {
        // Stagger reconnections
        setTimeout(async () => {
          try {
            await this.connectTo(peerId);
          } catch (_) { /* */ }
        }, Math.random() * 3000);
      }
    }
  }

  // Watch a contact for auto-reconnection
  watchContact(peerId: string) {
    this.contactsToWatch.add(peerId);
  }

  connectTo(peerId: string): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      if (!this.peer || this.peer.destroyed || !this.isReady) {
        reject(new Error('Not connected to server'));
        return;
      }

      const existing = this.connections.get(peerId);
      if (existing && existing.open) {
        resolve(existing);
        return;
      }

      // Clean up dead connection
      if (existing) {
        this.stopPing(peerId);
        this.connections.delete(peerId);
      }

      console.log('🔗 Connecting to:', peerId);

      const conn = this.peer.connect(peerId, {
        reliable: true,
        serialization: 'json',
      });

      const timeout = setTimeout(() => {
        if (!conn.open) {
          try { conn.close(); } catch (_) { /* */ }
          reject(new Error('Connection timeout'));
        }
      }, 15000);

      conn.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ Connected to:', peerId);
        this.connections.set(peerId, conn);
        this.onStatusCallback?.(peerId, 'connected');
        this.startPing(peerId);
        this.flushQueueForPeer(peerId);
        resolve(conn);
      });

      conn.on('data', (data) => {
        const payload = data as MessagePayload;
        if (payload.type === 'ping') {
          this.send(peerId, { type: 'pong', from: this.myPeerId });
          return;
        }
        if (payload.type === 'pong') return;
        this.onMessageCallback?.(peerId, payload);
      });

      conn.on('close', () => {
        clearTimeout(timeout);
        this.handleConnectionLost(peerId);
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        this.handleConnectionLost(peerId);
        reject(err);
      });
    });
  }

  // ========== MESSAGING WITH QUEUE ==========

  send(peerId: string, data: MessagePayload): boolean {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      try {
        conn.send(data);
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  // Send with queue — if peer is offline, message goes to queue
  sendOrQueue(peerId: string, data: MessagePayload): boolean {
    const sent = this.send(peerId, data);
    if (!sent) {
      // Only queue important messages (chat messages, group messages)
      if (data.type === 'chat-message' || data.type === 'group-message' || data.type === 'group-invite') {
        this.messageQueue.push({
          peerId,
          data,
          timestamp: Date.now(),
          retries: 0,
        });
        console.log(`📦 Message queued for ${peerId}. Queue size: ${this.messageQueue.length}`);

        // Try to connect to deliver
        if (this.isReady) {
          this.connectTo(peerId).catch(() => { /* will retry */ });
        }
      }
      return false;
    }
    return true;
  }

  private flushQueueForPeer(peerId: string) {
    const toSend = this.messageQueue.filter(m => m.peerId === peerId);
    const remaining = this.messageQueue.filter(m => m.peerId !== peerId);

    let sentCount = 0;
    for (const msg of toSend) {
      if (this.send(peerId, msg.data)) {
        sentCount++;
      } else {
        remaining.push(msg);
      }
    }

    this.messageQueue = remaining;
    if (sentCount > 0) {
      console.log(`📤 Flushed ${sentCount} queued messages to ${peerId}`);
    }
  }

  private startQueueProcessor() {
    if (this.queueProcessor) clearInterval(this.queueProcessor);

    this.queueProcessor = setInterval(() => {
      if (this.messageQueue.length === 0) return;

      // Remove messages older than 24 hours
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      this.messageQueue = this.messageQueue.filter(m => m.timestamp > dayAgo);

      // Try to send queued messages
      const peers = new Set(this.messageQueue.map(m => m.peerId));
      for (const peerId of peers) {
        if (this.isConnectedTo(peerId)) {
          this.flushQueueForPeer(peerId);
        } else if (this.isReady) {
          // Try connecting
          this.connectTo(peerId).catch(() => { /* retry next cycle */ });
        }
      }
    }, 15000); // Check every 15 seconds
  }

  // ========== KEEP ALIVE ==========

  private startKeepAlive() {
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);

    this.keepAliveInterval = setInterval(() => {
      // Reconnect to signaling server if needed
      if (!this.isReady && this.peer) {
        console.log('💓 Keep-alive: not connected, reconnecting...');
        this.scheduleReconnect();
      }

      // Try to connect to offline watched contacts
      for (const peerId of this.contactsToWatch) {
        if (!this.isConnectedTo(peerId) && this.isReady) {
          this.connectTo(peerId).catch(() => { /* */ });
        }
      }
    }, 30000); // Every 30 seconds
  }

  private startPing(peerId: string) {
    this.stopPing(peerId);
    const interval = setInterval(() => {
      if (this.isConnectedTo(peerId)) {
        this.send(peerId, { type: 'ping', from: this.myPeerId });
      } else {
        this.stopPing(peerId);
        this.handleConnectionLost(peerId);
      }
    }, 20000);
    this.pingIntervals.set(peerId, interval);
  }

  private stopPing(peerId: string) {
    const interval = this.pingIntervals.get(peerId);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(peerId);
    }
  }

  isConnectedTo(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return !!conn && conn.open;
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  getQueueSizeForPeer(peerId: string): number {
    return this.messageQueue.filter(m => m.peerId === peerId).length;
  }

  // ========== VOICE CALL ==========

  async startCall(peerId: string): Promise<MediaConnection> {
    if (!this.peer) throw new Error('Peer not initialized');

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const call = this.peer.call(peerId, this.localStream);
    this.activeCall = call;
    this.setupCallListeners(call);

    this.send(peerId, {
      type: 'call-signal',
      signal: 'ringing',
      from: this.myPeerId,
      fromName: '',
    });

    return call;
  }

  async answerCall(call: MediaConnection): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.activeCall = call;
    call.answer(this.localStream);
    this.setupCallListeners(call);
  }

  private setupCallListeners(call: MediaConnection) {
    call.on('stream', (remoteStream) => {
      this.onCallStreamCallback?.(remoteStream);
    });

    call.on('close', () => {
      this.cleanupCall();
      this.onCallEndCallback?.();
    });

    call.on('error', () => {
      this.cleanupCall();
      this.onCallEndCallback?.();
    });
  }

  rejectCall(call: MediaConnection) {
    call.close();
    this.send(call.peer, {
      type: 'call-signal',
      signal: 'rejected',
      from: this.myPeerId,
      fromName: '',
    });
  }

  endCall() {
    if (this.activeCall) {
      const peerId = this.activeCall.peer;
      this.activeCall.close();
      this.send(peerId, {
        type: 'call-signal',
        signal: 'ended',
        from: this.myPeerId,
        fromName: '',
      });
    }
    this.cleanupCall();
    this.onCallEndCallback?.();
  }

  private cleanupCall() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.activeCall = null;
  }

  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled;
      }
    }
    return false;
  }

  isMuted(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      return audioTrack ? !audioTrack.enabled : false;
    }
    return false;
  }

  // ========== EVENT HANDLERS ==========

  onMessage(handler: MessageHandler) { this.onMessageCallback = handler; }
  onPeerStatus(handler: StatusHandler) { this.onStatusCallback = handler; }
  onIncomingCall(handler: CallHandler) { this.onIncomingCallCallback = handler; }
  onCallStream(handler: (stream: MediaStream) => void) { this.onCallStreamCallback = handler; }
  onCallEnd(handler: () => void) { this.onCallEndCallback = handler; }

  // ========== CLEANUP ==========

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = null;
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    this.pingIntervals.forEach(i => clearInterval(i));
    this.pingIntervals.clear();
    this.connectionRetryTimers.forEach(t => clearTimeout(t));
    this.connectionRetryTimers.clear();
    this.endCall();
    this.connections.forEach(conn => { try { conn.close(); } catch (_) { /* */ } });
    this.connections.clear();
    try { this.peer?.destroy(); } catch (_) { /* */ }
    this.peer = null;
    this.isReady = false;
    this.reconnectAttempts = 0;
  }

  destroy() {
    this.cleanup();
    this.messageQueue = [];
    this.contactsToWatch.clear();
    this.initResolve = null;
    this.initReject = null;
  }
}

export const peerManager = new PeerManager();
