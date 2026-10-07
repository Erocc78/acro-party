// TV soundtrack: picks the music for each phase, plays effects on game events, and runs the soft ticker.
(function () {
  const MUSIC = {
    lobby: 'lobby', reveal: 'think', answer: 'think', vote: 'vote', results: 'results',
    bonus_intro: 'lightning', bonus_reveal: 'lightning', bonus_answer: 'lightning', bonus_vote: 'vote',
    bonus_results: 'none', gameover: 'victory',
  };
  const TIMED = ['answer', 'vote', 'bonus_answer', 'bonus_vote'];
  let prev = null;
  let lastRemaining = null;
  let lastSec = null;
  let timers = [];
  const submittedCount = (s) => (s.bonus && s.bonus.submitted ? s.bonus.submitted.filter(Boolean).length : 0);

  function onState(s) {
    const p = prev;
    prev = s;
    Sound.pauseMusic(!!s.paused);
    if (p && p.paused !== s.paused) Sound.play('scratch');

    const changed = !p || p.phase !== s.phase || p.roundIndex !== s.roundIndex || (p.bonus && s.bonus && p.bonus.index !== s.bonus.index);

    if (s.phase === 'lobby') {
      Sound.music('lobby');
      if (p && p.phase === 'lobby' && s.joinOrder.length > p.joinOrder.length) Sound.play('join');
      return;
    }

    if (!changed) {
      // Someone answered or voted
      if (p.progress && s.progress && s.progress.done > p.progress.done) Sound.play(s.phase === 'answer' ? 'ding' : 'blip');
      if (submittedCount(s) > submittedCount(p)) Sound.play('ding');
      return;
    }

    timers.forEach(clearTimeout);
    timers = [];
    lastSec = null;

    // Leaving a timed phase: buzzer if the clock ran out, a chime if everyone finished early.
    if (p && (p.phase === 'answer' || p.phase === 'bonus_answer')) {
      if (lastRemaining != null && lastRemaining < 800) Sound.play('buzzer');
      else Sound.play('allIn');
    }
    lastRemaining = null;

    switch (s.phase) {
      case 'reveal':
        Sound.play('whoosh');
        Sound.play('letters', s.letters.length);
        break;
      case 'bonus_intro':
        Sound.play('zap');
        break;
      case 'bonus_reveal':
        Sound.play('letters', s.letters.length);
        break;
      case 'vote':
      case 'bonus_vote':
        Sound.play('whoosh');
        break;
      case 'results':
        if (s.results.rows.some((r) => r.winner)) Sound.play('fanfare');
        break;
      case 'bonus_results':
        // Matches the TV reveal: a pair every 3.5 s, champion at 11 s.
        Sound.play('drumroll', 1.2);
        [0, 1, 2].forEach((i) => timers.push(setTimeout(() => Sound.play('ding'), i * 3500 + 300)));
        timers.push(setTimeout(() => Sound.play('champion'), 9800));
        timers.push(setTimeout(() => Sound.music('victory'), 12500));
        break;
      case 'gameover':
        if (!p || p.phase !== 'bonus_results') Sound.play('champion');
        break;
    }
    if (s.phase !== 'bonus_results') Sound.music(MUSIC[s.phase] || 'none');
    // Starfield: warp burst when letters appear, faster cruising in the lightning round.
    if (window.Background) {
      const SPEED = { bonus_intro: 3.5, bonus_reveal: 3, bonus_answer: 3, bonus_vote: 2, bonus_results: 1.5, gameover: 2 };
      Background.setSpeed(SPEED[s.phase] || 1);
      if (['reveal', 'bonus_reveal', 'bonus_intro', 'gameover'].includes(s.phase)) Background.burst();
    }
  }

  // Soft ticker: one tick per second while a timer runs, brighter for the last 5 seconds.
  setInterval(() => {
    const s = prev;
    if (!s || s.paused || !TIMED.includes(s.phase)) return;
    const ms = Acro.remainingMs(s);
    if (ms == null) return;
    lastRemaining = ms;
    const sec = Math.ceil(ms / 1000);
    if (sec !== lastSec && sec > 0 && lastSec !== null) Sound.play('tick', sec <= 5);
    lastSec = sec;
  }, 80);

  // ---------- lobby settings ----------
  function settingsHtml() {
    const st = Sound.settings;
    return `<div class="setting"><span>Music</span><input type="range" id="sndMusic" min="0" max="100" value="${Math.round(st.music * 100)}" style="flex:1;max-width:260px;accent-color:var(--accent)"></div>
      <div class="setting"><span>Sound effects</span><input type="range" id="sndSfx" min="0" max="100" value="${Math.round(st.sfx * 100)}" style="flex:1;max-width:260px;accent-color:var(--accent)"></div>
      <div class="setting"><span>Timer ticker</span><div class="seg" id="segTick"><button data-v="1">On</button><button data-v="0">Off</button></div></div>`;
  }
  function wireSettings() {
    const m = document.getElementById('sndMusic');
    if (!m) return;
    m.oninput = () => Sound.set({ music: m.value / 100 });
    const x = document.getElementById('sndSfx');
    x.oninput = () => Sound.set({ sfx: x.value / 100 });
    x.onchange = () => Sound.play('ding');
    const seg = document.getElementById('segTick');
    const sync = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === Sound.settings.ticker));
    seg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      Sound.set({ ticker: b.dataset.v === '1' });
      sync();
      Sound.play('tick', false);
    }));
    sync();
  }

  // Header mute button
  function muteButtonHtml() {
    return `<button class="btn ghost" id="muteBtn" title="Mute music and sounds">${Sound.settings.muted ? '🔇' : '🔊'}</button>`;
  }
  function wireMute() {
    const b = document.getElementById('muteBtn');
    if (b) b.onclick = () => {
      Sound.set({ muted: !Sound.settings.muted });
      b.textContent = Sound.settings.muted ? '🔇' : '🔊';
    };
  }

  window.Soundtrack = { onState, settingsHtml, wireSettings, muteButtonHtml, wireMute };
})();
