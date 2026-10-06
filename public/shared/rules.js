// Answer rules shared by the server (Node) and the phones (browser).
(function (root) {
  var MAX_LEN = 80;

  function splitWords(text) {
    return String(text || '')
      .trim()
      .split(/\s+/)
      .filter(function (w) { return /[a-z]/i.test(w); });
  }

  function firstLetter(word) {
    var m = String(word).match(/[a-z]/i);
    return m ? m[0].toUpperCase() : '';
  }

  // Checks an answer against the acronym letters.
  // Returns { ok, words, perLetter: [true|false per letter], tooMany, tooLong }
  function checkLetters(text, letters) {
    var words = splitWords(text);
    var perLetter = letters.map(function (L, i) {
      return words[i] ? firstLetter(words[i]) === L : false;
    });
    var tooLong = String(text || '').length > MAX_LEN;
    var tooMany = words.length > letters.length;
    var ok = !tooLong && words.length === letters.length && perLetter.every(Boolean);
    return { ok: ok, words: words, perLetter: perLetter, tooMany: tooMany, tooLong: tooLong };
  }

  var api = { MAX_LEN: MAX_LEN, splitWords: splitWords, firstLetter: firstLetter, checkLetters: checkLetters };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AcroRules = api;
})(this);
