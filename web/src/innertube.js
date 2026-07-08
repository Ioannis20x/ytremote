/**
 * YTRemote – YouTube Music InnerTube API Client
 * Nutzt die interne YouTube Music API für Suche und Songdaten.
 * Läuft serverseitig oder clientseitig (keine Auth nötig).
 */

// InnerTube API Konfiguration für YouTube Music
const INNERTUBE_API_URL = 'https://music.youtube.com/youtubei/v1';
const INNERTUBE_API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'; // Öffentlicher YT Music Key
const INNERTUBE_CLIENT = {
  clientName: 'WEB_REMIX', // = YouTube Music Web
  clientVersion: '1.20241106.01.00',
  hl: 'de',
  gl: 'DE',
};

/**
 * InnerTube API Request senden
 */
async function innertubeRequest(endpoint, body = {}) {
  const response = await fetch(`${INNERTUBE_API_URL}/${endpoint}?key=${INNERTUBE_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/',
    },
    body: JSON.stringify({
      context: {
        client: INNERTUBE_CLIENT,
      },
      ...body,
    }),
  });

  if (!response.ok) {
    throw new Error(`InnerTube API Fehler: ${response.status}`);
  }

  return response.json();
}

/**
 * Songs auf YouTube Music suchen
 * @param {string} query - Suchbegriff
 * @returns {Array} - Liste von Song-Ergebnissen
 */
export async function searchSongs(query) {
  try {
    const data = await innertubeRequest('search', {
      query,
      params: 'EgWKAQIIAWoOEAMQBBAJEAoQBRAREBU%3D', // Filter: Songs
    });

    return parseSearchResults(data);
  } catch (err) {
    console.error('[YTRemote] Suchfehler:', err);
    return [];
  }
}

/**
 * Suchergebnisse parsen und normalisieren
 */
function parseSearchResults(data) {
  const results = [];

  try {
    // Navigation durch die verschachtelte InnerTube-Antwortstruktur
    const contents = data?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.sectionListRenderer?.contents;

    if (!contents) return results;

    for (const section of contents) {
      const items = section?.musicShelfRenderer?.contents;
      if (!items) continue;

      for (const item of items) {
        const renderer = item?.musicResponsiveListItemRenderer;
        if (!renderer) continue;

        const parsed = parseSongItem(renderer);
        if (parsed) {
          results.push(parsed);
        }
      }
    }
  } catch (err) {
    console.error('[YTRemote] Parse-Fehler:', err);
  }

  return results.slice(0, 20); // Max 20 Ergebnisse
}

/**
 * Einzelnen Song aus der InnerTube-Antwort extrahieren
 */
function parseSongItem(renderer) {
  try {
    // Video-ID aus dem NavigationEndpoint
    const videoId = renderer?.overlay?.musicItemThumbnailOverlayRenderer
      ?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
      ?.watchEndpoint?.videoId
      || renderer?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer
        ?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

    if (!videoId) return null;

    // Titel (erste FlexColumn)
    const title = renderer?.flexColumns?.[0]
      ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || 'Unbekannt';

    // Artist + Album + Dauer (zweite FlexColumn, durch " • " getrennt)
    const secondColumn = renderer?.flexColumns?.[1]
      ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
    
    const textParts = secondColumn.map(r => r.text).join('');
    const parts = textParts.split(' • ');
    
    // Erster Part ist üblicherweise "Song • Artist • Album • Dauer"
    // oder nur "Artist • Album • Dauer"
    let artist = 'Unbekannt';
    let album = '';
    let duration = '';

    if (parts.length >= 2) {
      // Erster Part könnte "Song" sein, dann kommt Artist
      artist = parts.find((_, i) => i === 0 || i === 1) || parts[0];
      // Typ-Indikator überspringen
      const filtered = secondColumn.filter(r => r.text !== ' • ' && r.text !== 'Song');
      if (filtered.length > 0) artist = filtered[0]?.text || artist;
    }

    // Thumbnail
    const thumbnails = renderer?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    const thumbnail = thumbnails.length > 0
      ? thumbnails[thumbnails.length - 1].url
      : '';

    return {
      videoId,
      title,
      artist,
      album,
      duration,
      thumbnail,
      url: `https://music.youtube.com/watch?v=${videoId}`,
    };
  } catch {
    return null;
  }
}

/**
 * Song-URL generieren für die Extension
 */
export function getSongUrl(videoId) {
  return `https://music.youtube.com/watch?v=${videoId}`;
}
