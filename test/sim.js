// End-to-end test: starts the server with fast timers and plays complete games with bots.
// Run: npm test
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const BAD = { F: 'Fuck', S: 'Shit', B: 'Bitch', A: 'Ass', D: 'Dick', C: 'Crap', P: 'Piss', T: 'Tits', H: 'Hell' };
const WORDS = 'ooper'; // "Booper Cooper..." — harmless filler

const post = async (url, body) => {
  const r = await fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

function stream(params, onState) {
  const ctrl = new AbortController();
  (async () => {
    const r = await fetch(`${BASE}/events?${new URLSearchParams(params)}`, { signal: ctrl.signal });
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
        if (data) onState(JSON.parse(data));
      }
    }
  })().catch(() => {});
  return () => ctrl.abort();
}

const answerFor = (letters) => letters.map((l) => l + WORDS).join(' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function playGame({ mode, rounds, players: n, checks }) {
  const created = (await post('/api/create', { mode })).body;
  const code = created.code;
  assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  const log = { lengths: [], phases: new Set(), hostStates: [], champion: null, errors: [] };

  if (mode === 'adult') {
    const r = await post('/api/join', { code, name: 'Kid', ageOk: false });
    assert.strictEqual(r.status, 400, 'adult room must reject players who are not 18+');
  }
  if (mode === 'kid') {
    const r = await post('/api/join', { code, name: 'B1tch', ageOk: false });
    assert.strictEqual(r.status, 400, 'kid room must filter nicknames');
  }

  const bots = [];
  for (let i = 0; i < n; i++) {
    const j = await post('/api/join', { code, name: i === 1 ? 'Sam' : i === 2 ? 'sam' : `Bot${i}`, ageOk: true });
    assert.strictEqual(j.status, 200, JSON.stringify(j.body));
    bots.push({ i, token: j.body.token, id: j.body.playerId, name: j.body.name, acted: new Set() });
  }
  assert.strictEqual(bots[2].name, 'sam 2', 'duplicate nicknames get a number');

  let hostState = null;
  const closeHost = stream({ code, role: 'host', hostToken: created.hostToken }, (s) => {
    hostState = s;
    log.phases.add(s.phase);
    if (s.phase === 'vote') {
      assert(s.options.every((o) => !('pid' in o) && !('name' in o)), 'TV vote options must be anonymous');
    }
    if (s.phase === 'results' && !log.lengths[s.roundIndex]) log.lengths[s.roundIndex] = s.letters.length;
    if (s.phase === 'gameover') log.champion = s.champion;
  });

  const act = async (bot, s) => {
    const key = `${s.phase}|${s.roundIndex}|${s.bonus ? s.bonus.index : ''}`;
    if (bot.acted.has(key)) return;
    bot.acted.add(key);
    const call = (type, extra) => post('/api/play', { code, token: bot.token, type, ...extra });
    if (s.phase === 'answer') {
      if (bot.i === 0) {
        const bad = await call('answer', { text: 'nope' });
        assert.strictEqual(bad.status, 400, 'wrong letters must be rejected');
        const L = s.letters[0];
        if (mode === 'kid' && BAD[L]) {
          const r = await call('answer', { text: [BAD[L], ...s.letters.slice(1).map((l) => l + WORDS)].join(' ') });
          assert.strictEqual(r.status, 400, 'kid filter must block bad words');
          assert.strictEqual(r.body.badWord, 0);
          checks.filterHit = true;
        }
      }
      if (bot.i === n - 1 && s.roundIndex === 0) return; // one bot skips answering in round 1
      const r = await call('answer', { text: answerFor(s.letters) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    if (s.phase === 'vote' && s.options) {
      assert(s.options.every((o) => !('pid' in o)), 'phone vote options must be anonymous');
      const mine = s.options.find((o) => o.mine);
      if (mine) {
        const r = await call('vote', { answerId: mine.id });
        assert.strictEqual(r.status, 400, 'own vote must be rejected');
        checks.ownVoteBlocked = true;
      }
      if (bot.i === 1 && s.roundIndex === 1) return; // one bot skips voting in round 2
      const target = s.options.find((o) => !o.mine);
      const r = await call('vote', { answerId: target.id });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    if (s.phase === 'bonus_answer' && s.bonus.role === 'finalist') {
      const r = await call('bonusAnswer', { text: answerFor(s.letters) });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    }
    if (s.phase === 'bonus_reveal' && s.bonus.role === 'judge' && s.bonus.index === 0) {
      const r = await call('bonusVote', { pair: 0, label: 'A' });
      assert.strictEqual(r.status, 400, 'judges cannot vote before all entries are in');
      checks.earlyVoteBlocked = true;
    }
    if (s.phase === 'bonus_vote' && s.bonus.role === 'judge') {
      assert(s.bonus.pairs.every((p) => p.options.every((o) => !('pid' in o))), 'lightning pairs must be anonymous');
      for (const p of s.bonus.pairs.filter((x) => x.votable)) {
        const r = await call('bonusVote', { pair: p.index, label: bot.i % 2 ? 'A' : 'B' });
        assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      }
    }
    if (s.phase === 'bonus_vote' && s.bonus.role === 'finalist') {
      const r = await call('bonusVote', { pair: 0, label: 'A' });
      assert.strictEqual(r.status, 400, 'finalists cannot vote');
    }
  };

  const closers = bots.map((bot) => stream({ code, role: 'player', token: bot.token }, (s) => act(bot, s).catch((e) => log.errors.push(e))));
  await sleep(300);

  await post('/api/host', { code, hostToken: created.hostToken, type: 'settings', rounds });
  const st = await post('/api/host', { code, hostToken: created.hostToken, type: 'start' });
  assert.strictEqual(st.status, 200, JSON.stringify(st.body));

  const t0 = Date.now();
  while (!(hostState && hostState.phase === 'gameover') && Date.now() - t0 < 60000) await sleep(100);
  closers.forEach((c) => c());
  closeHost();
  if (log.errors.length) throw log.errors[0];
  assert.strictEqual(hostState.phase, 'gameover', 'game should finish');
  return { log, hostState };
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT, GAME_SPEED: '0.04' }, stdio: 'inherit' });
  await sleep(600);
  const checks = {};
  try {
    const a = await playGame({ mode: 'kid', rounds: 8, players: 5, checks });
    assert.deepStrictEqual(a.log.lengths, [3, 4, 5, 6, 7, 3, 4, 5], 'round lengths for 8 rounds');
    for (const ph of ['reveal', 'answer', 'vote', 'results', 'bonus_intro', 'bonus_reveal', 'bonus_answer', 'bonus_vote', 'bonus_results', 'gameover']) {
      assert(a.log.phases.has(ph), `phase ${ph} should happen`);
    }
    assert(a.log.champion && a.log.champion.name, 'a champion is crowned');
    const total = a.hostState.players.reduce((x, p) => x + p.score, 0);
    assert(total > 0, 'points were scored');
    assert.strictEqual(a.hostState.bonus.pairs.length, 3);
    assert(a.hostState.bonus.pairs.every((p) => p.result && p.result.winner), 'every lightning pair has a winner');
    console.log('✓ Kid game, 8 rounds, 5 players. Champion:', a.log.champion.name, '| scores:', a.hostState.players.map((p) => `${p.name} ${p.score}`).join(', '));

    const b = await playGame({ mode: 'adult', rounds: 5, players: 3, checks });
    assert.deepStrictEqual(b.log.lengths, [3, 4, 5, 6, 7]);
    console.log('✓ Adult game, 5 rounds, 3 players. Champion:', b.log.champion.name);

    assert(checks.ownVoteBlocked, 'own vote check ran');
    assert(checks.earlyVoteBlocked, 'early lightning vote check ran');
    console.log('✓ Own votes blocked, lightning voting waits for all entries, anonymity holds', checks.filterHit ? ', kid filter blocked a bad word' : '');
    console.log('\nAll tests passed.');
  } catch (e) {
    console.error('\nTEST FAILED:', e);
    process.exitCode = 1;
  } finally {
    server.kill();
  }
})();
