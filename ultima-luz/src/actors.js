// Survivor and killer state + movement. Match rules live in game.js.
import * as THREE from 'three';
import { makeSurvivorRig, makeKillerRig, animateRig } from './models.js';
import { SPEED } from './config.js';
import { clamp, damp, dampAngle, angleDiff } from './util.js';

export function makeIntent() {
  return { mx: 0, mz: 0, run: true, crouch: false, face: null, act: null, cancel: false, ability: false, attack: false, skill: false, wiggle: false };
}

export function clearIntent(I) {
  I.mx = 0; I.mz = 0; I.face = null; I.act = null; I.cancel = false;
  I.ability = false; I.attack = false; I.skill = false; I.wiggle = false;
}

class Actor {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.intent = makeIntent();
    this.task = null;
    this.cd = 0;
    this.stepT = 0;
    this.moved = 0;
  }

  get speedNow() { return Math.hypot(this.vel.x, this.vel.z); }

  // Moves towards intent direction with acceleration, collision and bounds.
  _move(dt, maxSpeed, radius, turnRate = 12, skip = null) {
    const I = this.intent;
    let mx = I.mx, mz = I.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    const tx = mx * maxSpeed, tz = mz * maxSpeed;
    const acc = m > 0.05 ? 14 : 18;
    this.vel.x = damp(this.vel.x, tx, acc, dt);
    this.vel.z = damp(this.vel.z, tz, acc, dt);
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.game.physics.collide(this.pos, radius, skip);
    this._bounds(radius);
    const real = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.moved = real;
    // feed collision back into velocity so we slide instead of pushing
    if (dt > 0) { this.vel.x = (this.pos.x - ox) / dt; this.vel.z = (this.pos.z - oz) / dt; }
    const face = I.face !== null ? I.face : (m > 0.1 ? Math.atan2(mx, mz) : null);
    if (face !== null) this.yaw = dampAngle(this.yaw, face, turnRate, dt);
    return real;
  }

  _bounds(r) {
    const H = this.game.world.half - r;
    if (Math.abs(this.pos.x) > H) this.pos.x = Math.sign(this.pos.x) * H;
    if (Math.abs(this.pos.z) > H) this.pos.z = Math.sign(this.pos.z) * H;
  }
}

export class Survivor extends Actor {
  constructor(game, def, index, isPlayer) {
    super(game);
    this.def = def;
    this.name = def.name;
    this.index = index;
    this.isPlayer = isPlayer;
    this.isKiller = false;
    this.radius = 0.36;
    this.state = 'standing';
    this.health = 2;
    this.hookProgress = 0;
    this.hook = null;
    this.bleed = 0;
    this.recoverProg = 0;
    this.healProg = 0;
    this.crouch = false;
    this.walking = false;
    this.haste = 0;
    this.sprint = 0;
    this.invis = 0;
    this.wiggle = 0;
    this.wiggleTap = 0;
    this.trap = null;
    this.trapEsc = 0;
    this.selfTries = 3;
    this.markT = 0;
    this.bloodT = 0;
    this.groanT = 2;
    this.skillT = 4 + Math.random() * 6;
    this.aura = null;
    this.auraT = 0;
    this.vault = null;
    this.deadAnim = 0;
    this.stats = { repair: 0, heals: 0, rescues: 0, stuns: 0, hooks: 0 };
    this.outcome = null;
    this.rig = makeSurvivorRig(def);
    game.scene.add(this.rig.root);
    this.ai = null;
  }

  get standing() { return this.state === 'standing'; }
  get out() { return this.state === 'dead' || this.state === 'escaped'; }
  get injured() { return this.state === 'standing' && this.health === 1; }
  get hittable() { return this.state === 'standing' || this.state === 'trapped'; }

  maxSpeed() {
    if (this.state === 'downed') return SPEED.crawl;
    let v = this.crouch ? SPEED.crouch : this.walking ? SPEED.walk : SPEED.run * this.def.speedMul;
    if (this.haste > 0) v *= 1.5;
    if (this.sprint > 0) v *= 1.6;
    return v;
  }

  update(dt) {
    this.haste = Math.max(0, this.haste - dt);
    this.sprint = Math.max(0, this.sprint - dt);
    this.invis = Math.max(0, this.invis - dt);
    this.cd = Math.max(0, this.cd - dt);
    const I = this.intent;
    if (this.state === 'standing') {
      this.crouch = !!I.crouch;
      this.walking = !I.run;
      if (this.vault) return this._vault(dt);
      const busy = this.task && !this.task.mobile;
      if (busy) {
        const m = Math.hypot(I.mx, I.mz);
        if (m > 0.35 || I.cancel) this.game.endTask(this, false);
      }
      if (this.task && !this.task.mobile) {
        this.vel.set(0, 0, 0);
        if (this.task.snap) {
          this.pos.x = damp(this.pos.x, this.task.snap.x, 10, dt);
          this.pos.z = damp(this.pos.z, this.task.snap.z, 10, dt);
        }
        if (this.task.face !== undefined) this.yaw = dampAngle(this.yaw, this.task.face, 10, dt);
      } else {
        this._move(dt, this.maxSpeed(), this.radius, 10);
      }
    } else if (this.state === 'downed') {
      this.crouch = false;
      this._move(dt, SPEED.crawl, this.radius, 4);
    } else {
      this.vel.set(0, 0, 0);
    }
  }

  _bounds(r) {
    const H = this.game.world.half - r;
    const g = this.game.openGateAt(this.pos.x, this.pos.z);
    if (g && Math.abs(this.pos.z) > H - 1.5) {
      if (Math.abs(this.pos.z) > H) this.pos.x = clamp(this.pos.x, g.x - 2.0, g.x + 2.0);
      return;
    }
    super._bounds(r);
  }

  _vault(dt) {
    const v = this.vault;
    v.t += dt / v.dur;
    const t = Math.min(1, v.t);
    this.pos.x = v.ax + (v.bx - v.ax) * t;
    this.pos.z = v.az + (v.bz - v.az) * t;
    this.yaw = v.yaw;
    this.vel.set((v.bx - v.ax) / v.dur, 0, (v.bz - v.az) / v.dur);
    if (t >= 1) { this.vault = null; this.vel.multiplyScalar(0.6); }
  }

  animate(dt) {
    const rig = this.rig;
    const root = rig.root;
    let mode = 'stand';
    const a = this._anim || (this._anim = {});
    a.speed = this.speedNow;
    a.attack = -1;
    a.injured = this.injured;
    a.struggle = false;
    a.carrying = false;
    let y = 0;
    if (this.state === 'standing') {
      if (this.vault) { mode = 'vault'; y = Math.sin(Math.min(1, this.vault.t) * Math.PI) * 0.55; }
      else if (this.task && !this.task.mobile) mode = ['gate', 'unhook'].includes(this.task.type) ? 'reach' : 'work';
      else if (this.crouch) mode = 'crouch';
    } else if (this.state === 'downed') mode = 'downed';
    else if (this.state === 'carried') mode = 'carried';
    else if (this.state === 'hooked') { mode = 'hooked'; a.struggle = this.hookProgress >= 1; }
    else if (this.state === 'trapped') mode = 'trapped';
    a.mode = mode;
    animateRig(rig, a, dt);
    if (this.state === 'carried') {
      const k = this.game.killer;
      const lx = Math.cos(k.yaw), lz = -Math.sin(k.yaw);
      root.position.set(k.pos.x + lx * 0.32, 1.92, k.pos.z + lz * 0.32);
      root.rotation.set(0, k.yaw + Math.PI, 0);
    } else if (this.state === 'hooked' && this.hook) {
      const p = this.hook.point;
      const yaw = Math.atan2(this.hook.x - p.x, this.hook.z - p.z);
      root.position.set(p.x - Math.cos(yaw) * 0.21, p.y - 1.5, p.z + Math.sin(yaw) * 0.21);
      root.rotation.set(0, yaw, 0);
    } else {
      root.position.set(this.pos.x, y, this.pos.z);
      root.rotation.set(0, this.yaw, 0);
    }
    root.visible = this.state !== 'dead' && this.state !== 'escaped';
  }
}

export class Killer extends Actor {
  constructor(game, def, isPlayer) {
    super(game);
    this.def = def;
    this.name = def.name;
    this.isPlayer = isPlayer;
    this.isKiller = true;
    this.radius = 0.48;
    this.carrying = null;
    this.stun = 0;
    this.blind = 0;
    this.attack = null;
    this.slow = 0;
    this.slowMul = 1;
    this.charge = 0;
    this.chargeYaw = 0;
    this.cloak = 0;
    this.uncloak = 0;
    this.ambush = 0;
    this.pitch = 0;
    this.terror = def.terror;
    this.stats = { hits: 0, downs: 0, hooks: 0, kills: 0, breaks: 0, kicks: 0, stunned: 0 };
    this.rig = makeKillerRig(def);
    game.scene.add(this.rig.root);
    this.ai = null;
    this.speedMul = 1;
    this.chaseT = 0;
    this.bloodlust = 0;
  }

  get cloaked() { return this.cloak > 0 || this.uncloak > 0; }

  maxSpeed() {
    let v = SPEED.killer * this.def.speedMul * this.speedMul * (1 + this.bloodlust * 0.045);
    if (this.carrying) v *= 0.86;
    if (this.cloak > 0) v *= 1.35;
    if (this.uncloak > 0) v *= 0.5;
    if (this.ambush > 0) v *= 1.15;
    if (this.attack) v *= this.attack.phase === 'lunge' ? 1.5 : this.attack.mul;
    if (this.slow > 0) v *= this.slowMul;
    return v;
  }

  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    this.blind = Math.max(0, this.blind - dt);
    this.ambush = Math.max(0, this.ambush - dt);
    this.slow = Math.max(0, this.slow - dt);
    if (this.uncloak > 0) {
      this.uncloak -= dt;
      if (this.uncloak <= 0) { this.uncloak = 0; this.ambush = 1.6; }
    }
    if (this.cloak > 0) {
      this.cloak -= dt;
      if (this.cloak <= 0) { this.cloak = 0; this.uncloak = 0.5; this.game.audio.play('cloak', this.pos.x, this.pos.z, 0.7); }
    }
    if (this.attack) {
      const A = this.attack;
      A.t -= dt;
      if (A.t <= 0) {
        if (A.phase === 'lunge') { A.phase = 'recover'; A.t = A.hit ? 1.9 : 1.1; A.mul = A.hit ? 0.4 : 0.55; A.dur = A.t; }
        else this.attack = null;
      }
    }
    if (this.stun > 0) {
      this.stun -= dt;
      this.vel.multiplyScalar(0.8);
      return;
    }
    const I = this.intent;
    if (this.task) {
      if (I.cancel || Math.hypot(I.mx, I.mz) > 0.6) this.game.endTask(this, false);
    }
    if (this.task) { this.vel.set(0, 0, 0); if (this.task.face !== undefined) this.yaw = dampAngle(this.yaw, this.task.face, 10, dt); return; }
    if (this.charge > 0) return this._charge(dt);
    const lunging = this.attack && this.attack.phase === 'lunge';
    if (lunging) {
      // a lunge always pushes forward, steering only a little
      const f = Math.atan2(I.mx, I.mz);
      if (Math.hypot(I.mx, I.mz) > 0.1) this.attack.yaw = this.attack.yaw + clamp(angleDiff(this.attack.yaw, f), -2.5 * dt, 2.5 * dt);
      I.mx = Math.sin(this.attack.yaw); I.mz = Math.cos(this.attack.yaw);
      if (!this.isPlayer) I.face = this.attack.yaw;
    }
    this._move(dt, this.maxSpeed(), this.radius, this.isPlayer ? 30 : 9);
  }

  _charge(dt) {
    const I = this.intent;
    this.charge -= dt;
    const want = I.face !== null ? I.face : (Math.hypot(I.mx, I.mz) > 0.1 ? Math.atan2(I.mx, I.mz) : this.chargeYaw);
    this.chargeYaw += clamp(angleDiff(this.chargeYaw, want), -1.3 * dt, 1.3 * dt);
    I.mx = Math.sin(this.chargeYaw); I.mz = Math.cos(this.chargeYaw); I.face = this.chargeYaw;
    const v = SPEED.killer * 2.3;
    this.vel.x = I.mx * v; this.vel.z = I.mz * v;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const hitWall = this.game.physics.collide(this.pos, this.radius, (o) => o.tag === 'pallet');
    this._bounds(this.radius);
    this.yaw = this.chargeYaw;
    const real = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.game.onChargeStep(this, real / Math.max(1e-4, v * dt), hitWall);
    if (this.charge <= 0) { this.charge = 0; this.slow = 0.8; this.slowMul = 0.6; }
  }

  animate(dt) {
    const a = this._anim || (this._anim = {});
    a.speed = this.speedNow;
    a.mode = this.stun > 0 ? 'stunned' : this.task && this.task.type === 'kick' ? 'kick' : this.task && this.task.type !== 'trap' ? 'reach' : 'stand';
    if (this.task && this.task.type === 'trap') a.mode = 'crouch';
    a.attack = this.attack && this.attack.phase === 'lunge' ? 1 - this.attack.t / 0.38 : -1;
    a.wipe = this.attack && this.attack.phase === 'recover' && this.attack.hit;
    a.carrying = !!this.carrying;
    a.injured = false;
    animateRig(this.rig, a, dt);
    this.rig.root.position.set(this.pos.x, 0, this.pos.z);
    this.rig.root.rotation.set(0, this.yaw, 0);
  }
}
