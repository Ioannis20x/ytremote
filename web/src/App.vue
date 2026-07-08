<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { searchSongs } from './innertube.js';

// === Zustand ===
const connected = ref(false);
const showSetup = ref(true);
const activeTab = ref('player'); // 'player' oder 'search'

const config = reactive({
  serverUrl: localStorage.getItem('ytremote_server') || '',
  pairingCode: localStorage.getItem('ytremote_code') || '',
});

const player = reactive({
  active: false,
  title: '',
  artist: '',
  thumbnail: '',
  isPlaying: false,
  volume: 50,
  currentTime: 0,
  duration: 0,
  shuffle: false,
  repeat: 'none',
  error: '',
});

// Suche
const searchQuery = ref('');
const searchResults = ref([]);
const isSearching = ref(false);

let ws = null;
let reconnectTimer = null;

// === Formatierung ===
const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const progress = computed(() => {
  if (!player.duration) return 0;
  return (player.currentTime / player.duration) * 100;
});

// === WebSocket-Verbindung ===
function connect() {
  if (!config.serverUrl || !config.pairingCode) return;

  localStorage.setItem('ytremote_server', config.serverUrl);
  localStorage.setItem('ytremote_code', config.pairingCode);

  const wsUrl = config.serverUrl.replace(/^http/, 'ws');

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected.value = true;
      showSetup.value = false;
      ws.send(JSON.stringify({
        type: 'AUTH',
        role: 'remote',
        code: config.pairingCode,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'STATE' && msg.state) {
          Object.assign(player, msg.state);
        }
        if (msg.type === 'AUTH_FAIL') {
          player.error = 'Pairing-Code ungültig';
        }
      } catch {}
    };

    ws.onclose = () => {
      connected.value = false;
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      connected.value = false;
    };
  } catch {
    connected.value = false;
  }
}

function disconnect() {
  clearTimeout(reconnectTimer);
  if (ws) ws.close();
  ws = null;
  connected.value = false;
  showSetup.value = true;
}

// === Befehle senden ===
function sendCommand(action, payload = {}) {
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify({ type: 'COMMAND', action, payload }));
  }
}

// === Song abspielen (von Suchergebnis) ===
function playSong(song) {
  sendCommand('playUrl', { url: song.url, videoId: song.videoId });
  // Sofort lokale UI aktualisieren
  player.title = song.title;
  player.artist = song.artist;
  player.thumbnail = song.thumbnail;
  player.isPlaying = true;
  player.active = true;
  // Zurück zum Player wechseln
  activeTab.value = 'player';
}

// === Suche ===
let searchTimeout = null;

async function doSearch() {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }

  isSearching.value = true;
  try {
    const results = await searchSongs(query);
    searchResults.value = results;
  } catch (err) {
    console.error('Suchfehler:', err);
    searchResults.value = [];
  } finally {
    isSearching.value = false;
  }
}

function onSearchInput() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(doSearch, 400); // Debounce
}

// === Lifecycle ===
onMounted(() => {
  if (config.serverUrl && config.pairingCode) {
    connect();
  }
});

onUnmounted(() => {
  clearTimeout(reconnectTimer);
  clearTimeout(searchTimeout);
  if (ws) ws.close();
});
</script>

<template>
  <div class="app">
    <!-- Setup-Screen -->
    <div v-if="showSetup" class="setup">
      <h1>🎵 YTRemote</h1>
      <p class="subtitle">Steuere YouTube Music von deinem Handy</p>

      <div class="form">
        <label>Server URL</label>
        <input
          v-model="config.serverUrl"
          type="url"
          placeholder="wss://ytremote.example.com"
          @keyup.enter="connect"
        />

        <label>Pairing-Code</label>
        <input
          v-model="config.pairingCode"
          type="text"
          placeholder="Dein geheimer Code"
          @keyup.enter="connect"
        />

        <button @click="connect" class="btn-primary">Verbinden</button>
      </div>
    </div>

    <!-- Remote-Control -->
    <div v-else class="remote">
      <!-- Header -->
      <header>
        <div class="connection-status">
          <span class="dot" :class="{ online: connected }"></span>
          {{ connected ? 'Verbunden' : 'Verbinde...' }}
        </div>
        <button class="btn-icon" @click="disconnect" title="Trennen">✕</button>
      </header>

      <!-- Tab-Navigation -->
      <nav class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'player' }"
          @click="activeTab = 'player'"
        >Player</button>
        <button
          class="tab"
          :class="{ active: activeTab === 'search' }"
          @click="activeTab = 'search'"
        >Suche</button>
      </nav>

      <!-- ===== PLAYER TAB ===== -->
      <div v-if="activeTab === 'player'" class="tab-content">
        <!-- Kein Song aktiv -->
        <div v-if="!player.active" class="empty-state">
          <div class="empty-icon">🎵</div>
          <p>{{ player.error || 'Öffne YouTube Music in deinem Browser' }}</p>
          <button class="btn-secondary" @click="activeTab = 'search'">Song suchen</button>
        </div>

        <!-- Player -->
        <div v-else class="player-view">
          <div class="artwork">
            <img v-if="player.thumbnail" :src="player.thumbnail" :alt="player.title" />
            <div v-else class="artwork-placeholder">🎵</div>
          </div>

          <div class="track-info">
            <div class="track-title">{{ player.title }}</div>
            <div class="track-artist">{{ player.artist }}</div>
          </div>

          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
            </div>
            <div class="time-display">
              <span>{{ formatTime(player.currentTime) }}</span>
              <span>{{ formatTime(player.duration) }}</span>
            </div>
          </div>

          <div class="controls">
            <button
              class="btn-control small"
              :class="{ active: player.shuffle }"
              @click="sendCommand('shuffle')"
            >🔀</button>
            <button class="btn-control" @click="sendCommand('previous')">⏮</button>
            <button class="btn-control play" @click="sendCommand('playPause')">
              {{ player.isPlaying ? '⏸' : '▶' }}
            </button>
            <button class="btn-control" @click="sendCommand('next')">⏭</button>
            <button
              class="btn-control small"
              @click="sendCommand('repeat')"
            >🔁</button>
          </div>

          <div class="volume-section">
            <span class="volume-icon">🔊</span>
            <input
              type="range"
              min="0"
              max="100"
              :value="player.volume"
              @change="sendCommand('setVolume', { volume: parseInt($event.target.value) })"
              class="volume-slider"
            />
          </div>
        </div>
      </div>

      <!-- ===== SUCH-TAB ===== -->
      <div v-if="activeTab === 'search'" class="tab-content">
        <div class="search-section">
          <div class="search-bar">
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Song, Artist oder Album suchen..."
              @input="onSearchInput"
              @keyup.enter="doSearch"
              autofocus
            />
            <button class="search-btn" @click="doSearch" :disabled="isSearching">
              {{ isSearching ? '...' : '🔍' }}
            </button>
          </div>

          <!-- Ladeindikator -->
          <div v-if="isSearching" class="search-loading">
            <div class="spinner"></div>
            <span>Suche auf YouTube Music...</span>
          </div>

          <!-- Ergebnisse -->
          <div v-else-if="searchResults.length > 0" class="search-results">
            <div
              v-for="song in searchResults"
              :key="song.videoId"
              class="search-item"
              @click="playSong(song)"
            >
              <img
                v-if="song.thumbnail"
                :src="song.thumbnail"
                class="search-thumb"
                alt=""
              />
              <div v-else class="search-thumb-placeholder">🎵</div>
              <div class="search-item-info">
                <div class="search-item-title">{{ song.title }}</div>
                <div class="search-item-artist">{{ song.artist }}</div>
              </div>
              <button class="play-btn" @click.stop="playSong(song)">▶</button>
            </div>
          </div>

          <!-- Keine Ergebnisse -->
          <div v-else-if="searchQuery && !isSearching" class="empty-state small">
            <p>Suche nach Songs, die auf deinem PC abgespielt werden sollen</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
  user-select: none;
}

.app {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

/* === Setup === */
.setup {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.setup h1 { font-size: 32px; margin-bottom: 8px; }
.subtitle { color: #888; margin-bottom: 32px; }

.form { width: 100%; max-width: 360px; }
.form label {
  display: block; font-size: 13px; color: #aaa;
  margin-bottom: 4px; margin-top: 16px;
}
.form input {
  width: 100%; padding: 12px 14px;
  border: 1px solid #333; border-radius: 10px;
  background: #16213e; color: #e0e0e0;
  font-size: 15px; outline: none;
}
.form input:focus { border-color: #4ecdc4; }

.btn-primary {
  width: 100%; margin-top: 24px; padding: 14px;
  border: none; border-radius: 10px;
  background: #4ecdc4; color: #1a1a2e;
  font-size: 16px; font-weight: 700; cursor: pointer;
}

.btn-secondary {
  margin-top: 16px; padding: 10px 20px;
  border: 1px solid #4ecdc4; border-radius: 8px;
  background: transparent; color: #4ecdc4;
  font-size: 14px; cursor: pointer;
}

/* === Remote === */
.remote {
  flex: 1; display: flex; flex-direction: column;
  padding: 16px; max-width: 480px; margin: 0 auto; width: 100%;
}

header {
  display: flex; justify-content: space-between;
  align-items: center; padding-bottom: 8px;
}

.connection-status {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #888;
}

.dot {
  width: 8px; height: 8px; border-radius: 50%; background: #ff6b6b;
}
.dot.online { background: #4ecdc4; }

.btn-icon {
  background: none; border: none; color: #888;
  font-size: 18px; cursor: pointer; padding: 4px 8px;
}

/* === Tabs === */
.tabs {
  display: flex; gap: 4px; margin-bottom: 16px;
  background: #16213e; border-radius: 10px; padding: 4px;
}

.tab {
  flex: 1; padding: 10px; border: none; border-radius: 8px;
  background: transparent; color: #888;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.2s;
}
.tab.active { background: #4ecdc4; color: #1a1a2e; }

.tab-content { flex: 1; display: flex; flex-direction: column; }

/* === Player === */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; color: #666;
}
.empty-state.small { padding-top: 48px; }
.empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.3; }

.player-view {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; padding-top: 8px;
}

.artwork {
  width: min(260px, 65vw); aspect-ratio: 1;
  border-radius: 12px; overflow: hidden;
  margin-bottom: 20px; background: #16213e;
}
.artwork img { width: 100%; height: 100%; object-fit: cover; }
.artwork-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  font-size: 64px; opacity: 0.2;
}

.track-info {
  text-align: center; margin-bottom: 16px;
  padding: 0 16px; width: 100%;
}
.track-title {
  font-size: 18px; font-weight: 700; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.track-artist { font-size: 14px; color: #aaa; margin-top: 4px; }

.progress-section { width: 100%; padding: 0 8px; margin-bottom: 20px; }
.progress-bar {
  width: 100%; height: 4px; background: #333;
  border-radius: 2px; overflow: hidden;
}
.progress-fill {
  height: 100%; background: #4ecdc4;
  border-radius: 2px; transition: width 0.3s linear;
}
.time-display {
  display: flex; justify-content: space-between;
  font-size: 11px; color: #666; margin-top: 4px;
}

.controls {
  display: flex; align-items: center;
  justify-content: center; gap: 16px; margin-bottom: 24px;
}
.btn-control {
  background: none; border: none; color: #e0e0e0;
  font-size: 28px; cursor: pointer; padding: 8px;
  border-radius: 50%; transition: background 0.15s; line-height: 1;
}
.btn-control:active { background: rgba(255, 255, 255, 0.1); }
.btn-control.play {
  font-size: 36px; background: #4ecdc4; color: #1a1a2e;
  width: 68px; height: 68px;
  display: flex; align-items: center; justify-content: center;
}
.btn-control.small { font-size: 20px; color: #888; }
.btn-control.small.active { color: #4ecdc4; }

.volume-section {
  width: 100%; display: flex;
  align-items: center; gap: 12px; padding: 0 8px;
}
.volume-icon { font-size: 16px; color: #888; }
.volume-slider {
  flex: 1; -webkit-appearance: none; appearance: none;
  height: 4px; background: #333; border-radius: 2px; outline: none;
}
.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px;
  border-radius: 50%; background: #4ecdc4; cursor: pointer;
}

/* === Suche === */
.search-section { flex: 1; display: flex; flex-direction: column; }

.search-bar {
  display: flex; gap: 8px; margin-bottom: 16px;
}
.search-bar input {
  flex: 1; padding: 12px 14px;
  border: 1px solid #333; border-radius: 10px;
  background: #16213e; color: #e0e0e0;
  font-size: 15px; outline: none;
}
.search-bar input:focus { border-color: #4ecdc4; }

.search-btn {
  padding: 0 16px; border: none; border-radius: 10px;
  background: #4ecdc4; color: #1a1a2e;
  font-size: 18px; cursor: pointer;
}
.search-btn:disabled { opacity: 0.5; }

.search-loading {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; padding: 32px; color: #888;
}
.spinner {
  width: 20px; height: 20px; border: 2px solid #333;
  border-top-color: #4ecdc4; border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.search-results {
  flex: 1; overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.search-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 8px; border-radius: 10px;
  cursor: pointer; transition: background 0.15s;
}
.search-item:active { background: rgba(78, 205, 196, 0.1); }

.search-thumb {
  width: 48px; height: 48px; border-radius: 6px;
  object-fit: cover; flex-shrink: 0;
}
.search-thumb-placeholder {
  width: 48px; height: 48px; border-radius: 6px;
  background: #16213e; display: flex;
  align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}

.search-item-info { flex: 1; min-width: 0; }
.search-item-title {
  font-size: 14px; font-weight: 600; color: #fff;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.search-item-artist {
  font-size: 12px; color: #aaa; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.play-btn {
  flex-shrink: 0; width: 36px; height: 36px;
  border: none; border-radius: 50%;
  background: #4ecdc4; color: #1a1a2e;
  font-size: 14px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
</style>
