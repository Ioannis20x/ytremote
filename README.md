# 🎵 YTRemote

**Remote-control YouTube Music from your phone — like Spotify Connect, but for YouTube Music.**

Ever been in a game and can't alt-tab to skip a song? YTRemote lets you control YouTube Music playing in your browser from any device on your network.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox-green.svg)

## How It Works

YTRemote has three components:

1. **Browser Extension** — Injects into YouTube Music and exposes player controls
2. **Relay Server** — A lightweight WebSocket server that connects your devices
3. **Web Remote** — A mobile-friendly PWA to control playback from your phone

```
┌──────────────┐     WebSocket     ┌──────────────┐     WebSocket     ┌──────────────┐
│   📱 Phone   │ ◄──────────────► │  🖥️ Server   │ ◄──────────────► │  🎵 Browser  │
│  (Web PWA)   │    commands &     │   (Relay)     │    commands &     │  (Extension) │
│              │    state sync     │              │    state sync     │              │
└──────────────┘                   └──────────────┘                   └──────────────┘
```

## Quick Start

### 1. Start the Relay Server

```bash
cd server
npm install
cp .env.example .env  # Pairing-Code anpassen
npm start
```

### 2. Install the Browser Extension

- Open `chrome://extensions` (or `about:debugging` in Firefox)
- Enable Developer Mode
- "Load unpacked" → select the `extension/` folder
- Click the YTRemote icon and enter your server URL + pairing code

### 3. Open the Web Remote on Your Phone

Navigate to your server URL (e.g. `https://ytremote.example.com`) on your phone and enter the same pairing code.

**Done!** Your phone now controls YouTube Music on your PC.

## Self-Hosting

The relay server is designed to be self-hosted. A simple `docker-compose.yml` is included:

```bash
docker-compose up -d
```

Put it behind Caddy/nginx with HTTPS for secure WebSocket connections (wss://).

## Features

- advancement Play / Pause / Skip / Previous
- 🔀 Shuffle & Repeat toggle
- 🔊 Volume control
- 📋 Queue view
- 🔍 Search & play songs
- 📱 Works on any device with a browser
- 🔒 Pairing-code authentication
- 🐳 Docker-ready, self-hostable

## Tech Stack

- **Extension**: Manifest V3, vanilla JS
- **Server**: Node.js, `ws` (WebSocket library)
- **Web Remote**: Vue 3, Vite, PWA

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Support the Project

If you find YTRemote useful, consider:

- ⭐ Starring the repo
- 🐛 Reporting bugs
- 💡 Suggesting features
- ☕ [Buy me a coffee](https://ko-fi.com/ioannisdev)

## License

MIT — see [LICENSE](LICENSE) for details.

---

Made with ❤️ by [ioannisdev](https://github.com/ioannisdev)
