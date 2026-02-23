import { useState, useEffect } from 'react';
import { MessageCircle, Plus, Copy, Check, Search, Settings, User, Wifi } from 'lucide-react';
import type { Contact, UserProfile, ChatMessage } from '../lib/db';

interface ChatListProps {
  profile: UserProfile;
  contacts: Contact[];
  onlineStatus: Map<string, boolean>;
  unreadCounts: Map<string, number>;
  onSelectChat: (peerId: string) => void;
  onAddContact: (peerId: string, name: string) => void;
  getLastMessage: (chatId: string) => Promise<ChatMessage | null>;
  activeChat: string | null;
}

export function ChatList({
  profile,
  contacts,
  onlineStatus,
  unreadCounts,
  onSelectChat,
  onAddContact,
  getLastMessage,
  activeChat,
}: ChatListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [newPeerId, setNewPeerId] = useState('');
  const [newName, setNewName] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [lastMessages, setLastMessages] = useState<Map<string, ChatMessage>>(new Map());

  useEffect(() => {
    const loadLastMessages = async () => {
      const msgs = new Map<string, ChatMessage>();
      for (const contact of contacts) {
        const msg = await getLastMessage(contact.peerId);
        if (msg) msgs.set(contact.peerId, msg);
      }
      setLastMessages(msgs);
    };
    loadLastMessages();
  }, [contacts, getLastMessage, activeChat]);

  const copyId = () => {
    navigator.clipboard.writeText(profile.peerId).catch(() => {
      // Fallback for mobile
      const el = document.createElement('textarea');
      el.value = profile.peerId;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddContact = () => {
    if (newPeerId.trim() && newName.trim()) {
      onAddContact(newPeerId.trim(), newName.trim());
      setNewPeerId('');
      setNewName('');
      setShowAddModal(false);
    }
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.peerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    const lastA = lastMessages.get(a.peerId)?.timestamp || a.addedAt;
    const lastB = lastMessages.get(b.peerId)?.timestamp || b.addedAt;
    return lastB - lastA;
  });

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.substring(0, max) + '...' : text;

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Header - с safe area */}
      <div className="p-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Чаты</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowProfile(true)}
              className="p-2.5 rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 transition-colors"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
          />
        </div>
      </div>

      {/* Contact List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {sortedContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <div className="p-4 rounded-full bg-white/5 mb-4">
              <MessageCircle className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium mb-1">Нет контактов</p>
            <p className="text-slate-600 text-sm">Нажмите + чтобы добавить контакт и начать общение</p>
          </div>
        ) : (
          sortedContacts.map((contact) => {
            const isOnline = onlineStatus.get(contact.peerId) || false;
            const lastMsg = lastMessages.get(contact.peerId);
            const unread = unreadCounts.get(contact.peerId) || 0;

            return (
              <button
                key={contact.peerId}
                onClick={() => onSelectChat(contact.peerId)}
                className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1 ${
                  activeChat === contact.peerId
                    ? 'bg-indigo-600/20 border border-indigo-500/30'
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                    {contact.name[0].toUpperCase()}
                  </div>
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-semibold text-sm truncate">{contact.name}</span>
                    {lastMsg && (
                      <span className="text-slate-500 text-xs flex-shrink-0 ml-2">
                        {formatTime(lastMsg.timestamp)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-slate-500 text-sm truncate">
                      {lastMsg ? truncate(lastMsg.text, 30) : 'Нет сообщений'}
                    </span>
                    {unread > 0 && (
                      <span className="flex-shrink-0 ml-2 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-bold min-w-[20px] text-center">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-3xl p-6 space-y-5 border border-white/10">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white">Добавить контакт</h3>
              <p className="text-slate-400 text-sm mt-1">Введите ID собеседника</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Имя контакта</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Имя..."
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Peer ID</label>
                <input
                  type="text"
                  value={newPeerId}
                  onChange={(e) => setNewPeerId(e.target.value)}
                  placeholder="sc-xxxxxxxxx"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddContact();
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewPeerId('');
                  setNewName('');
                }}
                className="flex-1 py-3 rounded-xl bg-white/10 text-slate-300 font-medium hover:bg-white/20 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleAddContact}
                disabled={!newPeerId.trim() || !newName.trim()}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-3xl p-6 space-y-5 border border-white/10">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-3xl font-bold">
                {profile.name[0].toUpperCase()}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{profile.name}</h3>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-slate-500 text-sm">Ваш профиль</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ваш ID (поделитесь с друзьями)</label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-indigo-300 font-mono text-sm truncate">
                  {profile.peerId}
                </div>
                <button
                  onClick={copyId}
                  className="px-4 py-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors flex-shrink-0"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
              {copied && (
                <p className="text-emerald-400 text-xs text-center">Скопировано!</p>
              )}
            </div>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 text-sm">Онлайн — {contacts.filter(c => onlineStatus.get(c.peerId)).length} контактов подключено</span>
            </div>

            <button
              onClick={() => setShowProfile(false)}
              className="w-full py-3 rounded-xl bg-white/10 text-slate-300 font-medium hover:bg-white/20 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar with ID - с safe area */}
      <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/5">
        <button
          onClick={copyId}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl hover:bg-white/5 transition-colors"
        >
          <span className="text-slate-600 text-xs font-mono truncate">{profile.peerId}</span>
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
          )}
        </button>
      </div>
    </div>
  );
}
