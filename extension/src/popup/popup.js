/**
 * YTRemote – Popup Script
 */

const statusDot  = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const serverUrlInput  = document.getElementById('serverUrl');
const pairingCodeInput = document.getElementById('pairingCode');
const connectBtn  = document.getElementById('connectBtn');
const nowPlaying  = document.getElementById('nowPlaying');
const npTitle     = document.getElementById('npTitle');
const npArtist    = document.getElementById('npArtist');
const npThumb     = document.getElementById('npThumb');
const npThumbPh   = document.getElementById('npThumbPlaceholder');
const npStatus    = document.getElementById('npStatus');

// === Gespeicherte Einstellungen laden ===
chrome.storage.local.get(['serverUrl', 'pairingCode'], (result) => {
  if (result.serverUrl)   serverUrlInput.value  = result.serverUrl;
  if (result.pairingCode) pairingCodeInput.value = result.pairingCode;
});

// === Status setzen ===
function setStatus(state, text) {
  statusDot.className  = 'status-dot' + (state ? ` ${state}` : '');
  statusText.className = 'status-text' + (state ? ` ${state}` : '');
  statusText.textContent = text;
}

// === Now Playing anzeigen ===
function showNowPlaying(state) {
  if (!state?.active) {
    nowPlaying.style.display = 'none';
    return;
  }

  npTitle.textContent  = state.title  || '';
  npArtist.textContent = state.artist || '';

  if (state.thumbnail) {
    npThumb.src = state.thumbnail;
    npThumb.style.display = 'block';
    npThumbPh.style.display = 'none';
  } else {
    npThumb.style.display = 'none';
    npThumbPh.style.display = 'block';
  }

  const icon = state.isPlaying
    ? '<i class="fa-solid fa-volume-high"></i><span>Läuft</span>'
    : '<i class="fa-solid fa-pause"></i><span>Pausiert</span>';
  npStatus.innerHTML = icon;

  nowPlaying.style.display = 'flex';
}

// === Verbindungsstatus abfragen ===
chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' }, (response) => {
  if (chrome.runtime.lastError || !response) {
    setStatus('error', 'Nicht verbunden');
    return;
  }

  if (response.connected) {
    setStatus('connected', 'Verbunden');
    showNowPlaying(response.state);
  } else {
    setStatus('error', 'Nicht verbunden');
  }
});

// === Verbinden ===
connectBtn.addEventListener('click', () => {
  const serverUrl   = serverUrlInput.value.trim();
  const pairingCode = pairingCodeInput.value.trim();

  if (!serverUrl || !pairingCode) {
    setStatus('error', 'Bitte alle Felder ausfüllen');
    return;
  }

  setStatus(null, 'Verbinde...');
  connectBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verbinde...';

  chrome.storage.local.set({ serverUrl, pairingCode }, () => {
    chrome.runtime.sendMessage({ type: 'RECONNECT' });

    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' }, (response) => {
        connectBtn.innerHTML = '<i class="fa-solid fa-link"></i> Verbinden';
        if (response?.connected) {
          setStatus('connected', 'Verbunden');
          showNowPlaying(response.state);
        } else {
          setStatus('error', 'Verbindung fehlgeschlagen');
        }
      });
    }, 2000);
  });
});

// Enter-Taste
[serverUrlInput, pairingCodeInput].forEach(el => {
  el.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') connectBtn.click();
  });
});
