// Small, self-contained QR code generator so the join code works without internet.
// Byte mode, error correction level M, versions 1 to 10 (up to about 210 characters).
// The algorithm follows the QR Code standard (ISO/IEC 18004); structure inspired by
// Project Nayuki's MIT-licensed reference implementation.
// Use: AcroQR.matrix(text) -> array of rows of booleans; AcroQR.svg(text, { size, dark, light }) -> SVG markup.
(function (root) {
  // Level M tables, index = version (1..10)
  var ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  var NUM_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  var FORMAT_ECL_M = 0;

  function rawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function dataCodewords(ver) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
  }

  function utf8(text) {
    var s = unescape(encodeURIComponent(text));
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  // ---- Reed-Solomon over GF(2^8), polynomial 0x11D ----
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var r = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], r);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      r = gfMul(r, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  function matrix(text) {
    var bytes = utf8(String(text));
    var ver = 0;
    for (var v = 1; v <= 10; v++) {
      var ccBits = v <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; }
    }
    if (!ver) throw new Error('Text too long for this QR code');

    // ---- data bits ----
    var bits = [];
    var put = function (val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); // byte mode
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    var capacity = dataCodewords(ver) * 8;
    put(0, Math.min(4, capacity - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (var pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
      data.push(byte);
    }

    // ---- error correction and interleaving ----
    var numBlocks = NUM_BLOCKS[ver];
    var eccLen = ECC_PER_BLOCK[ver];
    var rawCodewords = Math.floor(rawDataModules(ver) / 8);
    var numShort = numBlocks - (rawCodewords % numBlocks);
    var shortLen = Math.floor(rawCodewords / numBlocks);
    var divisor = rsDivisor(eccLen);
    var blocks = [];
    for (var b = 0, off = 0; b < numBlocks; b++) {
      var dat = data.slice(off, off + shortLen - eccLen + (b < numShort ? 0 : 1));
      off += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (b < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var codewords = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        if (i !== shortLen - eccLen || j >= numShort) codewords.push(blocks[j][i]);
      }
    }

    // ---- grid ----
    var size = ver * 4 + 17;
    var mods = [], fn = [];
    for (i = 0; i < size; i++) {
      mods.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }
    var setFn = function (x, y, dark) { mods[y][x] = dark; fn[y][x] = true; };

    // timing patterns
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // finder patterns (with separators)
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          var x = c[0] + dx, y = c[1] + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
        }
      }
    });
    // alignment patterns
    var align = [];
    if (ver > 1) {
      var numAlign = Math.floor(ver / 7) + 2;
      var step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
      align = [6];
      for (var pos = size - 7; align.length < numAlign; pos -= step) align.splice(1, 0, pos);
    }
    for (i = 0; i < align.length; i++) {
      for (j = 0; j < align.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
        for (var ay = -2; ay <= 2; ay++) {
          for (var ax = -2; ax <= 2; ax++) setFn(align[i] + ax, align[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
        }
      }
    }
    // format bits placeholder, then version info
    var drawFormat = function (mask) {
      var d = (FORMAT_ECL_M << 3) | mask;
      var rem = d;
      for (var n = 0; n < 10; n++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var fb = ((d << 10) | rem) ^ 0x5412;
      var bit = function (n) { return ((fb >>> n) & 1) !== 0; };
      for (n = 0; n <= 5; n++) setFn(8, n, bit(n));
      setFn(8, 7, bit(6));
      setFn(8, 8, bit(7));
      setFn(7, 8, bit(8));
      for (n = 9; n < 15; n++) setFn(14 - n, 8, bit(n));
      for (n = 0; n < 8; n++) setFn(size - 1 - n, 8, bit(n));
      for (n = 8; n < 15; n++) setFn(8, size - 15 + n, bit(n));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      var vr = ver;
      for (i = 0; i < 12; i++) vr = (vr << 1) ^ ((vr >>> 11) * 0x1f25);
      var vb = (ver << 12) | vr;
      for (i = 0; i < 18; i++) {
        var vbit = ((vb >>> i) & 1) !== 0;
        var a = size - 11 + (i % 3), bb = Math.floor(i / 3);
        setFn(a, bb, vbit);
        setFn(bb, a, vbit);
      }
    }

    // ---- place data (zigzag) ----
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && idx < codewords.length * 8) {
            mods[y][x] = ((codewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
            idx++;
          }
        }
      }
    }

    // ---- masking: try all 8, keep the lowest penalty ----
    var maskFns = [
      function (x, y) { return (x + y) % 2 === 0; },
      function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return ((x * y) % 2) + ((x * y) % 3) === 0; },
      function (x, y) { return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; },
      function (x, y) { return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; },
    ];
    var applyMask = function (m) {
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && maskFns[m](x, y)) mods[y][x] = !mods[y][x];
    };
    var penalty = function () {
      var p = 0, x, y, run, dark = 0;
      for (y = 0; y < size; y++) {
        run = 1;
        for (x = 1; x <= size; x++) {
          if (x < size && mods[y][x] === mods[y][x - 1]) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
      for (x = 0; x < size; x++) {
        run = 1;
        for (y = 1; y <= size; y++) {
          if (y < size && mods[y][x] === mods[y - 1][x]) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
      }
      for (y = 0; y < size - 1; y++) {
        for (x = 0; x < size - 1; x++) {
          var c = mods[y][x];
          if (c === mods[y][x + 1] && c === mods[y + 1][x] && c === mods[y + 1][x + 1]) p += 3;
        }
      }
      var pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      var matches = function (get) {
        var hits = 0;
        for (var a = 0; a <= size - 11; a++) {
          var m1 = true, m2 = true;
          for (var k = 0; k < 11; k++) {
            var v = get(a + k) ? 1 : 0;
            if (v !== pat1[k]) m1 = false;
            if (v !== pat2[k]) m2 = false;
          }
          if (m1) hits++;
          if (m2) hits++;
        }
        return hits;
      };
      for (y = 0; y < size; y++) p += 40 * matches(function (k) { return mods[y][k]; });
      for (x = 0; x < size; x++) p += 40 * matches(function (k) { return mods[k][x]; });
      for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mods[y][x]) dark++;
      var total = size * size;
      p += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    };
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      var pen = penalty();
      if (pen < bestP) { bestP = pen; best = m; }
      applyMask(m); // undo
    }
    applyMask(best);
    drawFormat(best);
    return mods;
  }

  function svg(text, opts) {
    opts = opts || {};
    var m = matrix(text);
    var quiet = 4, n = m.length + quiet * 2;
    var path = '';
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m.length; x++) if (m[y][x]) path += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
    }
    var size = opts.size || 220;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + n + ' ' + n +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="' + n + '" height="' + n + '" fill="' +
      (opts.light || '#fff') + '"/><path d="' + path + '" fill="' + (opts.dark || '#000') + '"/></svg>';
  }

  var api = { matrix: matrix, svg: svg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AcroQR = api;
})(this);
