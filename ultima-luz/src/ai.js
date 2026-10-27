// Bots. KillerAI hunts (patrol, chase, scratch-mark tracking, pallets,
// powers); SurvivorAI repairs, loops pallets, rescues, heals and escapes.
import { dist, yawTo, angleDiff, clamp } from './util.js';
import { HOOK_STAGE_TIME } from './config.js';

const rnd = Math.random;

class Nav {
  constructor(game, actor, useExtra) {
    this.g = game;
    this.a = actor;
    this.useExtra = useExtra;
    this.path = null;
    this.i = 0;
    this.goal = null;
    this.t = 0;
    this.stuckT = 0;
    this.stuck = 0;
    this.lx = 0; this.lz = 0;
  }

  clear() { this.path = null; this.goal = null; }

  // Unit direction towards (x,z) following the grid path, or null on arrival.
  steer(dt, x, z, arrive = 0.6) {
    const a = this.a.pos, ph = this.g.physics;
    const d = Math.hypot(x - a.x, z - a.z);
    if (d < arrive) { this.path = null; return null; }
    this.t -= dt;
    const moved = !this.goal || Math.hypot(this.goal.x - x, this.goal.z - z) > 1.4;
    if (moved || this.t <= 0 || !this.path) {
      if (d < 45 && ph.lineWalkable(a.x, a.z, x, z, this.useExtra)) {
        this.path = [{ x, z }];
        this.t = 0.35;
      } else {
        this.path = ph.findPath(a.x, a.z, x, z, this.useExtra);
        this.t = 0.9 + rnd() * 0.5;
      }
      this.i = 0;
      this.goal = { x, z };
    } else if (this.path.length) {
      const last = this.path[this.path.length - 1];
      if (Math.hypot(last.x - x, last.z - z) < 1.5) { last.x = x; last.z = z; }
    }
    const P = this.path;
    if (!P || !P.length) return null;
    while (this.i < P.length - 1 && Math.hypot(P[this.i].x - a.x, P[this.i].z - a.z) < 0.8) this.i++;
    if (this.i < P.length - 1 && ph.lineWalkable(a.x, a.z, P[this.i + 1].x, P[this.i + 1].z, this.useExtra) && rnd() < 0.2) this.i++;
    const wp = P[this.i];
    let dx = wp.x - a.x, dz = wp.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 0.05) return null;
    dx /= L; dz /= L;
    this.stuckT += dt;
    if (this.stuckT > 0.7) {
      const mv = Math.hypot(a.x - this.lx, a.z - this.lz);
      this.stuck = mv < 0.3 ? this.stuck + 1 : 0;
      if (this.stuck) this.t = 0;
      this.lx = a.x; this.lz = a.z; this.stuckT = 0;
    }
    if (this.stuck >= 2) {
      const s = this.stuck % 2 ? 1 : -1;
      const nx = dx + -dz * s * 0.9, nz = dz + dx * s * 0.9;
      const n = Math.hypot(nx, nz);
      return { x: nx / n, z: nz / n };
    }
    return { x: dx, z: dz };
  }
}

// ------------------------------------------------------------------- killer
export class KillerAI {
  constructor(game, k, P) {
    this.g = game;
    this.k = k;
    this.P = P;
    this.nav = new Nav(game, k, false);
    this.mem = new Map();
    this.state = 'patrol';
    this.target = null;
    this.thinkT = 0;
    this.lookT = 0;
    this.holdT = 0;
    this.searchT = 0;
    this.patrolGoal = null;
    this.visited = new Map();
    this.noiseEv = null;
    this.senseT = P.nightSense ? P.nightSense * 0.6 : 0;
    this.respected = new Set();
    this.hookT = null;
  }

  memOf(s) {
    let m = this.mem.get(s);
    if (!m) { m = { since: -1, lastT: -99, x: 0, z: 0, vis: false, known: false }; this.mem.set(s, m); }
    return m;
  }

  onNoise(x, z, kind, loud) {
    const k = this.k;
    if (k.carrying || dist(k.pos.x, k.pos.z, x, z) > loud) return;
    if (this.state === 'chase' && this.memOf(this.target).vis) return;
    this.noiseEv = { x, z, t: this.g.time, kind };
  }

  get chasing() { return this.state === 'chase' && this.target && this.memOf(this.target).vis; }

  perceive() {
    const g = this.g, k = this.k, P = this.P, now = g.time;
    for (const s of g.survivors) {
      const m = this.memOf(s);
      m.vis = false;
      if (!(s.state === 'standing' || s.state === 'downed' || s.state === 'trapped')) { m.known = false; m.since = -1; continue; }
      const vis = g.killerCanSee(k, s, P);
      const heard = !vis && g.killerCanHear(k, s, P);
      if (vis || heard) {
        if (m.since < 0) m.since = now;
        if (now - m.since >= P.reaction || (m.known && now - m.lastT < 1.5)) {
          m.known = true; m.vis = vis; m.lastT = now; m.x = s.pos.x; m.z = s.pos.z;
        }
      } else {
        m.since = -1;
        if (now - m.lastT > P.memory) m.known = false;
      }
    }
  }

  decide() {
    const g = this.g, k = this.k, now = g.time;
    if (k.carrying) { this.state = 'carry'; return; }
    let downed = null, dd = 1e9;
    for (const s of g.survivors) {
      if (s.state !== 'downed') continue;
      const d = dist(k.pos.x, k.pos.z, s.pos.x, s.pos.z);
      if (this.memOf(s).known || d < 9) if (d < dd) { dd = d; downed = s; }
    }
    let tgt = null;
    if (this.target && this.target.hittable && this.memOf(this.target).known) tgt = this.target;
    let best = null, bd = 1e9;
    for (const s of g.survivors) {
      if (!s.hittable || !this.memOf(s).known) continue;
      let d = dist(k.pos.x, k.pos.z, s.pos.x, s.pos.z);
      if (this.P.predict > 0.5 && s.injured) d *= 0.7;
      if (d < bd) { bd = d; best = s; }
    }
    if (!tgt || (best && best !== tgt && bd < dist(k.pos.x, k.pos.z, tgt.pos.x, tgt.pos.z) * 0.5)) tgt = best;
    if (downed && (!tgt || dd < 8 || dist(k.pos.x, k.pos.z, tgt.pos.x, tgt.pos.z) > 7)) {
      this.state = 'pickup'; this.target = downed; return;
    }
    if (tgt) {
      if (this.state !== 'chase' || this.target !== tgt) { this.nav.clear(); this.respected.clear(); }
      this.state = 'chase'; this.target = tgt; return;
    }
    if (this.state === 'chase' || this.state === 'pickup') { this.state = 'search'; this.searchT = 2.2 + rnd(); this.nav.clear(); }
    if (this.state === 'search' && this.searchT > 0) return;
    if (this.noiseEv && now - this.noiseEv.t < 14) { if (this.state !== 'investigate') this.nav.clear(); this.state = 'investigate'; return; }
    if (this.state !== 'patrol') { this.state = 'patrol'; this.patrolGoal = null; }
  }

  update(dt) {
    const k = this.k, g = this.g, I = k.intent, P = this.P;
    I.mx = 0; I.mz = 0; I.face = null; I.attack = false; I.ability = false; I.cancel = false;
    if (P.nightSense) {
      this.senseT -= dt;
      if (this.senseT <= 0) {
        this.senseT = P.nightSense * (0.8 + rnd() * 0.4);
        const alive = g.survivors.filter((s) => s.standing);
        const pick = alive.find((s) => s.isPlayer) || alive[Math.floor(rnd() * alive.length)];
        if (pick && !k.carrying) {
          const m = this.memOf(pick);
          m.known = true; m.lastT = g.time; m.x = pick.pos.x; m.z = pick.pos.z; m.since = g.time - 5;
          g.onNightSense(pick);
        }
      }
    }
    if (k.stun > 0 || k.task) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.12; this.perceive(); this.decide(); }
    if (k.charge > 0) {
      if (this.target) I.face = yawTo(k.pos.x, k.pos.z, this.target.pos.x, this.target.pos.z);
      return;
    }
    if (this.lookT > 0) {
      this.lookT -= dt;
      I.face = k.yaw + 1.4;
      if (this.state === 'patrol' || this.state === 'investigate') return;
    }
    switch (this.state) {
      case 'carry': return this._carry(dt);
      case 'pickup': return this._pickup(dt);
      case 'chase': return this._chase(dt);
      case 'search': return this._search(dt);
      case 'investigate': return this._investigate(dt);
      default: return this._patrol(dt);
    }
  }

  _go(dt, x, z, arrive) {
    const d = this.nav.steer(dt, x, z, arrive);
    if (d) { this.k.intent.mx = d.x; this.k.intent.mz = d.z; }
    return d;
  }

  _carry(dt) {
    const g = this.g, k = this.k;
    let h = this.hookT;
    if (!h || h.victim) {
      let bd = 1e9;
      h = null;
      for (const hk of g.world.hooks) {
        if (hk.victim) continue;
        const d = dist(k.pos.x, k.pos.z, hk.x, hk.z);
        if (d < bd) { bd = d; h = hk; }
      }
      this.hookT = h;
      this.nav.clear();
    }
    if (!h) { g.startTask(k, 'drop'); return; }
    if (dist(k.pos.x, k.pos.z, h.x, h.z) < 1.8) { this.hookT = null; g.startTask(k, 'hook', h); return; }
    this._go(dt, h.point.x, h.point.z, 0.4);
  }

  _pickup(dt) {
    const s = this.target, k = this.k;
    if (!s || s.state !== 'downed') { this.state = 'patrol'; return; }
    if (dist(k.pos.x, k.pos.z, s.pos.x, s.pos.z) < 1.5) { this.g.startTask(this.k, 'pickup', s); return; }
    this._go(dt, s.pos.x, s.pos.z, 0.9);
  }

  _chase(dt) {
    const g = this.g, k = this.k, P = this.P, I = k.intent;
    const s = this.target, m = this.memOf(s);
    const d = dist(k.pos.x, k.pos.z, s.pos.x, s.pos.z);
    let ax, az;
    if (m.vis) {
      const lead = P.predict * clamp(d / 4.6, 0, 1) * 0.85;
      ax = s.pos.x + s.vel.x * lead; az = s.pos.z + s.vel.z * lead;
      if (!g.physics.walkable(ax, az)) { ax = s.pos.x; az = s.pos.z; }
    } else {
      const mk = g.newestMark(s, m.lastT - 1.2, k.pos.x, k.pos.z, P.track);
      if (mk) { m.x = mk.x; m.z = mk.z; m.lastT = Math.max(m.lastT, mk.t); }
      ax = m.x; az = m.z;
      if (dist(k.pos.x, k.pos.z, ax, az) < 1.3 && !mk) { this.state = 'search'; this.searchT = 2.4; return; }
    }
    if (this.holdT > 0) { this.holdT -= dt; I.face = yawTo(k.pos.x, k.pos.z, s.pos.x, s.pos.z); return; }

    const pal = g.blockingPallet(k.pos.x, k.pos.z, s.pos.x, s.pos.z);
    if (pal) {
      const pd = dist(k.pos.x, k.pos.z, pal.x, pal.z);
      if (k.def.ability.id === 'charge' && k.cd <= 0 && pd < 7 && pd > 2.5 && rnd() < P.abilitySkill) {
        k.intent.face = yawTo(k.pos.x, k.pos.z, pal.x, pal.z);
        k.yaw = k.intent.face;
        g.useAbility(k);
        return;
      }
      if (pd < 2.4 && d < 12) { g.startTask(k, 'break', pal); return; }
    }
    for (const p of g.world.pallets) {
      if (p.state !== 'up' || this.respected.has(p)) continue;
      if (dist(s.pos.x, s.pos.z, p.x, p.z) < 2.6 && dist(k.pos.x, k.pos.z, p.x, p.z) < 4.6) {
        this.respected.add(p);
        if (rnd() < P.palletRespect) { this.holdT = 0.45 + rnd() * 0.5; return; }
      }
    }
    this._chaseAbility(d, m, s);
    if (k.charge > 0) return;
    // a survivor circling a dropped pallet: after some patience, go break it
    let lp = null;
    for (const p of g.world.pallets) {
      if (p.state === 'down' && dist(s.pos.x, s.pos.z, p.x, p.z) < 7) { lp = p; break; }
    }
    if (lp && lp === this.loopP) this.loopT += dt; else { this.loopP = lp; this.loopT = 0; }
    const patience = 9 - P.abilitySkill * 6;
    let breaking = false;
    if (lp && this.loopT > patience && d > 2.6) {
      const c = g.palletCenter(lp);
      if (dist(k.pos.x, k.pos.z, c.x, c.z) < 2.4) { this.loopT = 0; g.startTask(k, 'break', lp); return; }
      const side = Math.sign((k.pos.x - c.x) * lp.n.x + (k.pos.z - c.z) * lp.n.z) || 1;
      this._go(dt, c.x + lp.n.x * side * 1.3, c.z + lp.n.z * side * 1.3, 0.4);
      breaking = true;
    }
    if (!breaking) this._go(dt, ax, az, 0.25);
    if (m.vis && d < 7) I.face = yawTo(k.pos.x, k.pos.z, ax, az);
    if (m.vis && s.hittable && !k.attack && !k.cloaked) {
      const ang = Math.abs(angleDiff(k.yaw, yawTo(k.pos.x, k.pos.z, s.pos.x, s.pos.z)));
      if (d < P.lungeDist + (rnd() - 0.5) * 0.35 && ang < 0.5) g.killerAttack(k);
    }
  }

  _chaseAbility(d, m, s) {
    const g = this.g, k = this.k, P = this.P;
    const id = k.def.ability.id;
    if (id === 'charge') {
      if (k.cd > 0 || !m.vis || d < 4.5 || d > 13 || rnd() > P.abilitySkill * 0.3) return;
      const yaw = yawTo(k.pos.x, k.pos.z, s.pos.x, s.pos.z);
      const px = -Math.cos(yaw) * 0.45, pz = Math.sin(yaw) * 0.45;
      const ph = g.physics;
      if (ph.raycast(k.pos.x, k.pos.z, s.pos.x, s.pos.z, 0.6) <= 1) return;
      if (ph.raycast(k.pos.x + px, k.pos.z + pz, s.pos.x + px, s.pos.z + pz, 0.6) <= 1) return;
      if (ph.raycast(k.pos.x - px, k.pos.z - pz, s.pos.x - px, s.pos.z - pz, 0.6) <= 1) return;
      k.yaw = yaw; k.intent.face = yaw;
      g.useAbility(k);
    } else if (id === 'cloak') {
      if (k.cloak > 0 && d < 6.5) g.useAbility(k);
      else if (!k.cloaked && k.cd <= 0 && d > 15 && rnd() < P.abilitySkill * 0.2) g.useAbility(k);
    } else if (id === 'trap') {
      if (k.cd <= 0 && g.traps.length < 4 && rnd() < P.abilitySkill * 0.05) {
        for (const p of g.world.pallets) {
          if (p.state !== 'broken' && dist(k.pos.x, k.pos.z, p.x, p.z) < 3.2) { g.useAbility(k); return; }
        }
      }
    }
  }

  _search(dt) {
    const k = this.k;
    this.searchT -= dt;
    k.intent.face = k.yaw + 1.6;
    if (this.target) {
      const m = this.memOf(this.target);
      const vx = this.target.vel.x, vz = this.target.vel.z;
      if (this.searchT > 1.2 && rnd() < this.P.predict) this._go(dt, m.x + vx * 0.4, m.z + vz * 0.4, 1);
    }
    if (this.searchT <= 0) { this.state = 'patrol'; this.patrolGoal = null; this.target = null; }
  }

  _investigate(dt) {
    const n = this.noiseEv;
    if (!n) { this.state = 'patrol'; return; }
    const d = this._go(dt, n.x, n.z, 2.2);
    if (!d) {
      this.noiseEv = null;
      this.lookT = 1.3;
      const gen = this.g.world.gens.find((g) => dist(g.x, g.z, n.x, n.z) < 3);
      if (gen) this._maybeKick(gen);
    }
  }

  _maybeKick(gen) {
    const k = this.k, P = this.P;
    if (gen.done || gen.regress || gen.progress < 0.25 || rnd() > P.kickGens) return false;
    if (this.g.genDist(gen, k.pos.x, k.pos.z) < 1.3) return this.g.startTask(k, 'kick', gen);
    this.kickGen = gen;
    return false;
  }

  _patrol(dt) {
    const g = this.g, k = this.k, P = this.P;
    if (this.kickGen) {
      const gen = this.kickGen;
      if (gen.done || gen.regress) { this.kickGen = null; }
      else {
        const sp = gen.spots.filter((s) => s.ok).sort((a, b) => dist(a.x, a.z, k.pos.x, k.pos.z) - dist(b.x, b.z, k.pos.x, k.pos.z))[0];
        if (!sp || !this._go(dt, sp.x, sp.z, 0.5)) {
          this.kickGen = null;
          if (g.genDist(gen, k.pos.x, k.pos.z) < 1.4) g.startTask(k, 'kick', gen);
        }
        return;
      }
    }
    if (!this.patrolGoal) this._pickPatrol();
    const G = this.patrolGoal;
    if (!G) return;
    const far = dist(k.pos.x, k.pos.z, G.x, G.z);
    if (k.def.ability.id === 'cloak' && !k.cloaked && k.cd <= 0 && far > 20 && rnd() < P.abilitySkill * 0.02) g.useAbility(k);
    const d = this._go(dt, G.x, G.z, G.gen ? 3 : 1.5);
    if (!d) {
      this.patrolGoal = null;
      this.lookT = 0.8 + rnd() * 1.2;
      if (G.gen) {
        this.visited.set(G.gen, g.time);
        if (k.def.ability.id === 'trap' && k.cd <= 0 && g.traps.length < 4 && rnd() < 0.3 + P.abilitySkill * 0.5) g.useAbility(k);
        else this._maybeKick(G.gen);
      }
    }
  }

  _pickPatrol() {
    const g = this.g, k = this.k, P = this.P;
    const hooked = g.survivors.find((s) => s.state === 'hooked');
    if (hooked && rnd() < P.hookProxy) {
      const a = rnd() * Math.PI * 2, r = 9 + rnd() * 8;
      const p = g.physics.nearestWalkable(hooked.hook.x + Math.cos(a) * r, hooked.hook.z + Math.sin(a) * r);
      this.patrolGoal = { x: p.x, z: p.z };
      return;
    }
    let best = null, bs = -1;
    for (const gen of g.world.gens) {
      if (gen.done) continue;
      const d = dist(k.pos.x, k.pos.z, gen.x, gen.z);
      const last = this.visited.get(gen) ?? -99;
      let s = (1 + gen.progress * (1 + P.kickGens * 3)) / (1 + d / 28) * (0.6 + rnd() * 0.8);
      if (g.time - last < 30) s *= 0.15;
      if (s > bs) { bs = s; best = gen; }
    }
    if (best) this.patrolGoal = { x: best.x, z: best.z, gen: best };
    else {
      const p = g.physics.nearestWalkable((rnd() - 0.5) * 80, (rnd() - 0.5) * 80);
      this.patrolGoal = { x: p.x, z: p.z };
    }
  }
}

// ------------------------------------------------------------------- survivor
export class SurvivorAI {
  constructor(game, s, P) {
    this.g = game;
    this.s = s;
    this.P = P;
    this.nav = new Nav(game, s, true);
    this.mode = 'task';
    this.plan = null;
    this.thinkT = rnd() * 0.3;
    this.replanT = 0;
    this.loop = null;
    this.loopT = 0;
    this.banned = new Set();
    this.fleePt = null;
    this.fleeT = 0;
    this.jukeT = 0;
    this.jukeX = 0; this.jukeZ = 0;
    this.hideT = 0;
    this.hidePt = null;
    this.rolls = new Map();
    this.chasedAt = -99;
    this.useLoops = rnd() < P.palletUse;
  }

  update(dt) {
    const s = this.s, I = s.intent;
    I.mx = 0; I.mz = 0; I.face = null; I.act = null; I.cancel = false; I.ability = false; I.wiggle = false;
    if (s.state === 'carried' || s.state === 'trapped') { I.wiggle = true; return; }
    if (s.state === 'downed') return this._downed(dt);
    if (s.state !== 'standing' || s.vault) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.2 + rnd() * 0.1; this._think(); }
    if (this.mode === 'flee') this._flee(dt);
    else if (this.mode === 'hide') this._hide(dt);
    else this._task(dt);
  }

  _dist(o) { return dist(this.s.pos.x, this.s.pos.z, o.x ?? o.pos.x, o.z ?? o.pos.z); }

  _threat() {
    const g = this.g, s = this.s, k = g.killer, P = this.P;
    const kd = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
    const cloakHidden = k.cloak > 0 && kd > 4 + P.awareness * 0.06;
    const visible = !cloakHidden && kd < P.awareness * 1.5 && g.physics.los(s.pos.x, s.pos.z, k.pos.x, k.pos.z, 1.6);
    const terror = !k.cloaked && kd < k.terror;
    let chased = false;
    if (k.ai) chased = k.ai.state === 'chase' && k.ai.target === s && (visible || kd < 12);
    else if (visible && kd < 16) {
      const dx = s.pos.x - k.pos.x, dz = s.pos.z - k.pos.z;
      chased = (k.vel.x * dx + k.vel.z * dz) / Math.max(kd, 0.01) > 1.2;
    }
    if (visible && kd < 6.5) chased = true;
    if (k.carrying && kd > 3) chased = false;
    return { kd, visible, terror, chased };
  }

  _think() {
    const g = this.g, s = this.s, P = this.P, k = g.killer;
    const T = this._threat();
    this.T = T;
    if (T.chased) {
      if (this.mode !== 'flee') { this.loop = null; this.fleePt = null; this.loopT = 0; this.useLoops = rnd() < P.palletUse; }
      this.mode = 'flee';
      this.chasedAt = g.time;
      if (s.task && s.task.type !== 'drop' && s.task.type !== 'vault') s.intent.cancel = true;
      this._fleeAbility(T);
      return;
    }
    if (this.mode === 'flee') {
      if (T.kd > 20 || (!T.visible && g.time - this.chasedAt > 2.5)) { this.mode = 'task'; this.plan = null; }
      else return;
    }
    if (this.mode === 'hide') {
      if (this.hideT <= 0 || (!T.visible && T.kd > P.awareness)) { this.mode = 'task'; this.plan = null; }
      else return;
    }
    if (T.visible && T.kd < P.awareness * 0.8 && !k.carrying && rnd() < P.stealth) {
      const dx = s.pos.x - k.pos.x, dz = s.pos.z - k.pos.z;
      const approaching = (k.vel.x * dx + k.vel.z * dz) / Math.max(T.kd, 0.01) > 0.8;
      if (approaching || T.kd < 11) {
        if (s.task) s.intent.cancel = true;
        this._release();
        this.mode = 'hide'; this.hideT = 3 + rnd() * 2; this.hidePt = null;
        return;
      }
    }
    // Lucía's medkit when it matters
    if (s.def.ability.id === 'medkit' && s.cd <= 0 && T.kd > 10 && rnd() < P.abilitySkill) {
      const downedNear = g.survivors.some((o) => o !== s && o.state === 'downed' && this._dist(o) < 3);
      if (s.injured || downedNear) { g.useAbility(s); return; }
    }
    if (s.def.ability.id === 'flare' && s.cd <= 0 && k.carrying && T.kd < 8.5 && T.visible && rnd() < P.abilitySkill) {
      s.yaw = yawTo(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
      g.useAbility(s, s.yaw);
      return;
    }
    this.replanT -= 0.25;
    if (!this.plan || !this._planValid(this.plan) || (this.replanT <= 0 && !s.task)) {
      this.replanT = 2;
      const np = this._choosePlan(T);
      if (!this.plan || !np || np.type !== this.plan.type || np.target !== this.plan.target) {
        if (s.task) s.intent.cancel = true;
        this._release();
        this.plan = np;
        if (np && np.claim) g.claims.set(np.target, s);
        this.nav.clear();
      }
    }
    // abandon repairs when the killer comes close
    if (s.task && s.task.type === 'repair' && T.terror && T.kd < 9 + P.awareness * 0.25 && T.visible) {
      s.intent.cancel = true;
      this.mode = 'hide'; this.hideT = 2.5; this.hidePt = null;
    }
  }

  _release() {
    const g = this.g;
    for (const [t, who] of g.claims) if (who === this.s) g.claims.delete(t);
  }

  _planValid(p) {
    const t = p.target;
    switch (p.type) {
      case 'repair': return !t.done;
      case 'rescue': return t.state === 'hooked';
      case 'recover': return t.state === 'downed';
      case 'heal': return t.injured;
      case 'free': return t.state === 'trapped';
      case 'gate': return t.powered && !t.open;
      case 'escape': return t.open;
      default: return false;
    }
  }

  _roll(key, p) {
    let r = this.rolls.get(key);
    if (r === undefined) { r = rnd() < p; this.rolls.set(key, r); }
    return r;
  }

  _choosePlan(T) {
    const g = this.g, s = this.s, P = this.P, k = g.killer;
    const W = g.world;
    const others = g.survivors.filter((o) => o !== s);
    const claimedByOther = (t) => { const c = g.claims.get(t); return c && c !== s && c.standing; };
    const open = W.gates.find((gt) => gt.open);
    const hooked = others.filter((o) => o.state === 'hooked' && !claimedByOther(o));
    let rescue = null, rd = 1e9;
    for (const h of hooked) {
      const kh = dist(k.pos.x, k.pos.z, h.hook.x, h.hook.z);
      const stage = h.hookProgress < 1 ? 0 : 1;
      const left = HOOK_STAGE_TIME[stage] * ((stage + 1) - h.hookProgress);
      const urgent = left < 14;
      if (!(kh > P.rescueSafe || urgent)) continue;
      if (!this._roll(`${h.name}-${h.hookedAt}`, P.altruism)) continue;
      const d = this._dist(h.hook);
      if (d < rd) { rd = d; rescue = h; }
    }
    if (open) {
      if (rescue && g.collapse > 45) return { type: 'rescue', target: rescue, claim: true };
      return { type: 'escape', target: open };
    }
    if (rescue) return { type: 'rescue', target: rescue, claim: true };
    const trapped = others.find((o) => o.state === 'trapped' && this._dist(o) < 25 && !claimedByOther(o));
    if (trapped) return { type: 'free', target: trapped, claim: true };
    const downed = others.filter((o) => o.state === 'downed' && !claimedByOther(o) && dist(k.pos.x, k.pos.z, o.pos.x, o.pos.z) > 12);
    if (downed.length && this._roll(`d-${downed[0].name}-${Math.floor(g.time / 20)}`, P.altruism)) {
      downed.sort((a, b) => this._dist(a) - this._dist(b));
      if (this._dist(downed[0]) < 40) return { type: 'recover', target: downed[0], claim: true };
    }
    const powered = W.gates.filter((gt) => gt.powered && !gt.open);
    if (powered.length) {
      powered.sort((a, b) => this._dist(a.lever) - this._dist(b.lever));
      const free = powered.find((gt) => !claimedByOther(gt)) || powered[0];
      return { type: 'gate', target: free, claim: true };
    }
    if (s.health === 2 && T.kd > 18) {
      const inj = others.find((o) => o.injured && !claimedByOther(o) && this._dist(o) < 18 && !(o.task && o.task.type === 'heal'));
      if (inj && this._roll(`h-${inj.name}-${Math.floor(g.time / 25)}`, P.altruism * 0.6)) return { type: 'heal', target: inj, claim: true };
    }
    let best = null, bs = 1e9;
    for (const gen of W.gens) {
      if (gen.done) continue;
      let sc = this._dist(gen);
      if (T.terror && dist(k.pos.x, k.pos.z, gen.x, gen.z) < 16) sc += 60;
      const n = [...gen.workers].filter((w) => w !== s).length;
      if (n >= 2) sc += 18;
      sc -= gen.progress * 22;
      if (this.plan && this.plan.target === gen) sc -= 10;
      if (gen.spots.every((sp) => !sp.ok || (sp.taken && sp.taken !== s))) sc += 100;
      if (sc < bs) { bs = sc; best = gen; }
    }
    return best ? { type: 'repair', target: best } : null;
  }

  _go(dt, x, z, arrive = 0.5, run = true) {
    const I = this.s.intent;
    I.run = run;
    const d = this.nav.steer(dt, x, z, arrive);
    if (d) { I.mx = d.x; I.mz = d.z; }
    return d;
  }

  _task(dt) {
    const g = this.g, s = this.s, p = this.plan, I = s.intent;
    I.crouch = false;
    if (!p) return;
    if (!this._planValid(p)) { this.plan = null; this._release(); return; }
    const t = p.target;
    if (s.task) return;
    switch (p.type) {
      case 'repair': {
        let spot = t.spots.find((sp) => sp.taken === s);
        if (!spot) {
          const free = t.spots.filter((sp) => sp.ok && !sp.taken).sort((a, b) => this._dist(a) - this._dist(b));
          spot = free[0];
          if (!spot) { this.plan = null; return; }
        }
        if (!this._go(dt, spot.x, spot.z, 0.45) || g.genDist(t, s.pos.x, s.pos.z) < 0.8) g.startTask(s, 'repair', t);
        return;
      }
      case 'rescue':
        if (!this._go(dt, t.hook.point.x, t.hook.point.z, 1.2)) g.startTask(s, 'unhook', t);
        return;
      case 'recover':
        if (!this._go(dt, t.pos.x, t.pos.z, 1.0)) g.startTask(s, 'recover', t);
        return;
      case 'heal':
        if (!this._go(dt, t.pos.x, t.pos.z, 1.0)) g.startTask(s, 'heal', t);
        return;
      case 'free':
        if (!this._go(dt, t.pos.x, t.pos.z, 0.9)) g.startTask(s, 'free', t);
        return;
      case 'gate':
        if (!this._go(dt, t.lever.x, t.lever.z, 0.5)) g.startTask(s, 'gate', t);
        return;
      case 'escape': {
        const ix = t.x, iz = t.z + t.inward * 2.2;
        if (Math.abs(s.pos.z) > g.world.half - 3 && Math.abs(s.pos.x - t.x) < 2) {
          I.mx = (t.x - s.pos.x) * 0.5; I.mz = -t.inward; I.run = true;
          return;
        }
        this._go(dt, ix, iz, 0.8);
        return;
      }
      default:
    }
  }

  _side(p, x, z) {
    const cx = p.x - p.n.x * p.off, cz = p.z - p.n.z * p.off;
    const v = (x - cx) * p.n.x + (z - cz) * p.n.z;
    return Math.abs(v) < 0.15 ? 0 : Math.sign(v);
  }

  _pickLoop(k) {
    const g = this.g, s = this.s;
    let best = null, bd = 1e9;
    for (const p of g.world.pallets) {
      if (p.state === 'broken' || this.banned.has(p)) continue;
      const ds = this._dist(p), dk = dist(k.pos.x, k.pos.z, p.x, p.z);
      if (ds > 24 || ds + 2.5 > dk) continue;
      const ax = p.x - s.pos.x, az = p.z - s.pos.z, bx = k.pos.x - s.pos.x, bz = k.pos.z - s.pos.z;
      const cos = (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) + 1e-6);
      if (cos > 0.45 && ds > 3) continue;
      if (ds < bd) { bd = ds; best = p; }
    }
    return best;
  }

  _fleeAbility(T) {
    const g = this.g, s = this.s, P = this.P, k = g.killer;
    if (s.cd > 0 || rnd() > P.abilitySkill) return;
    const id = s.def.ability.id;
    if (id === 'sprint' && T.kd < 6) g.useAbility(s);
    else if (id === 'shadow' && T.kd < 10) g.useAbility(s);
    else if (id === 'flare' && T.kd < 4.5 && T.visible && rnd() < 0.5) {
      const yaw = yawTo(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
      s.yaw = yaw;
      g.useAbility(s, yaw);
    } else if (id === 'medkit' && s.injured && T.kd > 7) g.useAbility(s);
  }

  _flee(dt) {
    const g = this.g, s = this.s, P = this.P, k = g.killer, I = s.intent;
    I.run = true; I.crouch = false;
    if (s.task) return;
    const kd = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
    if (this.jukeT > 0) { this.jukeT -= dt; I.mx = this.jukeX; I.mz = this.jukeZ; return; }
    if (k.attack && k.attack.phase === 'lunge' && kd < 3.4 && rnd() < P.juke * dt * 10) {
      const dx = s.pos.x - k.pos.x, dz = s.pos.z - k.pos.z, side = rnd() < 0.5 ? 1 : -1;
      this.jukeX = (-dz * side + dx * 0.4) / kd; this.jukeZ = (dx * side + dz * 0.4) / kd;
      this.jukeT = 0.3;
      return;
    }
    const dropDist = 1.3 + (1 - P.dropTiming) * 3.4;
    // opportunistic drop when passing any pallet with the killer right behind
    for (const p of g.world.pallets) {
      if (p.state !== 'up' || this._dist(p) > 1.6) continue;
      const ks = this._side(p, k.pos.x, k.pos.z), ms = this._side(p, s.pos.x, s.pos.z);
      if (ks !== 0 && ks !== ms && dist(k.pos.x, k.pos.z, p.x, p.z) < dropDist + 0.6) { g.startTask(s, 'drop', p); return; }
      if (ks !== 0 && ms === 0 && dist(k.pos.x, k.pos.z, p.x, p.z) < dropDist) { g.startTask(s, 'drop', p); return; }
    }
    this.loopT += dt;
    if (this.useLoops && (!this.loop || this.loop.state === 'broken')) {
      this.loop = this._pickLoop(k);
      this.loopT = 0;
    }
    if (this.loop && this.loopT > 30) { this.banned.add(this.loop); this.loop = null; }
    const p = this.loop;
    if (p) {
      const ks = this._side(p, k.pos.x, k.pos.z), ms = this._side(p, s.pos.x, s.pos.z);
      const cx = p.x - p.n.x * p.off, cz = p.z - p.n.z * p.off;
      if (p.state === 'up') {
        const dkp = dist(k.pos.x, k.pos.z, p.x, p.z);
        if (this._dist(p) < 1.7 && (dkp < dropDist || kd < 3.3) && ks !== ms) { g.startTask(s, 'drop', p); return; }
        if (dkp + 0.5 < this._dist(p) && ks !== 0 && ks === ms) { this.banned.add(p); this.loop = null; return; }
        const side = ks === 0 ? -(ms || 1) : -ks;
        const ready = ms === side && this._dist(p) < 3.2;
        const tx = ready ? p.x + p.n.x * side * 0.6 : p.x + p.n.x * side * 1.6;
        const tz = ready ? p.z + p.n.z * side * 0.6 : p.z + p.n.z * side * 1.6;
        this._go(dt, tx, tz, 0.3);
        if (ready && kd > 7) { I.mx *= 0.2; I.mz *= 0.2; }
        return;
      }
      if (p.state === 'down') {
        if (k.task && k.task.type === 'break' && k.task.target === p) { this.banned.add(p); this.loop = null; this.fleePt = null; }
        else if (ks === ms && ks !== 0) {
          if (this._dist({ x: cx, z: cz }) < 1.9 && kd < 7) { g.startTask(s, 'vault', p); return; }
          const tx = cx + p.n.x * ms * 1.1, tz = cz + p.n.z * ms * 1.1;
          if (dist(k.pos.x, k.pos.z, tx, tz) + 0.5 < dist(s.pos.x, s.pos.z, tx, tz)) { this.banned.add(p); this.loop = null; }
          else { this._go(dt, tx, tz, 0.3); return; }
        } else {
          const kt = (k.pos.x - cx) * p.t.x + (k.pos.z - cz) * p.t.z;
          const side = ks || -ms || 1;
          const off = clamp(-kt * 0.5, -2.4, 2.4);
          const tx = cx - p.n.x * side * 2.0 + p.t.x * off, tz = cz - p.n.z * side * 2.0 + p.t.z * off;
          if (!this._go(dt, tx, tz, 0.4)) I.face = yawTo(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
          return;
        }
      }
    }
    // open field
    this.fleeT -= dt;
    if (!this.fleePt || this.fleeT <= 0 || this._dist(this.fleePt) < 1.5) {
      this.fleeT = 0.8;
      this.fleePt = this._fleePoint(k);
    }
    if (this.fleePt) this._go(dt, this.fleePt.x, this.fleePt.z, 0.8);
  }

  _fleePoint(k) {
    const g = this.g, s = this.s, ph = g.physics, H = g.world.half;
    let best = null, bs = -1e9;
    const base = Math.atan2(s.pos.x - k.pos.x, s.pos.z - k.pos.z);
    for (let i = 0; i < 14; i++) {
      const a = base + (i / 14 - 0.5) * Math.PI * 1.6;
      const r = 8 + rnd() * 5;
      const x = s.pos.x + Math.sin(a) * r, z = s.pos.z + Math.cos(a) * r;
      if (!ph.walkable(x, z, true)) continue;
      let sc = dist(x, z, k.pos.x, k.pos.z) - Math.abs(angleDiff(base, a)) * 3 + rnd() * 2;
      if (!ph.los(k.pos.x, k.pos.z, x, z, 1.6)) sc += 6;
      if (Math.abs(x) > H - 7 || Math.abs(z) > H - 7) sc -= 10;
      if (!ph.lineWalkable(s.pos.x, s.pos.z, x, z, true)) sc -= 4;
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    return best;
  }

  _hide(dt) {
    const g = this.g, s = this.s, k = g.killer, I = s.intent, ph = g.physics;
    this.hideT -= dt;
    const kd = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
    if (!this.hidePt || this._dist(this.hidePt) < 1) {
      let best = null, bs = -1e9;
      for (let i = 0; i < 10; i++) {
        const a = rnd() * Math.PI * 2, r = 6 + rnd() * 8;
        const x = s.pos.x + Math.sin(a) * r, z = s.pos.z + Math.cos(a) * r;
        if (!ph.walkable(x, z, true)) continue;
        let sc = dist(x, z, k.pos.x, k.pos.z) * 0.6;
        if (!ph.los(k.pos.x, k.pos.z, x, z, 1.6)) sc += 8;
        if (g.inBush(x, z)) sc += 5;
        if (sc > bs) { bs = sc; best = { x, z }; }
      }
      this.hidePt = best || { x: s.pos.x, z: s.pos.z };
    }
    const crouch = kd < 13;
    I.crouch = crouch;
    if (!this._go(dt, this.hidePt.x, this.hidePt.z, 0.6, kd > 13)) I.face = yawTo(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
  }

  _downed(dt) {
    const g = this.g, s = this.s, k = g.killer;
    const kd = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
    this.thinkT -= dt;
    if (this.thinkT <= 0 || !this.crawlPt) {
      this.thinkT = 1.2;
      if (kd < 14) {
        const a = Math.atan2(s.pos.x - k.pos.x, s.pos.z - k.pos.z) + (rnd() - 0.5);
        this.crawlPt = g.physics.nearestWalkable(s.pos.x + Math.sin(a) * 6, s.pos.z + Math.cos(a) * 6);
      } else {
        const mate = g.survivors.filter((o) => o !== s && o.standing).sort((a, b) => this._dist(a) - this._dist(b))[0];
        this.crawlPt = mate && this._dist(mate) > 3 ? { x: mate.pos.x, z: mate.pos.z } : { x: s.pos.x, z: s.pos.z };
      }
    }
    this._go(dt, this.crawlPt.x, this.crawlPt.z, 1.0);
  }
}
