// Naughty word filter for Kid-friendly mode.
// Starter list: add your own words to EXTRA_WHOLE or EXTRA_STRONG at the bottom.
//
// - Catches symbol swaps (0 for O, $ for S, @ for A...), stretched letters (fuuuck),
//   dots or dashes inside a word (f.u.c.k) and spaced-out letters (f u c k).
// - "Whole" words only match the whole word (plus common endings), so innocent words
//   such as "class", "Dickens" or "Scunthorpe" are not blocked.

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '(': 'c', '€': 'e' };

// Matched anywhere inside a word (these rarely appear inside innocent words).
const STRONG = [
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'asshole', 'bastard',
  'dickhead', 'motherf', 'wank', 'jizz', 'nigger', 'nigga', 'faggot', 'retard', 'porn', 'dildo', 'blowjob', 'handjob',
];

// Matched as a whole word, with or without a common ending (s, ed, ing, er, y...).
const WHOLE = [
  'ass', 'arse', 'butt', 'butthole', 'dick', 'cock', 'prick', 'pussy', 'tit', 'tits', 'titty', 'boob', 'boobs',
  'piss', 'crap', 'damn', 'hell', 'sex', 'sexy', 'horny', 'nude', 'naked', 'penis', 'vagina',
  'fag', 'dyke', 'homo', 'tranny', 'spic', 'chink', 'kike', 'wetback', 'gook', 'coon', 'twat', 'bollocks',
  'bugger', 'skank', 'hoe', 'hoes', 'thot', 'milf', 'cum', 'anal', 'anus', 'orgasm', 'boner', 'kys', 'wtf', 'stfu',
  'douche', 'drunk', 'vodka',
];

// Innocent words that contain a STRONG piece.
const ALLOW = ['scunthorpe', 'shitake', 'cockpit', 'cocktail', 'peacock', 'hancock', 'therapist', 'classic', 'assess', 'passion',
  'spicy', 'spices', 'spiced', 'butter', 'butters', 'buttered', 'buttering', 'buttery', 'cumin', 'cocker', 'cockers', 'hoed', 'hoeing'];

const EXTRA_STRONG = [];
const EXTRA_WHOLE = [];

const strong = [...STRONG, ...EXTRA_STRONG];
const whole = new Set([...WHOLE, ...EXTRA_WHOLE]);
const allow = new Set(ALLOW);
const SUFFIXES = ['', 's', 'es', 'ed', 'er', 'ers', 'ing', 'in', 'y', 'ie', 'ies', 'hole', 'holes', 'head', 'face'];

function normalize(token) {
  return token
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] || c)
    .join('')
    .replace(/[^a-z]/g, '');
}

function variants(w) {
  return [...new Set([w, w.replace(/(.)\1{2,}/g, '$1'), w.replace(/(.)\1{2,}/g, '$1$1')])];
}
const collapseAll = (s) => s.replace(/(.)\1+/g, '$1');

function isBadWord(w) {
  if (!w || allow.has(w)) return false;
  for (const v of variants(w)) {
    for (const suf of SUFFIXES) {
      if (suf && !v.endsWith(suf)) continue;
      const root = suf ? v.slice(0, -suf.length) : v;
      if (whole.has(root)) return true;
    }
    if (strong.some((s) => v.includes(s))) return true;
  }
  const c = collapseAll(w);
  if (c !== w && strong.some((s) => c.includes(collapseAll(s)))) return true;
  return false;
}

// Returns { bad: false } or { bad: true, wordIndex } where wordIndex counts only
// tokens that contain a letter (the same words AcroRules.splitWords returns), or -1.
function checkText(text) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  let letterIdx = -1;
  const idxOf = tokens.map((t) => (/[a-z]/i.test(t) ? ++letterIdx : -1));
  const norm = tokens.map(normalize);

  for (let i = 0; i < tokens.length; i++) {
    if (isBadWord(norm[i])) return { bad: true, wordIndex: idxOf[i] };
  }
  // Spaced-out letters: "f u c k"
  for (let i = 0; i < tokens.length; i++) {
    if (norm[i].length !== 1) continue;
    let j = i;
    let joined = '';
    while (j < tokens.length && norm[j].length === 1) joined += norm[j++];
    if (joined.length >= 3) {
      for (let a = 0; a < joined.length; a++) {
        for (let b = a + 3; b <= joined.length; b++) {
          if (isBadWord(joined.slice(a, b))) return { bad: true, wordIndex: idxOf[i + a] };
        }
      }
    }
    i = j - 1;
  }
  return { bad: false };
}

module.exports = { checkText, isBadWord, normalize };
