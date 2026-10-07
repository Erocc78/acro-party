// Ace, the game show announcer. Runs on the TV screen only.
// Speaks with the browser's built-in voices (Web Speech API) and shows captions in a speech bubble.
// Settings (Voice / Captions only / Off, and which voice) are saved on this TV in localStorage.
(function () {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  const spell = (letters) => letters.join(', ');
  const listNames = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  // ---------- the script ----------
  // Each entry: array of variants. "kid" and "adult" override "any" when present.
  const LINES = {
    welcome: {
      kid: ["Welcome to Acro Party! I'm Ace, your host. Grab your phones and join with the code on the screen!", "Hello, hello, hello! I'm Ace, and this is Acro Party! Scan the code to join the fun!"],
      adult: ["Good evening, and welcome to Acro Party! I'm Ace, your host for tonight. Phones out, and join with the code on screen.", "Welcome, welcome! I'm Ace, and this is Acro Party, the only game show where bad ideas score points. Join with the code on screen."],
    },
    join: { any: ['Welcome, {name}!', 'Give it up for {name}!', '{name} has entered the building!', "Look who's here, it's {name}!", 'Say hello to {name}!', '{name} is in the house!'] },
    ready: { any: ["We've got enough players! Host, press start whenever you're ready.", 'That makes {count}! We can start whenever you like.'] },
    firstRound: {
      kid: ["Let's play! Make up a phrase where each word starts with the letters on screen. Then vote for your favorite. Round one: {count} letters. {spelled}!"],
      adult: ["Let's get this party started! Make up a phrase that fits the letters, then vote for the best one. Round one: {count} letters. {spelled}!"],
    },
    round: { any: ['Round {n}! {count} letters. {spelled}!', 'Here comes round {n}. Your letters are... {spelled}!', 'Round {n}, {count} letters: {spelled}. Make it count!'] },
    backToShort: { any: ['Round {n}! We go back to {count} letters. {spelled}!'] },
    lastRound: { any: ['Final round before the lightning round! {count} letters. {spelled}!', 'This is it, the last regular round! {spelled}!'] },
    go: { any: ['{secs} seconds. Go!', 'Clock is running. Go!', "{secs} seconds on the clock. Let's go!"] },
    tenLeft: { any: ['Ten seconds!', 'Ten seconds left!', 'Hurry, ten seconds!', 'Tick tock, ten seconds!'] },
    vote: {
      kid: ["Pencils down! Time to vote. Pick your favorite, but not your own!", "Let's see what you came up with! Vote for the best one."],
      adult: ["Pencils down! Time to vote, and no, you can't vote for yourself.", "Let's see what your twisted minds came up with. Vote for your favorite!"],
    },
    readOption: { any: ['Number {n}: {text}.'] },
    winner: { any: ['And the winner of this round is... {name}! "{text}"', 'Taking the round... {name}! "{text}"', 'The crowd has spoken! {name} wins with "{text}"'] },
    tie: { any: ["It's a tie! {names} split the round!", 'We have a tie between {names}!'] },
    noVotes: { any: ['Nobody voted? Tough crowd!'] },
    noVote: { any: ['Not enough answers to vote on that one. Come on, people!'] },
    nobody: { any: ['Nobody answered! Is this thing on?'] },
    fastest: { any: ['{name} was fastest on the buzzer.', 'Speed bonus goes to {name}!'] },
    leader: { any: ['{name} leads with {score} points.', '{name} is out in front with {score}!', 'At the top of the board: {name}, with {score}.'] },
    lightningIntro: {
      kid: ["It's time for... the lightning round! {a} versus {b}! Three acronyms, {secs} seconds each. Everyone else, you're the judges!"],
      adult: ["Ladies and gentlemen, it's time for the lightning round! {a} versus {b}! Three acronyms, {secs} seconds each. Everyone else, you're the judges."],
    },
    lightning: { any: ['Lightning {n}: {spelled}!', 'Lightning round {n}. {spelled}. Go!'] },
    fiveLeft: { any: ['Five seconds!', 'Five!'] },
    lightningVote: { any: ['Judges, it\'s in your hands. Pick A or B for all three!', 'All entries are in. Judges, vote now!'] },
    pairWin: { any: ['Round {n} goes to {name}!', '{name} takes round {n}!'] },
    pairSpeed: { any: ['Round {n}: a tie, but {name} was faster!'] },
    pairOnly: { any: ['Round {n} goes to {name}, the only one to beat the clock!'] },
    champion: { any: ['Your Acro Party champion is... {name}!', 'And the champion of Acro Party is... {name}! Take a bow!'] },
    forfeit: { any: ['{name} wins by forfeit! Champion!'] },
    thanks: { any: ['Thanks for playing Acro Party! Want to go again?', "That's our show! Hit play again for another round."] },
    pause: { any: ["We'll be right back after these messages!", 'Time out!'] },
    resume: { any: ["And we're back!", "Let's pick up where we left off!"] },
  };

  function line(key, mode, vars = {}) {
    const set = LINES[key];
    const variants = set[mode] || set.any;
    return fill(pick(variants), vars);
  }

  // ---------- settings ----------
  const KEY = 'acro-announcer';
  const settings = Object.assign({ mode: 'voice', voice: '' }, Acro.store.get(KEY) || {});
  const save = () => Acro.store.set(KEY, settings);
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

  function voices() {
    return synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
  }
  // Ace has a deep game-show voice: prefer male voices, then lower the pitch.
  const MALE = [
    /Microsoft (Guy|Davis|Andrew|Christopher|Eric|Brian|Roger|Steffan|Tony|Jason|Ryan|Thomas|George|William)/i,
    /Google UK English Male/i,
    /\b(Daniel|Aaron|Arthur|Fred|Alex|Ralph|Albert|Reed|Eddy|Oliver|Thomas|Gordon|Lee|Rishi|Junior|Grandpa|Rocko)\b/i,
    /\bmale\b/i,
  ];
  const FEMALE = /female|Samantha|Zira|Aria|Jenny|Susan|Hazel|Karen|Moira|Tessa|Victoria|Allison|Ava|Kate|Serena|Fiona|Emma|Michelle|Sonia|Libby|Martha|Nicky|Catherine|Google US English$/i;
  const isMale = (v) => !FEMALE.test(v.name) && MALE.some((p) => p.test(v.name));
  // One-time reset so earlier saved voice choices don't override the new deep voice.
  if (!settings.deepVoice) {
    settings.voice = '';
    settings.deepVoice = true;
    try { Acro.store.set(KEY, settings); } catch {}
  }
  function chooseVoice() {
    const list = voices();
    if (settings.voice) {
      const v = list.find((x) => x.name === settings.voice);
      if (v) return v;
    }
    for (const p of MALE) {
      const v = list.find((x) => !FEMALE.test(x.name) && p.test(x.name));
      if (v) return v;
    }
    return list.find((x) => !FEMALE.test(x.name)) || list[0] || null;
  }

  // ---------- UI: mascot + speech bubble ----------
  // Ace: a classic cartoon game show host (slicked-back hair, big grin, tux, bow tie, microphone).
  const MASCOT = `<svg viewBox="0 0 140 172" width="128" height="157" aria-hidden="true">
    <!-- tuxedo -->
    <path d="M14 172 Q16 132 70 124 Q124 132 126 172 Z" fill="#23204a"/>
    <path d="M56 126 L70 156 L84 126 Z" fill="#fff"/>
    <path d="M56 126 L44 134 L64 166 L70 156 Z" fill="#35306b"/>
    <path d="M84 126 L96 134 L76 166 L70 156 Z" fill="#35306b"/>
    <circle cx="70" cy="146" r="1.6" fill="#23204a"/><circle cx="70" cy="153" r="1.6" fill="#23204a"/>
    <!-- bow tie -->
    <path d="M70 132 L54 124 L54 140 Z" fill="#ff3d6e"/><path d="M70 132 L86 124 L86 140 Z" fill="#ff3d6e"/>
    <rect x="65.5" y="127.5" width="9" height="9" rx="2.5" fill="#d42a57"/>
    <!-- neck and ears -->
    <path d="M58 104 L82 104 L80 124 Q70 128 60 124 Z" fill="#e8b48a"/>
    <ellipse cx="36" cy="76" rx="7" ry="11" fill="#f2c39b"/><ellipse cx="104" cy="76" rx="7" ry="11" fill="#f2c39b"/>
    <ellipse cx="36" cy="77" rx="3" ry="6" fill="#e0a57c"/><ellipse cx="104" cy="77" rx="3" ry="6" fill="#e0a57c"/>
    <!-- head -->
    <path d="M38 64 Q38 30 70 30 Q102 30 102 64 L102 82 Q102 112 70 114 Q38 112 38 82 Z" fill="#f6cfa6"/>
    <!-- hair: slicked-back pompadour with silver temples -->
    <path d="M36 70 Q30 26 70 20 Q108 18 106 62 Q104 70 102 72 Q100 48 86 42 Q72 50 52 44 Q40 52 38 72 Z" fill="#3a2416"/>
    <path d="M48 32 Q72 8 100 28 Q92 26 84 30 Q70 22 56 34 Z" fill="#5a3a24"/>
    <path d="M38 66 Q37 58 40 52 L42 70 Z" fill="#c9c3bb"/><path d="M102 66 Q103 58 100 52 L98 70 Z" fill="#c9c3bb"/>
    <!-- eyebrows -->
    <path d="M46 56 Q53 50 61 55" stroke="#3a2416" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M79 55 Q87 50 94 56" stroke="#3a2416" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <!-- eyes -->
    <g class="ace-eyes">
      <ellipse cx="54" cy="66" rx="6" ry="6.5" fill="#fff"/><ellipse cx="86" cy="66" rx="6" ry="6.5" fill="#fff"/>
      <circle cx="55" cy="67" r="3.4" fill="#2a1b10"/><circle cx="87" cy="67" r="3.4" fill="#2a1b10"/>
      <circle cx="56.3" cy="65.6" r="1.2" fill="#fff"/><circle cx="88.3" cy="65.6" r="1.2" fill="#fff"/>
    </g>
    <!-- nose and cheeks -->
    <path d="M70 70 Q66 82 70 85 Q73 86 75 84" stroke="#d89a70" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="48" cy="86" rx="6" ry="3.5" fill="#ff8a8a" opacity=".35"/><ellipse cx="92" cy="86" rx="6" ry="3.5" fill="#ff8a8a" opacity=".35"/>
    <!-- big game-show grin -->
    <g class="ace-mouth">
      <path d="M52 92 Q70 112 88 92 Q70 98 52 92 Z" fill="#7a1f2b"/>
      <path d="M54.5 93.2 Q70 98.5 85.5 93.2 L84.5 96.4 Q70 101 55.5 96.4 Z" fill="#fff"/>
      <path d="M62 104 Q70 107 78 104 Q70 101 62 104 Z" fill="#ff7a8a"/>
    </g>
    <path d="M50 91 Q52 89 54 91" stroke="#d89a70" stroke-width="1.6" fill="none"/><path d="M86 91 Q88 89 90 91" stroke="#d89a70" stroke-width="1.6" fill="none"/>
    <!-- hand holding a microphone -->
    <g transform="rotate(-18 112 132)">
      <rect x="106" y="112" width="10" height="34" rx="4" fill="#2b2b33"/>
      <rect x="105" y="110" width="12" height="5" rx="2" fill="#c9a227"/>
      <circle cx="111" cy="102" r="10.5" fill="#a9afb8"/>
      <path d="M102 98 H120 M101 102 H121 M102 106 H120 M107 93 V111 M111 92 V112 M115 93 V111" stroke="#7d848f" stroke-width="1"/>
      <ellipse cx="111" cy="132" rx="9" ry="8" fill="#f2c39b"/>
      <path d="M103 128 Q111 124 119 128" stroke="#e0a57c" stroke-width="1.6" fill="none"/>
    </g>
  </svg>`;

  const css = document.createElement('style');
  css.textContent = `
    #ace { position: fixed; left: 24px; bottom: 18px; display: flex; align-items: flex-end; gap: 12px; z-index: 40; pointer-events: none; max-width: min(540px, 30vw); }
    #ace .bubble { background: #fff; color: #1b1530; border-radius: 22px 22px 22px 6px; padding: 12px 18px; font-size: 21px; font-weight: 600; line-height: 1.3;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); opacity: 0; transform: translateY(8px) scale(.97); transition: opacity .25s, transform .25s; margin-bottom: 70px; }
    #ace.show .bubble { opacity: 1; transform: none; }
    #ace .mascot { flex: none; transition: transform .2s; }
    #ace.talking .mascot { animation: ace-bob .5s ease-in-out infinite; }
    #ace.talking .ace-mouth { animation: ace-talk .22s ease-in-out infinite alternate; transform-origin: 70px 95px; transform-box: view-box; }
    #ace .ace-eyes { animation: ace-blink 4.5s infinite; transform-origin: 70px 66px; transform-box: view-box; }
    @keyframes ace-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
    #ace.off { display: none; }
    @keyframes ace-bob { 0%,100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-6px) rotate(2deg); } }
    @keyframes ace-talk { from { transform: scaleY(.45); } to { transform: scaleY(1.15); } }
    #aceUnlock { position: fixed; left: 50%; top: 84px; transform: translateX(-50%); z-index: 60; }
    @media (max-width: 900px) { #ace .bubble { font-size: 18px; margin-bottom: 50px; } #ace svg { width: 84px; height: 103px; } }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'ace';
  root.innerHTML = `<div class="mascot">${MASCOT}</div><div class="bubble" id="aceBubble"></div>`;
  document.body.appendChild(root);
  const bubble = root.querySelector('#aceBubble');

  // ---------- speech queue ----------
  let queue = [];
  let speaking = false;
  let hideTimer = null;
  let captionTimer = null;

  function applyMode() {
    root.classList.toggle('off', settings.mode === 'off');
    if (settings.mode !== 'voice' && synth) synth.cancel();
  }

  let token = 0;

  function say(text, { interrupt = false } = {}) {
    if (!text || settings.mode === 'off') return;
    if (interrupt) {
      // A new moment in the game: drop what's queued and cut off the current line.
      queue = [text];
      if (speaking) {
        token++;
        clearTimeout(captionTimer);
        if (synth) synth.cancel();
        speaking = false;
      }
    } else {
      if (queue.length >= 4) return; // don't let chatter pile up
      queue.push(text);
    }
    if (!speaking) next();
  }

  function next() {
    const text = queue.shift();
    if (!text) {
      speaking = false;
      if (window.Sound) Sound.duck(false);
      root.classList.remove('talking');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => root.classList.remove('show'), 2500);
      return;
    }
    speaking = true;
    if (window.Sound) Sound.duck(true);
    const my = ++token;
    clearTimeout(hideTimer);
    bubble.textContent = text;
    console.debug('[Ace]', text);
    root.classList.add('show', 'talking');
    // Fallback timing for captions-only mode, or when the browser has no voices.
    const readMs = Math.min(9000, 1200 + text.length * 55);
    const done = () => {
      if (my !== token) return; // this line was cut off
      clearTimeout(captionTimer);
      next();
    };
    if (settings.mode === 'voice' && synth && voices().length) {
      const u = new SpeechSynthesisUtterance(text);
      const v = chooseVoice();
      if (v) u.voice = v;
      u.rate = 0.96; // unhurried, booming delivery
      u.pitch = 0.62; // deep
      u.onend = done;
      u.onerror = done;
      // Some browsers never fire onend; never let the queue get stuck.
      captionTimer = setTimeout(done, readMs + 6000);
      synth.speak(u);
    } else {
      captionTimer = setTimeout(done, readMs);
    }
  }

  // Browsers only allow speech after someone has clicked the page.
  function needsUnlock() {
    return !!navigator.userActivation && !navigator.userActivation.hasBeenActive;
  }
  function showUnlock() {
    if (!needsUnlock() || document.getElementById('aceUnlock')) return;
    const b = document.createElement('button');
    b.id = 'aceUnlock';
    b.className = 'btn';
    b.textContent = '🔊 Click to turn on sound';
    b.onclick = () => {
      b.remove();
      if (synth) synth.speak(new SpeechSynthesisUtterance(''));
    };
    document.body.appendChild(b);
  }

  // ---------- reacting to the game ----------
  let prev = null;
  let lastJoinSet = null;
  let warned = '';
  let pairTimers = [];

  function onState(s) {
    const mode = s.mode;
    const p = prev;
    prev = s;
    const phaseChanged = !p || p.phase !== s.phase || p.roundIndex !== s.roundIndex || (p.bonus && s.bonus && p.bonus.index !== s.bonus.index);
    showUnlock();

    // pause / resume
    if (p && p.paused !== s.paused) say(line(s.paused ? 'pause' : 'resume', mode), { interrupt: true });

    if (s.phase === 'lobby') {
      const ids = s.joinOrder || [];
      if (!p || p.phase !== 'lobby') {
        if (!p) say(line('welcome', mode));
        lastJoinSet = new Set(ids);
        return;
      }
      const fresh = ids.filter((id) => !lastJoinSet.has(id));
      lastJoinSet = new Set(ids);
      fresh.forEach((id) => {
        const pl = s.players.find((x) => x.id === id);
        if (pl) say(line('join', mode, { name: pl.name }));
      });
      const ready = s.players.filter((x) => x.connected).length;
      const before = p.players.filter((x) => x.connected).length;
      if (before < s.minPlayers && ready >= s.minPlayers) say(line('ready', mode, { count: NUM[ready] || ready }));
      return;
    }
    if (!phaseChanged) return;
    pairTimers.forEach(clearTimeout);
    pairTimers = [];

    const n = s.roundIndex + 1;
    switch (s.phase) {
      case 'reveal': {
        const vars = { n, count: s.letters.length, spelled: spell(s.letters) };
        let key = 'round';
        if (s.roundIndex === 0) key = 'firstRound';
        else if (n === s.totalRounds) key = 'lastRound';
        else if (s.roundIndex === 5) key = 'backToShort';
        say(line(key, mode, vars), { interrupt: true });
        break;
      }
      case 'answer':
        say(line('go', mode, { secs: s.answerSecs }));
        break;
      case 'vote': {
        say(line('vote', mode), { interrupt: true });
        if (s.options.length <= 6) s.options.forEach((o) => say(line('readOption', mode, { n: o.n, text: o.text })));
        break;
      }
      case 'results': {
        const r = s.results;
        const out = [];
        const winners = r.rows.filter((x) => x.winner);
        if (!r.rows.length) out.push(line('nobody', mode));
        else if (r.noVote) out.push(line('noVote', mode));
        else if (!winners.length) out.push(line('noVotes', mode));
        else if (winners.length === 1) out.push(line('winner', mode, { name: winners[0].name, text: winners[0].text }));
        else out.push(line('tie', mode, { names: listNames(winners.map((w) => w.name)) }));
        const fast = r.rows.find((x) => x.speed);
        if (fast && !(winners.length === 1 && winners[0] === fast)) out.push(line('fastest', mode, { name: fast.name }));
        const lead = s.players[0];
        if (lead && lead.score > 0) out.push(line('leader', mode, { name: lead.name, score: lead.score }));
        out.forEach((t, i) => say(t, { interrupt: i === 0 }));
        break;
      }
      case 'bonus_intro': {
        const [a, b] = s.bonus.finalists;
        say(line('lightningIntro', mode, { a: a.name, b: b.name, secs: s.lightningSecs }), { interrupt: true });
        break;
      }
      case 'bonus_reveal':
        say(line('lightning', mode, { n: s.bonus.index + 1, spelled: spell(s.letters) }), { interrupt: true });
        break;
      case 'bonus_vote':
        say(line('lightningVote', mode), { interrupt: true });
        break;
      case 'bonus_results': {
        // Matches the TV's reveal: one pair every 3.5 s, champion at 11 s.
        const names = Object.fromEntries(s.bonus.finalists.map((f) => [f.id, f.name]));
        s.bonus.pairs.forEach((pair, i) => {
          const res = pair.result;
          if (!res.winner) return;
          const key = res.reason === 'speed' ? 'pairSpeed' : res.reason === 'only' ? 'pairOnly' : 'pairWin';
          pairTimers.push(setTimeout(() => say(line(key, mode, { n: i + 1, name: names[res.winner] }), { interrupt: true }), i * 3500 + 300));
        });
        pairTimers.push(setTimeout(() => say(line('champion', mode, { name: s.champion.name }), { interrupt: true }), 11000));
        break;
      }
      case 'gameover': {
        if (!p || p.phase !== 'bonus_results') {
          const c = s.champion;
          if (c) say(line(c.forfeit ? 'forfeit' : 'champion', mode, { name: c.name }), { interrupt: true });
        }
        say(line('thanks', mode));
        break;
      }
    }
  }

  // Countdown warnings
  setInterval(() => {
    const s = prev;
    if (!s || s.paused) return;
    const ms = Acro.remainingMs(s);
    if (ms == null) return;
    const key = `${s.phase}|${s.roundIndex}|${s.bonus ? s.bonus.index : ''}`;
    if (warned === key) return;
    if (s.phase === 'answer' && s.duration > 15000 && ms <= 10000 && ms > 8000) {
      warned = key;
      say(line('tenLeft', s.mode));
    } else if (s.phase === 'bonus_answer' && ms <= 5000 && ms > 3500) {
      warned = key;
      say(line('fiveLeft', s.mode));
    }
  }, 250);

  // ---------- lobby settings control ----------
  function settingsHtml() {
    return `<div class="setting"><span>Announcer</span><div class="seg" id="segAce">
        <button data-v="voice">🔊 Voice</button><button data-v="captions">💬 Captions</button><button data-v="off">Off</button></div></div>
      <div class="setting" id="aceVoiceRow"><span>Voice</span><select id="aceVoice" class="field" style="min-height:44px;padding:6px 10px;font-size:17px;width:auto;max-width:320px"></select>
        <button class="btn ghost" id="aceTest">Test</button></div>`;
  }

  function wireSettings() {
    const seg = document.getElementById('segAce');
    if (!seg) return;
    const sync = () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.mode));
      document.getElementById('aceVoiceRow').classList.toggle('hidden', settings.mode !== 'voice' || !voices().length);
    };
    seg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      settings.mode = b.dataset.v;
      save();
      applyMode();
      sync();
      if (settings.mode !== 'off') say("Hi, I'm Ace! I'll be your host tonight.", { interrupt: true });
    }));
    const sel = document.getElementById('aceVoice');
    const fillVoices = () => {
      const current = chooseVoice();
      const sorted = voices().slice().sort((a, b) => isMale(b) - isMale(a));
      sel.innerHTML = sorted.map((v) => `<option value="${Acro.esc(v.name)}" ${current && v.name === current.name ? 'selected' : ''}>${Acro.esc(v.name)}${isMale(v) ? ' (deep)' : ''}</option>`).join('');
      sync();
    };
    sel.onchange = () => {
      settings.voice = sel.value;
      save();
    };
    document.getElementById('aceTest').onclick = () => say(line('welcome', 'kid'), { interrupt: true });
    fillVoices();
    if (synth) synth.onvoiceschanged = fillVoices;
  }

  applyMode();
  window.Announcer = { onState, say, settingsHtml, wireSettings };
})();
