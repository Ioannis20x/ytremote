/**
 * YTRemote – YouTube Music Suche
 * Nutzt den Server als Proxy zur InnerTube API (CORS-frei).
 */

/**
 * Songs auf YouTube Music suchen (über Server-Proxy)
 * @param {string} query - Suchbegriff
 * @returns {Array} - Liste von Song-Ergebnissen
 */
export async function searchSongs(query, filter = 'songs') {
  try {
    // Server-URL aus localStorage (gleiche wie WebSocket, aber HTTP)
    const wsUrl = localStorage.getItem('ytremote_server') || '';
    const serverUrl = wsUrl.replace(/^ws/, 'http').replace(/\/$/, '');

    const response = await fetch(`${serverUrl}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filter }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
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
        if (parsed) results.push(parsed);
      }
    }
  } catch (err) {
    console.error('[YTRemote] Parse-Fehler:', err);
  }

  return results.slice(0, 20);
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

    // Artist (zweite FlexColumn – erster Run)
    const secondColumnRuns = renderer?.flexColumns?.[1]
      ?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];

    // Nur Text-Runs nehmen, " • " überspringen, ersten relevanten nehmen
    let artist = 'Unbekannt';
    for (const run of secondColumnRuns) {
      if (run.text && run.text !== ' • ' && run.text !== 'Song' && run.text !== 'Video') {
        artist = run.text;
        break;
      }
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
      thumbnail,
      url: `https://music.youtube.com/watch?v=${videoId}`,
    };
  } catch {
    return null;
  }
}
