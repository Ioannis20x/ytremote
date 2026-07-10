#!/bin/bash
# YTRemote – Git Push Script
# Führe dieses Script im Repo-Verzeichnis aus

set -e

echo "🎵 YTRemote – Push vorbereiten..."

# Sicherstellen dass wir im richtigen Verzeichnis sind
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ Bitte im ytremote/ Verzeichnis ausführen"
  exit 1
fi

# Alle Änderungen stagen
git add -A

# Status anzeigen
echo ""
echo "📋 Geänderte Dateien:"
git status --short
echo ""

# Commit-Message
COMMIT_MSG="feat: new UI design, autoconnect, search filters, playlist support

- Redesigned PWA with dark theme (#0f0f1a), artwork glow effect
- Redesigned extension popup with modern dark UI + Font Awesome icons
- Shuffle/Repeat live badges in player view
- Search filter buttons (Songs / Videos / All)
- Autoconnect on browser start via chrome.runtime.onStartup
- Keep-alive alarm every 20s to maintain WebSocket connection (MV3)
- Playlist support: VL-prefix browse URLs → watch URLs
- beforeunload dialog suppression on navigation
- Search via server proxy (CORS-free)
- Volume/seek via #movie_player API
- Personalized recommendations via SAPISIDHASH auth
- Updated README"

git commit -m "$COMMIT_MSG"

# Push
echo "🚀 Pushe zu origin/main..."
git push origin main

echo ""
echo "✅ Fertig! Jetzt auf dem Server:"
echo "   cd /opt/conts/ytremote/ytremote"
echo "   git pull"
echo "   docker compose down && docker compose up -d --build"
echo ""
echo "   Dann Extension reloaden + YT Music Tab F5"
