// Random acronym letters, weighted toward letters that start lots of English words.
const WEIGHTS = {
  S: 11, C: 9, P: 8, T: 7, B: 6, M: 6, A: 6, D: 6, R: 5, F: 5, H: 5,
  G: 4, L: 4, W: 4, E: 3, I: 3, N: 3, O: 3, K: 2, V: 2, J: 1.5, U: 1.5,
  Y: 1, Q: 0.4, X: 0.3, Z: 0.4,
};
const RARE = new Set(['Q', 'X', 'Z']);

// Kid-friendly mode skips letter sets containing any of these.
const KID_BLOCKED = [
  'WTF', 'STFU', 'GTFO', 'FU', 'FML', 'FFS', 'ASS', 'SEX', 'DIK', 'DIC', 'FUK', 'FCK',
  'KKK', 'PMS', 'BJ', 'SOB', 'NSFW', 'XXX', 'CUM', 'TIT', 'FAG', 'KYS', 'POO', 'PEE', 'SHT', 'BS',
];

const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

function pick(rand) {
  let r = rand() * TOTAL;
  for (const [letter, w] of Object.entries(WEIGHTS)) {
    r -= w;
    if (r <= 0) return letter;
  }
  return 'S';
}

function isValidSet(letters, mode) {
  const str = letters.join('');
  const rareCount = letters.filter((l) => RARE.has(l)).length;
  if (rareCount > 1) return false;
  if (letters.length === 3 && rareCount > 0) return false;
  const counts = {};
  for (const l of letters) {
    counts[l] = (counts[l] || 0) + 1;
    if (counts[l] >= 3) return false;
  }
  if (mode === 'kid' && KID_BLOCKED.some((bad) => str.includes(bad))) return false;
  return true;
}

// used: a Set of letter strings already played this game (updated in place)
function generateLetters(length, mode, used, rand = Math.random) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const letters = Array.from({ length }, () => pick(rand));
    const key = letters.join('');
    if (used.has(key) || !isValidSet(letters, mode)) continue;
    used.add(key);
    return letters;
  }
  throw new Error('Could not generate letters');
}

module.exports = { generateLetters, isValidSet, KID_BLOCKED };
