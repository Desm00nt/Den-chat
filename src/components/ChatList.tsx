import { useState, useEffect } from 'react';
import { MessageCircle, Plus, Copy, Check, Search, Settings, User, Wifi, Trash2, Users, LogOut } from 'lucide-react';
import type { Contact, UserProfile, ChatMessage, GroupChat } from '../lib/db';

interface ChatListProps {
  profile: UserProfile;
  contacts: Contact[];
  groups: GroupChat[];
  onlineStatus: Map<string, boolean>;
  unreadCounts: Map<string, number>;
  onSelectChat: (peerId: string, type: 'contact' | 'group') => void;
  onAddContact: (peerId: string, name: string) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
  onDeleteProfile: () => void;
  getLastMessage: (chatId: string) => Promise<ChatMessage | null>;
  activeChat: string | null;
  queueSize: number;
}

export function ChatList({
  profile,
  contacts,
  groups,
  onlineStatus,
  unreadCounts,
  onSelectChat,
  onAddContact,
  onCreateGroup,
  onDeleteProfile,
  getLastMessage,
  activeChat,
  queueSize,
}: ChatListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newPeerId, setNewPeerId] = useState('');
  const [newName, setNewName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
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
      for (const group of groups) {
        const msg = await getLastMessage(group.id);
        if (msg) msgs.set(group.id, msg);
      }
      setLastMessages(msgs);
    };
    loadLastMessages();
  }, [contacts, groups, getLastMessage, activeChat]);

  const copyId = () => {
    navigator.clipboard.writeText(profile.peerId).catch(() => {
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

  const handleCreateGroup = () => {
    if (groupName.trim() && selectedMembers.size > 0) {
      onCreateGroup(groupName.trim(), Array.from(selectedMembers));
      setGroupName('');
      setSelectedMembers(new Set());
      setShowGroupModal(false);
    }
  };

  const toggleMember = (peerId: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(peerId)) next.delete(peerId);
      else next.add(peerId);
      return next;
    });
  };

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.peerId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    const lastA = lastMessages.get(a.peerId)?.timestamp || a.addedAt;
    const lastB = lastMessages.get(b.peerId)?.timestamp || b.addedAt;
    return lastB - lastA;
  });

  const sortedGroups = [...filteredGroups].sort((a, b) => {
    const lastA = lastMessages.get(a.id)?.timestamp || a.createdAt;
    const lastB = lastMessages.get(b.id)?.timestamp || b.createdAt;
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
      {/* Header */}
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
              onClick={() => setShowGroupModal(true)}
              className="p-2.5 rounded-xl bg-white/10 text-slate-300 hover:bg-white/20 transition-colors"
              title="Создать группу"
            >
              <Users className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Queue indicator */}
        {queueSize > 0 && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 text-xs">
              {queueSize} сообщ. ожидают доставки
            </span>
          </div>
        )}

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

      {/* Contact & Group List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {sortedContacts.length === 0 && sortedGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center px-6">
            <div className="p-4 rounded-full bg-white/5 mb-4">
              <MessageCircle className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 font-medium mb-1">Нет контактов</p>
            <p className="text-slate-600 text-sm">Нажмите + чтобы добавить контакт</p>
          </div>
        ) : (
          <>
            {/* Groups */}
            {sortedGroups.map((group) => {
              const lastMsg = lastMessages.get(group.id);
              const unread = unreadCounts.get(group.id) || 0;

              return (
                <button
                  key={group.id}
                  onClick={() => onSelectChat(group.id, 'group')}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1 ${
                    activeChat === group.id
                      ? 'bg-indigo-600/20 border border-indigo-500/30'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white flex-shrink-0">
                    <Users className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-white font-semibold text-sm truncate">{group.name}</span>
                      {lastMsg && (
                        <span className="text-slate-500 text-xs flex-shrink-0 ml-2">
                          {formatTime(lastMsg.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-slate-500 text-sm truncate">
                        {lastMsg ? truncate(lastMsg.text || '📷 Фото', 30) : `${group.members.length} участников`}
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
            })}

            {/* Contacts */}
            {sortedContacts.map((contact) => {
              const isOnline = onlineStatus.get(contact.peerId) || false;
              const lastMsg = lastMessages.get(contact.peerId);
              const unread = unreadCounts.get(contact.peerId) || 0;

              return (
                <button
                  key={contact.peerId}
                  onClick={() => onSelectChat(contact.peerId, 'contact')}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all mb-1 ${
                    activeChat === contact.peerId
                      ? 'bg-indigo-600/20 border border-indigo-500/30'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                      {contact.name[0].toUpperCase()}
                    </div>
                    {isOnline && (
                      <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
                    )}
                  </div>
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
                        {lastMsg 
                          ? lastMsg.image && !lastMsg.text 
                            ? '📷 Фото' 
                            : truncate(lastMsg.text, 30) 
                          : 'Нет сообщений'}
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
            })}
          </>
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
                  placeholder="dc-xxxxxxxxx"
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddContact(); }}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowAddModal(false); setNewPeerId(''); setNewName(''); }}
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

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-3xl p-6 space-y-5 border border-white/10 max-h-[80vh] overflow-auto">
            <div className="text-center">
              <h3 className="text-xl font-bold text-white">Создать группу</h3>
              <p className="text-slate-400 text-sm mt-1">Выберите участников</p>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Название группы</label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Название..."
                  className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Участники ({selectedMembers.size} выбрано)
                </label>
                {contacts.length === 0 ? (
                  <p className="text-slate-500 text-sm py-3">Сначала добавьте контакты</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {contacts.map(c => (
                      <button
                        key={c.peerId}
                        onClick={() => toggleMember(c.peerId)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                          selectedMembers.has(c.peerId)
                            ? 'bg-indigo-600/20 border border-indigo-500/30'
                            : 'bg-white/5 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                          {c.name[0].toUpperCase()}
                        </div>
                        <span className="text-white text-sm flex-1 text-left">{c.name}</span>
                        {selectedMembers.has(c.peerId) && (
                          <Check className="w-4 h-4 text-indigo-400" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowGroupModal(false); setGroupName(''); setSelectedMembers(new Set()); }}
                className="flex-1 py-3 rounded-xl bg-white/10 text-slate-300 font-medium hover:bg-white/20 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || selectedMembers.size === 0}
                className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                Создать
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
              <span className="text-emerald-300 text-sm">Онлайн — {contacts.filter(c => onlineStatus.get(c.peerId)).length} подключено</span>
            </div>

            {/* Delete profile button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-medium hover:bg-red-500/20 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Удалить профиль
            </button>

            <button
              onClick={() => setShowProfile(false)}
              className="w-full py-3 rounded-xl bg-white/10 text-slate-300 font-medium hover:bg-white/20 transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 rounded-3xl p-6 space-y-5 border border-red-500/20">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20">
                <Trash2 className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Удалить профиль?</h3>
              <p className="text-slate-400 text-sm">
                Все данные будут удалены: профиль, контакты, сообщения и группы. Это действие нельзя отменить.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-white/10 text-slate-300 font-medium hover:bg-white/20 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setShowProfile(false);
                  onDeleteProfile();
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium hover:bg-red-500 transition-colors"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar with ID */}
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
