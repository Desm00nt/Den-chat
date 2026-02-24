import { useState, useEffect, useCallback, useRef } from 'react';
import { peerManager, type MessagePayload } from '../lib/peer';
import { notificationManager } from '../lib/notifications';
import type { MediaConnection } from 'peerjs';
import {
  saveMessage,
  getMessagesByChatId,
  saveContact,
  getContacts,
  saveProfile,
  getProfile,
  deleteProfile,
  saveGroup,
  getGroups,
  type ChatMessage,
  type Contact,
  type UserProfile,
  type GroupChat,
} from '../lib/db';

export type CallState = {
  active: boolean;
  peerId: string | null;
  peerName: string;
  direction: 'incoming' | 'outgoing' | null;
  status: 'ringing' | 'connected' | 'ended';
  isMuted: boolean;
  duration: number;
  mediaConnection: MediaConnection | null;
};

const initialCallState: CallState = {
  active: false,
  peerId: null,
  peerName: '',
  direction: null,
  status: 'ended',
  isMuted: false,
  duration: 0,
  mediaConnection: null,
};

export function useChat() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatType, setActiveChatType] = useState<'contact' | 'group'>('contact');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineStatus, setOnlineStatus] = useState<Map<string, boolean>>(new Map());
  const [typingStatus, setTypingStatus] = useState<Map<string, boolean>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [callState, setCallState] = useState<CallState>(initialCallState);
  const [queueSize, setQueueSize] = useState(0);

  const activeChatRef = useRef(activeChat);
  const profileRef = useRef(profile);
  const contactsRef = useRef(contacts);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { contactsRef.current = contacts; }, [contacts]);

  // Track queue size
  useEffect(() => {
    const interval = setInterval(() => {
      setQueueSize(peerManager.getQueueSize());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialize notifications on mount
  useEffect(() => {
    notificationManager.init();
  }, []);

  // Load profile on mount
  useEffect(() => {
    getProfile().then((p) => {
      if (p) {
        setProfile(p);
        initPeer(p.peerId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load contacts and groups when profile is ready
  useEffect(() => {
    if (profile) {
      getContacts().then(setContacts);
      getGroups().then(setGroups);
    }
  }, [profile]);

  // Load messages when active chat changes
  useEffect(() => {
    if (activeChat) {
      getMessagesByChatId(activeChat).then(setMessages);
      setUnreadCounts(prev => {
        const next = new Map(prev);
        next.delete(activeChat);
        return next;
      });
    }
  }, [activeChat]);

  // Cleanup call timer
  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, []);

  const startCallTimer = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallState(prev => ({ ...prev, duration: prev.duration + 1 }));
    }, 1000);
  }, []);

  const stopCallTimer = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  }, []);

  const playRemoteAudio = useCallback((stream: MediaStream) => {
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    const audio = new Audio();
    audio.srcObject = stream;
    audio.autoplay = true;
    audio.play().catch(console.error);
    audioRef.current = audio;
  }, []);

  const initPeer = useCallback(async (peerId: string) => {
    try {
      await peerManager.init(peerId);
      setIsInitialized(true);
      setError(null);

      // Handle incoming messages
      peerManager.onMessage((fromPeerId: string, data: MessagePayload) => {
        if (data.type === 'chat-message') {
          const chatId = fromPeerId;
          const msg: ChatMessage = {
            id: data.id,
            chatId,
            from: data.from,
            to: peerId,
            text: data.text,
            timestamp: data.timestamp,
            status: 'delivered',
            image: data.image,
            imageWidth: data.imageWidth,
            imageHeight: data.imageHeight,
          };
          saveMessage(msg);

          saveContact({
            peerId: fromPeerId,
            name: data.fromName || fromPeerId,
            addedAt: Date.now(),
            lastSeen: Date.now(),
          }).then(() => getContacts().then(setContacts));

          peerManager.send(fromPeerId, {
            type: 'delivery-receipt',
            messageId: data.id,
            from: peerId,
          });

          if (activeChatRef.current === chatId) {
            setMessages(prev => [...prev, msg]);
          } else {
            setUnreadCounts(prev => {
              const next = new Map(prev);
              next.set(chatId, (next.get(chatId) || 0) + 1);
              return next;
            });
            notificationManager.notifyMessage(
              data.fromName || fromPeerId,
              data.text || '📷 Фото'
            );
          }
        } else if (data.type === 'status') {
          if (data.status === 'typing') {
            setTypingStatus(prev => new Map(prev).set(fromPeerId, true));
          } else if (data.status === 'stopped-typing') {
            setTypingStatus(prev => new Map(prev).set(fromPeerId, false));
          } else if (data.status === 'online') {
            const contactName = data.fromName || fromPeerId;
            notificationManager.notifyContactOnline(contactName);
          }
          if (data.fromName) {
            saveContact({
              peerId: fromPeerId,
              name: data.fromName,
              addedAt: Date.now(),
              lastSeen: Date.now(),
            }).then(() => getContacts().then(setContacts));
          }
        } else if (data.type === 'delivery-receipt') {
          setMessages(prev =>
            prev.map(m => m.id === data.messageId ? { ...m, status: 'delivered' as const } : m)
          );
        } else if (data.type === 'call-signal') {
          if (data.signal === 'ended' || data.signal === 'rejected') {
            if (data.signal === 'rejected') {
              const callerContact = contactsRef.current.find(c => c.peerId === fromPeerId);
              notificationManager.notifyMissedCall(callerContact?.name || fromPeerId);
            }
            notificationManager.stopRingtone();
            peerManager.endCall();
            stopCallTimer();
            setCallState(initialCallState);
          }
        } else if (data.type === 'group-invite') {
          const newGroup: GroupChat = {
            id: data.groupId,
            name: data.groupName,
            createdAt: Date.now(),
            createdBy: data.from,
            members: data.members,
          };
          saveGroup(newGroup).then(() => {
            setGroups(prev => {
              if (prev.find(g => g.id === newGroup.id)) return prev;
              return [...prev, newGroup];
            });
          });
          notificationManager.notifyMessage(
            `Группа "${data.groupName}"`,
            `${data.fromName} добавил вас в группу`
          );
        } else if (data.type === 'group-message') {
          const msg: ChatMessage = {
            id: data.id,
            chatId: data.groupId,
            from: data.from,
            to: data.groupId,
            text: data.text,
            timestamp: data.timestamp,
            status: 'delivered',
            image: data.image,
            imageWidth: data.imageWidth,
            imageHeight: data.imageHeight,
          };
          saveMessage(msg).then(() => {
            if (activeChatRef.current === data.groupId) {
              setMessages(prev => [...prev, msg]);
            } else {
              setUnreadCounts(prev => {
                const next = new Map(prev);
                next.set(data.groupId, (next.get(data.groupId) || 0) + 1);
                return next;
              });
              notificationManager.notifyMessage(
                data.fromName || data.from,
                data.text || '📷 Фото'
              );
            }
          });
        }
      });

      // Handle peer connection status
      peerManager.onPeerStatus((connPeerId: string, status: string) => {
        setOnlineStatus(prev => {
          const next = new Map(prev);
          next.set(connPeerId, status === 'connected');
          return next;
        });
        if (status === 'connected') {
          getContacts().then(contactsList => {
            const contact = contactsList.find(c => c.peerId === connPeerId);
            if (contact) {
              saveContact({ ...contact, lastSeen: Date.now() });
            }
          });
        }
      });

      // Handle incoming voice calls
      peerManager.onIncomingCall((callerPeerId: string, call: MediaConnection) => {
        const callerContact = contactsRef.current.find(c => c.peerId === callerPeerId);
        const callerName = callerContact?.name || callerPeerId;
        notificationManager.notifyIncomingCall(callerName);
        setCallState({
          active: true,
          peerId: callerPeerId,
          peerName: callerName,
          direction: 'incoming',
          status: 'ringing',
          isMuted: false,
          duration: 0,
          mediaConnection: call,
        });
      });

      // Handle remote audio stream
      peerManager.onCallStream((stream: MediaStream) => {
        notificationManager.stopRingtone();
        playRemoteAudio(stream);
        startCallTimer();
        setCallState(prev => ({ ...prev, status: 'connected' }));
      });

      // Handle call end
      peerManager.onCallEnd(() => {
        notificationManager.stopRingtone();
        stopCallTimer();
        if (audioRef.current) {
          audioRef.current.srcObject = null;
          audioRef.current = null;
        }
        setCallState(initialCallState);
      });

      // Connect to all saved contacts and watch them
      const savedContacts = await getContacts();
      for (const contact of savedContacts) {
        peerManager.watchContact(contact.peerId);
        try {
          await peerManager.connectTo(contact.peerId);
        } catch {
          // Contact is offline — will auto-retry via keepalive
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, [playRemoteAudio, startCallTimer, stopCallTimer]);

  const createProfile = useCallback(async (name: string) => {
    const peerId = 'dc-' + Math.random().toString(36).substr(2, 9);
    const newProfile: UserProfile = {
      peerId,
      name,
      createdAt: Date.now(),
    };
    await saveProfile(newProfile);
    setProfile(newProfile);
    await initPeer(peerId);
  }, [initPeer]);

  const addContact = useCallback(async (peerId: string, name: string) => {
    const contact: Contact = {
      peerId,
      name,
      addedAt: Date.now(),
    };
    await saveContact(contact);
    setContacts(prev => {
      const filtered = prev.filter(c => c.peerId !== peerId);
      return [...filtered, contact];
    });

    // Watch this contact for auto-reconnection
    peerManager.watchContact(peerId);

    try {
      await peerManager.connectTo(peerId);
      peerManager.send(peerId, {
        type: 'status',
        status: 'online',
        from: profile!.peerId,
        fromName: profile!.name,
      });
    } catch {
      // Contact might be offline — will auto-retry
    }
  }, [profile]);

  const sendMessage = useCallback(async (text: string, image?: string, imageWidth?: number, imageHeight?: number) => {
    if (!activeChat || !profile) return;
    if (!text.trim() && !image) return;

    const msgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const msg: ChatMessage = {
      id: msgId,
      chatId: activeChat,
      from: profile.peerId,
      to: activeChat,
      text: text || '',
      timestamp: Date.now(),
      status: 'sent',
      image,
      imageWidth,
      imageHeight,
    };

    await saveMessage(msg);
    setMessages(prev => [...prev, msg]);

    // For group chats, send to all members
    if (activeChatType === 'group') {
      const group = groups.find(g => g.id === activeChat);
      if (group) {
        for (const memberId of group.members) {
          if (memberId !== profile.peerId) {
            peerManager.sendOrQueue(memberId, {
              type: 'group-message',
              id: msgId,
              groupId: group.id,
              from: profile.peerId,
              fromName: profile.name,
              text: text || '',
              timestamp: msg.timestamp,
              image,
              imageWidth,
              imageHeight,
            });
          }
        }
      }
      return;
    }

    // Direct message — use sendOrQueue for reliability
    const payload: MessagePayload = {
      type: 'chat-message',
      id: msgId,
      from: profile.peerId,
      fromName: profile.name,
      text: text || '',
      timestamp: msg.timestamp,
      image,
      imageWidth,
      imageHeight,
    };

    // Try to connect first if not connected
    if (!peerManager.isConnectedTo(activeChat)) {
      try {
        await peerManager.connectTo(activeChat);
      } catch {
        // Offline — sendOrQueue will queue it
      }
    }

    const sent = peerManager.sendOrQueue(activeChat, payload);

    if (sent) {
      const updatedMsg = { ...msg, status: 'sent' as const };
      await saveMessage(updatedMsg);
      setMessages(prev =>
        prev.map(m => m.id === msgId ? updatedMsg : m)
      );
    }
    // If not sent, it's queued and will be delivered when peer comes online
  }, [activeChat, activeChatType, groups, profile]);

  const sendTyping = useCallback((isTyping: boolean) => {
    if (!activeChat || !profile) return;
    peerManager.send(activeChat, {
      type: 'status',
      status: isTyping ? 'typing' : 'stopped-typing',
      from: profile.peerId,
      fromName: profile.name,
    });
  }, [activeChat, profile]);

  const connectToContact = useCallback(async (peerId: string) => {
    peerManager.watchContact(peerId);
    try {
      await peerManager.connectTo(peerId);
      if (profile) {
        peerManager.send(peerId, {
          type: 'status',
          status: 'online',
          from: profile.peerId,
          fromName: profile.name,
        });
      }
    } catch {
      // offline — watched, will auto-retry
    }
  }, [profile]);

  const getLastMessage = useCallback(async (chatId: string): Promise<ChatMessage | null> => {
    const msgs = await getMessagesByChatId(chatId);
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  }, []);

  // ========== CALL FUNCTIONS ==========

  const startCall = useCallback(async (peerId: string) => {
    if (!profile) return;

    const contact = contacts.find(c => c.peerId === peerId);
    const peerName = contact?.name || peerId;

    try {
      setCallState({
        active: true,
        peerId,
        peerName,
        direction: 'outgoing',
        status: 'ringing',
        isMuted: false,
        duration: 0,
        mediaConnection: null,
      });

      const call = await peerManager.startCall(peerId);
      setCallState(prev => ({ ...prev, mediaConnection: call }));
    } catch (err) {
      console.error('Failed to start call:', err);
      setCallState(initialCallState);
      setError('Не удалось начать звонок. Проверьте доступ к микрофону.');
    }
  }, [profile, contacts]);

  const answerCall = useCallback(async () => {
    if (!callState.mediaConnection) return;

    try {
      notificationManager.stopRingtone();
      await peerManager.answerCall(callState.mediaConnection);
      setCallState(prev => ({ ...prev, status: 'connected' }));
    } catch (err) {
      console.error('Failed to answer call:', err);
      setCallState(initialCallState);
      setError('Не удалось ответить на звонок. Проверьте доступ к микрофону.');
    }
  }, [callState.mediaConnection]);

  const rejectCall = useCallback(() => {
    if (callState.mediaConnection) {
      peerManager.rejectCall(callState.mediaConnection);
    }
    notificationManager.stopRingtone();
    stopCallTimer();
    setCallState(initialCallState);
  }, [callState.mediaConnection, stopCallTimer]);

  const endCall = useCallback(() => {
    peerManager.endCall();
    notificationManager.stopRingtone();
    stopCallTimer();
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    setCallState(initialCallState);
  }, [stopCallTimer]);

  const toggleMute = useCallback(() => {
    const muted = peerManager.toggleMute();
    setCallState(prev => ({ ...prev, isMuted: muted }));
  }, []);

  // Delete profile and all data
  const resetProfile = useCallback(async () => {
    peerManager.destroy();
    await deleteProfile();
    setProfile(null);
    setContacts([]);
    setGroups([]);
    setMessages([]);
    setActiveChat(null);
    setActiveChatType('contact');
    setIsInitialized(false);
    setOnlineStatus(new Map());
    setTypingStatus(new Map());
    setUnreadCounts(new Map());
  }, []);

  // Create group chat
  const createGroup = useCallback(async (name: string, memberIds: string[]) => {
    if (!profile) return null;

    const groupId = 'grp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    const group: GroupChat = {
      id: groupId,
      name,
      createdAt: Date.now(),
      createdBy: profile.peerId,
      members: [profile.peerId, ...memberIds],
    };

    await saveGroup(group);
    setGroups(prev => [...prev, group]);

    // Notify all members about the group
    for (const memberId of memberIds) {
      peerManager.sendOrQueue(memberId, {
        type: 'group-invite',
        groupId: group.id,
        groupName: group.name,
        members: group.members,
        from: profile.peerId,
        fromName: profile.name,
      });
    }

    return group;
  }, [profile]);

  // Select chat
  const selectChat = useCallback((chatId: string, type: 'contact' | 'group') => {
    setActiveChat(chatId);
    setActiveChatType(type);
  }, []);

  return {
    profile,
    contacts,
    groups,
    activeChat,
    activeChatType,
    messages,
    onlineStatus,
    typingStatus,
    isInitialized,
    error,
    unreadCounts,
    callState,
    queueSize,
    createProfile,
    addContact,
    setActiveChat,
    selectChat,
    sendMessage,
    sendTyping,
    connectToContact,
    getLastMessage,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    resetProfile,
    createGroup,
  };
}
