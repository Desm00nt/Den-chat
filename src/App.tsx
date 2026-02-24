import { useChat } from './hooks/useChat';
import { WelcomeScreen } from './components/WelcomeScreen';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { CallScreen } from './components/CallScreen';
import { Loader2 } from 'lucide-react';

export function App() {
  const {
    profile,
    contacts,
    groups,
    activeChat,
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
  } = useChat();

  // No profile yet — show welcome
  if (!profile) {
    return <WelcomeScreen onCreateProfile={createProfile} error={error} />;
  }

  // Loading
  if (!isInitialized) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <div className="text-center">
          <p className="text-white font-medium">Подключение...</p>
          <p className="text-slate-500 text-sm mt-1">Устанавливаем P2P соединение</p>
        </div>
        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm max-w-xs text-center">
            {error}
          </div>
        )}
      </div>
    );
  }

  const activeContact = contacts.find(c => c.peerId === activeChat);
  const activeGroup = groups.find(g => g.id === activeChat);

  return (
    <div className="h-[100dvh] flex bg-slate-950 overflow-hidden">
      {/* Call Screen Overlay */}
      <CallScreen
        callState={callState}
        onAnswer={answerCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
      />

      {/* Sidebar / Chat List */}
      <div className={`w-full lg:w-96 lg:border-r lg:border-white/5 flex-shrink-0 ${
        activeChat ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'
      }`}>
        <ChatList
          profile={profile}
          contacts={contacts}
          groups={groups}
          onlineStatus={onlineStatus}
          unreadCounts={unreadCounts}
          onSelectChat={(chatId, type) => {
            selectChat(chatId, type);
            if (type === 'contact') {
              connectToContact(chatId);
            }
          }}
          onAddContact={addContact}
          onCreateGroup={async (name, memberIds) => {
            await createGroup(name, memberIds);
          }}
          onDeleteProfile={resetProfile}
          getLastMessage={getLastMessage}
          activeChat={activeChat}
          queueSize={queueSize}
        />
      </div>

      {/* Chat View */}
      <div className={`flex-1 ${
        activeChat ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
      }`}>
        {activeChat && activeContact ? (
          <ChatView
            profile={profile}
            contact={activeContact}
            messages={messages}
            isOnline={onlineStatus.get(activeChat) || false}
            isTyping={typingStatus.get(activeChat) || false}
            onSendMessage={sendMessage}
            onBack={() => selectChat('', 'contact')}
            onSendTyping={sendTyping}
            onConnect={connectToContact}
            onStartCall={startCall}
          />
        ) : activeChat && activeGroup ? (
          <ChatView
            profile={profile}
            contact={{ peerId: activeGroup.id, name: activeGroup.name, addedAt: activeGroup.createdAt }}
            messages={messages}
            isOnline={true}
            isTyping={false}
            onSendMessage={sendMessage}
            onBack={() => selectChat('', 'contact')}
            onSendTyping={() => {}}
            onConnect={() => {}}
            onStartCall={() => {}}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3 px-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20">
                <svg className="w-10 h-10 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white">Den Chat</h3>
              <p className="text-slate-500 max-w-xs">Выберите чат или добавьте новый контакт</p>
            </div>
          </div>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-2xl bg-red-500/90 text-white text-sm font-medium shadow-2xl shadow-red-500/30 backdrop-blur-lg max-w-sm text-center">
          {error}
        </div>
      )}
    </div>
  );
}
