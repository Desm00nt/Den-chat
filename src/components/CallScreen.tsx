import { Phone, PhoneOff, Mic, MicOff, PhoneIncoming } from 'lucide-react';
import type { CallState } from '../hooks/useChat';

interface CallScreenProps {
  callState: CallState;
  onAnswer: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
}

export function CallScreen({ callState, onAnswer, onReject, onEnd, onToggleMute }: CallScreenProps) {
  if (!callState.active) return null;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isRinging = callState.status === 'ringing';
  const isConnected = callState.status === 'connected';
  const isIncoming = callState.direction === 'incoming';

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col items-center justify-between p-8">
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-indigo-500/10 ${isRinging ? 'animate-ping' : ''}`} style={{ animationDuration: '2s' }} />
        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-violet-500/5 ${isRinging ? 'animate-ping' : ''}`} style={{ animationDuration: '3s' }} />
      </div>

      {/* Top section */}
      <div className="relative z-10 mt-12">
        <p className="text-indigo-300 text-sm font-medium text-center uppercase tracking-widest">
          {isIncoming && isRinging && 'Входящий звонок'}
          {!isIncoming && isRinging && 'Вызов...'}
          {isConnected && 'Голосовой звонок'}
        </p>
      </div>

      {/* Center — Avatar & Info */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Avatar with ring animation */}
        <div className="relative">
          {isRinging && (
            <>
              <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="absolute -inset-3 rounded-full bg-indigo-500/10 animate-ping" style={{ animationDuration: '2s' }} />
            </>
          )}
          <div className={`relative w-28 h-28 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-4xl font-bold shadow-2xl ${isConnected ? 'ring-4 ring-emerald-400/50' : 'ring-4 ring-indigo-400/30'}`}>
            {callState.peerName[0]?.toUpperCase() || '?'}
          </div>
          {isConnected && (
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <Phone className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        {/* Name */}
        <div className="text-center">
          <h2 className="text-white text-3xl font-bold">{callState.peerName}</h2>
          <p className="text-indigo-300 text-lg mt-2">
            {isRinging && isIncoming && '📞 Хочет поговорить...'}
            {isRinging && !isIncoming && 'Ожидание ответа...'}
            {isConnected && formatDuration(callState.duration)}
          </p>
        </div>

        {/* Sound wave animation when connected */}
        {isConnected && (
          <div className="flex items-center gap-1 h-8">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full ${callState.isMuted ? 'bg-slate-600' : 'bg-indigo-400'}`}
                style={{
                  animation: callState.isMuted ? 'none' : `soundwave 0.8s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
                  height: callState.isMuted ? '8px' : undefined,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom — Controls */}
      <div className="relative z-10 mb-12">
        {isIncoming && isRinging ? (
          /* Incoming call: Accept / Reject */
          <div className="flex items-center gap-16">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onReject}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95"
              >
                <PhoneOff className="w-7 h-7 text-white" />
              </button>
              <span className="text-red-300 text-xs font-medium">Отклонить</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onAnswer}
                className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 transition-all flex items-center justify-center shadow-lg shadow-emerald-500/30 active:scale-95 animate-pulse"
              >
                <PhoneIncoming className="w-7 h-7 text-white" />
              </button>
              <span className="text-emerald-300 text-xs font-medium">Ответить</span>
            </div>
          </div>
        ) : isConnected ? (
          /* Connected: Mute / End */
          <div className="flex items-center gap-12">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onToggleMute}
                className={`w-14 h-14 rounded-full transition-all flex items-center justify-center active:scale-95 ${
                  callState.isMuted
                    ? 'bg-white/20 ring-2 ring-white/30'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {callState.isMuted ? (
                  <MicOff className="w-6 h-6 text-red-400" />
                ) : (
                  <Mic className="w-6 h-6 text-white" />
                )}
              </button>
              <span className={`text-xs font-medium ${callState.isMuted ? 'text-red-300' : 'text-slate-400'}`}>
                {callState.isMuted ? 'Выкл.' : 'Микрофон'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={onEnd}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95"
              >
                <PhoneOff className="w-7 h-7 text-white" />
              </button>
              <span className="text-red-300 text-xs font-medium">Завершить</span>
            </div>

            {/* Placeholder for symmetry */}
            <div className="w-14" />
          </div>
        ) : (
          /* Outgoing, ringing: Cancel */
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={onEnd}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-all flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-95"
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </button>
            <span className="text-red-300 text-xs font-medium">Отменить</span>
          </div>
        )}
      </div>

      {/* CSS for sound wave animation */}
      <style>{`
        @keyframes soundwave {
          0%, 100% { height: 8px; }
          50% { height: 28px; }
        }
      `}</style>
    </div>
  );
}
