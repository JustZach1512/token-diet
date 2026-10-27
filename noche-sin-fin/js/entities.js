// Entidades: supervivientes y asesino, con movimiento, acciones y habilidades.
(function () {
  'use strict';
  const NSF = window.NSF, C = NSF.CONST, U = NSF.U, T = NSF.T;

  class Actor {
    constructor(game, x, y, r) {
      this.g = game; this.x = x; this.y = y; this.r = r;
      this.vx = 0; this.vy = 0; this.face = 0;
      this.ix = 0; this.iy = 0; this.walk = false;
      this.vault = null; this.moving = 0; this.anim = Math.random() * 10;
    }
    solid(x, y) { return this.g.map.solidS(x, y); }

    collide() {
      const r = this.r;
      for (let pass = 0; pass < 2; pass++) {
        const x0 = Math.floor(this.x - r), x1 = Math.floor(this.x + r);
        const y0 = Math.floor(this.y - r), y1 = Math.floor(this.y + r);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (!this.solid(tx, ty)) continue;
            const nx = U.clamp(this.x, tx, tx + 1), ny = U.clamp(this.y, ty, ty + 1);
            const dx = this.x - nx, dy = this.y - ny;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            if (d2 < 1e-9) {
              const l = this.x - tx, rr = tx + 1 - this.x, t = this.y - ty, b = ty + 1 - this.y;
              const m = Math.min(l, rr, t, b);
              if (m === l) this.x = tx - r; else if (m === rr) this.x = tx + 1 + r;
              else if (m === t) this.y = ty - r; else this.y = ty + 1 + r;
            } else {
              const d = Math.sqrt(d2);
              this.x = nx + (dx / d) * r; this.y = ny + (dy / d) * r;
            }
          }
        }
      }
    }

    step(dt, speed, turnRate = 14) {
      if (this.vault) { this.updateVault(dt); return 0; }
      const m = Math.hypot(this.ix, this.iy);
      let dx = 0, dy = 0;
      if (m > 0.01 && speed > 0) {
        dx = this.ix / m; dy = this.iy / m;
        this.face = U.turn(this.face, Math.atan2(dy, dx), turnRate * dt);
      }
      this.vx = dx * speed; this.vy = dy * speed;
      const ox = this.x, oy = this.y;
      const steps = Math.max(1, Math.ceil((speed * dt) / 0.2));
      for (let i = 0; i < steps; i++) {
        this.x += (this.vx * dt) / steps; this.y += (this.vy * dt) / steps;
        this.collide();
      }
      const moved = Math.hypot(this.x - ox, this.y - oy);
      this.moving = moved / Math.max(dt, 1e-4);
      this.anim += dt * (0.5 + this.moving * 1.6);
      return moved;
    }

    startVault(sp, dur) {
      const dir = -sp.side;
      const off = 0.5 + this.r + 0.1;
      let x1 = sp.cx, y1 = sp.cy;
      if (sp.ax === 1) x1 = sp.cx + dir * off; else y1 = sp.cy + dir * off;
      this.vault = { x0: this.x, y0: this.y, x1, y1, t: 0, dur, sp };
      this.face = sp.ax === 1 ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.ix = this.iy = 0;
    }
    updateVault(dt) {
      const v = this.vault;
      v.t += dt;
      const k = Math.min(1, v.t / v.dur);
      this.x = U.lerp(v.x0, v.x1, k); this.y = U.lerp(v.y0, v.y1, k);
      this.moving = 0;
      if (k >= 1) this.vault = null;
    }
  }

  // ======================================================================
  class Survivor extends Actor {
    constructor(game, def, idx, isPlayer, prof) {
      super(game, 0, 0, C.SURV_R);
      this.def = def; this.id = def.id; this.idx = idx; this.isPlayer = isPlayer;
      this.prof = prof;
      this.name = def.name.split(' ')[0];
      this.health = 2; this.status = 'free';
      this.hookCount = 0; this.sac = 0; this.bleed = 0;
      this.healProg = 0; this.reviveProg = 0; this.wiggle = 0;
      this.act = null; this.hook = null;
      this.hitHasteT = 0; this.sprintT = 0; this.snareT = 0; this.stealthT = 0;
      this.revealT = 0; this.stunT = 0; this.protectT = 0; this.boostT = 0; this.hitFlash = 0;
      this.cd = 0; this.cdMax = def.ability.cd;
      this.scratchT = 0; this.bloodT = 0; this.groanT = U.rand(2, 5);
      this.skill = null; this.nextSkill = U.rand(3, 7);
      this.lastHitT = -99; this.unhookT = -99; this.deathT = 0; this.selfTries = 0;
      this.stats = { repair: 0, heals: 0, rescues: 0, revives: 0, stuns: 0, greats: 0, fails: 0, escaped: false };
      this.ai = null;
    }
    get alive() { return this.status !== 'dead' && this.status !== 'escaped'; }
    get free() { return this.status === 'free'; }

    speed() {
      if (this.status === 'downed') return C.SURV_CRAWL;
      if (this.snareT > 0 || this.stunT > 0) return 0;
      let s = this.walk ? C.SURV_WALK : C.SURV_RUN;
      let mul = 1;
      if (this.hitHasteT > 0) mul = Math.max(mul, C.HASTE_MUL);
      if (this.sprintT > 0) mul = Math.max(mul, 1.6);
      return s * mul;
    }

    update(dt) {
      const g = this.g;
      this.hitHasteT -= dt; this.sprintT -= dt; this.snareT -= dt; this.stealthT -= dt;
      this.revealT -= dt; this.stunT -= dt; this.protectT -= dt; this.boostT -= dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
      if (this.cd > 0) this.cd -= dt;
      switch (this.status) {
        case 'hooked': this.updateHooked(dt); return;
        case 'carried': {
          const k = g.killer;
          this.x = k.x; this.y = k.y; this.face = k.face;
          if (this.wiggle >= 1) g.escapeCarry(this);
          return;
        }
        case 'dead': this.deathT += dt; return;
        case 'escaped': return;
        case 'downed': {
          this.bleed += (dt / C.BLEED_TIME) * g.world.bleedMul * (g.collapse !== null ? 2 : 1);
          if (this.bleed >= 1) { g.kill(this, 'bleed'); return; }
          this.walk = false;
          this.step(dt, this.speed(), 5);
          this.bloodT -= dt;
          if (this.bloodT <= 0) { this.bloodT = 0.8; g.addBlood(this.x, this.y, 0.5); }
          return;
        }
      }
      if (this.act) this.updateAct(dt);
      if (this.act) { this.ix = 0; this.iy = 0; }
      this.step(dt, this.act ? 0 : this.speed());

      if (!this.walk && this.moving > 2.6 && !this.vault) {
        this.scratchT -= dt;
        if (this.scratchT <= 0) {
          this.scratchT = 0.24 / (this.def.stats.scratchMul || 1);
          if (this.stealthT <= 0) g.addScratch(this);
        }
      }
      if (this.health === 1) {
        this.bloodT -= dt;
        if (this.bloodT <= 0) { this.bloodT = 0.45; g.addBlood(this.x, this.y, 0.35); }
        this.groanT -= dt;
        if (this.groanT <= 0) { this.groanT = U.rand(3, 6); g.noise(this.x, this.y, 5, 'groan', this); }
      }
      if (g.endgame) {
        for (const gate of g.map.gates) {
          if (gate.open && Math.abs(this.x - gate.cx) < 0.8 && Math.abs(this.y - gate.cy) < 1.1) { g.escape(this); return; }
        }
      }
      g.checkTraps(this);
    }

    updateHooked(dt) {
      const g = this.g;
      this.sac += (dt / (C.HOOK_STAGE * 2)) * g.world.hookMul * (g.collapse !== null ? 2 : 1);
      this.x = this.hook.cx; this.y = this.hook.cy;
      if (this.sac >= 1) g.kill(this, 'hook');
    }

    takeHit(instant) {
      const g = this.g;
      if (this.status !== 'free') return false;
      if (this.vault) { this.x = this.vault.x1; this.y = this.vault.y1; this.vault = null; }
      this.cancelAct();
      this.hitFlash = 1; this.lastHitT = g.time;
      g.addBlood(this.x, this.y, 1.2, true);
      if (this.protectT > 0 && !instant) {
        this.protectT = 0; this.hitHasteT = C.HASTE_T;
        g.fxText(this.x, this.y, 'Protegido', '#e6dfd0');
      } else if (this.health === 2 && !instant) {
        this.health = 1; this.hitHasteT = C.HASTE_T;
      } else {
        this.health = 0; this.status = 'downed'; this.bleed = 0; this.reviveProg = 0; this.healProg = 0;
        this.protectT = 0;
        g.toast(`${this.name} ha caído`, 'bad');
      }
      g.noise(this.x, this.y, 30, 'scream', this);
      g.sfx('scream', this.x, this.y);
      if (this.isPlayer) { U.vibrate([60, 40, 90]); g.shake = 0.5; }
      return true;
    }

    // ---- acciones mantenidas (reparar, curar, levantar, rescatar, abrir)
    startAct(type, target) {
      if (this.act && this.act.type === type && this.act.target === target) return;
      this.cancelAct();
      this.act = { type, target, t: 0 };
      if (type === 'repair' && this.isPlayer) this.nextSkill = Math.min(this.nextSkill, U.rand(1.5, 4));
    }
    cancelAct() { this.act = null; this.skill = null; }

    actValid(a) {
      const g = this.g, t = a.target;
      switch (a.type) {
        case 'repair': return !t.done && !t.blocked && U.dist(this.x, this.y, t.cx, t.cy) <= 1.3;
        case 'heal': return t.status === 'free' && t.health === 1 && U.dist(this.x, this.y, t.x, t.y) <= 1.45;
        case 'revive': return t.status === 'downed' && U.dist(this.x, this.y, t.x, t.y) <= 1.45;
        case 'rescue': return t.status === 'hooked' && U.dist(this.x, this.y, t.hook.cx, t.hook.cy) <= 1.5;
        case 'gate': return g.endgame && !t.open && U.dist(this.x, this.y, t.lever.x, t.lever.y) <= 1.4;
      }
      return false;
    }

    updateAct(dt) {
      const a = this.act, g = this.g;
      if (!this.actValid(a)) { this.cancelAct(); return; }
      const t = a.target;
      const tx = a.type === 'repair' ? t.cx : a.type === 'rescue' ? t.hook.cx : a.type === 'gate' ? t.lever.x : t.x;
      const ty = a.type === 'repair' ? t.cy : a.type === 'rescue' ? t.hook.cy : a.type === 'gate' ? t.lever.y : t.y;
      this.face = U.turn(this.face, Math.atan2(ty - this.y, tx - this.x), dt * 10);
      a.t += dt;
      const hm = this.def.stats.healMul || 1;
      switch (a.type) {
        case 'repair': {
          let rate = (this.def.stats.repairMul || 1) * this.prof.repairMul * (this.boostT > 0 ? 3 : 1);
          if (t.workers > 1) rate *= 0.85;
          const amt = (dt * rate) / C.GEN_WORK;
          this.stats.repair += Math.min(amt, 1 - t.progress);
          g.repairGen(t, amt);
          this.skillTick(dt);
          break;
        }
        case 'heal':
          t.healProg += (dt / C.HEAL_TIME) * hm;
          if (t.healProg >= 1) {
            t.health = 2; t.healProg = 0; this.stats.heals++;
            g.toast(`${this.name} ha curado a ${t.name}`, 'good');
            this.cancelAct();
          } else this.skillTick(dt);
          break;
        case 'revive':
          t.reviveProg += (dt / C.REVIVE_TIME) * hm;
          if (t.reviveProg >= 1) {
            t.status = 'free'; t.health = 1; t.reviveProg = 0; t.bleed = 0; this.stats.revives++;
            g.toast(`${this.name} ha levantado a ${t.name}`, 'good');
            this.cancelAct();
          } else this.skillTick(dt);
          break;
        case 'rescue':
          if (a.t >= C.RESCUE_TIME) { g.rescue(this, t); this.cancelAct(); }
          break;
        case 'gate':
          t.progress += dt / C.GATE_TIME;
          if (t.progress >= 1) { g.openGate(t); this.cancelAct(); }
          break;
      }
    }

    skillTick(dt) {
      if (this.skill) return;
      this.nextSkill -= dt * this.g.world.skillFreq;
      if (this.nextSkill > 0) return;
      this.nextSkill = U.rand(3.5, 9);
      if (this.isPlayer) {
        const w = this.g.world;
        this.skill = {
          t: -0.3, dur: 1.15, start: U.rand(0.38, 0.78),
          len: 0.13 * w.skillZone, great: 0.035 * w.skillZone,
          rev: U.chance(w.reverseSkill),
        };
        this.g.sfx('skillWarn');
      } else {
        const p = this.prof, r = Math.random();
        this.skillResult(r < p.skillGreat ? 'great' : r < p.skillGood ? 'good' : 'fail');
      }
    }

    updateSkill(dt) {
      const s = this.skill;
      if (!s) return;
      if (!this.act) { this.skill = null; return; }
      s.t += dt;
      if (s.t / s.dur > s.start + s.len + 0.06) this.skillResult('fail');
    }

    pressSkill() {
      const s = this.skill;
      if (!s || s.t < 0) return;
      const p = s.t / s.dur;
      if (p >= s.start && p <= s.start + s.great) this.skillResult('great');
      else if (p >= s.start && p <= s.start + s.len) this.skillResult('good');
      else this.skillResult('fail');
    }

    skillResult(res) {
      const a = this.act, g = this.g;
      this.skill = null;
      if (!a) return;
      if (this.isPlayer) g.skillFlash = { res, t: 0.6 };
      if (res === 'great') {
        this.stats.greats++;
        if (a.type === 'repair') g.repairGen(a.target, 0.015);
        else if (a.target.healProg !== undefined) a.target.healProg += 0.02;
        if (this.isPlayer) g.sfx('skillGreat');
      } else if (res === 'good') {
        if (this.isPlayer) g.sfx('skillGood');
      } else {
        this.stats.fails++;
        if (a.type === 'repair') {
          const gen = a.target;
          gen.progress = Math.max(0, gen.progress - 0.08);
          gen.spark = 1;
          g.noise(gen.cx, gen.cy, 45, 'skill', this);
          g.sfx('skillFail', gen.cx, gen.cy);
          g.addSparks(gen.cx, gen.cy);
        } else {
          if (a.type === 'heal') a.target.healProg = Math.max(0, a.target.healProg - 0.1);
          if (a.type === 'revive') a.target.reviveProg = Math.max(0, a.target.reviveProg - 0.1);
          g.noise(this.x, this.y, 30, 'skill', this);
          g.sfx('skillFail', this.x, this.y);
        }
        if (g.kprof && g.kprof.sense > 0) this.revealT = Math.max(this.revealT, 3 * g.kprof.sense);
        if (this.isPlayer) { U.vibrate(120); g.shake = 0.35; }
      }
    }

    // ---- acciones instantáneas
    canVault() {
      if (this.status !== 'free' || this.vault || this.act || this.snareT > 0) return null;
      return this.g.map.nearSpecial(this.x, this.y, [T.WINDOW, T.PALLET_DOWN], 0.45, 1.35, 0.5);
    }
    tryVault() {
      const sp = this.canVault();
      if (!sp) return false;
      const fast = this.moving > 2.4 || !this.isPlayer;
      const dur = (fast ? C.S_VAULT_FAST : C.S_VAULT_SLOW) * (this.def.stats.vaultMul || 1);
      this.startVault(sp, dur);
      if (fast) this.g.noise(this.x, this.y, 12, 'vault', this);
      this.g.sfx('vault', this.x, this.y);
      return true;
    }
    canDrop() {
      if (this.status !== 'free' || this.vault || this.act) return null;
      return this.g.map.nearSpecial(this.x, this.y, [T.PALLET], 0.4, 1.45, 0.65);
    }
    tryDropPallet() {
      const sp = this.canDrop();
      if (!sp) return false;
      this.g.dropPallet(sp, this);
      return true;
    }

    useAbility() {
      const g = this.g;
      if (this.cd > 0 || this.status !== 'free') return false;
      switch (this.def.ability.id) {
        case 'botiquin':
          if (this.health !== 1) return false;
          this.health = 2; this.healProg = 0;
          g.fxText(this.x, this.y, 'Curada', '#e6dfd0');
          break;
        case 'sobrecarga': this.boostT = 8; break;
        case 'sprint': this.sprintT = 3; break;
        case 'sombra': this.stealthT = 5; break;
        case 'destello': g.flash(this); break;
        default: return false;
      }
      this.cd = this.cdMax;
      g.sfx(this.def.ability.id === 'destello' ? 'flash' : 'ability', this.x, this.y);
      return true;
    }
  }

  // ======================================================================
  class Killer extends Actor {
    constructor(game, def, isPlayer, prof) {
      super(game, 0, 0, C.KILLER_R);
      this.def = def; this.isPlayer = isPlayer; this.prof = prof;
      this.name = def.name;
      this.busy = null; this.attack = null;
      this.recoverT = 0; this.recoverMul = 1;
      this.stunT = 0; this.blindT = 0;
      this.carrying = null;
      this.cd = 0;
      this.cdMax = def.ability.cd * (isPlayer || !prof ? 1 : prof.cdMul);
      this.ab = {};
      this.speedMul = isPlayer || !prof ? 1 : prof.speedMul;
      this.swing = 0; this.aim = null;
      this.stats = { hits: 0, downs: 0, hooks: 0, kills: 0, kicks: 0, breaks: 0, stunned: 0 };
    }
    solid(x, y) { return this.g.map.solidK(x, y); }
    get cloaked() { return this.ab.cloak === 'on'; }
    get terror() {
      if (this.ab.cloak === 'on' || this.ab.cloak === 'in') return 0;
      return this.def.terror * this.g.world.terrorMul;
    }
    get dashing() { return this.ab.phase === 'dash'; }
    canAct() {
      return !this.busy && this.stunT <= 0 && !this.vault && !this.attack && !this.ab.phase;
    }

    speed() {
      if (this.stunT > 0 || this.busy) return 0;
      let s = this.def.speed * this.speedMul;
      if (this.attack) s *= C.LUNGE_MUL;
      else if (this.recoverT > 0) s *= this.recoverMul;
      if (this.carrying) s *= 0.88;
      if (this.ab.cloak === 'on') s *= 1.22;
      else if (this.ab.cloak === 'in' || this.ab.cloak === 'out') s *= 0.45;
      if (this.ab.phase === 'wind') s *= this.def.id === 'cazadora' ? 0.4 : 0;
      if (this.blindT > 0) s *= 0.6;
      return s;
    }

    update(dt) {
      this.stunT -= dt; this.blindT -= dt; this.recoverT -= dt;
      this.swing = Math.max(0, this.swing - dt * 3);
      if (this.cd > 0 && !this.ab.cloak) this.cd -= dt;
      if (this.ab.ghostT > 0) this.ab.ghostT -= dt;
      if (this.stunT > 0) {
        this.busy = null; this.attack = null;
        if (this.ab.phase) this.ab.phase = null;
        this.moving = 0;
        return;
      }
      if (this.busy) {
        this.busy.t += dt;
        this.moving = 0;
        if (this.busy.t >= this.busy.dur) { const b = this.busy; this.busy = null; this.finishBusy(b); }
        return;
      }
      if (this.vault) { this.updateVault(dt); return; }
      if (this.updateAbility(dt)) return;
      if (this.attack) {
        this.attack.t += dt;
        const m = Math.hypot(this.ix, this.iy);
        const steer = m > 0.2 ? Math.atan2(this.iy, this.ix) : this.face;
        this.face = U.turn(this.face, steer, dt * 3.5);
        this.ix = Math.cos(this.face); this.iy = Math.sin(this.face);
        if (this.attack.t > 0.1) this.checkHit();
        if (this.attack && this.attack.t >= C.LUNGE_T) {
          this.attack = null;
          this.recoverT = C.MISS_RECOVER; this.recoverMul = 0.6;
        }
      }
      this.step(dt, this.speed(), this.attack ? 3.5 : 12);
    }

    startAttack() {
      if (!this.canAct() || this.carrying || this.ab.cloak || this.recoverT > 0) return false;
      this.attack = { t: 0 };
      this.swing = 1;
      this.g.sfx('swing', this.x, this.y);
      return true;
    }

    checkHit() {
      const g = this.g;
      let best = null, bd = 99;
      const range = C.HIT_RANGE + (this.ab.ghostT > 0 ? 0.6 : 0);
      for (const s of g.survivors) {
        if (s.status !== 'free') continue;
        const d = U.dist(this.x, this.y, s.x, s.y) - s.r;
        if (d > range) continue;
        const a = Math.atan2(s.y - this.y, s.x - this.x);
        if (Math.abs(U.angDiff(this.face, a)) > C.HIT_ANGLE && d > 0.2) continue;
        if (!g.map.los(this.x, this.y, s.x, s.y)) continue;
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) return;
      this.attack = null;
      this.recoverT = C.HIT_RECOVER; this.recoverMul = 0.45;
      this.ab.ghostT = 0;
      if (best.takeHit(false)) {
        this.stats.hits++;
        if (best.status === 'downed') this.stats.downs++;
        g.sfx('hit', best.x, best.y);
        g.onKillerHit(best);
      }
    }

    startBusy(type, dur, data) {
      this.busy = { type, t: 0, dur, data };
      this.ix = this.iy = 0;
    }
    finishBusy(b) {
      const g = this.g;
      switch (b.type) {
        case 'pickup': if (b.data.status === 'downed' && !this.carrying) g.pickup(this, b.data); break;
        case 'hook': if (this.carrying && !b.data.s) g.hookSurvivor(this, this.carrying, b.data); break;
        case 'break': g.breakPallet(b.data, this); break;
        case 'kick': g.kickGen(b.data, this); break;
        case 'trap': g.placeTrap(this); break;
      }
    }

    // ---- contexto
    findDowned() {
      let best = null, bd = 1.35;
      for (const s of this.g.survivors) {
        if (s.status !== 'downed') continue;
        const d = U.dist(this.x, this.y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    }
    findHook() {
      let best = null, bd = 1.5;
      for (const h of this.g.map.hooks) {
        if (h.s) continue;
        const d = U.dist(this.x, this.y, h.cx, h.cy);
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    }
    findGen() {
      let best = null, bd = 1.4;
      for (const gn of this.g.map.gens) {
        if (gn.done || gn.blocked || gn.regress || gn.progress < 0.02) continue;
        const d = U.dist(this.x, this.y, gn.cx, gn.cy);
        if (d < bd) { bd = d; best = gn; }
      }
      return best;
    }
    context() {
      if (!this.canAct() || this.ab.cloak) return null;
      const map = this.g.map;
      if (this.carrying) {
        const h = this.findHook();
        return h ? { id: 'hook', label: 'Colgar', target: h } : null;
      }
      const s = this.findDowned();
      if (s) return { id: 'pickup', label: 'Recoger', target: s };
      const pd = map.nearSpecial(this.x, this.y, [T.PALLET_DOWN], 0.4, 1.5, 0.7);
      if (pd) return { id: 'break', label: 'Romper palé', target: pd };
      const w = map.nearSpecial(this.x, this.y, [T.WINDOW], 0.45, 1.4, 0.5);
      if (w) return { id: 'vault', label: 'Saltar', target: w };
      const gn = this.findGen();
      if (gn) return { id: 'kick', label: 'Patear', target: gn };
      return null;
    }
    doContext(ctx) {
      ctx = ctx || this.context();
      if (!ctx) return false;
      const t = ctx.target;
      switch (ctx.id) {
        case 'hook': this.face = Math.atan2(t.cy - this.y, t.cx - this.x); this.startBusy('hook', C.HOOK_T, t); break;
        case 'pickup': this.face = Math.atan2(t.y - this.y, t.x - this.x); this.startBusy('pickup', C.PICKUP_T, t); break;
        case 'break': this.startBusy('break', C.BREAK_T, t); this.g.sfx('breaking', t.cx, t.cy); break;
        case 'vault': this.startVault(t, C.K_VAULT_T); this.g.sfx('vault', this.x, this.y); break;
        case 'kick': this.face = Math.atan2(t.cy - this.y, t.cx - this.x); this.startBusy('kick', C.KICK_T, t); break;
      }
      return true;
    }
    tryHook() { const h = this.findHook(); return h && this.canAct() ? this.doContext({ id: 'hook', target: h }) : false; }
    tryPickup() { const s = this.findDowned(); return s && this.canAct() && !this.carrying && !this.ab.cloak ? this.doContext({ id: 'pickup', target: s }) : false; }
    tryBreak() {
      const pd = this.g.map.nearSpecial(this.x, this.y, [T.PALLET_DOWN], 0.4, 1.5, 0.7);
      return pd && this.canAct() ? this.doContext({ id: 'break', target: pd }) : false;
    }
    tryVault() {
      if (this.carrying) return false;
      const w = this.g.map.nearSpecial(this.x, this.y, [T.WINDOW], 0.45, 1.4, 0.5);
      return w && this.canAct() ? this.doContext({ id: 'vault', target: w }) : false;
    }
    tryKick() { const gn = this.findGen(); return gn && this.canAct() && !this.ab.cloak ? this.doContext({ id: 'kick', target: gn }) : false; }

    // ---- habilidades
    abilityLabel() {
      const id = this.def.ability.id;
      if (id === 'velo') return this.ab.cloak === 'on' ? 'Revelar' : 'Velo';
      if (id === 'runa' && this.ab.tele && this.g.time - this.ab.tele.t < 5) return 'Ir a runa';
      return this.def.ability.name;
    }
    abilityReady() {
      const id = this.def.ability.id;
      if (id === 'velo' && this.ab.cloak === 'on') return true;
      if (id === 'runa' && this.ab.tele && this.g.time - this.ab.tele.t < 5) return true;
      return this.cd <= 0;
    }

    useAbility() {
      const g = this.g;
      if (this.stunT > 0 || this.busy || this.vault || this.attack) return false;
      switch (this.def.ability.id) {
        case 'embestida':
          if (this.cd > 0 || this.carrying || this.ab.phase) return false;
          this.ab.phase = 'wind'; this.ab.t = 0; this.ab.steer = undefined;
          this.cd = this.cdMax;
          g.sfx('charge', this.x, this.y);
          return true;
        case 'velo':
          if (this.ab.cloak === 'on') { this.ab.cloak = 'out'; this.ab.t = 0; g.sfx('bell', this.x, this.y); return true; }
          if (this.ab.cloak || this.cd > 0 || this.carrying) return false;
          this.ab.cloak = 'in'; this.ab.t = 0;
          g.sfx('bell', this.x, this.y);
          return true;
        case 'hacha':
          if (this.cd > 0 || this.carrying || this.ab.phase) return false;
          this.ab.phase = 'wind'; this.ab.t = 0;
          return true;
        case 'runa': {
          const tp = this.ab.tele;
          if (tp && g.time - tp.t < 5) {
            const spot = g.map.nearestWalkable(tp.x | 0, tp.y | 0, 'k');
            this.ab.tele = null;
            if (!spot) return false;
            g.addPuff(this.x, this.y, '#7fbf6a');
            this.x = spot.x + 0.5; this.y = spot.y + 0.5; this.collide();
            g.addPuff(this.x, this.y, '#7fbf6a');
            g.sfx('teleport', this.x, this.y);
            this.cd = Math.max(this.cd, 3);
            return true;
          }
          if (this.cd > 0 || this.carrying || !this.canAct()) return false;
          this.startBusy('trap', C.TRAP_T);
          this.cd = this.cdMax;
          return true;
        }
      }
      return false;
    }

    // Devuelve true si la habilidad controla el movimiento este fotograma.
    updateAbility(dt) {
      const ab = this.ab, g = this.g;
      switch (this.def.ability.id) {
        case 'embestida':
          if (ab.phase === 'wind') {
            ab.t += dt; this.moving = 0;
            const m = Math.hypot(this.ix, this.iy);
            if (m > 0.3) this.face = U.turn(this.face, Math.atan2(this.iy, this.ix), dt * 6);
            if (ab.t >= 0.55) { ab.phase = 'dash'; ab.t = 0; }
            return true;
          }
          if (ab.phase === 'dash') {
            ab.t += dt;
            const turn = this.isPlayer ? 1.8 : this.prof.dashTurn;
            const m = Math.hypot(this.ix, this.iy);
            const want = ab.steer !== undefined ? ab.steer : m > 0.3 ? Math.atan2(this.iy, this.ix) : this.face;
            this.face = U.turn(this.face, want, turn * dt);
            const sp = 8.6;
            const ox = this.x, oy = this.y;
            const steps = Math.ceil((sp * dt) / 0.15);
            for (let i = 0; i < steps; i++) {
              this.x += (Math.cos(this.face) * sp * dt) / steps;
              this.y += (Math.sin(this.face) * sp * dt) / steps;
              const ax = (this.x + Math.cos(this.face) * (this.r + 0.15)) | 0;
              const ay = (this.y + Math.sin(this.face) * (this.r + 0.15)) | 0;
              if (g.map.get(ax, ay) === T.PALLET_DOWN) g.breakPallet({ x: ax, y: ay, cx: ax + 0.5, cy: ay + 0.5 }, this, true);
              this.collide();
            }
            this.vx = (this.x - ox) / dt; this.vy = (this.y - oy) / dt;
            this.moving = Math.hypot(this.vx, this.vy);
            this.anim += dt * 10;
            if (g.time % 0.06 < dt) g.addDust(this.x, this.y);
            for (const s of g.survivors) {
              if (s.status !== 'free') continue;
              if (U.dist(this.x, this.y, s.x, s.y) < this.r + s.r + 0.2) {
                s.takeHit(true);
                this.stats.hits++; this.stats.downs++;
                g.sfx('hit', s.x, s.y);
                g.onKillerHit(s);
                ab.phase = null; this.recoverT = 1.8; this.recoverMul = 0.4;
                return true;
              }
            }
            const moved = Math.hypot(this.x - ox, this.y - oy);
            if (ab.t > 0.08 && moved < sp * dt * 0.45) {
              ab.phase = null; this.stunT = 1.6; this.stats.stunned++;
              g.sfx('crash', this.x, this.y); g.shakeAt(this.x, this.y, 0.5);
              g.fxText(this.x, this.y, '¡Choque!', '#e6dfd0');
              return true;
            }
            if (ab.t >= 1.3) { ab.phase = null; this.recoverT = 0.9; this.recoverMul = 0.5; }
            return true;
          }
          return false;
        case 'velo':
          if (ab.cloak === 'in') { ab.t += dt; if (ab.t >= 1.0) { ab.cloak = 'on'; ab.t = 0; } }
          else if (ab.cloak === 'on') { ab.t += dt; if (ab.t > 25) { ab.cloak = 'out'; ab.t = 0; } }
          else if (ab.cloak === 'out') {
            ab.t += dt;
            if (ab.t >= 0.8) { ab.cloak = null; ab.ghostT = 2.2; this.cd = this.cdMax; }
          }
          return false;
        case 'hacha':
          if (ab.phase === 'wind') {
            ab.t += dt;
            if (this.aim) this.face = U.turn(this.face, Math.atan2(this.aim.y - this.y, this.aim.x - this.x), dt * 8);
            else {
              const m = Math.hypot(this.ix, this.iy);
              if (m > 0.3) this.face = U.turn(this.face, Math.atan2(this.iy, this.ix), dt * 6);
            }
            this.step(dt, this.speed());
            if (ab.t >= 0.45) {
              ab.phase = null; this.cd = this.cdMax;
              let a = this.face;
              if (this.isPlayer) {
                const t = g.aimAssist(this, 0.45, 15);
                if (t) a = Math.atan2(t.y - this.y, t.x - this.x);
              } else if (this.aim) a = Math.atan2(this.aim.y - this.y, this.aim.x - this.x) + (this.aim.err || 0);
              this.aim = null;
              g.throwAxe(this, a);
            }
            return true;
          }
          return false;
      }
      return false;
    }
  }

  NSF.Survivor = Survivor;
  NSF.Killer = Killer;
})();
