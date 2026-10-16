// Acro Party desktop launcher (used by the Windows app, AcroParty.exe).
// Starts the game server on this computer, opens the TV screen in an app window,
// and shows the address phones should use. Close the window to end the game.
//
// Settings live in "Acro Party settings.txt" next to the app (created on first run),
// for example ELEVENLABS_API_KEY=... to turn on Gene's AI voice.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

process.title = 'Acro Party';

// Where the app lives: next to the .exe when packaged, or the project folder when run with Node.
let isSea = false;
try { isSea = require('node:sea').isSea(); } catch {}
const APP_DIR = isSea ? path.dirname(process.execPath) : path.join(__dirname, '..');
let SETTINGS = path.join(APP_DIR, 'Acro Party settings.txt');
// Windows hides file extensions, so a file saved as "Acro Party settings.txt" may really be "...txt.txt".
if (!fs.existsSync(SETTINGS) && fs.existsSync(SETTINGS + '.txt')) SETTINGS += '.txt';
process.env.ACRO_SETTINGS_DIR = APP_DIR;

const TEMPLATE = `# Acro Party settings
# Lines starting with # are ignored. Remove the # in front of a setting to use it,
# save this file, then restart Acro Party.

# Gene Woolery's lifelike AI voice (ElevenLabs). Paste your API key after the = sign.
# ELEVENLABS_API_KEY=

# Optional: a different ElevenLabs voice, for example your own cloned voice.
# ELEVENLABS_VOICE_ID=nPczCjzI2devNBz1zQrb

# Optional: safety cap on characters sent to ElevenLabs per day (a game uses about 3,000).
# ELEVENLABS_DAILY_CHAR_LIMIT=40000

# Port number for the game (3000 by default; the next free one is used if it's taken).
# PORT=3000

# Set to no if you don't want the TV screen to open automatically.
# OPEN_BROWSER=yes
`;

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS)) fs.writeFileSync(SETTINGS, TEMPLATE);
    for (const raw of fs.readFileSync(SETTINGS, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i < 1) continue;
      const key = line.slice(0, i).trim();
      const value = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (value && process.env[key] == null) process.env[key] = value;
    }
  } catch (e) {
    console.log(`  (Couldn't read the settings file: ${e.message})`);
  }
}

function waitThenExit(code) {
  console.log('  Press Enter to close this window.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(code));
}

function exists(p) {
  try { return !!p && fs.existsSync(p); } catch { return false; }
}

// Opens the TV screen. On Windows, Microsoft Edge (or Chrome) opens it as a clean app window
// with no tabs or address bar; otherwise the default browser is used.
function openScreen(url) {
  if (/^(no|false|0|off)$/i.test(process.env.OPEN_BROWSER || '')) return;
  try {
    if (process.platform === 'win32') {
      const pf = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
      const browsers = [];
      for (const base of pf) {
        browsers.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
        browsers.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      }
      const app = browsers.find(exists);
      if (app) {
        spawn(app, [`--app=${url}`, '--start-maximized', '--autoplay-policy=no-user-gesture-required'], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
      }
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
    }
  } catch (e) {
    console.log(`  (Couldn't open the browser automatically: ${e.message})`);
  }
}

global.acroDesktopReady = ({ port, lan, others, aiVoice }) => {
  const host = `http://localhost:${port}/host`;
  console.log('');
  console.log('  ==============================================');
  console.log('            ACRO PARTY is running!');
  console.log('  ==============================================');
  console.log('');
  console.log(`  TV screen:      ${host}`);
  console.log(`  Phones join at: ${lan}/play`);
  if (others && others.length) console.log(`  (If phones can't connect, try: ${others.map((a) => `http://${a}:${port}/play`).join('  or  ')})`);
  console.log('');
  console.log("  Phones must be on the same Wi-Fi as this computer.");
  console.log(`  Gene's AI voice: ${aiVoice ? 'ON' : 'off (add your ElevenLabs key in "Acro Party settings.txt")'}`);
  console.log('');
  console.log('  Keep this window open while you play. Close it to end the game.');
  console.log('');
  openScreen(host);
};

global.acroDesktopFailed = (e) => {
  if (e && e.code === 'EADDRINUSE') console.log('  Another program is using the game\'s port. Set a different PORT in "Acro Party settings.txt".');
  waitThenExit(1);
};

process.on('uncaughtException', (e) => {
  console.error('\n  Something went wrong:', e && e.stack ? e.stack : e);
  waitThenExit(1);
});

loadSettings();
require('../server.js');
