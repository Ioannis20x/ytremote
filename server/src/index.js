/**
 * YTRemote – WebSocket Relay Server
 * Leitet Nachrichten zwischen Extension (PC) und Web Remote (Handy) weiter.
 * Authentifizierung über Pairing-Codes.
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import 'dotenv/config';

const PORT = process.env.PORT || 3456;
const PAIRING_CODE = process.env.PAIRING_CODE || 'change-me';

// === Raum-Verwaltung ===
// Ein "Raum" = ein Pairing-Code verbindet Extension + Remote(s)
const rooms = new Map(); // code -> { extension: ws | null, remotes: Set<ws> }

function getOrCreateRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { extension: null, remotes: new Set() });
  }
  return rooms.get(code);
}

// === MIME-Types für statische Dateien ===
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

// === HTTP-Server: PWA + Health-Check ===
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public'); // /app/public im Docker

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health-Check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      uptime: process.uptime(),
    }));
    return;
  }

  // === Such-Proxy: leitet InnerTube-Anfragen weiter (kein CORS-Problem) ===
  if (req.url === '/api/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { query, filter } = JSON.parse(body);
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'query fehlt' }));
          return;
        }

        // Filter-Params für InnerTube
        const FILTER_PARAMS = {
          songs: 'EgWKAQIIAQ%3D%3D',
          videos: 'EgWKAQIQAQ%3D%3D',
          all: null,
        };
        const params = FILTER_PARAMS[filter] || FILTER_PARAMS.songs;

        const requestBody = {
          context: {
            client: {
              clientName: 'WEB_REMIX',
              clientVersion: '1.20241106.01.00',
              hl: 'de',
              gl: 'DE',
            },
          },
          query,
        };
        if (params) requestBody.params = params;

        const apiResponse = await fetch('https://music.youtube.com/youtubei/v1/search?key=AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': 'https://music.youtube.com',
            'Referer': 'https://music.youtube.com/',
          },
          body: JSON.stringify(requestBody),
        });

        const data = await apiResponse.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (err) {
        console.error('[API] Suchfehler:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Statische Dateien aus public/ ausliefern (PWA)
  if (existsSync(publicDir)) {
    // URL bereinigen (Query-String entfernen, Path Traversal verhindern)
    const urlPath = req.url.split('?')[0];
    const safePath = urlPath.replace(/\.\./g, '');

    let filePath = join(publicDir, safePath);

    // Wenn Verzeichnis oder Root → index.html (SPA-Routing)
    if (!extname(filePath) || !existsSync(filePath)) {
      filePath = join(publicDir, 'index.html');
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = extname(filePath);
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      } catch {
        // Fallthrough zur Fallback-Seite
      }
    }
  }

  // Fallback: Info-Seite wenn kein Web-Build vorhanden
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>YTRemote Server</title></head>
    <body style="font-family:sans-serif;text-align:center;margin-top:80px;background:#1a1a2e;color:#e0e0e0;">
      <h1>🎵 YTRemote Server läuft</h1>
      <p>WebSocket aktiv auf Port ${PORT}</p>
      <p>Web Remote: Baue das Frontend mit <code>cd web && npm run build</code></p>
    </body>
    </html>
  `);
});

// === WebSocket-Server ===
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  let authenticated = false;
  let role = null;     // 'extension' oder 'remote'
  let roomCode = null;

  console.log(`[WS] Neue Verbindung (Clients gesamt: ${wss.clients.size})`);

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Ungültiges JSON' }));
      return;
    }

    // === Authentifizierung ===
    if (message.type === 'AUTH') {
      const code = message.code;

      // Einfache Validierung: Code muss vorhanden und nicht leer sein
      if (!code || typeof code !== 'string' || code.length < 4) {
        ws.send(JSON.stringify({ type: 'AUTH_FAIL', error: 'Ungültiger Pairing-Code' }));
        return;
      }

      role = message.role === 'extension' ? 'extension' : 'remote';
      roomCode = code;
      authenticated = true;

      const room = getOrCreateRoom(code);

      if (role === 'extension') {
        // Alte Extension-Verbindung ersetzen
        if (room.extension && room.extension !== ws) {
          room.extension.close();
        }
        room.extension = ws;
        console.log(`[WS] Extension verbunden (Raum: ${code.substring(0, 4)}...)`);
      } else {
        room.remotes.add(ws);
        console.log(`[WS] Remote verbunden (Raum: ${code.substring(0, 4)}..., Remotes: ${room.remotes.size})`);

        // Sofort Status anfordern, falls Extension schon da ist
        if (room.extension && room.extension.readyState === 1) {
          room.extension.send(JSON.stringify({ type: 'REQUEST_STATE' }));
        }
      }

      ws.send(JSON.stringify({ type: 'AUTH_OK', role }));
      return;
    }

    // Ab hier nur authentifizierte Clients
    if (!authenticated) {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Nicht authentifiziert' }));
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) return;

    // === Nachrichten weiterleiten ===

    // Extension sendet Player-Status → an alle Remotes weiterleiten
    if (message.type === 'STATE' && role === 'extension') {
      const stateMsg = JSON.stringify(message);
      for (const remote of room.remotes) {
        if (remote.readyState === 1) {
          remote.send(stateMsg);
        }
      }
      return;
    }

    // Remote sendet Befehl → an Extension weiterleiten
    if (message.type === 'COMMAND' && role === 'remote') {
      if (room.extension && room.extension.readyState === 1) {
        room.extension.send(JSON.stringify(message));
      } else {
        ws.send(JSON.stringify({
          type: 'STATE',
          state: { active: false, error: 'Extension nicht verbunden' },
        }));
      }
      return;
    }

    // Remote fragt Homepage-Daten oder Queue an → an Extension weiterleiten
    if ((message.type === 'BROWSE' || message.type === 'GET_QUEUE') && role === 'remote') {
      if (room.extension && room.extension.readyState === 1) {
        room.extension.send(JSON.stringify(message));
      }
      return;
    }

    // Extension sendet Browse/Queue-Ergebnisse → an alle Remotes weiterleiten
    if ((message.type === 'BROWSE_RESULT' || message.type === 'QUEUE_RESULT') && role === 'extension') {
      const resultMsg = JSON.stringify(message);
      for (const remote of room.remotes) {
        if (remote.readyState === 1) {
          remote.send(resultMsg);
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === 'extension' && room.extension === ws) {
      room.extension = null;
      console.log(`[WS] Extension getrennt (Raum: ${roomCode.substring(0, 4)}...)`);

      // Remotes informieren
      const offlineMsg = JSON.stringify({
        type: 'STATE',
        state: { active: false, error: 'Extension getrennt' },
      });
      for (const remote of room.remotes) {
        if (remote.readyState === 1) remote.send(offlineMsg);
      }
    }

    if (role === 'remote') {
      room.remotes.delete(ws);
      console.log(`[WS] Remote getrennt (Raum: ${roomCode.substring(0, 4)}...)`);
    }

    // Leere Räume aufräumen
    if (!room.extension && room.remotes.size === 0) {
      rooms.delete(roomCode);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Fehler:', err.message);
  });
});

// === Server starten ===
httpServer.listen(PORT, () => {
  console.log(`\n🎵 YTRemote Server gestartet`);
  console.log(`   HTTP:      http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health\n`);
});
