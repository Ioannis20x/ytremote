/**
 * YTRemote – Background Service Worker
 * Verbindet die Extension mit dem WebSocket Relay Server
 * und leitet Befehle an das Content Script weiter.
 */

let ws = null;
let reconnectTimer = null;
let currentState = { active: false };
const RECONNECT_DELAY = 3000;

/**
 * Einstellungen aus dem Storage laden
 */
async function getConfig() {
  const result = await chrome.storage.local.get(['serverUrl', 'pairingCode']);
  return {
    serverUrl: result.serverUrl || '',
    pairingCode: result.pairingCode || '',
  };
}

/**
 * WebSocket-Verbindung zum Relay-Server aufbauen
 */
async function connectToServer() {
  const config = await getConfig();

  if (!config.serverUrl || !config.pairingCode) {
    console.log('[YTRemote] Keine Server-URL oder Pairing-Code konfiguriert.');
    return;
  }

  // Bestehende Verbindung schließen
  if (ws) {
    ws.close();
    ws = null;
  }

  const wsUrl = config.serverUrl.replace(/^http/, 'ws');

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[YTRemote] Mit Relay-Server verbunden.');
      clearTimeout(reconnectTimer);

      // Authentifizierung mit Pairing-Code
      ws.send(JSON.stringify({
        type: 'AUTH',
        role: 'extension',
        code: config.pairingCode,
      }));

      // Aktuellen Status sofort senden
      sendStateToServer();
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
      } catch (err) {
        console.error('[YTRemote] Fehler beim Parsen der Server-Nachricht:', err);
      }
    };

    ws.onclose = () => {
      console.log('[YTRemote] Verbindung zum Server geschlossen. Reconnect...');
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[YTRemote] WebSocket-Fehler:', err);
    };
  } catch (err) {
    console.error('[YTRemote] Verbindungsfehler:', err);
    scheduleReconnect();
  }
}

/**
 * Reconnect planen
 */
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connectToServer, RECONNECT_DELAY);
}

/**
 * Nachricht vom Server verarbeiten (= Befehl vom Handy)
 */
async function handleServerMessage(message) {
  if (message.type === 'AUTH_OK') {
    console.log('[YTRemote] Authentifizierung erfolgreich.');
    return;
  }

  if (message.type === 'AUTH_FAIL') {
    console.error('[YTRemote] Authentifizierung fehlgeschlagen – Pairing-Code prüfen.');
    return;
  }

  if (message.type === 'COMMAND') {
    // Befehl an Content Script weiterleiten
    const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });

    if (tabs.length === 0) {
      sendToServer({
        type: 'STATE',
        state: { active: false, error: 'Kein YouTube Music Tab offen' },
      });
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, {
        type: 'ACTION',
        action: message.action,
        payload: message.payload || {},
      });

      if (response) {
        currentState = response;
        sendStateToServer();
      }
    } catch (err) {
      console.error('[YTRemote] Fehler bei Befehlsweiterleitung:', err);
    }
  }

  if (message.type === 'REQUEST_STATE') {
    sendStateToServer();
  }

  // Homepage-Daten anfordern (Mein Mix, Empfehlungen, etc.)
  // Content Script nutzt InnerTube API – navigiert nicht mehr weg!
  if (message.type === 'BROWSE') {
    const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });

    if (tabs.length === 0) {
      sendToServer({ type: 'BROWSE_RESULT', shelves: [], error: 'Kein YouTube Music Tab offen' });
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'BROWSE' });
      sendToServer({ type: 'BROWSE_RESULT', shelves: response?.shelves || [] });
    } catch (err) {
      console.error('[YTRemote] Browse-Fehler:', err);
      sendToServer({ type: 'BROWSE_RESULT', shelves: [], error: err.message });
    }
  }

  // Queue/Warteschlange anfordern
  if (message.type === 'GET_QUEUE') {
    const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });

    if (tabs.length === 0) {
      sendToServer({ type: 'QUEUE_RESULT', queue: [] });
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_QUEUE' });
      sendToServer({ type: 'QUEUE_RESULT', queue: response?.queue || [] });
    } catch {
      sendToServer({ type: 'QUEUE_RESULT', queue: [] });
    }
  }
}

/**
 * Aktuellen Player-Status vom Content Script abrufen und an Server senden
 */
async function sendStateToServer() {
  const tabs = await chrome.tabs.query({ url: 'https://music.youtube.com/*' });

  if (tabs.length === 0) {
    sendToServer({
      type: 'STATE',
      state: { active: false },
    });
    return;
  }

  try {
    const state = await chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATE' });
    if (state) {
      currentState = state;
      sendToServer({ type: 'STATE', state });
    }
  } catch {
    // Content Script evtl. noch nicht geladen
    sendToServer({
      type: 'STATE',
      state: { active: false },
    });
  }
}

/**
 * Nachricht an WebSocket-Server senden
 */
function sendToServer(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// === State-Updates vom Content Script empfangen ===
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (message.type === 'STATE_UPDATE') {
    currentState = message.state;
    sendToServer({ type: 'STATE', state: message.state });
  }

  // Popup fragt nach aktuellem Status
  if (message.type === 'GET_CONNECTION_STATUS') {
    _sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN,
      state: currentState,
    });
    return false;
  }

  // Popup schickt neue Config → neu verbinden
  if (message.type === 'RECONNECT') {
    connectToServer();
  }

  return false;
});

// === Autoconnect beim Browser-Start ===
chrome.runtime.onStartup.addListener(() => {
  console.log('[YTRemote] Browser gestartet – verbinde automatisch...');
  connectToServer();
});

// === Keep-Alive: Service Worker alle 20 Sek. aufwecken ===
// MV3 Service Worker schläft nach Inaktivität ein und verliert WebSocket-Verbindung.
// Alarm-API hält ihn aktiv und reconnectet falls nötig.
chrome.alarms.create('ytremote-keepalive', { periodInMinutes: 0.33 }); // ~20 Sekunden

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'ytremote-keepalive') return;

  // Verbindung prüfen und bei Bedarf neu aufbauen
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log('[YTRemote] Keep-Alive: Verbindung verloren, reconnecte...');
    connectToServer();
  }
});

// Beim Start verbinden
connectToServer();
