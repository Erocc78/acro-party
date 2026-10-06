// Acro Party prototype server. No dependencies: needs only Node.js 18 or newer.
// Run: node server.js   (then open http://localhost:3000/host on the TV or laptop)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Room } = require('./lib/game');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const ROOM_IDLE_MS = 30 * 60 * 1000;
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // 20 consonants, no vowels, no Y

const rooms = new Map(); // code -> { room, streams: Set<{res, role, playerId}> }

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return 'localhost';
}

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function broadcast(code) {
  const entry = rooms.get(code);
  if (!entry) return;
  const { room } = entry;
  let hostView = null;
  for (const s of entry.streams) {
    let view;
    if (s.role === 'host') view = hostView || (hostView = room.hostView());
    else view = room.playerView(s.playerId);
    s.res.write(`data: ${JSON.stringify(view)}\n\n`);
  }
}

function createRoom(mode) {
  const code = newCode();
  const entry = { streams: new Set() };
  entry.room = new Room(code, mode, () => broadcast(code));
  rooms.set(code, entry);
  return entry.room;
}

// Close rooms nobody has touched for 30 minutes.
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of rooms) {
    if (now - entry.room.lastActivity > ROOM_IDLE_MS && entry.streams.size === 0) {
      entry.room.destroy();
      rooms.delete(code);
    }
  }
}, 60 * 1000).unref();

// ---------- HTTP helpers ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const ROUTES = { '/': 'index.html', '/host': 'host.html', '/play': 'play.html' };

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 10000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function serveStatic(req, res, pathname) {
  const rel = ROUTES[pathname] || pathname.slice(1);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return sendJson(res, 404, { error: 'Not found' });
  fs.readFile(file, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function getRoom(code) {
  const entry = rooms.get(String(code || '').toUpperCase().trim());
  return entry ? entry.room : null;
}

// ---------- API ----------
async function api(req, res, pathname) {
  const body = req.method === 'POST' ? await readBody(req) : {};

  if (pathname === '/api/info') {
    return sendJson(res, 200, { lanUrl: `http://${lanAddress()}:${PORT}` });
  }

  if (pathname === '/api/create') {
    const room = createRoom(body.mode);
    return sendJson(res, 200, { code: room.code, hostToken: room.hostToken });
  }

  const room = getRoom(body.code);
  if (!room) return sendJson(res, 404, { error: "We couldn't find that room. Check the code on the TV." });

  if (pathname === '/api/peek') {
    return sendJson(res, 200, { code: room.code, mode: room.mode, phase: room.phase });
  }

  if (pathname === '/api/join') {
    const out = room.join(body);
    if (out.error) return sendJson(res, 400, { error: out.error });
    return sendJson(res, 200, { token: out.player.token, playerId: out.player.id, name: out.player.name });
  }

  if (pathname === '/api/host') {
    if (body.hostToken !== room.hostToken) return sendJson(res, 403, { error: 'Not the host.' });
    room.touch();
    let out = {};
    switch (body.type) {
      case 'start': out = room.start(); break;
      case 'skip': room.skip(); break;
      case 'pause': room.pause(); break;
      case 'resume': room.resume(); break;
      case 'kick': room.remove(body.playerId); break;
      case 'settings': out = room.updateSettings(body); break;
      case 'playAgain': room.playAgain(); break;
      default: out = { error: 'Unknown action.' };
    }
    return sendJson(res, out.error ? 400 : 200, out);
  }

  if (pathname === '/api/play') {
    const p = room.byToken(body.token);
    if (!p) return sendJson(res, 403, { error: 'You are not in this room.' });
    let out;
    switch (body.type) {
      case 'answer': out = room.submitAnswer(p.id, body.text); break;
      case 'vote': out = room.castVote(p.id, body.answerId); break;
      case 'bonusAnswer': out = room.submitBonus(p.id, body.text); break;
      case 'bonusVote': out = room.castBonusVote(p.id, body.pair, body.label); break;
      case 'leave': room.remove(p.id); out = { ok: true }; break;
      default: out = { error: 'Unknown action.' };
    }
    return sendJson(res, out.error ? 400 : 200, out);
  }

  return sendJson(res, 404, { error: 'Not found' });
}

// Live updates: Server-Sent Events. Each screen keeps one stream open.
function events(req, res, url) {
  const code = String(url.searchParams.get('code') || '').toUpperCase();
  const entry = rooms.get(code);
  if (!entry) return sendJson(res, 404, { error: 'Room not found' });
  const { room } = entry;
  const role = url.searchParams.get('role');
  let stream;
  if (role === 'host') {
    if (url.searchParams.get('hostToken') !== room.hostToken) return sendJson(res, 403, { error: 'Not the host' });
    stream = { res, role: 'host' };
  } else {
    const p = room.byToken(url.searchParams.get('token'));
    if (!p) return sendJson(res, 403, { error: 'Not in room' });
    stream = { res, role: 'player', playerId: p.id, player: p };
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (process.env.SIMULATE_BUFFERING) return; // test only: behave like a proxy that holds the stream back
  // 2 KB of padding up front: some proxies hold back small responses until they fill a buffer.
  res.write(':' + ' '.repeat(2048) + '\n\nretry: 1500\n\n');
  entry.streams.add(stream);
  const ping = setInterval(() => res.write('event: ping\ndata: 1\n\n'), 15000);
  req.on('close', () => {
    clearInterval(ping);
    entry.streams.delete(stream);
    if (stream.player && !stream.player.removed) room.streamClosed(stream.player);
  });
  if (stream.player) room.streamOpened(stream.player); // triggers a broadcast
  else broadcast(code);
}

// Fallback for networks that block live streams: screens ask for the latest state about once a second.
const pollers = new Map(); // "CODE:playerId" -> timer that marks the player disconnected
function pollState(req, res, url) {
  const code = String(url.searchParams.get('code') || '').toUpperCase();
  const entry = rooms.get(code);
  if (!entry) return sendJson(res, 404, { error: 'Room not found' });
  const { room } = entry;
  if (url.searchParams.get('role') === 'host') {
    if (url.searchParams.get('hostToken') !== room.hostToken) return sendJson(res, 403, { error: 'Not the host' });
    room.touch();
    return sendJson(res, 200, room.hostView());
  }
  const p = room.byToken(url.searchParams.get('token'));
  if (!p) return sendJson(res, 403, { error: 'Not in room' });
  const key = `${code}:${p.id}`;
  if (pollers.has(key)) clearTimeout(pollers.get(key));
  else room.streamOpened(p);
  pollers.set(key, setTimeout(() => {
    pollers.delete(key);
    if (!p.removed) room.streamClosed(p);
  }, 6000));
  return sendJson(res, 200, room.playerView(p.id));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/events') return events(req, res, url);
  if (url.pathname === '/state') return pollState(req, res, url);
  if (url.pathname.startsWith('/api/')) {
    return api(req, res, url.pathname).catch((e) => {
      console.error(e);
      sendJson(res, 500, { error: 'Something went wrong.' });
    });
  }
  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  const lan = `http://${lanAddress()}:${PORT}`;
  console.log('\n  Acro Party is running!\n');
  console.log(`  TV / host screen:  http://localhost:${PORT}/host`);
  console.log(`  Phones join at:    ${lan}/play   (same Wi-Fi network)\n`);
});
