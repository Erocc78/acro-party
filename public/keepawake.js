// Keeps the screen awake while a game is on, so phones (and the TV laptop) don't lock mid-round.
// 1) The Screen Wake Lock API (Android Chrome, iPhone Safari 16.4+, desktop browsers) on secure (https) pages,
//    such as the online version on Render.
// 2) Otherwise (older phones, or http:// on a home network), a tiny silent video playing on a loop, which
//    phones treat as "watching something" and so don't dim or lock. It's 16x16 pixels, muted and invisible.
// Browsers only allow either after a tap, so it starts on the first tap (joining the game counts) and is
// re-armed whenever the page comes back into view.
(function () {
  let wanted = false;
  let lock = null;
  let video = null;

  async function requestLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return false;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
      return true;
    } catch (e) {
      return false;
    }
  }

  function playVideo() {
    if (!video) {
      video = document.createElement('video');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('aria-hidden', 'true');
      video.muted = true;
      video.loop = true;
      video.preload = 'auto';
      // MP4 for phones (iPhone, Android); WebM for browsers without the MP4 video format.
      for (const [src, type] of [['/keepawake.mp4', 'video/mp4'], ['/keepawake.webm', 'video/webm']]) {
        const s = document.createElement('source');
        s.src = src;
        s.type = type;
        video.appendChild(s);
      }
      video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;z-index:-10';
      document.body.appendChild(video);
    }
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  }

  async function arm() {
    if (!wanted) return;
    if (lock) return;
    const ok = await requestLock();
    if (!ok) playVideo();
    else if (video) video.pause();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') arm();
  });
  ['click', 'touchend', 'keydown'].forEach((ev) =>
    document.addEventListener(ev, () => { if (wanted && !lock && (!video || video.paused)) arm(); }, { passive: true, capture: true })
  );

  window.KeepAwake = {
    enable() { wanted = true; arm(); },
    disable() {
      wanted = false;
      if (lock) lock.release().catch(() => {});
      lock = null;
      if (video) video.pause();
    },
    status() { return lock ? 'wake-lock' : video && !video.paused ? 'video' : 'off'; },
  };
})();
