// Packs the whole game (server code plus every file in public/) into ONE JavaScript file,
// dist/acro-party.js, which is what goes inside the Windows app. No extra tools needed.
// Run: node tools/bundle.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT = path.join(OUT_DIR, 'acro-party.js');

// Code modules, by path relative to the project. The first one is the entry point.
const MODULES = ['desktop/launcher.js', 'server.js', 'lib/game.js', 'lib/letters.js', 'lib/filter.js', 'public/shared/rules.js'];

function walk(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, base, out);
    else if (!name.startsWith('_') && !name.startsWith('.')) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function build() {
  const assets = walk(path.join(ROOT, 'public')).sort();
  let assetBytes = 0;
  const assetLines = assets.map((rel) => {
    const buf = fs.readFileSync(path.join(ROOT, 'public', rel));
    assetBytes += buf.length;
    return `  ${JSON.stringify(rel)}: ${JSON.stringify(buf.toString('base64'))},`;
  });

  const moduleLines = MODULES.map((rel) => {
    let src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^#!.*\n/, '');
    return `  ${JSON.stringify(rel)}: function (module, exports, require, __filename, __dirname) {\n${src}\n},`;
  });

  const out = `// Acro Party, packed into one file by tools/bundle.js. Do not edit; edit the source files instead.
const __path = require('path');
let __isSea = false;
try { __isSea = require('node:sea').isSea(); } catch {}
const __ROOT = __isSea ? __path.dirname(process.execPath) : __dirname;

// Every file the browsers load (HTML, scripts, music), carried inside the app.
const __ASSETS = {
${assetLines.join('\n')}
};
global.ACRO_ASSETS = {};
for (const k of Object.keys(__ASSETS)) global.ACRO_ASSETS[k] = Buffer.from(__ASSETS[k], 'base64');

const __MODULES = {
${moduleLines.join('\n')}
};
const __cache = {};
const __nativeRequire = require;
function __load(rel) {
  if (__cache[rel]) return __cache[rel].exports;
  const fn = __MODULES[rel];
  if (!fn) throw new Error('Acro Party bundle is missing ' + rel);
  const module = { exports: {} };
  __cache[rel] = module;
  const dir = __path.posix.dirname(rel);
  const localRequire = (id) => {
    if (id.startsWith('./') || id.startsWith('../')) {
      let target = __path.posix.normalize(__path.posix.join(dir, id));
      if (!target.endsWith('.js')) target += '.js';
      return __load(target);
    }
    return __nativeRequire(id);
  };
  fn.call(module.exports, module, module.exports, localRequire, __path.join(__ROOT, rel), __path.join(__ROOT, dir));
  return module.exports;
}
__load(${JSON.stringify(MODULES[0])});
`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log(`  Packed ${MODULES.length} code files and ${assets.length} game files (${(assetBytes / 1e6).toFixed(1)} MB) into dist/acro-party.js`);
  return OUT;
}

if (require.main === module) build();
module.exports = { build, OUT };
