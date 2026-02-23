# 💬 Den Chat — P2P Мессенджер без серверов

Полностью децентрализованный мессенджер с голосовыми звонками. Все данные хранятся только на устройствах пользователей.

## ✨ Возможности

- 💬 **Обмен сообщениями** — P2P через WebRTC
- 📞 **Голосовые звонки** — с мьютом и сбросом
- 🔔 **Push-уведомления** — о сообщениях, звонках, пропущенных вызовах
- 📳 **Вибрация** — разные паттерны для разных событий
- 🔊 **Звуковые уведомления** — рингтон для звонков, звук для сообщений
- 🌐 **13+ STUN/TURN серверов** — стабильная связь из любой точки мира
- 💾 **Локальное хранение** — IndexedDB, всё на устройстве
- 📱 **Адаптивный дизайн** — мобильный + десктоп

---

## 🚀 Способ 1: Сборка APK через GitHub Actions (самый простой)

### Шаг 1: Создайте репозиторий на GitHub
1. Зайдите на [github.com](https://github.com) и создайте аккаунт (если нет)
2. Нажмите **"New repository"**
3. Назовите его `den-chat`
4. Нажмите **"Create repository"**

### Шаг 2: Загрузите код
**Вариант А — через GitHub Web:**
1. На странице репозитория нажмите **"Upload files"**
2. Перетащите ВСЕ файлы проекта
3. Нажмите **"Commit changes"**

**Вариант Б — через командную строку:**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/den-chat.git
git push -u origin main
```

### Шаг 3: Дождитесь сборки
1. Перейдите во вкладку **"Actions"** в репозитории
2. Вы увидите workflow **"Build Den Chat APK"** в процессе
3. Подождите ~5-10 минут пока соберётся

### Шаг 4: Скачайте APK
1. После успешной сборки (зелёная галочка ✅) нажмите на workflow
2. Внизу страницы найдите **"Artifacts"**
3. Скачайте **"DenChat-debug"**
4. Разархивируйте и установите APK на телефон

> ⚠️ На телефоне нужно разрешить установку из неизвестных источников

---

## 🔧 Способ 2: Сборка APK на компьютере БЕЗ Android Studio (только SDK + командная строка)

### Что нужно установить:

#### 1. Node.js
Скачайте и установите с [nodejs.org](https://nodejs.org) (версия 18+)

#### 2. Java JDK 17
```bash
# Windows (через winget):
winget install Microsoft.OpenJDK.17

# macOS (через Homebrew):
brew install openjdk@17

# Linux (Ubuntu/Debian):
sudo apt install openjdk-17-jdk
```

#### 3. Android SDK (БЕЗ Android Studio)

**Windows:**
```bash
# Создайте папку для SDK
mkdir C:\android-sdk
cd C:\android-sdk

# Скачайте Command Line Tools с:
# https://developer.android.com/studio#command-line-tools-only
# Распакуйте в C:\android-sdk\cmdline-tools\latest\

# Установите переменные среды (в PowerShell от Администратора):
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "C:\android-sdk", "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", "C:\android-sdk", "User")
$env:Path += ";C:\android-sdk\cmdline-tools\latest\bin;C:\android-sdk\platform-tools"

# Установите нужные компоненты:
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"

# Примите лицензии:
sdkmanager --licenses
```

**macOS / Linux:**
```bash
# Создайте папку для SDK
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk

# Скачайте Command Line Tools с:
# https://developer.android.com/studio#command-line-tools-only
# Распакуйте в ~/android-sdk/cmdline-tools/latest/

# Добавьте в ~/.bashrc или ~/.zshrc:
export ANDROID_HOME=~/android-sdk
export ANDROID_SDK_ROOT=~/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# Перезагрузите терминал, затем:
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"

# Примите лицензии:
sdkmanager --licenses
```

### Сборка APK:

```bash
# 1. Перейдите в папку проекта
cd den-chat

# 2. Установите зависимости
npm install

# 3. Соберите веб-приложение
npm run build

# 4. Установите Capacitor
npm install @capacitor/core @capacitor/cli
npm install @capacitor/android
npm install @capacitor/local-notifications @capacitor/haptics

# 5. Инициализируйте Capacitor (если первый раз)
npx cap init "Den Chat" com.denchat.app --web-dir dist

# 6. Добавьте Android платформу
npx cap add android

# 7. Синхронизируйте
npx cap sync android

# 8. Соберите APK из командной строки!
cd android
./gradlew assembleDebug       # Linux/macOS
gradlew.bat assembleDebug     # Windows

# 9. APK будет здесь:
# android/app/build/outputs/apk/debug/app-debug.apk
```

### Последующие сборки (после изменений кода):
```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

---

## 📱 Установка APK на телефон

1. Перекиньте `app-debug.apk` на телефон (USB, Telegram, облако, etc.)
2. На телефоне: **Настройки → Безопасность → Разрешить установку из неизвестных источников**
3. Откройте файл APK → Установить
4. Готово! 🎉

---

## 🎯 Как пользоваться

1. Откройте **Den Chat** на двух телефонах
2. Создайте профили на каждом
3. Скопируйте **Peer ID** с одного телефона
4. На другом телефоне нажмите **"+"** → вставьте ID → добавьте контакт
5. Оба увидят друг друга → можно переписываться и звонить!

---

## 🔧 Локальная разработка (для программистов)

```bash
npm install
npm run dev
```

Откроется на `http://localhost:5173`

---

## 📁 Структура проекта

```
├── src/
│   ├── App.tsx              # Главный компонент
│   ├── lib/
│   │   ├── peer.ts          # P2P менеджер (WebRTC/PeerJS)
│   │   ├── db.ts            # IndexedDB хранилище
│   │   └── notifications.ts # Система уведомлений
│   ├── hooks/
│   │   └── useChat.ts       # Основной хук мессенджера
│   └── components/
│       ├── WelcomeScreen.tsx # Экран регистрации
│       ├── ChatList.tsx      # Список чатов
│       ├── ChatView.tsx      # Окно чата
│       └── CallScreen.tsx    # Экран звонка
├── capacitor.config.json    # Конфиг Capacitor (для APK)
└── .github/workflows/
    └── build-apk.yml        # GitHub Actions для автосборки APK
```

## 📄 Лицензия

MIT — используйте свободно!
