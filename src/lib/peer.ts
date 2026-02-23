import Peer, { type DataConnection, type MediaConnection } from 'peerjs';

export type MessagePayload = {
  type: 'chat-message';
  id: string;
  from: string;
  fromName: string;
  text: string;
  timestamp: number;
  // Photo support
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  // Group support
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

// Multiple STUN/TURN servers for stability
const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (most reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Twilio STUN
  { urls: 'stun:global.stun.twilio.com:3478' },
  // Open STUN servers
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'stun:stun.stunprotocol.org:3478' },
  // Free TURN servers (Metered — relay for tough NATs)
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

type ConnectionHandler = (peerId: string, conn: DataConnection) => void;
type MessageHandler = (peerId: string, data: MessagePayload) => void;
type StatusHandler = (peerId: string, status: 'connected' | 'disconnected') => void;
type CallHandler = (peerId: string, call: MediaConnection) => void;

class PeerManager {
  peer: Peer | null = null;
  connections: Map<string, DataConnection> = new Map();
  activeCall: MediaConnection | null = null;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;

  onConnectionCallback: ConnectionHandler | null = null;
  onMessageCallback: MessageHandler | null = null;
  onStatusCallback: StatusHandler | null = null;
  onIncomingCallCallback: CallHandler | null = null;
  onCallStreamCallback: ((stream: MediaStream) => void) | null = null;
  onCallEndCallback: (() => void) | null = null;

  myPeerId: string = '';
  isReady: boolean = false;
  private readyCallbacks: (() => void)[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private pingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  init(peerId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Уничтожаем старый peer если есть
      if (this.peer) {
        this.peer.destroy();
      }

      this.reconnectAttempts = 0;

      this.peer = new Peer(peerId, {
        debug: 2, // Больше логов для отладки
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
        },
      });

      const timeout = setTimeout(() => {
        reject(new Error('Timeout: не удалось подключиться к signaling серверу'));
      }, 15000);

      this.peer.on('open', (id) => {
        clearTimeout(timeout);
        console.log('✅ Peer connected with ID:', id);
        this.myPeerId = id;
        this.isReady = true;
        this.reconnectAttempts = 0;
        this.readyCallbacks.forEach(cb => cb());
        this.readyCallbacks = [];
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        console.log('📥 Incoming connection from:', conn.peer);
        this.setupConnection(conn);
      });

      // Handle incoming voice calls
      this.peer.on('call', (call) => {
        console.log('📞 Incoming call from:', call.peer);
        this.onIncomingCallCallback?.(call.peer, call);
      });

      this.peer.on('error', (err) => {
        console.error('❌ Peer error:', err.type, err.message);
        clearTimeout(timeout);
        
        if (err.type === 'unavailable-id') {
          reject(new Error('ID уже занят. Попробуйте другой.'));
        } else if (err.type === 'peer-unavailable') {
          // Собеседник оффлайн — это нормально
          console.log('Peer unavailable - user is offline');
        } else if (err.type === 'network' || err.type === 'server-error') {
          // Проблемы с сетью — пробуем переподключиться
          this.attemptReconnect(peerId);
        }
      });

      this.peer.on('disconnected', () => {
        console.log('⚠️ Peer disconnected from signaling server');
        this.attemptReconnect(peerId);
      });

      this.peer.on('close', () => {
        console.log('🔴 Peer connection closed');
        this.isReady = false;
      });
    });
  }

  private attemptReconnect(peerId: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`🔄 Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (this.peer && !this.peer.destroyed) {
        this.peer.reconnect();
      } else {
        this.init(peerId).catch(console.error);
      }
    }, delay);
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('✅ Connection opened with:', conn.peer);
      this.connections.set(conn.peer, conn);
      this.onConnectionCallback?.(conn.peer, conn);
      this.onStatusCallback?.(conn.peer, 'connected');
      
      // Запускаем ping для проверки соединения
      this.startPing(conn.peer);
    });

    conn.on('data', (data) => {
      const payload = data as MessagePayload;
      
      // Обрабатываем ping/pong
      if (payload.type === 'ping') {
        this.send(conn.peer, { type: 'pong', from: this.myPeerId });
        return;
      }
      if (payload.type === 'pong') {
        return; // Просто подтверждение что соединение живое
      }
      
      this.onMessageCallback?.(conn.peer, payload);
    });

    conn.on('close', () => {
      console.log('🔴 Connection closed with:', conn.peer);
      this.stopPing(conn.peer);
      this.connections.delete(conn.peer);
      this.onStatusCallback?.(conn.peer, 'disconnected');
    });

    conn.on('error', (err) => {
      console.error('❌ Connection error with', conn.peer, ':', err);
      this.stopPing(conn.peer);
      this.connections.delete(conn.peer);
      this.onStatusCallback?.(conn.peer, 'disconnected');
    });
  }

  private startPing(peerId: string) {
    this.stopPing(peerId); // Очищаем старый интервал если есть
    
    const interval = setInterval(() => {
      if (this.isConnectedTo(peerId)) {
        this.send(peerId, { type: 'ping', from: this.myPeerId });
      } else {
        this.stopPing(peerId);
      }
    }, 30000); // Ping каждые 30 секунд
    
    this.pingIntervals.set(peerId, interval);
  }

  private stopPing(peerId: string) {
    const interval = this.pingIntervals.get(peerId);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(peerId);
    }
  }

  connectTo(peerId: string): Promise<DataConnection> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      // Удаляем старое соединение если оно закрыто
      const existing = this.connections.get(peerId);
      if (existing) {
        if (existing.open) {
          console.log('♻️ Reusing existing connection to:', peerId);
          resolve(existing);
          return;
        } else {
          // Соединение закрыто — удаляем
          this.stopPing(peerId);
          this.connections.delete(peerId);
        }
      }

      console.log('🔗 Connecting to:', peerId);
      const conn = this.peer.connect(peerId, { 
        reliable: true,
        serialization: 'json',
      });

      const timeout = setTimeout(() => {
        if (!conn.open) {
          console.log('⏱️ Connection timeout to:', peerId);
          conn.close();
          reject(new Error('Connection timeout'));
        }
      }, 15000);

      conn.on('open', () => {
        clearTimeout(timeout);
        console.log('✅ Connected to:', peerId);
        this.connections.set(peerId, conn);
        this.onStatusCallback?.(peerId, 'connected');
        this.startPing(peerId);
        resolve(conn);
      });

      conn.on('data', (data) => {
        const payload = data as MessagePayload;
        
        if (payload.type === 'ping') {
          this.send(peerId, { type: 'pong', from: this.myPeerId });
          return;
        }
        if (payload.type === 'pong') {
          return;
        }
        
        this.onMessageCallback?.(peerId, payload);
      });

      conn.on('close', () => {
        clearTimeout(timeout);
        console.log('🔴 Connection closed to:', peerId);
        this.stopPing(peerId);
        this.connections.delete(peerId);
        this.onStatusCallback?.(peerId, 'disconnected');
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        console.error('❌ Connection error to', peerId, ':', err);
        this.stopPing(peerId);
        this.connections.delete(peerId);
        this.onStatusCallback?.(peerId, 'disconnected');
        reject(err);
      });
    });
  }

  send(peerId: string, data: MessagePayload): boolean {
    const conn = this.connections.get(peerId);
    if (conn && conn.open) {
      conn.send(data);
      return true;
    }
    return false;
  }

  isConnectedTo(peerId: string): boolean {
    const conn = this.connections.get(peerId);
    return !!conn && conn.open;
  }

  // ========== VOICE CALL METHODS ==========

  async startCall(peerId: string): Promise<MediaConnection> {
    if (!this.peer) throw new Error('Peer not initialized');

    // Get microphone access
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

    // Notify peer about ringing
    this.send(peerId, {
      type: 'call-signal',
      signal: 'ringing',
      from: this.myPeerId,
      fromName: '',
    });

    return call;
  }

  async answerCall(call: MediaConnection): Promise<void> {
    // Get microphone access
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
      this.remoteStream = remoteStream;
      this.onCallStreamCallback?.(remoteStream);
    });

    call.on('close', () => {
      this.cleanupCall();
      this.onCallEndCallback?.();
    });

    call.on('error', (err) => {
      console.error('Call error:', err);
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
    this.remoteStream = null;
    this.activeCall = null;
  }

  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // returns true if muted
      }
    }
    return false;
  }

  isMuted(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        return !audioTrack.enabled;
      }
    }
    return false;
  }

  // ========== EVENT HANDLERS ==========

  onConnection(handler: ConnectionHandler) {
    this.onConnectionCallback = handler;
  }

  onMessage(handler: MessageHandler) {
    this.onMessageCallback = handler;
  }

  onPeerStatus(handler: StatusHandler) {
    this.onStatusCallback = handler;
  }

  onIncomingCall(handler: CallHandler) {
    this.onIncomingCallCallback = handler;
  }

  onCallStream(handler: (stream: MediaStream) => void) {
    this.onCallStreamCallback = handler;
  }

  onCallEnd(handler: () => void) {
    this.onCallEndCallback = handler;
  }

  onReady(cb: () => void) {
    if (this.isReady) {
      cb();
    } else {
      this.readyCallbacks.push(cb);
    }
  }

  destroy() {
    // Останавливаем все ping интервалы
    this.pingIntervals.forEach((interval) => clearInterval(interval));
    this.pingIntervals.clear();
    
    this.endCall();
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    this.peer?.destroy();
    this.peer = null;
    this.isReady = false;
    this.reconnectAttempts = 0;
  }
}

export const peerManager = new PeerManager();
