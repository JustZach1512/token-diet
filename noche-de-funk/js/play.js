'use strict';
// Gameplay: one song (plus its story dialogue), from countdown to results.
(function () {
  const NF = globalThis.NF;
  const U = NF.util, D = NF.draw, A = NF.audio, M = NF.music;
  const R = M.RULES;
  const DIRS = ['left', 'down', 'up', 'right'];
  const LANE_W = 110;
  const ARROW = 0.84; // sprite scale (128 -> ~108px)
  const PX = 0.45; // px per ms per unit of scroll speed (FNF's constant)

  // ---------------------------------------------------------------- actors
  class Actor {
    constructor(id, x, y, flip) {
      this.id = id;
      this.def = NF.CHARS[id];
      this.x = x;
      this.y = y;
      this.flip = flip;
      this.scale = this.def.scale || 1;
      this.pose = 'idle';
      this.pt = 0;
      this.until = 0;
      this.miss = false;
    }
    sing(lane, until, miss) {
      this.pose = DIRS[lane];
      this.pt = 0;
      this.until = until;
      this.miss = !!miss;
    }
    act(pose, until) {
      this.pose = pose;
      this.pt = 0;
      this.until = until;
      this.miss = false;
    }
    update(dt, t) {
      this.pt += dt;
      if (this.pose !== 'idle' && this.pose !== 'dead' && t > this.until) {
        this.pose = 'idle';
        this.miss = false;
      }
    }
    focus() {
      const f = this.def.focus || [0, -150];
      return [this.x + f[0] * this.scale * (this.flip ? -1 : 1), this.y + f[1] * this.scale];
    }
    draw(ctx, beat, t, extra) {
      NF.drawChar(ctx, this.id, this.x, this.y, this.scale, Object.assign({ pose: this.pose, pt: this.pt, beat, t, miss: this.miss, flip: this.flip }, extra || {}));
    }
  }
  NF.Actor = Actor;

  // ---------------------------------------------------------------- dialogue box
  class Dialogue {
    constructor(lines, play, onDone) {
      this.lines = lines;
      this.play = play;
      this.onDone = onDone;
      this.i = -1;
      this.t = 0;
      this.alpha = 0;
      this.over = false;
      this.next();
    }
    next() {
      this.i++;
      if (this.i >= this.lines.length) return this.finish();
      const [who, text, fx] = this.lines[this.i];
      if (who !== this.who) this.slide = 0;
      this.who = who;
      this.text = text;
      this.fx = fx || null;
      this.shown = 0;
      this.lt = 0;
      if (fx === 'shake') this.play.cam.shake = Math.max(this.play.cam.shake, 9);
      if (fx === 'glitch') A.sfx('hurt');
    }
    finish() {
      if (this.over) return;
      this.over = true;
      this.onDone();
    }
    get typing() {
      return this.shown < this.text.length;
    }
    accept() {
      if (this.over) return;
      if (this.typing) this.shown = this.text.length;
      else {
        A.sfx('scroll');
        this.next();
      }
    }
    update(dt) {
      this.t += dt;
      this.lt += dt;
      this.alpha = Math.min(1, this.alpha + dt * 4);
      this.slide = Math.min(1, this.slide + dt * 5);
      if (this.typing) {
        const before = Math.floor(this.shown);
        let speed = 44;
        const ch = this.text[before - 1];
        if (ch === '.' || ch === '?' || ch === '!' || ch === ',') speed = 16;
        this.shown = Math.min(this.text.length, this.shown + speed * dt);
        for (let c = before; c < Math.floor(this.shown); c++) {
          if (c % 2 === 0 && this.text[c] !== ' ') {
            const def = NF.CHARS[this.who];
            A.sfx('blip', def ? def.blip : { f: 760, wave: 'triangle' });
          }
        }
      }
    }
    draw(ctx) {
      const a = this.alpha;
      ctx.fillStyle = `rgba(8,6,18,${0.5 * a})`;
      ctx.fillRect(0, 0, 1280, 720);
      const who = this.who, def = NF.CHARS[who];
      const right = who === 'nico' || who === 'luna';
      if (def) {
        const e = U.ease.outCubic(this.slide);
        const s = who === 'luna' ? 1.62 : 470 / def.height;
        const px = (right ? 1000 : 290) + (1 - e) * (right ? 260 : -260);
        const py = 105 + def.height * s;
        ctx.globalAlpha = e;
        NF.drawChar(ctx, who, px, py, s, { pose: 'idle', talk: this.typing, t: this.t, beat: this.t * 1.5, pt: 1, flip: who === 'nico', noShadow: true, mic: false, phase2: false });
        ctx.globalAlpha = 1;
      }
      let sx = 0, sy = 0;
      if (this.fx === 'shake' && this.lt < 0.5) {
        sx = (Math.random() - 0.5) * 16 * (1 - this.lt * 2);
        sy = (Math.random() - 0.5) * 10 * (1 - this.lt * 2);
      }
      const bx = 70 + sx, by = 468 + sy, bw = 1140, bh = 210;
      const narr = !def;
      ctx.save();
      ctx.globalAlpha = a;
      D.rect(ctx, bx, by, bw, bh, 28, narr ? '#17122a' : '#fbf8ff', 7, narr ? '#9b8cff' : D.INK);
      // name tag
      const name = def ? def.name : 'Narrador';
      const nw = D.measure(ctx, name, 30) + 44;
      const nx = right ? bx + bw - nw - 30 : bx + 30;
      D.rect(ctx, nx, by - 26, nw, 48, 16, def ? def.color : '#9b8cff', 6);
      D.text(ctx, name, nx + nw / 2, by + 9, { size: 30, align: 'center', fill: '#ffffff', lw: 6 });
      // text
      const shown = this.text.slice(0, Math.floor(this.shown));
      const lines = D.wrap(ctx, this.text, bw - 90, 34);
      let left = shown.length;
      const glitch = this.fx === 'glitch';
      lines.forEach((ln, i) => {
        if (left <= 0) return;
        const part = ln.slice(0, left);
        left -= ln.length + 1;
        const y = by + 66 + i * 44;
        ctx.font = D.font(34);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        if (glitch) {
          ctx.fillStyle = 'rgba(255,42,74,0.8)';
          ctx.fillText(part, bx + 45 + Math.random() * 6 - 3, y + Math.random() * 4 - 2);
          ctx.fillStyle = 'rgba(31,210,255,0.8)';
          ctx.fillText(part, bx + 45 + Math.random() * 6 - 3, y + Math.random() * 4 - 2);
        }
        ctx.fillStyle = narr ? '#efeaff' : glitch ? '#14101f' : '#2a2140';
        ctx.fillText(part, bx + 45, y);
      });
      if (!this.typing && Math.floor(this.t * 2.5) % 2 === 0) D.text(ctx, '▼', bx + bw - 54, by + bh - 22, { size: 30, fill: narr ? '#9b8cff' : '#ff3fa4', lw: 5 });
      ctx.restore();
      D.text(ctx, 'ENTER: seguir   ESC: saltar', 1260, 32, { size: 24, align: 'right', fill: 'rgba(255,255,255,0.75)', lw: 5 });
    }
  }
  NF.Dialogue = Dialogue;

  // ---------------------------------------------------------------- helpers
  M.rank = (acc) => (acc >= 99.5 ? 'S+' : acc >= 95 ? 'S' : acc >= 90 ? 'A' : acc >= 80 ? 'B' : acc >= 70 ? 'C' : acc >= 60 ? 'D' : 'F');
  M.fcLabel = (st) => (st.miss === 0 ? (st.bad + st.shit === 0 ? (st.good === 0 ? 'SFC' : 'GFC') : 'FC') : st.miss < 10 ? 'SDCB' : 'Clear');
  M.RANK_COLORS = { 'S+': '#ffd23f', S: '#3ff0c0', A: '#1fd2ff', B: '#3ef06e', C: '#ffb627', D: '#ff8a1f', F: '#ff3d5e' };
  const RATING_STYLE = {
    sick: { txt: 'SICK!!', fill: '#3ff0c0', size: 62 },
    good: { txt: 'GOOD', fill: '#3ef06e', size: 54 },
    bad: { txt: 'BAD', fill: '#ffb627', size: 50 },
    shit: { txt: 'SHIT', fill: '#ff6b3d', size: 48 },
  };

  // ---------------------------------------------------------------- play state
  class PlayState {
    // o: { mode: 'story'|'freeplay', songs: [ids], index, diff, retry, weekStats, deaths }
    constructor(o) {
      this.o = o;
      this.mode = o.mode;
      this.index = o.index || 0;
      this.songId = o.songs[this.index];
      this.def = NF.SONGS[this.songId];
      this.W = NF.WEEKS[this.def.week];
      this.diff = o.diff;
      this.weekStats = o.weekStats || { score: 0, sick: 0, good: 0, bad: 0, shit: 0, miss: 0, accSum: 0, judged: 0, maxCombo: 0, clean: true };
      this.lanesActive = false;
    }

    enter() {
      const opt = (this.opt = NF.save.opt);
      this.rate = opt.rate || 1;
      this.data = M.build(this.def, this.diff, this.rate);
      this.spb = this.data.spb;
      this.mech = this.def.mech || {};
      this.speed = opt.scrollSpeed || this.def.speed * [0.88, 0.94, 1][this.diff];
      this.down = opt.downscroll;
      this.middle = opt.middlescroll;
      this.botplay = this.o.forceBotplay != null ? this.o.forceBotplay : opt.botplay;
      this.practice = this.o.forcePractice != null ? this.o.forcePractice : opt.practice;
      this.dirty = this.o.forceBotplay != null || this.o.forcePractice != null;
      this.stage = NF.STAGES[this.W.stage];
      this.S = { t: 0, beat: 0, bop: 0, dt: 0, energy: 1, erupt: 0, phase2: false, low: opt.lowQuality, flicker: 1, static: 0 };
      const P = NF.STAGE_POS;
      if (this.W.opp === 'luna') {
        this.opp = new Actor('luna', P.gf[0], P.gf[1], false);
        this.gf = null;
      } else {
        this.opp = new Actor(this.W.opp, P.opp[0], P.opp[1], false);
        this.gf = new Actor('luna', P.gf[0], P.gf[1], false);
      }
      this.bf = new Actor('nico', P.bf[0], P.bf[1], true);

      this.notes = this.data.notes.map((n) => Object.assign({}, n, { hit: false, miss: false, held: false, done: false, end: n.t + n.len }));
      this.bfNotes = this.notes.filter((n) => n.side === 1);
      this.oppNotes = this.notes.filter((n) => n.side === 0);
      this.oppI = 0;
      this.bfI = 0;
      this.renderI = 0;
      this.gevI = 0;
      this.secI = 0;
      this.holding = [];
      this.oppHolding = [];
      this.keys = [false, false, false, false];
      this.strum = [];
      for (let i = 0; i < 8; i++) this.strum.push({ st: 'static', until: 0, pop: 0 });
      this.hp = 1;
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.stats = { sick: 0, good: 0, bad: 0, shit: 0, miss: 0 };
      this.accSum = 0;
      this.judged = 0;
      this.popups = [];
      this.splashes = [];
      this.cam = { x: 650, y: 400, zoom: this.stage.zoom, bump: 0, hud: 0, shake: 0 };
      const f0 = this.focusFor('both');
      this.cam.x = f0[0];
      this.cam.y = f0[1];
      this.bumpEvery = 4;
      this.lastBeat = -99;
      this.flash = 0;
      this.flashCol = '#ffffff';
      this.mod = { on: false, kind: 'wave', amt: 0 };
      this.hurtFx = 0;
      this.iconBop = 0;
      this.deaths = this.o.deaths || 0;
      this.t = -10;
      this.realT = 0;
      this.paused = false;
      this.phase = 'intro';
      this.countShown = -1;
      const dl = NF.DIALOGUE[this.songId];
      if (this.mode === 'story' && !this.o.retry && dl && dl.before) {
        this.phase = 'dialogue';
        this.dialogue = new Dialogue(dl.before, this, () => this.startSong());
        A.playLoop('dlg', M.theme(this.W.dlg), 0.5, 1);
      } else this.startSong();
    }

    startSong() {
      A.stopLoop('dlg', 0.4);
      this.dialogue = null;
      this.graph = A.createGraph({ opp: this.opp.def.voice, bf: NF.CHARS.nico.voice });
      this.seq = new A.Sequencer(this.data.events, this.graph);
      this.songStart = A.now() + 0.5 + 4 * this.spb;
      this.seq.play(this.songStart, 0);
      this.phase = 'play';
      this.lanesActive = true;
      // schedule the countdown bleeps on the audio clock
      for (let i = 0; i < 4; i++) A.sfx(i < 3 ? 'count' : 'go', i, this.songStart - (4 - i) * this.spb);
    }

    songTime() {
      return A.time() - A.latency() - this.songStart - (this.opt.offset || 0) / 1000;
    }

    exit() {
      this.killAudio();
      A.stopLoop('dlg', 0.2);
      A.stopLoop('pause', 0.1);
      A.stopLoop('gameover', 0.3);
    }
    killAudio() {
      if (this.seq) this.seq.stop();
      if (this.graph) this.graph.kill(0.05);
    }

    // ---------- layout ----------
    laneX(side, lane) {
      if (this.middle) {
        if (side === 1) return 640 + (lane - 1.5) * LANE_W;
        return lane < 2 ? 90 + lane * LANE_W : 1190 - (3 - lane) * LANE_W;
      }
      return (side === 1 ? 960 : 320) + (lane - 1.5) * LANE_W;
    }
    strumY() {
      return this.down ? 626 : 94;
    }
    modOffset(side, lane, t) {
      const a = this.mod.amt;
      if (a < 0.01) return [0, 0];
      if (this.mod.kind === 'wave') return [Math.sin(t * 2.2 + lane * 0.9 + side) * 34 * a, Math.sin(t * 4.4 + lane * 1.4) * 24 * a];
      return [Math.sin(t * 3.1 + lane * 1.7 + side * 2) * 46 * a, Math.cos(t * 2.3 + lane) * 12 * a];
    }
    // Like FNF, the camera leans toward whoever sings instead of centering on them.
    focusFor(who) {
      const a = this.opp.focus(), b = this.bf.focus();
      const mx = (a[0] + b[0]) / 2, my = 400;
      if (who === 'opp') return [U.lerp(mx, a[0], 0.42), U.lerp(my, a[1], 0.25)];
      if (who === 'bf') return [U.lerp(mx, b[0], 0.42), U.lerp(my, b[1], 0.25)];
      return [mx, my];
    }

    // ---------- input ----------
    onLanePress(lane, lag) {
      if (this.phase !== 'play' || this.paused || this.botplay) {
        this.keys[lane] = true;
        return;
      }
      this.keys[lane] = true;
      const t = this.songTime() - (lag || 0);
      const st = this.strum[4 + lane];
      let best = null, hurt = null;
      for (let i = this.bfI; i < this.bfNotes.length; i++) {
        const n = this.bfNotes[i];
        if (n.t > t + R.win.shit) break;
        if (n.lane !== lane || n.hit || n.miss) continue;
        if (Math.abs(n.t - t) > R.win.shit) continue;
        if (n.type === 0) {
          if (!best) best = n;
        } else if (!hurt && Math.abs(n.t - t) <= R.hurtWin) hurt = n;
      }
      if (best) this.hitNote(best, best.t - t);
      else if (hurt) this.hurtNote(hurt);
      else {
        st.st = 'press';
        if (!this.opt.ghostTap) this.ghostMiss(lane);
      }
    }
    onLaneRelease(lane) {
      this.keys[lane] = false;
      const st = this.strum[4 + lane];
      if (st.st === 'press') st.st = 'static';
      if (this.botplay || this.phase !== 'play' || this.paused) return;
      const t = this.songTime();
      for (let i = this.holding.length - 1; i >= 0; i--) {
        const n = this.holding[i];
        if (n.lane !== lane) continue;
        this.holding.splice(i, 1);
        n.held = false;
        if (n.end - t > 0.12) {
          n.dropped = true;
          this.breakCombo();
          this.stats.miss++;
          this.hp += R.health.drop;
          if (n.voice) n.voice.stop();
          this.bf.sing(lane, t + 0.3, true);
        } else n.done = true;
        st.st = 'static';
      }
    }
    onAction(act) {
      if (this.phase === 'dialogue' && this.dialogue) {
        if (act === 'accept') this.dialogue.accept();
        else if (act === 'back') {
          A.sfx('cancel');
          this.dialogue.finish();
        }
        return;
      }
      if (this.phase === 'outro' && this.dialogue) {
        if (act === 'accept') this.dialogue.accept();
        else if (act === 'back') this.dialogue.finish();
        return;
      }
      if (this.phase === 'dead') {
        if (act === 'accept') this.retry();
        else if (act === 'back') this.quit();
        return;
      }
      if (this.paused) return this.pauseAction(act);
      if (this.phase === 'play' && (act === 'pause' || act === 'back')) this.pause();
    }

    // ---------- judgement ----------
    hitNote(n, dt, perfect) {
      const t = this.t;
      n.hit = true;
      const r = perfect ? 'sick' : M.judge(dt);
      this.stats[r]++;
      this.score += R.score[r];
      this.accSum += R.acc[r];
      this.judged++;
      this.hp += R.health[r];
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.popRating(r, dt);
      if (r === 'sick') this.splash(n.lane);
      const st = this.strum[4 + n.lane];
      st.st = 'confirm';
      st.until = n.len > 0 ? n.end : t + 0.13;
      st.pop = 1;
      this.bf.sing(n.lane, Math.max(n.end, t) + this.spb * 0.5);
      if (this.graph && this.graph.voices.bf) n.voice = this.graph.voices.bf.note(A.now(), n.m, n.vd, n.harm ? 0.5 : 1, n.vw, n.harm ? 0 : 1);
      if (n.len > 0) {
        n.held = true;
        this.holding.push(n);
      } else n.done = true;
      if (this.opt.hitsound) A.sfx('hit');
    }
    missNote(n) {
      n.miss = true;
      this.stats.miss++;
      this.score += R.score.miss;
      this.judged++;
      this.hp += R.health.miss;
      this.breakCombo();
      A.sfx('miss');
      this.bf.sing(n.lane, this.t + 0.35, true);
      if (this.graph && this.graph.voices.bf) this.graph.voices.bf.stopAll();
    }
    ghostMiss(lane) {
      this.stats.miss++;
      this.score += R.score.miss;
      this.hp += R.health.ghost;
      this.breakCombo();
      A.sfx('miss');
      this.bf.sing(lane, this.t + 0.3, true);
    }
    hurtNote(n) {
      n.hit = true;
      n.done = true;
      const kind = this.mech.hurtKind || 'static';
      this.hp += R.hurt[kind];
      this.stats.miss++;
      this.breakCombo();
      A.sfx('hurt');
      this.hurtFx = 1;
      this.cam.shake = Math.max(this.cam.shake, 12);
      if (kind === 'static') this.S.static = 0.9;
      this.bf.sing(n.lane, this.t + 0.4, true);
      this.popups.push({ kind: 'text', txt: kind === 'fire' ? '¡QUEMADO!' : '¡ESTÁTICA!', fill: '#ff3d5e', x: this.popX(), y: this.popY() - 40, vy: -260, t: 0, size: 52 });
    }
    breakCombo() {
      if (this.combo >= 10 && this.gf) this.gf.act('sad', this.t + 0.6);
      this.combo = 0;
    }
    popX() {
      return this.middle ? 300 : 520;
    }
    popY() {
      return this.down ? 430 : 330;
    }
    popRating(r, dt) {
      const S = RATING_STYLE[r];
      const x = this.popX() + (Math.random() - 0.5) * 16, y = this.popY();
      this.popups.push({ kind: 'text', txt: S.txt, fill: S.fill, x, y, vy: -220 - Math.random() * 40, vx: (Math.random() - 0.5) * 30, t: 0, size: S.size });
      if (this.combo >= 5 || this.combo === 0) {
        const s = String(this.combo).padStart(3, '0');
        this.popups.push({ kind: 'combo', txt: s, x: x - 20, y: y + 64, vy: -150 - Math.random() * 60, vx: 0, t: 0 });
      }
      if (this.opt.showMs) this.popups.push({ kind: 'ms', txt: (dt > 0 ? '-' : '+') + Math.round(Math.abs(dt) * 1000) + 'ms', fill: S.fill, x: x + 150, y: y + 20, vy: -30, vx: 0, t: 0 });
      if (this.popups.length > 24) this.popups.splice(0, this.popups.length - 24);
    }
    splash(lane) {
      if (this.opt.lowQuality) return;
      this.splashes.push({ lane, t: 0, side: 1 });
    }

    // ---------- pause / death / end ----------
    pause() {
      if (this.paused || this.phase !== 'play') return;
      this.paused = true;
      this.pauseSel = 0;
      this.pausePos = A.now() - this.songStart;
      this.killAudio();
      for (const n of this.holding) if (n.voice) n.voice.stop();
      A.sfx('pause');
      A.playLoop('pause', M.theme('pause'), 0.45, 2);
    }
    resume() {
      this.paused = false;
      A.stopLoop('pause', 0.1);
      this.audioFrom(this.pausePos, 0.15);
    }
    // (Re)start the backing track at song position `pos`, `delay` seconds from now.
    audioFrom(pos, delay) {
      this.killAudio();
      this.graph = A.createGraph({ opp: this.opp.def.voice, bf: NF.CHARS.nico.voice });
      this.seq = new A.Sequencer(this.data.events, this.graph);
      this.songStart = A.now() + delay - pos;
      this.seq.play(this.songStart + pos, pos);
    }
    pauseItems() {
      return ['Continuar', 'Reiniciar canción', 'Modo práctica: ' + (this.practice ? 'SÍ' : 'NO'), 'Botplay: ' + (this.botplay ? 'SÍ' : 'NO'), 'Salir al menú'];
    }
    pauseAction(act) {
      const n = this.pauseItems().length;
      if (act === 'up' || act === 'down') {
        this.pauseSel = U.mod(this.pauseSel + (act === 'up' ? -1 : 1), n);
        A.sfx('scroll');
      } else if (act === 'back' || act === 'pause') {
        this.resume();
      } else if (act === 'accept') {
        const sel = this.pauseSel;
        if (sel === 0) this.resume();
        else if (sel === 1) {
          A.sfx('confirm');
          A.stopLoop('pause', 0.1);
          this.restart(true);
        } else if (sel === 2) {
          this.practice = !this.practice;
          this.dirty = true;
          A.sfx('select');
        } else if (sel === 3) {
          this.botplay = !this.botplay;
          this.dirty = true;
          A.sfx('select');
        } else if (sel === 4) {
          A.sfx('cancel');
          this.quit();
        }
      }
    }
    restart(skipDialogue) {
      const o = Object.assign({}, this.o, { retry: skipDialogue, deaths: this.deaths });
      if (this.dirty) {
        o.forcePractice = this.practice;
        o.forceBotplay = this.botplay;
      }
      NF.game.go(new PlayState(o));
    }
    quit() {
      NF.game.go(this.mode === 'story' ? new NF.StoryMenu() : new NF.Freeplay(this.songId, this.diff));
    }
    die() {
      this.phase = 'dead';
      this.deadT = 0;
      this.lanesActive = false;
      this.killAudio();
      this.deaths++;
      NF.save.data.deaths++;
      NF.save.flush();
      A.sfx('death');
      this.bf.act('dead', 1e9);
      this.cam.shake = 14;
    }
    retry() {
      if (this.retrying) return;
      this.retrying = true;
      A.stopLoop('gameover', 0.3);
      A.sfx('retry');
      this.bf.act('hey', 1e9);
      setTimeout(() => {
        if (NF.game.state === this) this.restart(true);
      }, 900);
    }
    finishSong() {
      if (this.phase !== 'play') return;
      this.phase = 'done';
      this.lanesActive = false;
      const scored = !this.botplay && !this.practice && this.rate === 1;
      const acc = this.judged ? (this.accSum / this.judged) * 100 : 100;
      const fc = M.fcLabel(this.stats);
      let best = false;
      if (scored) best = NF.save.submitScore(this.songId, this.diff, this.score, acc, fc);
      const ws = this.weekStats;
      ws.score += this.score;
      for (const k in this.stats) ws[k] += this.stats[k];
      ws.accSum += this.accSum;
      ws.judged += this.judged;
      ws.maxCombo = Math.max(ws.maxCombo, this.maxCombo);
      ws.clean = ws.clean && scored;
      const isLast = this.index >= this.o.songs.length - 1;
      if (this.mode === 'story' && !isLast) {
        NF.game.go(new PlayState(Object.assign({}, this.o, { index: this.index + 1, weekStats: ws, retry: false, deaths: this.deaths })));
        return;
      }
      const results = () => {
        if (this.mode === 'story') {
          const wacc = ws.judged ? (ws.accSum / ws.judged) * 100 : 100;
          let res = { best: false, newlyCleared: false };
          if (ws.clean) res = NF.save.submitWeek(this.def.week, this.diff, ws.score);
          NF.game.go(
            new NF.ResultsState({
              kind: 'week', title: this.def.week === 0 ? '¡TUTORIAL COMPLETADO!' : '¡' + this.W.name + ' COMPLETADA!', name: this.W.title, diff: this.diff,
              score: ws.score, acc: wacc, stats: ws, maxCombo: ws.maxCombo, best: res.best, saved: ws.clean,
              unlocked: res.newlyCleared && this.def.week + 1 < NF.WEEKS.length ? this.def.week + 1 : null,
              finale: res.newlyCleared && this.W.final, week: this.def.week,
            })
          );
        } else {
          NF.game.go(
            new NF.ResultsState({
              kind: 'song', title: '¡CANCIÓN COMPLETADA!', name: this.def.name, diff: this.diff, score: this.score, acc,
              stats: Object.assign({}, this.stats), maxCombo: this.maxCombo, best, saved: scored, songId: this.songId,
            })
          );
        }
      };
      const dl = NF.DIALOGUE[this.songId];
      this.bf.act('hey', this.t + 1.5);
      if (this.gf) this.gf.act('hey', this.t + 1.5);
      if (this.mode === 'story' && dl && dl.after) {
        this.phase = 'outro';
        this.killAudio();
        A.playLoop('dlg', M.theme(this.W.dlg), 0.5, 1);
        this.dialogue = new Dialogue(dl.after, this, () => {
          A.stopLoop('dlg', 0.5);
          results();
        });
      } else
        setTimeout(() => {
          if (NF.game.state === this) results();
        }, 600);
    }

    // ---------- update ----------
    update(dt) {
      this.realT += dt;
      const S = this.S;
      S.dt = dt;
      S.low = this.opt.lowQuality;
      if (this.phase === 'dialogue' || this.phase === 'outro') {
        this.dialogue && this.dialogue.update(dt);
        S.t += dt;
        S.beat = this.realT * 1.6;
        S.bop = Math.exp(-U.mod(S.beat, 1) * 5);
        this.opp.update(dt, 1e9);
        this.bf.update(dt, this.phase === 'outro' ? this.realT : 1e9);
        if (this.gf) this.gf.update(dt, this.phase === 'outro' ? this.realT : 1e9);
        this.updateCamera(dt, 'both');
        return;
      }
      if (this.phase === 'dead') {
        this.deadT += dt;
        if (this.deadT > 1.6 && !this.goLoop && !this.retrying) {
          this.goLoop = true;
          A.playLoop('gameover', M.theme('gameover'), 0.7, 1.5);
        }
        this.bf.update(dt, 0);
        const f = this.bf.focus();
        this.cam.x = U.damp(this.cam.x, f[0], 3, dt);
        this.cam.y = U.damp(this.cam.y, f[1], 3, dt);
        this.cam.zoom = U.damp(this.cam.zoom, 1.25, 1.5, dt);
        this.cam.shake = U.damp(this.cam.shake, 0, 6, dt);
        return;
      }
      if (this.paused || this.phase === 'done') return;
      const t = (this.t = this.songTime());
      const spb = this.spb;
      const beat = t / spb;
      S.t += dt;
      S.beat = beat;
      S.bop = beat < 0 ? 0 : Math.exp(-U.mod(beat, 1) * 5);
      // beat events
      const bi = Math.floor(beat);
      if (bi !== this.lastBeat) {
        this.lastBeat = bi;
        this.iconBop = 1;
        if (bi >= 0 && bi % this.bumpEvery === 0 && this.opt.camZoom) {
          this.cam.bump += 0.015;
          this.cam.hud += 0.03;
        }
        if (bi < 0 && bi >= -4) {
          this.countShown = bi + 4;
          this.countT = 0;
        }
      }
      this.countT = (this.countT || 0) + dt;
      // gameplay events
      const gev = this.data.gev;
      while (this.gevI < gev.length && gev[this.gevI].t <= t) this.onGev(gev[this.gevI++]);
      // sections -> camera + energy
      const secs = this.data.sections;
      while (this.secI < secs.length - 1 && secs[this.secI + 1].t0 <= t) this.secI++;
      const sec = secs[this.secI];
      S.energy = sec ? sec.energy : 1;

      // opponent sings automatically
      while (this.oppI < this.oppNotes.length && this.oppNotes[this.oppI].t <= t) {
        const n = this.oppNotes[this.oppI++];
        n.hit = true;
        const st = this.strum[n.lane];
        st.st = 'confirm';
        st.until = n.len > 0 ? n.end : t + 0.13;
        st.pop = 1;
        this.opp.sing(n.lane, Math.max(n.end, t) + spb * 0.6);
        if (n.len > 0) {
          n.held = true;
          this.oppHolding.push(n);
        } else n.done = true;
        if (this.mech.drain && this.hp > this.mech.drainFloor) this.hp = Math.max(this.mech.drainFloor, this.hp - this.mech.drain * R.drainScale[this.diff]);
      }
      for (let i = this.oppHolding.length - 1; i >= 0; i--) {
        const n = this.oppHolding[i];
        if (t >= n.end) {
          n.held = false;
          n.done = true;
          this.oppHolding.splice(i, 1);
        }
      }
      // player: botplay, misses
      for (let i = this.bfI; i < this.bfNotes.length; i++) {
        const n = this.bfNotes[i];
        if (n.t > t) break;
        if (this.botplay && !n.hit && !n.miss && n.type === 0) this.hitNote(n, 0, true);
      }
      while (this.bfI < this.bfNotes.length) {
        const n = this.bfNotes[this.bfI];
        if (n.t > t - R.win.shit) break;
        if (!n.hit && !n.miss) {
          if (n.type === 0) this.missNote(n);
          else n.miss = true;
        }
        this.bfI++;
      }
      // held notes
      for (let i = this.holding.length - 1; i >= 0; i--) {
        const n = this.holding[i];
        const held = this.botplay || this.keys[n.lane];
        if (t >= n.end) {
          n.held = false;
          n.done = true;
          this.holding.splice(i, 1);
          this.strum[4 + n.lane].until = t + 0.08;
          continue;
        }
        if (held) {
          this.hp += R.health.holdPerSec * dt;
          this.bf.until = Math.max(this.bf.until, t + spb * 0.25);
        }
      }
      // strum states
      for (let i = 0; i < 8; i++) {
        const st = this.strum[i];
        st.pop = U.damp(st.pop, 0, 10, dt);
        if (st.st === 'confirm' && t > st.until) st.st = i >= 4 && this.keys[i - 4] && !this.botplay ? 'press' : 'static';
      }
      // health
      this.hp = U.clamp(this.hp, 0, 2);
      if (this.hp <= 0) {
        if (this.practice) this.hp = 0.001;
        else return this.die();
      }
      // actors
      this.opp.update(dt, t);
      this.bf.update(dt, t);
      if (this.gf) this.gf.update(dt, t);
      // effects
      this.updateCamera(dt, sec ? sec.who : 'both');
      this.mod.amt = U.damp(this.mod.amt, this.mod.on ? 1 : 0, 2.5, dt);
      this.flash = U.damp(this.flash, 0, 4, dt);
      this.hurtFx = U.damp(this.hurtFx, 0, 4, dt);
      this.iconBop = U.damp(this.iconBop, 0, 9, dt);
      S.erupt = U.damp(S.erupt, 0, 1.5, dt);
      S.static = U.damp(S.static, 0, 2.5, dt);
      for (const p of this.popups) {
        p.t += dt;
        p.vy += 700 * dt;
        p.y += p.vy * dt;
        p.x += (p.vx || 0) * dt;
      }
      this.popups = this.popups.filter((p) => p.t < 0.75);
      for (const s of this.splashes) s.t += dt;
      this.splashes = this.splashes.filter((s) => s.t < 0.35);
      while (this.renderI < this.notes.length && this.notes[this.renderI].end < t - 1.5) this.renderI++;
      if (t >= this.data.length) this.finishSong();
    }
    onGev(g) {
      const fl = this.opt.flashing;
      switch (g.e) {
        case 'bump':
          this.bumpEvery = g.every;
          break;
        case 'flash':
          if (fl) {
            this.flash = g.a;
            this.flashCol = '#ffffff';
          }
          if (this.W.stage === 'volcano') this.S.erupt = 1;
          break;
        case 'shake':
          this.cam.shake = Math.max(this.cam.shake, g.a);
          this.S.erupt = 1;
          break;
        case 'mod':
          this.mod.on = g.on;
          if (g.kind) this.mod.kind = g.kind;
          break;
        case 'silence':
          this.S.static = 1;
          if (fl) {
            this.flash = 0.6;
            this.flashCol = '#000000';
          }
          break;
        case 'phase2':
          this.S.phase2 = true;
          if (fl) {
            this.flash = 0.9;
            this.flashCol = '#ff2a4a';
          }
          break;
        case 'end':
          break;
      }
    }
    updateCamera(dt, who) {
      const f = this.focusFor(who);
      const c = this.cam;
      c.x = U.damp(c.x, f[0], 2.4, dt);
      c.y = U.damp(c.y, f[1], 2.4, dt);
      c.bump = U.damp(c.bump, 0, 5, dt);
      c.hud = U.damp(c.hud, 0, 5, dt);
      c.shake = U.damp(c.shake, 0, 5, dt);
      c.zoom = U.damp(c.zoom, this.stage.zoom, 3, dt);
    }

    // ---------- draw ----------
    render(ctx, scr) {
      const c = this.cam;
      const sh = c.shake > 0.3 ? c.shake : 0;
      const sx = sh ? (Math.random() - 0.5) * sh : 0, sy = sh ? (Math.random() - 0.5) * sh : 0;
      const zoom = c.zoom + c.bump;
      const set = (f) => {
        const z = 1 + (zoom - 1) * f;
        ctx.setTransform(scr.s, 0, 0, scr.s, scr.x, scr.y);
        ctx.translate(640 + sx * f, 360 + sy * f);
        ctx.scale(z, z);
        ctx.translate(-(640 + (c.x - 640) * f), -(360 + (c.y - 360) * f));
      };
      const S = this.S;
      const dead = this.phase === 'dead';
      ctx.save();
      this.stage.back(ctx, S, set);
      set(1);
      if (dead) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.92, this.deadT * 1.2)})`;
        ctx.fillRect(-2000, -2000, 5000, 5000);
      }
      const beat = S.beat, t = S.t;
      if (!dead) {
        if (this.gf) this.gf.draw(ctx, beat, t);
        this.opp.draw(ctx, beat, t, { phase2: S.phase2, mic: this.opp.id === 'luna' });
      }
      this.bf.draw(ctx, beat, t);
      if (!dead && this.stage.front) this.stage.front(ctx, S, set);
      ctx.restore();

      // HUD
      ctx.setTransform(scr.s, 0, 0, scr.s, scr.x, scr.y);
      if (this.hurtFx > 0.02) {
        ctx.fillStyle = U.rgba('#ff2a4a', 0.35 * this.hurtFx);
        ctx.fillRect(0, 0, 1280, 720);
      }
      if (this.phase === 'play' || this.phase === 'done' || this.paused) {
        ctx.save();
        const hz = 1 + c.hud;
        ctx.translate(640, 360);
        ctx.scale(hz, hz);
        ctx.translate(-640, -360);
        this.drawHUD(ctx);
        ctx.restore();
      }
      if (this.flash > 0.02) {
        ctx.fillStyle = U.rgba(this.flashCol, this.flash);
        ctx.fillRect(0, 0, 1280, 720);
      }
      if ((this.phase === 'dialogue' || this.phase === 'outro') && this.dialogue) this.dialogue.draw(ctx);
      if (dead) this.drawDead(ctx);
      if (this.paused) this.drawPause(ctx);
    }

    drawHUD(ctx) {
      const t = this.t;
      const sy = this.strumY();
      const dir = this.down ? -1 : 1;
      const pxs = PX * 1000 * this.speed;
      const hurtKind = this.mech.hurtKind === 'fire' ? 'fire' : 'void';
      // strums
      for (let side = 0; side < 2; side++) {
        const alpha = side === 0 && this.middle ? 0.35 : 1;
        for (let lane = 0; lane < 4; lane++) {
          const st = this.strum[side * 4 + lane];
          const [ox, oy] = this.modOffset(side, lane, t);
          const x = this.laneX(side, lane) + ox, y = sy + oy;
          const kind = st.st === 'confirm' ? 'confirm' : st.st === 'press' ? 'press' : 'static';
          const sc = ARROW * (1 + st.pop * 0.12) * (kind === 'press' ? 0.95 : 1);
          D.blit(ctx, D.arrow(lane, kind), x, y, sc, alpha);
        }
      }
      // notes: holds first, then heads
      const ahead = (this.down ? 720 : 760) / pxs + 0.1;
      const visible = [];
      for (let i = this.renderI; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.t - t > ahead) break;
        if (n.done && !n.len) continue;
        visible.push(n);
      }
      for (const n of visible) {
        if (n.len <= 0 || n.done) continue;
        const [ox, oy] = this.modOffset(n.side, n.lane, t);
        const x = this.laneX(n.side, n.lane) + ox;
        const startT = n.held ? Math.max(t, n.t) : n.t;
        if (n.end <= startT) continue;
        const y0 = sy + oy + (startT - t) * pxs * dir, y1 = sy + oy + (n.end - t) * pxs * dir;
        const alpha = (n.miss || n.dropped ? 0.3 : 0.9) * (n.side === 0 && this.middle ? 0.35 : 1);
        D.hold(ctx, x, y0, y1, n.lane, alpha);
      }
      for (const n of visible) {
        if (n.hit) continue;
        const [ox, oy] = this.modOffset(n.side, n.lane, t);
        let x = this.laneX(n.side, n.lane) + ox;
        const y = sy + oy + (n.t - t) * pxs * dir;
        if (this.mod.amt > 0.01 && this.mod.kind === 'drunk') x += Math.sin((n.t - t) * 7 + n.lane) * 22 * this.mod.amt;
        if (y < -80 || y > 800) continue;
        const alpha = (n.miss ? 0.35 : 1) * (n.side === 0 && this.middle ? 0.35 : 1);
        if (n.type === 1) {
          const wob = hurtKind === 'void' ? (Math.random() - 0.5) * 4 : 0;
          D.blit(ctx, D.arrow(n.lane, hurtKind), x + wob, y, ARROW, alpha);
        } else D.blit(ctx, D.arrow(n.lane, 'note'), x, y, ARROW, alpha);
      }
      // splashes
      for (const s of this.splashes) {
        const [ox, oy] = this.modOffset(1, s.lane, t);
        const x = this.laneX(1, s.lane) + ox, y = sy + oy;
        const k = s.t / 0.35;
        const col = D.LANE_COLORS[s.lane];
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = col;
        ctx.lineWidth = 8 * (1 - k) + 2;
        ctx.beginPath();
        ctx.arc(x, y, 40 + k * 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + s.lane;
          ctx.fillRect(x + Math.cos(a) * (36 + k * 70) - 4, y + Math.sin(a) * (36 + k * 70) - 4, 8, 8);
        }
        ctx.restore();
      }
      // rating popups
      for (const p of this.popups) {
        const a = p.t < 0.4 ? 1 : Math.max(0, 1 - (p.t - 0.4) / 0.35);
        ctx.save();
        ctx.globalAlpha = a;
        if (p.kind === 'combo') {
          for (let i = 0; i < p.txt.length; i++) D.text(ctx, p.txt[i], p.x + i * 38, p.y, { size: 52, fill: '#ffffff', align: 'center', lw: 9 });
        } else if (p.kind === 'ms') {
          D.text(ctx, p.txt, p.x, p.y, { size: 28, fill: p.fill, align: 'left', font: D.HUD, lw: 5 });
        } else {
          const sc = 1 + Math.max(0, 0.25 - p.t * 2);
          D.text(ctx, p.txt, p.x, p.y, { size: p.size * sc, fill: p.fill, align: 'center', lw: 11, shadow: 'rgba(0,0,0,0.35)' });
        }
        ctx.restore();
      }
      this.drawBars(ctx);
      // countdown
      if (this.countShown >= 0 && this.countT < 0.9 && t < 0.6) {
        const txt = ['3', '2', '1', '¡YA!'][this.countShown];
        const k = this.countT / 0.9;
        ctx.save();
        ctx.globalAlpha = 1 - k * k;
        const size = (this.countShown === 3 ? 150 : 170) * (1 + 0.25 * (1 - U.ease.outCubic(Math.min(1, k * 3))));
        D.text(ctx, txt, 640, 410, { size, align: 'center', fill: this.countShown === 3 ? '#ffd23f' : '#ffffff', lw: size * 0.12, shadow: 'rgba(0,0,0,0.4)' });
        ctx.restore();
      }
      // song banner
      const bt = t + 0.5;
      if (bt > 0 && bt < 4) {
        const k = bt < 0.4 ? U.ease.outCubic(bt / 0.4) : bt > 3.4 ? 1 - (bt - 3.4) / 0.6 : 1;
        const x = -420 + 440 * k;
        const y = this.down ? 420 : 180;
        D.rect(ctx, x, y, 420, 76, 14, 'rgba(10,8,22,0.85)', 4, this.W.color);
        D.text(ctx, '♪ ' + this.def.name, x + 20, y + 36, { size: 32, fill: '#ffffff', lw: 6 });
        D.text(ctx, this.opp.def.name + ' • ' + M.DIFFS[this.diff], x + 20, y + 64, { size: 22, fill: this.W.color, lw: 5, font: D.HUD });
      }
      // tutorial key hint + mechanic warnings before the music starts
      if (this.def.week === 0 && t < 9 && !this.botplay) {
        const keys = NF.save.data.keys;
        const txt = NF.input && NF.input.touch ? 'Toca las cuatro columnas de la pantalla para cantar' : 'Teclas: ' + keys.map((k) => NF.keyName(k[0])).join(' ') + '   o   ' + keys.map((k) => NF.keyName(k[1])).join(' ');
        D.text(ctx, txt, 640, this.down ? 520 : 236, { size: 32, align: 'center', fill: '#ffffff', lw: 7 });
      }
      if ((this.mech.hurt || this.mech.drain) && t < 1.5) {
        const warn = [];
        if (this.mech.hurt) warn.push(this.mech.hurtKind === 'fire' ? '¡NO TOQUES LAS FLECHAS DE FUEGO!' : '¡NO TOQUES LAS FLECHAS DE ESTÁTICA!');
        if (this.mech.drain) warn.push('Cada nota del rival te roba vida');
        const a = U.clamp(1.5 - t, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        const wy = this.down ? 200 : 470;
        if (this.mech.hurt) D.blit(ctx, D.arrow(2, this.mech.hurtKind === 'fire' ? 'fire' : 'void'), 640, wy, 0.62);
        warn.forEach((w, i) => D.text(ctx, w, 640, wy + 72 + i * 38, { size: i ? 28 : 36, align: 'center', fill: i ? '#ffffff' : '#ff3d5e', lw: 7 }));
        ctx.restore();
      }
      if (this.botplay) D.text(ctx, 'BOTPLAY', 640, this.down ? 560 : 190, { size: 48, align: 'center', fill: U.rgba('#ffffff', 0.55 + 0.35 * Math.sin(this.realT * 3)), lw: 8 });
      if (this.practice) D.text(ctx, 'MODO PRÁCTICA', 640, this.down ? 600 : 160, { size: 26, align: 'center', fill: '#ffd23f', lw: 5 });
      if (this.rate !== 1) D.text(ctx, 'VELOCIDAD x' + this.rate, 20, this.down ? 30 : 700, { size: 24, fill: '#1fd2ff', lw: 5, font: D.HUD });
    }

    drawBars(ctx) {
      const hbY = this.down ? 74 : 650;
      const w = 600, x0 = 640 - w / 2;
      const oppCol = this.opp.def.color, bfCol = NF.CHARS.nico.color;
      D.rect(ctx, x0 - 6, hbY - 6, w + 12, 32, 10, '#14101f', 0);
      ctx.fillStyle = oppCol;
      ctx.fillRect(x0, hbY, w, 20);
      const split = x0 + w * (1 - this.hp / 2);
      ctx.fillStyle = bfCol;
      ctx.fillRect(split, hbY, x0 + w - split, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x0, hbY + 2, w, 5);
      if (this.mech.drain) {
        const fx = x0 + w * (1 - this.mech.drainFloor / 2);
        ctx.fillStyle = 'rgba(20,16,31,0.7)';
        ctx.fillRect(fx - 2, hbY - 4, 4, 28);
      }
      const ib = 1 + 0.18 * this.iconBop;
      NF.drawIcon(ctx, this.opp.id, split - 46, hbY + 6, 100 * ib, this.hp > 1.6, false, this.realT);
      NF.drawIcon(ctx, 'nico', split + 46, hbY + 6, 100 * ib, this.hp < 0.4, true, this.realT);
      // score line
      const acc = this.judged ? (this.accSum / this.judged) * 100 : 0;
      const accTxt = this.judged ? acc.toFixed(2).replace('.', ',') + '%' : '?';
      const rk = this.judged ? ' [' + M.rank(acc) + '] ' + '(' + M.fcLabel(this.stats) + ')' : '';
      const line = 'Puntos: ' + U.fmtNum(this.score) + '  •  Fallos: ' + this.stats.miss + '  •  Precisión: ' + accTxt + rk;
      D.text(ctx, line, 640, hbY + 62, { size: 27, align: 'center', font: D.HUD, fill: '#ffffff', lw: 5 });
      if (this.combo >= 2) D.text(ctx, 'Combo: ' + this.combo, this.middle ? 1080 : 640, this.down ? hbY + 88 : hbY - 22, { size: 22, align: 'center', font: D.HUD, fill: '#ffd23f', lw: 4 });
      // time bar
      if (this.opt.timeBar) {
        const ty = this.down ? 700 : 20;
        const len = this.data.length;
        const p = U.clamp(this.t / len, 0, 1);
        D.rect(ctx, 440, ty - 10, 400, 22, 8, '#14101f', 0);
        ctx.fillStyle = this.W.color;
        ctx.fillRect(444, ty - 6, 392 * p, 14);
        D.text(ctx, this.def.name + ' (' + U.fmtTime(len - Math.max(0, this.t)) + ')', 640, ty + 8, { size: 24, align: 'center', font: D.HUD, fill: '#ffffff', lw: 5 });
      }
    }

    drawPause(ctx) {
      ctx.fillStyle = 'rgba(8,6,20,0.82)';
      ctx.fillRect(0, 0, 1280, 720);
      D.text(ctx, 'PAUSA', 70, 120, { size: 90, fill: '#ffd23f', lw: 12 });
      D.text(ctx, this.def.name + ' • ' + M.DIFFS[this.diff], 1220, 60, { size: 34, align: 'right', fill: '#ffffff', lw: 6 });
      D.text(ctx, 'Muertes: ' + this.deaths, 1220, 100, { size: 28, align: 'right', fill: '#ff8ccc', lw: 5, font: D.HUD });
      const items = this.pauseItems();
      items.forEach((it, i) => {
        const sel = i === this.pauseSel;
        const y = 270 + (i - this.pauseSel) * 92 + this.pauseSel * 40;
        D.text(ctx, it, 110 + (sel ? 30 : 0), y, { size: sel ? 62 : 52, fill: sel ? '#ffffff' : 'rgba(255,255,255,0.45)', lw: 10 });
      });
    }

    drawDead(ctx) {
      const k = Math.min(1, Math.max(0, (this.deadT - 0.8) / 0.6));
      if (k <= 0) return;
      ctx.save();
      ctx.globalAlpha = k;
      D.text(ctx, 'SIN RITMO...', 640, 150, { size: 96, align: 'center', fill: '#ff3d5e', lw: 12, shadow: 'rgba(0,0,0,0.5)' });
      D.text(ctx, this.retrying ? '¡OTRA VEZ!' : 'ENTER: reintentar   •   ESC: salir', 640, 640, { size: 34, align: 'center', fill: '#ffffff', lw: 6 });
      D.text(ctx, 'Muertes: ' + this.deaths, 640, 690, { size: 26, align: 'center', fill: '#ff8ccc', lw: 5, font: D.HUD });
      ctx.restore();
    }
  }
  NF.PlayState = PlayState;
})();
