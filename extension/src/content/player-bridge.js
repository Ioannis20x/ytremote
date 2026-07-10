/**
 * YTRemote – Content Script (Player Bridge)
 * Läuft im Kontext von music.youtube.com und steuert den Player.
 * Kommuniziert mit dem Background Service Worker via chrome.runtime messages.
 */

(() => {
  'use strict';

  // === beforeunload-Listener von YouTube tracken ===
  // YouTube Music setzt beforeunload-Handler die "Seite verlassen?" Dialoge auslösen.
  // Wir fangen sie ab um sie vor gewollter Navigation entfernen zu können.
  window.__ytremote_beforeunload_handlers = [];
  const origAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function(type, handler, options) {
    if (type === 'beforeunload') {
      window.__ytremote_beforeunload_handlers.push(handler);
    }
    return origAddEventListener(type, handler, options);
  };

  /**
   * Alle beforeunload-Listener entfernen (vor Navigation aufrufen)
   */
  function clearBeforeUnload() {
    window.onbeforeunload = null;
    for (const handler of (window.__ytremote_beforeunload_handlers || [])) {
      window.removeEventListener('beforeunload', handler);
    }
  }

  // === YT Music DOM-Selektoren ===
  const SELECTORS = {
    playerBar: 'ytmusic-player-bar',
    playPause: '#play-pause-button, tp-yt-paper-icon-button.play-pause-button, [aria-label*="Pause"], [aria-label*="Play"], [aria-label*="pause"], [aria-label*="play"]',
    next: '.next-button, tp-yt-paper-icon-button.next-button, [aria-label*="Next"], [aria-label*="Nächster"], [aria-label*="eiter"]',
    previous: '.previous-button, tp-yt-paper-icon-button.previous-button, [aria-label*="Previous"], [aria-label*="Vorheriger"], [aria-label*="urück"]',
    shuffle: '.shuffle, tp-yt-paper-icon-button.shuffle, [aria-label*="Shuffle"], [aria-label*="Zufallswiedergabe"], [aria-label*="shuffle"]',
    repeat: '.repeat, tp-yt-paper-icon-button.repeat, [aria-label*="Repeat"], [aria-label*="Wiederholung"], [aria-label*="repeat"]',
    volumeSlider: '#volume-slider, tp-yt-paper-slider#volume-slider, #expand-volume-slider',
    title: [
      'ytmusic-player-bar .title yt-formatted-string',
      'ytmusic-player-bar .title',
      '.title.ytmusic-player-bar',
      '#song-title',
    ],
    artist: [
      'ytmusic-player-bar .byline yt-formatted-string a',
      'ytmusic-player-bar .byline a:first-child',
      'ytmusic-player-bar span.subtitle yt-formatted-string a',
      'ytmusic-player-bar .byline',
    ],
    thumbnail: [
      'ytmusic-player-bar .image img',
      'ytmusic-player-bar .middle-controls img',
      'ytmusic-player-bar img.image',
      '#song-image img',
      'ytmusic-player-bar .thumbnail img',
      'ytmusic-player-bar img[src*="lh3.googleusercontent"]',
      'ytmusic-player-bar img[src*="i.ytimg.com"]',
    ],
    videoElement: 'video',
    queueItems: 'ytmusic-player-queue-item',
  };

  // === Helfer ===

  function queryFirst(selectors) {
    if (typeof selectors === 'string') return document.querySelector(selectors);
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * Button in der Player-Bar finden (sucht nur im Player-Bereich)
   */
  function findPlayerButton(selector) {
    // Zuerst im Player-Bar suchen
    const playerBar = document.querySelector(SELECTORS.playerBar);
    if (playerBar) {
      const btn = playerBar.querySelector(selector);
      if (btn) return btn;
    }
    // Fallback: Global
    return document.querySelector(selector);
  }

  /**
   * Robustes Klicken – simuliert echten User-Klick
   */
  function clickElement(el) {
    if (!el) return false;
    // Erst normales click()
    el.click();
    // Falls das nicht wirkt: MouseEvent dispatchen
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, view: window,
    }));
    return true;
  }

  /**
   * YT Music Movie Player Referenz holen
   */
  function getMoviePlayer() {
    return document.querySelector('#movie_player');
  }

  // === InnerTube API mit Auth (personalisierte Ergebnisse) ===

  const INNERTUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';
  const INNERTUBE_CLIENT = {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241106.01.00',
    hl: 'de',
    gl: 'DE',
  };

  /**
   * SAPISIDHASH generieren (YouTube Auth-Mechanismus)
   */
  async function generateSapisidHash(origin) {
    const cookies = document.cookie.split('; ');
    let sapisid = '';

    for (const cookie of cookies) {
      // SAPISID oder __Secure-3PAPISID
      if (cookie.startsWith('SAPISID=') || cookie.startsWith('__Secure-3PAPISID=')) {
        sapisid = cookie.split('=').slice(1).join('=');
        if (cookie.startsWith('SAPISID=')) break; // SAPISID bevorzugen
      }
    }

    if (!sapisid) return null;

    const timestamp = Math.floor(Date.now() / 1000);
    const input = `${timestamp} ${sapisid} ${origin}`;

    // SHA-1 Hash berechnen
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return `SAPISIDHASH ${timestamp}_${hashHex}`;
  }

  async function innertubeRequest(endpoint, body = {}) {
    const origin = 'https://music.youtube.com';
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': origin,
      'X-Goog-AuthUser': '0',
      'X-Youtube-Client-Name': '67', // WEB_REMIX
      'X-Youtube-Client-Version': INNERTUBE_CLIENT.clientVersion,
    };

    // Auth-Header hinzufügen falls eingeloggt
    const authHash = await generateSapisidHash(origin);
    if (authHash) {
      headers['Authorization'] = authHash;
    }

    const resp = await fetch(`${origin}/youtubei/v1/${endpoint}?key=${INNERTUBE_KEY}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        context: { client: INNERTUBE_CLIENT },
        ...body,
      }),
    });
    return resp.json();
  }

  /**
   * Homepage-Daten per InnerTube API holen (kein Navigieren nötig!)
   */
  async function fetchHomeShelves() {
    try {
      const data = await innertubeRequest('browse', {
        browseId: 'FEmusic_home',
      });

      const shelves = [];
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];

      for (const tab of tabs) {
        const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];

        for (const section of sections) {
          const shelf = section?.musicCarouselShelfRenderer;
          if (!shelf) continue;

          // Titel
          const headerRuns = shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs || [];
          const shelfTitle = headerRuns.map(r => r.text).join('') || '';
          if (!shelfTitle) continue;

          const items = [];
          for (const content of (shelf.contents || [])) {
            const renderer = content?.musicTwoRowItemRenderer;
            if (!renderer) continue;

            const titleRuns = renderer?.title?.runs || [];
            const title = titleRuns.map(r => r.text).join('');

            const subtitleRuns = renderer?.subtitle?.runs || [];
            const subtitle = subtitleRuns.map(r => r.text).join('');

            const thumbnails = renderer?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
            const thumbnail = thumbnails.length > 0 ? thumbnails[thumbnails.length - 1].url : '';

            // URL aus dem NavigationEndpoint
            const navEndpoint = renderer?.navigationEndpoint;
            let url = '';
            if (navEndpoint?.watchEndpoint?.videoId) {
              url = `https://music.youtube.com/watch?v=${navEndpoint.watchEndpoint.videoId}`;
              if (navEndpoint.watchEndpoint.playlistId) {
                url += `&list=${navEndpoint.watchEndpoint.playlistId}`;
              }
            } else if (navEndpoint?.browseEndpoint?.browseId) {
              url = `https://music.youtube.com/browse/${navEndpoint.browseEndpoint.browseId}`;
            }

            if (title && url) {
              items.push({ title, subtitle, thumbnail, url });
            }
          }

          if (items.length > 0) {
            shelves.push({ title: shelfTitle, items });
          }
        }
      }

      return shelves;
    } catch (err) {
      console.error('[YTRemote] InnerTube Browse-Fehler:', err);
      return [];
    }
  }

  // === Player-Status ===

  function getPlayerState() {
    try {
      const video = document.querySelector(SELECTORS.videoElement);
      const titleEl = queryFirst(SELECTORS.title);
      const artistEl = queryFirst(SELECTORS.artist);
      const thumbnailEl = queryFirst(SELECTORS.thumbnail);
      const playPauseBtn = findPlayerButton(SELECTORS.playPause);

      if (!titleEl || !titleEl.textContent.trim()) {
        return { active: false };
      }

      const isPlaying = playPauseBtn?.getAttribute('aria-label')?.toLowerCase().includes('pause')
        || playPauseBtn?.title?.toLowerCase().includes('pause')
        || (video && !video.paused);

      const shuffleBtn = findPlayerButton(SELECTORS.shuffle);
      const repeatBtn = findPlayerButton(SELECTORS.repeat);

      // Artist: nur ersten relevanten Text
      let artist = 'Unbekannt';
      if (artistEl) {
        if (artistEl.tagName === 'A') {
          artist = artistEl.textContent.trim();
        } else {
          const firstLink = artistEl.querySelector('a');
          if (firstLink) {
            artist = firstLink.textContent.trim();
          } else {
            const fullText = artistEl.textContent.trim();
            artist = fullText.split(' • ')[0].split(' \u2022 ')[0].trim();
          }
        }
      }

      let thumbnail = '';
      if (thumbnailEl) {
        thumbnail = thumbnailEl.src || thumbnailEl.getAttribute('data-src') || '';
      }

      // Volume: Movie Player API oder Video-Element
      let volume = 50;
      const mp = getMoviePlayer();
      if (mp && typeof mp.getVolume === 'function') {
        volume = mp.getVolume();
      } else if (video) {
        volume = Math.round(video.volume * 100);
      }

      return {
        active: true,
        title: titleEl?.textContent?.trim() || 'Unbekannt',
        artist,
        thumbnail,
        isPlaying: !!isPlaying,
        volume,
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

  // === Player-Aktionen ===

  function executeAction(action, payload = {}) {
    try {
      switch (action) {
        case 'playPause': {
          clickElement(findPlayerButton(SELECTORS.playPause));
          break;
        }
        case 'next': {
          clickElement(findPlayerButton(SELECTORS.next));
          break;
        }
        case 'previous': {
          clickElement(findPlayerButton(SELECTORS.previous));
          break;
        }
        case 'shuffle': {
          const btn = findPlayerButton(SELECTORS.shuffle);
          if (btn) {
            clickElement(btn);
            console.log('[YTRemote] Shuffle geklickt:', btn.getAttribute('aria-label'));
          } else {
            console.warn('[YTRemote] Shuffle-Button nicht gefunden');
          }
          break;
        }
        case 'repeat': {
          const btn = findPlayerButton(SELECTORS.repeat);
          if (btn) {
            clickElement(btn);
            console.log('[YTRemote] Repeat geklickt:', btn.getAttribute('aria-label'));
          } else {
            console.warn('[YTRemote] Repeat-Button nicht gefunden');
          }
          break;
        }
        case 'setVolume': {
          if (payload.volume === undefined) break;
          const targetVol = Math.max(0, Math.min(100, payload.volume));

          const mp = getMoviePlayer();
          if (mp && typeof mp.setVolume === 'function') {
            mp.setVolume(targetVol);
            break;
          }

          const vid = document.querySelector(SELECTORS.videoElement);
          if (vid) vid.volume = targetVol / 100;
          break;
        }
        case 'seek': {
          if (payload.time === undefined) break;
          const targetTime = payload.time;

          const mp = getMoviePlayer();
          if (mp && typeof mp.seekTo === 'function') {
            mp.seekTo(targetTime, true);
            break;
          }

          const video = document.querySelector(SELECTORS.videoElement);
          if (video) video.currentTime = targetTime;
          break;
        }
        case 'playUrl': {
          let url = payload.url || '';
          let parsedUrl;
          try { parsedUrl = new URL(url, 'https://music.youtube.com'); } catch { parsedUrl = null; }

          const videoId = payload.videoId || parsedUrl?.searchParams.get('v') || '';
          let playlistId = parsedUrl?.searchParams.get('list') || '';
          const mp = getMoviePlayer();

          // Browse-URLs mit Playlist-ID umwandeln: /browse/VLxxxxx → watch?list=xxxxx
          const browseMatch = url.match(/\/browse\/VL(.+)/);
          if (browseMatch) {
            playlistId = browseMatch[1];
            url = `https://music.youtube.com/watch?list=${playlistId}`;
            console.log('[YTRemote] Browse-URL → Playlist:', playlistId);
          }

          // Einzelner Song ohne Playlist → direkt laden (unterbricht nichts)
          if (videoId && !playlistId && mp && typeof mp.loadVideoById === 'function') {
            mp.loadVideoById(videoId);
            console.log('[YTRemote] Song geladen:', videoId);
            break;
          }

          // Playlist ohne Video-ID → Watch-URL bauen damit sie sofort abspielt
          if (playlistId && !videoId) {
            url = `https://music.youtube.com/watch?list=${playlistId}`;
          }

          clearBeforeUnload();
          window.location.href = url;
          console.log('[YTRemote] Navigation zu:', url);
          break;
        }
        default:
          console.warn('[YTRemote] Unbekannte Aktion:', action);
      }

      // Kurz warten, dann neuen Status zurückmelden
      return new Promise(resolve => {
        setTimeout(() => resolve(getPlayerState()), 300);
      });
    } catch (err) {
      console.error('[YTRemote] Fehler bei Aktion:', action, err);
      return Promise.resolve({ error: err.message });
    }
  }

  // === Queue ===

  function getQueue() {
    const queue = [];
    try {
      const queueItems = document.querySelectorAll('ytmusic-player-queue-item');
      for (const item of queueItems) {
        const titleEl = item.querySelector('.song-title');
        const artistEl = item.querySelector('.byline');
        const thumbEl = item.querySelector('img');
        const selected = item.getAttribute('selected') !== null;
        queue.push({
          title: titleEl?.textContent?.trim() || 'Unbekannt',
          artist: artistEl?.textContent?.trim() || '',
          thumbnail: thumbEl?.src || '',
          isPlaying: selected,
        });
      }
    } catch (err) {
      console.error('[YTRemote] Queue-Fehler:', err);
    }
    return queue;
  }

  // === Nachrichten-Handler ===

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_STATE') {
      sendResponse(getPlayerState());
      return false;
    }

    if (message.type === 'BROWSE') {
      // InnerTube API call – kein Navigieren nötig!
      fetchHomeShelves().then(shelves => {
        sendResponse({ shelves, needsNavigate: false });
      }).catch(() => {
        sendResponse({ shelves: [], needsNavigate: false, error: 'Laden fehlgeschlagen' });
      });
      return true; // asynchrone Antwort
    }

    if (message.type === 'GET_QUEUE') {
      sendResponse({ queue: getQueue() });
      return false;
    }

    if (message.type === 'ACTION') {
      executeAction(message.action, message.payload).then(state => {
        sendResponse(state);
      });
      return true;
    }

    return false;
  });

  // === Periodisch Status senden ===
  let lastState = null;

  function broadcastState() {
    const state = getPlayerState();
    const stateStr = JSON.stringify(state);
    if (stateStr !== lastState) {
      lastState = stateStr;
      chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state }).catch(() => {});
    }
  }

  setInterval(broadcastState, 1000);

  console.log('[YTRemote] Content Script geladen – Player Bridge aktiv.');
})();
