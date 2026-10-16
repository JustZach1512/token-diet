'use strict';
// Every non-gameplay screen. States implement enter/exit/update/render/onAction (+ optional onClick).
(function () {
  const NF = globalThis.NF;
  const U = NF.util, D = NF.draw, A = NF.audio, M = NF.music;
  const DIFF_COLORS = ['#3ef06e', '#ffd23f', '#ff3d5e'];

  // ---------------------------------------------------------------- shared visuals
  function menuBg(ctx, c1, c2, t, opts) {
    const g = ctx.createLinearGradient(0, 0, 1280, 720);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1280, 720);
    ctx.save();
    ctx.globalAlpha = (opts && opts.stripes) || 0.1;
    ctx.fillStyle = '#ffffff';
    const off = (t * 36) % 140;
    for (let x = -800; x < 1400; x += 140) {
      ctx.beginPath();
      ctx.moveTo(x + off, 0);
      ctx.lineTo(x + off + 60, 0);
      ctx.lineTo(x + off + 60 + 420, 720);
      ctx.lineTo(x + off + 420, 720);
      ctx.fill();
    }
    ctx.restore();
    if (!(opts && opts.noNotes)) {
      const r = U.rng(42);
      ctx.save();
      for (let i = 0; i < 16; i++) {
        const x = r() * 1280, sp = 20 + r() * 40, ph = r() * 720;
        const y = 760 - ((t * sp + ph) % 820);
        ctx.globalAlpha = 0.18;
        D.text(ctx, r() < 0.5 ? '♪' : '♫', x + Math.sin(t + i) * 20, y, { size: 30 + r() * 40, fill: '#ffffff', stroke: false });
      }
      ctx.restore();
    }
  }
  NF.menuBg = menuBg;
  function hint(ctx, txt) {
    D.rect(ctx, 0, 684, 1280, 36, 0, 'rgba(10,8,22,0.7)', 0);
    D.text(ctx, txt, 640, 709, { size: 24, align: 'center', font: D.HUD, fill: '#ffffff', lw: 0, stroke: false });
  }
  function menuBeat() {
    const b = A.loopBeat('menu');
    return b == null ? performance.now() / 1000 * 1.7 : b;
  }
  function playMenuMusic() {
    if (A.ready) A.playLoop('menu', M.theme('menu'), 0.9, 0.6);
  }
  function logo(ctx, x, y, scale, beat) {
    const bop = 1 + 0.06 * Math.exp(-U.mod(beat, 1) * 6);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * bop, scale * bop);
    ctx.rotate(-0.06);
    // starburst
    ctx.save();
    ctx.rotate(beat * 0.08);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,210,63,0.22)' : 'rgba(255,63,164,0.18)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 380, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    D.text(ctx, 'NOCHE', 0, -70, { size: 120, align: 'center', fill: '#ffffff', lw: 22, shadow: '#14101f', shadowY: 12 });
    D.text(ctx, 'DE', 0, 0, { size: 64, align: 'center', fill: '#ffd23f', lw: 14, shadow: '#14101f', shadowY: 8 });
    const g = ctx.createLinearGradient(0, 20, 0, 150);
    g.addColorStop(0, '#ff8ccc');
    g.addColorStop(0.5, '#ff3fa4');
    g.addColorStop(1, '#ff8a1f');
    D.text(ctx, 'FUNK', 0, 140, { size: 170, align: 'center', fill: g, lw: 26, shadow: '#14101f', shadowY: 14 });
    ctx.restore();
  }

  // ---------------------------------------------------------------- splash (audio unlock + warning)
  class Splash {
    constructor() {
      this.t = 0;
    }
    update(dt) {
      this.t += dt;
    }
    start() {
      if (this.started) return;
      this.started = true;
      A.init();
      A.applyVolumes();
      NF.game.go(new Title());
    }
    onAction() {
      this.start();
    }
    onClick() {
      this.start();
    }
    render(ctx) {
      ctx.fillStyle = '#07060d';
      ctx.fillRect(0, 0, 1280, 720);
      logo(ctx, 640, 250, 0.75, this.t * 1.5);
      const a = 0.55 + 0.45 * Math.sin(this.t * 4);
      D.text(ctx, NF.input && NF.input.touch ? 'Toca la pantalla para empezar' : 'Haz clic o presiona cualquier tecla para empezar', 640, 520, { size: 38, align: 'center', fill: U.rgba('#ffffff', a), lw: 6 });
      D.rect(ctx, 250, 570, 780, 92, 16, 'rgba(255,255,255,0.06)', 3, 'rgba(255,255,255,0.25)');
      D.text(ctx, 'Aviso: este juego tiene destellos y sacudidas de cámara.', 640, 606, { size: 26, align: 'center', font: D.HUD, fill: '#ffd23f', lw: 0, stroke: false });
      D.text(ctx, 'Puedes desactivarlos en OPCIONES. Mejor con audífonos.', 640, 640, { size: 26, align: 'center', font: D.HUD, fill: '#ffffff', lw: 0, stroke: false });
    }
  }
  NF.Splash = Splash;

  // ---------------------------------------------------------------- title
  const INTRO_PAIRS = [
    ['bip bop', 'skdoo bep'],
    ['sin samples', 'todo sintetizado'],
    ['flechas', 'por todas partes'],
    ['el ritmo no se pierde', 'solo se esconde'],
    ['¿ghost tapping?', 'activado, tranqui'],
    ['viernes por la noche', 'y con mucho funk'],
    ['el silencio', 'no tiene oportunidad'],
  ];
  let introSeen = false;
  class Title {
    enter() {
      this.t = 0;
      this.skipped = introSeen;
      this.pair = INTRO_PAIRS[Math.floor(Math.random() * INTRO_PAIRS.length)];
      this.flash = this.skipped ? 0 : 0;
      this.leaving = false;
      playMenuMusic();
    }
    update(dt) {
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt * 1.5);
      const b = menuBeat();
      if (!this.skipped && b >= 16) this.skip();
    }
    skip() {
      this.skipped = true;
      introSeen = true;
      if (NF.save.opt.flashing) this.flash = 1;
    }
    onClick() {
      this.onAction('accept');
    }
    onAction(act) {
      if (act !== 'accept' && act !== 'pause') return;
      if (!this.skipped) return this.skip();
      if (this.leaving) return;
      this.leaving = true;
      this.leaveT = this.t;
      A.sfx('confirm');
      if (NF.save.opt.flashing) this.flash = 1;
      setTimeout(() => NF.game.state === this && NF.game.go(new MainMenu()), 900);
    }
    render(ctx) {
      const beat = menuBeat();
      if (!this.skipped) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1280, 720);
        const b = Math.floor(beat);
        const lines = [];
        if (b >= 1 && b < 4) lines.push('HECHO CON');
        if (b >= 2 && b < 4) lines.push('PURO CÓDIGO');
        if (b >= 3 && b < 4) lines.push('Y MÚSICA PROCEDURAL');
        if (b >= 5 && b < 8) lines.push('UNA IDEA DE');
        if (b >= 6 && b < 8) lines.push('JUSTZACH1512');
        if (b >= 9 && b < 12) lines.push(this.pair[0].toUpperCase());
        if (b >= 10 && b < 12) lines.push(this.pair[1].toUpperCase());
        if (b >= 12) lines.push('NOCHE');
        if (b >= 13) lines.push('DE');
        if (b >= 14) lines.push('FUNK');
        lines.forEach((ln, i) => D.text(ctx, ln, 640, 260 + i * 90 - (lines.length - 1) * 30, { size: 76, align: 'center', fill: '#ffffff', lw: 12 }));
        return;
      }
      menuBg(ctx, '#2a1450', '#0d0820', this.t, { stripes: 0.05 });
      logo(ctx, 430, 300, 1, beat);
      NF.drawChar(ctx, 'luna', 1000, 640, 1.05, { beat, t: this.t, pose: this.leaving ? 'hey' : 'idle', pt: 0.5 });
      NF.drawChar(ctx, 'nico', 820, 690, 0.9, { beat, t: this.t, pose: this.leaving ? 'hey' : 'idle', pt: 0.5 });
      const a = this.leaving ? (Math.floor(this.t * 12) % 2 ? 1 : 0.3) : 0.6 + 0.4 * Math.sin(this.t * 4);
      D.text(ctx, NF.input && NF.input.touch ? 'TOCA PARA EMPEZAR' : 'PRESIONA ENTER', 430, 640, { size: 56, align: 'center', fill: this.leaving ? '#ffffff' : U.rgba('#3ff0c0', a), lw: 10 });
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
        ctx.fillRect(0, 0, 1280, 720);
      }
    }
  }
  NF.Title = Title;

  // ---------------------------------------------------------------- main menu
  const MAIN_ITEMS = [
    { label: 'MODO HISTORIA', go: () => new StoryMenu() },
    { label: 'FREEPLAY', go: () => new Freeplay() },
    { label: 'OPCIONES', go: () => new OptionsMenu() },
    { label: 'CRÉDITOS', go: () => new Credits() },
  ];
  let mainSel = 0;
  class MainMenu {
    enter() {
      this.t = 0;
      this.scroll = mainSel;
      this.chosen = -1;
      playMenuMusic();
    }
    update(dt) {
      this.t += dt;
      this.scroll = U.damp(this.scroll, mainSel, 9, dt);
    }
    onAction(act) {
      if (this.chosen >= 0) return;
      if (act === 'up' || act === 'down') {
        mainSel = U.mod(mainSel + (act === 'up' ? -1 : 1), MAIN_ITEMS.length);
        A.sfx('scroll');
      } else if (act === 'accept') {
        this.chosen = mainSel;
        this.chosenT = this.t;
        A.sfx('confirm');
        setTimeout(() => NF.game.state === this && NF.game.go(MAIN_ITEMS[this.chosen].go()), 850);
      } else if (act === 'back') {
        A.sfx('cancel');
        NF.game.go(new Title());
      }
    }
    render(ctx) {
      const magenta = this.chosen >= 0 && NF.save.opt.flashing && Math.floor((this.t - this.chosenT) * 10) % 2 === 0;
      menuBg(ctx, magenta ? '#ff4fb0' : '#ffcf4a', magenta ? '#9b1d63' : '#ff7a3d', this.t);
      const beat = menuBeat();
      MAIN_ITEMS.forEach((it, i) => {
        const sel = i === mainSel;
        const y = 360 + (i - 1.5) * 135 - (this.scroll - 1.5) * 28;
        if (this.chosen >= 0 && i !== this.chosen) {
          const k = Math.min(1, (this.t - this.chosenT) * 3);
          ctx.globalAlpha = 1 - k;
        }
        if (this.chosen === i && Math.floor((this.t - this.chosenT) * 12) % 2) ctx.globalAlpha = 0.4;
        const bop = sel ? 1 + 0.05 * Math.exp(-U.mod(beat, 1) * 6) : 1;
        const size = (sel ? 96 : 76) * bop;
        D.text(ctx, it.label, 640, y + size * 0.35, { size, align: 'center', fill: sel ? '#ffffff' : '#ffe7b0', stroke: sel ? '#ff3fa4' : '#8a4a10', lw: sel ? 16 : 12, shadow: sel ? '#14101f' : null, shadowY: 8 });
        ctx.globalAlpha = 1;
      });
      D.text(ctx, 'Noche de Funk v1.0', 18, 670, { size: 24, font: D.HUD, fill: '#ffffff', lw: 4 });
      const unlockedWeeks = NF.WEEKS.filter((w, i) => NF.save.weekUnlocked(i)).length;
      D.text(ctx, 'Semanas: ' + unlockedWeeks + '/' + NF.WEEKS.length + '  •  Muertes: ' + NF.save.data.deaths, 1262, 670, { size: 24, align: 'right', font: D.HUD, fill: '#ffffff', lw: 4 });
      hint(ctx, '↑↓ elegir   •   ENTER aceptar   •   ESC volver');
    }
  }
  NF.MainMenu = MainMenu;

  // ---------------------------------------------------------------- story mode
  let storyWeek = 0, storyDiff = 1;
  class StoryMenu {
    enter() {
      this.t = 0;
      this.scroll = storyWeek;
      this.chosen = false;
      this.shake = 0;
      this.msg = 0;
      playMenuMusic();
    }
    update(dt) {
      this.t += dt;
      this.scroll = U.damp(this.scroll, storyWeek, 10, dt);
      this.shake = Math.max(0, this.shake - dt * 3);
      this.msg = Math.max(0, this.msg - dt);
      this.diffPop = Math.max(0, (this.diffPop || 0) - dt * 4);
    }
    onAction(act) {
      if (this.chosen) return;
      const W = NF.WEEKS;
      if (act === 'up' || act === 'down') {
        storyWeek = U.mod(storyWeek + (act === 'up' ? -1 : 1), W.length);
        A.sfx('scroll');
      } else if (act === 'left' || act === 'right') {
        storyDiff = U.mod(storyDiff + (act === 'left' ? -1 : 1), 3);
        this.diffPop = 1;
        A.sfx('select');
      } else if (act === 'accept') {
        if (!NF.save.weekUnlocked(storyWeek)) {
          A.sfx('cancel');
          this.shake = 1;
          this.msg = 2;
          return;
        }
        this.chosen = true;
        this.chosenT = this.t;
        A.sfx('confirm');
        const wk = W[storyWeek];
        setTimeout(() => {
          if (NF.game.state !== this) return;
          A.stopLoop('menu', 0.4);
          NF.game.go(new NF.PlayState({ mode: 'story', songs: wk.songs, index: 0, diff: storyDiff }));
        }, 1000);
      } else if (act === 'back') {
        A.sfx('cancel');
        NF.game.go(new MainMenu());
      }
    }
    render(ctx) {
      const W = NF.WEEKS, wk = W[storyWeek];
      const beat = menuBeat();
      const unlocked = NF.save.weekUnlocked(storyWeek);
      ctx.fillStyle = '#0b0916';
      ctx.fillRect(0, 0, 1280, 720);
      // band with characters
      const band = ctx.createLinearGradient(0, 56, 0, 440);
      band.addColorStop(0, U.shade(wk.color, 0.15));
      band.addColorStop(1, U.shade(wk.color, -0.25));
      ctx.fillStyle = band;
      ctx.fillRect(0, 56, 1280, 384);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 56, 1280, 384);
      ctx.clip();
      ctx.globalAlpha = unlocked ? 1 : 0.35;
      const pose = this.chosen ? 'hey' : 'idle';
      if (wk.opp !== 'luna') {
        const od = NF.CHARS[wk.opp];
        const s = 330 / od.height;
        NF.drawChar(ctx, wk.opp, 250, 430, s, { beat, t: this.t, pose: 'idle', pt: 1, noShadow: true });
      }
      NF.drawChar(ctx, 'nico', 660, 430, 1.15, { beat, t: this.t, pose, pt: this.chosen ? this.t - this.chosenT : 1, flip: true, noShadow: true });
      NF.drawChar(ctx, 'luna', 1010, 440, 0.95, { beat, t: this.t, pose, pt: 1, noShadow: true, mic: wk.opp === 'luna' });
      ctx.restore();
      if (!unlocked) D.lock(ctx, 640, 240, 2.4);
      // top bar
      D.rect(ctx, 0, 0, 1280, 56, 0, '#0b0916', 0);
      D.text(ctx, 'PUNTUACIÓN DE LA SEMANA: ' + U.fmtNum(NF.save.weekScore(storyWeek, storyDiff)), 20, 38, { size: 30, font: D.HUD, fill: '#ffffff', lw: 0, stroke: false });
      D.text(ctx, wk.title.toUpperCase(), 1260, 38, { size: 30, align: 'right', font: D.HUD, fill: 'rgba(255,255,255,0.65)', lw: 0, stroke: false });
      // week list
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 440, 1280, 244);
      ctx.clip();
      W.forEach((w, i) => {
        const y = 510 + (i - this.scroll) * 92;
        if (y < 420 || y > 740) return;
        const sel = i === storyWeek;
        const ok = NF.save.weekUnlocked(i);
        let x = 640;
        if (sel && this.shake > 0) x += Math.sin(this.t * 60) * 14 * this.shake;
        let fill = sel ? '#ffffff' : 'rgba(255,255,255,0.4)';
        if (sel && this.chosen && Math.floor((this.t - this.chosenT) * 12) % 2) fill = '#3ff0c0';
        D.text(ctx, w.name, x, y + 24, { size: sel ? 64 : 50, align: 'center', fill: ok ? fill : 'rgba(150,150,170,0.5)', lw: 10 });
        if (!ok) D.lock(ctx, x + D.measure(ctx, w.name, sel ? 64 : 50) / 2 + 40, y + 6, 0.8);
        else if (NF.save.data.cleared.includes(i)) D.text(ctx, '✔', x + D.measure(ctx, w.name, sel ? 64 : 50) / 2 + 36, y + 20, { size: 36, fill: '#3ef06e', lw: 6 });
      });
      ctx.restore();
      // tracks
      D.text(ctx, 'CANCIONES', 150, 500, { size: 34, align: 'center', fill: '#ff6f9c', lw: 6 });
      wk.songs.forEach((id, i) => {
        D.text(ctx, unlocked ? NF.SONGS[id].name : '???', 150, 540 + i * 34, { size: 28, align: 'center', fill: '#ff9fbd', lw: 5 });
      });
      // difficulty selector
      const dx = 1110, dy = 520;
      const pop = 1 + 0.15 * (this.diffPop || 0);
      D.text(ctx, '◄', dx - 140, dy + 14, { size: 44, align: 'center', fill: '#ffffff', lw: 7 });
      D.text(ctx, '►', dx + 140, dy + 14, { size: 44, align: 'center', fill: '#ffffff', lw: 7 });
      D.text(ctx, M.DIFFS[storyDiff], dx, dy + 18, { size: 48 * pop, align: 'center', fill: DIFF_COLORS[storyDiff], lw: 9 });
      if (wk.final) D.text(ctx, '¡NIVEL FINAL: TOPE DIFÍCIL!', dx, dy + 70, { size: 24, align: 'center', fill: '#ff3d5e', lw: 5 });
      if (this.msg > 0) D.text(ctx, 'Completa la semana anterior para desbloquearla', 640, 420, { size: 30, align: 'center', fill: '#ffd23f', lw: 6 });
      hint(ctx, '↑↓ semana   •   ←→ dificultad   •   ENTER jugar   •   ESC volver');
    }
  }
  NF.StoryMenu = StoryMenu;

  // ---------------------------------------------------------------- freeplay
  let fpSel = 0, fpDiff = 1;
  class Freeplay {
    constructor(songId, diff) {
      if (songId) {
        const i = NF.SONG_ORDER.indexOf(songId);
        if (i >= 0) fpSel = i;
      }
      if (diff != null) fpDiff = diff;
    }
    enter() {
      this.t = 0;
      this.scroll = fpSel;
      this.col = NF.WEEKS[NF.SONGS[NF.SONG_ORDER[fpSel]].week].color;
      this.previewT = 0.6;
      this.previewing = null;
      this.chosen = false;
      A.stopLoop('menu', 0.3);
    }
    exit() {
      A.stopLoop('preview', 0.2);
    }
    unlocked(i) {
      return NF.save.weekUnlocked(NF.SONGS[NF.SONG_ORDER[i]].week);
    }
    update(dt) {
      this.t += dt;
      this.scroll = U.damp(this.scroll, fpSel, 11, dt);
      const id = NF.SONG_ORDER[fpSel];
      const target = NF.WEEKS[NF.SONGS[id].week].color;
      this.col = U.mix(this.col, target, Math.min(1, dt * 6));
      this.diffPop = Math.max(0, (this.diffPop || 0) - dt * 4);
      if (this.previewT > 0) {
        this.previewT -= dt;
        if (this.previewT <= 0 && !this.chosen) this.preview();
      }
    }
    preview() {
      const id = NF.SONG_ORDER[fpSel];
      if (!this.unlocked(fpSel)) {
        A.stopLoop('preview', 0.3);
        this.previewing = null;
        playMenuMusic();
        return;
      }
      if (this.previewing === id) return;
      this.previewing = id;
      A.stopLoop('menu', 0.3);
      A.playLoop('preview', M.preview(NF.SONGS[id]), 0.8, 0.5);
    }
    onAction(act) {
      if (this.chosen) return;
      const n = NF.SONG_ORDER.length;
      if (act === 'up' || act === 'down') {
        fpSel = U.mod(fpSel + (act === 'up' ? -1 : 1), n);
        A.sfx('scroll');
        this.previewT = 0.45;
      } else if (act === 'left' || act === 'right') {
        fpDiff = U.mod(fpDiff + (act === 'left' ? -1 : 1), 3);
        this.diffPop = 1;
        A.sfx('select');
      } else if (act === 'accept') {
        if (!this.unlocked(fpSel)) {
          A.sfx('cancel');
          this.lockMsg = this.t;
          return;
        }
        this.chosen = true;
        A.sfx('confirm');
        const id = NF.SONG_ORDER[fpSel];
        setTimeout(() => {
          if (NF.game.state !== this) return;
          A.stopLoop('preview', 0.3);
          NF.game.go(new NF.PlayState({ mode: 'freeplay', songs: [id], index: 0, diff: fpDiff }));
        }, 650);
      } else if (act === 'back') {
        A.sfx('cancel');
        A.stopLoop('preview', 0.3);
        NF.game.go(new MainMenu());
      }
    }
    render(ctx) {
      menuBg(ctx, U.shade(this.col, -0.15), U.shade(this.col, -0.6), this.t, { stripes: 0.07 });
      const list = NF.SONG_ORDER;
      ctx.save();
      list.forEach((id, i) => {
        const off = i - this.scroll;
        if (Math.abs(off) > 4.5) return;
        const sel = i === fpSel;
        const ok = this.unlocked(i);
        const x = 120 + off * 26, y = 380 + off * 118;
        const name = ok ? NF.SONGS[id].name : '???';
        const size = sel ? 72 : 60;
        let fill = sel ? '#ffffff' : 'rgba(255,255,255,0.55)';
        if (sel && this.chosen && Math.floor(this.t * 12) % 2) fill = '#3ff0c0';
        D.text(ctx, name, x, y + 24, { size, fill, lw: 11, shadow: sel ? 'rgba(0,0,0,0.35)' : null });
        const w = D.measure(ctx, name, size);
        if (ok) NF.drawIcon(ctx, NF.SONGS[id].opp, x + w + 70, y, 110, false, false, this.t);
        else D.lock(ctx, x + w + 50, y, 0.9);
      });
      ctx.restore();
      // info panel
      const id = list[fpSel], def = NF.SONGS[id];
      const ok = this.unlocked(fpSel);
      D.rect(ctx, 800, 14, 466, 176, 16, 'rgba(10,8,22,0.62)', 0);
      const sc = NF.save.score(id, fpDiff);
      D.text(ctx, 'RÉCORD: ' + (sc ? U.fmtNum(sc.score) : '0'), 1033, 52, { size: 32, align: 'center', font: D.HUD, fill: '#ffffff', lw: 0, stroke: false });
      D.text(ctx, sc ? (sc.acc.toFixed(2).replace('.', ',') + '%  [' + M.rank(sc.acc) + ']  ' + sc.fc) : 'Sin jugar', 1033, 82, { size: 26, align: 'center', font: D.HUD, fill: sc ? M.RANK_COLORS[M.rank(sc.acc)] : '#aaa', lw: 0, stroke: false });
      const pop = 1 + 0.15 * (this.diffPop || 0);
      D.text(ctx, '◄  ' + M.DIFFS[fpDiff] + '  ►', 1033, 126, { size: 36 * pop, align: 'center', fill: DIFF_COLORS[fpDiff], lw: 7 });
      if (ok) {
        const target = M.targetNps(def, fpDiff);
        const stars = U.clamp(Math.round(target / 1.05), 1, 10);
        D.text(ctx, '★'.repeat(stars) + '☆'.repeat(10 - stars), 1033, 160, { size: 22, align: 'center', fill: stars >= 9 ? '#ff3d5e' : '#ffd23f', lw: 4 });
        D.text(ctx, def.bpm + ' BPM  •  ~' + target.toFixed(1).replace('.', ',') + ' notas/s', 1033, 184, { size: 22, align: 'center', font: D.HUD, fill: '#d8d2ff', lw: 0, stroke: false });
      }
      if (this.lockMsg != null && this.t - this.lockMsg < 1.8) D.text(ctx, 'Desbloquéala en el MODO HISTORIA', 640, 660, { size: 30, align: 'center', fill: '#ffd23f', lw: 6 });
      hint(ctx, '↑↓ canción   •   ←→ dificultad   •   ENTER jugar   •   ESC volver');
    }
  }
  NF.Freeplay = Freeplay;

  // ---------------------------------------------------------------- options
  const pct = (v) => Math.round(v * 100) + '%';
  const OPTION_ITEMS = [
    { h: 'JUGABILIDAD' },
    { k: 'downscroll', label: 'Downscroll', type: 'bool', desc: 'Las flechas bajan hacia la parte inferior de la pantalla.' },
    { k: 'middlescroll', label: 'Flechas al centro', type: 'bool', desc: 'Tus flechas al centro; las del rival se atenúan a los lados.' },
    { k: 'ghostTap', label: 'Ghost tapping', type: 'bool', desc: 'Activado: presionar sin notas no cuenta como fallo.' },
    { k: 'scrollSpeed', label: 'Velocidad de scroll', type: 'num', min: 0, max: 4.5, step: 0.1, fmt: (v) => (v === 0 ? 'CANCIÓN' : v.toFixed(1) + 'x'), desc: 'CANCIÓN usa la velocidad de cada canción. Más alto = flechas más rápidas y separadas.' },
    { k: 'offset', label: 'Desfase de audio', type: 'num', min: -300, max: 300, step: 5, fmt: (v) => (v > 0 ? '+' : '') + v + ' ms', desc: 'Súbelo si usas audífonos bluetooth o si sientes que debes presionar tarde.' },
    { action: 'calibrate', label: 'Calibrar desfase', desc: 'Presiona al ritmo de un metrónomo para medir tu desfase.' },
    { k: 'rate', label: 'Velocidad de canción', type: 'num', min: 0.5, max: 1.5, step: 0.05, fmt: (v) => 'x' + v.toFixed(2), desc: 'Para practicar. Si no es x1.00, los récords no se guardan.' },
    { k: 'practice', label: 'Modo práctica', type: 'bool', desc: 'No puedes perder. Los récords no se guardan.' },
    { k: 'botplay', label: 'Botplay', type: 'bool', desc: 'El juego toca solo. Útil para escuchar una canción. Los récords no se guardan.' },
    { h: 'CONTROLES' },
    { action: 'keys', label: 'Configurar teclas', desc: 'Cambia las teclas de las cuatro flechas (dos por flecha).' },
    { h: 'VISUALES' },
    { k: 'flashing', label: 'Destellos', type: 'bool', desc: 'Destellos de pantalla en los momentos intensos.' },
    { k: 'camZoom', label: 'Zoom al ritmo', type: 'bool', desc: 'La cámara y la interfaz rebotan con el ritmo.' },
    { k: 'showMs', label: 'Mostrar milisegundos', type: 'bool', desc: 'Muestra qué tan temprano (-) o tarde (+) presionaste cada nota.' },
    { k: 'timeBar', label: 'Barra de tiempo', type: 'bool', desc: 'Muestra el tiempo restante de la canción.' },
    { k: 'lowQuality', label: 'Calidad baja', type: 'bool', desc: 'Menos partículas y efectos. Úsalo si el juego va lento.' },
    { k: 'fps', label: 'Contador de FPS', type: 'bool', desc: 'Muestra los cuadros por segundo en la esquina.' },
    { h: 'AUDIO' },
    { k: 'musicVol', label: 'Volumen de música', type: 'num', min: 0, max: 1, step: 0.1, fmt: pct, desc: 'Volumen de la música y los instrumentos.' },
    { k: 'voiceVol', label: 'Volumen de voces', type: 'num', min: 0, max: 1, step: 0.1, fmt: pct, desc: 'Volumen de las voces de los personajes.' },
    { k: 'sfxVol', label: 'Volumen de efectos', type: 'num', min: 0, max: 1, step: 0.1, fmt: pct, desc: 'Volumen de menús, fallos y cuenta regresiva.' },
    { k: 'hitsound', label: 'Sonido al acertar', type: 'bool', desc: 'Un clic cada vez que aciertas una nota.' },
    { h: 'DATOS' },
    { action: 'unlock', label: 'Desbloquear todas las semanas', desc: 'Abre todas las semanas y canciones sin jugarlas en orden.' },
    { action: 'reset', label: 'Borrar progreso', desc: 'Borra récords y semanas completadas. Tus opciones se mantienen.' },
  ];
  let optSel = 1;
  class OptionsMenu {
    enter() {
      this.t = 0;
      this.scroll = optSel;
      this.confirm = 0;
      this.toast = null;
      playMenuMusic();
    }
    exit() {
      NF.save.flush();
    }
    update(dt) {
      this.t += dt;
      this.scroll = U.damp(this.scroll, optSel, 10, dt);
      this.confirm = Math.max(0, this.confirm - dt);
      if (this.toast) {
        this.toast.t -= dt;
        if (this.toast.t <= 0) this.toast = null;
      }
    }
    move(d) {
      do optSel = U.mod(optSel + d, OPTION_ITEMS.length);
      while (OPTION_ITEMS[optSel].h);
      this.confirm = 0;
      A.sfx('scroll');
    }
    say(txt) {
      this.toast = { txt, t: 2.2 };
    }
    onAction(act) {
      const it = OPTION_ITEMS[optSel];
      const o = NF.save.opt;
      if (act === 'up') return this.move(-1);
      if (act === 'down') return this.move(1);
      if (act === 'back') {
        A.sfx('cancel');
        return NF.game.go(new MainMenu());
      }
      if (it.type === 'num' && (act === 'left' || act === 'right')) {
        const v = U.clamp(Math.round((o[it.k] + (act === 'left' ? -it.step : it.step)) / it.step) * it.step, it.min, it.max);
        o[it.k] = Math.round(v * 1000) / 1000;
        A.applyVolumes();
        A.sfx('scroll');
        return;
      }
      if (it.type === 'bool' && (act === 'accept' || act === 'left' || act === 'right')) {
        o[it.k] = !o[it.k];
        A.sfx('select');
        return;
      }
      if (act !== 'accept' || !it.action) return;
      if (it.action === 'keys') {
        A.sfx('confirm');
        NF.game.go(new Keybinds());
      } else if (it.action === 'calibrate') {
        A.sfx('confirm');
        NF.game.go(new Calibrate());
      } else if (it.action === 'unlock') {
        NF.save.data.unlockAll = true;
        NF.save.flush();
        A.sfx('unlock');
        this.say('¡Todas las semanas desbloqueadas!');
      } else if (it.action === 'reset') {
        if (this.confirm > 0) {
          NF.save.reset();
          A.sfx('cancel');
          this.confirm = 0;
          this.say('Progreso borrado.');
        } else {
          this.confirm = 3;
          A.sfx('select');
        }
      }
    }
    render(ctx) {
      menuBg(ctx, '#2a1d5c', '#0e0a24', this.t, { stripes: 0.05, noNotes: true });
      D.text(ctx, 'OPCIONES', 640, 82, { size: 76, align: 'center', fill: '#ffd23f', lw: 12, shadow: '#14101f' });
      const o = NF.save.opt;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 110, 1280, 470);
      ctx.clip();
      const top = U.clamp(this.scroll - 3.5, 0, OPTION_ITEMS.length - 8);
      OPTION_ITEMS.forEach((it, i) => {
        const y = 150 + (i - top) * 58;
        if (y < 90 || y > 620) return;
        if (it.h) {
          D.text(ctx, '— ' + it.h + ' —', 640, y + 14, { size: 30, align: 'center', fill: '#9b8cff', lw: 6 });
          return;
        }
        const sel = i === optSel;
        if (sel) D.rect(ctx, 150, y - 26, 980, 52, 14, 'rgba(255,255,255,0.1)', 3, 'rgba(255,255,255,0.35)');
        let label = it.label;
        if (it.action === 'reset' && this.confirm > 0) label = '¿Seguro? ENTER otra vez para borrar';
        D.text(ctx, label, 180, y + 13, { size: sel ? 38 : 34, fill: sel ? '#ffffff' : 'rgba(255,255,255,0.7)', lw: 7 });
        let val = '';
        if (it.type === 'bool') val = o[it.k] ? 'SÍ' : 'NO';
        else if (it.type === 'num') val = (sel ? '◄ ' : '') + it.fmt(o[it.k]) + (sel ? ' ►' : '');
        else val = '›';
        const col = it.type === 'bool' ? (o[it.k] ? '#3ef06e' : '#ff6b6b') : '#3ff0c0';
        D.text(ctx, val, 1100, y + 13, { size: 34, align: 'right', fill: col, lw: 7 });
      });
      ctx.restore();
      const it = OPTION_ITEMS[optSel];
      D.rect(ctx, 150, 594, 980, 70, 14, 'rgba(10,8,22,0.7)', 0);
      D.text(ctx, it.desc || '', 640, 638, { size: 26, align: 'center', font: D.HUD, fill: '#e8e3ff', lw: 0, stroke: false });
      if (this.toast) D.text(ctx, this.toast.txt, 640, 150, { size: 34, align: 'center', fill: '#3ef06e', lw: 7 });
      hint(ctx, '↑↓ elegir   •   ←→ cambiar   •   ENTER activar   •   ESC guardar y volver');
    }
  }
  NF.OptionsMenu = OptionsMenu;

  // ---------------------------------------------------------------- keybinds
  const KEY_NAMES = { ArrowLeft: '←', ArrowDown: '↓', ArrowUp: '↑', ArrowRight: '→', Space: 'ESPACIO', ShiftLeft: 'SHIFT IZQ', ShiftRight: 'SHIFT DER', ControlLeft: 'CTRL IZQ', ControlRight: 'CTRL DER', AltLeft: 'ALT', Semicolon: 'Ñ', Comma: ',', Period: '.', Slash: '-', Quote: '´', BracketLeft: '`', BracketRight: '+', Tab: 'TAB', CapsLock: 'BLOQ MAYÚS' };
  NF.keyName = (code) => {
    if (!code) return '---';
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
    return code.toUpperCase();
  };
  class Keybinds {
    enter() {
      this.t = 0;
      this.row = 0;
      this.col = 0;
      this.wait = false;
    }
    update(dt) {
      this.t += dt;
    }
    onAction(act) {
      if (this.wait) return;
      if (act === 'up' || act === 'down') {
        this.row = U.mod(this.row + (act === 'up' ? -1 : 1), 5);
        A.sfx('scroll');
      } else if (act === 'left' || act === 'right') {
        this.col = 1 - this.col;
        A.sfx('scroll');
      } else if (act === 'accept') {
        if (this.row === 4) {
          NF.save.data.keys = NF.save.DEFAULT_KEYS.map((k) => k.slice());
          NF.save.flush();
          A.sfx('confirm');
          return;
        }
        this.wait = true;
        A.sfx('select');
        NF.input.capture = (code) => {
          this.wait = false;
          if (code === 'Escape' || code === 'Enter' || code === 'Backspace') {
            A.sfx('cancel');
            return;
          }
          const keys = NF.save.data.keys;
          const prev = keys[this.row][this.col];
          for (let l = 0; l < 4; l++) for (let c = 0; c < 2; c++) if (keys[l][c] === code) keys[l][c] = prev;
          keys[this.row][this.col] = code;
          NF.save.flush();
          A.sfx('confirm');
        };
      } else if (act === 'back') {
        A.sfx('cancel');
        NF.game.go(new OptionsMenu());
      }
    }
    render(ctx) {
      menuBg(ctx, '#123a4a', '#0a0f24', this.t, { stripes: 0.05, noNotes: true });
      D.text(ctx, 'CONTROLES', 640, 90, { size: 72, align: 'center', fill: '#3ff0c0', lw: 12, shadow: '#14101f' });
      D.text(ctx, 'PRINCIPAL', 760, 160, { size: 30, align: 'center', fill: '#ffffff', lw: 6 });
      D.text(ctx, 'ALTERNATIVA', 1040, 160, { size: 30, align: 'center', fill: '#ffffff', lw: 6 });
      const keys = NF.save.data.keys;
      for (let l = 0; l < 4; l++) {
        const y = 230 + l * 90;
        D.blit(ctx, D.arrow(l, 'note'), 260, y, 0.62);
        D.text(ctx, D.LANE_NAMES[l], 320, y + 14, { size: 38, fill: D.LANE_COLORS[l], lw: 7 });
        for (let c = 0; c < 2; c++) {
          const sel = this.row === l && this.col === c;
          const x = c ? 1040 : 760;
          D.rect(ctx, x - 120, y - 32, 240, 64, 14, sel ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.3)', 3, sel ? '#ffffff' : 'rgba(255,255,255,0.2)');
          const txt = sel && this.wait ? (Math.floor(this.t * 3) % 2 ? '...' : '') : NF.keyName(keys[l][c]);
          D.text(ctx, txt, x, y + 13, { size: 36, align: 'center', fill: '#ffffff', lw: 6 });
        }
      }
      const rs = this.row === 4;
      D.text(ctx, 'Restablecer teclas', 640, 610, { size: rs ? 42 : 36, align: 'center', fill: rs ? '#ffd23f' : 'rgba(255,255,255,0.6)', lw: 7 });
      hint(ctx, this.wait ? 'Presiona la nueva tecla (ESC para cancelar)' : '↑↓ flecha   •   ←→ columna   •   ENTER cambiar   •   ESC volver');
    }
  }
  NF.Keybinds = Keybinds;

  // ---------------------------------------------------------------- offset calibration
  class Calibrate {
    enter() {
      this.t = 0;
      this.taps = [];
      this.bpm = 100;
      A.stopLoop('menu', 0.2);
      const spb = 60 / this.bpm;
      const events = [];
      for (let i = 0; i < 8; i++) {
        events.push({ t: i * spb, k: 'kick', v: 1, p: 'punch' });
        events.push({ t: i * spb, k: 'hat', v: 0.6 });
        if (i % 4 === 0) events.push({ t: i * spb, k: 'perc', v: 0.8, p: 'clave' });
      }
      this.loop = A.playLoop('calib', { events, bpm: this.bpm, loopFrom: 0, loopTo: 8 * spb }, 1);
      this.lanesActive = true;
    }
    exit() {
      A.stopLoop('calib', 0.1);
    }
    update(dt) {
      this.t += dt;
    }
    beatPos() {
      return A.loopBeat('calib');
    }
    onLanePress() {
      this.tap();
    }
    tap() {
      const b = this.beatPos();
      if (b == null || b < 1) return;
      const spb = 60 / this.bpm;
      const off = (b - Math.round(b)) * spb * 1000; // + = late
      this.taps.push(off);
      if (this.taps.length > 16) this.taps.shift();
      this.flash = 1;
    }
    avg() {
      if (this.taps.length < 4) return null;
      const s = this.taps.slice().sort((a, b) => a - b);
      const mid = s.slice(Math.floor(s.length * 0.2), Math.ceil(s.length * 0.8));
      return mid.reduce((a, b) => a + b, 0) / mid.length;
    }
    onAction(act) {
      if (act === 'accept') {
        const a = this.avg();
        if (a == null) return this.tap();
        NF.save.opt.offset = U.clamp(Math.round((NF.save.opt.offset + a) / 5) * 5, -300, 300);
        NF.save.flush();
        A.sfx('confirm');
        NF.game.go(new OptionsMenu());
      } else if (act === 'back') {
        A.sfx('cancel');
        NF.game.go(new OptionsMenu());
      } else if (act === 'down' || act === 'up' || act === 'left' || act === 'right') this.tap();
    }
    render(ctx) {
      menuBg(ctx, '#3b1457', '#0d0820', this.t, { stripes: 0.05, noNotes: true });
      D.text(ctx, 'CALIBRAR DESFASE', 640, 100, { size: 64, align: 'center', fill: '#ffd23f', lw: 11 });
      D.text(ctx, 'Presiona una flecha en cada golpe del bombo.', 640, 170, { size: 32, align: 'center', fill: '#ffffff', lw: 6 });
      const b = this.beatPos() || 0;
      const k = Math.exp(-U.mod(b, 1) * 6);
      D.circle(ctx, 640, 330, 70 + 30 * k, U.rgba('#ff3fa4', 0.4 + 0.6 * k), 8);
      const a = this.avg();
      D.text(ctx, 'Golpes: ' + this.taps.length, 640, 480, { size: 32, align: 'center', font: D.HUD, fill: '#ffffff', lw: 0, stroke: false });
      D.text(ctx, a == null ? 'Necesito al menos 4 golpes...' : 'Desfase medido: ' + (a > 0 ? '+' : '') + Math.round(a) + ' ms', 640, 530, { size: 40, align: 'center', fill: '#3ff0c0', lw: 7 });
      D.text(ctx, 'Desfase actual: ' + NF.save.opt.offset + ' ms', 640, 580, { size: 28, align: 'center', font: D.HUD, fill: '#d8d2ff', lw: 0, stroke: false });
      hint(ctx, 'FLECHAS: golpear   •   ENTER: guardar   •   ESC: cancelar');
    }
  }
  NF.Calibrate = Calibrate;

  // ---------------------------------------------------------------- credits
  const CREDITS = [
    { role: 'Idea y dirección', name: 'JustZach1512', color: '#3ff0c0', desc: 'Pidió un juego estilo FNF con historia, freeplay, opciones y un final tope difícil.' },
    { role: 'Código, arte y música', name: 'Claude (Anthropic)', color: '#ff8a1f', desc: 'Todo se dibuja con código y toda la música se sintetiza en vivo: no hay un solo archivo de audio.' },
    { role: 'Inspiración', name: "Friday Night Funkin'", color: '#ff3fa4', desc: "Un homenaje al juego de ninjamuffin99, PhantomArcade, evilsk8r y Kawai Sprite (The Funkin' Crew)." },
    { role: 'Reparto', name: 'Nico, Luna y compañía', color: '#ffb627', desc: 'DJ Tuerca, El Catrín, Vera Voltaje, Unidad 808, Rey Magma y El Silencio.' },
    { role: 'Tipografías', name: 'Lilita One y VT323', color: '#c77dff', desc: 'De Google Fonts.' },
    { role: 'Y sobre todo', name: '¡Tú!', color: '#3ef06e', desc: 'Gracias por jugar. Ahora ve y vence a El Silencio en DIFÍCIL.' },
  ];
  let credSel = 0;
  class Credits {
    enter() {
      this.t = 0;
      this.scroll = credSel;
      this.col = CREDITS[credSel].color;
      playMenuMusic();
    }
    update(dt) {
      this.t += dt;
      this.scroll = U.damp(this.scroll, credSel, 10, dt);
      this.col = U.mix(this.col, CREDITS[credSel].color, Math.min(1, dt * 5));
    }
    onAction(act) {
      if (act === 'up' || act === 'down') {
        credSel = U.mod(credSel + (act === 'up' ? -1 : 1), CREDITS.length);
        A.sfx('scroll');
      } else if (act === 'back' || act === 'accept') {
        A.sfx('cancel');
        NF.game.go(new MainMenu());
      }
    }
    render(ctx) {
      menuBg(ctx, U.shade(this.col, -0.2), U.shade(this.col, -0.7), this.t);
      CREDITS.forEach((c, i) => {
        const y = 330 + (i - this.scroll) * 110;
        if (y < -40 || y > 700) return;
        const sel = i === credSel;
        D.text(ctx, c.role.toUpperCase(), 640, y - 16, { size: 24, align: 'center', font: D.HUD, fill: sel ? '#ffffff' : 'rgba(255,255,255,0.5)', lw: 0, stroke: false });
        D.text(ctx, c.name, 640, y + 34, { size: sel ? 58 : 44, align: 'center', fill: sel ? '#ffffff' : 'rgba(255,255,255,0.55)', lw: 10 });
      });
      const c = CREDITS[credSel];
      D.rect(ctx, 140, 600, 1000, 76, 14, 'rgba(10,8,22,0.7)', 0);
      const lines = D.wrap(ctx, c.desc, 940, 26, D.HUD);
      lines.slice(0, 2).forEach((ln, i) => D.text(ctx, ln, 640, 632 + i * 28, { size: 26, align: 'center', font: D.HUD, fill: '#ffffff', lw: 0, stroke: false }));
    }
  }
  NF.Credits = Credits;

  // ---------------------------------------------------------------- results
  class ResultsState {
    constructor(r) {
      this.r = r;
    }
    enter() {
      this.t = 0;
      const r = this.r;
      this.rank = M.rank(r.acc);
      this.fc = M.fcLabel(r.stats);
      if (r.unlocked != null) A.sfx('unlock');
      else A.sfx('confirm');
      playMenuMusic();
    }
    update(dt) {
      this.t += dt;
    }
    onClick() {
      this.onAction('accept');
    }
    onAction(act) {
      if (act !== 'accept' && act !== 'back') return;
      if (this.t < 0.6) return;
      A.sfx('confirm');
      const r = this.r;
      if (r.kind === 'song') NF.game.go(new Freeplay(r.songId, r.diff));
      else if (r.finale) NF.game.go(new Ending());
      else {
        if (r.unlocked != null) storyWeek = r.unlocked;
        NF.game.go(new StoryMenu());
      }
    }
    render(ctx) {
      const r = this.r;
      const good = ['S+', 'S', 'A', 'B'].includes(this.rank);
      menuBg(ctx, '#3a1d6e', '#0d0820', this.t, { stripes: 0.06 });
      const beat = menuBeat();
      NF.drawChar(ctx, 'luna', 1040, 640, 0.95, { beat, t: this.t, pose: good ? 'hey' : 'sad', pt: 1 });
      NF.drawChar(ctx, 'nico', 820, 690, 1.1, { beat, t: this.t, pose: good ? 'hey' : 'idle', pt: 1, flip: true, miss: !good && this.rank === 'F' });
      const k = (d) => U.ease.outCubic(U.clamp((this.t - d) / 0.4, 0, 1));
      ctx.save();
      ctx.globalAlpha = k(0);
      D.text(ctx, r.title, 60, 90, { size: 56, fill: '#ffd23f', lw: 10 });
      D.text(ctx, r.name + '  •  ' + M.DIFFS[r.diff], 60, 140, { size: 34, fill: DIFF_COLORS[r.diff], lw: 6 });
      ctx.restore();
      // rank
      const rs = k(0.9);
      if (rs > 0) {
        ctx.save();
        ctx.translate(560, 330);
        ctx.scale(0.5 + rs * 0.5 + Math.max(0, 0.3 - (this.t - 1.3)) * 0.6, 0.5 + rs * 0.5);
        ctx.globalAlpha = rs;
        D.text(ctx, this.rank, 0, 60, { size: 190, align: 'center', fill: M.RANK_COLORS[this.rank], lw: 22, shadow: '#14101f', shadowY: 12 });
        ctx.restore();
        D.text(ctx, this.fc, 560, 440, { size: 40, align: 'center', fill: '#ffffff', lw: 7 });
      }
      const sc = Math.round(r.score * Math.min(1, this.t / 1.2));
      ctx.save();
      ctx.globalAlpha = k(0.2);
      D.text(ctx, 'PUNTOS', 60, 220, { size: 30, fill: '#9b8cff', lw: 5 });
      D.text(ctx, U.fmtNum(sc), 60, 280, { size: 64, fill: '#ffffff', lw: 10 });
      D.text(ctx, 'Precisión: ' + r.acc.toFixed(2).replace('.', ',') + '%', 60, 330, { size: 32, font: D.HUD, fill: '#ffffff', lw: 5 });
      const rows = [['SICK', r.stats.sick, '#3ff0c0'], ['GOOD', r.stats.good, '#3ef06e'], ['BAD', r.stats.bad, '#ffb627'], ['SHIT', r.stats.shit, '#ff6b3d'], ['FALLOS', r.stats.miss, '#ff3d5e'], ['COMBO MÁX', r.maxCombo, '#ffd23f']];
      rows.forEach(([lab, v, col], i) => {
        const y = 390 + i * 38;
        ctx.globalAlpha = k(0.3 + i * 0.08);
        D.text(ctx, lab, 60, y, { size: 30, fill: col, lw: 5 });
        D.text(ctx, String(v), 330, y, { size: 30, align: 'right', fill: '#ffffff', lw: 5 });
      });
      ctx.restore();
      if (r.best && r.saved && this.t > 1.4) D.text(ctx, '¡NUEVO RÉCORD!', 560, 520, { size: 44, align: 'center', fill: Math.floor(this.t * 6) % 2 ? '#ffd23f' : '#ffffff', lw: 8 });
      if (!r.saved) D.text(ctx, 'Récord no guardado (práctica, botplay o velocidad distinta)', 60, 640, { size: 24, font: D.HUD, fill: '#ffb627', lw: 4 });
      if (r.unlocked != null && this.t > 1.6) {
        D.rect(ctx, 380, 560, 520, 70, 16, 'rgba(10,8,22,0.8)', 4, '#3ef06e');
        D.text(ctx, '¡' + NF.WEEKS[r.unlocked].name + ' DESBLOQUEADA!', 640, 607, { size: 36, align: 'center', fill: '#3ef06e', lw: 6 });
      }
      if (this.t > 1) hint(ctx, 'ENTER: continuar');
    }
  }
  NF.ResultsState = ResultsState;

  // ---------------------------------------------------------------- ending
  class Ending {
    enter() {
      this.t = 0;
      playMenuMusic();
    }
    update(dt) {
      this.t += dt;
    }
    onClick() {
      this.onAction('accept');
    }
    onAction(act) {
      if ((act === 'accept' || act === 'back') && this.t > 2) {
        A.sfx('confirm');
        NF.game.go(new MainMenu());
      }
    }
    render(ctx) {
      menuBg(ctx, '#ff3fa4', '#3a1d6e', this.t);
      const beat = menuBeat();
      const cast = ['tuerca', 'catrin', 'vera', 'robot', 'magma', 'silencio'];
      cast.forEach((id, i) => {
        const def = NF.CHARS[id];
        const s = 230 / def.height;
        const pose = ['left', 'down', 'up', 'right'][(Math.floor(beat) + i) % 4];
        NF.drawChar(ctx, id, 110 + i * 120 + (i > 2 ? 470 : 0), 690, s, { beat, t: this.t, pose, pt: U.mod(beat, 1) * 0.5, phase2: false });
      });
      NF.drawChar(ctx, 'luna', 640, 640, 0.7, { beat, t: this.t, pose: 'hey', pt: 1 });
      NF.drawChar(ctx, 'nico', 520, 700, 0.75, { beat, t: this.t, pose: Math.floor(beat) % 2 ? 'hey' : 'up', pt: U.mod(beat, 1) * 0.5, flip: false });
      const a = U.clamp(this.t / 1.5, 0, 1);
      ctx.globalAlpha = a;
      D.text(ctx, '¡LA MÚSICA VOLVIÓ!', 640, 120, { size: 80, align: 'center', fill: '#ffffff', lw: 13, shadow: '#14101f' });
      D.text(ctx, 'Venciste a El Silencio y Ciudad Compás vuelve a bailar.', 640, 180, { size: 32, align: 'center', fill: '#ffd23f', lw: 6 });
      D.text(ctx, 'Gracias por jugar NOCHE DE FUNK', 640, 230, { size: 32, align: 'center', fill: '#ffffff', lw: 6 });
      D.text(ctx, '¿Ya lo venciste en DIFÍCIL?', 640, 280, { size: 28, align: 'center', fill: '#3ff0c0', lw: 5 });
      ctx.globalAlpha = 1;
      if (this.t > 2) hint(ctx, 'ENTER: volver al menú');
    }
  }
  NF.Ending = Ending;
})();
