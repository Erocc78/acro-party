// TV / host screen.
(function () {
  const app = document.getElementById('app');
  const { esc, tiles, timerHtml } = Acro;
  let session = Acro.store.get('acro-host'); // { code, hostToken }
  let state = null;
  let renderedKey = null;
  let disconnect = null;
  let joinBase = location.origin;

  Acro.startTicker(() => state);

  // Phones can't reach "localhost", so point the QR code at this computer's network address.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    fetch('/api/info').then((r) => r.json()).then((j) => {
      joinBase = j.lanUrl;
      if (state && state.phase === 'lobby') drawJoin(state);
    }).catch(() => {});
  }

  function host(type, extra = {}) {
    return Acro.post('/api/host', { code: session.code, hostToken: session.hostToken, type, ...extra }).catch((e) => alertBar(e.message));
  }

  function alertBar(msg) {
    const el = document.getElementById('flash');
    if (el) {
      el.textContent = msg;
      setTimeout(() => (el.textContent = ''), 4000);
    }
  }

  // ---------- start: choose a mode ----------
  function showModePicker() {
    state = null;
    renderedKey = null;
    document.getElementById('modeBadge').innerHTML = '';
    document.getElementById('roomcode').innerHTML = '';
    document.getElementById('controls').innerHTML = '';
    app.innerHTML = `
      <div class="stage">
        <div class="kicker">New game</div>
        <h2>Who's playing tonight?</h2>
      </div>
      <div class="modes">
        <button class="card mode" data-mode="kid">
          <b>🧸 Kid-friendly</b>
          <span class="muted">Family game night</span>
          <ul><li>Naughty word filter always on</li><li>No rude letter combos</li><li>+10 s kids' extra time every round</li></ul>
        </button>
        <button class="card mode" data-mode="adult">
          <b>🍸 Adult</b>
          <span class="muted">18+ only</span>
          <ul><li>No word filter</li><li>Players confirm they're 18 or older</li><li>20 to 40 s to answer, by number of letters</li></ul>
        </button>
      </div>
      <p class="err center" id="modeErr"></p>`;
    app.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', async () => {
        let j;
        try {
          b.disabled = true;
          j = await Acro.post('/api/create', { mode: b.dataset.mode });
        } catch (e) {
          b.disabled = false;
          app.querySelector('#modeErr').textContent = `Couldn't create a room: ${e.message} Check your connection and try again.`;
          return;
        }
        app.innerHTML = '<div class="stage"><div class="kicker">Setting up your room…</div></div>';
        session = { code: j.code, hostToken: j.hostToken };
        Acro.store.set('acro-host', session);
        connect();
      })
    );
  }

  function connect() {
    if (disconnect) disconnect();
    disconnect = Acro.connect({ code: session.code, role: 'host', hostToken: session.hostToken }, onState, () => {
      Acro.store.del('acro-host');
      session = null;
      showModePicker();
    });
  }

  function onState(s) {
    state = s;
    document.getElementById('paused').classList.toggle('hidden', !s.paused);
    document.getElementById('modeBadge').innerHTML = s.mode === 'kid' ? '<span class="badge kid">🧸 Kid-friendly</span>' : '<span class="badge adult">🍸 Adult · 18+</span>';
    document.getElementById('roomcode').innerHTML = s.phase === 'lobby' ? '' : `Room <b>${s.code}</b>`;
    drawControls(s);
    if (window.Soundtrack) Soundtrack.onState(s);
    if (window.Announcer) Announcer.onState(s);
    const key = [s.phase, s.roundIndex, s.bonus ? s.bonus.index : ''].join('|');
    if (key !== renderedKey) {
      renderedKey = key;
      render(s);
    }
    update(s);
  }

  function drawControls(s) {
    const el = document.getElementById('controls');
    const running = !['lobby', 'gameover'].includes(s.phase);
    el.innerHTML = `
      ${running ? `<button class="btn ghost" id="pauseBtn">${s.paused ? '▶ Resume' : '⏸ Pause'}</button>
      <button class="btn ghost" id="skipBtn">⏭ Skip</button>` : ''}
      ${window.Soundtrack ? Soundtrack.muteButtonHtml() : ''}
      <button class="btn ghost" id="newBtn">New game</button>`;
    if (window.Soundtrack) Soundtrack.wireMute();
    const p = document.getElementById('pauseBtn');
    if (p) p.onclick = () => host(s.paused ? 'resume' : 'pause');
    const k = document.getElementById('skipBtn');
    if (k) k.onclick = () => host('skip');
    document.getElementById('newBtn').onclick = () => {
      if (running && !confirmInline()) return;
      if (disconnect) disconnect();
      Acro.store.del('acro-host');
      session = null;
      showModePicker();
    };
  }

  // Two clicks within 3 seconds to abandon a running game (no browser dialogs on a TV).
  let armed = 0;
  function confirmInline() {
    if (Date.now() - armed < 3000) return true;
    armed = Date.now();
    document.getElementById('newBtn').textContent = 'Click again to end';
    return false;
  }

  function roundLabel(s) {
    return `Round ${s.roundIndex + 1} of ${s.totalRounds}`;
  }

  function scoreboard(players, showDelta) {
    return `<div class="card board">${players
      .map(
        (p, i) => `<div class="line"><span class="rank">${i + 1}</span><span class="avatar">${p.avatar}</span>
        <span class="nm">${esc(p.name)}</span>${showDelta && p.delta ? `<span class="delta">+${p.delta}</span>` : ''}<span class="pts">${p.score}</span></div>`
      )
      .join('')}</div>`;
  }

  // ---------- full renders (when the phase changes) ----------
  function render(s) {
    const r = renderers[s.phase];
    app.innerHTML = r ? r(s) : '';
    if (s.phase === 'lobby') wireLobby(s);
    if (s.phase === 'gameover') wireGameover();
  }

  const renderers = {
    lobby: (s) => `
      <div class="lobby">
        <div class="card join">
          <div class="kicker">Join on your phone</div>
          <div id="joinUrl" class="url"></div>
          <div class="muted">Room code</div>
          ${tiles(s.code.split(''), 'code-tiles')}
          <div id="qr"></div>
          ${s.mode === 'adult' ? '<span class="badge adult">Adult game: 18+ only</span>' : ''}
        </div>
        <div>
          <h2>Players <span class="muted" id="pcount"></span></h2>
          <div class="players" id="players"></div>
          <div class="card settings">
            <div class="setting"><span>Rounds</span><div class="seg" id="segRounds">${[5, 6, 7, 8].map((n) => `<button data-v="${n}">${n}</button>`).join('')}</div></div>
            <div class="setting"><span>Kids' extra time</span><div class="seg" id="segTime">${[[0, 'Off'], [10, '+10 s'], [20, '+20 s']].map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('')}</div></div>
            <div class="muted" id="timeNote" style="font-size:17px"></div>
            <details class="more"><summary>🔊 Sound and announcer</summary><div class="settings" style="margin-top:14px">
            ${window.Announcer ? Announcer.settingsHtml() : ''}
            ${window.Soundtrack ? Soundtrack.settingsHtml() : ''}
            </div></details>
          </div>
          <button class="btn block" id="startBtn" style="min-height:68px;font-size:26px">Start game</button>
          <div class="err center" id="flash" style="margin-top:10px"></div>
        </div>
      </div>`,

    reveal: (s) => `
      <div class="stage">
        <div class="kicker">${roundLabel(s)}</div>
        <h2>${s.letters.length} letters</h2>
        ${tiles(s.letters, 'drop big-tiles')}
        <div class="muted">Get your phones ready…</div>
      </div>`,

    answer: (s) => `
      <div class="stage">
        <div class="toprow"><div class="kicker">${roundLabel(s)}</div>${timerHtml(150, 12)}</div>
        ${tiles(s.letters, 'big-tiles')}
        <div class="progress" id="progress"></div>
        <div class="muted">Type your answer on your phone</div>
      </div>`,

    vote: (s) => `
      <div class="stage">
        <div class="toprow">${tiles(s.letters, 'sm-tiles')}<h2 style="margin:0">Vote for your favorite!</h2>${timerHtml(130, 11)}</div>
        <div class="options">${s.options.map((o, i) => `<div class="card option" style="animation-delay:${i * 0.08}s"><span class="n">${o.n}</span><span>${esc(o.text)}</span></div>`).join('')}</div>
        <div class="progress" id="progress"></div>
      </div>`,

    results: (s) => {
      const res = s.results;
      const rows = res.rows.length
        ? res.rows
            .map(
              (r, i) => `<div class="card row ${r.winner ? 'winner' : ''}" style="animation-delay:${i * 0.15}s">
            <div class="txt">${esc(r.text)}</div>
            <div class="votes">${r.votes}<small>vote${r.votes === 1 ? '' : 's'}</small></div>
            <div class="by"><span class="avatar">${r.avatar}</span>${esc(r.name)}
              ${r.winner ? `<span class="badge win">🏆 Round winner +${res.lettersCount}</span>` : ''}
              ${r.speed ? '<span class="badge speed">⚡ Fastest +1</span>' : ''}
              ${r.forfeited ? `<span class="badge warn">Didn't vote: votes don't count</span>` : ''}</div>
          </div>`
            )
            .join('')
        : '<div class="card muted">Nobody answered this round.</div>';
      return `
        <div class="stage">
          <div class="toprow"><div class="kicker">${roundLabel(s)} · Results</div>${tiles(s.letters, 'sm-tiles')}${timerHtml(90, 8)}</div>
          ${res.noVote && res.rows.length ? '<div class="muted">Not enough answers to vote this round.</div>' : ''}
          <div class="results">
            <div>${rows}
              ${res.pickedWinner.length ? `<p class="muted">Picked the winner (+1): ${res.pickedWinner.map(esc).join(', ')}</p>` : ''}</div>
            <div><h2>Scores</h2>${scoreboard(s.players, true)}</div>
          </div>
        </div>`;
    },

    bonus_intro: (s) => {
      const [a, b] = s.bonus.finalists;
      return `
        <div class="stage">
          <div class="kicker">⚡ Lightning round</div>
          <div class="vs"><div class="who"><span class="avatar">${a.avatar}</span>${esc(a.name)}</div><span class="mid">VS</span><div class="who"><span class="avatar">${b.avatar}</span>${esc(b.name)}</div></div>
          <div class="muted" style="font-size:28px">3 acronyms back to back, ${s.lightningSecs} seconds each.<br>Everyone else judges once all 3 entries are in.</div>
        </div>`;
    },

    bonus_reveal: (s) => `
      <div class="stage">
        <div class="kicker">⚡ Lightning ${s.bonus.index + 1} of 3</div>
        ${tiles(s.letters, 'drop big-tiles')}
        <div class="muted">Finalists, get ready…</div>
      </div>`,

    bonus_answer: (s) => `
      <div class="stage">
        <div class="toprow"><div class="kicker">⚡ Lightning ${s.bonus.index + 1} of 3</div>${timerHtml(150, 12)}</div>
        ${tiles(s.letters, 'big-tiles')}
        <div class="fin-status" id="finStatus"></div>
        <div class="muted">Entries stay hidden until voting.</div>
      </div>`,

    bonus_vote: (s) => `
      <div class="stage">
        <div class="toprow"><div class="kicker">⚡ Judges, vote on your phones!</div>${timerHtml(130, 11)}</div>
        <div class="pairs">${s.bonus.pairs
          .map(
            (p) => `<div class="card pair">${tiles(p.letters, 'sm-tiles')}
            ${p.options.map((o) => `<div class="opt"><span class="lbl">${o.label}</span>${o.text ? esc(o.text) : '<span class="muted">No entry</span>'}</div>`).join('')}</div>`
          )
          .join('')}</div>
        <div class="progress" id="progress"></div>
      </div>`,

    bonus_results: (s) => {
      const names = Object.fromEntries(s.bonus.finalists.map((f) => [f.id, f]));
      const pairs = s.bonus.pairs
        .map((p, i) => {
          const res = p.result;
          const why = { votes: '', speed: 'Tied votes: won on speed ⚡', only: 'Only entry', none: 'No entries' }[res.reason];
          return `<div class="card pair reveal" style="animation-delay:${i * 3.5}s">${tiles(p.letters, 'sm-tiles')}
            ${p.options
              .map((o) => {
                const f = names[o.pid] || { name: '?', avatar: '' };
                return `<div class="opt ${res.winner === o.pid ? 'won' : ''}"><span class="lbl">${o.label} · ${f.avatar} ${esc(f.name)}</span>
                ${o.text ? esc(o.text) : '<span class="muted">No entry</span>'}
                <span class="meta">${res.votes[o.label]} vote${res.votes[o.label] === 1 ? '' : 's'}${o.at != null ? ` · ${(o.at / 1000).toFixed(1)} s` : ''}</span></div>`;
              })
              .join('')}
            ${why ? `<div class="muted" style="font-size:18px">${why}</div>` : ''}</div>`;
        })
        .join('');
      return `
        <div class="stage">
          <div class="kicker">⚡ Lightning round results</div>
          <div class="pairs">${pairs}</div>
          <div class="champ reveal" style="animation-delay:11s"><div class="avatar">${s.champion.avatar}</div><div class="title">${esc(s.champion.name)} wins!</div></div>
        </div>`;
    },

    gameover: (s) => {
      const c = s.champion;
      return `
        <div class="stage">
          ${c ? `<div class="champ"><div class="kicker">🏆 Champion</div><div class="avatar">${c.avatar}</div><div class="title">${esc(c.name)}</div>
            ${c.forfeit ? '<div class="muted">Won by forfeit</div>' : ''}${c.noBonus ? '<div class="muted">Not enough players left for a lightning round</div>' : ''}</div>` : ''}
          <div style="width:min(640px,100%);text-align:left"><h2>Final scores</h2>${scoreboard(s.players, false)}</div>
          <div class="actions"><button class="btn" id="againBtn">Play again</button></div>
          <div class="err" id="flash"></div>
        </div>`;
    },
  };

  // ---------- partial updates (same phase) ----------
  function update(s) {
    if (s.phase === 'lobby') return updateLobby(s);
    const prog = document.getElementById('progress');
    if (prog && s.progress) {
      const verb = s.phase === 'answer' ? 'answers in' : 'voted';
      prog.innerHTML = `<b>${s.progress.done}</b> of <b>${s.progress.of}</b> ${verb}`;
    }
    const fin = document.getElementById('finStatus');
    if (fin && s.bonus && s.bonus.submitted) {
      fin.innerHTML = s.bonus.finalists
        .map((f, i) => `<div class="card"><span class="avatar">${f.avatar}</span>${esc(f.name)}<span class="${s.bonus.submitted[i] ? 'done' : 'muted'}">${s.bonus.submitted[i] ? '✓ In' : 'typing…'}</span></div>`)
        .join('');
    }
  }

  function wireLobby(s) {
    document.getElementById('startBtn').onclick = () => host('start');
    document.querySelectorAll('#segRounds button').forEach((b) => (b.onclick = () => host('settings', { rounds: Number(b.dataset.v) })));
    document.querySelectorAll('#segTime button').forEach((b) => (b.onclick = () => host('settings', { extraTime: Number(b.dataset.v) })));
    drawJoin(s);
    if (window.Announcer) Announcer.wireSettings();
    if (window.Soundtrack) Soundtrack.wireSettings();
    updateLobby(s);
  }

  function drawJoin(s) {
    const url = `${joinBase}/play?room=${s.code}`;
    const u = document.getElementById('joinUrl');
    if (!u) return;
    u.textContent = `${joinBase.replace(/^https?:\/\//, '')}/play`;
    const qr = document.getElementById('qr');
    qr.innerHTML = '';
    if (window.QRCode) new QRCode(qr, { text: url, width: 220, height: 220, colorDark: '#14122b', colorLight: '#ffffff' });
    else qr.classList.add('hidden');
  }

  function updateLobby(s) {
    const players = s.joinOrder.map((id) => s.players.find((p) => p.id === id)).filter(Boolean);
    document.getElementById('pcount').textContent = `${players.length} / 10`;
    const slots = Math.max(0, s.minPlayers - players.length);
    document.getElementById('players').innerHTML =
      players
        .map((p) => `<div class="chip ${p.connected ? '' : 'off'}"><span class="avatar">${p.avatar}</span><span class="name">${esc(p.name)}</span><button class="x" title="Remove" data-kick="${p.id}">×</button></div>`)
        .join('') + Array.from({ length: slots }, () => '<div class="slot"></div>').join('');
    document.querySelectorAll('[data-kick]').forEach((b) => (b.onclick = () => host('kick', { playerId: b.dataset.kick })));
    document.querySelectorAll('#segRounds button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === s.settings.rounds));
    document.querySelectorAll('#segTime button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === s.settings.extraTime));
    document.getElementById('timeNote').textContent =
      `Answer timers: ${[3, 4, 5, 6, 7].map((n) => `${20 + 5 * (n - 3) + s.settings.extraTime} s`).join(', ')} for 3 to 7 letters. Lightning round: ${s.lightningSecs} s per entry.`;
    const ready = players.filter((p) => p.connected).length;
    const btn = document.getElementById('startBtn');
    btn.disabled = ready < s.minPlayers;
    btn.textContent = ready < s.minPlayers ? `Waiting for ${s.minPlayers - ready} more player${s.minPlayers - ready === 1 ? '' : 's'}…` : `Start game · ${ready} players`;
  }

  function wireGameover() {
    document.getElementById('againBtn').onclick = () => host('playAgain');
  }

  if (session) connect();
  else showModePicker();
})();
