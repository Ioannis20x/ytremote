<div align="center">

<img src="extension/icons/icon-128.png" width="80" alt="YTRemote Logo" />

# YTRemote

**Control YouTube Music from your phone — just like Spotify Connect.**

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Browser-Chrome%20%7C%20Firefox-teal.svg)](extension/)
[![Self-Hosted](https://img.shields.io/badge/Self--Hosted-Docker-teal.svg)](docker-compose.yml)

[**Get Started**](#quick-start) · [**How it Works**](#how-it-works) · [**Self-Hosting**](#self-hosting) · [**Contributing**](#contributing)

</div>

---

## The Problem

You're in a game. A song comes on that you hate. You can't alt-tab. You're stuck.

Spotify has a solution — Spotify Connect lets you control playback from your phone. YouTube Music doesn't.

**YTRemote fixes that.**

## Features

- ▶ **Play / Pause / Skip / Previous** from your phone
- 🔀 **Shuffle & Repeat** with live status indicators
- 🔊 **Volume control** via the phone
- ⏩ **Seek** by tapping the progress bar
- 🔍 **Search** YouTube Music — songs or videos — and play on PC
- 📚 **Browse your library** — Mixes, Recommendations, Playlists
- 📱 **PWA** — install on your home screen, no app store needed
- 🔒 **Pairing code** authentication
- 🔄 **Auto-reconnect** on browser start
- 🐳 **Self-hostable** with Docker

## How it Works

Three components communicate in real time:

```
┌─────────────────┐        ┌──────────────┐        ┌──────────────────────┐
│   📱  Phone     │        │  🖥️  Server  │        │   🎵  PC Browser     │
│   (PWA)         │◄──────►│  (WebSocket  │◄──────►│   (Chrome Extension) │
│                 │        │   Relay)     │        │                      │
│  Search, Skip,  │        │              │        │  Controls YouTube    │
│  Volume, Browse │        │  Routes msgs │        │  Music directly      │
└─────────────────┘        └──────────────┘        └──────────────────────┘
```

1. **Browser Extension** — injects into `music.youtube.com`, reads player state, executes controls
2. **Relay Server** — lightweight Node.js WebSocket server, routes messages between devices
3. **Web Remote (PWA)** — mobile-optimized interface, installable on your home screen

## Quick Start

### 1. Deploy the Server

```bash
git clone https://github.com/ioannisdev/ytremote.git
cd ytremote

# Configure your pairing code
echo "PAIRING_CODE=your-secret-code" > .env

# Start
docker compose up -d
```

Put it behind a reverse proxy with HTTPS (Caddy, nginx) for secure WebSocket connections (`wss://`).

**Caddy example:**
```
ytremote.yourdomain.com {
    reverse_proxy localhost:3456
}
```

### 2. Install the Browser Extension

**Chrome / Edge:**
1. Open `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **Load unpacked** → select the `extension/` folder
4. Click the YTRemote icon and enter your server URL + pairing code

**Firefox:**
1. Open `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on**
3. Select `extension/manifest.json`

### 3. Open the Web Remote

Navigate to your server URL on your phone (e.g. `https://ytremote.yourdomain.com`).

Enter:
- **Server URL:** `wss://ytremote.yourdomain.com`
- **Pairing Code:** the one from your `.env`

Install it to your home screen for the full app experience.

### 4. Open YouTube Music

Go to `music.youtube.com` in the same browser. That's it — your phone now controls it.

## Self-Hosting

The server is designed to be self-hosted. A `docker-compose.yml` is included.

```yaml
services:
  ytremote:
    build: .
    restart: unless-stopped
    ports:
      - "3456:3456"
    environment:
      - PAIRING_CODE=your-secret-code
```

The Docker build compiles the PWA frontend and bundles it with the server — one container, one port.

## Project Structure

```
ytremote/
├── extension/               # Chrome/Firefox Extension (Manifest V3)
│   ├── manifest.json
│   ├── icons/
│   └── src/
│       ├── background/      # Service Worker — WebSocket client, auto-reconnect
│       ├── content/         # Player Bridge — reads & controls YouTube Music DOM
│       └── popup/           # Extension popup UI
│
├── server/                  # WebSocket Relay Server (Node.js)
│   └── src/index.js         # Room-based message routing + search proxy API
│
├── web/                     # Mobile PWA (Vue 3 + Vite)
│   └── src/
│       ├── App.vue           # Player, Search, Browse UI
│       └── innertube.js      # YouTube Music search via server proxy
│
├── Dockerfile               # Multi-stage: builds PWA + server in one image
└── docker-compose.yml
```

## Tech Stack

| Component | Stack |
|-----------|-------|
| Extension | Vanilla JS, Manifest V3 |
| Server    | Node.js, `ws` |
| PWA       | Vue 3, Vite, PWA Plugin |
| Auth      | Pairing code + SAPISIDHASH |
| Deploy    | Docker, self-hosted |

## Contributing

Contributions are welcome — bug reports, feature requests, or pull requests.

The main maintenance task is keeping DOM selectors up to date when YouTube Music changes their UI. See `extension/src/content/player-bridge.js` → `SELECTORS`.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a PR.

## Support the Project

If YTRemote saved you from a bad song mid-game, consider:

- ⭐ **Starring the repo** — helps others find it
- 🐛 **Reporting bugs** — via [GitHub Issues](https://github.com/ioannis20x/ytremote/issues)
- ☕ **[Buy me a coffee](https://ko-fi.com/ioannisdev)** — keeps the server running

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Made by <a href="https://github.com/ioannis20x">ioannisdev</a>
</div>
