import { useState, useEffect } from 'react';
import { Shield, Wifi, Database, ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
  onCreateProfile: (name: string) => void;
  error: string | null;
}

export function WelcomeScreen({ onCreateProfile, error }: WelcomeScreenProps) {
  const [name, setName] = useState('');
  const [step, setStep] = useState<'intro' | 'setup'>('intro');
  const [isReady, setIsReady] = useState(false);

  // Даём компоненту время отрендериться
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (step === 'intro') {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 overflow-auto">
        <div className="max-w-sm w-full space-y-6 py-8">
          {/* Logo */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl shadow-indigo-500/30">
              <Shield className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white tracking-tight">Den Chat</h1>
            <p className="text-slate-400 text-lg">Мессенджер без серверов</p>
          </div>

          {/* Features */}
          <div className="space-y-3">
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="p-2 rounded-xl bg-emerald-500/20 flex-shrink-0">
                <Wifi className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold">P2P соединение</h3>
                <p className="text-slate-400 text-sm">Прямая связь между устройствами через WebRTC</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="p-2 rounded-xl bg-blue-500/20 flex-shrink-0">
                <Database className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold">Локальное хранение</h3>
                <p className="text-slate-400 text-sm">Все данные хранятся только на вашем устройстве</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="p-2 rounded-xl bg-purple-500/20 flex-shrink-0">
                <Shield className="w-5 h-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold">Приватность</h3>
                <p className="text-slate-400 text-sm">Никаких серверов — никакой слежки</p>
              </div>
            </div>
          </div>

          {/* Кнопка всегда видна */}
          <button
            onClick={() => setStep('setup')}
            disabled={!isReady}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            Начать
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-6 overflow-auto">
      <div className="max-w-sm w-full space-y-6 py-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white">Создайте профиль</h2>
          <p className="text-slate-400">Выберите имя для отображения в чатах</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Ваше имя</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите имя..."
              className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-lg"
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) {
                  onCreateProfile(name.trim());
                }
              }}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={() => name.trim() && onCreateProfile(name.trim())}
            disabled={!name.trim()}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Создать профиль
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
