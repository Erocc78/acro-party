// Helpers shared by the TV and phone screens.
window.Acro = {
  VERSION: 'v2.0',
  offset: 0,

  async post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(j.error || 'Something went wrong.');
      Object.assign(e, j, { status: r.status });
      throw e;
    }
    return j;
  },

  // Opens the live update stream. If the network holds the stream back (some company
  // networks and proxies do), it switches to asking the server about once a second.
  // onGone fires if the room or seat no longer exists.
  connect(params, onState, onGone) {
    let es = null;
    let closed = false;
    let gotMessage = false;
    let polling = false;
    let pollTimer = null;
    const startedAt = Date.now();
    let lastHeard = 0;
    const handle = (s) => {
      lastHeard = Date.now();
      Acro.offset = s.serverNow - Date.now();
      onState(s);
    };
    const gone = (why) => {
      closed = true;
      if (es) es.close();
      clearTimeout(pollTimer);
      clearInterval(watchdog);
      if (onGone) onGone(why);
    };
    const startPolling = () => {
      if (polling || closed) return;
      polling = true;
      Acro.transport = 'polling';
      if (es) es.close();
      const poll = async () => {
        if (closed) return;
        try {
          const r = await fetch('/state?' + new URLSearchParams(params), { cache: 'no-store' });
          if (r.status === 404) return gone('room');
          if (r.status === 403) return gone('seat');
          if (r.ok) handle(await r.json());
        } catch {}
        if (!closed) pollTimer = setTimeout(poll, 900);
      };
      poll();
    };
    const open = () => {
      if (polling || closed) return;
      es = new EventSource('/events?' + new URLSearchParams(params));
      es.onmessage = (e) => {
        gotMessage = true;
        handle(JSON.parse(e.data));
      };
      es.addEventListener('ping', () => (lastHeard = Date.now()));
      es.onerror = async () => {
        if (closed || polling || es.readyState !== EventSource.CLOSED) return;
        // The browser gave up (usually a 403/404). Check whether the room still exists.
        try {
          const r = await fetch('/api/peek', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: params.code }) });
          if (r.status === 404) return gone('room');
          if (r.ok && gotMessage) return gone('seat');
        } catch {}
        startPolling();
      };
    };
    open();
    // No live update within 4 seconds, or silence for 40 seconds: switch to polling.
    const watchdog = setInterval(() => {
      if (polling || closed) return;
      const quiet = Date.now() - (lastHeard || startedAt);
      if ((!gotMessage && quiet > 4000) || quiet > 40000) startPolling();
    }, 1000);
    return () => {
      closed = true;
      if (es) es.close();
      clearTimeout(pollTimer);
      clearInterval(watchdog);
    };
  },

  remainingMs(s) {
    if (s.paused) return s.remaining;
    if (!s.endsAt) return null;
    return Math.max(0, s.endsAt - (Date.now() + Acro.offset));
  },

  esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  },

  tiles(letters, cls = '', states) {
    return `<div class="tiles ${cls}">${letters
      .map((l, i) => `<div class="tile ${states ? (states[i] ? 'ok' : 'dim') : ''}" style="animation-delay:${i * 0.25}s">${l}</div>`)
      .join('')}</div>`;
  },

  timerHtml(size = 120, stroke = 10) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    return `<div class="timer" data-timer data-c="${c}" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="0"/></svg>
      <div class="num" style="font-size:${Math.round(size * 0.36)}px"></div></div>`;
  },

  // Keeps every timer on the page in sync with the server clock.
  startTicker(getState) {
    const tick = () => {
      const s = getState();
      if (s) {
        const ms = Acro.remainingMs(s);
        document.querySelectorAll('[data-timer]').forEach((el) => {
          const num = el.querySelector('.num');
          const bar = el.querySelector('.bar');
          if (ms == null) {
            num.textContent = '';
            return;
          }
          const secs = Math.ceil(ms / 1000);
          num.textContent = secs;
          const frac = s.duration ? Math.min(1, ms / s.duration) : 1;
          bar.style.strokeDashoffset = String(Number(el.dataset.c) * (1 - frac));
          el.classList.toggle('low', secs <= 5);
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  store: {
    get(k) {
      try { return JSON.parse(localStorage.getItem(k)); } catch { return null; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    },
    del(k) {
      try { localStorage.removeItem(k); } catch {}
    },
  },
};

// Small version label in the corner, so you can tell which version a browser is running.
document.addEventListener('DOMContentLoaded', () => {
  const v = document.createElement('div');
  v.textContent = Acro.VERSION;
  v.style.cssText = 'position:fixed;right:8px;bottom:6px;font-size:11px;color:var(--muted);opacity:.6;pointer-events:none;z-index:1';
  document.body.appendChild(v);
});
