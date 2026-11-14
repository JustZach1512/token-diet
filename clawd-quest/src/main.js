// ============================================================================
// JUEGO (navegador): guardado · entrada · render · animaciones · partículas ·
// HUD · menús · sesión · bucle de paso fijo a 60 ticks
// ============================================================================
(() => {
  'use strict';
  const W = VIEW_W, Hh = VIEW_H, STEP = 1000 / 60;
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  GFX.init();
  const SPR = GFX.SPR, txt = GFX.text;

  // ------------------------------------------------------------ GUARDADO (localStorage con try/catch)
  const SAVE_KEY = 'clawdquest.v1';
  const save = { record: 0, recordRank: '', unlocked: 1, music: 0.7, sfx: 0.8, muted: false, assistLives: false, assistInv: false };
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d) Object.assign(save, d); } catch (e) { /* sin almacenamiento */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* modo privado */ } }
  AUDIO.setVolumes(save.music, save.sfx, save.muted);

  // ------------------------------------------------------------ ESCALADO ENTERO
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let sc = Math.floor(Math.min(vw / W, vh / Hh));
    if (sc < 1) sc = Math.min(vw / W, vh / Hh);
    canvas.style.width = Math.floor(W * sc) + 'px';
    canvas.style.height = Math.floor(Hh * sc) + 'px';
  }
  window.addEventListener('resize', resize); resize();

  // ------------------------------------------------------------ ENTRADA
  const KEYMAP = {
    ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd',
    KeyZ: 'j', Space: 'j', KeyK: 'j', KeyX: 'b', ShiftLeft: 'b', ShiftRight: 'b', KeyJ: 'b',
    Escape: 'p', Enter: 'ok', KeyP: 'p', KeyM: 'm', Backspace: 'back', NumpadEnter: 'ok',
  };
  const keys = {}, touch = {}, pad = {};
  let latch = {}; // las pulsaciones muy breves (<1 tick) no se pierden
  let prevA = {}, A = {};
  let firstInput = false, firstInputTick = 0;
  function onFirstInput() {
    if (firstInput) { AUDIO.resume(); return; }
    firstInput = true; firstInputTick = tick; AUDIO.init(); AUDIO.setVolumes(save.music, save.sfx, save.muted);
    if (state === 'title' || state === 'boot') { state = 'title'; AUDIO.play('title'); }
  }
  window.addEventListener('keydown', (e) => {
    const a = KEYMAP[e.code];
    if (state === 'options' && menuSel === 3 && (a === 'ok' || a === 'j') && !e.repeat) toggleFullscreen();
    if (a) { keys[a] = true; latch[a] = true; e.preventDefault(); }
    onFirstInput();
  });
  window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) { keys[a] = false; e.preventDefault(); } });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') openPause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') openPause(); });

  function pollPad() {
    for (const k in pad) pad[k] = false;
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const g of gps) {
      if (!g) continue;
      const b = (i) => g.buttons[i] && g.buttons[i].pressed;
      const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (b(14) || ax < -0.4) pad.l = true;
      if (b(15) || ax > 0.4) pad.r = true;
      if (b(12) || ay < -0.5) pad.u = true;
      if (b(13) || ay > 0.5) pad.d = true;
      if (b(0) || b(3)) pad.j = true;
      if (b(1) || b(2) || b(5) || b(7)) pad.b = true;
      if (b(9)) pad.p = true;
      if (b(8)) pad.m = true;
      if (b(0) || b(9)) pad.ok = true;
      if (b(1)) pad.back = true;
      if (Object.values(pad).some(v => v)) onFirstInput();
    }
  }
  function readInput() {
    pollPad();
    prevA = A; A = {};
    for (const k of ['l', 'r', 'u', 'd', 'j', 'b', 'p', 'm', 'ok', 'back']) A[k] = !!(keys[k] || touch[k] || pad[k] || latch[k]);
    latch = {};
  }
  const pressed = (k) => A[k] && !prevA[k];
  const accept = () => pressed('ok') || pressed('j');
  const cancel = () => pressed('back') || pressed('p') || pressed('b');

  // controles táctiles (solo si hay pantalla táctil)
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (isTouch) {
    const ui = document.getElementById('touch');
    ui.style.display = 'block';
    const btns = Array.from(ui.querySelectorAll('[data-k]'));
    const update = (e) => {
      for (const b of btns) touch[b.dataset.k] = false;
      for (const t of e.touches) {
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const k = el && el.dataset && el.dataset.k;
        if (k) { for (const kk of k.split(',')) touch[kk] = true; }
      }
      btns.forEach(b => b.classList.toggle('on', b.dataset.k.split(',').some(kk => touch[kk])));
      if (e.cancelable) e.preventDefault();
      onFirstInput();
    };
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(n => ui.addEventListener(n, update, { passive: false }));
  }
  // clic / toque en menús
  let menuHits = [], clickPos = null;
  canvas.addEventListener('pointerdown', (e) => {
    onFirstInput();
    const r = canvas.getBoundingClientRect();
    clickPos = { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * Hh / r.height };
    if (state === 'options') for (const h of menuHits) if (h.i === 3 && clickPos.x >= h.x0 && clickPos.x <= h.x1 && clickPos.y >= h.y0 && clickPos.y <= h.y1) toggleFullscreen();
  });

  // ------------------------------------------------------------ ESTADO GLOBAL
  let state = 'boot', stateT = 0, tick = 0;
  let sim = null, menuSel = 0, pauseSel = 0;
  let session = null;
  let particles = [], texts = [], shakeT = 0, shakeMag = 0, flashT = 0, bossBanner = 0;
  let lastWalkPhase = 0, worldStats = null, botState = null;
  const assist = () => ({ inv: save.assistInv });
  let TOTAL_SECRETS = 0;
  for (const lv of LEVELS) for (const a of Object.values(lv.areas)) {
    if (a.secret) TOTAL_SECRETS++;
    for (const r of a.map) for (const ch of r) if (ch === 'H' || ch === 'h') TOTAL_SECRETS++;
  }
  const LEVEL_TIPS = [
    'Corre con X y salta con Z. Pisa a los Bugs.',
    'Hay bloques invisibles... y un atajo secreto.',
    'Cuidado con el viento y las plataformas que caen.',
    'Busca la palanca y la llave. ¡Pisa al jefe!',
  ];

  function newSession(li) {
    session = { lives: 3, lines: 0, chips: 0, enemies: 0, secrets: [], li, ck: -1, power: 0, frames: 0, startLines: 0, fromStart: li === 0 };
  }
  function goIntro() { state = 'intro'; stateT = 0; AUDIO.stop(0.8); AUDIO.setTempo(1); }
  function startLevel() {
    const S = session;
    S.startLines = S.ck < 0 ? S.lines : S.startLines;
    sim = newSim(S.li, { checkpoint: S.ck, power: S.power, assist: assist(),
      st: { lines: S.lines, chips: S.chips, lives: S.lives, enemies: S.enemies, secrets: S.secrets } });
    particles = []; texts = []; shakeT = 0; flashT = 0; bossBanner = 0;
    state = 'play'; stateT = 0;
    AUDIO.setTempo(1);
    AUDIO.play(LEVELS[S.li].music, { restart: true });
  }
  function pullStats() {
    const st = sim.st, S = session;
    S.lines = st.lines; S.chips = st.chips; S.lives = st.lives; S.enemies = st.enemies; S.secrets = st.secrets.slice();
  }

  // ------------------------------------------------------------ PARTÍCULAS Y TEXTOS FLOTANTES
  function part(o) { if (particles.length < 400) particles.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 30, t: 0, size: 1, color: '#fff' }, o)); }
  function burst(x, y, n, colors, sp, life, g) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.8);
      part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: g || 0, life: life * (0.6 + Math.random() * 0.6), color: colors[i % colors.length], size: Math.random() < 0.3 ? 2 : 1 });
    }
  }
  function stars(x, y) {
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.random() * 0.4; part({ x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6 - 0.5, life: 22, kind: 'spark' }); }
  }
  function dust(x, y, dir, n) {
    for (let i = 0; i < (n || 3); i++) part({ x: x + (Math.random() - 0.5) * 6, y: y - 1, vx: (dir || (Math.random() - 0.5) * 2) * (0.3 + Math.random() * 0.5), vy: -0.2 - Math.random() * 0.4, life: 18, kind: 'dust', size: 2 + (Math.random() < 0.5 ? 1 : 0) });
  }
  const FRAG = {
    enemy: ['+fix()', '+patch', 'bug--', '+try{}', '+catch(e)', '+assert()', '+test()', '+lint', '+debug()', '+hotfix', '+guard()', '+validate()'],
    block: ['+import', '+const x=1;', '+let i=0;', '+async', '+await', '+return;', '+()=>{}', '+class', '+new Map()', '+fn()', '+if(ok)', '+[...a]', '+export', '+yield', '+switch', '+typeof', '+{...o}', '+for(;;)'],
    item: ['+npm run', 'git push', '+commit', '+merge', '+deploy', '+build', '+cache', '+npm i', '+release', '+v2.0'],
    chip: ['+1', '+byte', '+0x1', '++', '+bit', '+0b1', '+u8'],
    combo: ['+fix()', '+fix().then()', '+await fix()', '+Promise.all()', '+refactor()', '+rewrite()', '+ship it!'],
    flag: ['+draft', '+commit', '+merge', '+deploy()', 'git push --prod'],
    boss: ['rm -rf bloat', '+free()', '+gc()', 'DROP bloat;', '+optimize()', '+tree-shake'],
    secret: ['+// secreto', '+easter.egg', '+.hidden'],
    save: ['+save()', 'git stash'],
    life: ['+fork()'],
  };
  const FRAG_COL = { enemy: '#ff86cf', block: '#ffe14a', item: '#7dff9a', chip: '#7ff6ff', combo: '#ffb347', flag: '#ffffff', boss: '#ff5a6a', secret: '#d29aff', save: '#8affc0', life: '#b6ff6a' };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function floatText(text, x, y, color, big) { texts.push({ text, x, y, t: 0, color, big: !!big }); if (texts.length > 30) texts.shift(); }

  // ------------------------------------------------------------ EVENTOS DE LA SIMULACIÓN → SONIDO, PARTÍCULAS, MÚSICA
  const sfx = AUDIO.sfx;
  function shake(m, t) { shakeMag = Math.max(shakeMag, m); shakeT = Math.max(shakeT, t); }
  function handleEvents(s) {
    let doorDone = false;
    for (const e of s.events) {
      switch (e.type) {
        case 'jump': sfx('jump', e); dust(s.p.x + s.p.w / 2, s.p.y + s.p.h, 0, 2); break;
        case 'land': sfx('land', e); if ((e.v || 0) > 3.2) { dust(e.x - 4, e.y, -1, 2); dust(e.x + 4, e.y, 1, 2); } break;
        case 'skid': sfx('skid'); break;
        case 'stomp': sfx('stomp', e); stars(e.x, e.y); break;
        case 'kick': sfx('kick'); stars(e.x, e.y); break;
        case 'kill': sfx('kill'); stars(e.x, e.y); break;
        case 'hurt': sfx('hurt'); shake(2, 10); break;
        case 'grow': sfx('grow'); break;
        case 'powerAppear': sfx('powerAppear'); break;
        case 'powerGet': sfx('powerGet'); burst(s.p.x + 6, s.p.y + s.p.h / 2, 14, ['#ffffff', '#ffe14a', '#7ff6ff'], 2, 26); break;
        case 'fire': sfx('fire'); break;
        case 'fireBounce': sfx('fireBounce'); break;
        case 'puff': sfx('puff'); burst(e.x, e.y, e.big ? 10 : 6, ['#ffffff', '#c8fbff', '#38d6f0'], 1.2, 14); break;
        case 'chip':
          sfx('chip');
          if (e.pop) { part({ x: e.x - 4, y: e.y - 8, vy: -4.2, g: 0.28, life: 30, kind: 'chippop' }); floatText(pick(FRAG.chip), e.x, e.y - 22, FRAG_COL.chip); }
          else burst(e.x, e.y, 5, ['#fff6a0', '#ffffff'], 1, 12);
          break;
        case 'bump': sfx('bump'); break;
        case 'bumpBrick': sfx('bumpBrick'); break;
        case 'break': {
          sfx('break'); shake(1.5, 6);
          const tl = GFX.tileSets[e.theme].brick;
          for (let k = 0; k < 4; k++) part({ x: e.tx * 16 + (k % 2) * 8, y: e.ty * 16 + (k > 1 ? 8 : 0), vx: (k % 2 ? 1 : -1) * (1 + Math.random() * 0.6), vy: k > 1 ? -3 : -4.6, g: 0.3, life: 70, kind: 'debris', img: tl, sx: (k % 2) * 8, sy: (k > 1 ? 8 : 0), rot: 0, vr: (k % 2 ? 0.25 : -0.25) });
          dust(e.tx * 16 + 8, e.ty * 16 + 12, 0, 4);
          break;
        }
        case 'thud': sfx('thud'); break;
        case 'pipe': sfx('pipe'); break;
        case 'spring': sfx('spring'); dust(e.x, e.y + 12, 0, 4); break;
        case 'fallplat': sfx('fallplat'); dust(e.x, e.y + 8, 0, 3); break;
        case 'chispa': sfx('chispa'); burst(e.x, e.y, 8, ['#ffe94a', '#ff9a2a', '#7ff6ff'], 1.6, 18, 0.15); break;
        case 'lavaPlop': sfx('lavaPlop'); burst(e.x, e.y, 5, ['#ffe94a', '#ff5ac8'], 1.2, 14, 0.15); break;
        case 'splash': sfx('splash'); for (let i = 0; i < 10; i++) part({ x: e.x, y: Math.floor(e.y / 16) * 16, vx: (Math.random() - 0.5) * 2.5, vy: -1.5 - Math.random() * 2, g: 0.2, life: 28, color: i % 2 ? '#ffffff' : '#9ad8ff' }); break;
        case 'swim': sfx('swim'); part({ x: e.x, y: e.y, vy: -0.6, life: 40, kind: 'bubble' }); break;
        case 'lever': sfx('lever'); stars(e.x, e.y); floatText('¡ABIERTO!', e.x, e.y - 14, '#ffe14a'); break;
        case 'door': if (!doorDone) { sfx('door'); doorDone = true; shake(1.5, 30); } dust(e.tx * 16 + 8, e.ty * 16 + 16, 0, 2); part({ x: e.tx * 16, y: e.ty * 16, vy: -0.8, life: 22, kind: 'tileGhost', tile: e.kind }); break;
        case 'key': sfx('key'); burst(e.x, e.y, 12, ['#8affc0', '#ffffff'], 1.5, 22); break;
        case 'bossStart': bossBanner = 180; break;
        case 'bossLand': sfx('bossLand'); shake(e.big ? 4 : 2, 22); dust(s.A.ents.find(b => b.type === 'boss') ? s.A.ents.find(b => b.type === 'boss').x + 18 : 0, 192, 0, 8); break;
        case 'bossRoar': sfx('bossRoar'); shake(3, 45); break;
        case 'bossHit': sfx('bossHit'); shake(e.stomp ? 4 : 1.5, e.stomp ? 16 : 6); stars(e.x, e.y + 6); burst(e.x, e.y + 10, 10, ['#ffffff', '#ff86cf', '#ffe14a'], 2, 20); break;
        case 'bossThrow': sfx('bossThrow'); break;
        case 'bossJump': sfx('bossJump'); break;
        case 'bossCrouch': sfx('bossCrouch'); break;
        case 'bossAim': sfx('bossAim'); break;
        case 'bossCharge': sfx('bossCharge'); break;
        case 'bossStep': sfx('bossStep'); shake(1, 6); break;
        case 'bossDying': sfx('bossDying'); AUDIO.stop(0.8); break;
        case 'bossExplode': sfx('bossExplode'); shake(2.5, 10); burst(e.x, e.y, 14, ['#ffffff', '#ffe14a', '#ff5ac8', '#c89aff'], 2.4, 26); floatText(pick(FRAG.boss), e.x, e.y, FRAG_COL.boss); break;
        case 'bossDead': sfx('bossDead'); shake(6, 70); flashT = 20; burst(e.x, e.y, 60, ['#ffffff', '#ffe14a', '#ff5ac8', '#7ff6ff', '#c89aff'], 3.5, 50, 0.05); break;
        case 'gateClose': sfx('gateClose'); shake(3, 18); break;
        case 'flag': sfx('flag'); AUDIO.stop(0.08); AUDIO.setTempo(1); break;
        case 'clearJingle': AUDIO.play('clear', { fade: 0.05 }); break;
        case 'worldJingle': AUDIO.setTempo(1); AUDIO.play('world', { fade: 0.2 }); break;
        case 'castleDoor': sfx('castleDoor'); for (let k = 0; k < 4; k++) setTimeout(() => fireworks(), k * 350); break;
        case 'tick': sfx('tick'); break;
        case 'oneup': sfx('oneup'); floatText('+1 VIDA', e.x, e.y - 12, FRAG_COL.life, true); break;
        case 'death': AUDIO.setTempo(1); AUDIO.play('death', { fade: 0.03 }); break;
        case 'checkpoint': sfx('checkpoint'); burst(e.x, e.y + 6, 16, ['#8affc0', '#ffffff', '#4aff8a'], 1.8, 26); break;
        case 'secret': sfx('secret'); floatText('¡SECRETO!', e.x, e.y - 24, FRAG_COL.secret, true); burst(e.x, e.y, 16, ['#d29aff', '#ffffff'], 2, 30); break;
        case 'score': {
          let t;
          if (e.cat === 'combo') t = FRAG.combo[Math.min(e.combo || 0, FRAG.combo.length - 1)];
          else if (e.cat === 'flag') t = FRAG.flag[e.tier];
          else t = pick(FRAG[e.cat] || FRAG.block);
          floatText(t, e.x, e.y - 8, FRAG_COL[e.cat] || '#fff', e.cat === 'flag' || e.cat === 'boss');
          break;
        }
        case 'vine': sfx('vine'); break;
        case 'hurry': sfx('hurry'); floatText('¡DATE PRISA!', s.cam.x + W / 2, 70, '#ff6a6a', true); break;
        case 'helmOff': sfx('helmOff'); part({ x: e.x - 8, y: e.y - 6, vx: (Math.random() < 0.5 ? -1 : 1) * 1.2, vy: -3.5, g: 0.22, life: 80, kind: 'helmet', rot: 0, vr: 0.2 }); break;
        case 'shellBounce': sfx('shellBounce'); break;
        case 'unshell': sfx('unshell'); break;
        case 'pixelShake': sfx('pixelShake'); break;
        case 'pixelLand': sfx('pixelLand'); dust(e.x, e.y, 0, 3); break;
        case 'shieldHit': sfx('shieldHit'); break;
        case 'rescue': sfx('rescue'); floatText('¡RESCATE!', s.p.x + 6, s.p.y - 10, '#7ff6ff'); break;
        case 'area': sfx('pipe'); break;
      }
    }
  }
  function fireworks() {
    if (!sim) return;
    const x = sim.cam.x + 60 + Math.random() * 200, y = 40 + Math.random() * 60;
    AUDIO.sfx('puff');
    burst(x, y, 30, pick([['#ffe14a', '#ffffff'], ['#ff86cf', '#ffffff'], ['#7ff6ff', '#ffffff'], ['#8affc0', '#ffffff']]), 2.2, 40, 0.04);
  }

  // ------------------------------------------------------------ MÚSICA SEGÚN ESTADO
  function updateMusic(s) {
    if (s.mode !== 'play' && s.mode !== 'pipeIn' && s.mode !== 'pipeOut') return;
    let want = LEVELS[s.li].music;
    if (s.bossDone || s.bossDying) return;
    if (s.bossActive) want = 'boss';
    if (s.p.star > 0) want = 'star';
    if (want !== AUDIO.current) AUDIO.play(want, { fade: 0.45, fadeIn: 0.3 });
    AUDIO.setTempo(s.time < 100 ? 1.22 : 1);
  }

  // ------------------------------------------------------------ RENDER DEL MUNDO
  const skyCache = {};
  function skyFor(theme) {
    if (!skyCache[theme]) { const c = GFX.cv(W, Hh); GFX.drawSky(c.getContext('2d'), theme); skyCache[theme] = c; }
    return skyCache[theme];
  }
  function drawBackground(s, camX) {
    const th = s.A.theme, L = GFX.bgs[th];
    ctx.drawImage(skyFor(th), 0, 0);
    if (th === 'surface' || th === 'sky') {
      // sol pixelado
      if (th === 'sky') { ctx.fillStyle = '#fff6c0'; ctx.fillRect(268, 40, 18, 18); ctx.fillRect(271, 37, 12, 24); ctx.fillRect(265, 43, 24, 12); ctx.fillStyle = '#ffe98a'; ctx.fillRect(270, 42, 14, 14); }
      for (let k = 0; k < 7; k++) {
        const span = 760;
        const bx = ((k * 131 + tick * 0.12 - camX * 0.12) % span + span) % span - 60;
        GFX.cloud(ctx, bx, 26 + (k * 37) % 70 + Math.sin(tick * 0.02 + k) * 1.5, k % 3 === 0 ? 2 : 1, tick + k * 50, k % 2 === 0);
      }
    }
    GFX.drawLayer(ctx, L.far, camX * 0.15, 0);
    if (th === 'cave') { // nodos de circuito que parpadean
      for (let k = 0; k < 30; k++) {
        const x = ((GFX.hash(k, 1) % 512) - camX * 0.15) % 512; const xx = x < 0 ? x + 512 : x;
        const on = (Math.floor(tick / 20) + k) % 7 === 0;
        ctx.fillStyle = on ? '#3fe0d0' : '#232a62';
        for (let rep = 0; rep < 2; rep++) ctx.fillRect(Math.floor(xx + rep * 512 - 0), 30 + GFX.hash(k, 2) % 170, 2, 2);
      }
    }
    GFX.drawLayer(ctx, L.mid, camX * 0.35, 0);
    if (th === 'fortress') { // LEDs de servidor parpadeantes
      for (let k = 0; k < 8; k++) for (let j = 0; j < 12; j++) {
        const rx = ((k * 64 + 12 - camX * 0.15) % 512 + 512) % 512;
        const h = GFX.hash(k * 13 + j, Math.floor(tick / (8 + (k + j) % 7)));
        if (h % 3 === 0) continue;
        ctx.fillStyle = ['#4aff8a', '#ffb02a', '#4aff8a', '#ff4a5a', '#38d6f0'][h % 5];
        for (let rep = 0; rep < 2; rep++) { const xx = rx + rep * 512; if (xx < 330) { ctx.fillRect(xx + (h % 4) * 2, 59 + j * 12, 1, 1); ctx.fillRect(xx + 10 + (h % 3) * 3, 59 + j * 12, 1, 1); } }
      }
      const g = ctx.createLinearGradient(0, 150, 0, 224); g.addColorStop(0, 'rgba(255,60,140,0)'); g.addColorStop(1, 'rgba(255,90,60,' + (0.22 + Math.sin(tick * 0.05) * 0.05) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 150, W, 74);
    }
    if (th === 'bonus') {
      for (let k = 0; k < 24; k++) {
        const x = (GFX.hash(k, 3) % W), y = ((GFX.hash(k, 4) % 260) - tick * (0.2 + (k % 3) * 0.1)) % 260;
        GFX.text(ctx, k % 2 ? '1' : '0', x, y < 0 ? y + 260 : y, { color: '#1c2a6a' });
      }
    }
  }

  function bumpOff(s, tx, ty) {
    for (const b of s.bumps) if (b.tx === tx && b.ty === ty && b.area === s.area) return -Math.round(Math.sin(Math.PI * b.t / 12) * 5);
    return 0;
  }
  function drawTiles(s, camX) {
    const A = s.A, ts = GFX.tileSets[A.theme], w = A.w;
    const x0 = Math.max(0, Math.floor(camX / 16)), x1 = Math.min(w - 1, x0 + 21);
    const qf = [0, 0, 0, 1, 2, 3, 2, 1][Math.floor(tick / 7) % 8];
    for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = A.tiles[ty * w + tx];
      if (t === T.E || t === T.HIDDEN || t === T.GATE_OPEN) continue;
      const x = tx * 16 - camX, y = ty * 16;
      let img = null;
      switch (t) {
        case T.GROUND: {
          const above = ty > 0 ? A.tiles[(ty - 1) * w + tx] : T.E;
          const v = GFX.hash(tx, ty) % 2;
          img = (above === T.GROUND) ? ts.fill[v] : ts.top[v];
          ctx.drawImage(img, x, y);
          const lf = tx > 0 ? A.tiles[ty * w + tx - 1] : T.GROUND, rt = tx < w - 1 ? A.tiles[ty * w + tx + 1] : T.GROUND;
          if (!SOLID[lf]) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, y + (above === T.GROUND ? 0 : 2), 1, 16); }
          if (!SOLID[rt]) { ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fillRect(x + 15, y + (above === T.GROUND ? 0 : 2), 1, 16); }
          // decoración sobre el suelo
          if (above === T.E && (A.theme === 'surface' || A.theme === 'sky')) {
            const h = GFX.hash(tx * 7, ty);
            if (A.theme === 'surface' && h % 11 === 0 && tx > 0 && A.tiles[(ty - 1) * w + tx + 1] === T.E && A.tiles[ty * w + tx + 1] === T.GROUND) {
              ctx.fillStyle = '#1f7a3e'; ctx.fillRect(x + 2, y - 8, 26, 8); ctx.fillRect(x + 6, y - 12, 9, 4); ctx.fillRect(x + 15, y - 11, 9, 3);
              ctx.fillStyle = '#3cbf5c'; ctx.fillRect(x + 3, y - 7, 24, 6); ctx.fillRect(x + 7, y - 11, 7, 4); ctx.fillRect(x + 16, y - 10, 7, 3);
              ctx.fillStyle = '#7fe08a'; ctx.fillRect(x + 8, y - 11, 3, 1); ctx.fillRect(x + 17, y - 10, 3, 1); ctx.fillRect(x + 4, y - 7, 4, 1);
              ctx.fillStyle = '#ff86cf'; ctx.fillRect(x + 12, y - 5, 1, 1); ctx.fillStyle = '#ffe14a'; ctx.fillRect(x + 21, y - 6, 1, 1);
            } else if (h % 5 === 0) { ctx.fillStyle = '#2e9e4f'; ctx.fillRect(x + 3 + h % 8, y - 2, 1, 2); ctx.fillRect(x + 5 + h % 8, y - 3, 1, 3); }
            else if (h % 7 === 0) { ctx.fillStyle = '#2e9e4f'; ctx.fillRect(x + 6, y - 3, 1, 3); ctx.fillStyle = ['#ff86cf', '#ffe14a', '#7ff6ff'][h % 3]; ctx.fillRect(x + 5, y - 5, 3, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 6, y - 5, 1, 1); }
          }
          continue;
        }
        case T.BRICK: img = ts.brick; break;
        case T.Q: img = ts.q[qf]; break;
        case T.USED: img = ts.used; break;
        case T.HARD: img = ts.hard[GFX.hash(tx, ty) % ts.hard.length]; break;
        case T.PIPE_TL: img = ts.pipeTL; break;
        case T.PIPE_TR: img = ts.pipeTR; break;
        case T.PIPE_L: img = ts.pipeL; break;
        case T.PIPE_R: img = ts.pipeR; break;
        case T.DECOPIPE: img = (tx > 0 && A.tiles[ty * w + tx - 1] === T.DECOPIPE) ? ts.pipeR : ts.pipeL; break;
        case T.SPIPE: img = (ty > 0 && A.tiles[(ty - 1) * w + tx] === T.SPIPE) ? ts.spipeBot : ts.spipeTop; break;
        case T.SPIPE_B: img = (ty > 0 && A.tiles[(ty - 1) * w + tx] === T.SPIPE_B) ? ts.sbodyBot : ts.sbodyTop; break;
        case T.SEMI: img = ts.semi; break;
        case T.SPIKE: img = ts.spike; break;
        case T.SPIKE_C: img = ts.spikeC; break;
        case T.DOOR: img = ts.door; break;
        case T.DOORK: img = ts.doork; break;
        case T.GATE: img = ts.gate; break;
        case T.BOSSDOOR: img = ts.bossdoor; break;
        case T.CHIP: ctx.drawImage(SPR.chip[Math.floor((tick + tx * 3) / 8) % 4], x + 3, y + 1); continue;
        case T.LAVA_TOP: case T.LAVA: drawLava(x, y, t === T.LAVA_TOP, tx); continue;
        case T.WATER_TOP: case T.WATER: continue; // se dibujan encima (translúcidas)
      }
      if (img) ctx.drawImage(img, x, y + (t === T.Q || t === T.BRICK || t === T.USED ? bumpOff(s, tx, ty) : 0));
    }
  }
  function drawLava(x, y, top, tx) {
    ctx.fillStyle = '#c0207a'; ctx.fillRect(x, y, 16, 16);
    for (let i = 0; i < 16; i += 2) {
      const ph = Math.sin((tx * 16 + i) * 0.35 + tick * 0.08);
      const yy = top ? 3 + Math.round(ph * 2) : 0;
      ctx.fillStyle = '#ff4fa0'; ctx.fillRect(x + i, y + yy, 2, 16 - yy);
      ctx.fillStyle = '#ffb02a'; ctx.fillRect(x + i, y + yy + 2 + Math.round(Math.abs(ph) * 3), 2, 3);
      if (top) { ctx.fillStyle = '#ffe94a'; ctx.fillRect(x + i, y + yy, 2, 2); ctx.fillStyle = '#ffffff'; if ((i + tick >> 2) % 7 === 0) ctx.fillRect(x + i, y + yy, 1, 1); }
    }
    if (GFX.hash(tx, Math.floor(tick / 6)) % 9 === 0) { ctx.fillStyle = '#7ff6ff'; ctx.fillRect(x + GFX.hash(tx, tick) % 14, y + 6 + GFX.hash(tick, tx) % 8, 3, 1); }
  }
  function drawWater(s, camX) {
    const A = s.A, w = A.w;
    const x0 = Math.max(0, Math.floor(camX / 16)), x1 = Math.min(w - 1, x0 + 21);
    for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = A.tiles[ty * w + tx];
      if (t !== T.WATER && t !== T.WATER_TOP) continue;
      const x = tx * 16 - camX, y = ty * 16;
      ctx.fillStyle = 'rgba(40,130,255,0.42)'; ctx.fillRect(x, y + (t === T.WATER_TOP ? 4 : 0), 16, t === T.WATER_TOP ? 12 : 16);
      if (t === T.WATER_TOP) for (let i = 0; i < 16; i++) {
        const h = Math.round(Math.sin((tx * 16 + i) * 0.4 + tick * 0.1) * 1.5);
        ctx.fillStyle = 'rgba(200,240,255,0.85)'; ctx.fillRect(x + i, y + 3 + h, 1, 1);
        ctx.fillStyle = 'rgba(120,200,255,0.55)'; ctx.fillRect(x + i, y + 4 + h, 1, 1);
      } else if ((tx * 7 + ty * 3 + (tick >> 4)) % 11 === 0) { ctx.fillStyle = 'rgba(200,240,255,0.35)'; ctx.fillRect(x + 4, y + 6, 6, 1); }
    }
  }

  // ---- Clawd: elige pose según el estado físico
  function playerSprite(s) {
    const p = s.p;
    let o = { big: p.power > 0 }, pal = p.power === 2 ? 'fire' : 'normal', si = 0;
    if (p.star > 0) { pal = 'star'; si = Math.floor(tick / (p.star < 120 ? 6 : 3)) % 4; }
    const moving = Math.abs(p.vx) > 0.15;
    if (s.mode === 'death') o = { big: false, eyes: 'x', mouth: 'o', arms: 'up', front: true, legs: 'spread' };
    else if (s.freeze > 0 && (s.freezeKind === 'grow' || s.freezeKind === 'shrink')) {
      const alt = Math.floor(p.growT / 4) % 2;
      const big = s.freezeKind === 'grow' ? (p.growT > 28 || alt === 1) : (p.growT < 8 || alt === 0);
      o = { big, eyes: s.freezeKind === 'grow' ? 'happy' : 'hurt', arms: 'out', legs: 0 };
    } else if (s.mode === 'flag' && s.sub < 2) o = { big: o.big, arms: 'grab', legs: 'together', eyes: 'open' };
    else if (s.mode === 'world') o = { big: o.big, arms: Math.floor(tick / 12) % 2 ? 'up' : 'out', eyes: 'happy', mouth: 'smile', legs: Math.floor(tick / 12) % 2 ? 'spread' : 0, front: true };
    else if (p.climb) o = { big: o.big, arms: Math.floor(p.walkT / 6) % 2 ? 'swimA' : 'swimB', legs: 'together', front: true };
    else if (p.inWater && !p.onG) o = { big: o.big, arms: Math.floor(tick / 10) % 2 ? 'swimA' : 'swimB', legs: Math.floor(tick / 10) % 2 ? 'spread' : 'together', lean: 1 };
    else if (!p.onG && s.mode === 'play') {
      if (p.vy < -2) o = { big: o.big, arms: p.hitT > 0 ? 'up1' : 'up', legs: 'tuck', bw: 10, bh: (o.big ? 25 : 12) };
      else if (p.vy < 1) o = { big: o.big, arms: p.hitT > 0 ? 'up1' : 'out', legs: 'tuck' };
      else o = { big: o.big, arms: 'out', legs: 'spread', eyes: 'open' };
    } else if (p.crouch) o = { big: true, bh: 12, legs: 'none', eyes: 'squint', arms: 'down' };
    else if (p.skid) o = { big: o.big, lean: -1, arms: 'out', legs: 'spread', eyes: 'squint' };
    else if (moving || s.mode === 'pipeIn' && s.sub === 1 || (s.mode === 'flag' && s.sub === 2)) {
      const run = Math.abs(p.vx) > 2.1;
      const ph = Math.floor(p.walkT / (run ? 6 : 5)) % 4;
      o = { big: o.big, legs: ph, lean: run ? 1 : 0, arms: run ? 'back' : (ph % 2 ? 'side' : 'down') };
      if (!o.big && ph % 2 === 1) o.bh = 9;
    } else {
      const breath = Math.floor(tick / 40) % 2;
      o = { big: o.big, bh: (o.big ? 23 : 10) - breath, eyes: (tick % 200) < 7 ? 'blink' : 'open', legs: 0 };
    }
    if (s.mode === 'play' && p.onG && p.landT < 5 && !p.crouch) { o.bw = 14; o.bh = (o.big ? 21 : 8); }
    if (p.fireT > 0 && s.mode === 'play') o.arms = 'punch';
    return GFX.clawd(o, pal, si);
  }
  function drawPlayer(s, camX) {
    const p = s.p;
    if (p.hidden) return;
    if (p.inv > 0 && s.mode === 'play' && Math.floor(tick / 3) % 2 === 0) return;
    const fr = playerSprite(s);
    const img = fr[(p.dir >= 0 || s.mode === 'death') ? 0 : 1];
    const x = Math.round(p.x + p.w / 2 - 11 - camX), y = Math.round(p.y + p.h - 36);
    ctx.drawImage(img, x, y);
    if (p.star > 0 && tick % 3 === 0) part({ x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, vy: -0.3, life: 16, kind: 'spark' });
    if (p.skid && tick % 3 === 0) dust(p.x + p.w / 2 + p.dir * 4, p.y + p.h, -p.dir, 1);
    if (p.onG && Math.abs(p.vx) > 2.2 && tick % 7 === 0 && s.mode === 'play') dust(p.x + p.w / 2 - p.dir * 5, p.y + p.h, -p.dir * 0.5, 1);
    if (s.p.inWater && tick % 40 === 0) part({ x: p.x + 6, y: p.y, vy: -0.5, life: 50, kind: 'bubble' });
    // pasos suaves sincronizados con la animación
    if (p.onG && Math.abs(p.vx) > 0.4 && s.mode === 'play') {
      const ph = Math.floor(p.walkT / (Math.abs(p.vx) > 2.1 ? 6 : 5)) % 4;
      if (ph !== lastWalkPhase && (ph === 1 || ph === 3)) sfx('step', { alt: ph === 3 });
      lastWalkPhase = ph;
    }
  }

  let spinT = 0;
  function drawFlipV(img, x, y) { // enemigo derrotado: gira mientras cae
    ctx.save(); ctx.translate(x + img.width / 2, y + img.height / 2);
    ctx.rotate(Math.PI + Math.floor(spinT / 5) * Math.PI / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2); ctx.restore();
  }
  function drawEnt(s, e, camX, pass) {
    const x = Math.round(e.x - camX), y = Math.round(e.y);
    if (x < -64 || x > W + 64) return;
    const f4 = Math.floor((tick + e.id * 5) / 8) % 4;
    const dead = e.st === 9; spinT = e.t || 0;
    const di = e.dir > 0 ? 1 : 0;
    switch (e.type) {
      case 'bug': {
        if (dead) { drawFlipV(SPR.bug[0], x - 1, y + e.h - 16); break; }
        if (e.st === 1) { ctx.drawImage(SPR.bugFlat, x - 1, y + e.h - 16); break; }
        ctx.drawImage(SPR.bug[(e.dir > 0 ? 4 : 0) + f4], x - 1, y + e.h - 16); break;
      }
      case 'glitch': {
        if (e.st === 0 && !dead) {
          const img = SPR.glitch[f4][e.dir > 0 ? 0 : 1];
          if ((tick + e.id * 13) % 50 < 4) { ctx.globalAlpha = 0.7; ctx.drawImage(GFX.tint(img, '#ff2adf'), x - 2, y + e.h - 16); ctx.drawImage(GFX.tint(img, '#2affff'), x, y + e.h - 16); ctx.globalAlpha = 1; }
          ctx.drawImage(img, x - 1, y + e.h - 16);
        } else {
          const sf = e.st === 2 ? Math.floor(tick / 3) % 4 : 0;
          const sx = (e.st === 1 && e.t > 400) ? (tick % 4 < 2 ? 1 : -1) : 0;
          if (dead) drawFlipV(SPR.shell[0], x - 1, y + e.h - 12); else ctx.drawImage(SPR.shell[sf], x - 1 + sx, y + e.h - 12);
        }
        break;
      }
      case 'firewall': {
        if (e.st === 2) { ctx.drawImage(SPR.firewallBare[0][0], 0, 0, 16, 16, x - 1, y + e.h - 8, 16, 8); break; }
        const set = e.helm ? SPR.firewall : SPR.firewallBare;
        const img = set[e.st === 1 ? Math.floor(tick / 4) % 4 : f4][e.dir > 0 ? 0 : 1];
        if (dead) drawFlipV(img, x - 1, y + e.h - 16); else ctx.drawImage(img, x - 1, y + e.h - 16);
        if (e.st === 1 && tick % 10 < 5) { ctx.fillStyle = '#7fd0ff'; ctx.fillRect(x + (e.dir > 0 ? 0 : 13), y + 2, 1, 2); }
        break;
      }
      case 'ping': {
        const img = SPR.ping[dead ? 0 : Math.floor(tick / 5) % 4][di];
        if (dead) drawFlipV(img, x - 1, y - 1); else ctx.drawImage(img, x - 1, y - 1);
        if (!dead && tick % 40 < 16) { ctx.strokeStyle = 'rgba(255,246,160,' + (1 - (tick % 40) / 16) + ')'; ctx.beginPath(); ctx.arc(x + 7, y + 6, 8 + (tick % 40) / 2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
        break;
      }
      case 'pixel': {
        if (e.st === 4) { ctx.drawImage(SPR.pixelFlat, x - 1, y + e.h - 13); break; }
        const img = SPR.pixel[(tick % 120) < 10 ? 1 : 0];
        const sx = e.st === 1 ? ((tick % 4) < 2 ? -1 : 1) : 0;
        if (dead) drawFlipV(img, x - 1, y - 1); else ctx.drawImage(img, x - 1 + sx, y + (e.st === 3 ? -Math.abs(Math.sin(e.t * 0.25)) * 2 : 0));
        if (e.st === 0 && tick % 90 < 30) { ctx.fillStyle = '#2e2450'; ctx.fillRect(x + 6, y + 13 + (tick % 90) / 6, 1, 2); }
        break;
      }
      case 'cable': {
        if (e.ext <= 0 && !dead) break;
        ctx.save(); ctx.beginPath(); ctx.rect(x - 20, -40, 60, e.baseY + 40); ctx.clip();
        const hx = Math.round(e.cx - camX) - 7, hy = Math.round(e.baseY - e.ext) - 2;
        if (dead) drawFlipV(SPR.cable[0], hx, y);
        else {
          for (let j = hy + 11; j < e.baseY; j++) { ctx.fillStyle = (j >> 1) % 2 ? '#1a6a3a' : '#2ad070'; ctx.fillRect(hx + 5, j, 4, 1); ctx.fillStyle = '#0a2a14'; ctx.fillRect(hx + 4, j, 1, 1); ctx.fillRect(hx + 9, j, 1, 1); }
          ctx.drawImage(SPR.cable[Math.floor(tick / 10) % 2], hx, hy);
        }
        ctx.restore();
        break;
      }
      case 'chispa': if (e.st === 1) { ctx.drawImage(SPR.chispa[Math.floor(tick / 3) % 4], x - 2, y - 2); if (tick % 2 === 0) part({ x: e.x + 5, y: e.y + 8, vy: 0.3, life: 10, color: tick % 4 ? '#ffe94a' : '#7ff6ff' }); } break;
      case 'item': {
        if ((pass === 0) !== (e.emerge > 0)) break;
        let img;
        if (e.kind === 'mush') img = SPR.mush; else if (e.kind === 'life') img = SPR.life;
        else if (e.kind === 'flower') img = SPR.flower[Math.floor(tick / 6) % 4]; else img = SPR.star[Math.floor(tick / 4) % 4];
        ctx.drawImage(img, x - 1, y + e.h - img.height);
        if (e.kind === 'star' && tick % 4 === 0) part({ x: e.x + 7, y: e.y + 7, vx: (Math.random() - 0.5), vy: -0.3, life: 14, kind: 'spark' });
        break;
      }
      case 'cball': ctx.drawImage(SPR.cball[Math.floor(tick / 3) % 4], x - 1, y - 1); if (tick % 2) part({ x: e.x + 4, y: e.y + 4, life: 8, color: '#7ff6ff' }); break;
      case 'bball': ctx.drawImage(SPR.bball[Math.floor(tick / 4) % 4], x - 1, y - 1); if (tick % 2) part({ x: e.x + 5, y: e.y + 5, life: 10, color: '#c03ad8' }); break;
      case 'wave': ctx.drawImage(SPR.wave[Math.floor(tick / 3) % 4], x - 1, y - 2); break;
      case 'plat': drawPlat(e, x, y); break;
      case 'spring': ctx.drawImage(SPR.spring[e.comp > 8 ? 2 : e.comp > 2 ? 1 : 0], x, y - 2); break;
      case 'fbar': {
        const ca = Math.cos(e.a), sa = Math.sin(e.a);
        for (let k = e.n; k >= 1; k--) {
          const ox = Math.round(e.cx + ca * k * 8 - camX), oy = Math.round(e.cy + sa * k * 8);
          ctx.fillStyle = '#1a6aa0'; ctx.fillRect(ox - 3, oy - 3, 7, 7);
          ctx.fillStyle = (tick + k) % 6 < 3 ? '#7ff6ff' : '#c8fbff'; ctx.fillRect(ox - 2, oy - 2, 5, 5);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(ox - 1, oy - 1, 2, 2);
        }
        break;
      }
      case 'vine': {
        for (let j = Math.max(-16, Math.round(e.top)); j < e.bottom; j++) {
          ctx.fillStyle = (j >> 2) % 2 ? '#2ad070' : '#1a9a4a'; ctx.fillRect(x - 1, j, 3, 1);
          if (j % 12 === 0) { ctx.fillStyle = '#8ef09a'; ctx.fillRect(x + ((j / 12) % 2 ? 2 : -5), j, 4, 3); }
        }
        break;
      }
      case 'ck': ctx.drawImage(SPR.ck[e.on ? 1 : 0], x - 2, y); if (e.on && tick % 20 < 10) { ctx.fillStyle = '#c8ffd8'; ctx.fillRect(x + 8, y + 21, 1, 1); } break;
      case 'lever': ctx.drawImage(SPR.lever[e.on ? 1 : 0], x - 2, y - 4); break;
      case 'key': ctx.drawImage(SPR.key, x - 1, y + Math.round(Math.sin(tick * 0.08) * 2)); if (tick % 12 === 0) part({ x: e.x + Math.random() * 10, y: e.y, vy: -0.4, life: 14, kind: 'spark' }); break;
      case 'goal': {
        const px = x - 1;
        ctx.fillStyle = '#5a6088'; ctx.fillRect(px, e.top, 3, e.bottom - e.top);
        ctx.fillStyle = '#e8ecf8'; ctx.fillRect(px, e.top, 1, e.bottom - e.top);
        const glow = tick % 30 < 15;
        ctx.fillStyle = '#1a1030'; ctx.fillRect(px - 2, e.top - 6, 7, 7);
        ctx.fillStyle = glow ? '#7ff6ff' : '#38d6f0'; ctx.fillRect(px - 1, e.top - 5, 5, 5);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(px, e.top - 4, 1, 1);
        const wave = Math.floor(tick / 8) % 2;
        ctx.drawImage(SPR.flag, px - 15, Math.round(e.flagY) + wave);
        break;
      }
      case 'castle': drawCastle(s, e, x, y); break;
      case 'core': {
        ctx.drawImage(SPR.core[Math.floor(tick / 6) % 4], x, y);
        if (tick % 6 === 0) part({ x: e.x + 16 + (Math.random() - 0.5) * 20, y: e.y + 12, vy: -0.6, life: 30, kind: 'spark' });
        break;
      }
      case 'boss': drawBoss(s, e, x, y); break;
    }
  }
  function drawPlat(e, x, y) {
    const n = e.w / 16;
    const fall = e.kind === 'f';
    const sx = fall && e.trig && e.t < 26 ? (tick % 4 < 2 ? 1 : -1) : 0;
    for (let i = 0; i < n; i++) {
      const xx = x + i * 16 + sx;
      ctx.fillStyle = '#16121e'; ctx.fillRect(xx, y, 16, 8);
      ctx.fillStyle = fall ? '#ff6a5a' : '#8a96d8'; ctx.fillRect(xx + (i === 0 ? 1 : 0), y + 1, 16 - (i === 0 ? 1 : 0) - (i === n - 1 ? 1 : 0), 5);
      ctx.fillStyle = fall ? '#ffb0a0' : '#c8d0ff'; ctx.fillRect(xx + 1, y + 1, 14, 1);
      ctx.fillStyle = fall ? '#a02a2a' : '#4a5498'; ctx.fillRect(xx + 1, y + 5, 14, 1);
      if (fall) { ctx.fillStyle = '#ffe14a'; for (let k = 0; k < 16; k += 6) ctx.fillRect(xx + k + 2, y + 2, 3, 3); }
      else { ctx.fillStyle = (tick >> 3) % 2 ? '#7ff6ff' : '#3fe0d0'; ctx.fillRect(xx + 7, y + 3, 2, 1); }
    }
  }
  function drawCastle(s, e, x, y) {
    // torre de servidores
    ctx.fillStyle = '#1a1830'; ctx.fillRect(x, y + 8, 80, 72);
    ctx.fillStyle = '#4a4f78'; ctx.fillRect(x + 2, y + 10, 76, 70);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#1a1830'; ctx.fillRect(x + i * 16 + 2, y, 10, 10); ctx.fillStyle = '#6a70a0'; ctx.fillRect(x + i * 16 + 3, y + 1, 8, 8); }
    for (let r = 0; r < 4; r++) {
      const ry = y + 16 + r * 12;
      ctx.fillStyle = '#2a2c48'; ctx.fillRect(x + 6, ry, 68, 9);
      ctx.fillStyle = '#5a5f90'; ctx.fillRect(x + 6, ry, 68, 1);
      for (let k = 0; k < 6; k++) {
        const on = GFX.hash(r * 7 + k, Math.floor(tick / (6 + k))) % 3;
        ctx.fillStyle = on === 0 ? '#2a2c48' : ['#4aff8a', '#4aff8a', '#ffb02a'][(r + k) % 3];
        ctx.fillRect(x + 10 + k * 10, ry + 4, 2, 2);
      }
    }
    // antena
    ctx.fillStyle = '#8a8fb0'; ctx.fillRect(x + 39, y - 18, 2, 18);
    ctx.fillStyle = tick % 40 < 20 ? '#ff4a5a' : '#ffd0d0'; ctx.fillRect(x + 38, y - 21, 4, 4);
    // puerta
    const dx = x + 32, dy = y + 56;
    const open = s.mode === 'flag' && s.sub >= 2 ? Math.min(1, (s.sub === 3 ? 1 : (s.p.x + s.p.w / 2 > e.door - 30 ? (s.p.x + s.p.w / 2 - (e.door - 30)) / 30 : 0))) : 0;
    ctx.fillStyle = '#0c0a18'; ctx.fillRect(dx, dy, 16, 24);
    ctx.fillStyle = '#ffe9a0'; ctx.fillRect(dx + 2, dy + 2, 12, 22);
    ctx.fillStyle = '#6a5a3a'; ctx.fillRect(dx + 2, dy + 2, Math.round(12 * (1 - open)), 22);
    ctx.fillStyle = '#8a7a5a'; ctx.fillRect(dx + 2, dy + 2, Math.round(12 * (1 - open)), 1);
  }
  function drawBoss(s, b, x, y) {
    if (b.st === 'wait' || b.st === 'gone') return;
    const phase = Math.min(2, b.phase - 1);
    let fr = Math.floor(tick / 20) % 2;
    if (b.st === 'crouch' || b.st === 'aim') fr = 3;
    if ((b.st.startsWith('throw') && b.t % 22 < 10) || b.st === 'roar' || b.st === 'dying') fr = 2;
    const di = (b.dir > 0) ? 0 : 1;
    let img = SPR.boss[phase][fr][di];
    if ((b.flash > 0 && tick % 4 < 2) || (b.st === 'dying' && tick % 6 < 3)) img = SPR.bossWhite[fr][di];
    let sx = 0, sy = 0;
    if (b.st === 'crouch' || b.st === 'aim' || b.st === 'dying' || b.st === 'roar') { sx = (tick % 4 < 2 ? 1 : -1); }
    ctx.drawImage(img, x - 4 + sx, y + b.h - 40 + sy);
    if (b.st === 'stun') {
      for (let k = 0; k < 3; k++) {
        const a = tick * 0.12 + k * 2.1;
        ctx.drawImage(SPR.sparkle[2], Math.round(x + 18 + Math.cos(a) * 14 - 3), Math.round(y - 4 + Math.sin(a) * 4));
      }
    }
    if (b.st === 'charge' && tick % 2 === 0) dust(b.x + b.w / 2 - b.dir * 16, 192, -b.dir, 2);
  }

  function drawParticles(camX) {
    for (const q of particles) {
      const x = Math.round(q.x - camX), y = Math.round(q.y);
      const k = q.kind;
      if (k === 'spark') ctx.drawImage(SPR.sparkle[q.t < q.life * 0.3 ? 2 : q.t < q.life * 0.7 ? 1 : 0], x - 3, y - 3);
      else if (k === 'dust') { ctx.fillStyle = q.t < q.life / 2 ? '#ffffff' : '#d8d4e8'; const sz = Math.max(1, Math.round(q.size * (1 - q.t / q.life) + 0.5)); ctx.fillRect(x, y, sz, sz); }
      else if (k === 'debris' || k === 'helmet') {
        ctx.save(); ctx.translate(x + 4, y + 4); ctx.rotate(Math.round(q.rot / (Math.PI / 4)) * Math.PI / 4);
        if (k === 'debris') ctx.drawImage(q.img, q.sx, q.sy, 8, 8, -4, -4, 8, 8); else ctx.drawImage(SPR.helmet, -8, -4);
        ctx.restore();
      } else if (k === 'chippop') ctx.drawImage(SPR.chip[Math.floor(q.t / 3) % 4], x, y);
      else if (k === 'bubble') { ctx.strokeStyle = 'rgba(220,245,255,0.8)'; ctx.strokeRect(x + 0.5, y + 0.5, 2, 2); }
      else if (k === 'tileGhost') { const ts = GFX.tileSets[sim ? sim.A.theme : 'fortress']; ctx.globalAlpha = 1 - q.t / q.life; ctx.drawImage(q.tile === T.DOOR ? ts.door : q.tile === T.DOORK ? ts.doork : ts.bossdoor, x, y); ctx.globalAlpha = 1; }
      else { ctx.fillStyle = q.color; ctx.fillRect(x, y, q.size, q.size); }
    }
  }
  function updateParticles() {
    for (const q of particles) {
      q.t++; q.x += q.vx; q.y += q.vy; q.vy += q.g;
      if (q.vr) q.rot += q.vr;
      if (q.kind === 'chippop' && q.t === q.life - 1) for (let i = 0; i < 4; i++) part({ x: q.x + 4, y: q.y + 6, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 10, kind: 'spark' });
      if (q.kind === 'bubble') q.x += Math.sin(q.t * 0.2) * 0.3;
    }
    particles = particles.filter(q => q.t < q.life);
    for (const t of texts) { t.t++; t.y -= t.t < 20 ? 0.8 : 0.3; }
    texts = texts.filter(t => t.t < 75);
  }
  function drawTexts(camX) {
    for (const t of texts) {
      if (t.t > 55 && t.t % 4 < 2) continue;
      txt(ctx, t.text, t.x - camX, t.y, { color: t.color, outline: '#0a0612', align: 'center', scale: 1 });
    }
  }

  function drawHUD(s) {
    const st = s.st;
    txt(ctx, 'LÍNEAS DE CÓDIGO', 8, 5, { color: '#ffffff', outline: '#120a1e' });
    txt(ctx, String(st.lines).padStart(7, '0'), 8, 15, { color: '#ffe14a', outline: '#120a1e' });
    ctx.drawImage(SPR.chip[Math.floor(tick / 10) % 4], 114, 14);
    txt(ctx, '×' + String(st.chips).padStart(2, '0'), 124, 15, { color: '#ffffff', outline: '#120a1e' });
    txt(ctx, 'MUNDO', 162, 5, { color: '#ffffff', outline: '#120a1e' });
    txt(ctx, LEVELS[s.li].id, 168, 15, { color: '#7ff6ff', outline: '#120a1e' });
    txt(ctx, 'TIEMPO', 210, 5, { color: '#ffffff', outline: '#120a1e' });
    const low = s.time < 100;
    txt(ctx, String(s.time).padStart(3, '0'), 219, 15, { color: low && tick % 30 < 15 ? '#ff5a5a' : '#ffffff', outline: '#120a1e' });
    txt(ctx, 'VIDAS', 266, 5, { color: '#ffffff', outline: '#120a1e' });
    ctx.drawImage(GFX.clawd({ big: false, legs: 'none', bh: 8, arms: 'side' }, 'normal')[0], 258, -11);
    txt(ctx, save.assistLives ? '×∞' : '×' + st.lives, 276, 15, { color: '#ffffff', outline: '#120a1e' });
    if (save.assistInv) txt(ctx, 'ASISTENCIA', 312, 26, { color: '#7ff6ff', outline: '#120a1e', align: 'right' });
    // barra del jefe
    const b = s.A.ents.find(e => e.type === 'boss');
    if (b && (s.bossActive || b.st === 'dying')) {
      const fill = Math.max(0, b.hp) / 24;
      txt(ctx, 'EL GRAN BLOATWARE', W / 2, 30, { color: '#ffb0d8', outline: '#120a1e', align: 'center' });
      ctx.fillStyle = '#120a1e'; ctx.fillRect(W / 2 - 62, 40, 124, 8);
      ctx.fillStyle = '#3a1a3a'; ctx.fillRect(W / 2 - 60, 42, 120, 4);
      ctx.fillStyle = b.phase === 1 ? '#c89aff' : b.phase === 2 ? '#ffb08a' : '#ff5a6a';
      ctx.fillRect(W / 2 - 60, 42, Math.round(120 * fill), 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(W / 2 - 60, 42, Math.round(120 * fill), 1);
      for (let k = 1; k < 6; k++) { ctx.fillStyle = '#120a1e'; ctx.fillRect(W / 2 - 60 + k * 20, 42, 1, 4); }
    }
    if (bossBanner > 0) {
      bossBanner--;
      const a = bossBanner > 150 ? (180 - bossBanner) / 30 : bossBanner < 30 ? bossBanner / 30 : 1;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,4,20,0.75)'; ctx.fillRect(0, 84, W, 40);
      txt(ctx, '¡JEFE FINAL!', W / 2, 90, { color: '#ffe14a', outline: '#3a0a1a', align: 'center' });
      txt(ctx, 'EL GRAN BLOATWARE', W / 2, 104, { color: '#ff86cf', outline: '#3a0a1a', align: 'center', scale: 1 });
      txt(ctx, 'Pisa su cabeza cuando no ataque', W / 2, 114, { color: '#c8c4e0', align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  function renderPlay() {
    const s = sim;
    let sx = 0, sy = 0;
    if (shakeT > 0) { sx = Math.round((Math.random() * 2 - 1) * shakeMag); sy = Math.round((Math.random() * 2 - 1) * shakeMag); }
    const camX = Math.round(s.cam.x) - sx;
    ctx.save(); ctx.translate(0, sy);
    drawBackground(s, camX);
    const behind = s.mode === 'pipeIn' || s.mode === 'pipeOut';
    for (const e of s.A.ents) if (!e.dead && (e.type === 'cable' || (e.type === 'item' && e.emerge > 0))) drawEnt(s, e, camX, 0);
    if (behind) drawPlayer(s, camX);
    drawTiles(s, camX);
    for (const e of s.A.ents) if (!e.dead && e.type !== 'cable' && (e.type !== 'item' || !(e.emerge > 0)) && e.type !== 'boss') drawEnt(s, e, camX, 1);
    for (const e of s.A.ents) if (!e.dead && e.type === 'boss') drawEnt(s, e, camX, 1);
    if (!behind) drawPlayer(s, camX);
    drawWater(s, camX);
    drawParticles(camX);
    // viento visible
    if (s.windNow && s.windNow < -0.08) for (let k = 0; k < 2; k++) part({ x: camX + W + 4, y: 30 + Math.random() * 170, vx: -4 - Math.random() * 2, life: 90, color: 'rgba(255,255,255,0.7)', size: 1, kind: 'wind' });
    for (const q of particles) if (q.kind === 'wind') { ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(Math.round(q.x - camX), Math.round(q.y), 6, 1); }
    drawTexts(camX);
    ctx.restore();
    if (flashT > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flashT / 20) + ')'; ctx.fillRect(0, 0, W, Hh); }
    drawHUD(s);
    // transición de fundido al morir / entrar en tubería
    if (s.mode === 'death' && s.modeT > 120) { ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, (s.modeT - 120) / 40) + ')'; ctx.fillRect(0, 0, W, Hh); }
    if (s.mode === 'pipeIn') { const a = Math.min(1, s.modeT / 26); ctx.fillStyle = 'rgba(0,0,0,' + a * 0.9 + ')'; ctx.fillRect(0, 0, W, Hh); }
    if (s.mode === 'pipeOut' && s.modeT < 20) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - s.modeT / 20) * 0.9 + ')'; ctx.fillRect(0, 0, W, Hh); }
    if (s.result || (s.mode === 'flag' && s.sub === 3 && s.time === 0 && s.tallyWait > 40) || (s.mode === 'world' && s.sub === 1 && s.time === 0 && s.tallyWait > 40)) {
      ctx.fillStyle = 'rgba(0,0,0,' + Math.min(1, ((s.tallyWait || 40) - 40) / 30) + ')'; ctx.fillRect(0, 0, W, Hh);
    }
    if (stateT < 20) { ctx.fillStyle = 'rgba(0,0,0,' + (1 - stateT / 20) + ')'; ctx.fillRect(0, 0, W, Hh); }
  }

  // ------------------------------------------------------------ MENÚS Y PANTALLAS
  function drawMenu(items, x, y, sel, opts) {
    opts = opts || {};
    menuHits = [];
    items.forEach((it, i) => {
      const yy = y + i * (opts.gap || 14);
      const on = i === sel;
      const label = typeof it === 'string' ? it : it.label;
      const dis = it.disabled;
      const col = dis ? '#5a5672' : on ? '#ffe14a' : '#e8e6f0';
      const w = txt(ctx, label, x, yy, { color: col, outline: '#120a1e', align: opts.align || 'center' });
      if (on) {
        const lx = opts.align === 'left' ? x - 16 : x - w / 2 - 16 + Math.round(Math.sin(tick * 0.2) * 2);
        ctx.drawImage(GFX.clawd({ big: false, legs: Math.floor(tick / 6) % 4, arms: 'side' }, 'normal')[0], lx - 5, yy - 27);
      }
      menuHits.push({ x0: opts.align === 'left' ? x - 20 : x - w / 2 - 20, x1: opts.align === 'left' ? x + 200 : x + w / 2 + 10, y0: yy - 3, y1: yy + (opts.gap || 14) - 3, i });
    });
  }
  function clickedItem() {
    if (!clickPos) return -1;
    const c = clickPos; clickPos = null;
    for (const h of menuHits) if (c.x >= h.x0 && c.x <= h.x1 && c.y >= h.y0 && c.y <= h.y1) return h.i;
    return -1;
  }
  function navMenu(n, wrap) {
    if (pressed('u')) { menuSel = (menuSel - 1 + n) % n; sfx('menuMove'); }
    if (pressed('d')) { menuSel = (menuSel + 1) % n; sfx('menuMove'); }
    void wrap;
  }

  // fondo animado del título (nivel de superficie desplazándose)
  let titleSim = null;
  function titleBG() {
    if (!titleSim) titleSim = newSim(0, { headless: true });
    titleSim.cam.x = (tick * 0.5) % 2400;
    const camX = Math.round(titleSim.cam.x);
    drawBackground(titleSim, camX);
    drawTiles(titleSim, camX);
  }
  function drawLogo(y) {
    const word = 'CLAWD', word2 = 'QUEST';
    const sc = 4;
    const totalW = (word.length * 6 - 1) * sc;
    let x = W / 2 - totalW / 2;
    for (let i = 0; i < word.length; i++) {
      const by = y + Math.round(Math.sin(tick * 0.06 + i * 0.7) * 2);
      txt(ctx, word[i], x + i * 6 * sc + 2, by + 3, { color: '#3d1a10', scale: sc });
      txt(ctx, word[i], x + i * 6 * sc, by, { color: '#da7756', scale: sc, outline: '#3d1a10' });
      ctx.save(); ctx.beginPath(); ctx.rect(0, by, W, 10); ctx.clip();
      txt(ctx, word[i], x + i * 6 * sc, by, { color: '#ffb48a', scale: sc });
      ctx.restore();
    }
    const sc2 = 2, w2 = (word2.length * 6 - 1) * sc2;
    let x2 = W / 2 - w2 / 2;
    for (let i = 0; i < word2.length; i++) {
      const by = y + 34 + Math.round(Math.sin(tick * 0.08 + i) * 1.5);
      txt(ctx, word2[i], x2 + i * 6 * sc2, by, { color: ['#7ff6ff', '#ffe14a', '#ff86cf', '#8affc0', '#c89aff'][i], scale: sc2, outline: '#120a1e' });
    }
    txt(ctx, '~ Un mundo de código ~', W / 2, y + 54, { color: '#ffffff', outline: '#120a1e', align: 'center' });
  }
  const TITLE_ITEMS = ['JUGAR', 'SELECCIÓN DE NIVEL', 'CONTROLES', 'OPCIONES', 'CRÉDITOS'];
  function updateTitle() {
    if (!firstInput || tick - firstInputTick < 15) return;
    navMenu(TITLE_ITEMS.length);
    let ch = clickedItem();
    if (accept()) ch = menuSel;
    if (ch < 0) return;
    menuSel = ch; sfx('menuOk');
    if (ch === 0) { newSession(0); goIntro(); }
    else if (ch === 1) { state = 'levelselect'; menuSel = 0; }
    else if (ch === 2) state = 'controls';
    else if (ch === 3) { state = 'options'; menuSel = 0; }
    else if (ch === 4) { state = 'credits'; stateT = 0; }
  }
  function renderTitle() {
    titleBG();
    ctx.fillStyle = 'rgba(10,6,24,0.35)'; ctx.fillRect(0, 0, W, Hh);
    drawLogo(20);
    // Clawd corriendo por la parte inferior
    const cx = ((tick * 1.4) % (W + 60)) - 30;
    ctx.drawImage(GFX.clawd({ big: true, legs: Math.floor(tick / 5) % 4, lean: 1, arms: 'back' }, 'normal')[0], Math.round(cx), 192 - 36);
    if (!firstInput) {
      if (tick % 60 < 40) txt(ctx, 'PULSA UNA TECLA O HAZ CLIC', W / 2, 120, { color: '#ffe14a', outline: '#120a1e', align: 'center' });
      txt(ctx, '(activa el sonido)', W / 2, 132, { color: '#c8c4e0', outline: '#120a1e', align: 'center' });
    } else drawMenu(TITLE_ITEMS, W / 2, 98, menuSel);
    if (save.record > 0) txt(ctx, 'RÉCORD: ' + save.record + ' líneas · ' + save.recordRank, W / 2, 172, { color: '#8affc0', outline: '#120a1e', align: 'center' });
    txt(ctx, '© 2026 · Todo generado por código', W / 2, 212, { color: '#ffffff', outline: '#120a1e', align: 'center' });
  }
  const LEVEL_NAMES = LEVELS.map(l => l.id + '  ' + l.name);
  function updateLevelSelect() {
    const n = LEVELS.length + 1;
    navMenu(n);
    let ch = clickedItem();
    if (accept()) ch = menuSel;
    if (cancel()) { sfx('menuBack'); state = 'title'; menuSel = 1; return; }
    if (ch < 0) return;
    if (ch === LEVELS.length) { sfx('menuBack'); state = 'title'; menuSel = 1; return; }
    if (ch >= save.unlocked) { sfx('thud'); return; }
    sfx('menuOk'); newSession(ch); goIntro();
  }
  function renderLevelSelect() {
    titleBG(); ctx.fillStyle = 'rgba(10,6,24,0.7)'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'SELECCIÓN DE NIVEL', W / 2, 24, { color: '#ffe14a', outline: '#120a1e', align: 'center', scale: 2 });
    const items = LEVEL_NAMES.map((n, i) => ({ label: i < save.unlocked ? n : n.slice(0, 5) + '·· BLOQUEADO', disabled: i >= save.unlocked }));
    items.push('VOLVER');
    drawMenu(items, 70, 70, menuSel, { align: 'left', gap: 22 });
    txt(ctx, 'Los niveles se desbloquean al completarlos', W / 2, 196, { color: '#c8c4e0', align: 'center' });
  }
  function updateSimple(back) { if (cancel() || accept() || clickedItem() >= 0 || clickPos) { clickPos = null; sfx('menuBack'); state = back || 'title'; } }
  function renderControls() {
    titleBG(); ctx.fillStyle = 'rgba(10,6,24,0.8)'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'CONTROLES', W / 2, 14, { color: '#ffe14a', outline: '#120a1e', align: 'center', scale: 2 });
    const L = [
      ['Moverse', '← → / A D'], ['Saltar', 'Z / ESPACIO'], ['Correr / lanzar código', 'X / SHIFT'],
      ['Agacharse / tubería', '↓ / S'], ['Trepar', '↑ / W'], ['Pausa', 'ESC / P'], ['Silenciar', 'M'],
      ['Mando', 'Cruceta · A saltar · B/X correr'], ['Táctil', 'Botones en pantalla'],
    ];
    L.forEach(([a, b], i) => { txt(ctx, a, 20, 44 + i * 15, { color: '#e8e6f0' }); txt(ctx, b, 300, 44 + i * 15, { color: '#7ff6ff', align: 'right' }); });
    txt(ctx, 'Mantén el salto para llegar más alto.', W / 2, 186, { color: '#c8c4e0', align: 'center' });
    txt(ctx, 'Pulsa para volver', W / 2, 206, { color: tick % 60 < 40 ? '#ffe14a' : '#8a86a0', align: 'center' });
  }
  function renderCredits() {
    titleBG(); ctx.fillStyle = 'rgba(10,6,24,0.8)'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'CRÉDITOS', W / 2, 14, { color: '#ffe14a', outline: '#120a1e', align: 'center', scale: 2 });
    const L = [
      ['CLAWD QUEST', '#ffb48a'], ['', ''],
      ['Protagonista: Clawd', '#e8e6f0'], ['(la mascota de Anthropic)', '#8a86a0'], ['', ''],
      ['Diseño, niveles y código: generados por código', '#e8e6f0'],
      ['Pixel art: matrices y paletas en JavaScript', '#e8e6f0'],
      ['Música y efectos: Web Audio API en tiempo real', '#e8e6f0'],
      ['Sin imágenes ni sonidos externos', '#e8e6f0'], ['', ''],
      ['¡Gracias por jugar!', '#8affc0'],
    ];
    L.forEach(([a, c], i) => txt(ctx, a, W / 2, 44 + i * 13, { color: c, align: 'center' }));
    ctx.drawImage(GFX.clawd({ big: true, eyes: 'happy', mouth: 'smile', arms: Math.floor(tick / 14) % 2 ? 'up' : 'out', front: true }, 'normal')[0], W / 2 - 11, 168);
  }
  function optionItems() {
    const bar = (v) => '◂' + '■'.replace('■', '') + '█'.repeat(0) + barStr(v) + '▸';
    void bar;
    return [
      'MÚSICA   ' + barStr(save.music),
      'EFECTOS  ' + barStr(save.sfx),
      'SILENCIAR: ' + (save.muted ? 'SÍ' : 'NO'),
      'PANTALLA COMPLETA',
      'VIDAS INFINITAS: ' + (save.assistLives ? 'SÍ' : 'NO'),
      'INVENCIBLE: ' + (save.assistInv ? 'SÍ' : 'NO'),
      'BOT DE PRUEBAS',
      'VOLVER',
    ];
  }
  function barStr(v) { const n = Math.round(v * 10); return '[' + '#'.repeat(n) + '-'.repeat(10 - n) + ']'; }
  function updateOptions() {
    const items = optionItems();
    navMenu(items.length);
    let ch = clickedItem();
    const lr = pressed('r') ? 1 : pressed('l') ? -1 : 0;
    if (cancel()) { sfx('menuBack'); state = 'title'; menuSel = 3; return; }
    if (lr && menuSel <= 1) {
      const k = menuSel === 0 ? 'music' : 'sfx';
      save[k] = Math.max(0, Math.min(1, Math.round((save[k] + lr * 0.1) * 10) / 10));
      AUDIO.setVolumes(save.music, save.sfx, save.muted); persist(); sfx('menuMove'); return;
    }
    if (accept()) ch = menuSel;
    if (ch < 0) return;
    menuSel = ch;
    if (ch <= 1) { const k = ch === 0 ? 'music' : 'sfx'; save[k] = save[k] >= 1 ? 0 : Math.round((save[k] + 0.1) * 10) / 10; AUDIO.setVolumes(save.music, save.sfx, save.muted); sfx('menuMove'); }
    else if (ch === 2) { save.muted = !save.muted; AUDIO.setVolumes(save.music, save.sfx, save.muted); }
    else if (ch === 3) { /* se gestiona en el propio evento de teclado/clic */ }
    else if (ch === 4) save.assistLives = !save.assistLives;
    else if (ch === 5) save.assistInv = !save.assistInv;
    else if (ch === 6) { startBot(); return; }
    else if (ch === 7) { sfx('menuBack'); state = 'title'; menuSel = 3; return; }
    sfx('menuOk'); persist();
  }
  function renderOptions() {
    titleBG(); ctx.fillStyle = 'rgba(10,6,24,0.8)'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'OPCIONES', W / 2, 14, { color: '#ffe14a', outline: '#120a1e', align: 'center', scale: 2 });
    drawMenu(optionItems(), 60, 46, menuSel, { align: 'left', gap: 17 });
    txt(ctx, '← → ajustan el volumen · Asistencias opcionales', W / 2, 202, { color: '#c8c4e0', align: 'center' });
  }
  function toggleFullscreen() {
    try {
      const el = document.documentElement;
      const r = !document.fullscreenElement ? (el.requestFullscreen || el.webkitRequestFullscreen).call(el) : document.exitFullscreen();
      if (r && r.catch) r.catch(() => {});
    } catch (e) { /* no soportado en este marco */ }
  }

  // ---- pantalla "MUNDO 1-x"
  function updateIntro() { if (stateT > 150 || (stateT > 30 && accept())) startLevel(); }
  function renderIntro() {
    ctx.fillStyle = '#07050f'; ctx.fillRect(0, 0, W, Hh);
    const lv = LEVELS[session.li];
    const a = Math.min(1, stateT / 20, (150 - stateT) / 20);
    ctx.globalAlpha = Math.max(0, a);
    txt(ctx, 'MUNDO ' + lv.id, W / 2, 60, { color: '#ffffff', align: 'center', scale: 2 });
    txt(ctx, lv.name, W / 2, 84, { color: '#7ff6ff', align: 'center' });
    ctx.drawImage(GFX.clawd({ big: session.power > 0, legs: 0, eyes: (tick % 90) < 6 ? 'blink' : 'open' }, session.power === 2 ? 'fire' : 'normal')[0], W / 2 - 34, 128 - 36);
    txt(ctx, '×  ' + (save.assistLives ? '∞' : session.lives), W / 2 - 4, 118, { color: '#ffffff' });
    if (session.ck >= 0) txt(ctx, 'Continúas desde el checkpoint', W / 2, 146, { color: '#8affc0', align: 'center' });
    txt(ctx, LEVEL_TIPS[session.li], W / 2, 180, { color: '#8a86a0', align: 'center' });
    ctx.globalAlpha = 1;
  }

  // ---- pausa
  const PAUSE_ITEMS = ['REANUDAR', 'REINICIAR NIVEL', 'SALIR AL TÍTULO'];
  function openPause() { if (state !== 'play') return; state = 'pause'; pauseSel = 0; AUDIO.setPaused(true); sfx('pause'); }
  function closePause() { state = 'play'; AUDIO.setPaused(false); sfx('pauseOff'); }
  function updatePause() {
    if (pressed('p')) { closePause(); return; }
    if (pressed('u')) { pauseSel = (pauseSel + 2) % 3; sfx('menuMove'); }
    if (pressed('d')) { pauseSel = (pauseSel + 1) % 3; sfx('menuMove'); }
    let ch = clickedItem();
    if (accept()) ch = pauseSel;
    if (ch < 0) return;
    if (ch === 0) closePause();
    else if (ch === 1) { AUDIO.setPaused(false); sfx('menuOk'); session.ck = -1; session.lines = session.startLines; session.power = 0; goIntro(); }
    else { AUDIO.setPaused(false); AUDIO.stop(0.3); sfx('menuBack'); state = 'title'; menuSel = 0; setTimeout(() => { if (state === 'title') AUDIO.play('title'); }, 400); }
  }
  function renderPause() {
    renderPlay();
    ctx.fillStyle = 'rgba(8,4,20,0.68)'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'PAUSA', W / 2, 60, { color: '#ffe14a', outline: '#120a1e', align: 'center', scale: 2 });
    drawMenu(PAUSE_ITEMS, W / 2, 100, pauseSel, { gap: 18 });
    txt(ctx, 'M: silenciar · ESC: reanudar', W / 2, 180, { color: '#8a86a0', align: 'center' });
  }

  // ---- game over
  function updateGameOver() {
    if (stateT < 60) return;
    navMenu(2);
    let ch = clickedItem();
    if (accept()) ch = menuSel;
    if (ch === 0) { sfx('menuOk'); session.lives = 3; session.power = 0; goIntro(); } // continúa desde el último checkpoint
    else if (ch === 1) { sfx('menuBack'); state = 'title'; menuSel = 0; AUDIO.play('title'); }
  }
  function renderGameOver() {
    ctx.fillStyle = '#07050f'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'GAME OVER', W / 2, 54, { color: '#ff5a6a', outline: '#3a0a1a', align: 'center', scale: 3 });
    txt(ctx, 'Error 404: vidas no encontradas', W / 2, 92, { color: '#c8c4e0', align: 'center' });
    ctx.drawImage(GFX.clawd({ big: false, eyes: 'x', mouth: 'o', arms: 'down', legs: 'spread', front: true }, 'normal')[0], W / 2 - 11, 100);
    if (stateT > 60) drawMenu(['CONTINUAR', 'SALIR AL TÍTULO'], W / 2, 150, menuSel, { gap: 18 });
  }

  // ---- victoria del mundo: estadísticas y rango
  function rankFor(lines) { return lines >= 16000 ? 'ARQUITECTO' : lines >= 10000 ? 'SENIOR' : lines >= 5000 ? 'JUNIOR' : 'BECARIO'; }
  function updateWorld() {
    if (stateT > 200 && accept()) { sfx('menuOk'); state = 'title'; menuSel = 0; AUDIO.play('title'); }
  }
  function renderWorld() {
    titleBG(); ctx.fillStyle = 'rgba(8,4,20,0.82)'; ctx.fillRect(0, 0, W, Hh);
    const ws = worldStats;
    txt(ctx, '¡MUNDO 1 COMPLETADO!', W / 2, 16, { color: '#ffe14a', outline: '#3a1a00', align: 'center', scale: 2 });
    const k = Math.min(1, stateT / 120);
    const rows = [
      ['LÍNEAS DE CÓDIGO', String(Math.floor(ws.lines * k))],
      ['TIEMPO', fmtTime(Math.floor(ws.frames * k))],
      ['ENEMIGOS DEPURADOS', String(Math.floor(ws.enemies * k))],
      ['SECRETOS', Math.floor(ws.secrets * k) + ' / ' + TOTAL_SECRETS],
    ];
    rows.forEach(([a, b], i) => { txt(ctx, a, 40, 50 + i * 16, { color: '#e8e6f0' }); txt(ctx, b, 280, 50 + i * 16, { color: '#7ff6ff', align: 'right' }); });
    if (stateT > 130) {
      txt(ctx, 'RANGO:', W / 2 - 50, 126, { color: '#ffffff' });
      txt(ctx, ws.rank, W / 2 + 4, 126, { color: ['#ff86cf', '#8affc0', '#7ff6ff', '#ffe14a'][['BECARIO', 'JUNIOR', 'SENIOR', 'ARQUITECTO'].indexOf(ws.rank)], outline: '#120a1e' });
      if (ws.newRecord && tick % 40 < 28) txt(ctx, '¡NUEVO RÉCORD!', W / 2, 142, { color: '#ffe14a', outline: '#3a1a00', align: 'center' });
      txt(ctx, 'Becario < 5000 · Junior < 10000 · Senior < 16000', W / 2, 158, { color: '#8a86a0', align: 'center' });
    }
    ctx.drawImage(GFX.clawd({ big: true, eyes: 'happy', mouth: 'smile', arms: Math.floor(tick / 10) % 2 ? 'up' : 'out', front: true, legs: Math.floor(tick / 10) % 2 ? 'spread' : 0 }, 'normal')[0], W / 2 - 11, 168 - (Math.floor(tick / 10) % 2) * 3);
    if (stateT > 200) txt(ctx, 'Pulsa Z para volver al título', W / 2, 212, { color: tick % 60 < 40 ? '#ffe14a' : '#8a86a0', align: 'center' });
    if (stateT < 300 && tick % 25 === 0) burst(40 + Math.random() * 240, 30 + Math.random() * 60, 24, pick([['#ffe14a', '#ffffff'], ['#ff86cf', '#ffffff'], ['#7ff6ff', '#ffffff']]), 2, 40, 0.04);
    drawParticles(0);
  }
  function fmtTime(fr) { const s = Math.floor(fr / 60); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  // ---- bot de pruebas (Web Worker con el mismo núcleo)
  function startBot() {
    state = 'bot'; stateT = 0;
    botState = { lines: [], progress: '', done: false, error: '' };
    try {
      const core = document.getElementById('core').textContent;
      const src = core + `
        onmessage = () => {
          for (let li = 0; li < LEVELS.length; li++) {
            const r = botSolve(li, { chunk: 6, beam: 40, onProgress: (p) => postMessage({ t: 'p', p }) });
            delete r.inputs; postMessage({ t: 'r', r });
          }
          postMessage({ t: 'done' });
        };`;
      const wk = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      wk.onmessage = (m) => {
        const d = m.data;
        if (d.t === 'p') botState.progress = d.p.level + ' · columna ' + d.p.x;
        else if (d.t === 'r') { botState.lines.push(d.r); console.log('[BOT]', d.r); }
        else if (d.t === 'done') { botState.done = true; wk.terminate(); }
      };
      wk.onerror = (e) => { botState.error = String(e.message || e); };
      wk.postMessage(0);
      botState.worker = wk;
    } catch (e) { botState.error = 'Worker no disponible: ' + e.message; }
  }
  function updateBot() {
    if (cancel() || (botState.done && accept())) { if (botState.worker) botState.worker.terminate(); sfx('menuBack'); state = 'options'; menuSel = 6; }
  }
  function renderBot() {
    titleBG(); ctx.fillStyle = 'rgba(8,4,20,0.88)'; ctx.fillRect(0, 0, W, Hh);
    txt(ctx, 'BOT DE PRUEBAS', W / 2, 12, { color: '#ffe14a', align: 'center', scale: 2 });
    txt(ctx, 'Simulación exacta · sin gráficos ni sonido', W / 2, 34, { color: '#c8c4e0', align: 'center' });
    txt(ctx, 'Cada pulsación dura 6 frames o más', W / 2, 44, { color: '#c8c4e0', align: 'center' });
    botState.lines.forEach((r, i) => {
      const y = 64 + i * 22;
      txt(ctx, (r.ok ? '✓ ' : '× ') + r.level, 24, y, { color: r.ok ? '#8affc0' : '#ff5a6a' });
      txt(ctx, r.ok ? (r.seconds + 's · ' + r.jumps + ' saltos · pulsación mín. ' + r.minHoldFrames + 'f') : r.reason, 74, y, { color: '#e8e6f0' });
    });
    if (!botState.done) txt(ctx, 'Calculando... ' + botState.progress + (tick % 30 < 15 ? '_' : ''), W / 2, 170, { color: '#7ff6ff', align: 'center' });
    else txt(ctx, botState.lines.every(r => r.ok) ? '¡Todos los niveles superados!' : 'Hay niveles sin superar', W / 2, 170, { color: '#ffe14a', align: 'center' });
    if (botState.error) txt(ctx, botState.error.slice(0, 50), W / 2, 186, { color: '#ff5a6a', align: 'center' });
    txt(ctx, 'ESC para volver', W / 2, 208, { color: '#8a86a0', align: 'center' });
  }

  // ------------------------------------------------------------ ACTUALIZACIÓN POR TICK
  function updatePlay() {
    if (pressed('p')) { openPause(); return; }
    const inp = mkInp({ l: A.l, r: A.r, u: A.u, d: A.d, j: A.j, b: A.b });
    stepSim(sim, inp);
    if (sim.mode === 'play') session.frames++;
    handleEvents(sim);
    updateMusic(sim);
    if (shakeT > 0) { shakeT--; if (shakeT === 0) shakeMag = 0; }
    if (flashT > 0) flashT--;
    updateParticles();
    if (sim.result) {
      pullStats();
      const S = session;
      if (sim.result === 'dead') {
        S.power = 0; S.ck = sim.checkpoint;
        if (!save.assistLives) S.lives--;
        if (S.lives > 0) goIntro();
        else { state = 'gameover'; stateT = 0; menuSel = 0; AUDIO.play('gameover'); }
      } else if (sim.result === 'clear') {
        S.power = sim.p.power; S.ck = -1; S.li++;
        save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, S.li + 1)); persist();
        goIntro();
      } else if (sim.result === 'world') {
        save.unlocked = LEVELS.length;
        const rank = rankFor(S.lines);
        const newRecord = S.lines > save.record;
        if (newRecord) { save.record = S.lines; save.recordRank = rank; }
        persist();
        worldStats = { lines: S.lines, frames: S.frames, enemies: S.enemies, secrets: S.secrets.length, rank, newRecord };
        state = 'worldclear'; stateT = 0; particles = [];
        setTimeout(() => { if (state === 'worldclear') AUDIO.play('title'); }, 9000);
      }
    }
  }

  function update() {
    readInput();
    tick++; stateT++;
    if (pressed('m')) { save.muted = !save.muted; AUDIO.setVolumes(save.music, save.sfx, save.muted); persist(); }
    switch (state) {
      case 'boot': state = 'title'; break;
      case 'title': updateTitle(); break;
      case 'levelselect': updateLevelSelect(); break;
      case 'controls': updateSimple('title'); break;
      case 'credits': updateSimple('title'); break;
      case 'options': updateOptions(); break;
      case 'intro': updateIntro(); break;
      case 'play': updatePlay(); break;
      case 'pause': updatePause(); break;
      case 'gameover': updateGameOver(); break;
      case 'worldclear': updateParticles(); updateWorld(); break;
      case 'bot': updateBot(); break;
    }
    if (state !== 'play' && state !== 'worldclear') updateParticles();
  }
  function render() {
    switch (state) {
      case 'boot': case 'title': renderTitle(); break;
      case 'levelselect': renderLevelSelect(); break;
      case 'controls': renderControls(); break;
      case 'credits': renderCredits(); break;
      case 'options': renderOptions(); break;
      case 'intro': renderIntro(); break;
      case 'play': renderPlay(); break;
      case 'pause': renderPause(); break;
      case 'gameover': renderGameOver(); break;
      case 'worldclear': renderWorld(); break;
      case 'bot': renderBot(); break;
    }
    if (save.muted) txt(ctx, 'SIN SONIDO', W - 4, Hh - 10, { color: '#ff86cf', outline: '#120a1e', align: 'right' });
  }

  // ------------------------------------------------------------ BUCLE: paso fijo de 60 ticks, render libre
  let acc = 0, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = now - last; last = now;
    if (dt > 250) dt = 250;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { update(); acc -= STEP; n++; }
    if (n >= 5) acc = 0;
    render();
  }
  requestAnimationFrame(frame);

  // API de depuración en consola
  window.ClawdQuest = {
    get state() { return state; }, get sim() { return sim; },
    start(li) { onFirstInput(); newSession(li || 0); goIntro(); },
    runBot: startBot,
  };
})();
