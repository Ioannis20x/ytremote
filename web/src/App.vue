<script setup>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { searchSongs } from './innertube.js';

const connected   = ref(false);
const showSetup   = ref(true);
const activeTab   = ref('player');

const config = reactive({
  serverUrl:   localStorage.getItem('ytremote_server') || '',
  pairingCode: localStorage.getItem('ytremote_code')   || '',
});

const player = reactive({
  active: false, title: '', artist: '', thumbnail: '',
  isPlaying: false, volume: 50, currentTime: 0, duration: 0,
  shuffle: false, repeat: 'none', error: '',
});

const searchQuery   = ref('');
const searchResults = ref([]);
const isSearching   = ref(false);
const searchFilter  = ref('songs');
const browseShelves = ref([]);
const isBrowsing    = ref(false);
const browseError   = ref('');

let ws = null;
let reconnectTimer = null;

const formatTime = (s) => {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
};
const progress = computed(() => player.duration ? (player.currentTime / player.duration) * 100 : 0);

// Repeat-Modus als Icon + Label
const repeatMode = computed(() => {
  const r = (player.repeat || '').toLowerCase();
  if (r.includes('one') || r.includes('song') || r.includes('lied') || r.includes('einmal'))
    return { icon: 'fa-solid fa-repeat', label: '1', active: true };
  if (r !== 'none' && r !== '')
    return { icon: 'fa-solid fa-repeat', label: '', active: true };
  return { icon: 'fa-solid fa-repeat', label: '', active: false };
});

// === WebSocket ===
function connect() {
  if (!config.serverUrl || !config.pairingCode) return;
  localStorage.setItem('ytremote_server', config.serverUrl);
  localStorage.setItem('ytremote_code',   config.pairingCode);
  const wsUrl = config.serverUrl.replace(/^http/, 'ws');
  try {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      connected.value = true;
      showSetup.value = false;
      ws.send(JSON.stringify({ type: 'AUTH', role: 'remote', code: config.pairingCode }));
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'STATE' && msg.state) Object.assign(player, msg.state);
        if (msg.type === 'AUTH_FAIL') player.error = 'Pairing-Code ungültig';
        if (msg.type === 'BROWSE_RESULT') {
          isBrowsing.value = false;
          if (msg.error) browseError.value = msg.error;
          else { browseShelves.value = msg.shelves || []; browseError.value = ''; }
        }
      } catch {}
    };
    ws.onclose = () => { connected.value = false; reconnectTimer = setTimeout(connect, 3000); };
    ws.onerror = () => { connected.value = false; };
  } catch { connected.value = false; }
}

function disconnect() {
  clearTimeout(reconnectTimer);
  if (ws) ws.close();
  ws = null; connected.value = false; showSetup.value = true;
}

function sendCommand(action, payload = {}) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'COMMAND', action, payload }));
}
function sendMessage(type) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type }));
}

function playSong(song) {
  sendCommand('playUrl', { url: song.url, videoId: song.videoId });
  Object.assign(player, { title: song.title, artist: song.artist, thumbnail: song.thumbnail, isPlaying: true, active: true });
  activeTab.value = 'player';
}
function playItem(item) {
  sendCommand('playUrl', { url: item.url });
  Object.assign(player, { active: true, isPlaying: true, title: item.title, artist: item.subtitle, thumbnail: item.thumbnail });
  activeTab.value = 'player';
}
function seekTo(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const time = ((event.clientX - rect.left) / rect.width) * player.duration;
  sendCommand('seek', { time });
  player.currentTime = time;
}
function loadBrowse() {
  isBrowsing.value = true; browseError.value = '';
  sendMessage('BROWSE');
}

let searchTimeout = null;
async function doSearch() {
  const query = searchQuery.value.trim();
  if (!query) { searchResults.value = []; return; }
  isSearching.value = true;
  try { searchResults.value = await searchSongs(query, searchFilter.value); }
  catch { searchResults.value = []; }
  finally { isSearching.value = false; }
}
function setFilter(f) { searchFilter.value = f; if (searchQuery.value.trim()) doSearch(); }
function onSearchInput() { clearTimeout(searchTimeout); searchTimeout = setTimeout(doSearch, 400); }

onMounted(() => { if (config.serverUrl && config.pairingCode) connect(); });
onUnmounted(() => { clearTimeout(reconnectTimer); clearTimeout(searchTimeout); if (ws) ws.close(); });
</script>

<template>
  <div class="app">

    <!-- ===== SETUP ===== -->
    <div v-if="showSetup" class="setup">
      <div class="setup-logo">
        <i class="fa-solid fa-music"></i>
      </div>
      <h1>YTRemote</h1>
      <p class="subtitle">YouTube Music Fernbedienung</p>
      <div class="form">
        <div class="input-group">
          <i class="fa-solid fa-server"></i>
          <input v-model="config.serverUrl" type="url" placeholder="wss://ytremote.example.com" @keyup.enter="connect" />
        </div>
        <div class="input-group">
          <i class="fa-solid fa-key"></i>
          <input v-model="config.pairingCode" type="text" placeholder="Pairing-Code" @keyup.enter="connect" />
        </div>
        <button @click="connect" class="btn-primary">
          <i class="fa-solid fa-link"></i> Verbinden
        </button>
      </div>
    </div>

    <!-- ===== REMOTE ===== -->
    <div v-else class="remote">

      <!-- Header -->
      <header>
        <div class="brand">
          <div class="brand-icon"><i class="fa-solid fa-music"></i></div>
          <span>YTRemote</span>
        </div>
        <div class="header-right">
          <div class="connection-pill" :class="{ online: connected }">
            <span class="pill-dot"></span>
            {{ connected ? 'Verbunden' : 'Verbinde...' }}
          </div>
          <button class="btn-icon" @click="disconnect"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </header>

      <!-- Tabs -->
      <nav class="tabs">
        <button class="tab" :class="{ active: activeTab === 'player' }" @click="activeTab = 'player'">
          <i class="fa-solid fa-compact-disc"></i><span>Player</span>
        </button>
        <button class="tab" :class="{ active: activeTab === 'search' }" @click="activeTab = 'search'">
          <i class="fa-solid fa-magnifying-glass"></i><span>Suche</span>
        </button>
        <button class="tab" :class="{ active: activeTab === 'browse' }" @click="activeTab = 'browse'; loadBrowse()">
          <i class="fa-solid fa-compass"></i><span>Entdecken</span>
        </button>
      </nav>

      <!-- ===== PLAYER TAB ===== -->
      <div v-if="activeTab === 'player'" class="tab-content">
        <div v-if="!player.active" class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-headphones"></i></div>
          <p class="empty-title">Kein Song aktiv</p>
          <p class="empty-sub">{{ player.error || 'Öffne YouTube Music im Browser' }}</p>
          <button class="btn-secondary" @click="activeTab = 'search'">
            <i class="fa-solid fa-magnifying-glass"></i> Song suchen
          </button>
        </div>

        <div v-else class="player-view">

          <!-- Artwork -->
          <div class="artwork" :class="{ playing: player.isPlaying }">
            <img v-if="player.thumbnail" :src="player.thumbnail" :alt="player.title" />
            <div v-else class="artwork-placeholder"><i class="fa-solid fa-music"></i></div>
            <div class="artwork-glow" v-if="player.thumbnail" :style="{ backgroundImage: `url(${player.thumbnail})` }"></div>
          </div>

          <!-- Track Info + Shuffle/Repeat Badges -->
          <div class="track-info">
            <div class="track-title">{{ player.title }}</div>
            <div class="track-artist">{{ player.artist }}</div>
            <div class="track-badges">
              <span class="badge" :class="{ active: player.shuffle }">
                <i class="fa-solid fa-shuffle"></i> Shuffle
              </span>
              <span class="badge" :class="{ active: repeatMode.active }">
                <i class="fa-solid fa-repeat"></i>
                Repeat{{ repeatMode.label ? ' ' + repeatMode.label : '' }}
              </span>
            </div>
          </div>

          <!-- Progress -->
          <div class="progress-section">
            <div class="progress-bar" @click="seekTo($event)">
              <div class="progress-track"></div>
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
              <div class="progress-thumb" :style="{ left: progress + '%' }"></div>
            </div>
            <div class="time-display">
              <span>{{ formatTime(player.currentTime) }}</span>
              <span>{{ formatTime(player.duration) }}</span>
            </div>
          </div>

          <!-- Controls -->
          <div class="controls">
            <button class="btn-ctrl secondary" :class="{ active: player.shuffle }" @click="sendCommand('shuffle')" title="Shuffle">
              <i class="fa-solid fa-shuffle"></i>
            </button>
            <button class="btn-ctrl" @click="sendCommand('previous')">
              <i class="fa-solid fa-backward-step"></i>
            </button>
            <button class="btn-ctrl play" @click="sendCommand('playPause')">
              <i :class="player.isPlaying ? 'fa-solid fa-pause' : 'fa-solid fa-play'"></i>
            </button>
            <button class="btn-ctrl" @click="sendCommand('next')">
              <i class="fa-solid fa-forward-step"></i>
            </button>
            <button class="btn-ctrl secondary" :class="{ active: repeatMode.active }" @click="sendCommand('repeat')" title="Repeat">
              <i class="fa-solid fa-repeat"></i>
              <sup v-if="repeatMode.label" class="repeat-badge">{{ repeatMode.label }}</sup>
            </button>
          </div>

          <!-- Volume -->
          <div class="volume-section">
            <button class="vol-btn" @click="sendCommand('setVolume', { volume: 0 })">
              <i class="fa-solid fa-volume-xmark"></i>
            </button>
            <div class="volume-track">
              <div class="volume-fill" :style="{ width: player.volume + '%' }"></div>
              <input type="range" min="0" max="100" :value="player.volume"
                @change="sendCommand('setVolume', { volume: parseInt($event.target.value) })"
                class="volume-slider" />
            </div>
            <button class="vol-btn" @click="sendCommand('setVolume', { volume: 100 })">
              <i class="fa-solid fa-volume-high"></i>
            </button>
          </div>

        </div>
      </div>

      <!-- ===== SUCHE ===== -->
      <div v-if="activeTab === 'search'" class="tab-content">
        <div class="search-section">
          <div class="search-bar">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input v-model="searchQuery" type="search" placeholder="Suche nach Songs, Artists..." @input="onSearchInput" @keyup.enter="doSearch" />
            <button class="search-clear" v-if="searchQuery" @click="searchQuery = ''; searchResults = []">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="filter-bar">
            <button class="filter-btn" :class="{ active: searchFilter === 'songs' }" @click="setFilter('songs')">
              <i class="fa-solid fa-music"></i> Songs
            </button>
            <button class="filter-btn" :class="{ active: searchFilter === 'videos' }" @click="setFilter('videos')">
              <i class="fa-solid fa-video"></i> Videos
            </button>
            <button class="filter-btn" :class="{ active: searchFilter === 'all' }" @click="setFilter('all')">
              <i class="fa-solid fa-layer-group"></i> Alle
            </button>
          </div>
          <div v-if="isSearching" class="loading-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Suche läuft...</span>
          </div>
          <div v-else-if="searchResults.length > 0" class="results-list">
            <div v-for="song in searchResults" :key="song.videoId" class="result-item" @click="playSong(song)">
              <div class="result-thumb">
                <img v-if="song.thumbnail" :src="song.thumbnail" alt="" />
                <i v-else class="fa-solid fa-music"></i>
                <div class="result-play"><i class="fa-solid fa-play"></i></div>
              </div>
              <div class="result-info">
                <div class="result-title">{{ song.title }}</div>
                <div class="result-artist">{{ song.artist }}</div>
              </div>
            </div>
          </div>
          <div v-else-if="searchQuery && !isSearching" class="empty-state small">
            <i class="fa-solid fa-circle-xmark" style="font-size:32px;color:#333;margin-bottom:12px;"></i>
            <p>Keine Ergebnisse für „{{ searchQuery }}"</p>
          </div>
          <div v-else class="empty-state small">
            <p style="color:#555;">Suche nach Songs, die auf deinem PC abgespielt werden</p>
          </div>
        </div>
      </div>

      <!-- ===== ENTDECKEN ===== -->
      <div v-if="activeTab === 'browse'" class="tab-content">
        <div class="browse-section">
          <div v-if="isBrowsing" class="loading-state">
            <i class="fa-solid fa-spinner fa-spin"></i>
            <span>Lade Empfehlungen...</span>
          </div>
          <div v-else-if="browseError" class="empty-state small">
            <p>{{ browseError }}</p>
            <button class="btn-secondary" @click="loadBrowse()">
              <i class="fa-solid fa-rotate-right"></i> Nochmal
            </button>
          </div>
          <div v-else-if="browseShelves.length === 0" class="empty-state small">
            <i class="fa-solid fa-record-vinyl" style="font-size:40px;color:#333;margin-bottom:16px;"></i>
            <p class="empty-title">Öffne YouTube Music</p>
            <p class="empty-sub">Dann erscheinen hier deine Mixes und Empfehlungen</p>
            <button class="btn-secondary" @click="loadBrowse()">
              <i class="fa-solid fa-rotate-right"></i> Laden
            </button>
          </div>
          <div v-else class="shelves">
            <div v-for="(shelf, si) in browseShelves" :key="si" class="shelf">
              <h3 class="shelf-title">{{ shelf.title }}</h3>
              <div class="shelf-scroll">
                <div v-for="(item, ii) in shelf.items" :key="ii" class="shelf-card" @click="playItem(item)">
                  <div class="shelf-card-img">
                    <img v-if="item.thumbnail" :src="item.thumbnail" alt="" />
                    <i v-else class="fa-solid fa-music"></i>
                    <div class="shelf-card-play"><i class="fa-solid fa-play"></i></div>
                  </div>
                  <div class="shelf-card-title">{{ item.title }}</div>
                  <div class="shelf-card-sub">{{ item.subtitle }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: #0f0f1a;
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
  user-select: none;
}
.app { min-height: 100dvh; display: flex; flex-direction: column; }

/* ===== SETUP ===== */
.setup {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center; padding: 32px 24px;
}
.setup-logo {
  width: 72px; height: 72px; border-radius: 20px;
  background: linear-gradient(135deg, #4ecdc4, #2ab5ad);
  display: flex; align-items: center; justify-content: center;
  font-size: 30px; color: #0f0f1a; margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(78,205,196,0.3);
}
.setup h1 { font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
.subtitle { color: #555; margin: 6px 0 32px; font-size: 14px; }
.form { width: 100%; max-width: 360px; }
.input-group {
  position: relative; margin-bottom: 12px;
}
.input-group i {
  position: absolute; left: 14px; top: 50%;
  transform: translateY(-50%); color: #444; font-size: 13px; z-index: 1;
}
.input-group input {
  width: 100%; padding: 13px 14px 13px 40px;
  border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
  background: rgba(255,255,255,0.04); color: #e0e0e0;
  font-size: 14px; font-family: inherit; outline: none;
  transition: border-color 0.2s, background 0.2s;
}
.input-group input:focus {
  border-color: rgba(78,205,196,0.5);
  background: rgba(78,205,196,0.05);
}
.input-group input::placeholder { color: #444; }
.btn-primary {
  width: 100%; margin-top: 8px; padding: 14px;
  border: none; border-radius: 12px;
  background: linear-gradient(135deg, #4ecdc4, #2ab5ad);
  color: #0f0f1a; font-size: 15px; font-weight: 700;
  font-family: inherit; cursor: pointer;
  box-shadow: 0 4px 16px rgba(78,205,196,0.25);
  transition: opacity 0.2s, transform 0.1s;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.btn-primary:active { opacity: 0.85; transform: scale(0.98); }
.btn-secondary {
  margin-top: 16px; padding: 10px 20px;
  border: 1px solid rgba(78,205,196,0.4); border-radius: 10px;
  background: rgba(78,205,196,0.08); color: #4ecdc4;
  font-size: 13px; font-family: inherit; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
}

/* ===== REMOTE SHELL ===== */
.remote { flex: 1; display: flex; flex-direction: column; max-width: 480px; margin: 0 auto; width: 100%; }

header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-icon {
  width: 28px; height: 28px; border-radius: 8px;
  background: linear-gradient(135deg, #4ecdc4, #2ab5ad);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #0f0f1a;
}
.brand span { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
.header-right { display: flex; align-items: center; gap: 8px; }
.connection-pill {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 20px;
  background: rgba(255,107,107,0.1); color: #ff6b6b;
  font-size: 11px; font-weight: 600;
  transition: all 0.3s;
}
.connection-pill.online { background: rgba(78,205,196,0.12); color: #4ecdc4; }
.pill-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}
.connection-pill.online .pill-dot { box-shadow: 0 0 6px currentColor; }
.btn-icon { background: none; border: none; color: #555; font-size: 15px; cursor: pointer; padding: 6px 8px; border-radius: 6px; }
.btn-icon:active { background: rgba(255,255,255,0.05); }

/* ===== TABS ===== */
.tabs {
  display: flex; gap: 3px; padding: 8px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.tab {
  flex: 1; padding: 9px 6px; border: none; border-radius: 10px;
  background: transparent; color: #555;
  font-size: 11px; font-weight: 600; font-family: inherit;
  cursor: pointer; transition: all 0.2s;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.tab i { font-size: 15px; }
.tab span { letter-spacing: 0.2px; }
.tab.active { background: rgba(78,205,196,0.12); color: #4ecdc4; }
.tab-content { flex: 1; display: flex; flex-direction: column; overflow-y: auto; padding: 16px; }

/* ===== EMPTY STATE ===== */
.empty-state {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center; padding: 0 24px;
}
.empty-state.small { flex: unset; padding-top: 48px; }
.empty-icon { font-size: 52px; color: #2a2a3e; margin-bottom: 20px; }
.empty-title { font-size: 16px; font-weight: 600; color: #555; margin-bottom: 6px; }
.empty-sub { font-size: 13px; color: #444; margin-bottom: 4px; }

/* ===== PLAYER ===== */
.player-view { flex: 1; display: flex; flex-direction: column; align-items: center; }

/* Artwork */
.artwork {
  position: relative;
  width: min(240px, 60vw); aspect-ratio: 1;
  border-radius: 16px; overflow: hidden;
  margin-bottom: 24px;
  background: #1a1a2e;
  box-shadow: 0 12px 40px rgba(0,0,0,0.4);
  transition: transform 0.3s, box-shadow 0.3s;
}
.artwork.playing {
  box-shadow: 0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(78,205,196,0.15);
}
.artwork img { width: 100%; height: 100%; object-fit: cover; position: relative; z-index: 1; }
.artwork-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 48px; color: #2a2a3e; }
.artwork-glow {
  position: absolute; inset: -20px; z-index: 0;
  background-size: cover; background-position: center;
  filter: blur(30px) saturate(2); opacity: 0.15;
}

/* Track info */
.track-info { text-align: center; margin-bottom: 16px; padding: 0 8px; width: 100%; }
.track-title { font-size: 18px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.3px; }
.track-artist { font-size: 13px; color: #666; margin-top: 4px; }

/* Shuffle/Repeat Badges */
.track-badges {
  display: flex; justify-content: center; gap: 8px; margin-top: 12px;
}
.badge {
  display: flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 20px;
  font-size: 11px; font-weight: 600;
  background: rgba(255,255,255,0.04);
  color: #444; border: 1px solid rgba(255,255,255,0.06);
  transition: all 0.2s;
}
.badge.active {
  background: rgba(78,205,196,0.12);
  color: #4ecdc4;
  border-color: rgba(78,205,196,0.25);
}
.badge i { font-size: 10px; }

/* Progress */
.progress-section { width: 100%; margin-bottom: 24px; }
.progress-bar {
  width: 100%; height: 32px; position: relative;
  cursor: pointer; display: flex; align-items: center;
}
.progress-track {
  position: absolute; left: 0; right: 0;
  height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px;
}
.progress-fill {
  position: absolute; left: 0; height: 3px;
  background: linear-gradient(90deg, #4ecdc4, #2ab5ad);
  border-radius: 2px; transition: width 0.3s linear; pointer-events: none;
}
.progress-thumb {
  position: absolute; width: 14px; height: 14px;
  border-radius: 50%; background: #fff;
  transform: translateX(-50%);
  pointer-events: none;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  transition: left 0.3s linear;
}
.time-display { display: flex; justify-content: space-between; font-size: 11px; color: #444; margin-top: 6px; }

/* Controls */
.controls {
  display: flex; align-items: center; justify-content: center;
  gap: 12px; margin-bottom: 28px; width: 100%;
}
.btn-ctrl {
  background: none; border: none; color: #888;
  font-size: 20px; cursor: pointer; padding: 10px;
  border-radius: 50%; position: relative;
  transition: color 0.15s, background 0.15s, transform 0.1s;
}
.btn-ctrl:active { transform: scale(0.9); }
.btn-ctrl.secondary { font-size: 16px; color: #555; }
.btn-ctrl.secondary.active { color: #4ecdc4; }
.btn-ctrl:not(.play):not(.secondary) { color: #ccc; font-size: 22px; }
.btn-ctrl.play {
  width: 68px; height: 68px; font-size: 22px;
  background: linear-gradient(135deg, #4ecdc4, #2ab5ad);
  color: #0f0f1a;
  box-shadow: 0 4px 20px rgba(78,205,196,0.35);
}
.btn-ctrl.play i { margin-left: 2px; }
.btn-ctrl.play:active { transform: scale(0.94); }
.repeat-badge {
  position: absolute; top: 4px; right: 4px;
  font-size: 8px; font-weight: 800; color: #4ecdc4;
  font-style: normal;
}

/* Volume */
.volume-section {
  width: 100%; display: flex; align-items: center; gap: 10px;
}
.vol-btn { background: none; border: none; color: #555; font-size: 14px; cursor: pointer; padding: 6px; border-radius: 6px; }
.vol-btn:active { color: #4ecdc4; }
.volume-track { flex: 1; position: relative; height: 32px; display: flex; align-items: center; }
.volume-fill {
  position: absolute; left: 0; height: 3px;
  background: linear-gradient(90deg, #4ecdc4, #2ab5ad);
  border-radius: 2px; pointer-events: none;
}
.volume-slider {
  position: relative; z-index: 1;
  width: 100%; -webkit-appearance: none; appearance: none;
  height: 3px; background: rgba(255,255,255,0.08);
  border-radius: 2px; outline: none;
}
.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px;
  border-radius: 50%; background: #fff; cursor: pointer;
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);
}

/* ===== SUCHE ===== */
.search-section { flex: 1; display: flex; flex-direction: column; }
.search-bar {
  position: relative; margin-bottom: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 12px; display: flex; align-items: center;
  padding: 0 14px;
}
.search-icon { color: #555; font-size: 13px; flex-shrink: 0; }
.search-bar input {
  flex: 1; padding: 13px 10px; background: transparent;
  border: none; color: #e0e0e0; font-size: 14px;
  font-family: inherit; outline: none;
}
.search-bar input::placeholder { color: #444; }
.search-clear { background: none; border: none; color: #555; font-size: 13px; cursor: pointer; padding: 4px; }
.filter-bar { display: flex; gap: 6px; margin-bottom: 16px; }
.filter-btn {
  flex: 1; padding: 8px 6px; border: 1px solid rgba(255,255,255,0.07);
  border-radius: 8px; background: transparent; color: #555;
  font-size: 11px; font-weight: 700; font-family: inherit;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  gap: 5px; transition: all 0.2s; letter-spacing: 0.3px;
}
.filter-btn.active { border-color: rgba(78,205,196,0.4); color: #4ecdc4; background: rgba(78,205,196,0.08); }
.loading-state { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 48px; color: #555; font-size: 14px; }
.loading-state i { color: #4ecdc4; font-size: 20px; }
.results-list { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.result-item { display: flex; align-items: center; gap: 12px; padding: 10px 6px; border-radius: 10px; cursor: pointer; transition: background 0.15s; }
.result-item:active { background: rgba(255,255,255,0.04); }
.result-thumb {
  position: relative; width: 48px; height: 48px;
  border-radius: 8px; overflow: hidden; flex-shrink: 0;
  background: rgba(255,255,255,0.05);
  display: flex; align-items: center; justify-content: center;
  color: #333; font-size: 18px;
}
.result-thumb img { width: 100%; height: 100%; object-fit: cover; }
.result-play {
  position: absolute; inset: 0; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; color: #fff; opacity: 0; transition: opacity 0.15s;
}
.result-item:hover .result-play, .result-item:active .result-play { opacity: 1; }
.result-info { flex: 1; min-width: 0; }
.result-title { font-size: 13px; font-weight: 600; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.result-artist { font-size: 11px; color: #666; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ===== ENTDECKEN ===== */
.browse-section { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.shelves { padding-bottom: 24px; }
.shelf { margin-bottom: 28px; }
.shelf-title { font-size: 15px; font-weight: 700; color: #fff; margin-bottom: 14px; letter-spacing: -0.3px; }
.shelf-scroll {
  display: flex; gap: 12px; overflow-x: auto;
  padding-bottom: 8px; -webkit-overflow-scrolling: touch;
  scroll-snap-type: x mandatory;
}
.shelf-scroll::-webkit-scrollbar { height: 0; }
.shelf-card { flex-shrink: 0; width: 132px; cursor: pointer; scroll-snap-align: start; }
.shelf-card:active .shelf-card-img { transform: scale(0.96); }
.shelf-card-img {
  position: relative; width: 132px; height: 132px;
  border-radius: 10px; overflow: hidden;
  background: rgba(255,255,255,0.05);
  margin-bottom: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #333; font-size: 28px;
  transition: transform 0.2s;
}
.shelf-card-img img { width: 100%; height: 100%; object-fit: cover; }
.shelf-card-play {
  position: absolute; bottom: 8px; right: 8px;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(78,205,196,0.9); color: #0f0f1a;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; opacity: 0; transition: opacity 0.2s;
}
.shelf-card:hover .shelf-card-play,
.shelf-card:active .shelf-card-play { opacity: 1; }
.shelf-card-title { font-size: 12px; font-weight: 600; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shelf-card-sub { font-size: 11px; color: #555; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
