// Game engine: one Room per game. The server is the only source of truth.
const crypto = require('crypto');
const { generateLetters } = require('./letters');
const { checkText } = require('./filter');
const { checkLetters } = require('../public/shared/rules');

// GAME_SPEED=0.1 makes every timer 10x faster (used by the automated test).
const SPEED = Number(process.env.GAME_SPEED || 1);
// Announcer holds: reveal phases wait for the TV to report that Ace finished talking (ANNOUNCE_MAX is the safety limit).
const ANNOUNCE_MAX = 25000;
const DUR = { reveal: 5000, vote: 30000, results: 15000, bonusIntro: 6000, bonusReveal: 3000, bonusVote: 30000, bonusResults: 16000 };
const MAIN_LENGTHS = [3, 4, 5, 6, 7, 3, 4, 5];
const BONUS_LENGTHS = [3, 4, 5];
const SEAT_HOLD_MS = 2 * 60 * 1000;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const AVATARS = ['🦊', '🐸', '🐙', '🦄', '🐼', '🐯', '🦖', '🐝', '🐧', '🦉', '🐵', '🐳'];

const rid = () => crypto.randomBytes(8).toString('hex');
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

class Room {
  constructor(code, mode, onChange) {
    this.code = code;
    this.mode = mode === 'adult' ? 'adult' : 'kid';
    // extraTime: the kids' timer, added on top of every answer timer (0, 10 or 20 seconds)
    this.settings = { rounds: 5, extraTime: this.mode === 'kid' ? 10 : 0 };
    this.hostToken = rid();
    this.players = [];
    this.onChange = onChange || (() => {});
    this.timer = null;
    this.pending = null;
    this.lastActivity = Date.now();
    this.resetGame();
    this.phase = 'lobby';
  }

  resetGame() {
    this.phase = 'lobby';
    this.roundIndex = -1;
    this.round = null;
    this.bonus = null;
    this.champion = null;
    this.endsAt = null;
    this.paused = false;
    this.remaining = null;
    this.usedSets = new Set();
    this.lastPoints = {};
    for (const p of this.players) {
      p.score = 0;
      p.votesTotal = 0;
      p.speedTotal = 0;
      p.active = true;
    }
  }

  touch() {
    this.lastActivity = Date.now();
  }

  // ---------- timers ----------
  setPhase(phase, ms, next, hold = false) {
    this.awaitingAnnouncer = hold;
    this.announcedWhilePaused = false;
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = phase;
    this.phaseStartedAt = Date.now();
    this.paused = false;
    this.remaining = null;
    this.pending = next || null;
    if (ms != null) {
      const real = Math.max(50, ms * SPEED);
      this.endsAt = Date.now() + real;
      this.duration = real;
      this.timer = setTimeout(() => this.fire(), real);
    } else {
      this.endsAt = null;
      this.duration = null;
    }
    this.onChange();
  }

  fire() {
    clearTimeout(this.timer);
    this.timer = null;
    const f = this.pending;
    this.pending = null;
    if (f) f();
  }

  // Hold this phase until the TV says the announcer has finished (or ANNOUNCE_MAX passes).
  holdForAnnouncer(phase, next) {
    this.setPhase(phase, ANNOUNCE_MAX, next, true);
  }

  // The TV reports that Ace finished the lines for this moment of the game.
  announced({ phase, roundIndex, bonusIndex }) {
    if (!this.awaitingAnnouncer || phase !== this.phase || Number(roundIndex) !== this.roundIndex) return;
    if (this.bonus && phase !== 'reveal' && Number(bonusIndex) !== this.bonus.index) return;
    if (this.paused) {
      this.announcedWhilePaused = true;
      return;
    }
    this.fire();
  }

  pause() {
    if (this.paused || !this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.remaining = Math.max(0, this.endsAt - Date.now());
    this.endsAt = null;
    this.paused = true;
    this.onChange();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.awaitingAnnouncer && this.announcedWhilePaused) {
      this.onChange();
      return this.fire();
    }
    this.endsAt = Date.now() + this.remaining;
    this.timer = setTimeout(() => this.fire(), this.remaining);
    this.remaining = null;
    this.onChange();
  }

  skip() {
    if (this.pending) this.fire();
  }

  // ---------- players ----------
  present() {
    return this.players.filter((p) => p.connected && p.active);
  }

  player(id) {
    return this.players.find((p) => p.id === id);
  }

  byToken(token) {
    return token ? this.players.find((p) => p.token === token) : null;
  }

  join({ name, avatar, token, ageOk }) {
    this.touch();
    const existing = this.byToken(token);
    if (existing) return { player: existing };
    if (this.mode === 'adult' && !ageOk) return { error: 'This is an adult game (18+ only).' };
    if (this.players.length >= MAX_PLAYERS) return { error: 'This room is full (10 players).' };
    let clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (!clean) return { error: 'Please enter a nickname.' };
    if (this.mode === 'kid' && checkText(clean).bad) return { error: 'Please pick a different nickname.' };
    const base = clean;
    let n = 2;
    while (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) clean = `${base} ${n++}`;
    const p = {
      id: rid(),
      token: rid(),
      name: clean,
      avatar: AVATARS.includes(avatar) ? avatar : AVATARS[this.players.length % AVATARS.length],
      score: 0,
      votesTotal: 0,
      speedTotal: 0,
      connected: false,
      streams: 0,
      // Players who join mid-game wait until the next main round.
      active: this.phase === 'lobby' || this.phase === 'gameover',
      dropTimer: null,
    };
    this.players.push(p);
    this.onChange();
    return { player: p };
  }

  streamOpened(p) {
    p.streams++;
    p.connected = true;
    clearTimeout(p.dropTimer);
    p.dropTimer = null;
    this.onChange();
  }

  streamClosed(p) {
    p.streams = Math.max(0, p.streams - 1);
    if (p.streams > 0) return;
    p.connected = false;
    clearTimeout(p.dropTimer);
    p.dropTimer = setTimeout(() => this.remove(p.id), SEAT_HOLD_MS);
    this.onChange();
    this.checkEarlyEnd();
  }

  remove(id) {
    const p = this.player(id);
    if (!p) return;
    clearTimeout(p.dropTimer);
    this.players = this.players.filter((x) => x.id !== id);
    p.removed = true;
    if (this.bonus && this.bonus.finalists.includes(id) && !this.champion) {
      // A finalist left: the other finalist wins by forfeit.
      const other = this.bonus.finalists.find((f) => f !== id);
      this.champion = { id: other, forfeit: true };
      this.setPhase('gameover', null);
      return;
    }
    this.onChange();
    this.checkEarlyEnd();
  }

  // ---------- host ----------
  updateSettings({ rounds, extraTime }) {
    if (this.phase !== 'lobby' && this.phase !== 'gameover') return { error: 'Settings can only change between games.' };
    if ([5, 6, 7, 8].includes(Number(rounds))) this.settings.rounds = Number(rounds);
    if ([0, 10, 20].includes(Number(extraTime))) this.settings.extraTime = Number(extraTime);
    this.onChange();
    return {};
  }

  start() {
    this.touch();
    if (this.phase !== 'lobby' && this.phase !== 'gameover') return { error: 'The game is already running.' };
    const ready = this.players.filter((p) => p.connected);
    if (ready.length < MIN_PLAYERS) return { error: `At least ${MIN_PLAYERS} players are needed.` };
    this.players = this.players.filter((p) => p.connected);
    this.resetGame();
    this.nextRound();
    return {};
  }

  playAgain() {
    clearTimeout(this.timer);
    this.players = this.players.filter((p) => p.connected);
    this.resetGame();
    this.onChange();
  }

  lightningMs() {
    return this.lightningSecs() * 1000;
  }

  lightningSecs() {
    return this.settings.extraTime > 0 ? 20 : 15;
  }

  // 20 seconds for 3 letters, plus 5 seconds for each extra letter, plus any kids' extra time.
  answerSecs(letterCount) {
    return 20 + 5 * (letterCount - 3) + this.settings.extraTime;
  }

  // ---------- main rounds ----------
  nextRound() {
    this.roundIndex++;
    for (const p of this.players) p.active = true;
    const letters = generateLetters(MAIN_LENGTHS[this.roundIndex], this.mode, this.usedSets);
    this.round = { letters, answers: new Map(), votes: new Map(), voteOrders: new Map(), tvOrder: [], results: null };
    this.lastPoints = {};
    this.holdForAnnouncer('reveal', () => this.setPhase('answer', this.answerSecs(letters.length) * 1000, () => this.endAnswer()));
  }

  validate(text, letters) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    const check = checkLetters(t, letters);
    if (check.tooLong) return { error: 'Answers can be at most 80 characters.' };
    if (!check.ok) return { error: `Use exactly ${letters.length} words starting with ${letters.join('-')}.` };
    if (this.mode === 'kid') {
      const f = checkText(t);
      if (f.bad) return { error: 'Try a different word.', badWord: f.wordIndex };
    }
    return { text: t };
  }

  submitAnswer(playerId, text) {
    this.touch();
    const p = this.player(playerId);
    if (!p || !p.active) return { error: "You'll join in the next round." };
    if (this.phase !== 'answer') return { error: 'Answers are closed.' };
    const v = this.validate(text, this.round.letters);
    if (v.error) return v;
    const prev = this.round.answers.get(p.id);
    this.round.answers.set(p.id, { id: prev ? prev.id : rid(), pid: p.id, text: v.text, at: Date.now() - this.phaseStartedAt });
    this.onChange();
    this.checkEarlyEnd();
    return { ok: true };
  }

  endAnswer() {
    const answers = [...this.round.answers.values()];
    if (answers.length >= 2) {
      this.round.tvOrder = shuffle(answers.map((a) => a.id));
      this.setPhase('vote', DUR.vote, () => this.endVote(true));
    } else {
      this.endVote(false);
    }
  }

  voteOrderFor(pid) {
    const r = this.round;
    if (!r.voteOrders.has(pid)) r.voteOrders.set(pid, shuffle([...r.answers.values()].map((a) => a.id)));
    return r.voteOrders.get(pid);
  }

  castVote(playerId, answerId) {
    this.touch();
    const p = this.player(playerId);
    if (!p || !p.active) return { error: "You'll join in the next round." };
    if (this.phase !== 'vote') return { error: 'Voting is closed.' };
    const a = [...this.round.answers.values()].find((x) => x.id === answerId);
    if (!a) return { error: 'That answer no longer exists.' };
    if (a.pid === p.id) return { error: "You can't vote for your own answer." };
    this.round.votes.set(p.id, answerId);
    this.onChange();
    this.checkEarlyEnd();
    return { ok: true };
  }

  endVote(votingHappened) {
    const r = this.round;
    const n = r.letters.length;
    const answers = [...r.answers.values()];
    const count = {};
    for (const aid of r.votes.values()) count[aid] = (count[aid] || 0) + 1;
    const max = Math.max(0, ...answers.map((a) => count[a.id] || 0));
    const winners = new Set(answers.filter((a) => max > 0 && (count[a.id] || 0) === max).map((a) => a.id));
    const withVotes = answers.filter((a) => (votingHappened ? (count[a.id] || 0) > 0 : true));
    const fastest = withVotes.sort((a, b) => a.at - b.at)[0];
    const points = {};
    const add = (pid, pts) => (points[pid] = (points[pid] || 0) + pts);

    const rows = answers.map((a) => {
      const votes = count[a.id] || 0;
      const forfeited = votingHappened && !r.votes.has(a.pid) && votes > 0;
      const winner = winners.has(a.id);
      const speed = fastest && fastest.id === a.id;
      let pts = 0;
      if (!forfeited) {
        pts += votes;
        if (winner) pts += n;
      }
      if (speed) pts += 1;
      add(a.pid, pts);
      const p = this.player(a.pid);
      if (p) {
        p.votesTotal += votes;
        if (speed) p.speedTotal += 1;
      }
      return { id: a.id, pid: a.pid, text: a.text, votes, winner, speed, forfeited, points: pts, at: a.at };
    });
    const pickedWinner = [];
    for (const [voter, aid] of r.votes) {
      if (winners.has(aid)) {
        add(voter, 1);
        pickedWinner.push(voter);
      }
    }
    for (const [pid, pts] of Object.entries(points)) {
      const p = this.player(pid);
      if (p) p.score += pts;
    }
    rows.sort((a, b) => b.votes - a.votes || a.at - b.at);
    r.results = { rows, pickedWinner, noVote: !votingHappened, lettersCount: n };
    this.lastPoints = points;
    const last = this.roundIndex + 1 >= this.settings.rounds;
    this.setPhase('results', DUR.results, () => (last ? this.startBonus() : this.nextRound()));
  }

  // ---------- lightning round ----------
  standings() {
    return this.players
      .slice()
      .sort((a, b) => b.score - a.score || b.votesTotal - a.votesTotal || b.speedTotal - a.speedTotal);
  }

  startBonus() {
    const ranked = this.standings().filter((p) => p.connected);
    if (ranked.length < MIN_PLAYERS) {
      // Not enough people left for judges: highest score wins.
      this.champion = ranked[0] ? { id: ranked[0].id, noBonus: true } : null;
      this.setPhase('gameover', null);
      return;
    }
    const finalists = [ranked[0].id, ranked[1].id];
    this.bonus = {
      finalists,
      index: -1,
      acros: BONUS_LENGTHS.map((len) => ({
        letters: generateLetters(len, this.mode, this.usedSets),
        entries: {},
        order: shuffle(finalists), // order[0] is "A", order[1] is "B"
        result: null,
      })),
      votes: new Map(), // judgeId -> { [pairIndex]: 'A' | 'B' }
      result: null,
    };
    this.holdForAnnouncer('bonus_intro', () => this.nextBonus());
  }

  isFinalist(pid) {
    return !!this.bonus && this.bonus.finalists.includes(pid);
  }

  judges() {
    return this.players.filter((p) => p.connected && p.active && !this.isFinalist(p.id));
  }

  nextBonus() {
    const b = this.bonus;
    b.index++;
    if (b.index >= b.acros.length) return this.startBonusVote();
    this.holdForAnnouncer('bonus_reveal', () => this.setPhase('bonus_answer', this.lightningMs(), () => this.nextBonus()));
  }

  submitBonus(playerId, text) {
    this.touch();
    if (this.phase !== 'bonus_answer') return { error: 'Entries are closed.' };
    if (!this.isFinalist(playerId)) return { error: 'Only the finalists answer in the lightning round.' };
    const acro = this.bonus.acros[this.bonus.index];
    const v = this.validate(text, acro.letters);
    if (v.error) return v;
    acro.entries[playerId] = { text: v.text, at: Date.now() - this.phaseStartedAt };
    this.onChange();
    this.checkEarlyEnd();
    return { ok: true };
  }

  votablePairs() {
    return this.bonus.acros.map((a, i) => (Object.keys(a.entries).length === 2 ? i : -1)).filter((i) => i >= 0);
  }

  startBonusVote() {
    if (this.votablePairs().length === 0 || this.judges().length === 0) return this.endBonusVote();
    this.setPhase('bonus_vote', DUR.bonusVote, () => this.endBonusVote());
  }

  castBonusVote(playerId, pair, label) {
    this.touch();
    if (this.phase !== 'bonus_vote') return { error: 'Voting is closed.' };
    const p = this.player(playerId);
    if (!p || this.isFinalist(playerId)) return { error: "Finalists can't vote." };
    if (!this.votablePairs().includes(Number(pair)) || !['A', 'B'].includes(label)) return { error: 'Invalid vote.' };
    const mine = this.bonus.votes.get(playerId) || {};
    mine[Number(pair)] = label;
    this.bonus.votes.set(playerId, mine);
    this.onChange();
    this.checkEarlyEnd();
    return { ok: true };
  }

  endBonusVote() {
    const b = this.bonus;
    const wins = { [b.finalists[0]]: 0, [b.finalists[1]]: 0 };
    b.acros.forEach((acro, i) => {
      const [aId, bId] = acro.order;
      const ea = acro.entries[aId];
      const eb = acro.entries[bId];
      const votes = { A: 0, B: 0 };
      for (const v of b.votes.values()) if (v[i]) votes[v[i]]++;
      let winner = null;
      let reason = '';
      if (ea && eb) {
        if (votes.A !== votes.B) {
          winner = votes.A > votes.B ? aId : bId;
          reason = 'votes';
        } else {
          winner = ea.at <= eb.at ? aId : bId;
          reason = 'speed';
        }
      } else if (ea || eb) {
        winner = ea ? aId : bId;
        reason = 'only';
      } else {
        reason = 'none';
      }
      if (winner) wins[winner]++;
      acro.result = { votes, winner, reason };
    });
    const [f1, f2] = b.finalists;
    let champ;
    if (wins[f1] !== wins[f2]) champ = wins[f1] > wins[f2] ? f1 : f2;
    else {
      const p1 = this.player(f1);
      const p2 = this.player(f2);
      champ = (p1 ? p1.score : -1) >= (p2 ? p2.score : -1) ? f1 : f2;
    }
    b.result = { wins };
    this.champion = { id: champ, wins };
    this.setPhase('bonus_results', DUR.bonusResults, () => this.setPhase('gameover', null));
  }

  // ---------- early endings ----------
  checkEarlyEnd() {
    if (this.paused) return;
    const ph = this.phase;
    if (ph === 'answer') {
      const present = this.present();
      if (present.length && present.every((p) => this.round.answers.has(p.id))) this.fire();
    } else if (ph === 'vote') {
      const present = this.present();
      if (present.length && present.every((p) => this.round.votes.has(p.id))) this.fire();
    } else if (ph === 'bonus_answer') {
      const acro = this.bonus.acros[this.bonus.index];
      const live = this.bonus.finalists.filter((id) => {
        const p = this.player(id);
        return p && p.connected;
      });
      if (live.every((id) => acro.entries[id])) this.fire();
    } else if (ph === 'bonus_vote') {
      const pairs = this.votablePairs();
      const judges = this.judges();
      if (judges.length && judges.every((j) => pairs.every((i) => (this.bonus.votes.get(j.id) || {})[i]))) this.fire();
    }
  }

  // ---------- views ----------
  base() {
    return {
      code: this.code,
      mode: this.mode,
      settings: this.settings,
      phase: this.phase,
      endsAt: this.endsAt,
      paused: this.paused,
      awaitingAnnouncer: !!this.awaitingAnnouncer,
      remaining: this.remaining,
      duration: this.duration,
      serverNow: Date.now(),
      roundIndex: this.roundIndex,
      totalRounds: this.settings.rounds,
      minPlayers: MIN_PLAYERS,
      lightningSecs: this.lightningSecs(),
      answerSecs: this.round ? this.answerSecs(this.round.letters.length) : null,
    };
  }

  publicPlayer(p) {
    return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.connected, active: p.active, delta: this.lastPoints[p.id] || 0 };
  }

  bonusPairsPublic(withAuthors) {
    const b = this.bonus;
    return b.acros.map((acro, i) => {
      const opt = (label, pid) => {
        const e = acro.entries[pid];
        const o = { label, text: e ? e.text : null };
        if (withAuthors) Object.assign(o, { pid, at: e ? e.at : null });
        return o;
      };
      const pair = { index: i, letters: acro.letters, options: [opt('A', acro.order[0]), opt('B', acro.order[1])], votable: Object.keys(acro.entries).length === 2 };
      if (withAuthors && acro.result) pair.result = acro.result;
      return pair;
    });
  }

  hostView() {
    const v = this.base();
    v.players = this.standings().map((p) => this.publicPlayer(p));
    v.joinOrder = this.players.map((p) => p.id);
    const r = this.round;
    if (r && ['reveal', 'answer', 'vote', 'results'].includes(this.phase)) {
      v.letters = r.letters;
      const present = this.present();
      if (this.phase === 'answer') {
        v.progress = { done: present.filter((p) => r.answers.has(p.id)).length, of: present.length };
      }
      if (this.phase === 'vote') {
        const byId = Object.fromEntries([...r.answers.values()].map((a) => [a.id, a]));
        v.options = r.tvOrder.map((id, i) => ({ n: i + 1, text: byId[id].text }));
        v.progress = { done: present.filter((p) => r.votes.has(p.id)).length, of: present.length };
      }
      if (this.phase === 'results') {
        v.results = {
          ...r.results,
          rows: r.results.rows.map((row) => {
            const p = this.player(row.pid);
            return { ...row, name: p ? p.name : 'Left the game', avatar: p ? p.avatar : '👋' };
          }),
          pickedWinner: r.results.pickedWinner.map((id) => (this.player(id) || {}).name).filter(Boolean),
        };
      }
    }
    if (this.bonus) {
      const b = this.bonus;
      v.bonus = {
        finalists: b.finalists.map((id) => {
          const p = this.player(id);
          return p ? this.publicPlayer(p) : { id, name: 'Left the game', avatar: '👋' };
        }),
        index: b.index,
      };
      if (['bonus_reveal', 'bonus_answer'].includes(this.phase)) {
        const acro = b.acros[b.index];
        v.letters = acro.letters;
        v.bonus.submitted = b.finalists.map((id) => !!acro.entries[id]);
      }
      if (this.phase === 'bonus_vote') {
        v.bonus.pairs = this.bonusPairsPublic(false);
        const judges = this.judges();
        const pairs = this.votablePairs();
        v.progress = { done: judges.filter((j) => pairs.every((i) => (b.votes.get(j.id) || {})[i])).length, of: judges.length };
      }
      if (this.phase === 'bonus_results' || this.phase === 'gameover') {
        v.bonus.pairs = this.bonusPairsPublic(true);
        v.bonus.result = b.result;
      }
    }
    if (this.champion) {
      const p = this.player(this.champion.id);
      v.champion = { ...this.champion, name: p ? p.name : 'Someone', avatar: p ? p.avatar : '🏆' };
    }
    return v;
  }

  playerView(pid) {
    const p = this.player(pid);
    if (!p) return { phase: 'removed', code: this.code };
    const v = this.base();
    const ranked = this.standings();
    v.me = { ...this.publicPlayer(p), rank: ranked.findIndex((x) => x.id === p.id) + 1, of: ranked.length };
    v.playerCount = this.players.length;
    const r = this.round;
    if (r && ['reveal', 'answer', 'vote', 'results'].includes(this.phase)) {
      v.letters = r.letters;
      const mine = r.answers.get(p.id);
      v.myAnswer = mine ? mine.text : null;
      if (this.phase === 'vote' && p.active) {
        const byId = Object.fromEntries([...r.answers.values()].map((a) => [a.id, a]));
        v.options = this.voteOrderFor(p.id).map((id) => ({ id, text: byId[id].text, mine: byId[id].pid === p.id }));
        v.myVote = r.votes.get(p.id) || null;
      }
      if (this.phase === 'results') {
        const row = r.results.rows.find((x) => x.pid === p.id);
        v.myResult = {
          votes: row ? row.votes : 0,
          points: this.lastPoints[p.id] || 0,
          winner: !!(row && row.winner),
          speed: !!(row && row.speed),
          forfeited: !!(row && row.forfeited),
          pickedWinner: r.results.pickedWinner.includes(p.id),
          answered: !!row,
        };
      }
    }
    if (this.bonus) {
      const b = this.bonus;
      v.bonus = {
        role: this.isFinalist(p.id) ? 'finalist' : 'judge',
        index: b.index,
        finalists: b.finalists.map((id) => {
          const f = this.player(id);
          return f ? { name: f.name, avatar: f.avatar } : { name: 'Left the game', avatar: '👋' };
        }),
      };
      if (['bonus_reveal', 'bonus_answer'].includes(this.phase)) {
        const acro = b.acros[b.index];
        v.letters = acro.letters;
        if (v.bonus.role === 'finalist') v.myAnswer = acro.entries[p.id] ? acro.entries[p.id].text : null;
      }
      if (this.phase === 'bonus_vote' && v.bonus.role === 'judge') {
        v.bonus.pairs = this.bonusPairsPublic(false);
        v.bonus.myVotes = b.votes.get(p.id) || {};
      }
    }
    if (this.champion && this.phase === 'gameover') {
      const c = this.player(this.champion.id);
      v.champion = { name: c ? c.name : 'Someone', avatar: c ? c.avatar : '🏆', isMe: this.champion.id === p.id };
    }
    return v;
  }

  destroy() {
    clearTimeout(this.timer);
    for (const p of this.players) clearTimeout(p.dropTimer);
  }
}

module.exports = { Room, AVATARS, MAIN_LENGTHS, BONUS_LENGTHS };
