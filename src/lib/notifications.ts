// Notification manager — works in browser and Capacitor (native APK)

type NotificationType = 'message' | 'call' | 'missed-call' | 'contact-online';

interface NotificationOptions {
  type: NotificationType;
  title: string;
  body: string;
  tag?: string;
  data?: Record<string, string>;
}

class NotificationManager {
  private permission: NotificationPermission = 'default';
  private vibrationEnabled = true;
  private soundEnabled = true;
  private ringtoneAudio: HTMLAudioElement | null = null;
  private notifAudio: HTMLAudioElement | null = null;

  async init() {
    // Request notification permission
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        this.permission = 'granted';
      } else if (Notification.permission !== 'denied') {
        const result = await Notification.requestPermission();
        this.permission = result;
      } else {
        this.permission = 'denied';
      }
    }

    // Pre-create audio elements for notification sounds
    this.createAudioElements();
  }

  private createAudioElements() {
    // Create a notification sound using AudioContext
    try {
      this.notifAudio = this.createBeepAudio(800, 0.15);
      this.ringtoneAudio = this.createRingtoneAudio();
    } catch {
      // Audio not supported
    }
  }

  private createBeepAudio(frequency: number, duration: number): HTMLAudioElement {
    const audioCtx = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)();
    const sampleRate = audioCtx.sampleRate;
    const numSamples = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.min(1, (numSamples - i) / (sampleRate * 0.05));
      data[i] = Math.sin(2 * Math.PI * frequency * t) * 0.3 * envelope;
    }

    // Convert to WAV blob
    const wav = this.bufferToWav(buffer);
    const url = URL.createObjectURL(wav);
    const audio = new Audio(url);
    audio.volume = 0.5;
    return audio;
  }

  private createRingtoneAudio(): HTMLAudioElement {
    const audioCtx = new (window.AudioContext || (window as unknown as Record<string, typeof AudioContext>).webkitAudioContext)();
    const sampleRate = audioCtx.sampleRate;
    const duration = 2;
    const numSamples = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // Ring pattern: 0.5s on, 0.5s off, repeat
      const ringPhase = t % 1.0;
      const isOn = ringPhase < 0.5;
      if (isOn) {
        // Dual tone ring
        const tone1 = Math.sin(2 * Math.PI * 440 * t);
        const tone2 = Math.sin(2 * Math.PI * 480 * t);
        data[i] = (tone1 + tone2) * 0.15;
      } else {
        data[i] = 0;
      }
    }

    const wav = this.bufferToWav(buffer);
    const url = URL.createObjectURL(wav);
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.loop = true;
    return audio;
  }

  private bufferToWav(buffer: AudioBuffer): Blob {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const numSamples = buffer.length;
    const byteRate = sampleRate * numChannels * (bitDepth / 8);
    const blockAlign = numChannels * (bitDepth / 8);
    const dataSize = numSamples * numChannels * (bitDepth / 8);
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write samples
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  // Show notification
  async notify(options: NotificationOptions) {
    const { type, title, body, tag } = options;

    // Play sound
    if (this.soundEnabled) {
      this.playSound(type);
    }

    // Vibrate
    if (this.vibrationEnabled && 'vibrate' in navigator) {
      switch (type) {
        case 'message':
          navigator.vibrate([100, 50, 100]);
          break;
        case 'call':
          navigator.vibrate([300, 200, 300, 200, 300]);
          break;
        case 'missed-call':
          navigator.vibrate([200, 100, 200]);
          break;
        case 'contact-online':
          navigator.vibrate(100);
          break;
      }
    }

    // Show browser/system notification
    if (this.permission === 'granted' && document.hidden) {
      try {
        const iconEmoji = type === 'call' ? '📞' : type === 'message' ? '💬' : type === 'missed-call' ? '📵' : '🟢';
        const notif = new Notification(`${iconEmoji} ${title}`, {
          body,
          tag: tag || `denchat-${type}-${Date.now()}`,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          silent: true, // We handle sound ourselves
          requireInteraction: type === 'call',
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };

        // Auto-close message notifications after 5 seconds
        if (type === 'message') {
          setTimeout(() => notif.close(), 5000);
        }
      } catch {
        // Notification API not available
      }
    }
  }

  private playSound(type: NotificationType) {
    try {
      if (type === 'message' || type === 'contact-online' || type === 'missed-call') {
        if (this.notifAudio) {
          this.notifAudio.currentTime = 0;
          this.notifAudio.play().catch(() => {});
        }
      }
    } catch {
      // Audio play failed
    }
  }

  // Start ringtone for incoming call
  startRingtone() {
    if (this.soundEnabled && this.ringtoneAudio) {
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.play().catch(() => {});
    }
    // Continuous vibration pattern for call
    if (this.vibrationEnabled && 'vibrate' in navigator) {
      this.startCallVibration();
    }
  }

  // Stop ringtone
  stopRingtone() {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
    }
    if ('vibrate' in navigator) {
      navigator.vibrate(0);
    }
    this.stopCallVibration();
  }

  private callVibrationInterval: ReturnType<typeof setInterval> | null = null;

  private startCallVibration() {
    this.stopCallVibration();
    this.callVibrationInterval = setInterval(() => {
      if ('vibrate' in navigator) {
        navigator.vibrate([300, 200, 300, 200, 300]);
      }
    }, 2000);
  }

  private stopCallVibration() {
    if (this.callVibrationInterval) {
      clearInterval(this.callVibrationInterval);
      this.callVibrationInterval = null;
    }
  }

  // Notify: new message
  notifyMessage(senderName: string, text: string) {
    const truncated = text.length > 50 ? text.substring(0, 50) + '...' : text;
    this.notify({
      type: 'message',
      title: senderName,
      body: truncated,
      tag: `msg-${senderName}`,
    });
  }

  // Notify: incoming call
  notifyIncomingCall(callerName: string) {
    this.startRingtone();
    this.notify({
      type: 'call',
      title: 'Входящий звонок',
      body: `${callerName} вызывает вас...`,
      tag: 'incoming-call',
    });
  }

  // Notify: missed call
  notifyMissedCall(callerName: string) {
    this.stopRingtone();
    this.notify({
      type: 'missed-call',
      title: 'Пропущенный звонок',
      body: callerName,
      tag: `missed-${callerName}`,
    });
  }

  // Notify: contact came online
  notifyContactOnline(contactName: string) {
    this.notify({
      type: 'contact-online',
      title: 'Контакт в сети',
      body: `${contactName} теперь онлайн`,
      tag: `online-${contactName}`,
    });
  }

  // Settings
  setVibration(enabled: boolean) {
    this.vibrationEnabled = enabled;
  }

  setSound(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  getPermission() {
    return this.permission;
  }
}

export const notificationManager = new NotificationManager();
