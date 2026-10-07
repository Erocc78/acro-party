// Trippy space background: slowly turning psychedelic color swirls behind a starfield
// that drifts toward you. Used on the TV, the phones and the start page.
// Background.burst() gives a quick warp-speed rush; Background.setSpeed(n) changes the cruising speed.
(function () {
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;

  const css = document.createElement('style');
  css.textContent = `
    html { background: #06051a !important; }
    body { background: transparent !important; }
    .bg-trip, .bg-trip::before, .bg-trip::after { position: fixed; pointer-events: none; }
    .bg-trip { inset: 0; z-index: -4; overflow: hidden; }
    .bg-trip::before, .bg-trip::after {
      content: ''; left: 50%; top: 50%; width: 220vmax; height: 220vmax; margin: -110vmax 0 0 -110vmax; border-radius: 50%;
    }
    .bg-trip::before {
      background: repeating-conic-gradient(from 0deg, #ff2fa0 0deg, #7a2cff 22deg, #18c8ff 45deg, #2cffb4 67deg, #ffd23f 90deg, #ff2fa0 112deg);
      opacity: .24; animation: bg-spin 90s linear infinite;
    }
    .bg-trip::after {
      background: repeating-conic-gradient(from 30deg, #3a1cff 0deg, #ff3d6e 30deg, #00e0ff 60deg, #3a1cff 90deg);
      opacity: .17; mix-blend-mode: screen; animation: bg-spin 140s linear infinite reverse;
    }
    .bg-nebula { position: fixed; inset: -20%; z-index: -3; pointer-events: none;
      background:
        radial-gradient(40% 35% at 25% 30%, rgba(255, 47, 160, .36), transparent 70%),
        radial-gradient(35% 40% at 75% 70%, rgba(24, 200, 255, .3), transparent 70%),
        radial-gradient(30% 30% at 70% 20%, rgba(122, 44, 255, .38), transparent 70%),
        radial-gradient(30% 25% at 30% 80%, rgba(44, 255, 180, .16), transparent 70%);
      animation: bg-drift 40s ease-in-out infinite alternate; }
    .bg-vignette { position: fixed; inset: 0; z-index: -2; pointer-events: none;
      background: radial-gradient(ellipse at center, rgba(6,5,26,.1) 0%, rgba(6,5,26,.45) 65%, rgba(6,5,26,.85) 100%); }
    .bg-stars { position: fixed; inset: 0; z-index: -1; pointer-events: none; width: 100%; height: 100%; }
    @keyframes bg-spin { to { transform: rotate(360deg); } }
    @keyframes bg-drift { 0% { transform: translate(-3%, -2%) scale(1) rotate(0deg); } 100% { transform: translate(3%, 2%) scale(1.15) rotate(12deg); } }
    ${small ? '.bg-trip::before { opacity: .1 } .bg-trip::after { opacity: .07 } .bg-nebula { opacity: .8 }' : ''}
    @media (prefers-reduced-motion: reduce) { .bg-trip::before, .bg-trip::after, .bg-nebula { animation: none; } }
  `;
  document.head.appendChild(css);

  const add = (cls, tag = 'div') => {
    const el = document.createElement(tag);
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    document.body.prepend(el);
    return el;
  };
  const start = () => {
    add('bg-vignette');
    const canvas = add('bg-stars', 'canvas');
    add('bg-nebula');
    add('bg-trip');
    runStars(canvas);
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  let target = 1;
  let speed = 1;

  function runStars(canvas) {
    const g = canvas.getContext('2d');
    let W = 0, H = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = innerWidth;
      H = innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const HUES = [200, 270, 320, 180, 45, 0];
    const COUNT = small ? 160 : 420;
    const spawn = (s, far) => {
      s.x = Math.random() * 2 - 1;
      s.y = Math.random() * 2 - 1;
      s.z = far ? 1 : 0.15 + Math.random() * 0.85;
      s.pz = s.z;
      s.hue = HUES[Math.floor(Math.random() * HUES.length)];
      s.sat = Math.random() < 0.6 ? 0 : 90; // most stars white, some colored
      s.tw = Math.random() * Math.PI * 2;
      return s;
    };
    const stars = Array.from({ length: COUNT }, () => spawn({}, false));
    let last = performance.now();
    let t = 0;

    const draw = (dt) => {
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, f = Math.max(W, H) * 0.55;
      for (const s of stars) {
        s.pz = s.z;
        s.z -= dt * 0.06 * speed;
        if (s.z <= 0.02) { spawn(s, true); continue; }
        const sx = cx + (s.x / s.z) * f, sy = cy + (s.y / s.z) * f;
        if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) { spawn(s, true); continue; }
        const px = cx + (s.x / s.pz) * f, py = cy + (s.y / s.pz) * f;
        const near = 1 - s.z;
        const size = 0.4 + near * 2.4;
        const alpha = Math.min(1, near * 1.5) * (0.65 + 0.35 * Math.sin(t * 2.5 + s.tw));
        const col = `hsla(${(s.hue + t * 20) % 360}, ${s.sat}%, 88%, ${alpha})`;
        // streak (longer when warping)
        g.strokeStyle = col;
        g.lineWidth = size;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(sx, sy);
        g.stroke();
        // sparkle on the brightest stars
        if (near > 0.82 && speed < 3) {
          g.strokeStyle = `hsla(${s.hue}, ${s.sat}%, 92%, ${alpha * 0.6})`;
          g.lineWidth = 1;
          const r = size * 3;
          g.beginPath();
          g.moveTo(sx - r, sy); g.lineTo(sx + r, sy);
          g.moveTo(sx, sy - r); g.lineTo(sx, sy + r);
          g.stroke();
        }
      }
    };

    if (reduceMotion) {
      draw(0);
      return;
    }
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      speed += (target - speed) * Math.min(1, dt * 1.8);
      draw(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  window.Background = {
    setSpeed(v) { target = v; },
    burst() { if (!reduceMotion) speed = 14; },
  };
})();
