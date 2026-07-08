/**
 * YTRemote – Content Script (Player Bridge)
 * Läuft im Kontext von music.youtube.com und steuert den Player.
 * Kommuniziert mit dem Background Service Worker via chrome.runtime messages.
 */

(() => {
  'use strict';

  // === YT Music DOM-Selektoren ===
  // Diese können sich bei YouTube-Updates ändern – zentral gepflegt
  const SELECTORS = {
    // Haupt-Player-Leiste unten
    playerBar: 'ytmusic-player-bar',
    // Play/Pause Button
    playPause: '#play-pause-button',
    // Vor/Zurück
    next: '.next-button',
    previous: '.previous-button',
    // Shuffle & Repeat
    shuffle: '.shuffle',
    repeat: '.repeat',
    // Lautstärke
    volumeSlider: '#volume-slider',
    // Song-Informationen
    title: '.title.ytmusic-player-bar',
    artist: '.byline.ytmusic-player-bar',
    thumbnail: '.image.ytmusic-player-bar img',
    // Fortschrittsbalken
    progressBar: '#progress-bar',
    timeInfo: '#left-controls .time-info',
    // Wiedergabe-Status
    videoElement: 'video',
    // Queue / Warteschlange
    queueItems: 'ytmusic-player-queue-item',
    // Suchfeld
    searchInput: 'input#input.ytmusic-search-box',
  };

  /**
   * Aktuellen Player-Status auslesen
   */
  function getPlayerState() {
    try {
      const video = document.querySelector(SELECTORS.videoElement);
      const titleEl = document.querySelector(SELECTORS.title);
      const artistEl = document.querySelector(SELECTORS.artist);
      const thumbnailEl = document.querySelector(SELECTORS.thumbnail);
      const playPauseBtn = document.querySelector(SELECTORS.playPause);
      const volumeSlider = document.querySelector(SELECTORS.volumeSlider);

      // Prüfe ob überhaupt ein Song geladen ist
      if (!titleEl || !titleEl.textContent.trim()) {
        return { active: false };
      }

      // Play/Pause-Status aus dem Button-Attribut oder aria-label ableiten
      const isPlaying = playPauseBtn?.getAttribute('aria-label')?.toLowerCase().includes('pause')
        || playPauseBtn?.title?.toLowerCase().includes('pause')
        || (video && !video.paused);

      // Shuffle/Repeat Status
      const shuffleBtn = document.querySelector(SELECTORS.shuffle);
      const repeatBtn = document.querySelector(SELECTORS.repeat);

      return {
        active: true,
        title: titleEl?.textContent?.trim() || 'Unbekannt',
        artist: artistEl?.textContent?.trim() || 'Unbekannt',
        thumbnail: thumbnailEl?.src || '',
        isPlaying: !!isPlaying,
        volume: volumeSlider?.value ? parseInt(volumeSlider.value) : 50,
        currentTime: video?.currentTime || 0,
        duration: video?.duration || 0,
        shuffle: shuffleBtn?.getAttribute('aria-pressed') === 'true',
        repeat: repeatBtn?.getAttribute('aria-label') || 'none',
      };
    } catch (err) {
      console.error('[YTRemote] Fehler beim Auslesen des Player-Status:', err);
      return { active: false, error: err.message };
    }
  }

  /**
   * Player-Aktionen ausführen
   */
  function executeAction(action, payload = {}) {
    try {
      switch (action) {
        case 'playPause': {
          const btn = document.querySelector(SELECTORS.playPause);
          btn?.click();
          break;
        }
        case 'next': {
          const btn = document.querySelector(SELECTORS.next);
          btn?.click();
          break;
        }
        case 'previous': {
          const btn = document.querySelector(SELECTORS.previous);
          btn?.click();
          break;
        }
        case 'shuffle': {
          const btn = document.querySelector(SELECTORS.shuffle);
          btn?.click();
          break;
        }
        case 'repeat': {
          const btn = document.querySelector(SELECTORS.repeat);
          btn?.click();
          break;
        }
        case 'setVolume': {
          const slider = document.querySelector(SELECTORS.volumeSlider);
          if (slider && payload.volume !== undefined) {
            slider.value = payload.volume;
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
        }
        case 'seek': {
          const video = document.querySelector(SELECTORS.videoElement);
          if (video && payload.time !== undefined) {
            video.currentTime = payload.time;
          }
          break;
        }
        case 'playUrl': {
          // Bestimmten Song abspielen (von der Suche)
          if (payload.url) {
            window.location.href = payload.url;
          } else if (payload.videoId) {
            window.location.href = `https://music.youtube.com/watch?v=${payload.videoId}`;
          }
          break;
        }
        case 'search': {
          // Zur Suche navigieren (Fallback)
          if (payload.query) {
            window.location.href = `https://music.youtube.com/search?q=${encodeURIComponent(payload.query)}`;
          }
          break;
        }
        default:
          console.warn('[YTRemote] Unbekannte Aktion:', action);
      }

      // Kurz warten, dann neuen Status zurückmelden
      return new Promise(resolve => {
        setTimeout(() => resolve(getPlayerState()), 200);
      });
    } catch (err) {
      console.error('[YTRemote] Fehler bei Aktion:', action, err);
      return Promise.resolve({ error: err.message });
    }
  }

  /**
   * Nachrichten vom Background Service Worker empfangen
   */
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_STATE') {
      sendResponse(getPlayerState());
      return false; // synchrone Antwort
    }

    if (message.type === 'ACTION') {
      executeAction(message.action, message.payload).then(state => {
        sendResponse(state);
      });
      return true; // asynchrone Antwort
    }

    return false;
  });

  // === Periodisch Status an Background senden (für Echtzeit-Updates) ===
  let lastState = null;

  function broadcastState() {
    const state = getPlayerState();
    const stateStr = JSON.stringify(state);

    // Nur senden wenn sich etwas geändert hat
    if (stateStr !== lastState) {
      lastState = stateStr;
      chrome.runtime.sendMessage({
        type: 'STATE_UPDATE',
        state,
      }).catch(() => {
        // Background Worker möglicherweise inaktiv – ignorieren
      });
    }
  }

  // Alle 1 Sekunde Status prüfen
  setInterval(broadcastState, 1000);

  console.log('[YTRemote] Content Script geladen – Player Bridge aktiv.');
})();
