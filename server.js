// Acro Party prototype server. No dependencies: needs only Node.js 18 or newer.
// Run: node server.js   (then open http://localhost:3000/host on the TV or laptop)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Room } = require('./lib/game');

// Settings file: "Acro Party settings.txt" in the game folder (lines like ELEVENLABS_API_KEY=...).
// Read by both `node server.js` and the desktop launcher. Real environment variables win.
// Also accepts the name Windows produces when file extensions are hidden ("...settings.txt.txt").
const SETTINGS_FILES = ['Acro Party settings.txt', 'Acro Party settings.txt.txt', 'Acro Party settings'];
let settingsFile = null;
for (const dir of [...new Set([process.env.ACRO_SETTINGS_DIR, __dirname, process.cwd()].filter(Boolean))]) {
  for (const name of SETTINGS_FILES) {
    const f = path.join(dir, name);
    if (settingsFile || !fs.existsSync(f)) continue;
    settingsFile = f;
    try {
      for (const raw of fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const i = line.indexOf('=');
        if (i < 1) continue;
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        if (value && process.env[key] == null) process.env[key] = value;
      }
    } catch (e) {
      console.log(`  (Couldn't read ${f}: ${e.message})`);
    }
  }
}

let PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const ROOM_IDLE_MS = 30 * 60 * 1000;
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // 20 consonants, no vowels, no Y

// ---------- AI announcer voice (ElevenLabs) ----------
// Set ELEVENLABS_API_KEY in your host's environment settings to turn it on.
// The key stays on the server; browsers only ever receive the finished audio.
const TTS = {
  key: process.env.ELEVENLABS_API_KEY || '',
  voice: process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb', // "Brian": deep American narrator
  model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2', // most lifelike; 'eleven_flash_v2_5' is cheaper and faster
  base: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io',
  // Safety cap so a stuck screen can't run up a bill: characters per day sent to ElevenLabs.
  dailyLimit: Number(process.env.ELEVENLABS_DAILY_CHAR_LIMIT || 40000),
};
const ttsCache = new Map(); // text -> mp3 (repeated lines are only paid for once)
let ttsCacheBytes = 0;
let ttsDay = '';
let ttsUsed = 0;
const ttsInflight = new Map();

// ElevenLabs limits how many requests can run at once (it depends on your plan), and turns
// extra ones away with a 429. So requests wait in line here, a few at a time, and are retried
// if ElevenLabs is busy. Lines nobody is waiting for any more (the game moved on) are skipped.
const TTS_CONCURRENCY = Math.max(1, Number(process.env.ELEVENLABS_CONCURRENCY || 2));
let ttsActive = 0;
const ttsWaiters = [];
const ttsSlot = () => (ttsActive < TTS_CONCURRENCY ? (ttsActive++, Promise.resolve()) : new Promise((r) => ttsWaiters.push(r)));
const ttsRelease = () => {
  const next = ttsWaiters.shift();
  if (next) next();
  else ttsActive--;
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function callElevenLabs(text) {
  let last = { status: 502, error: 'AI voice service unreachable.' };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${TTS.base}/v1/text-to-speech/${encodeURIComponent(TTS.voice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': TTS.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: TTS.model,
          voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true },
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()) };
      const msg = await r.text().catch(() => '');
      console.error(`ElevenLabs error ${r.status} (attempt ${attempt + 1}): ${msg.slice(0, 300)}`);
      last = { status: 502, error: `AI voice service error (${r.status}).` };
      if (r.status !== 429 && r.status < 500) return last; // a real problem (bad key, bad voice ID): don't retry
    } catch (e) {
      console.error(`ElevenLabs request failed (attempt ${attempt + 1}): ${e.message}`);
    }
    await pause(500 * 2 ** attempt); // 0.5 s, 1 s, 2 s
  }
  return last;
}

function ttsAudio(text) {
  const id = crypto.createHash('sha1').update(`${TTS.voice}|${TTS.model}|${text}`).digest('hex');
  if (ttsCache.has(id)) {
    const buf = ttsCache.get(id);
    ttsCache.delete(id);
    ttsCache.set(id, buf); // keep recently used lines
    return { entry: null, promise: Promise.resolve({ buf }) };
  }
  if (ttsInflight.has(id)) {
    const entry = ttsInflight.get(id);
    entry.waiters++;
    return { entry, promise: entry.promise };
  }
  const entry = { waiters: 1 };
  entry.promise = (async () => {
    await ttsSlot();
    try {
      if (entry.waiters <= 0) return { status: 499, error: 'No longer needed.' };
      const today = new Date().toISOString().slice(0, 10);
      if (today !== ttsDay) {
        ttsDay = today;
        ttsUsed = 0;
      }
      if (ttsUsed + text.length > TTS.dailyLimit) return { status: 429, error: 'Daily AI voice limit reached.' };
      const out = await callElevenLabs(text);
      if (!out.buf) return out;
      ttsUsed += text.length;
      ttsCache.set(id, out.buf);
      ttsCacheBytes += out.buf.length;
      while (ttsCacheBytes > 40e6) {
        const [k, v] = ttsCache.entries().next().value;
        ttsCache.delete(k);
        ttsCacheBytes -= v.length;
      }
      return out;
    } finally {
      ttsRelease();
      ttsInflight.delete(id);
    }
  })();
  ttsInflight.set(id, entry);
  return { entry, promise: entry.promise };
}

const rooms = new Map(); // code -> { room, streams: Set<{res, role, playerId}> }

// The address phones should use. Skips virtual adapters (VPN, WSL, Hyper-V, VirtualBox, Docker...) that phones
// can't reach, and prefers normal home-network addresses.
function lanAddresses() {
  const VIRTUAL = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier|docker|br-|veth|utun|vboxnet|Bluetooth/i;
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const i of addrs || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || i.address.startsWith('169.254.')) continue;
      let score = 0;
      if (VIRTUAL.test(name)) score -= 10;
      if (/^192\.168\./.test(i.address)) score += 3;
      else if (/^10\./.test(i.address)) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(i.address)) score += 1;
      if (/^192\.168\.56\./.test(i.address)) score -= 5; // VirtualBox host-only
      if (/wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d/i.test(name)) score += 1;
      list.push({ name, address: i.address, score });
    }
  }
  return list.sort((a, b) => b.score - a.score);
}

function lanAddress() {
  const best = lanAddresses()[0];
  return best ? best.address : 'localhost';
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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg' };
const ROUTES = { '/': 'index.html', '/host': 'host.html', '/play': 'play.html', '/how-to-play': 'how.html' };

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
  // The Windows app carries every file inside the .exe (global.ACRO_ASSETS); otherwise read from the public folder.
  const read = global.ACRO_ASSETS
    ? (f, cb) => {
        const key = path.relative(PUBLIC, f).split(path.sep).join('/');
        const buf = global.ACRO_ASSETS[key];
        buf ? cb(null, buf) : cb(new Error('missing'));
      }
    : fs.readFile;
  read(file, (err, buf) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    // Music and tutorial pictures are big and rarely change, so browsers may keep them for a day; everything else is always fresh.
    const cache = ['.mp3', '.jpg'].includes(path.extname(file)) ? 'public, max-age=86400' : 'no-store';
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
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
    const all = lanAddresses().filter((a) => a.score > -5).map((a) => `http://${a.address}:${PORT}`);
    // The LG TV app looks for the game on the network by calling this, so allow it from any origin.
    res.setHeader('Access-Control-Allow-Origin', '*');
    return sendJson(res, 200, { app: 'acro-party', lanUrl: all[0] || `http://${lanAddress()}:${PORT}`, others: all.slice(1, 3) });
  }

  if (pathname === '/api/tts/status') {
    return sendJson(res, 200, { enabled: !!TTS.key });
  }

  if (pathname === '/api/create') {
    const room = createRoom(body.mode);
    return sendJson(res, 200, { code: room.code, hostToken: room.hostToken });
  }

  const room = getRoom(body.code);
  if (!room) return sendJson(res, 404, { error: "We couldn't find that room. Check the code on the TV." });

  if (pathname === '/api/tts') {
    // Only the host screen of a live room may use the voice (protects your ElevenLabs credits).
    if (!TTS.key) return sendJson(res, 503, { error: 'AI voice is not set up.' });
    if (body.hostToken !== room.hostToken) return sendJson(res, 403, { error: 'Not the host.' });
    const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text) return sendJson(res, 400, { error: 'No text.' });
    room.touch();
    const { entry, promise } = ttsAudio(text);
    let gone = false;
    res.on('close', () => {
      if (!res.writableEnded && !gone) {
        gone = true;
        if (entry) entry.waiters--; // the TV gave up on this line
      }
    });
    const out = await promise;
    if (res.destroyed) return;
    if (!out.buf) return sendJson(res, out.status || 502, { error: out.error });
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': out.buf.length, 'Cache-Control': 'no-store' });
    return res.end(out.buf);
  }

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
      case 'announced': room.announced(body); break;
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

// If the port is taken (for example the game is already open), try the next few, unless PORT was set on purpose.
let portTries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && !process.env.PORT && portTries++ < 10) {
    PORT++;
    setTimeout(() => server.listen(PORT), 100);
    return;
  }
  console.error(`\n  Could not start Acro Party: ${e.message}\n`);
  if (global.acroDesktopFailed) global.acroDesktopFailed(e);
  else process.exit(1);
});

// Windows: phones can't connect when Windows treats the Wi-Fi as a "Public" network or the firewall
// blocks Node.js. Check the network type and print clear steps if something will get in the way.
function checkWindowsNetwork() {
  if (process.platform !== 'win32' || process.env.ACRO_SKIP_NETCHECK) return;
  const { execFile } = require('child_process');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-NetConnectionProfile | ForEach-Object { "$($_.InterfaceAlias)|$($_.NetworkCategory)" }'],
    { timeout: 8000, windowsHide: true }, (err, stdout) => {
      const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
      const pub = lines.filter((l) => /\|Public$/i.test(l)).map((l) => l.split('|')[0]);
      if (pub.length) {
        console.log(`  HEADS UP: Windows treats your network (${pub.join(', ')}) as "Public", which blocks phones from joining.`);
        console.log('  Fix: Settings > Network & internet > Wi-Fi (or Ethernet) > your network > Network profile type: Private.');
        console.log('  Then restart Acro Party.\n');
      }
      console.log("  Phones can't connect? Make sure Windows Firewall allows Node.js (or AcroParty) on Private networks:");
      console.log('  Windows Security > Firewall & network protection > Allow an app through firewall.\n');
    });
}

server.listen(PORT);
server.on('listening', () => {
  setImmediate(checkWindowsNetwork);
  if (global.acroDesktopReady) return global.acroDesktopReady({ port: PORT, lan: `http://${lanAddress()}:${PORT}`, others: lanAddresses().slice(1).map((a) => a.address), aiVoice: !!TTS.key });
  const lan = `http://${lanAddress()}:${PORT}`;
  console.log('\n  Acro Party is running!\n');
  console.log(`  TV / host screen:  http://localhost:${PORT}/host`);
  console.log(`  Phones join at:    ${lan}/play   (same Wi-Fi network)\n`);
  console.log(TTS.key ? `  AI announcer voice: ON (ElevenLabs voice ${TTS.voice}, model ${TTS.model})\n` : `  AI announcer voice: off. Put "Acro Party settings.txt" with ELEVENLABS_API_KEY=your-key in ${__dirname}, or set the ELEVENLABS_API_KEY environment variable.\n`);
  if (settingsFile) console.log(`  Settings read from: ${settingsFile}\n`);
});
