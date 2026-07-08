/**
 * YTRemote – Popup Script
 * Zeigt Verbindungsstatus und ermöglicht Konfiguration.
 */

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const serverUrlInput = document.getElementById('serverUrl');
const pairingCodeInput = document.getElementById('pairingCode');
const connectBtn = document.getElementById('connectBtn');
const songInfo = document.getElementById('songInfo');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');

// Gespeicherte Einstellungen laden
chrome.storage.local.get(['serverUrl', 'pairingCode'], (result) => {
  if (result.serverUrl) serverUrlInput.value = result.serverUrl;
  if (result.pairingCode) pairingCodeInput.value = result.pairingCode;
});

// Verbindungsstatus abfragen
chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' }, (response) => {
  if (chrome.runtime.lastError || !response) {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Nicht verbunden';
    return;
  }

  if (response.connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Verbunden';
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Nicht verbunden';
  }

  if (response.state?.active) {
    songInfo.style.display = 'block';
    songTitle.textContent = response.state.title || '';
    songArtist.textContent = response.state.artist || '';
  }
});

// Verbinden-Button
connectBtn.addEventListener('click', () => {
  const serverUrl = serverUrlInput.value.trim();
  const pairingCode = pairingCodeInput.value.trim();

  if (!serverUrl || !pairingCode) {
    statusText.textContent = 'Bitte alle Felder ausfüllen';
    return;
  }

  // Speichern und neu verbinden
  chrome.storage.local.set({ serverUrl, pairingCode }, () => {
    chrome.runtime.sendMessage({ type: 'RECONNECT' });
    statusText.textContent = 'Verbinde...';
    statusDot.className = 'status-dot';

    // Nach kurzer Pause Status erneut abfragen
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'GET_CONNECTION_STATUS' }, (response) => {
        if (response?.connected) {
          statusDot.className = 'status-dot connected';
          statusText.textContent = 'Verbunden';
        } else {
          statusDot.className = 'status-dot disconnected';
          statusText.textContent = 'Verbindung fehlgeschlagen';
        }
      });
    }, 2000);
  });
});
