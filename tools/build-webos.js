// Builds the LG TV app (webOS .ipk package) from the tv/webos folder. No extra tools needed.
// Run: node tools/build-webos.js   ->  dist/com.acroparty.tv_<version>_all.ipk
//
// Install it on the TV with Developer Mode (see README, "LG TV app"), using webOS Dev Manager
// or LG's command-line tools: ares-install --device tv dist/com.acroparty.tv_<version>_all.ipk
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tv', 'webos');
const info = JSON.parse(fs.readFileSync(path.join(SRC, 'appinfo.json'), 'utf8'));
const ID = info.id;
const VERSION = info.version;
const MTIME = Math.floor(Date.now() / 1000);

// ---- tiny tar (ustar) writer ----
function octal(n, len) {
  return n.toString(8).padStart(len - 1, '0') + '\0';
}
function tarHeader(name, size, type) {
  const h = Buffer.alloc(512, 0);
  const put = (str, off, len) => Buffer.from(str, 'utf8').copy(h, off, 0, len);
  if (Buffer.byteLength(name) > 100) throw new Error('Path too long for tar: ' + name);
  put(name, 0, 100);
  put(octal(type === '5' ? 0o755 : 0o644, 8), 100, 8);
  put(octal(0, 8), 108, 8);
  put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12);
  put(octal(MTIME, 12), 136, 12);
  put('        ', 148, 8); // checksum placeholder
  put(type, 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  put('root', 265, 32);
  put('root', 297, 32);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}
function tar(entries) {
  // entries: [{ name, data? }] - a name ending in "/" is a folder
  const parts = [];
  for (const e of entries) {
    if (e.name.endsWith('/')) {
      parts.push(tarHeader(e.name, 0, '5'));
    } else {
      parts.push(tarHeader(e.name, e.data.length, '0'), e.data);
      const pad = (512 - (e.data.length % 512)) % 512;
      if (pad) parts.push(Buffer.alloc(pad, 0));
    }
  }
  parts.push(Buffer.alloc(1024, 0));
  return Buffer.concat(parts);
}

// ---- tiny ar writer (the .ipk wrapper, same as a Debian package) ----
function ar(members) {
  const parts = [Buffer.from('!<arch>\n')];
  for (const m of members) {
    const field = (s, len) => s.padEnd(len, ' ').slice(0, len);
    const header = field(m.name, 16) + field(String(MTIME), 12) + field('0', 6) + field('0', 6) + field('100644', 8) + field(String(m.data.length), 10) + '`\n';
    parts.push(Buffer.from(header, 'ascii'), m.data);
    if (m.data.length % 2) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}

// ---- collect the app files ----
const appDir = `./usr/palm/applications/${ID}/`;
const pkgDir = `./usr/palm/packages/${ID}/`;
const files = fs.readdirSync(SRC).filter((f) => !f.startsWith('.') && fs.statSync(path.join(SRC, f)).isFile()).sort();
const dataEntries = [
  { name: './' }, { name: './usr/' }, { name: './usr/palm/' }, { name: './usr/palm/applications/' }, { name: appDir },
];
let installed = 0;
for (const f of files) {
  const data = fs.readFileSync(path.join(SRC, f));
  installed += data.length;
  dataEntries.push({ name: appDir + f, data });
}
const packageinfo = Buffer.from(JSON.stringify({ app: ID, id: ID, loc_name: info.title, package_format_version: 2, vendor: info.vendor, version: VERSION }, null, 2) + '\n');
dataEntries.push({ name: './usr/palm/packages/' }, { name: pkgDir }, { name: pkgDir + 'packageinfo.json', data: packageinfo });

const control = Buffer.from(
  [
    `Package: ${ID}`,
    `Version: ${VERSION}`,
    'Section: misc',
    'Priority: optional',
    'Architecture: all',
    `Installed-Size: ${Math.ceil((installed + packageinfo.length) / 1024)}`,
    `Maintainer: ${info.vendor} <noreply@example.com>`,
    `Description: ${info.title}`,
    'webOS-Package-Format-Version: 2',
    'webOS-Packager-Version: x.y.x',
    '',
  ].join('\n')
);

const ipk = ar([
  { name: 'debian-binary', data: Buffer.from('2.0\n') },
  { name: 'control.tar.gz', data: zlib.gzipSync(tar([{ name: './' }, { name: './control', data: control }]), { level: 9 }) },
  { name: 'data.tar.gz', data: zlib.gzipSync(tar(dataEntries), { level: 9 }) },
]);

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', `${ID}_${VERSION}_all.ipk`);
fs.writeFileSync(out, ipk);
console.log(`  Built the LG TV app: ${path.relative(ROOT, out)} (${(ipk.length / 1024).toFixed(0)} KB, ${files.length} files)`);
