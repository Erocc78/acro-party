// Builds the standalone Acro Party app for THIS computer (AcroParty.exe on Windows).
// It packs the game into one file, then turns a copy of Node.js into the app
// (Node's "single executable application" feature). Players' computers don't need Node.
//
// Windows: double-click "Build Acro Party app (Windows).bat", or run: node tools/build-app.js
// Result: dist/Acro Party/AcroParty.exe  (copy that folder anywhere, or zip it to share)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { build: bundle } = require('./bundle');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const APP_DIR = path.join(DIST, 'Acro Party');
const WIN = process.platform === 'win32';
const EXE = path.join(APP_DIR, WIN ? 'AcroParty.exe' : 'AcroParty');
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const [major, minor] = process.versions.node.split('.').map(Number);
const atLeast = (M, m) => major > M || (major === M && minor >= m);

function fail(msg) {
  console.error(`\n  BUILD FAILED: ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`  > ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: WIN && opts.shell, ...opts });
  return r.status === 0;
}

console.log(`\n  Building the Acro Party app with Node.js ${process.version} (${process.platform}-${process.arch})\n`);
if (!atLeast(20, 0)) fail('Node.js 20 or newer is needed. Get the LTS version from https://nodejs.org');

// 1. Pack the game into one file.
const main = bundle();

// 2. Turn Node.js into the app.
fs.mkdirSync(APP_DIR, { recursive: true });
try { fs.rmSync(EXE, { force: true }); } catch (e) { fail(`Close Acro Party first (${e.message}).`); }
const config = path.join(DIST, 'sea-config.json');

// Does this Node.js have the one-step builder (added in 25.5, possibly backported)? Ask it.
function hasBuildSea() {
  if (atLeast(25, 5)) return true;
  const r = spawnSync(process.execPath, ['--build-sea', path.join(DIST, 'no-such-config.json')], { encoding: 'utf8' });
  return !/bad option|unknown option/i.test(`${r.stderr}${r.stdout}`);
}

if (hasBuildSea()) {
  // Newer Node.js builds the app in one step.
  fs.writeFileSync(config, JSON.stringify({ main, output: EXE, disableExperimentalSEAWarning: true }, null, 2));
  if (!run(process.execPath, ['--build-sea', config])) fail('Node.js could not build the app.');
} else {
  // Older Node.js: make a "blob", copy node, then inject the blob with postject (downloaded by npx).
  const blob = path.join(DIST, 'sea-prep.blob');
  fs.writeFileSync(config, JSON.stringify({ main, output: blob, disableExperimentalSEAWarning: true }, null, 2));
  if (!run(process.execPath, ['--experimental-sea-config', config])) fail('Node.js could not prepare the app.');
  fs.copyFileSync(process.execPath, EXE);
  if (process.platform === 'darwin') run('codesign', ['--remove-signature', EXE]);
  const q = (s) => `"${s}"`; // the command goes through the shell, so quote paths (they may contain spaces)
  const args = ['--yes', 'postject@1.0.0-alpha.6', q(EXE), 'NODE_SEA_BLOB', q(blob), '--sentinel-fuse', FUSE];
  if (process.platform === 'darwin') args.push('--macho-segment-name', 'NODE_SEA');
  if (!run(WIN ? 'npx.cmd' : 'npx', args, { shell: true })) {
    try { fs.rmSync(EXE, { force: true }); } catch {}
    fail('Could not run postject (it is downloaded from the internet the first time).\n' +
      '  Check your internet connection, or install Node.js 25.5 or newer, which can build the app by itself.');
  }
  if (process.platform === 'darwin') run('codesign', ['--sign', '-', EXE]);
}

// 3. Add a short how-to next to the app.
fs.writeFileSync(path.join(APP_DIR, 'How to play.txt'), `ACRO PARTY
==========

1. Double-click ${path.basename(EXE)}.
   - The first time, Windows may say "Windows protected your PC". Click "More info", then "Run anyway".
     (The app isn't signed with a paid certificate yet.)
   - If Windows Firewall asks, tick "Private networks" and click "Allow", so phones can connect.
2. The TV screen opens in its own window. Press F11 for full screen, or drag it to the TV.
3. Pick Kid-friendly or Adult. Players scan the QR code or type the address shown into their phone's browser.
   Phones must be on the same Wi-Fi as this computer (guest Wi-Fi that isolates devices won't work).
4. Keep the black Acro Party window open while you play. Close it to end the game.

Gene's AI voice: open "Acro Party settings.txt" (created the first time you run the app),
remove the # in front of ELEVENLABS_API_KEY= and paste your ElevenLabs key after the = sign. Restart the app.
`);

// 4. If you saved your own "Acro Party settings.txt" (ElevenLabs key and voice) in the windows folder,
//    put a copy next to the app. It is kept out of the app itself and out of GitHub (.gitignore).
const mySettings = path.join(ROOT, 'windows', 'Acro Party settings.txt');
if (fs.existsSync(mySettings)) {
  fs.copyFileSync(mySettings, path.join(APP_DIR, 'Acro Party settings.txt'));
  console.log('  Added your "Acro Party settings.txt" (ElevenLabs key and voice) next to the app.');
}

const size = (fs.statSync(EXE).size / 1e6).toFixed(0);
console.log(`\n  DONE! Your app is ready: ${EXE} (${size} MB)`);
console.log('  Copy the whole "Acro Party" folder anywhere (or zip it) and double-click the app to play.\n');
if (WIN) spawnSync('explorer', [APP_DIR]);
