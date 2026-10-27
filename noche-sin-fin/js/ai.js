// Inteligencia artificial de supervivientes y asesino.
// Cada perfil de dificultad (data.js) ajusta reflejos, visión, puntería,
// predicción, rastreo, uso de habilidades y decisiones de equipo.
(function () {
  'use strict';
  const NSF = window.NSF, C = NSF.CONST, U = NSF.U, T = NSF.T;

  // Seguimiento de rutas compartido por todas las IA.
  class Nav {
    constructor(actor, who) {
      this.a = actor; this.who = who;
      this.wps = null; this.goal = null; this.repathT = 0;
      this.stuckT = 0; this.lx = 0; this.ly = 0;
    }
    setGoal(x, y, force) {
      const tx = x | 0, ty = y | 0;
      const same = this.goal && this.goal.tx === tx && this.goal.ty === ty;
      if (same && !force && this.repathT > 0 && this.wps) { this.goal.x = x; this.goal.y = y; return; }
      this.goal = { x, y, tx, ty };
      this.compute();
    }
    compute() {
      const a = this.a, map = a.g.map;
      this.repathT = 0.7;
      const gt = map.nearestWalkable(this.goal.tx, this.goal.ty, this.who);
      if (!gt) { this.wps = null; return; }
      const tiles = map.path(a.x | 0, a.y | 0, gt.x, gt.y, this.who);
      if (!tiles) { this.wps = null; return; }
      this.wps = map.waypoints(a.x, a.y, tiles);
      if (gt.x === this.goal.tx && gt.y === this.goal.ty) {
        const last = this.wps[this.wps.length - 1];
        if (last && !last.sp) { last.x = this.goal.x; last.y = this.goal.y; }
        else if (!last) this.wps.push({ x: this.goal.x, y: this.goal.y, sp: 0 });
      }
    }
    clear() { this.wps = null; this.goal = null; }
    get arrived() { return this.goal && (!this.wps || this.wps.length === 0); }

    // 'none' · 'moving' · 'arrived' · 'special' (hay que saltar o romper)
    follow(dt) {
      const a = this.a, map = a.g.map;
      this.repathT -= dt;
      if (!this.goal) { a.ix = a.iy = 0; return 'none'; }
      if (!this.wps) {
        if (this.repathT <= 0) this.compute();
        a.ix = this.goal.x - a.x; a.iy = this.goal.y - a.y;
        return 'moving';
      }
      if (!this.wps.length) { a.ix = a.iy = 0; return 'arrived'; }
      let wp = this.wps[0];
      if (wp.tx !== undefined) {
        const t = map.get(wp.tx, wp.ty);
        if (wp.sp && t !== wp.sp) wp.sp = map.special(t) ? t : 0;
        else if (!wp.sp && map.special(t)) wp.sp = t;
      }
      if (wp.sp === T.WINDOW || wp.sp === T.PALLET_DOWN) {
        if (this.who === 'k' && wp.sp === T.WINDOW && a.carrying) { this.compute(); return 'moving'; }
        const ax = map.axis[map.idx(wp.tx, wp.ty)];
        const along = ax === 1 ? a.x - wp.x : a.y - wp.y;
        const lat = ax === 1 ? a.y - wp.y : a.x - wp.x;
        const side = Math.sign(along) || 1;
        if (Math.abs(along) < 0.5) { this.wps.shift(); return 'moving'; }
        if (Math.abs(along) <= 1.3 && Math.abs(lat) < 0.3) { a.ix = a.iy = 0; return 'special'; }
        const px = ax === 1 ? wp.x + side * 1.0 : wp.x, py = ax === 1 ? wp.y : wp.y + side * 1.0;
        a.ix = px - a.x; a.iy = py - a.y;
        if (Math.hypot(a.ix, a.iy) < 0.08) { a.ix = -along; a.iy = 0; if (ax === 2) { a.ix = 0; a.iy = -along; } }
        return 'moving';
      }
      const dx = wp.x - a.x, dy = wp.y - a.y;
      const d = Math.hypot(dx, dy);
      const last = this.wps.length === 1;
      if (d < (last ? 0.15 : 0.32)) {
        this.wps.shift();
        if (!this.wps.length) { a.ix = a.iy = 0; return 'arrived'; }
        wp = this.wps[0];
      }
      a.ix = wp.x - a.x; a.iy = wp.y - a.y;
      // atascos
      this.stuckT += dt;
      if (this.stuckT > 0.8) {
        if (Math.hypot(a.x - this.lx, a.y - this.ly) < 0.12 && !a.vault && !a.busy) this.compute();
        this.stuckT = 0; this.lx = a.x; this.ly = a.y;
      }
      return 'moving';
    }
  }

  // Tirada con memoria: evita que la IA cambie de idea en cada fotograma.
  function roll(ai, key, p, ttl) {
    const now = ai.g.time;
    const r = ai.rolls.get(key);
    if (r && now - r.t < ttl) return r.v;
    const v = Math.random() < p;
    ai.rolls.set(key, { v, t: now });
    return v;
  }

  // ======================================================================
  class SurvivorAI {
    constructor(s, prof) {
      this.s = s; this.g = s.g; this.p = prof;
      this.nav = new Nav(s, 's');
      this.task = null; this.kn = null; this.chased = false;
      this.thinkT = U.rand(0, 0.6); this.fleeT = 0; this.dropCD = 0; this.sneakT = 0;
      this.rolls = new Map();
    }

    update(dt) {
      const s = this.s;
      if (s.status === 'carried') {
        s.wiggle += (dt / C.WIGGLE_TIME) * U.rand(0.8, 1.2) * (0.75 + 0.45 * this.p.evade);
        return;
      }
      if (s.status !== 'free' && s.status !== 'downed') return;
      this.dropCD -= dt; this.sneakT -= dt;
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = this.p.reaction * U.rand(0.7, 1.3); this.think(); }
      this.execute(dt);
    }

    perceive() {
      const s = this.s, g = this.g, k = g.killer;
      const d = U.dist(s.x, s.y, k.x, k.y);
      const vr = C.SURV_VISION * (s.def.stats.visionMul || 1);
      const vis = (k.cloaked ? d < 2.5 : d < vr) && g.map.los(s.x, s.y, k.x, k.y);
      const inTR = d < k.terror;
      if (vis) this.kn = { x: k.x, y: k.y, t: g.time, exact: true };
      else if (inTR) this.kn = { x: k.x + U.rand(-1.5, 1.5), y: k.y + U.rand(-1.5, 1.5), t: g.time, exact: false };
      else if (this.kn && g.time - this.kn.t > 6) this.kn = null;
      this.chased = false;
      if (this.kn && g.time - this.kn.t < 1.5) {
        const kai = g.killerAI;
        if (kai) this.chased = kai.target === s && (kai.state === 'chase' || kai.state === 'search') && d < 14;
        else {
          const dx = s.x - k.x, dy = s.y - k.y, l = Math.hypot(dx, dy) || 1, sp = Math.hypot(k.vx, k.vy);
          this.chased = vis && d < 10 && sp > 1.5 && (k.vx * dx + k.vy * dy) / (l * sp) > 0.5;
        }
        if (g.time - s.lastHitT < 6 && d < 12) this.chased = true;
      }
      return { d, vis, inTR };
    }

    think() {
      const s = this.s, g = this.g, p = this.p, k = g.killer;
      const per = this.perceive();
      if (s.status === 'downed') { this.thinkDowned(per); return; }
      const d = per.d;
      const kn = this.kn;
      const danger = kn && ((kn.exact && d < p.fleeDist) || this.chased || (!kn.exact && d < p.fleeDist * 0.5) || g.time - s.lastHitT < 3);
      if (danger) {
        this.defensiveAbility(per);
        if (!this.task || this.task.type !== 'flee' || this.fleeT <= 0 || this.nav.arrived) this.pickFlee();
        return;
      }
      if (this.task && this.task.type === 'flee') { s.cancelAct(); this.task = null; }
      // Sigilo: si el asesino ronda cerca pero no me persigue, me aparto.
      if (kn && d < p.fleeDist * 1.6 && !this.chased && roll(this, 'hide', p.stealth, 6)) {
        if (!this.task || this.task.type !== 'hide' || this.nav.arrived) this.pickHide();
        return;
      }
      if (this.task && this.task.type === 'hide') this.task = null;
      // Trampas de la Bruja a la vista
      for (const tr of g.traps) {
        if (U.dist(s.x, s.y, tr.x, tr.y) < 2.4 && roll(this, tr, p.trapAvoid, 30)) { this.sneakT = 1.4; break; }
      }
      this.utilityAbility(per);
      this.setTask(this.chooseTask(per));
    }

    thinkDowned(per) {
      const s = this.s, g = this.g;
      let tx = s.x, ty = s.y;
      if (this.kn && per.d < 9) {
        const a = Math.atan2(s.y - this.kn.y, s.x - this.kn.x);
        tx = s.x + Math.cos(a) * 4; ty = s.y + Math.sin(a) * 4;
      } else {
        let best = null, bd = 99;
        for (const o of g.survivors) {
          if (o === s || o.status !== 'free') continue;
          const dd = U.dist(s.x, s.y, o.x, o.y);
          if (dd < bd) { bd = dd; best = o; }
        }
        if (best && bd > 1.2) { tx = best.x; ty = best.y; }
      }
      this.task = { type: 'crawl', x: tx, y: ty };
      this.nav.setGoal(tx, ty);
    }

    claimed(map, target) {
      const c = map.get(target);
      if (c && c !== this.s && c.status === 'free' && c.ai && c.ai.task && c.ai.task.target === target) return true;
      const pl = this.g.player;
      if (pl && pl !== this.s && pl.status === 'free' && pl.act && pl.act.target === target) return true;
      return false;
    }

    chooseTask(per) {
      const s = this.s, g = this.g, p = this.p;
      const kn = this.kn;
      const kd = (x, y) => (kn ? U.dist(x, y, kn.x, kn.y) : 99);
      const cl = g.claims;

      // Trampilla (último superviviente)
      if (g.hatch && g.hatch.open) return { type: 'hatch', x: g.hatch.x, y: g.hatch.y };
      // Rescatar del gancho
      for (const o of g.survivors) {
        if (o === s || o.status !== 'hooked') continue;
        if (this.claimed(cl.rescue, o)) continue;
        const urgent = o.sac > 0.42 || (o.hookCount >= 2 && o.sac > 0.7);
        const safe = kd(o.hook.cx, o.hook.cy) > 4 + 6 * p.altruism;
        const nearest = this.nearestFreeTo(o.hook.cx, o.hook.cy) === s;
        if ((safe && roll(this, 'rescue' + o.idx, p.altruism + 0.25, 8)) || (urgent && nearest)) return { type: 'rescue', target: o };
      }
      // Levantar a un caído
      for (const o of g.survivors) {
        if (o === s || o.status !== 'downed') continue;
        if (this.claimed(cl.revive, o)) continue;
        if (kd(o.x, o.y) > 7 && roll(this, 'revive' + o.idx, p.altruism, 8)) return { type: 'revive', target: o };
      }
      // Salvar a quien va cargado (Destello)
      if (s.def.ability.id === 'destello' && s.cd <= 0 && g.killer.carrying && per.d < 12 && roll(this, 'flashsave', p.abilityUse, 6)) {
        return { type: 'flashsave', target: g.killer };
      }
      // Fase final
      if (g.endgame) {
        const open = g.map.gates.find((gt) => gt.open);
        if (open) return { type: 'escape', target: this.nearestGate(true) || open };
        const gate = this.nearestGate(false);
        if (gate) return { type: 'gate', target: gate };
      }
      // Curar a un aliado herido
      if (s.health === 2) {
        for (const o of g.survivors) {
          if (o === s || o.status !== 'free' || o.health !== 1) continue;
          if (this.claimed(cl.heal, o)) continue;
          if (U.dist(s.x, s.y, o.x, o.y) < 14 && kd(o.x, o.y) > 8 && roll(this, 'heal' + o.idx, p.altruism * 0.8, 10)) return { type: 'heal', target: o };
        }
      }
      // Esperar a que me curen
      if (s.health === 1) {
        const healer = cl.heal.get(s);
        if (healer && healer.status === 'free' && healer.ai && healer.ai.task && healer.ai.task.target === s && U.dist(s.x, s.y, healer.x, healer.y) < 10) return { type: 'wait' };
        const pl = g.player;
        if (pl && pl.act && pl.act.target === s) return { type: 'wait' };
      }
      // Reparar
      const gen = this.bestGen();
      if (gen) return { type: 'repair', target: gen };
      return { type: 'wander', x: s.x + U.rand(-5, 5), y: s.y + U.rand(-5, 5) };
    }

    nearestFreeTo(x, y) {
      let best = null, bd = 99;
      for (const o of this.g.survivors) {
        if (o.status !== 'free' || o.isPlayer) continue;
        const d = U.dist(x, y, o.x, o.y);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    }
    nearestGate(openOnly) {
      let best = null, bd = 99;
      for (const gt of this.g.map.gates) {
        if (openOnly && !gt.open) continue;
        let d = U.dist(this.s.x, this.s.y, gt.lever.x, gt.lever.y);
        if (this.kn) d += Math.max(0, 10 - U.dist(gt.lever.x, gt.lever.y, this.kn.x, this.kn.y)) * 2;
        if (d < bd) { bd = d; best = gt; }
      }
      return best;
    }
    bestGen() {
      const s = this.s, g = this.g, p = this.p;
      let best = null, bs = 1e9;
      for (const gen of g.map.gens) {
        if (gen.done || gen.blocked) continue;
        const d = U.dist(s.x, s.y, gen.cx, gen.cy);
        let others = 0;
        for (const o of g.survivors) if (o !== s && o.act && o.act.target === gen) others++;
        for (const o of g.survivors) if (o !== s && o.ai && o.ai.task && o.ai.task.target === gen && !(o.act && o.act.target === gen)) others += 0.5;
        let sc = d - gen.progress * 14 + others * (4 + 10 * p.spread);
        if (others >= 3) sc += 50;
        if (this.kn) sc += Math.max(0, 9 - U.dist(gen.cx, gen.cy, this.kn.x, this.kn.y)) * 3;
        if (this.task && this.task.target === gen) sc -= 6;
        if (sc < bs) { bs = sc; best = gen; }
      }
      return best;
    }

    setTask(t) {
      const s = this.s, cur = this.task, g = this.g;
      if (cur && t && cur.type === t.type && cur.target === t.target && cur.target) return;
      if (cur && cur.target) {
        for (const m of [g.claims.rescue, g.claims.revive, g.claims.heal]) if (m.get(cur.target) === s) m.delete(cur.target);
      }
      if (s.act && (!t || s.act.target !== t.target)) s.cancelAct();
      this.task = t;
      if (!t) return;
      if (t.type === 'rescue') g.claims.rescue.set(t.target, s);
      if (t.type === 'revive') g.claims.revive.set(t.target, s);
      if (t.type === 'heal') g.claims.heal.set(t.target, s);
      if (t.type === 'repair') t.slot = this.genSlot(t.target);
      this.nav.clear();
    }

    genSlot(gen) {
      const g = this.g, map = g.map;
      const slots = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      let best = null, bd = 99;
      for (const [dx, dy] of slots) {
        const x = gen.x + dx, y = gen.y + dy;
        if (!map.plain(map.get(x, y))) continue;
        const cx = x + 0.5, cy = y + 0.5;
        let taken = false;
        for (const o of g.survivors) {
          if (o === this.s || !o.alive) continue;
          if (o.ai && o.ai.task && o.ai.task.slot && o.ai.task.slot.x === cx && o.ai.task.slot.y === cy) taken = true;
          if (U.dist(o.x, o.y, cx, cy) < 0.5) taken = true;
        }
        const d = U.dist(this.s.x, this.s.y, cx, cy) + (taken ? 20 : 0);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
      return best || { x: gen.cx + 1, y: gen.cy };
    }

    pickFlee() {
      const s = this.s, g = this.g, map = g.map, p = this.p;
      const kn = this.kn || { x: g.killer.x, y: g.killer.y };
      const kx = kn.x, ky = kn.y;
      const kdir = Math.atan2(ky - s.y, kx - s.x);
      s.cancelAct();
      const cands = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * U.TAU + U.rand(-0.12, 0.12);
        const r = U.rand(4, 9);
        cands.push({ x: s.x + Math.cos(a) * r, y: s.y + Math.sin(a) * r, bonus: 0 });
      }
      for (const lp of map.loops) {
        const d = U.dist(s.x, s.y, lp.cx, lp.cy);
        if (d > 9 || d < 0.6) continue;
        const t = map.get(lp.x, lp.y);
        if (t !== T.PALLET && t !== T.WINDOW && t !== T.PALLET_DOWN) continue;
        const side = lp.ax === 1 ? Math.sign(lp.cx - kx) || 1 : Math.sign(lp.cy - ky) || 1;
        const ex = lp.ax === 1 ? lp.cx + side * 1.3 : lp.cx;
        const ey = lp.ax === 1 ? lp.cy : lp.cy + side * 1.3;
        cands.push({ x: ex, y: ey, bonus: (t === T.PALLET ? 5.5 : 3.5) * p.evade + 1 });
      }
      let best = null, bs = -1e9;
      for (const c of cands) {
        if (!map.plain(map.get(c.x | 0, c.y | 0))) continue;
        const dk = U.dist(c.x, c.y, kx, ky), ds = U.dist(c.x, c.y, s.x, s.y);
        const toward = Math.abs(U.angDiff(Math.atan2(c.y - s.y, c.x - s.x), kdir));
        let sc = dk * 1.2 - ds * 0.25 + c.bonus;
        if (toward < 1.0 && dk < ds + 3) sc -= 12;
        if (!map.los(kx, ky, c.x, c.y)) sc += 2.5 * p.evade;
        sc += U.rand(0, 7) * (1 - p.evade);
        if (sc > bs) { bs = sc; best = c; }
      }
      if (!best) best = { x: s.x + (s.x - kx), y: s.y + (s.y - ky) };
      this.setTask({ type: 'flee', x: best.x, y: best.y });
      this.nav.setGoal(best.x, best.y, true);
      this.fleeT = U.rand(0.8, 1.6) * (1.3 - p.evade * 0.6);
    }

    pickHide() {
      const s = this.s, g = this.g, map = g.map, kn = this.kn;
      let best = null, bs = -1e9;
      for (let i = 0; i < 14; i++) {
        const a = U.rand(0, U.TAU), r = U.rand(3, 7);
        const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r;
        if (!map.plain(map.get(x | 0, y | 0))) continue;
        let sc = U.dist(x, y, kn.x, kn.y) - r * 0.3;
        if (!map.los(kn.x, kn.y, x, y)) sc += 6;
        if (sc > bs) { bs = sc; best = { x, y }; }
      }
      if (!best) return;
      s.cancelAct();
      this.setTask({ type: 'hide', x: best.x, y: best.y });
      this.nav.setGoal(best.x, best.y, true);
    }

    defensiveAbility(per) {
      const s = this.s, g = this.g, p = this.p, k = g.killer;
      if (s.cd > 0 || s.status !== 'free' || !U.chance(p.abilityUse)) return;
      switch (s.def.ability.id) {
        case 'sprint': if (per.d < 4.5 && this.chased) s.useAbility(); break;
        case 'sombra': if (per.d < 7 && this.chased) s.useAbility(); break;
        case 'destello':
          if (per.vis && per.d < 4 && (this.chased || k.carrying)) { s.face = Math.atan2(k.y - s.y, k.x - s.x); s.useAbility(); }
          break;
        case 'botiquin': if (s.health === 1 && per.d > 5) s.useAbility(); break;
      }
    }
    utilityAbility() {
      const s = this.s, p = this.p;
      if (s.cd > 0 || !U.chance(p.abilityUse)) return;
      const id = s.def.ability.id;
      if (id === 'botiquin' && s.health === 1) s.useAbility();
      else if (id === 'sobrecarga' && s.act && s.act.type === 'repair' && s.act.target.progress < 0.8) s.useAbility();
    }

    taskValid(t) {
      const tg = t.target, g = this.g;
      switch (t.type) {
        case 'repair': return !tg.done && !tg.blocked;
        case 'heal': return tg.status === 'free' && tg.health === 1;
        case 'revive': return tg.status === 'downed';
        case 'rescue': return tg.status === 'hooked' && !!tg.hook;
        case 'gate': return g.endgame && !tg.open;
        case 'escape': return tg.open;
        case 'wait': return this.s.health === 1;
      }
      return true;
    }

    tryPalletDrop() {
      if (this.dropCD > 0 || !this.chased) return false;
      const s = this.s, k = this.g.killer, p = this.p;
      const sp = s.canDrop();
      if (!sp) return false;
      const along = sp.ax === 1 ? k.x - sp.cx : k.y - sp.cy;
      const lat = sp.ax === 1 ? k.y - sp.cy : k.x - sp.cx;
      const ka = Math.abs(along);
      const other = Math.sign(along) === -sp.side || ka < 0.5;
      const hi = 1.05 + (1 - p.palletSkill) * 2.4;
      if (other && ka < hi && Math.abs(lat) < 1.6) {
        this.dropCD = 1.2;
        if (U.chance(0.35 + 0.6 * p.palletSkill)) return s.tryDropPallet();
      }
      return false;
    }

    execute(dt) {
      const s = this.s, g = this.g, t = this.task;
      s.walk = false;
      if (!t) { s.ix = s.iy = 0; return; }
      if (s.status === 'downed') { this.nav.follow(dt); return; }
      if (t.type === 'flee') { this.fleeT -= dt; if (this.tryPalletDrop()) return; }
      if (s.act) {
        if (s.act.target === t.target) { s.ix = s.iy = 0; return; }
        s.cancelAct();
      }
      if (!this.taskValid(t)) { this.setTask(null); this.thinkT = 0; s.ix = s.iy = 0; return; }
      if (t.type === 'wait') { s.ix = s.iy = 0; return; }
      let gx, gy, range = 0, act = null;
      switch (t.type) {
        case 'repair': gx = t.slot.x; gy = t.slot.y; range = 0.25; act = 'repair'; break;
        case 'heal': gx = t.target.x; gy = t.target.y; range = 1.05; act = 'heal'; break;
        case 'revive': gx = t.target.x; gy = t.target.y; range = 1.05; act = 'revive'; break;
        case 'rescue': gx = t.target.hook.cx; gy = t.target.hook.cy + 0.9; range = 0.35; act = 'rescue'; break;
        case 'gate': gx = t.target.lever.x; gy = t.target.lever.y; range = 0.6; act = 'gate'; break;
        case 'escape': gx = t.target.cx; gy = t.target.cy; break;
        case 'hatch':
          if (!g.hatch || !g.hatch.open) { this.task = null; return; }
          if (U.dist(s.x, s.y, g.hatch.x, g.hatch.y) < 0.8) { g.escape(s, 'hatch'); return; }
          gx = g.hatch.x; gy = g.hatch.y; break;
        case 'flashsave': {
          const k = g.killer;
          if (!k.carrying || s.cd > 0) { this.task = null; return; }
          gx = k.x; gy = k.y;
          const d = U.dist(s.x, s.y, k.x, k.y);
          if (d < 3.6 && g.map.los(s.x, s.y, k.x, k.y)) {
            s.face = Math.atan2(k.y - s.y, k.x - s.x);
            s.useAbility(); this.task = null; return;
          }
          break;
        }
        default: gx = t.x; gy = t.y;
      }
      if (act && U.dist(s.x, s.y, gx, gy) <= range) {
        s.ix = s.iy = 0; this.nav.clear();
        s.startAct(act, t.target);
        if (!s.actValid(s.act)) { s.cancelAct(); s.ix = gx - s.x; s.iy = gy - s.y; }
        return;
      }
      if (act && (act === 'heal' || act === 'revive' || act === 'rescue')) {
        const tgtX = act === 'rescue' ? t.target.hook.cx : t.target.x, tgtY = act === 'rescue' ? t.target.hook.cy : t.target.y;
        if (U.dist(s.x, s.y, tgtX, tgtY) <= 1.15) { s.ix = s.iy = 0; s.startAct(act, t.target); if (s.act && s.actValid(s.act)) return; s.cancelAct(); }
      }
      this.nav.setGoal(gx, gy);
      const r = this.nav.follow(dt);
      if (r === 'special') s.tryVault();
      else if (r === 'arrived' && (t.type === 'flee' || t.type === 'hide' || t.type === 'wander')) this.thinkT = Math.min(this.thinkT, 0.05);
      if (t.type === 'hide' || this.sneakT > 0) s.walk = true;
    }
  }

  // ======================================================================
  class KillerAI {
    constructor(k, prof) {
      this.k = k; this.g = k.g; this.p = prof;
      this.nav = new Nav(k, 'k');
      this.state = 'patrol'; this.target = null; this.last = null;
      this.thinkT = 0.5; this.attackWait = 0; this.respectT = 0; this.holdT = 0;
      this.heardT = 0; this.campT = 0; this.campHook = null;
      this.lastUnhooked = null; this.patrol = null; this.patrolUntil = 0;
      this.searchPt = null; this.invPt = null; this.invT = 0; this.tracking = false;
      this.pauseT = 0; this.rolls = new Map();
    }

    visible(s) {
      const k = this.k, g = this.g, p = this.p;
      if (!s.alive || s.status === 'carried' || s.status === 'hooked') return false;
      if (s.stealthT > 0) return false;
      if (s.revealT > 0) return true;
      if (k.blindT > 0) return false;
      const d = U.dist(k.x, k.y, s.x, s.y);
      let range = p.sight;
      if (s.walk && s.status === 'free') range *= 0.75;
      if (d > range) return false;
      if (d > 2.5 && p.fov < Math.PI) {
        const a = Math.atan2(s.y - k.y, s.x - k.x);
        if (Math.abs(U.angDiff(k.face, a)) > p.fov) return false;
      }
      return g.map.los(k.x, k.y, s.x, s.y);
    }

    update(dt) {
      const k = this.k;
      this.thinkT -= dt; this.respectT -= dt; this.campT -= dt; this.pauseT -= dt;
      if (this.thinkT <= 0) { this.thinkT = this.p.reaction * U.rand(0.6, 1.2); this.think(); }
      if (k.stunT > 0 || k.busy || k.vault) { k.ix = k.iy = 0; return; }
      if (k.ab.phase === 'dash') {
        const t = this.target;
        if (t && t.status === 'free' && this.visible(t)) k.ab.steer = Math.atan2(t.y + t.vy * 0.2 - k.y, t.x + t.vx * 0.2 - k.x);
        return;
      }
      if (k.ab.phase === 'wind') {
        const t = this.target;
        if (k.def.ability.id === 'hacha' && t && t.status === 'free') {
          const d = U.dist(k.x, k.y, t.x, t.y);
          const lead = (0.35 + this.p.predict * 1.3) * (d / 14 + 0.45 - k.ab.t);
          k.aim = { x: t.x + t.vx * lead, y: t.y + t.vy * lead, err: Math.atan2(U.rand(-1, 1) * this.p.aimError * 0.9, Math.max(1, d)) };
        } else if (k.def.ability.id === 'embestida' && t) {
          k.ix = t.x - k.x; k.iy = t.y - k.y;
        }
        return;
      }
      this.execute(dt);
    }

    think() {
      const k = this.k, g = this.g, p = this.p;
      if (k.carrying) { this.state = 'carry'; this.target = null; return; }
      let best = null, bs = 1e9;
      let downed = null, dd = 1e9;
      for (const s of g.survivors) {
        if (!this.visible(s)) continue;
        const d = U.dist(k.x, k.y, s.x, s.y);
        if (s.status === 'downed') { if (d < dd) { dd = d; downed = s; } continue; }
        if (s.status !== 'free') continue;
        let sc = d;
        if (s.health === 1) sc -= 2.5;
        if (s === this.target) sc -= 3.5;
        if (p.tunnel && s === this.lastUnhooked && g.time - s.unhookT < 40) sc -= 6 * p.tunnel;
        if (s.protectT > 0) sc += 3 * (1 - p.tunnel);
        if (sc < bs) { bs = sc; best = s; }
      }
      if (downed && (!best || dd < 7 || U.dist(k.x, k.y, best.x, best.y) > 4)) {
        this.state = 'pickup'; this.target = downed; return;
      }
      if (best) {
        this.state = 'chase'; this.target = best;
        this.last = { x: best.x, y: best.y, t: g.time, vx: best.vx, vy: best.vy };
        this.ability(best);
        return;
      }
      if (this.state === 'chase' && this.target) {
        this.state = 'search';
        this.tracking = U.chance(p.trackChance);
      }
      if (this.state === 'search') {
        const tg = this.target;
        if (!tg || tg.status !== 'free' || g.time - this.last.t > p.chaseMemory) { this.state = 'patrol'; this.target = null; }
        else {
          const sc = this.tracking ? g.trackScratch(tg, k, p.sight * 1.1, p.trackDelay * 0.35) : null;
          if (sc) {
            this.searchPt = { x: sc.x, y: sc.y };
            this.last.t = Math.max(this.last.t, sc.t - p.trackDelay);
          }
          else {
            const el = Math.min(2, g.time - this.last.t);
            this.searchPt = { x: this.last.x + this.last.vx * el * 0.6, y: this.last.y + this.last.vy * el * 0.6 };
          }
          return;
        }
      }
      const nz = g.heardNoise(k, p.hearing, this.heardT);
      if (nz) {
        this.heardT = nz.t;
        this.state = 'investigate'; this.invPt = { x: nz.x, y: nz.y }; this.invT = g.time;
        return;
      }
      if (this.state === 'investigate' && g.time - this.invT < 12 && this.invPt && U.dist(k.x, k.y, this.invPt.x, this.invPt.y) > 1.6) return;
      if (this.state !== 'patrol' || !this.patrol || g.time > this.patrolUntil) this.pickPatrol();
      this.state = 'patrol';
      this.ability(null);
    }

    pickPatrol() {
      const k = this.k, g = this.g, p = this.p, map = g.map;
      const opts = [];
      if (g.hatch && g.hatch.open && U.chance(0.25 + p.genSense * 0.6)) {
        opts.push({ x: g.hatch.x, y: g.hatch.y, w: 1, hatch: true });
      } else if (this.campT > 0 && this.campHook && this.campHook.s) {
        for (let i = 0; i < 6; i++) {
          const a = U.rand(0, U.TAU), r = U.rand(3, 7);
          opts.push({ x: this.campHook.cx + Math.cos(a) * r, y: this.campHook.cy + Math.sin(a) * r, w: 1 });
        }
      } else if (g.endgame) {
        for (const gt of map.gates) opts.push({ x: gt.lever.x, y: gt.lever.y + 1, w: 1 + gt.progress * 6 * p.genSense, gate: gt });
        if (g.collapse === null) opts.push({ x: U.rand(4, map.W - 4), y: U.rand(4, map.H - 4), w: 0.5 });
      } else {
        for (const gen of map.gens) {
          if (gen.done || gen.blocked) continue;
          const d = U.dist(k.x, k.y, gen.cx, gen.cy);
          let w = 1 + p.genSense * (gen.progress * 4 + (gen.workers > 0 ? 7 : 0));
          w /= 1 + d / 18;
          if (this.patrol && this.patrol.gen === gen) w *= 0.15;
          opts.push({ x: gen.cx, y: gen.cy + 1, w, gen });
        }
      }
      if (!opts.length) opts.push({ x: U.rand(3, map.W - 3), y: U.rand(3, map.H - 3), w: 1 });
      let tot = opts.reduce((a, o) => a + o.w, 0), r = Math.random() * tot;
      let pick = opts[0];
      for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
      if (pick.gen) {
        const slot = map.nearestWalkable(pick.gen.x, pick.gen.y + 1, 'k') || map.nearestWalkable(pick.gen.x + 1, pick.gen.y, 'k');
        if (slot) { pick.x = slot.x + 0.5; pick.y = slot.y + 0.5; }
      }
      this.patrol = pick;
      this.patrolUntil = g.time + 22;
    }

    nearestHook() {
      const k = this.k;
      let best = null, bd = 1e9;
      for (const h of this.g.map.hooks) {
        if (h.s) continue;
        const d = U.dist(k.x, k.y, h.cx, h.cy);
        if (d < bd) { bd = d; best = h; }
      }
      return best;
    }

    ability(tgt) {
      const k = this.k, g = this.g, p = this.p;
      const id = k.def.ability.id;
      if (k.carrying) return;
      const d = tgt ? U.dist(k.x, k.y, tgt.x, tgt.y) : 99;
      switch (id) {
        case 'embestida':
          if (tgt && k.cd <= 0 && k.canAct() && d > 3.2 && d < 9 && g.map.walkLine(k.x, k.y, tgt.x, tgt.y, 0.4) && U.chance(p.abilityUse)) {
            k.face = Math.atan2(tgt.y - k.y, tgt.x - k.x);
            k.useAbility();
          }
          break;
        case 'hacha':
          if (tgt && k.cd <= 0 && k.canAct() && d > 2.4 && d < 11 && U.chance(p.abilityUse)) k.useAbility();
          break;
        case 'velo':
          if (!tgt && !k.ab.cloak && k.cd <= 0 && U.chance(p.abilityUse)) k.useAbility();
          else if (tgt && k.ab.cloak === 'on' && d < 3.6) k.useAbility();
          break;
        case 'runa': {
          const tp = k.ab.tele;
          if (tp && g.time - tp.t < 5 && U.dist(k.x, k.y, tp.x, tp.y) > 6 && U.chance(0.4 + p.abilityUse * 0.6)) { k.useAbility(); this.state = 'investigate'; this.invPt = { x: tp.x, y: tp.y }; this.invT = g.time; return; }
          if (!tgt && k.cd <= 0 && k.canAct() && g.traps.length < 4) {
            const near = g.map.gens.some((gn) => !gn.done && gn.progress > 0.15 && U.dist(k.x, k.y, gn.cx, gn.cy) < 3) ||
              g.map.hooks.some((h) => h.s && U.dist(k.x, k.y, h.cx, h.cy) < 4) ||
              g.map.loops.some((lp) => U.dist(k.x, k.y, lp.cx, lp.cy) < 2);
            if (near && U.chance(p.abilityUse)) k.useAbility();
          }
          break;
        }
      }
    }

    onHooked(s) {
      this.campT = this.p.camp * U.rand(10, 18);
      this.campHook = s.hook;
      this.patrol = null;
      this.state = 'patrol';
    }
    onUnhooked(s) {
      this.lastUnhooked = s;
      if (this.p.tunnel > 0.5 && U.dist(this.k.x, this.k.y, s.x, s.y) < 16) {
        this.state = 'investigate'; this.invPt = { x: s.x, y: s.y }; this.invT = this.g.time;
      }
    }

    moveTo(x, y, dt) {
      const k = this.k;
      this.nav.setGoal(x, y);
      const r = this.nav.follow(dt);
      if (r === 'special') {
        const wp = this.nav.wps && this.nav.wps[0];
        if (wp && wp.sp === T.WINDOW) { if (!k.tryVault()) this.nav.compute(); }
        else if (wp && wp.sp === T.PALLET_DOWN) { if (!k.tryBreak()) this.nav.compute(); }
      }
      return r;
    }

    execute(dt) {
      const k = this.k, g = this.g, p = this.p, map = g.map;
      switch (this.state) {
        case 'carry': {
          if (!k.carrying) { this.state = 'patrol'; return; }
          const h = this.nearestHook();
          if (!h) { k.ix = k.iy = 0; return; }
          if (U.dist(k.x, k.y, h.cx, h.cy) < 1.3) { k.ix = k.iy = 0; k.tryHook(); return; }
          this.moveTo(h.cx, h.cy + 0.9, dt);
          return;
        }
        case 'pickup': {
          const s = this.target;
          if (!s || s.status !== 'downed') { this.state = 'patrol'; this.target = null; return; }
          if (U.dist(k.x, k.y, s.x, s.y) < 1.15) { k.ix = k.iy = 0; k.tryPickup(); return; }
          this.moveTo(s.x, s.y, dt);
          return;
        }
        case 'chase': {
          const s = this.target;
          if (!s || s.status !== 'free') { this.state = 'patrol'; this.target = null; return; }
          const d = U.dist(k.x, k.y, s.x, s.y);
          const seen = this.visible(s);
          const lead = p.predict * Math.min(1, d / 4);
          const px = s.x + s.vx * lead, py = s.y + s.vy * lead;
          // Respeto de palé: espera fuera del alcance para que lo tiren pronto.
          if (this.holdT > 0) { this.holdT -= dt; k.ix = k.iy = 0; k.face = Math.atan2(py - k.y, px - k.x); return; }
          if (p.palletRespect > 0 && this.respectT <= 0 && seen) {
            const sp = map.nearSpecial(s.x, s.y, [T.PALLET], 0.4, 1.6, 0.8);
            if (sp) {
              const ka = sp.ax === 1 ? k.x - sp.cx : k.y - sp.cy;
              if (Math.sign(ka) === -sp.side && Math.abs(ka) < 2.8 && Math.abs(ka) > 1.3) {
                this.respectT = 1.4;
                if (U.chance(p.palletRespect)) { this.holdT = U.rand(0.35, 0.7); return; }
              }
            }
          }
          if (seen && !k.ab.cloak && k.recoverT <= 0 && !k.attack && d < C.HIT_RANGE + 1.15) {
            this.attackWait += dt;
            if (this.attackWait >= p.reaction * 0.45) {
              this.attackWait = 0;
              const aimX = s.x + s.vx * 0.18, aimY = s.y + s.vy * 0.18;
              k.face = Math.atan2(aimY - k.y, aimX - k.x) + U.rand(-1, 1) * p.aimError;
              k.ix = Math.cos(k.face); k.iy = Math.sin(k.face);
              k.startAttack();
              return;
            }
          } else this.attackWait = 0;
          if (seen && d < 5 && map.walkLine(k.x, k.y, px, py, 0.4)) {
            this.nav.clear();
            k.ix = px - k.x; k.iy = py - k.y;
          } else this.moveTo(px, py, dt);
          return;
        }
        case 'search': {
          const sp = this.searchPt;
          if (!sp) { this.state = 'patrol'; return; }
          const r = this.moveTo(sp.x, sp.y, dt);
          if (r === 'arrived') this.thinkT = Math.min(this.thinkT, 0.1);
          return;
        }
        case 'investigate': {
          const ip = this.invPt;
          if (!ip) { this.state = 'patrol'; return; }
          const r = this.moveTo(ip.x, ip.y, dt);
          if (r === 'arrived' || U.dist(k.x, k.y, ip.x, ip.y) < 1.2) { this.invPt = null; this.state = 'patrol'; this.patrol = null; }
          return;
        }
        default: {
          if (!this.patrol) this.pickPatrol();
          const pt = this.patrol;
          if (this.pauseT > 0) { k.ix = k.iy = 0; return; }
          const r = this.moveTo(pt.x, pt.y, dt);
          if (r === 'arrived' || U.dist(k.x, k.y, pt.x, pt.y) < 0.6) {
            if (pt.gen && !pt.kicked && U.chance(p.kick) && k.tryKick()) { pt.kicked = true; return; }
            if (pt.hatch && g.hatch && g.hatch.open && U.dist(k.x, k.y, g.hatch.x, g.hatch.y) < 1.4) { g.closeHatch(k); this.patrol = null; return; }
            this.ability(null);
            this.pauseT = U.rand(0.3, 1.2);
            this.patrol = null;
          }
        }
      }
    }
  }

  NSF.Nav = Nav;
  NSF.SurvivorAI = SurvivorAI;
  NSF.KillerAI = KillerAI;
})();
