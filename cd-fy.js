// cd-fy.js - Spicetify extension: cd-fy
// Spins the cover of the playlist that is CURRENTLY PLAYING like a vinyl record,
// with needle wobble / warping and interactive DJ vinyl scratching.
//
// Settings live in the Spotify profile menu (your avatar, top right):
//   Profile menu > cd-fy
// Shortcuts:  Ctrl+Alt+Up = next faster speed,  Ctrl+Alt+Down = next slower speed
// Scratch:    Click and drag the spinning header record to scratch (this moves
//             the song's playback position), with a press-down spring while held
// Hover tilt: on a playlist page the header record bends toward the cursor
// Click wave: click the header record and it ripples out from that spot in
//             every direction, like a drop landing in water
// Debug:      open devtools console and run  cdfyDebug()
//
// Privacy: everything runs locally. Settings are kept in Spotify's local
// storage on this computer; nothing is sent anywhere. The only thing loaded is
// the playlist's own cover image, from Spotify, to find the disc's edge.

(function cdfy() {
  // wait for Spicetify (give up waiting for the menu after ~12s and run without it)
  window.__cdfyTries = (window.__cdfyTries || 0) + 1;
  const ready = window.Spicetify && Spicetify.Player && Spicetify.Player.addEventListener && Spicetify.Platform;
  if (!ready || (!Spicetify.Menu && window.__cdfyTries < 40)) {
    setTimeout(cdfy, 300);
    return;
  }
  // Only one copy may run, even if the extension is installed twice.
  if (window.__cdfyLoaded) return;
  window.__cdfyLoaded = true;

  // ------------------------------ defaults ---------------------------------
  const DEFAULTS = {
    enabled: true,
    rpm: 30,
    dir: 1,
    smooth: true,
    home: true,
    wobble: true,
    header: true,
    sidebar: true,
    everywhere: true,
    fx: true,
    tilt: true,
    wave: true,
    platform: true,
    fits: {}, // CD fit set by hand, per playlist (fraction of the picture that is record)
  };
  const RPM_PRESETS = [10, 30, 50];
  // -------------------------------------------------------------------------

  const HEADER_IMG_SEL = [
    ".main-entityHeader-image img",
    ".main-entityHeader-imageContainer img",
    "[data-testid='playlist-image'] img",
    "img[data-testid='playlist-image']",
    "[data-testid='entity-image'] img",
    "img[data-testid='entity-image']",
  ].join(", ");

  const HEADER_WRAP_SEL = [
    ".main-entityHeader-image",
    ".main-entityHeader-imageContainer",
    "[data-testid='playlist-image']",
    "[data-testid='entity-image']",
  ].join(", ");

  const SIDEBAR_SEL = [
    "#Desktop_LeftSidebar_Id",
    ".main-yourLibraryX-libraryContainer",
    ".main-yourLibraryX-library",
    "[data-testid='your-library']",
  ].join(", ");

  // ------------------------------ settings ---------------------------------
  const KEY = "cd-fy:settings";
  function load() {
    try {
      const get = (k) => (Spicetify.LocalStorage && Spicetify.LocalStorage.get(k)) || localStorage.getItem(k);
      // settings saved under the extension's old names ("cdfy", "disc-spin") carry over
      const raw = get(KEY) || get("cdfy:settings") || get("disc-spin:settings");
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  const S = load();
  const nearestPreset = (r) => RPM_PRESETS.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
  S.rpm = nearestPreset(S.rpm);

  function save() {
    const raw = JSON.stringify(S);
    try {
      if (Spicetify.LocalStorage) Spicetify.LocalStorage.set(KEY, raw);
      else localStorage.setItem(KEY, raw);
    } catch (e) {}
  }
  const fmtRpm = (r) => String(Math.round(r * 10) / 10);
  // Floating status pill; replaces the plain Spotify toast with a styled HUD.
  let hudEl = null;
  let hudTimer = 0;
  function toast(msg) {
    try {
      if (!hudEl || !hudEl.isConnected) {
        hudEl = document.createElement("div");
        hudEl.id = "cd-fy-hud";
        hudEl.innerHTML = '<span class="hud-dot"></span><span class="hud-text"></span>';
        document.body.appendChild(hudEl);
      }
      hudEl.classList.toggle("off", /disabled| off$/.test(msg));
      hudEl.querySelector(".hud-text").textContent = msg.replace(/^cd-fy\s*:\s*/, "");
      hudEl.classList.add("show");
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => hudEl && hudEl.classList.remove("show"), 1800);
    } catch (e) {
      try { Spicetify.showNotification(msg); } catch (_) {}
    }
  }

  // ------------------------------- styling ---------------------------------
  // Header-wide styling only applies while the header record is in use (body
  // class "cd-fy-header", set in tick): on a playlist page with the record
  // spinning, or with hover tilt / click wave on. Album, artist and podcast
  // headers, and playlist headers with those features off, are left as Spotify
  // draws them.
  const scoped = (sel) =>
    sel
      .split(",")
      .map((s) => "body.cd-fy-header " + s.trim())
      .join(", ");
  const style = document.createElement("style");
  style.textContent = `
    /* No placeholder grey behind the record: a cover with a transparent surround shows the page */
    ${scoped(HEADER_WRAP_SEL)}, ${scoped(HEADER_IMG_SEL)} {
      background: transparent !important;
    }
    ${scoped(HEADER_WRAP_SEL)} {
      border-radius: 50% !important;
      box-shadow: none !important;
      perspective: 900px !important;
      -webkit-perspective: 900px !important;
    }
    /* Hide the square 'Choose photo' overlay that would sit on top of the record.
       The cover can still be changed from the playlist's "..." menu > Edit details.
       (The obfuscated class names are fallbacks and may stop matching after a Spotify update.) */
    ${scoped('button[data-testid="edit-image-button"], .dy6WotPeYXXK8CsW4Whf, .O8fzkBCB29Ldnx2yv0b8, .cAuhhNOhs_9ELS319fII')} {
      display: none !important;
      pointer-events: none !important;
      opacity: 0 !important;
      visibility: hidden !important;
    }
    .disc-round {
      border-radius: 50% !important;
      will-change: transform !important;
      transform-origin: center center !important;
      backface-visibility: hidden !important;
      -webkit-backface-visibility: hidden !important;
      transform-style: preserve-3d !important;
      clip-path: circle(50% at 50% 50%) !important;
      user-select: none !important;
      -webkit-user-drag: none !important;
    }
    /* A spinning CD can be scratched: say so with the cursor */
    .disc-round.disc-live {
      cursor: grab !important;
    }
    .disc-round.disc-live:active {
      cursor: grabbing !important;
    }
    .main-contextMenu-menuItemButton span {
      transition: color 0.15s ease, font-weight 0.15s ease;
    }
    /* Floating status pill (replaces the plain toasts) */
    #cd-fy-hud {
      position: fixed;
      right: 24px;
      bottom: 104px;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px 10px 12px;
      border-radius: 999px;
      background: rgba(18, 18, 18, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(30, 215, 96, 0.45);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
      color: #ffffff;
      font: 600 13px/1.2 var(--font-family, "Circular", sans-serif);
      letter-spacing: 0.2px;
      pointer-events: none;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    #cd-fy-hud.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    #cd-fy-hud .hud-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #1ed760;
      box-shadow: 0 0 8px #1ed760;
      flex: none;
    }
    #cd-fy-hud.off .hud-dot {
      background: #6a6a6a;
      box-shadow: none;
    }
    #cd-fy-hud .hud-sub {
      color: rgba(255, 255, 255, 0.6);
      font-weight: 500;
    }
    /* Click wave: the canvas that stands in for the record while it ripples */
    /* Nothing from the page may paint it (Spotify styles the header's children with a grey fill),
       and it is trimmed to the disc's own circle, so nothing outside the disc can ever show. */
    #cd-fy-wave {
      position: absolute !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      outline: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      filter: none !important;
      opacity: 1 !important;
      border-radius: 0 !important;
      max-width: none !important;
      max-height: none !important;
      pointer-events: none !important;
      z-index: 3;
      transform-origin: center center !important;
      clip-path: circle(var(--ds-disc, 50%) at 50% 50%) !important;
    }
    /* On the platform, the CD is round even while it rests (a vinyl's own trim, set inline, still wins) */
    .cdfy-round {
      border-radius: 50% !important;
      clip-path: circle(50% at 50% 50%);
    }
    /* Platform and CD shadow: our own layers in the picture's box; neither takes a click */
    .cdfy-layer {
      position: absolute !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      outline: 0 !important;
      max-width: none !important;
      max-height: none !important;
      right: auto !important;
      bottom: auto !important;
      pointer-events: none !important;
      border-radius: 50% !important;
      box-sizing: border-box !important;
    }
    /* The platform: three stacked black metal plates whose bare brushed-brass edges
       step out from the CD's own edge, like the bezel round a DJ deck's jog wheel */
    #cd-fy-platform {
      z-index: 0;
      background: transparent !important;
    }
    #cd-fy-platform .cdfy-plate {
      position: absolute;
      border-radius: 50%;
      /* brushed brass: brightest along the line to the light (upper left, lower right) */
      background: conic-gradient(
        from 0deg,
        #9a7a45 0deg,
        #d9bd7c 30deg,
        #8f6f3c 72deg,
        #c2a263 108deg,
        #f6e5b0 135deg,
        #a88848 165deg,
        #6e5428 210deg,
        #b39352 250deg,
        #f8e9b8 315deg,
        #c4a566 343deg,
        #9a7a45 360deg
      );
      /* a hairline where each plate meets the one below, and a bevel lit from the upper left */
      box-shadow:
        0 0 0 0.6px rgba(0, 0, 0, 0.85),
        0 1px 2px rgba(0, 0, 0, 0.6),
        inset 0.8px 0.8px 0.8px rgba(255, 255, 255, 0.45),
        inset -0.8px -0.8px 0.8px rgba(0, 0, 0, 0.4);
    }
    /* deeper plates sit in shadow, the top one catches the most light */
    #cd-fy-platform .cdfy-plate-1 {
      filter: brightness(0.72);
      box-shadow:
        0 0 0 0.6px rgba(0, 0, 0, 0.9),
        0 8px 20px rgba(0, 0, 0, 0.55),
        0 2px 4px rgba(0, 0, 0, 0.5),
        inset 0.8px 0.8px 0.8px rgba(255, 255, 255, 0.35);
    }
    #cd-fy-platform .cdfy-plate-2 {
      filter: brightness(0.86);
    }
    /* Each plate's black face lies under the plate (or the CD) above it, so only steel shows
       between the CD and the outside: it only shows through a see-through part of a CD. */
    #cd-fy-platform .cdfy-face {
      position: absolute;
      border-radius: 50%;
      background: #0c0c0d;
    }
    /* The CD's own shadow on the platform */
    #cd-fy-cdshadow {
      z-index: 1;
      background: #000 !important;
      opacity: 0.7;
      will-change: transform, filter, opacity;
    }
  `;
  document.head.appendChild(style);

  // --------------------------- state detection -----------------------------
  function isPlaying() {
    try {
      if (typeof Spicetify.Player.isPlaying === "function") {
        return !!Spicetify.Player.isPlaying();
      }
    } catch (e) {}
    try {
      const st = Spicetify.Platform.PlayerAPI && Spicetify.Platform.PlayerAPI._state;
      if (st && typeof st.isPaused === "boolean") return !st.isPaused;
    } catch (e) {}
    const b = document.querySelector('[data-testid="control-button-playpause"]');
    if (b) {
      const l = (b.getAttribute("aria-label") || "").toLowerCase();
      if (l.includes("pause") || l.includes("pausa")) return true;
      if (l.includes("play") || l.includes("reproducir")) return false;
    }
    return false;
  }

  function getContext() {
    let uri = "";
    try {
      const d = Spicetify.Player.data || {};
      uri = (d.context && d.context.uri) || d.context_uri || "";
      if (!uri) {
        const st = Spicetify.Platform.PlayerAPI && Spicetify.Platform.PlayerAPI._state;
        uri = (st && st.context && st.context.uri) || "";
      }
    } catch (e) {}
    const m = uri.match(/(playlist|album|artist|show):([A-Za-z0-9]+)/);
    return m ? { type: m[1], id: m[2], uri } : null;
  }

  function currentPath() {
    try { return Spicetify.Platform.History.location.pathname || ""; } catch (e) {}
    return location.pathname || "";
  }

  // ---------------------------- find elements ------------------------------
  // Never the extension's own elements (the click-wave layer lives inside the header).
  const ownEl = (el) => !!(el.closest && el.closest("#cd-fy-wave"));
  function headerEls() {
    const imgs = Array.from(document.querySelectorAll(HEADER_IMG_SEL)).filter((el) => !ownEl(el));
    if (imgs.length) return imgs;
    return Array.from(document.querySelectorAll(HEADER_WRAP_SEL)).filter((el) => !ownEl(el));
  }

  function sidebarImgs() {
    const out = [];
    document.querySelectorAll(SIDEBAR_SEL).forEach((r) => r.querySelectorAll("img").forEach((i) => out.push(i)));
    return out;
  }

  function pageCovers(id) {
    const out = [];
    document.querySelectorAll(`a[href*="${id}"] img`).forEach((img) => {
      // The sidebar has its own setting, and the header is the record itself, so neither counts as a shelf.
      if (img.closest(SIDEBAR_SEL) || img.closest(HEADER_WRAP_SEL) || ownEl(img)) return;
      const a = img.closest("a");
      if (a && a.querySelectorAll("img").length === 1) out.push(img);
    });
    return out;
  }

  function rowMatches(img, id) {
    const row = img.closest(`li, [role="row"], [role="listitem"], [data-testid="your-library-item"], a[href*="${id}"]`);
    if (!row) return false;
    const sel = `[href*="${id}"],[id*="${id}"],[aria-labelledby*="${id}"],[data-uri*="${id}"]`;
    return row.matches(sel) || !!row.querySelector(sel);
  }

  // ---------------------------- spin engine --------------------------------
  const states = new WeakMap();
  const live = new Set();
  const running = new Set();
  let raf = 0;
  let last = 0;

  const fullSpeed = () => S.rpm * 6 * S.dir;
  const isHeader = (el) => el.matches(HEADER_IMG_SEL + "," + HEADER_WRAP_SEL);

  function applyAngle(el, s) {
    const sc = s.scale !== undefined && s.scale !== 1 ? ` scale(${s.scale.toFixed(4)})` : "";
    const pre = tiltPrefix(el); // hover tilt goes in front of the spin
    // Warp & needle wobble: an orbital tilt that follows the rotation. Its size
    // follows the speed (smoothed), so it fades in as the record spins up and
    // out as it slows, and a record coming to rest never snaps flat.
    const want = S.wobble ? Math.min(1, Math.abs(s.omega || 0) / Math.max(1, Math.abs(fullSpeed()))) : 0;
    s.wob = s.wob === undefined ? want : s.wob + (want - s.wob) * 0.12;
    if (s.wob < 0.002) s.wob = 0;
    if (s.wob > 0) {
      const rad = (s.angle * Math.PI) / 180;
      const tiltX = (Math.sin(rad) * 1.5 * s.wob).toFixed(2);
      const tiltY = (Math.cos(rad) * 1.5 * s.wob).toFixed(2);
      const shiftZ = (Math.sin(rad * 2) * 0.4 * s.wob).toFixed(2);
      el.style.transform = `${pre}rotate3d(0, 0, 1, ${s.angle.toFixed(2)}deg) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateZ(${shiftZ}px)${sc}`;
    } else {
      el.style.transform = `${pre}rotate3d(0, 0, 1, ${s.angle.toFixed(2)}deg) translateZ(0)${sc}`;
    }
    sheenFollow(el); // the CD's shadow follows its lift and press-down
  }

  function settleIdle(el, s, atHome) {
    s.mode = "idle";
    s.omega = 0;
    s.wob = 0;
    el.classList.remove("disc-live");
    if (atHome) {
      s.angle = 0;
      el.style.transform = tiltPrefix(el).trim();
      sheenFollow(el);
      if (!isHeader(el)) el.classList.remove("disc-round");
    } else {
      applyAngle(el, s);
    }
    // Came to rest under a cursor that's already on it: lift it without waiting for the mouse to move.
    if (isHeader(el) && lastPtr) setTimeout(() => lastPtr && tiltPointer(lastPtr.x, lastPtr.y, lastPtr.target), 0);
  }

  function step(el, s, dt, now) {
    // Press-down spring: the record sinks a little while held and springs back
    // with a small overshoot on release. Mirrored records follow the same state.
    const pressTarget = s.mode === "scratch" && S.fx ? PRESS_SCALE : 1;
    if (s.scale === undefined) {
      s.scale = 1;
      s.scaleV = 0;
    }
    let pressMoving = false;
    if (s.scale !== pressTarget || s.scaleV !== 0) {
      const acc = -320 * (s.scale - pressTarget) - 22 * s.scaleV;
      s.scaleV += acc * dt;
      s.scale += s.scaleV * dt;
      if (Math.abs(s.scale - pressTarget) < 0.0004 && Math.abs(s.scaleV) < 0.01) {
        s.scale = pressTarget;
        s.scaleV = 0;
      }
      pressMoving = true;
    }

    if (s.mode === "scratch") {
      // Direct user mouse control - rotation handled in mousemove
      if (pressMoving) applyAngle(el, s);
      return;
    }

    const full = fullSpeed();

    if (s.mode === "run") {
      if (!S.smooth) {
        s.omega = full;
      } else {
        // Organic turntable torque curve: critically-damped exponential approach
        const k = 3.2;
        s.omega = full + (s.omega - full) * Math.exp(-k * dt);
        if (Math.abs(s.omega - full) < 0.4) s.omega = full;
      }
      s.angle = (s.angle + s.omega * dt) % 360;
      applyAngle(el, s);
    } else if (s.mode === "home") {
      // Cubic Hermite Spline: zero jerk, exact boundary slopes, feathered landing on 0°
      const elapsed = (now - s.glideStart) / 1000;
      const tau = Math.min(Math.max(elapsed / s.glideDuration, 0), 1);

      const t2 = tau * tau;
      const t3 = t2 * tau;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + tau;
      const h01 = -2 * t3 + 3 * t2;

      s.angle = h00 * s.glideP0 + h10 * (s.glideV0 * s.glideDuration) + h01 * s.glideP1;

      // Continuously update instantaneous omega so unpausing mid-glide is physically seamless
      const d_h00 = 6 * tau * (tau - 1);
      const d_h10 = 3 * t2 - 4 * tau + 1;
      const d_h01 = -6 * tau * (tau - 1);
      s.omega = (d_h00 * s.glideP0 + d_h10 * (s.glideV0 * s.glideDuration) + d_h01 * s.glideP1) / s.glideDuration;

      applyAngle(el, s);

      if (tau >= 1) {
        return settleIdle(el, s, true);
      }
    } else if (s.mode === "coast") {
      // Natural motor friction glide to zero
      const elapsed = (now - s.glideStart) / 1000;
      const tau = Math.min(Math.max(elapsed / s.glideDuration, 0), 1);
      const decay = (1 - tau) * (1 - tau);
      s.omega = s.glideV0 * decay;
      s.angle = (s.angle + s.omega * dt) % 360;
      applyAngle(el, s);

      if (tau >= 1 || Math.abs(s.omega) < 0.5) {
        return settleIdle(el, s, false);
      }
    }
  }

  function frame(t) {
    const dt = Math.min(Math.max((t - last) / 1000, 0), 0.05);
    last = t;
    let active = false;
    live.forEach((el) => {
      const s = states.get(el);
      if (!s || !el.isConnected || s.mode === "idle") {
        live.delete(el);
        return;
      }
      step(el, s, dt, t);
      if (s.mode === "idle") live.delete(el);
      else active = true;
    });
    raf = active ? requestAnimationFrame(frame) : 0;
  }

  function kick() {
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function start(el) {
    let s = states.get(el);
    if (!s) {
      s = {
        angle: 0,
        omega: 0,
        mode: "idle",
        glideStart: 0,
        glideDuration: 1,
        glideP0: 0,
        glideP1: 0,
        glideV0: 0,
      };
      states.set(el, s);
    }
    if (s.mode === "run" || s.mode === "scratch") return;
    s.mode = "run";
    el.classList.add("disc-round", "disc-live");
    running.add(el);
    live.add(el);
    kick();
    // A lifted CD drops back onto its platform the moment it starts to spin.
    if (tilt.el === el && tilt.th > 0) tiltSettle();
  }

  function stop(el) {
    const s = states.get(el);
    running.delete(el);
    if (!s || s.mode === "idle" || s.mode === "scratch") return;

    const now = performance.now();
    s.glideStart = now;
    s.glideV0 = s.omega;
    s.glideP0 = s.angle;

    if (S.home) {
      const sgn = Math.sign(s.omega) || S.dir;
      if (Math.abs(s.omega) < 35) {
        // Barely started: return smoothly to closest 0 position without redundant rotation
        const closest = Math.round(s.angle / 360) * 360;
        s.glideP1 = closest;
        s.glideDuration = Math.max(0.35, Math.min(0.9, Math.abs(closest - s.angle) / 60));
      } else {
        // Cruising: carry momentum forward to the next clean 360 multiple
        const estStop = s.angle + s.omega * 0.7;
        let target = sgn > 0 ? Math.ceil(estStop / 360) * 360 : Math.floor(estStop / 360) * 360;
        if (sgn > 0 && target <= s.angle + 60) target += 360;
        if (sgn < 0 && target >= s.angle - 60) target -= 360;

        s.glideP1 = target;
        s.glideDuration = Math.max(0.9, Math.min(2.4, (1.8 * (target - s.angle)) / (s.omega || 1)));
      }
      s.mode = "home";
    } else {
      s.glideDuration = Math.max(0.8, Math.min(2.0, Math.abs(s.omega) / 100));
      s.mode = "coast";
    }
    live.add(el);
    kick();
  }

  // -------------------------- interactive scratch --------------------------
  let activeScratch = null;
  let lastScratchTime = 0;
  let audioCtx = null;
  let scratchSource = null;
  let scratchGain = null;
  let scratchFilter = null;
  let scratchBuffer = null;

  function initScratchAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
        const sampleRate = audioCtx.sampleRate || 44100;
        const length = sampleRate; // 1 second loop
        scratchBuffer = audioCtx.createBuffer(1, length, sampleRate);
        const data = scratchBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + white * 0.0990460;
          b1 = 0.96300 * b1 + white * 0.1616165;
          b2 = 0.57000 * b2 + white * 0.4926137;
          data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15;
        }
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      if (!scratchSource) {
        scratchSource = audioCtx.createBufferSource();
        scratchSource.buffer = scratchBuffer;
        scratchSource.loop = true;

        scratchFilter = audioCtx.createBiquadFilter();
        scratchFilter.type = "bandpass";
        scratchFilter.frequency.value = 1000;
        scratchFilter.Q.value = 1.2;

        scratchGain = audioCtx.createGain();
        scratchGain.gain.value = 0;

        scratchSource.connect(scratchFilter);
        scratchFilter.connect(scratchGain);
        scratchGain.connect(audioCtx.destination);

        scratchSource.start(0);
      }
    } catch (e) {
      console.warn("[cd-fy] scratch audio error", e);
    }
  }

  function playScratchSound(velocity) {
    if (!audioCtx || !scratchGain || !scratchFilter) return;
    try {
      const absV = Math.abs(velocity);
      if (absV < 15) {
        scratchGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.03);
        return;
      }
      const targetGain = Math.min(0.2, (absV / 1000) * 0.2);
      const targetFreq = Math.min(3200, Math.max(500, absV * 3.5));
      if (scratchSource && scratchSource.playbackRate) {
        scratchSource.playbackRate.value = Math.max(0.4, Math.min(2.0, absV / 180));
      }
      scratchGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.02);
      scratchFilter.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.02);
    } catch (e) {}
  }

  function stopScratchSound() {
    if (audioCtx && scratchGain) {
      try {
        scratchGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.04);
      } catch (e) {}
    }
  }

  function scrubAudio(deltaMs) {
    if (!Spicetify.Player || typeof Spicetify.Player.getProgress !== "function") return;
    try {
      const cur = Spicetify.Player.getProgress();
      const dur = typeof Spicetify.Player.getDuration === "function" ? Spicetify.Player.getDuration() : Infinity;
      const target = Math.max(0, Math.min(dur, cur + deltaMs));
      Spicetify.Player.seek(target);
    } catch (e) {}
  }

  // Press-down: the record sinks a little while held and springs back on release.
  const PRESS_SCALE = 0.965;

  document.addEventListener(
    "mousedown",
    (e) => {
      if (!S.enabled || e.button !== 0) return; // Left mouse button only

      // ONLY allow scratching when the song is playing
      if (!isPlaying()) return;

      // ONLY allow scratching when the playlist is open (the playlist header record)
      const headerList = headerEls();
      let targetEl = null;
      for (const el of headerList) {
        if (el === e.target || el.contains(e.target)) {
          targetEl = el;
          break;
        }
        const wrap = el.closest ? el.closest(HEADER_WRAP_SEL) : null;
        if (wrap && (wrap === e.target || wrap.contains(e.target))) {
          targetEl = el;
          break;
        }
      }
      if (!targetEl) return;

      const s = states.get(targetEl);
      // ONLY allow scratching while the record is actively spinning
      if (!s || (s.mode !== "run" && s.mode !== "scratch")) return;

      e.preventDefault();
      e.stopPropagation();
      lastDiscPress = performance.now();

      // Flat layout centre: unaffected by the spin or a hover tilt that is still easing out.
      const { cx, cy } = recordCircle(targetEl);
      const mouseAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

      activeScratch = {
        el: targetEl,
        s,
        cx,
        cy,
        lastMouseAngle: mouseAngle,
        lastTime: performance.now(),
        lastSeekTime: performance.now(),
        accumulatedAngle: 0,
        recentVelocities: [],
      };

      s.mode = "scratch";

      // Put all other running vinyl elements (e.g. rotating sidebar record) into scratch sync
      running.forEach((otherEl) => {
        if (otherEl !== targetEl && otherEl.isConnected) {
          const sOther = states.get(otherEl);
          if (sOther) {
            sOther.mode = "scratch";
            sOther.angle = s.angle;
            applyAngle(otherEl, sOther);
          }
        }
      });


      targetEl.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      initScratchAudio();
    },
    true
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!activeScratch) return;
      const { el, s, cx, cy } = activeScratch;
      const now = performance.now();
      const dt = Math.max((now - activeScratch.lastTime) / 1000, 0.001);

      const mouseAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      let delta = mouseAngle - activeScratch.lastMouseAngle;

      if (delta > 180) delta -= 360;
      else if (delta < -180) delta += 360;

      activeScratch.lastMouseAngle = mouseAngle;
      activeScratch.lastTime = now;

      s.angle = (s.angle + delta) % 360;
      applyAngle(el, s);

      const instV = delta / dt;
      s.omega = instV;
      activeScratch.recentVelocities.push(instV);
      if (activeScratch.recentVelocities.length > 5) activeScratch.recentVelocities.shift();

      // Mirror the exact same rotation and fluctuations to the rotating sidebar record
      running.forEach((otherEl) => {
        if (otherEl !== el && otherEl.isConnected) {
          const sOther = states.get(otherEl);
          if (sOther) {
            sOther.angle = s.angle;
            sOther.omega = instV;
            applyAngle(otherEl, sOther);
          }
        }
      });

      playScratchSound(instV);

      activeScratch.accumulatedAngle += delta;
      if (now - activeScratch.lastSeekTime > 65) {
        activeScratch.lastSeekTime = now;
        const scrubMs = activeScratch.accumulatedAngle * (2000 / 360);
        activeScratch.accumulatedAngle = 0;
        scrubAudio(scrubMs);
      }
    },
    true
  );

  window.addEventListener(
    "mouseup",
    () => {
      if (!activeScratch) return;
      lastScratchTime = performance.now();
      const { el, s, recentVelocities, accumulatedAngle } = activeScratch;

      if (Math.abs(accumulatedAngle) > 2) {
        scrubAudio(accumulatedAngle * (2000 / 360));
      }

      let avgV = 0;
      if (recentVelocities.length > 0) {
        const sum = recentVelocities.reduce((a, b) => a + b, 0);
        avgV = sum / recentVelocities.length;
      }

      stopScratchSound();
      el.style.cursor = "";
      document.body.style.userSelect = "";

      const playing = S.enabled && isPlaying();

      // Release both the main record and all mirrored rotating sidebar records with the exact same momentum & speed
      running.forEach((rEl) => {
        const sR = states.get(rEl);
        if (sR) {
          sR.omega = avgV;
          // Out of scratch first: stop() ignores a record that is still being scratched,
          // which used to leave it stuck (and its animation loop running) if playback had stopped.
          sR.mode = "run";
          if (!playing) stop(rEl);
        }
      });

      activeScratch = null;
    },
    true
  );

  // Prevent browser native HTML5 image drag on the spinning playlist vinyl
  window.addEventListener(
    "dragstart",
    (e) => {
      if (activeScratch) {
        e.preventDefault();
        return false;
      }
      if (!headerInUse) return;
      const headerList = headerEls();
      for (const el of headerList) {
        if (el === e.target || el.contains(e.target)) {
          e.preventDefault();
          return false;
        }
        const wrap = el.closest ? el.closest(HEADER_WRAP_SEL) : null;
        if (wrap && (wrap === e.target || wrap.contains(e.target))) {
          e.preventDefault();
          return false;
        }
      }
    },
    true
  );

  // Swallow only the click that ends a press on the record (a scratch or a
  // click wave), so it doesn't also open Spotify's "Edit details" dialog. Any
  // other click on the cover behaves as Spotify normally does.
  let lastDiscPress = 0;
  document.addEventListener(
    "click",
    (e) => {
      if (!S.enabled) return;
      const now = performance.now();
      if (now - lastScratchTime < 400 || now - lastDiscPress < 700) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener("blur", () => {
    if (activeScratch) {
      lastScratchTime = performance.now();
      stopScratchSound();
      activeScratch.el.style.cursor = "";
      document.body.style.userSelect = "";
      const playing = S.enabled && isPlaying();
      // Same release as letting go of the mouse, so the record glides home instead of freezing.
      running.forEach((rEl) => {
        const sR = states.get(rEl);
        if (sR) {
          sR.mode = "run";
          if (!playing) stop(rEl);
        }
      });
      activeScratch = null;
    }
  });

  // ------------------------------ hover tilt -------------------------------
  // On a playlist page the header record leans toward the cursor. The tilt is
  // applied to the record element itself, in front of its spin transform, so
  // the record's own circular clip bends with it and nothing else moves.
  const TILT_MAX = 22; // degrees at the rim
  const TILT_PERSPECTIVE = 650; // px: smaller bends harder
  const TILT_LIFT = 0.045; // lifts off the platform toward you while hovered
  const TILT_RATE = 14; // 1/s: how fast the lean follows the cursor
  const tilt = { el: null, rx: 0, ry: 0, h: 0, hv: 0, trx: 0, try_: 0, th: 0, raf: 0, last: 0 };

  const isPlaylistPage = () => /^\/playlist\//.test(currentPath());
  // The header CD is turning (playing, or still coasting to a stop).
  const headerSpinning = () =>
    headerEls().some((el) => {
      const s = states.get(el);
      return !!s && s.mode !== "idle";
    });
  // Lifting and bending only while the CD is still: a spinning CD stays down on its platform, for scratching.
  const tiltAllowed = () => S.enabled && S.tilt && isPlaylistPage() && !headerSpinning();

  // The record's flat circle on screen, from its layout box placed by its
  // parent's rect, so neither the spin nor the tilt can skew the measurement.
  function recordCircle(el) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const p = el.offsetParent;
    if (!p || !w) {
      const b = el.getBoundingClientRect();
      return { cx: b.left + b.width / 2, cy: b.top + b.height / 2, r: (w || b.width) / 2 || 1 };
    }
    const pb = p.getBoundingClientRect();
    const left = pb.left + p.clientLeft + el.offsetLeft - p.scrollLeft;
    const top = pb.top + p.clientTop + el.offsetTop - p.scrollTop;
    return { cx: left + w / 2, cy: top + h / 2, r: Math.min(w, h) / 2 || 1 };
  }

  const tiltOn = (el) => el === tilt.el && !(Math.abs(tilt.h) < 0.002 && Math.abs(tilt.rx) < 0.01 && Math.abs(tilt.ry) < 0.01);

  // The tilt part of the record's transform; empty when it isn't tilted.
  function tiltPrefix(el) {
    if (!tiltOn(el)) return "";
    return `perspective(${TILT_PERSPECTIVE}px) rotateX(${tilt.rx.toFixed(3)}deg) rotateY(${tilt.ry.toFixed(3)}deg) scale(${(1 + TILT_LIFT * tilt.h).toFixed(4)}) `;
  }

  // Rewrite the record's transform: tilt in front, spin (if any) behind.
  function tiltWriteRecord(el) {
    const s = states.get(el);
    if (s && !(s.mode === "idle" && s.angle === 0)) applyAngle(el, s);
    else {
      el.style.transform = tiltPrefix(el).trim();
      sheenFollow(el);
    }
  }

  function tiltTarget(target) {
    if (!target || !target.closest) return null;
    for (const el of headerEls()) {
      if (el === target || el.contains(target)) return el;
      const wrap = el.closest ? el.closest(HEADER_WRAP_SEL) : null;
      if (wrap && wrap !== el && wrap.contains(target)) return el;
    }
    return null;
  }

  function tiltMeasure(el, x, y) {
    const c = recordCircle(el);
    const dx = (x - c.cx) / c.r;
    const dy = (y - c.cy) / c.r;
    return { dx, dy, d: Math.hypot(dx, dy) };
  }

  function tiltRelease() {
    const el = tilt.el;
    tilt.el = null;
    if (el && el.isConnected) tiltWriteRecord(el);
  }

  function tiltAttach(el) {
    if (tilt.el === el) return;
    tiltRelease();
    tilt.el = el;
    tilt.rx = tilt.ry = tilt.h = tilt.hv = 0;
    detectVinyl(el); // find where the disc ends in the cover before the first click
  }

  function tiltSettle() {
    tilt.trx = tilt.try_ = 0;
    tilt.th = 0;
    tiltKick();
  }

  function tiltPointer(x, y, target) {
    let el = null;
    let m = null;
    if (tiltAllowed()) {
      if (tilt.el && tilt.el.isConnected && tilt.th > 0) {
        m = tiltMeasure(tilt.el, x, y);
        if (m.d <= 1.06) el = tilt.el; // a hair past the rim, so the lean doesn't flicker at the edge
      }
      if (!el) {
        const cand = tiltTarget(target);
        if (cand) {
          m = tiltMeasure(cand, x, y);
          if (m.d <= 1) el = cand; // only the record's own circle, never the box around it
        }
      }
    }
    if (!el) return tiltSettle();

    tiltAttach(el);
    let { dx, dy } = m;
    if (m.d > 1) {
      dx /= m.d;
      dy /= m.d;
    }
    // Lie flat while scratching so the scratch geometry stays true.
    const held = !!activeScratch;
    // The side under the cursor is pressed down and away.
    tilt.try_ = held ? 0 : dx * TILT_MAX;
    tilt.trx = held ? 0 : -dy * TILT_MAX;
    tilt.th = held ? 0 : 1;
    tiltKick();
  }

  function tiltKick() {
    if (!tilt.raf && tilt.el) {
      tilt.last = performance.now();
      tilt.raf = requestAnimationFrame(tiltFrame);
    }
  }

  function tiltFrame(t) {
    const dt = Math.min(Math.max((t - tilt.last) / 1000, 0), 0.05);
    tilt.last = t;
    const el = tilt.el;
    if (!el || !el.isConnected) {
      tiltRelease();
      tilt.raf = 0;
      return;
    }

    const f = 1 - Math.exp(-TILT_RATE * dt);
    tilt.rx += (tilt.trx - tilt.rx) * f;
    tilt.ry += (tilt.try_ - tilt.ry) * f;
    // Lift and landing on a spring: it rises with a soft float and settles onto
    // the platform with a small bump.
    tilt.hv += (170 * (tilt.th - tilt.h) - 15 * tilt.hv) * dt;
    tilt.h += tilt.hv * dt;

    if (tilt.th === 0 && Math.abs(tilt.rx) < 0.02 && Math.abs(tilt.ry) < 0.02 && Math.abs(tilt.h) < 0.003 && Math.abs(tilt.hv) < 0.02) {
      tilt.rx = tilt.ry = tilt.h = tilt.hv = 0;
      if (!wave.active) tiltRelease();
      else tiltWriteRecord(el);
      tilt.raf = 0;
      return;
    }

    tiltWriteRecord(el);

    const converged =
      Math.abs(tilt.trx - tilt.rx) < 0.01 &&
      Math.abs(tilt.try_ - tilt.ry) < 0.01 &&
      Math.abs(tilt.th - tilt.h) < 0.002 &&
      Math.abs(tilt.hv) < 0.01;
    tilt.raf = converged ? 0 : requestAnimationFrame(tiltFrame);
  }

  // Where the cursor last was, so a CD that stops spinning under it can lift straight away.
  let lastPtr = null;
  document.addEventListener(
    "mousemove",
    (e) => {
      lastPtr = { x: e.clientX, y: e.clientY, target: e.target };
      tiltPointer(e.clientX, e.clientY, e.target);
    },
    { passive: true }
  );
  window.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget) {
      lastPtr = null;
      tiltSettle();
    }
  });
  window.addEventListener("blur", tiltSettle);

  // ------------------------------- click wave ------------------------------
  // Click anywhere on the header record and it ripples like water when a drop
  // lands: rings spread out from the spot in every direction, slowly, and die
  // away. The record's own picture moves: its grooves and artwork are pushed
  // and pulled by the ripple, and the slopes catch and lose the light.
  //
  // How: while it ripples, a canvas lies exactly over the record. The real
  // cover is drawn onto it (any picture can be drawn, so this needs neither
  // WebGL nor permission to read the picture's pixels) on a fine mesh of
  // triangles whose corners the ripple shifts. A smooth light-and-shadow
  // layer from the ripple's slope goes on top. The canvas carries the
  // record's spin, hover lean and press-down, so it takes over without a jump.
  //
  // Only the record moves. The ripple fades to nothing before the rim, so the
  // outline never changes and nothing shows outside it. Many covers are a
  // disc on a plain background; when the disc's edge can be found in the
  // picture the ripple stays inside the disc and the background stays still.
  const WAVE_SPEED = 0.5; // record radii per second: slow
  const WAVE_LENGTH = 0.26; // ring to ring, in record radii
  const WAVE_RINGS = 3; // rings in each ripple
  const WAVE_HEIGHT = 0.022; // ripple height, in record radii: subtle
  const WAVE_LIFE = 2.4; // s for the ripple to fade to about a third
  const WAVE_SHIFT = 0.1; // how far the slope moves the picture (x radius per unit slope)
  const WAVE_SHINE = 0.75; // how much the slope lights / shades
  const WAVE_GRID = 30; // mesh cells across the disc
  const WAVE_SHADE_RES = 128; // light-map pixels across the disc
  const WAVE_RIM = 0.16; // the outer part of the disc where the ripple fades out (fraction of radius)
  const WAVE_LIGHT = (() => {
    const l = [-0.55, -0.83]; // from the upper left
    const n = Math.hypot(l[0], l[1]);
    return [l[0] / n, l[1] / n];
  })();

  const wave = {
    el: null, active: false, drops: [], raf: 0,
    canvas: null, ctx: null, shadeCv: null, shadeCtx: null, shadeImg: null, layer: null,
    w: 0, h: 0, rv: 1, zoom: 1, src: "", peak: 0,
    parent: null, parentPos: false, masked: false,
  };

  // Not while the CD is spinning: then it's for scratching.
  const waveAllowed = () => S.enabled && S.wave && isPlaylistPage() && !headerSpinning();
  const waveLog = (why) => console.info("[cd-fy] click wave not started:", why);

  // ---- where the disc ends inside the cover picture -------------------------
  // Fraction of the cover's radius that is actually record (1 = all of it).
  const vinylEdge = new Map();
  // What happened when each cover was measured, for cdfyDebug().
  const vinylWhy = new Map();
  let measureWhy = "";

  function detectVinyl(el) {
    if (!el || el.tagName !== "IMG") return;
    const src = el.currentSrc || el.src;
    if (!src) return;
    if (vinylEdge.has(src)) return vinylFit(el);
    vinylEdge.set(src, 1); // until measured: the whole cover
    vinylWhy.set(src, "measuring");
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        vinylEdge.set(src, measureVinyl(im));
        vinylWhy.set(src, measureWhy);
        headerEls().forEach(vinylFit);
      } catch (e) {
        vinylWhy.set(src, "Spotify didn't let the extension read this picture's pixels");
        console.info("[cd-fy] couldn't read the cover to find the disc's edge; showing the whole cover");
      }
    };
    im.onerror = () => {
      vinylWhy.set(src, "the picture couldn't be loaded for measuring");
      console.info("[cd-fy] couldn't load the cover to find the disc's edge; showing the whole cover");
    };
    im.src = src;
  }

  // A cover that is a picture of a record on a background is zoomed in to the
  // record, so the CD keeps exactly the size of the playlist picture and no
  // background ring shows around it. (Where the browser can't zoom a picture,
  // the record is trimmed to the disc instead.)
  const ZOOM_OK = !!(window.CSS && CSS.supports && CSS.supports("object-view-box", "inset(10%)"));
  const edgeOf = (src) => vinylEdge.get(src) || 1;
  // How much of the shown record's radius is disc: all of it once the picture is zoomed to the disc.
  // The fit set by hand for this playlist (Ctrl + mouse wheel over the CD), else the default:
  // every CD starts zoomed in to 120%, so the record fills the platform.
  const DEFAULT_ZOOM = 1.2;
  const fitKey = () => (currentPath().match(/^\/playlist\/([A-Za-z0-9]+)/) || [])[1] || "";
  const fitFor = (src) => {
    const k = fitKey();
    return (k && S.fits && S.fits[k]) || 1 / DEFAULT_ZOOM;
  };
  const discFrac = (src) => (ZOOM_OK ? 1 : fitFor(src));
  // How far the picture is zoomed in so the disc fills it.
  const zoomOf = (src) => (ZOOM_OK ? fitFor(src) : 1);

  function vinylFit(el) {
    if (!el || el.tagName !== "IMG") return;
    const src = el.currentSrc || el.src;
    const rv = fitFor(src);
    if (ZOOM_OK) {
      const view = rv < 1 ? `inset(${((1 - rv) * 50).toFixed(3)}%)` : "";
      if (el.dataset.discClip === view) return;
      if (view) el.style.setProperty("object-view-box", view, "important");
      else el.style.removeProperty("object-view-box");
      el.dataset.discClip = view;
      return;
    }
    const want = rv < 1 ? `circle(${(rv * 50).toFixed(3)}% at 50% 50%)` : "";
    if (el.dataset.discClip === want) return;
    if (want) el.style.setProperty("clip-path", want, "important");
    else el.style.removeProperty("clip-path");
    el.dataset.discClip = want;
  }

  function vinylUnfit(el) {
    if (!el || !el.dataset || !el.dataset.discClip) return;
    el.style.removeProperty("clip-path");
    el.style.removeProperty("object-view-box");
    el.dataset.discClip = "";
  }
  // Fit the CD by hand: Ctrl + mouse wheel over the header CD zooms its picture
  // in or out, so the record fills the platform exactly even on a cover whose
  // edge can't be found automatically. Remembered for each playlist.
  window.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey || !S.enabled || !isPlaylistPage()) return;
      const el = tiltTarget(e.target);
      if (!el || el.tagName !== "IMG") return;
      if (tiltMeasure(el, e.clientX, e.clientY).d > 1) return;
      const k = fitKey();
      if (!k) return;
      e.preventDefault(); // not Spotify's own page zoom
      e.stopPropagation();
      const src = el.currentSrc || el.src;
      const step = e.deltaY > 0 ? 0.01 : -0.01; // wheel up: zoom in
      const next = Math.round(Math.min(1, Math.max(0.5, fitFor(src) + step)) * 1000) / 1000;
      S.fits = Object.assign({}, S.fits, { [k]: next });
      save();
      // glide to the new zoom rather than jump (only while adjusting, so a page never opens zooming in)
      el.style.setProperty("transition", "object-view-box 0.14s ease-out");
      clearTimeout(el._cdfyFitT);
      el._cdfyFitT = setTimeout(() => el.style.removeProperty("transition"), 400);
      vinylFit(el);
      stagePlace();
      toast(`cd-fy : CD fit ${Math.round((1 / next) * 100)}% zoom`);
    },
    { capture: true, passive: false }
  );


  function measureVinyl(im) {
    const S2 = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S2;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const sc = Math.max(S2 / im.naturalWidth, S2 / im.naturalHeight);
    const dw = im.naturalWidth * sc;
    const dh = im.naturalHeight * sc;
    ctx.drawImage(im, (S2 - dw) / 2, (S2 - dh) / 2, dw, dh);
    const d = ctx.getImageData(0, 0, S2, S2).data; // throws if the image isn't CORS-clean
    const half = S2 / 2;
    const ANG = 120;
    const ring = (rf) => {
      const out = [];
      for (let i = 0; i < ANG; i++) {
        const a = (i / ANG) * Math.PI * 2;
        const x = Math.min(S2 - 1, Math.max(0, Math.round(half + Math.cos(a) * rf * (half - 1))));
        const y = Math.min(S2 - 1, Math.max(0, Math.round(half + Math.sin(a) * rf * (half - 1))));
        const k = (y * S2 + x) * 4;
        const al = d[k + 3] / 255;
        // Colour and opacity both count, so a transparent surround is found
        // even against a black rim.
        out.push([d[k] * al, d[k + 1] * al, d[k + 2] * al, d[k + 3]]);
      }
      return out;
    };
    const band = [];
    for (let rf = 0.975; rf <= 0.996; rf += 0.007) band.push(...ring(rf));
    // The disc's edge is where the picture changes and stays changed for a few
    // pixels inward: a thin line drawn in the surround (a ring, a scratch) is
    // never taken for the disc. The first ring that differs still straddles the
    // soft, anti-aliased edge, so trim about a pixel inside it.
    const STEP = 0.004;
    const RUN = [0, 0.012, 0.024]; // solid for about 3 px inward
    const edgeAt = (hit, kind) => {
      for (let rf = 0.985; rf > 0.4; rf -= STEP) {
        if (RUN.every((o) => hit(rf - o))) {
          if (rf >= 0.965) break;
          measureWhy = `the record fills ${Math.round((rf - 0.008) * 100)}% of the picture (${kind} surround)`;
          return rf - 0.008;
        }
      }
      measureWhy = `the whole picture is the record (${kind} surround, no edge found inside it)`;
      return 1;
    };

    // A see-through surround (a record cut out of its background): the disc
    // is where the picture turns clearly more solid than the surround. The
    // record itself may be partly see-through too (a clear vinyl), so "solid"
    // is half-way between the surround and fully opaque.
    const outerAlpha = band.reduce((s, p) => s + p[3], 0) / band.length / 255;
    if (outerAlpha < 0.6) {
      const cut = 255 * (outerAlpha + (1 - outerAlpha) * 0.5);
      const solid = (rf) => ring(rf).filter((p) => p[3] > cut).length / ANG;
      return edgeAt((rf) => solid(rf) > 0.8, "see-through");
    }

    // A solid surround: the disc is where the colour differs from it.
    const ref = [0, 1, 2, 3].map((c) => band.reduce((s, p) => s + p[c], 0) / band.length);
    const dev = (pts) =>
      pts.reduce((s, p) => s + Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]) + Math.abs(p[3] - ref[3]), 0) /
      pts.length;
    if (dev(band) > 28) {
      measureWhy = "the whole picture is the record (its edge isn't a plain background)";
      return 1;
    }
    return edgeAt((rf) => dev(ring(rf)) > 38, "plain");
  }

  // ---- the ripple -----------------------------------------------------------
  // Height of the surface at (x, y), in disc radii from the disc's centre.
  function waveH(x, y, now) {
    const rc = Math.hypot(x, y);
    if (rc >= 1) return 0;
    // Fade out toward the rim: the edge itself never moves.
    const e = Math.min(1, (1 - rc) / WAVE_RIM);
    const rim = e * e * (3 - 2 * e);
    const L = WAVE_LENGTH * WAVE_RINGS;
    const k = (2 * Math.PI) / WAVE_LENGTH;
    let h = 0;
    for (const d of wave.drops) {
      const t = (now - d.t0) / 1000;
      const F = t * WAVE_SPEED; // the outermost ring
      const r = Math.hypot(x - d.x, y - d.y);
      const b = F - r;
      if (b <= 0 || b >= L) continue;
      const env = Math.pow(Math.sin((Math.PI * b) / L), 2);
      // Spreads thinner as it widens, and settles over time.
      const amp = WAVE_HEIGHT * Math.exp(-t / WAVE_LIFE) / Math.sqrt(1 + r / 0.35);
      h += amp * env * Math.sin(k * b);
    }
    return h * rim;
  }

  // Heights on an n x n grid spanning the disc's square (-1..1 both ways).
  function waveGrid(n, now) {
    const out = new Float32Array(n * n);
    const step = 2 / (n - 1);
    for (let i = 0; i < n; i++) {
      const y = -1 + i * step;
      for (let j = 0; j < n; j++) out[i * n + j] = waveH(-1 + j * step, y, now);
    }
    return out;
  }

  function waveAlive(now) {
    const L = WAVE_LENGTH * WAVE_RINGS;
    wave.drops = wave.drops.filter((d) => {
      const t = (now - d.t0) / 1000;
      const far = 1 + Math.hypot(d.x, d.y); // the farthest the ripple has to go
      return t * WAVE_SPEED - L < far && Math.exp(-t / WAVE_LIFE) > 0.04;
    });
    return wave.drops.length > 0;
  }

  // ---- drawing --------------------------------------------------------------
  function waveSpot(el) {
    const parent = el.parentElement;
    const c = recordCircle(el);
    const pb = parent.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    return {
      left: c.cx - w / 2 - pb.left - parent.clientLeft + parent.scrollLeft,
      top: c.cy - h / 2 - pb.top - parent.clientTop + parent.scrollTop,
      w,
      h,
    };
  }

  function waveSetup(el) {
    const parent = el.parentElement;
    if (!parent) return false;
    const spot = waveSpot(el);
    if (!spot.w || !spot.h) return false;
    if (wave.canvas && wave.el === el && wave.canvas.parentElement === parent) return true;
    waveTeardown();
    wave.el = el;
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
      wave.parentPos = true;
    }
    wave.parent = parent;
    const cv = document.createElement("canvas");
    cv.id = "cd-fy-wave";
    cv.style.visibility = "hidden"; // shown on the first frame, together with hiding the record
    wave.canvas = cv;
    wave.ctx = cv.getContext("2d");
    if (!wave.shadeCv) {
      wave.shadeCv = document.createElement("canvas");
      wave.shadeCv.width = wave.shadeCv.height = WAVE_SHADE_RES;
      wave.shadeCtx = wave.shadeCv.getContext("2d");
      wave.shadeImg = wave.shadeCtx.createImageData(WAVE_SHADE_RES, WAVE_SHADE_RES);
    }
    el.insertAdjacentElement("afterend", cv);
    return true;
  }

  // Hide only the disc part of the real record while the canvas stands in.
  function waveMask(el, on) {
    if (on) {
      const r = (wave.rv * 100).toFixed(2);
      const m = `radial-gradient(circle closest-side at 50% 50%, transparent calc(${r}% - 0.5px), #000 ${r}%)`;
      el.style.webkitMaskImage = m;
      el.style.maskImage = m;
      wave.masked = true;
    } else if (wave.masked) {
      el.style.webkitMaskImage = "";
      el.style.maskImage = "";
      wave.masked = false;
    }
  }

  function waveTeardown() {
    if (wave.canvas) wave.canvas.remove();
    wave.canvas = null;
    wave.ctx = null;
    if (wave.el) waveMask(wave.el, false);
    if (wave.parent && wave.parentPos) {
      // The platform may still need the record's box positioned.
      if (!(stage.plat && stage.parent === wave.parent)) wave.parent.style.position = "";
    }
    wave.parent = null;
    wave.parentPos = false;
  }

  function waveEnd() {
    wave.active = false;
    wave.drops = [];
    if (wave.raf) cancelAnimationFrame(wave.raf);
    wave.raf = 0;
    wave.peak = 0;
    const el = wave.el;
    waveTeardown();
    if (el && el.isConnected && tilt.el !== el) tiltWriteRecord(el);
  }

  // Draw the triangle (s0, s1, s2) of the picture onto (d0, d1, d2) of the canvas.
  function waveTri(ctx, img, dpr, s, d) {
    const sx1 = s[2] - s[0], sy1 = s[3] - s[1], sx2 = s[4] - s[0], sy2 = s[5] - s[1];
    const det = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(det) < 1e-9) return;
    const dx1 = d[2] - d[0], dy1 = d[3] - d[1], dx2 = d[4] - d[0], dy2 = d[5] - d[1];
    const a = (dx1 * sy2 - dx2 * sy1) / det;
    const b = (dy1 * sy2 - dy2 * sy1) / det;
    const c = (dx2 * sx1 - dx1 * sx2) / det;
    const dd = (dy2 * sx1 - dy1 * sx2) / det;
    const e = d[0] - a * s[0] - c * s[1];
    const f = d[1] - b * s[0] - dd * s[1];
    // Grow the clip a hair past each edge so neighbouring triangles leave no seam.
    const gx = (d[0] + d[2] + d[4]) / 3;
    const gy = (d[1] + d[3] + d[5]) / 3;
    const grow = (px, py) => {
      const vx = px - gx;
      const vy = py - gy;
      const l = Math.hypot(vx, vy) || 1;
      return [px + (vx / l) * 0.45, py + (vy / l) * 0.45];
    };
    const p0 = grow(d[0], d[1]);
    const p1 = grow(d[2], d[3]);
    const p2 = grow(d[4], d[5]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(dpr * a, dpr * b, dpr * c, dpr * dd, dpr * e, dpr * f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  function waveDraw(now) {
    const el = wave.el;
    const cv = wave.canvas;
    const ctx = wave.ctx;
    const img = el;
    if (!img.complete || !img.naturalWidth) return false;

    // Sit exactly on the record, with its lean and press-down.
    const spot = waveSpot(el);
    const w = spot.w;
    const h = spot.h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    // Size and place it with priority, so no page style can stretch or move it.
    cv.style.setProperty("width", w + "px", "important");
    cv.style.setProperty("height", h + "px", "important");
    cv.style.setProperty("left", spot.left.toFixed(2) + "px", "important");
    cv.style.setProperty("top", spot.top.toFixed(2) + "px", "important");
    cv.style.setProperty("right", "auto", "important");
    cv.style.setProperty("bottom", "auto", "important");
    const s = states.get(el);
    const press = s && s.scale !== undefined && s.scale !== 1 ? ` scale(${s.scale.toFixed(4)})` : "";
    cv.style.setProperty("transform", (tiltPrefix(el) + press).trim() || "none", "important");
    cv.style.setProperty("--ds-disc", (wave.rv * 50).toFixed(3) + "%");

    const cx = w / 2;
    const cy = h / 2;
    const R = (Math.min(w, h) / 2) * wave.rv; // the disc's radius, px
    const spin = s ? (s.angle * Math.PI) / 180 : 0;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    // Picture px per box px (object-fit: cover).
    // (times the zoom that makes a pictured record fill the CD)
    const fit = Math.max(img.naturalWidth / w, img.naturalHeight / h) * wave.zoom;
    const offX = (img.naturalWidth - w * fit) / 2;
    const offY = (img.naturalHeight - h * fit) / 2;
    // Box position (px) -> the picture pixel that the spinning record shows there.
    const tex = (x, y) => {
      const vx = x - cx;
      const vy = y - cy;
      const ux = vx * cs + vy * sn + cx;
      const uy = -vx * sn + vy * cs + cy;
      return [ux * fit + offX, uy * fit + offY];
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // 1. The record as it is (spun), under everything: no seam can show through.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.translate(-cx, -cy);
    ctx.drawImage(img, offX, offY, w * fit, h * fit, 0, 0, w, h);
    ctx.restore();

    // 2. The rippled surface: a mesh whose corners the ripple pushes and pulls.
    const G = WAVE_GRID;
    const cell = (2 * R) / G;
    const N = G + 1;
    const hv = waveGrid(N, now);
    const inv = G / 4; // 1 / (2 * cell in radii)
    const vx = new Float32Array(N * N);
    const vy = new Float32Array(N * N);
    const moved = new Uint8Array(N * N);
    let peak = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        const px = cx - R + j * cell;
        const py = cy - R + i * cell;
        const x = (px - cx) / R;
        const y = (py - cy) / R;
        let ox = 0;
        let oy = 0;
        if (Math.hypot(x, y) < 1) {
          const gx = (hv[i * N + Math.min(G, j + 1)] - hv[i * N + Math.max(0, j - 1)]) * inv;
          const gy = (hv[Math.min(G, i + 1) * N + j] - hv[Math.max(0, i - 1) * N + j]) * inv;
          // The picture shifts down the slope, like the surface of water bending it.
          ox = -WAVE_SHIFT * gx * R;
          oy = -WAVE_SHIFT * gy * R;
          const m = Math.hypot(ox, oy);
          if (m > 0.03) moved[k] = 1;
          if (m > peak) peak = m;
        }
        vx[k] = px + ox;
        vy[k] = py + oy;
      }
    }
    const sp = new Float64Array(6);
    const dp = new Float64Array(6);
    const tri = (k0, k1, k2, i0, j0, i1, j1, i2, j2) => {
      if (!(moved[k0] || moved[k1] || moved[k2])) return; // the base layer already shows it
      const t0 = tex(cx - R + j0 * cell, cy - R + i0 * cell);
      const t1 = tex(cx - R + j1 * cell, cy - R + i1 * cell);
      const t2 = tex(cx - R + j2 * cell, cy - R + i2 * cell);
      sp[0] = t0[0]; sp[1] = t0[1]; sp[2] = t1[0]; sp[3] = t1[1]; sp[4] = t2[0]; sp[5] = t2[1];
      dp[0] = vx[k0]; dp[1] = vy[k0]; dp[2] = vx[k1]; dp[3] = vy[k1]; dp[4] = vx[k2]; dp[5] = vy[k2];
      waveTri(ctx, img, dpr, sp, dp);
    };
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const k = i * N + j;
        tri(k, k + 1, k + N, i, j, i, j + 1, i + 1, j);
        tri(k + 1, k + N + 1, k + N, i, j + 1, i + 1, j + 1, i + 1, j);
      }
    }
    wave.peak = peak;

    // 3. Light and shade from the slope, smooth, laid over with soft light.
    const res = WAVE_SHADE_RES;
    const data = wave.shadeImg.data;
    const step = 2 / (res - 1);
    const hs = waveGrid(res, now);
    const sinv = 1 / (2 * step);
    for (let i = 0; i < res; i++) {
      const y = -1 + i * step;
      for (let j = 0; j < res; j++) {
        const x = -1 + j * step;
        const k = (i * res + j) * 4;
        if (x * x + y * y >= 1) {
          data[k + 3] = 0;
          continue;
        }
        const gx = (hs[i * res + Math.min(res - 1, j + 1)] - hs[i * res + Math.max(0, j - 1)]) * sinv;
        const gy = (hs[Math.min(res - 1, i + 1) * res + j] - hs[Math.max(0, i - 1) * res + j]) * sinv;
        // Slopes facing the light brighten, slopes facing away darken.
        const lit = Math.max(-1, Math.min(1, -(gx * WAVE_LIGHT[0] + gy * WAVE_LIGHT[1]) * WAVE_SHINE * 2));
        const v = Math.round(128 + lit * 127);
        data[k] = v;
        data[k + 1] = v;
        data[k + 2] = v;
        data[k + 3] = 255;
      }
    }
    wave.shadeCtx.putImageData(wave.shadeImg, 0, 0);
    ctx.restore();

    // Soft light turns fully transparent pixels mid-grey, so the shading may only
    // touch pixels the cover actually has: a cover with a transparent surround
    // (or one whose disc edge couldn't be found) would otherwise get a grey ring.
    // Cut the shading to the picture just drawn, then lay it on.
    const lay = wave.layer || (wave.layer = document.createElement("canvas"));
    if (lay.width !== cv.width || lay.height !== cv.height) {
      lay.width = cv.width;
      lay.height = cv.height;
    }
    const lc = lay.getContext("2d");
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = "source-over";
    lc.clearRect(0, 0, lay.width, lay.height);
    lc.imageSmoothingEnabled = true;
    lc.drawImage(wave.shadeCv, (cx - R) * dpr, (cy - R) * dpr, 2 * R * dpr, 2 * R * dpr);
    lc.globalCompositeOperation = "destination-in";
    lc.drawImage(cv, 0, 0);
    lc.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "soft-light";
    ctx.drawImage(lay, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    return true;
  }

  function waveFrame() {
    const el = wave.el;
    const now = performance.now();
    // A ripple already running dies away on its own, even if the CD starts spinning meanwhile.
    if (!el || !el.isConnected || !wave.canvas || !(S.enabled && S.wave && isPlaylistPage()) || !waveAlive(now)) {
      waveEnd();
      return;
    }
    // The disc edge may have been measured since the click.
    const rv = discFrac(wave.src);
    wave.zoom = zoomOf(wave.src);
    if (rv !== wave.rv) {
      wave.rv = rv;
      if (wave.masked) waveMask(el, true);
    }
    if (waveDraw(now) && !wave.masked) {
      waveMask(el, true);
      wave.canvas.style.visibility = "";
    }
    wave.raf = requestAnimationFrame(waveFrame);
  }

  function wavePress(e) {
    if (e.button !== 0) return;
    const el = tiltTarget(e.target);
    if (!el) return; // not the header record: nothing to say
    if (!waveAllowed())
      return waveLog(
        !S.wave ? "turned off in the menu" : !S.enabled ? "cd-fy is disabled" : !isPlaylistPage() ? "not a playlist page" : "the CD is spinning (scratch it instead)"
      );
    if (el.tagName !== "IMG") return waveLog("the header record is not an <img> (" + el.tagName + ")");
    detectVinyl(el);
    const src = el.currentSrc || el.src;
    const rv = discFrac(src);
    const m = tiltMeasure(el, e.clientX, e.clientY);
    if (m.d > rv) return; // only on the disc itself, not the picture's background around it
    e.preventDefault(); // no image drag, no text selection
    lastDiscPress = performance.now();
    if (wave.el !== el || wave.src !== src) waveEnd();
    if (!waveSetup(el)) return waveLog("the record has no size yet");
    wave.src = src;
    wave.rv = rv;
    wave.zoom = zoomOf(src);
    // The drop, in disc radii from the disc's centre (fixed to the screen, not the spinning picture).
    wave.drops.push({ x: m.dx / rv, y: m.dy / rv, t0: performance.now() });
    if (wave.drops.length > 6) wave.drops.shift();
    if (!wave.active) {
      wave.active = true;
      wave.raf = requestAnimationFrame(waveFrame);
    }
  }

  // Window capture: runs before anything on the page can swallow the press.
  window.addEventListener("mousedown", wavePress, true);

  // -------------------------------- platform -------------------------------
  // The header CD sits on a platform, as on a DJ deck: three stacked black
  // metal plates, each with a bare stainless-steel edge. The top plate is the
  // CD's own size, its steel edge just showing around the CD; the two below
  // each step out a little further. The CD itself keeps exactly the size of
  // the playlist picture, and the platform stays still while the CD spins.
  //
  // Under the CD is its own shadow: tight while it rests on the platform,
  // farther and softer as it lifts toward the cursor, tighter still when it's
  // pressed down to scratch.
  //
  // Layers, back to front, all inside the picture's own box:
  //   platform 0, CD shadow 1, CD (the picture) 2, click wave 3.
  const PLAT_STEP = [8, 5, 2]; // px each plate reaches past the CD: bottom, middle, top
  const stage = {
    rec: null, parent: null, plat: null, shadow: null, ro: null,
    keep: null, // the inline styles we changed on Spotify's elements, to put back
    key: "",
  };

  const stageAllowed = () => S.enabled && S.platform && document.body.classList.contains("cd-fy-header");

  const layer = (id, html) => {
    const d = document.createElement("div");
    d.id = id;
    d.className = "cdfy-layer";
    if (html) d.innerHTML = html;
    return d;
  };

  function stageBuild(el) {
    const parent = el.parentElement;
    const pcs = getComputedStyle(parent);
    const ics = getComputedStyle(el);
    stage.keep = {
      pPos: parent.style.getPropertyValue("position"),
      pIso: parent.style.getPropertyValue("isolation"),
      pOver: parent.style.getPropertyValue("overflow"),
      iPos: el.style.getPropertyValue("position"),
      iZ: el.style.getPropertyValue("z-index"),
    };
    // Its own layer stack, and room for the platform past the picture's edge.
    if (pcs.position === "static") parent.style.setProperty("position", "relative");
    parent.style.setProperty("isolation", "isolate");
    if (pcs.overflow !== "visible") parent.style.setProperty("overflow", "visible", "important");
    // The CD above the platform and its shadow.
    if (ics.position === "static") el.style.setProperty("position", "relative");
    el.style.setProperty("z-index", "2");

    // Each plate sits inside the one below it, stepped in.
    const out = PLAT_STEP[0];
    // Each plate's steel shows only as the ring between it and the plate (or CD) above.
    const plates = PLAT_STEP.map((step, i) => {
      const ring = step - (PLAT_STEP[i + 1] || 0);
      return `<div class="cdfy-plate cdfy-plate-${i + 1}" style="inset:${out - step}px"><div class="cdfy-face" style="inset:${ring}px"></div></div>`;
    }).join("");
    stage.plat = layer("cd-fy-platform", plates);
    stage.shadow = layer("cd-fy-cdshadow");
    el.before(stage.plat, stage.shadow);
    el.classList.add("cdfy-round");
    stage.rec = el;
    stage.parent = parent;
    stage.key = "";
    if (window.ResizeObserver) {
      stage.ro = new ResizeObserver(() => stagePlace());
      stage.ro.observe(el);
    }
  }

  function stageTeardown() {
    if (stage.ro) stage.ro.disconnect();
    if (stage.plat) stage.plat.remove();
    if (stage.shadow) stage.shadow.remove();
    const el = stage.rec;
    const p = stage.parent;
    const k = stage.keep;
    const put = (node, prop, v) => (v ? node.style.setProperty(prop, v) : node.style.removeProperty(prop));
    if (el) {
      el.classList.remove("cdfy-round");
      if (k) {
        put(el, "position", k.iPos);
        put(el, "z-index", k.iZ);
      }
    }
    if (p && k) {
      put(p, "isolation", k.pIso);
      put(p, "overflow", k.pOver);
      // The click wave may still need the box positioned.
      if (!(wave.canvas && wave.parent === p)) put(p, "position", k.pPos);
    }
    Object.assign(stage, { rec: null, parent: null, plat: null, shadow: null, ro: null, keep: null, key: "" });
  }

  // Centre the platform and the CD's shadow on the CD.
  function stagePlace() {
    const el = stage.rec;
    if (!el || !el.isConnected || !stage.plat) return;
    const spot = waveSpot(el);
    const D = Math.min(spot.w, spot.h);
    if (!D) return;
    const cx = spot.left + spot.w / 2;
    const cy = spot.top + spot.h / 2;
    const R = (D / 2) * discFrac(el.currentSrc || el.src); // the CD's radius
    const put = (box, r) => {
      box.style.setProperty("left", (cx - r).toFixed(2) + "px", "important");
      box.style.setProperty("top", (cy - r).toFixed(2) + "px", "important");
      box.style.setProperty("width", (2 * r).toFixed(2) + "px", "important");
      box.style.setProperty("height", (2 * r).toFixed(2) + "px", "important");
    };
    put(stage.plat, R + PLAT_STEP[0]);
    put(stage.shadow, R);
    stage.key = "";
  }

  // The CD's shadow follows its lift and press-down. Called whenever its transform is written.
  function sheenFollow(el) {
    if (!stage.rec || el !== stage.rec || !stage.shadow) return;
    const s = states.get(el);
    const sc = s && s.scale !== undefined ? s.scale : 1;
    const on = tilt.el === el;
    const rx = on ? tilt.rx : 0;
    const ry = on ? tilt.ry : 0;
    const h = on ? tilt.h : 0; // lift: 0 resting on the platform, 1 hovering; dips just below 0 as it lands
    const press = Math.max(0, Math.min(1, (1 - sc) / (1 - PRESS_SCALE)));
    const key = rx.toFixed(2) + "|" + ry.toFixed(2) + "|" + h.toFixed(4) + "|" + press.toFixed(3);
    if (key === stage.key) return;
    stage.key = key;
    // Light from the upper left: the shadow falls to the lower right.
    const x = 0.6 + 6 * h + ry * 0.1;
    const y = 1.6 + 12 * h - rx * 0.1 - 1 * press;
    const blur = Math.max(1, 2.5 + 12 * h - 1.5 * press);
    const a = Math.min(0.85, 0.7 - 0.25 * h + 0.1 * press);
    stage.shadow.style.setProperty("transform", `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`, "important");
    stage.shadow.style.setProperty("filter", `blur(${blur.toFixed(2)}px)`, "important");
    stage.shadow.style.setProperty("opacity", a.toFixed(3), "important");
  }

  // From tick: set the platform up under the header CD, or take it away.
  function sheenSync() {
    const cand = stageAllowed() ? headerEls()[0] : null;
    const el = cand && cand.tagName === "IMG" && cand.parentElement ? cand : null;
    if (stage.rec && (stage.rec !== el || !stage.rec.isConnected || !stage.plat.isConnected)) stageTeardown();
    if (!el) return;
    if (!stage.rec) stageBuild(el);
    stagePlace();
    sheenFollow(el);
  }

  // ------------------------------ main loop --------------------------------
  let headerInUse = false;
  let lastCheckPath = "";
  let lastCheckUri = "";

  function tick(force) {
    const playing = S.enabled && isPlaying();
    const ctx = getContext();
    const currentP = currentPath();
    const uri = ctx ? ctx.uri : "";

    // Spotify in the background: nothing to show, so don't do the work.
    if (document.hidden) return;

    // Is the header record in use? Then it gets the record styling and is
    // trimmed to the disc in its picture; otherwise it's left as Spotify draws it.
    const onPlaylist = isPlaylistPage();
    const hdr = headerEls();
    const inUse = S.enabled && onPlaylist && (S.tilt || S.wave || S.platform || hdr.some((el) => running.has(el)));
    if (inUse !== headerInUse) {
      headerInUse = inUse;
      document.body.classList.toggle("cd-fy-header", inUse);
    }
    if (inUse) hdr.forEach(detectVinyl);
    else hdr.forEach(vinylUnfit);
    sheenSync();
    // Playback started: a lifted CD drops back onto its platform.
    if (tilt.el && tilt.th > 0 && !tiltAllowed()) tiltSettle();

    const pathOrUriChanged = currentP !== lastCheckPath || uri !== lastCheckUri;
    if (pathOrUriChanged) {
      lastCheckPath = currentP;
      lastCheckUri = uri;
    }

    if (!playing) {
      if (running.size > 0) {
        running.forEach((el) => {
          if (!activeScratch || activeScratch.el !== el) {
            stop(el);
          }
        });
      }
      return;
    }

    const want = new Set();
    if (ctx && ctx.type === "playlist") {
      if (S.header && currentP.includes(`/${ctx.type}/${ctx.id}`)) {
        headerEls().forEach((e) => want.add(e));
      }
      if (S.sidebar) {
        sidebarImgs().forEach((img) => {
          if (rowMatches(img, ctx.id)) want.add(img);
        });
      }
      if (S.everywhere) {
        pageCovers(ctx.id).forEach((e) => want.add(e));
      }
    }

    running.forEach((el) => {
      if (!el.isConnected) running.delete(el);
      else if (!want.has(el) && (!activeScratch || activeScratch.el !== el)) stop(el);
    });
    want.forEach(start);
  }

  setInterval(() => tick(false), 400);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick(true);
  });
  Spicetify.Player.addEventListener("onplaypause", () => tick(true));
  Spicetify.Player.addEventListener("songchange", () => tick(true));
  if (Spicetify.Platform.History && Spicetify.Platform.History.listen) {
    Spicetify.Platform.History.listen(() => {
      setTimeout(() => tick(true), 60);
      if (!tiltAllowed()) tiltSettle();
    });
  }
  tick(true);

  // ------------------------------- menu ------------------------------------
  const menuItems = {};

  function getMenuDef() {
    return {
      enabled: {
        text: S.enabled ? "disable cd-fy." : "enable cd-fy.",
        active: S.enabled,
        isTitle: false,
      },
      speedLabel: {
        text: "speed.",
        active: false,
        isTitle: true,
      },
      rpm10: {
        text: "slow : ten rpm",
        active: S.rpm === 10,
        isTitle: false,
      },
      rpm30: {
        text: "medium : thirty rpm",
        active: S.rpm === 30,
        isTitle: false,
      },
      rpm50: {
        text: "fast : fifty rpm",
        active: S.rpm === 50,
        isTitle: false,
      },
      behaviorLabel: {
        text: "behaviour.",
        active: false,
        isTitle: true,
      },
      dir: {
        text: `direction : ${S.dir > 0 ? "clockwise" : "counter-clockwise"}`,
        active: S.dir > 0,
        isTitle: false,
      },
      smooth: {
        text: "smooth ramp",
        active: S.smooth,
        isTitle: false,
      },
      home: {
        text: "return to start on pause",
        active: S.home,
        isTitle: false,
      },
      wobble: {
        text: "needle wobble",
        active: S.wobble,
        isTitle: false,
      },
      fx: {
        text: "scratch press-down",
        active: S.fx,
        isTitle: false,
      },
      tilt: {
        text: "hover tilt (playlist page)",
        active: S.tilt,
        isTitle: false,
      },
      wave: {
        text: "click wave (playlist page)",
        active: S.wave,
        isTitle: false,
      },
      fitReset: {
        text: "reset CD fit (this playlist)",
        active: false,
        isTitle: false,
      },
      platform: {
        text: "platform (playlist page)",
        active: S.platform,
        isTitle: false,
      },
      whereLabel: {
        text: "where to spin.",
        active: false,
        isTitle: true,
      },
      header: {
        text: "playlist header",
        active: S.header,
        isTitle: false,
      },
      sidebar: {
        text: "sidebar",
        active: S.sidebar,
        isTitle: false,
      },
      everywhere: {
        text: "home, search & shelves",
        active: S.everywhere,
        isTitle: false,
      },
      reset: {
        text: "reset to defaults.",
        active: false,
        isTitle: false,
      },
    };
  }

  function applyDomStyles() {
    const defs = getMenuDef();
    const allDefs = Object.values(defs);
    const buttons = document.querySelectorAll(
      '[role="menu"] button[role="menuitem"], [role="menu"] [role="menuitem"], .main-contextMenu-menuItemButton'
    );

    buttons.forEach((btn) => {
      const spans = Array.from(btn.querySelectorAll("span"));
      let targetSpan = null;
      let matchedDef = null;

      for (const def of allDefs) {
        const found = spans.find((s) => {
          const t = (s.textContent || "").trim();
          return t === def.text || (def.isTitle && (t === "behavior." || t === "behaviour."));
        });
        if (found) {
          targetSpan = found;
          matchedDef = def;
          break;
        }
      }

      if (!matchedDef) {
        const btnTxt = (btn.textContent || "").trim();
        for (const def of allDefs) {
          if (btnTxt === def.text || (def.isTitle && (btnTxt === "behavior." || btnTxt === "behaviour."))) {
            targetSpan = btn.querySelector("span") || btn;
            matchedDef = def;
            break;
          }
        }
      }

      if (matchedDef && targetSpan) {
        if (matchedDef.isTitle) {
          targetSpan.style.fontWeight = "700";
          targetSpan.style.color = "#ffffff";
          targetSpan.style.letterSpacing = "0.3px";
          targetSpan.style.userSelect = "none";
          btn.style.cursor = "default";
          btn.style.pointerEvents = "none";
          btn.style.userSelect = "none";
          btn.tabIndex = -1;
          btn.setAttribute("aria-disabled", "true");
          if (btn.parentElement && (btn.parentElement.tagName === "LI" || btn.parentElement.getAttribute("role") === "presentation")) {
            btn.parentElement.style.pointerEvents = "none";
          }
        } else {
          if (matchedDef.active) {
            targetSpan.style.color = "#1ed760";
            targetSpan.style.fontWeight = "600";
          } else {
            targetSpan.style.color = "rgba(255, 255, 255, 0.65)";
            targetSpan.style.fontWeight = "400";
          }
        }
      }
    });
  }

  function refreshMenu() {
    const defs = getMenuDef();
    Object.keys(defs).forEach((k) => {
      const it = menuItems[k];
      if (!it) return;
      const def = defs[k];
      try {
        if (typeof it.setName === "function") it.setName(def.text);
      } catch (e) {}
      try {
        if (it.name !== undefined) it.name = def.text;
      } catch (e) {}
      try {
        if (it.children !== undefined) it.children = def.text;
      } catch (e) {}
    });
    applyDomStyles();
  }

  function setRpm(v, announce) {
    S.rpm = v;
    save();
    refreshMenu();
    if (announce) toast(`cd-fy : ${fmtRpm(S.rpm)} rpm`);
  }

  function stepRpm(delta) {
    const i = RPM_PRESETS.indexOf(S.rpm);
    const j = Math.min(RPM_PRESETS.length - 1, Math.max(0, i + delta));
    if (j !== i) setRpm(RPM_PRESETS[j], true);
    else toast(`cd-fy : ${fmtRpm(S.rpm)} rpm (${delta > 0 ? "max" : "min"})`);
  }

  const TOAST_NAMES = {
    enabled: "cd-fy",
    smooth: "smooth ramp",
    home: "return to start",
    wobble: "needle wobble",
    fx: "scratch press-down",
    tilt: "hover tilt",
    wave: "click wave",
    platform: "platform",
    header: "playlist header",
    sidebar: "sidebar",
    everywhere: "home & shelves",
  };

  function toggle(key) {
    S[key] = !S[key];
    save();
    refreshMenu();
    tick(true);
    if (key === "tilt" || key === "enabled") tiltSettle();
    if ((key === "wave" || key === "enabled") && !S[key]) waveEnd();
    const label = TOAST_NAMES[key] || key;
    if (key === "enabled") {
      toast(`cd-fy : ${S.enabled ? "enabled" : "disabled"}`);
    } else {
      toast(`cd-fy : ${label} ${S[key] ? "on" : "off"}`);
    }
  }

  try {
    if (Spicetify.Menu && Spicetify.Menu.Item && Spicetify.Menu.SubMenu) {
      const defs = getMenuDef();
      const mk = (key, fn) => (menuItems[key] = new Spicetify.Menu.Item(defs[key].text, false, fn));
      const sep = (key) => (menuItems[key] = new Spicetify.Menu.Item(defs[key].text, false, () => {}));
      const list = [
        mk("enabled",       () => toggle("enabled")),
        sep("speedLabel"),
        mk("rpm10",         () => setRpm(10, true)),
        mk("rpm30",         () => setRpm(30, true)),
        mk("rpm50",         () => setRpm(50, true)),
        sep("behaviorLabel"),
        mk("dir",           () => {
          S.dir = -S.dir;
          save();
          refreshMenu();
          toast(`cd-fy : direction ${S.dir > 0 ? "clockwise" : "counter-clockwise"}`);
        }),
        mk("smooth",        () => toggle("smooth")),
        mk("home",          () => toggle("home")),
        mk("wobble",        () => toggle("wobble")),
        mk("fx",            () => toggle("fx")),
        mk("tilt",          () => toggle("tilt")),
        mk("wave",          () => toggle("wave")),
        mk("platform",      () => toggle("platform")),
        mk("fitReset",      () => {
          const k = fitKey();
          if (k && S.fits && S.fits[k]) {
            const f = Object.assign({}, S.fits);
            delete f[k];
            S.fits = f;
            save();
            headerEls().forEach(vinylFit);
            stagePlace();
          }
          toast("cd-fy : CD fit reset for this playlist");
        }),
        sep("whereLabel"),
        mk("header",        () => toggle("header")),
        mk("sidebar",       () => toggle("sidebar")),
        mk("everywhere",    () => toggle("everywhere")),
        mk("reset",         () => {
          Object.assign(S, DEFAULTS);
          save();
          refreshMenu();
          tick(true);
          tiltSettle();
          waveEnd();
          toast("cd-fy : settings reset");
        }),
      ];
      new Spicetify.Menu.SubMenu("cd-fy", list).register();
    }
  } catch (e) {
    console.warn("[cd-fy] menu unavailable", e);
  }

  // DOM observer to apply styles whenever menus open
  let domRaf = 0;
  const domObserver = new MutationObserver(() => {
    if (document.querySelector('[role="menu"], .main-contextMenu-menu')) {
      if (!domRaf) {
        domRaf = requestAnimationFrame(() => {
          applyDomStyles();
          domRaf = 0;
        });
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  // keyboard: Ctrl+Alt+Up / Down = next faster / slower preset
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey && e.altKey)) return;
    if (e.key === "ArrowUp") { e.preventDefault(); stepRpm(1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); stepRpm(-1); }
  });

  window.cdfyDebug = function () {
    const ctx = getContext();
    const info = {
      settings: Object.assign({}, S),
      playing: isPlaying(),
      context: ctx,
      path: currentPath(),
      headerElements: headerEls().length,
      sidebarImages: sidebarImgs().length,
      sidebarMatches: ctx ? sidebarImgs().filter((i) => rowMatches(i, ctx.id)).length : 0,
      menu: !!Object.keys(menuItems).length,
      tilt: { active: !!tilt.el, rotateX: +tilt.rx.toFixed(2), rotateY: +tilt.ry.toFixed(2) },
      stage: {
        platform: !!stage.plat,
        fitByHand: (S.fits && S.fits[fitKey()]) || "none",
        cover: (() => {
          const el = headerEls()[0];
          const src = el && (el.currentSrc || el.src);
          if (!src) return "no header picture found";
          return {
            picture: src.replace(/^https?:\/\//, "").slice(0, 60),
            size: el.naturalWidth + "x" + el.naturalHeight,
            measured: vinylWhy.get(src) || "not measured yet",
            zoomedTo: ZOOM_OK ? (el.style.objectViewBox || "whole picture") : "zoom not supported",
          };
        })(),
        lift: +tilt.h.toFixed(3),
        shadow: stage.shadow ? stage.shadow.style.transform + " " + stage.shadow.style.filter : "",
        zoom: ZOOM_OK,
      },
      wave: { active: wave.active, drops: wave.drops.length, shiftPx: +wave.peak.toFixed(3), discEdge: wave.el ? vinylEdge.get(wave.src) : null },
    };
    console.log(info);
    return info;
  };
})();
