'use strict';
// Boot, main loop, state transitions and input (keyboard, touch, gamepad).
(function () {
  const NF = globalThis.NF;
  const U = NF.util, D = NF.draw, A = NF.audio;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scr = { s: 1, x: 0, y: 0, cw: 1280, ch: 720 };
  NF.screen = scr;
  NF.save.load();

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const s = Math.min(canvas.width / 1280, canvas.height / 720);
    scr.s = s;
    scr.x = Math.round((canvas.width - 1280 * s) / 2);
    scr.y = Math.round((canvas.height - 720 * s) / 2);
    scr.cw = canvas.width;
    scr.ch = canvas.height;
    scr.portrait = h > w * 1.1;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- state manager + transitions
  const G = (NF.game = {
    state: null,
    pending: null,
    trans: 0, // 0 = clear, 1 = fully covered
    phase: 'none', // 'out' | 'in' | 'none'
    set(st) {
      if (G.state && G.state.exit) G.state.exit();
      G.state = st;
      if (st.enter) st.enter();
    },
    go(st) {
      G.pending = st;
      if (G.phase === 'none' || G.phase === 'in') G.phase = 'out';
    },
    tick(dt) {
      if (G.phase === 'out') {
        G.trans = Math.min(1, G.trans + dt / 0.32);
        if (G.trans >= 1) {
          const st = G.pending;
          G.pending = null;
          if (st) G.set(st);
          G.phase = 'in';
        }
      } else if (G.phase === 'in') {
        G.trans = Math.max(0, G.trans - dt / 0.32);
        if (G.trans <= 0) G.phase = 'none';
      }
    },
    get busy() {
      return G.phase === 'out';
    },
  });
  function drawTransition() {
    if (G.trans <= 0) return;
    // diagonal gradient wipe, FNF style
    const k = U.ease.inOutQuad(G.trans);
    const h = 720 + 300;
    const y = G.phase === 'out' ? -h + k * h : 720 - k * h;
    ctx.save();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.28, '#000');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 1280, h + 300);
    ctx.restore();
  }

  // ---------------------------------------------------------------- input
  const UI_KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Escape: 'back', Backspace: 'back', KeyP: 'pause',
  };
  const REPEATABLE = { up: 1, down: 1, left: 1, right: 1 };
  const input = (NF.input = { queue: [], capture: null, touch: false, touches: new Map(), padHeld: {}, padPrev: [] });
  const laneOf = (code) => {
    const keys = NF.save.data.keys;
    for (let l = 0; l < 4; l++) if (keys[l][0] === code || keys[l][1] === code) return l;
    return -1;
  };
  const lanesLive = () => {
    const st = G.state;
    return st && st.lanesActive && !st.paused && G.phase !== 'out';
  };
  function unlock() {
    if (!A.ready) {
      A.init();
      A.applyVolumes();
    } else if (A.ctx && A.ctx.state === 'suspended' && !document.hidden) A.ctx.resume();
  }
  window.addEventListener('keydown', (e) => {
    unlock();
    if (input.capture) {
      e.preventDefault();
      const cb = input.capture;
      input.capture = null;
      cb(e.code);
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    const lane = laneOf(e.code);
    if (lane >= 0 && lanesLive()) {
      e.preventDefault();
      if (!e.repeat) {
        const lag = U.clamp((performance.now() - e.timeStamp) / 1000, 0, 0.1);
        G.state.onLanePress(lane, lag);
      }
      return;
    }
    if (lane >= 0 && G.state && G.state.onLanePress && !e.repeat) G.state.onLanePress(lane, 0);
    const act = UI_KEYS[e.code];
    if (act) {
      e.preventDefault();
      if (!e.repeat || REPEATABLE[act]) input.queue.push(act);
    }
  });
  window.addEventListener('keyup', (e) => {
    const lane = laneOf(e.code);
    if (lane >= 0 && G.state && G.state.onLaneRelease) G.state.onLaneRelease(lane);
  });

  function toLogical(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const px = ((cx - r.left) / r.width) * canvas.width, py = ((cy - r.top) / r.height) * canvas.height;
    return { x: (px - scr.x) / scr.s, y: (py - scr.y) / scr.s };
  }
  // Virtual pad for menus on touch screens.
  const PAD = [
    { act: 'up', x: 150, y: 512, r: 46, label: '▲' },
    { act: 'down', x: 150, y: 652, r: 46, label: '▼' },
    { act: 'left', x: 80, y: 582, r: 46, label: '◄' },
    { act: 'right', x: 220, y: 582, r: 46, label: '►' },
    { act: 'accept', x: 1160, y: 600, r: 58, label: '✔' },
    { act: 'back', x: 1040, y: 650, r: 42, label: '✖' },
  ];
  const PAUSE_BTN = { x: 1226, y: 54, r: 38 };
  const padWanted = () => input.touch && G.state && !lanesLive() && !(G.state instanceof NF.Splash);
  function touchStart(id, p) {
    const st = G.state;
    if (!st) return;
    if (lanesLive()) {
      if (Math.hypot(p.x - PAUSE_BTN.x, p.y - PAUSE_BTN.y) < PAUSE_BTN.r + 10 && st.onAction) {
        input.queue.push('pause');
        return;
      }
      const lane = U.clamp(Math.floor((p.x / 1280) * 4), 0, 3);
      input.touches.set(id, { lane });
      st.onLanePress(lane, 0);
      return;
    }
    if (padWanted()) {
      for (const b of PAD) {
        if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 12) {
          input.queue.push(b.act);
          input.touches.set(id, { pad: b, t: 0 });
          return;
        }
      }
    }
    if (st.onClick) st.onClick(p);
    else if (st.phase === 'dialogue' || st.phase === 'outro' || st.phase === 'dead') input.queue.push('accept');
  }
  function touchEnd(id) {
    const tt = input.touches.get(id);
    input.touches.delete(id);
    if (tt && tt.lane != null && G.state && G.state.onLaneRelease) G.state.onLaneRelease(tt.lane);
  }
  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      unlock();
      input.touch = true;
      for (const t of e.changedTouches) touchStart(t.identifier, toLogical(t.clientX, t.clientY));
    },
    { passive: false }
  );
  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) touchEnd(t.identifier);
  });
  canvas.addEventListener('touchcancel', (e) => {
    for (const t of e.changedTouches) touchEnd(t.identifier);
  });
  canvas.addEventListener('mousedown', (e) => {
    canvas.focus();
    unlock();
    if (input.touch) return;
    const p = toLogical(e.clientX, e.clientY);
    const st = G.state;
    if (st && st.onClick) st.onClick(p);
    else if (st && (st.phase === 'dialogue' || st.phase === 'outro')) input.queue.push('accept');
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (lanesLive()) return;
      e.preventDefault();
      input.queue.push(e.deltaY > 0 ? 'down' : 'up');
    },
    { passive: false }
  );
  function pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find((p) => p);
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes || [];
    const now = {
      up: b(12) || ax[1] < -0.6, down: b(13) || ax[1] > 0.6, left: b(14) || ax[0] < -0.6, right: b(15) || ax[0] > 0.6,
      a: b(0), bb: b(1), x: b(2), y: b(3), start: b(9),
    };
    const prev = input.padPrev;
    const edge = (k) => now[k] && !prev[k];
    if (lanesLive()) {
      const map = [['left', 0], ['down', 1], ['up', 2], ['right', 3], ['x', 0], ['a', 1], ['y', 2], ['bb', 3]];
      for (const [k, lane] of map) {
        if (edge(k)) G.state.onLanePress(lane, 0);
        if (!now[k] && prev[k]) G.state.onLaneRelease(lane);
      }
      if (edge('start')) input.queue.push('pause');
    } else {
      for (const k of ['up', 'down', 'left', 'right']) {
        if (edge(k)) {
          input.queue.push(k);
          input.padHeld[k] = -0.35;
        } else if (now[k]) {
          input.padHeld[k] += dt;
          if (input.padHeld[k] > 0.09) {
            input.padHeld[k] = 0;
            input.queue.push(k);
          }
        }
      }
      if (edge('a') || edge('start')) input.queue.push('accept');
      if (edge('bb')) input.queue.push('back');
    }
    input.padPrev = now;
  }

  function onBlur() {
    const st = G.state;
    if (st && st.pause && st.phase === 'play' && !st.paused && !st.botplay) st.pause();
  }
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', () => {
    if (!A.ctx) return;
    if (document.hidden) {
      onBlur();
      A.ctx.suspend();
    } else A.ctx.resume();
  });

  // ---------------------------------------------------------------- loop
  let last = performance.now(), fps = 60, fpsAcc = 0, fpsN = 0;
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    fpsAcc += dt;
    fpsN++;
    if (fpsAcc > 0.5) {
      fps = fpsN / fpsAcc;
      fpsAcc = 0;
      fpsN = 0;
    }
    A.tick();
    pollGamepad(dt);
    const acts = input.queue.splice(0);
    if (!G.busy && G.state && G.state.onAction) for (const a of acts) G.state.onAction(a);
    if (G.state) G.state.update(dt);
    G.tick(dt);
    render();
    requestAnimationFrame(frame);
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, scr.cw, scr.ch);
    ctx.setTransform(scr.s, 0, 0, scr.s, scr.x, scr.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 1280, 720);
    ctx.clip();
    if (G.state) G.state.render(ctx, scr);
    ctx.setTransform(scr.s, 0, 0, scr.s, scr.x, scr.y);
    drawTransition();
    if (input.touch) drawTouchUI();
    if (NF.save.opt.fps) D.text(ctx, Math.round(fps) + ' FPS', 12, 30, { size: 24, font: D.HUD, fill: '#ffffff', lw: 4 });
    if (scr.portrait && input.touch) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 300, 1280, 120);
      D.text(ctx, 'Gira tu teléfono para jugar mejor ↻', 640, 375, { size: 44, align: 'center', fill: '#ffd23f', lw: 7 });
    }
    ctx.restore();
  }
  function drawTouchUI() {
    ctx.save();
    if (lanesLive()) {
      for (let l = 0; l < 4; l++) {
        const held = G.state.keys && G.state.keys[l];
        ctx.fillStyle = U.rgba(D.LANE_COLORS[l], held ? 0.16 : 0.05);
        ctx.fillRect(l * 320, 0, 320, 720);
        ctx.fillStyle = U.rgba(D.LANE_COLORS[l], 0.35);
        ctx.fillRect(l * 320 + 4, 712, 312, 8);
      }
      D.circle(ctx, PAUSE_BTN.x, PAUSE_BTN.y, PAUSE_BTN.r, 'rgba(10,8,22,0.55)', 3, 'rgba(255,255,255,0.6)');
      D.rect(ctx, PAUSE_BTN.x - 13, PAUSE_BTN.y - 16, 9, 32, 3, '#fff', 0);
      D.rect(ctx, PAUSE_BTN.x + 4, PAUSE_BTN.y - 16, 9, 32, 3, '#fff', 0);
    } else if (padWanted()) {
      ctx.globalAlpha = 0.75;
      for (const b of PAD) {
        D.circle(ctx, b.x, b.y, b.r, 'rgba(10,8,22,0.55)', 3, 'rgba(255,255,255,0.7)');
        D.text(ctx, b.label, b.x, b.y + b.r * 0.35, { size: b.r * 0.95, align: 'center', fill: '#ffffff', stroke: false });
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- boot
  // Hooks for automated tests and curious players (window.NF is the whole game).
  NF.debug = {
    play(songId, diff, opts) {
      unlock();
      A.stopAllLoops(0.05);
      Object.assign(NF.save.opt, opts || {});
      G.set(new NF.PlayState({ mode: 'freeplay', songs: [songId], index: 0, diff: diff == null ? 2 : diff }));
    },
    story(week, diff) {
      unlock();
      A.stopAllLoops(0.05);
      G.set(new NF.PlayState({ mode: 'story', songs: NF.WEEKS[week].songs, index: 0, diff: diff == null ? 1 : diff }));
    },
    go(name) {
      unlock();
      G.set(new NF[name]());
    },
    // Jump ahead inside the current song (testing long charts quickly).
    skip(sec) {
      const s = G.state;
      if (!(s instanceof NF.PlayState) || s.phase !== 'play' || s.paused) return;
      s.audioFrom(A.now() - s.songStart + sec, 0.05);
    },
  };
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([Promise.all([document.fonts.load('40px "Lilita One"'), document.fonts.load('40px "VT323"')]), new Promise((r) => setTimeout(r, 2500))])
    : Promise.resolve();
  fontsReady.catch(() => {}).then(() => NF.clearStageLayers && NF.clearStageLayers());
  G.set(new NF.Splash());
  setInterval(() => A.tick(), 25);
  requestAnimationFrame(frame);
  canvas.focus();
})();
