// Phone / player screen.
(function () {
  const app = document.getElementById('app');
  const top = document.getElementById('top');
  const { esc, tiles, timerHtml } = Acro;
  const AVATARS = ['🦊', '🐸', '🐙', '🦄', '🐼', '🐯', '🦖', '🐝', '🐧', '🦉', '🐵', '🐳'];
  let seat = Acro.store.get('acro-player'); // { code, token }
  let state = null;
  let renderedKey = null;
  let disconnect = null;

  Acro.startTicker(() => state);

  function play(type, extra = {}) {
    return Acro.post('/api/play', { code: seat.code, token: seat.token, type, ...extra });
  }

  // ---------- joining ----------
  function showCode(prefill = '', message = '') {
    state = null;
    renderedKey = null;
    top.innerHTML = '';
    app.innerHTML = `
      <div class="middle">
        <div class="bigicon">🎉</div>
        <h1>Join a game</h1>
        <p class="muted" style="margin:0">Enter the room code on the TV.</p>
      </div>
      <input class="field code-field" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="${esc(prefill)}">
      <div class="err center" id="msg">${esc(message)}</div>
      <button class="btn block" id="next">Next</button>`;
    const input = document.getElementById('code');
    const go = async () => {
      const code = input.value.toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length !== 4) return (document.getElementById('msg').textContent = 'Room codes have 4 letters.');
      try {
        const info = await Acro.post('/api/peek', { code });
        if (info.mode === 'adult') showAge(info);
        else showName(info, false);
      } catch (e) {
        document.getElementById('msg').textContent = e.message;
      }
    };
    document.getElementById('next').onclick = go;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go();
    });
    if (prefill.length === 4 && !message) go();
  }

  function showAge(info) {
    app.innerHTML = `
      <div class="middle">
        <div class="bigicon">🍸</div>
        <span class="badge adult">Adult game · Room ${info.code}</span>
        <h1>Are you 18 or older?</h1>
        <p class="muted" style="margin:0">This game has no word filter and may include adult humor.</p>
      </div>
      <button class="btn block" id="yes">I'm 18 or older</button>
      <button class="btn secondary block" id="no">I'm under 18</button>`;
    document.getElementById('yes').onclick = () => showName(info, true);
    document.getElementById('no').onclick = () => {
      app.innerHTML = `
        <div class="middle"><div class="bigicon">🙅</div><h1>This is an adult game</h1>
        <p class="muted">Ask the host to start a Kid-friendly game instead.</p></div>
        <button class="btn secondary block" id="back">Back</button>`;
      document.getElementById('back').onclick = () => showCode('');
    };
  }

  function showName(info, ageOk) {
    let avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const saved = Acro.store.get('acro-name') || {};
    if (saved.avatar) avatar = saved.avatar;
    app.innerHTML = `
      <div class="kicker">Room ${info.code} ${info.mode === 'kid' ? '<span class="badge kid">🧸 Kid-friendly</span>' : '<span class="badge adult">🍸 Adult</span>'}</div>
      <h1>What should we call you?</h1>
      <input class="field" id="name" maxlength="16" autocomplete="nickname" placeholder="Nickname" value="${esc(saved.name || '')}">
      <div class="muted">Pick an avatar</div>
      <div class="avatars">${AVATARS.map((a) => `<button data-a="${a}" class="${a === avatar ? 'on' : ''}">${a}</button>`).join('')}</div>
      <div class="err center" id="msg"></div>
      <button class="btn block" id="join">Join game</button>`;
    app.querySelectorAll('[data-a]').forEach((b) =>
      (b.onclick = () => {
        avatar = b.dataset.a;
        app.querySelectorAll('[data-a]').forEach((x) => x.classList.toggle('on', x === b));
      })
    );
    const join = async () => {
      const name = document.getElementById('name').value.trim();
      if (!name) return (document.getElementById('msg').textContent = 'Please enter a nickname.');
      try {
        const j = await Acro.post('/api/join', { code: info.code, name, avatar, ageOk });
        seat = { code: info.code, token: j.token };
        Acro.store.set('acro-player', seat);
        Acro.store.set('acro-name', { name, avatar });
        history.replaceState(null, '', '/play');
        connect();
      } catch (e) {
        document.getElementById('msg').textContent = e.message;
      }
    };
    document.getElementById('join').onclick = join;
    document.getElementById('name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
  }

  function connect() {
    if (disconnect) disconnect();
    app.innerHTML = '<div class="middle muted">Connecting…</div>';
    disconnect = Acro.connect({ code: seat.code, role: 'player', token: seat.token }, onState, (why) => {
      const code = seat.code;
      Acro.store.del('acro-player');
      seat = null;
      showCode(why === 'room' ? '' : code, why === 'room' ? 'That game has ended.' : 'Your seat expired. Join again.');
    });
  }

  // ---------- game screens ----------
  function onState(s) {
    if (s.phase === 'removed') {
      if (disconnect) disconnect();
      Acro.store.del('acro-player');
      const code = seat.code;
      seat = null;
      state = null;
      top.innerHTML = '';
      app.innerHTML = `<div class="middle"><div class="bigicon">👋</div><h1>You left the game</h1><p class="muted">The host removed you, or your seat expired.</p></div>
        <button class="btn block" id="rejoin">Join again</button>`;
      document.getElementById('rejoin').onclick = () => showCode(code);
      return;
    }
    state = s;
    document.getElementById('paused').classList.toggle('hidden', !s.paused);
    top.innerHTML = `<div class="me"><span class="avatar">${s.me.avatar}</span><span>${esc(s.me.name)}</span></div>
      <span class="badge ${s.mode}">${s.mode === 'kid' ? '🧸' : '18+'}</span><span class="score">${s.me.score} pts</span>
      <button class="mute" id="muteBtn" aria-label="Sound on or off">${Sound.settings.muted ? '🔇' : '🔊'}</button>`;
    document.getElementById('muteBtn').onclick = () => {
      Sound.set({ muted: !Sound.settings.muted });
      document.getElementById('muteBtn').textContent = Sound.settings.muted ? '🔇' : '🔊';
    };
    const waiting = !s.me.active && !['lobby', 'gameover'].includes(s.phase);
    const role = s.bonus ? s.bonus.role : '';
    const key = [s.phase, s.roundIndex, s.bonus ? s.bonus.index : '', waiting, role].join('|');
    if (key !== renderedKey) {
      renderedKey = key;
      app.innerHTML = waiting ? waitingScreen(s) : (screens[s.phase] || (() => ''))(s);
      wire(s);
    }
    update(s);
  }

  const roundLabel = (s) => `Round ${s.roundIndex + 1} of ${s.totalRounds}`;
  const tileClass = (letters) => (letters.length >= 6 ? 'phone-tiles long' : 'phone-tiles');

  function waitingScreen(s) {
    const msg = s.bonus ? "You'll play in the next game." : "You'll join at the start of the next round.";
    return `<div class="middle"><div class="bigicon">⏳</div><h1>Hang tight!</h1><p class="muted">${msg}</p></div>`;
  }

  function answerScreen(s, label) {
    return `
      <div class="row-between"><div class="kicker">${label}</div>${timerHtml(64, 6)}</div>
      ${tiles(s.letters, tileClass(s.letters) + ' live')}
      <input class="field" id="ans" maxlength="80" autocomplete="off" autocorrect="on" autocapitalize="words" enterkeyhint="send" placeholder="One word per letter" value="${esc(s.myAnswer || '')}">
      <div class="words" id="words"></div>
      <div id="hint" class="note"></div>
      <button class="btn block" id="submit" disabled>${s.myAnswer ? 'Update answer' : 'Submit'}</button>
      <div id="msg">${s.myAnswer ? '<div class="status">✓ Submitted! You can still change it until time runs out.</div>' : ''}</div>`;
  }

  const screens = {
    lobby: (s) => `
      <div class="middle">
        <div class="bigicon">${s.me.avatar}</div>
        <h1>You're in, ${esc(s.me.name)}!</h1>
        <p class="muted" id="lobbyInfo"></p>
      </div>
      <p class="note center">Keep this screen open. If your phone locks, just come back to this page.</p>`,

    reveal: (s) => `
      <div class="middle">
        <div class="kicker">${roundLabel(s)}</div>
        <h1>Get ready!</h1>
        ${tiles(s.letters, tileClass(s.letters) + ' drop')}
      </div>`,

    answer: (s) => answerScreen(s, roundLabel(s)),

    vote: (s) => `
      <div class="row-between"><div class="kicker">Vote for your favorite</div>${timerHtml(64, 6)}</div>
      ${tiles(s.letters, 'phone-tiles long')}
      <div class="opts" id="opts"></div>
      <div class="note center">You can change your vote until time runs out.</div>`,

    results: (s) => {
      const r = s.myResult || {};
      const badges = [
        r.winner && '<span class="badge win">🏆 Round winner</span>',
        r.speed && '<span class="badge speed">⚡ Fastest</span>',
        r.pickedWinner && '<span class="badge">🎯 Picked the winner</span>',
        r.forfeited && `<span class="badge warn">You didn't vote, so your votes didn't count</span>`,
      ].filter(Boolean).join('');
      return `
        <div class="middle">
          <div class="kicker">${roundLabel(s)} · Results</div>
          ${r.answered ? `<h1>You got ${r.votes} vote${r.votes === 1 ? '' : 's'}</h1>` : '<h1>No answer this round</h1>'}
          <div class="pts">+${r.points || 0}</div>
          <div class="badges">${badges}</div>
          <p class="muted">You're #${s.me.rank} of ${s.me.of} with ${s.me.score} points.</p>
        </div>
        <p class="note center">👀 Check the TV for everyone's answers.</p>`;
    },

    bonus_intro: (s) => {
      const [a, b] = s.bonus.finalists;
      const secs = s.lightningSecs;
      return s.bonus.role === 'finalist'
        ? `<div class="middle"><div class="bigicon">⚡</div><h1>You're in the lightning round!</h1>
           <p class="muted">${a.avatar} ${esc(a.name)} vs ${b.avatar} ${esc(b.name)}<br>3 acronyms, ${secs} seconds each. Think fast!</p></div>`
        : `<div class="middle"><div class="bigicon">⚖️</div><h1>You're a judge!</h1>
           <p class="muted">${a.avatar} ${esc(a.name)} vs ${b.avatar} ${esc(b.name)}<br>You'll vote once all 3 entries are in.</p></div>`;
    },

    bonus_reveal: (s) => `
      <div class="middle">
        <div class="kicker">⚡ Lightning ${s.bonus.index + 1} of 3</div>
        <h1>${s.bonus.role === 'finalist' ? 'Get ready!' : 'Finalists are up'}</h1>
        ${tiles(s.letters, 'phone-tiles drop')}
      </div>`,

    bonus_answer: (s) =>
      s.bonus.role === 'finalist'
        ? answerScreen(s, `⚡ Lightning ${s.bonus.index + 1} of 3`)
        : `<div class="middle"><div class="bigicon">⌛</div><h1>Waiting for the finalists…</h1>
           <p class="muted">Entry ${s.bonus.index + 1} of 3. Voting opens after all 3 entries are in.</p></div>`,

    bonus_vote: (s) =>
      s.bonus.role === 'judge'
        ? `<div class="row-between"><div class="kicker">⚡ Pick A or B for each</div>${timerHtml(64, 6)}</div><div id="pairs" style="display:grid;gap:18px"></div>`
        : `<div class="middle"><div class="bigicon">🤞</div><h1>The judges are voting…</h1><p class="muted">Watch the TV for the results.</p></div>`,

    bonus_results: () => `<div class="middle"><div class="bigicon">📺</div><h1>Watch the TV!</h1><p class="muted">The lightning round results are coming in…</p></div>`,

    gameover: (s) => {
      const c = s.champion;
      return `
        <div class="middle">
          <div class="bigicon">${c && c.isMe ? '🏆' : c ? c.avatar : '🎉'}</div>
          <h1>${c ? (c.isMe ? 'You won!' : `${esc(c.name)} wins!`) : 'Game over'}</h1>
          <p class="muted">You finished #${s.me.rank} of ${s.me.of} with ${s.me.score} points.</p>
        </div>
        <p class="note center">Waiting for the host to start another game…</p>`;
    },
  };

  function wire(s) {
    const ans = document.getElementById('ans');
    if (ans) wireAnswer(s, ans);
  }

  function wireAnswer(s, ans) {
    const letters = s.letters;
    const isBonus = s.phase === 'bonus_answer';
    const btn = document.getElementById('submit');
    const msg = document.getElementById('msg');
    let badWord = null;
    const refresh = () => {
      if (!document.body.contains(ans)) return; // the screen moved on
      const c = AcroRules.checkLetters(ans.value, letters);
      document.querySelectorAll('.tiles.live .tile').forEach((t, i) => {
        t.classList.toggle('ok', c.perLetter[i]);
        t.classList.toggle('dim', !c.perLetter[i]);
      });
      document.getElementById('words').innerHTML = c.words
        .map((w, i) => `<span class="${i === badWord ? 'badword' : !c.perLetter[i] ? 'off' : ''}">${esc(w)}</span>`)
        .join('');
      const hint = document.getElementById('hint');
      if (c.tooLong) hint.textContent = 'Too long: 80 characters max.';
      else if (c.tooMany) hint.textContent = `Too many words: use exactly ${letters.length}.`;
      else if (!c.ok && c.words.length) {
        const wrong = c.perLetter.findIndex((ok, i) => !ok && c.words[i]);
        hint.textContent = wrong >= 0 ? `Word ${wrong + 1} should start with ${letters[wrong]}.` : `${letters.length - c.words.length} more word${letters.length - c.words.length === 1 ? '' : 's'} to go.`;
      } else hint.textContent = c.ok ? 'Looks good!' : '';
      btn.disabled = !c.ok;
    };
    const submit = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await play(isBonus ? 'bonusAnswer' : 'answer', { text: ans.value });
        badWord = null;
        msg.innerHTML = '<div class="status">✓ Submitted! You can still change it until time runs out.</div>';
        Sound.play('ding');
        btn.textContent = 'Update answer';
      } catch (e) {
        badWord = typeof e.badWord === 'number' && e.badWord >= 0 ? e.badWord : null;
        msg.innerHTML = `<div class="err">${esc(e.message)}</div>`;
        Sound.play('blip');
      }
      refresh();
    };
    ans.addEventListener('input', () => {
      badWord = null;
      refresh();
    });
    ans.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    btn.onclick = submit;
    refresh();
    if (!s.myAnswer) setTimeout(() => ans.focus(), 50);
  }

  function update(s) {
    const li = document.getElementById('lobbyInfo');
    if (li) li.textContent = `${s.playerCount} player${s.playerCount === 1 ? '' : 's'} in the room. Waiting for the host to start…`;

    const opts = document.getElementById('opts');
    if (opts && s.options) {
      opts.innerHTML = s.options
        .map((o) => `<button class="opt ${o.mine ? 'mine' : ''} ${s.myVote === o.id ? 'on' : ''}" data-id="${o.id}" ${o.mine ? 'disabled' : ''}>
          ${esc(o.text)}${o.mine ? '<span class="tag">Yours: you can\'t vote for it</span>' : s.myVote === o.id ? '<span class="tag">✓ Your vote</span>' : ''}</button>`)
        .join('');
      opts.querySelectorAll('[data-id]:not([disabled])').forEach((b) => (b.onclick = () => {
        Sound.play('blip');
        play('vote', { answerId: b.dataset.id }).catch(() => {});
      }));
    }

    const pairs = document.getElementById('pairs');
    if (pairs && s.bonus && s.bonus.pairs) {
      const mine = s.bonus.myVotes || {};
      pairs.innerHTML = s.bonus.pairs
        .map((p) => `<div class="pair">${tiles(p.letters, 'phone-tiles long')}
          ${p.votable
            ? `<div class="ab">${p.options.map((o) => `<button class="opt ${mine[p.index] === o.label ? 'on' : ''}" data-pair="${p.index}" data-label="${o.label}"><b>${o.label}</b> · ${esc(o.text)}</button>`).join('')}</div>`
            : '<div class="note">Only one finalist answered this one, so no vote is needed.</div>'}</div>`)
        .join('');
      pairs.querySelectorAll('[data-pair]').forEach((b) => (b.onclick = () => {
        Sound.play('blip');
        play('bonusVote', { pair: Number(b.dataset.pair), label: b.dataset.label }).catch(() => {});
      }));
    }
  }

  // Last 5 seconds to answer: a soft tick and a little buzz on the phone.
  let lastSec = null;
  setInterval(() => {
    const s = state;
    const answering = s && !s.paused && (s.phase === 'answer' || (s.phase === 'bonus_answer' && s.bonus && s.bonus.role === 'finalist'));
    if (!answering) return (lastSec = null);
    const ms = Acro.remainingMs(s);
    if (ms == null) return;
    const sec = Math.ceil(ms / 1000);
    if (sec !== lastSec && lastSec !== null && sec > 0 && sec <= 5 && !s.myAnswer) {
      Sound.play('tick', true);
      if (navigator.vibrate && !Sound.settings.muted) navigator.vibrate(25);
    }
    lastSec = sec;
  }, 100);

  // ---------- start ----------
  const roomParam = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (seat && (!roomParam || roomParam === seat.code)) connect();
  else showCode(roomParam);
})();
