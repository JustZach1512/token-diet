// One match: spawning, rules, abilities, skill checks, camera, audio and HUD state.
import * as THREE from 'three';
import { World, makeTrapMesh } from './world.js';
import { Survivor, Killer } from './actors.js';
import { KillerAI, SurvivorAI } from './ai.js';
import { Particles } from './particles.js';
import { getTextures } from './textures.js';
import { makeViewModel } from './models.js';
import {
  SURVIVORS, KILLERS, DIFFICULTIES, ALLY_PARAMS, GENS_REQUIRED, GEN_TIME, GATE_TIME,
  COLLAPSE_TIME, BLEEDOUT_TIME, HOOK_STAGE_TIME,
} from './config.js';
import { clamp, dist, yawTo, angleDiff, damp, fmtTime } from './util.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const AURA_ALLY = 0xffd27a;
const AURA_KILLER = 0xff2a2a;

export class Game {
  constructor(app, settings) {
    this.app = app;
    this.audio = app.audio;
    this.ui = app.ui;
    this.input = app.input;
    this.q = app.quality;
    this.settings = settings;
    this.diff = DIFFICULTIES[settings.diff] || DIFFICULTIES.normal;
    this.nightmare = this.diff.id === 'pesadilla';
    this.role = settings.role;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.08, 600);
    this.scene.add(this.camera);
    this.world = new World(this.scene, this.q, { nightmare: this.nightmare }).build();
    this.physics = this.world.physics;
    const tex = getTextures();
    this.fx = {
      add: new Particles(this.scene, Math.floor(1300 * this.q.particles) + 250, true, tex.glow),
      norm: new Particles(this.scene, 500, false, tex.glow),
    };
    this.time = 0;
    this.marks = [];
    this.traps = [];
    this.claims = new Map();
    this.collapse = -1;
    this.gensDone = 0;
    this.ended = false;
    this.endT = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.shake = 0;
    this.dmg = 0;
    this.blindFx = 0;
    this.skill = null;
    this.toastQ = [];
    this.pings = [];
    this.spectate = null;
    this.timeScale = settings.timeScale || 1;
    this.camPos = new THREE.Vector3();
    this.flashes = [];
    this._spawn();
    this._setupMarks();
    this._setupKillerLight();
    this.chase = 0;
    this.camPos.copy(this.camera.position);
    this.audio.startAmbient(this.nightmare);
    this.toast(this.role === 'killer'
      ? `Eres ${this.killer.name}. Caza y cuelga a los cuatro.`
      : `Repara ${GENS_REQUIRED} generadores y escapa por una puerta.`, 'big');
    if (this.role === 'survivor') this.toast(`Te persigue ${this.killer.name}.`);
  }

  // ------------------------------------------------------------------ setup
  _spawn() {
    const S = this.settings, H = this.world.half, ph = this.physics;
    const r = Math.random;
    const spot = (avoid, minD) => {
      for (let i = 0; i < 400; i++) {
        const x = (r() - 0.5) * (H * 2 - 16), z = (r() - 0.5) * (H * 2 - 16);
        if (!ph.walkable(x, z)) continue;
        if (avoid && dist(x, z, avoid.x, avoid.z) < minD - i * 0.05) continue;
        return { x, z };
      }
      return ph.nearestWalkable(0, H * 0.6);
    };
    const ks = spot(null, 0);
    const ss = spot(ks, 55);
    const kId = this.role === 'killer' ? S.charId : (S.killerId || KILLERS[Math.floor(r() * KILLERS.length)].id);
    const kdef = KILLERS.find((k) => k.id === kId) || KILLERS[0];
    this.killer = new Killer(this, kdef, this.role === 'killer');
    this.killer.pos.set(ks.x, 0, ks.z);
    this.killer.yaw = yawTo(ks.x, ks.z, 0, 0);
    let defs = SURVIVORS.slice();
    if (this.role === 'survivor') {
      const me = defs.find((d) => d.id === S.charId) || defs[0];
      defs = [me, ...defs.filter((d) => d !== me)];
    }
    this.survivors = defs.map((d, i) => {
      const s = new Survivor(this, d, i, this.role === 'survivor' && i === 0);
      const a = (i / 4) * Math.PI * 2;
      const p = ph.nearestWalkable(ss.x + Math.cos(a) * 2.2, ss.z + Math.sin(a) * 2.2);
      s.pos.set(p.x, 0, p.z);
      s.yaw = yawTo(p.x, p.z, 0, 0);
      return s;
    });
    if (!this.killer.isPlayer || S.auto) {
      this.killer.ai = new KillerAI(this, this.killer, this.diff.killer);
      this.killer.speedMul = this.diff.killer.speedMul;
    }
    for (const s of this.survivors) {
      if (!s.isPlayer || S.auto) s.ai = new SurvivorAI(this, s, this.role === 'killer' ? this.diff.surv : ALLY_PARAMS);
    }
    this.player = this.role === 'killer' ? this.killer : this.survivors[0];
    this.camYaw = this.player.yaw;
    if (this.role === 'killer') {
      this.killer.rig.hideForFirstPerson();
      this.vm = makeViewModel(kdef);
      this.vm.position.set(0.3, -0.34, -0.5);
      this.camera.add(this.vm);
      this.camPitch = -0.08;
      this.vmSwing = -1;
    }
  }

  _setupMarks() {
    const tex = getTextures();
    const geo = new THREE.PlaneGeometry(0.55, 0.8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex.scratch, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.markMesh = new THREE.InstancedMesh(geo, mat, 360);
    this.markMesh.count = 0;
    this.markMesh.frustumCulled = false;
    this.markMesh.renderOrder = 3;
    this.markMesh.setColorAt(0, new THREE.Color(0));
    this.markMesh.visible = this.role === 'killer';
    this.scene.add(this.markMesh);
  }

  _setupKillerLight() {
    const sp = new THREE.SpotLight(0xff1810, this.killer.isPlayer ? 9 : 34, 17, 0.4, 0.75, 1.5);
    sp.castShadow = false;
    this.scene.add(sp);
    this.scene.add(sp.target);
    this.redStain = sp;
    if (this.role === 'survivor') {
      // soft fill so your own survivor stays readable on small screens
      this.fill = new THREE.PointLight(this.nightmare ? 0xd89a90 : 0x9fb2e6, 2.8, 7.5, 1.6);
      this.scene.add(this.fill);
    }
  }

  // ------------------------------------------------------------------ helpers
  toast(text, kind = '') { this.ui.toast(text, kind); }

  noise(x, z, kind, loud) {
    if (this.killer.ai) this.killer.ai.onNoise(x, z, kind, loud);
    if (this.role === 'killer' && dist(x, z, this.killer.pos.x, this.killer.pos.z) < loud) {
      this.pings.push({ x, z, t: this.time, kind });
    }
  }

  genDist(gen, x, z) {
    const dx = x - gen.x, dz = z - gen.z;
    const c = Math.cos(gen.rot), s = Math.sin(gen.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const qx = Math.max(Math.abs(lx) - 0.82, 0), qz = Math.max(Math.abs(lz) - 0.52, 0);
    return Math.hypot(qx, qz);
  }

  palletCenter(p) { return { x: p.x - p.n.x * p.off, z: p.z - p.n.z * p.off }; }

  inBush(x, z) { return this.world.bushes.some((b) => dist(b.x, b.z, x, z) < b.r); }

  openGateAt(x, z) {
    for (const g of this.world.gates) if (g.open && Math.abs(x - g.x) < 2.2 && Math.sign(z) === g.side) return g;
    return null;
  }

  newestMark(s, since, kx, kz, range) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      if (m.t < since) break;
      if (m.owner === s && dist(m.x, m.z, kx, kz) < range) return m;
    }
    return null;
  }

  blockingPallet(ax, az, bx, bz) {
    for (const p of this.world.pallets) {
      if (p.state !== 'down' || !p.obstacle) continue;
      if (dist(ax, az, p.x, p.z) > 9) continue;
      if (this.physics._segBox(p.obstacle, ax, az, bx, bz) <= 1) return p;
    }
    return null;
  }

  killerCanSee(k, s, P) {
    const dx = s.pos.x - k.pos.x, dz = s.pos.z - k.pos.z;
    const d = Math.hypot(dx, dz);
    let range = P.vision;
    const low = s.crouch || s.state === 'downed' || s.state === 'trapped';
    if (s.crouch) range *= 0.55;
    if (s.state === 'downed') range *= 0.75;
    if (low && this.inBush(s.pos.x, s.pos.z)) range = Math.min(range, 4);
    if (s.invis > 0) range = 2.2;
    if (d > range) return false;
    if (d > 3.5 && Math.abs(angleDiff(k.yaw, Math.atan2(dx, dz))) > (P.fov * Math.PI) / 360) return false;
    return this.physics.los(k.pos.x, k.pos.z, s.pos.x, s.pos.z, low ? 0.85 : 1.6);
  }

  killerCanHear(k, s, P) {
    if (s.invis > 0 || s.state !== 'standing') return false;
    const d = dist(k.pos.x, k.pos.z, s.pos.x, s.pos.z);
    const quiet = s.def.markMul < 1 ? 0.6 : 1;
    if (s.speedNow > 3 && !s.crouch && d < P.hearing * quiet) return true;
    if (s.injured && d < P.hearing * 0.75 * quiet) return true;
    if (s.task && s.task.type === 'repair' && d < P.hearing * 0.5) return true;
    return false;
  }

  // ------------------------------------------------------------------ tasks
  startTask(a, type, target) {
    if (a.task || this.ended) return false;
    const D = (o) => dist(a.pos.x, a.pos.z, o.x ?? o.pos.x, o.z ?? o.pos.z);
    if (!a.isKiller) {
      const s = a;
      if (s.state !== 'standing' || s.vault) return false;
      switch (type) {
        case 'repair': {
          const gen = target;
          if (gen.done || this.genDist(gen, s.pos.x, s.pos.z) > 1.15) return false;
          const spot = gen.spots.filter((sp) => sp.ok && (!sp.taken || sp.taken === s))
            .sort((p, q) => D(p) - D(q))[0];
          if (!spot) return false;
          spot.taken = s;
          gen.workers.add(s);
          s.task = { type, target: gen, spot, snap: spot, face: spot.yaw, t: 0 };
          return true;
        }
        case 'heal':
          if (!target.injured || target === s || D(target) > 1.9) return false;
          s.task = { type, target, face: yawTo(s.pos.x, s.pos.z, target.pos.x, target.pos.z), t: 0 };
          return true;
        case 'recover':
          if (target.state !== 'downed' || D(target) > 1.9) return false;
          s.task = { type, target, face: yawTo(s.pos.x, s.pos.z, target.pos.x, target.pos.z), t: 0 };
          return true;
        case 'unhook':
          if (target.state !== 'hooked' || D(target.hook.point) > 2.0) return false;
          s.task = { type, target, face: yawTo(s.pos.x, s.pos.z, target.hook.point.x, target.hook.point.z), t: 0, dur: 1.0 };
          return true;
        case 'free':
          if (target.state !== 'trapped' || D(target) > 1.7) return false;
          s.task = { type, target, face: yawTo(s.pos.x, s.pos.z, target.pos.x, target.pos.z), t: 0, dur: 2.5 };
          return true;
        case 'gate':
          if (!target.powered || target.open || D(target.lever) > 1.4) return false;
          s.task = { type, target, snap: target.lever, face: yawTo(target.lever.x, target.lever.z, target.lever.x, target.lever.z - target.inward), t: 0 };
          return true;
        case 'drop':
          if (target.state !== 'up' || D(target) > 1.9) return false;
          this._dropPallet(s, target);
          return true;
        case 'vault': {
          const p = target;
          if (p.state !== 'down') return false;
          const c = this.palletCenter(p);
          if (D(c) > 2.1) return false;
          const ln = (s.pos.x - c.x) * p.n.x + (s.pos.z - c.z) * p.n.z;
          const lt = clamp((s.pos.x - c.x) * p.t.x + (s.pos.z - c.z) * p.t.z, -p.width / 2 + 0.4, p.width / 2 - 0.4);
          const side = ln >= 0 ? 1 : -1;
          const fast = s.speedNow > 3;
          s.vault = {
            ax: c.x + p.n.x * side * 0.95 + p.t.x * lt, az: c.z + p.n.z * side * 0.95 + p.t.z * lt,
            bx: c.x - p.n.x * side * 1.05 + p.t.x * lt, bz: c.z - p.n.z * side * 1.05 + p.t.z * lt,
            t: 0, dur: fast ? 0.55 : 0.9, yaw: Math.atan2(-p.n.x * side, -p.n.z * side),
          };
          this.audio.play('whoosh', s.pos.x, s.pos.z, 0.5);
          if (fast) this.noise(c.x, c.z, 'vault', 22);
          return true;
        }
        default: return false;
      }
    }
    const k = a;
    if (k.stun > 0 || k.attack || k.charge > 0) return false;
    switch (type) {
      case 'pickup':
        if (k.carrying || target.state !== 'downed' || D(target) > 2.0 || k.cloaked) return false;
        k.task = { type, target, face: yawTo(k.pos.x, k.pos.z, target.pos.x, target.pos.z), t: 0, dur: 1.1 };
        return true;
      case 'hook':
        if (!k.carrying || target.victim || D(target) > 2.1) return false;
        k.task = { type, target, face: yawTo(k.pos.x, k.pos.z, target.point.x, target.point.z), t: 0, dur: 1.0 };
        return true;
      case 'drop':
        if (!k.carrying) return false;
        this._releaseCarried(k, false);
        return true;
      case 'break': {
        if (target.state !== 'down' || k.carrying) return false;
        const c = this.palletCenter(target);
        if (D(c) > 2.7) return false;
        const mul = k.def.breakMul * (k.ai ? k.ai.P.breakMul : 1);
        k.task = { type, target, face: yawTo(k.pos.x, k.pos.z, c.x, c.z), t: 0, dur: 2.3 * mul };
        return true;
      }
      case 'kick':
        if (target.done || target.regress || target.progress <= 0.01 || k.carrying || this.genDist(target, k.pos.x, k.pos.z) > 1.6) return false;
        k.task = { type, target, face: yawTo(k.pos.x, k.pos.z, target.x, target.z), t: 0, dur: 1.8 * k.def.kickMul };
        return true;
      case 'trap':
        k.task = { type, t: 0, dur: 0.9, face: k.yaw };
        this.audio.play('trapSet', k.pos.x, k.pos.z, 0.6);
        return true;
      default: return false;
    }
  }

  endTask(a, done) {
    const T = a.task;
    if (!T) return;
    if (T.type === 'repair') {
      T.target.workers.delete(a);
      if (T.spot && T.spot.taken === a) T.spot.taken = null;
    }
    a.task = null;
    if (a.isPlayer && this.skill && !done) this.skill = null;
  }

  _tasks(dt) {
    for (const a of [...this.survivors, this.killer]) {
      const T = a.task;
      if (!T) continue;
      const D = (o) => dist(a.pos.x, a.pos.z, o.x ?? o.pos.x, o.z ?? o.pos.z);
      if (!a.isKiller) {
        if (a.state !== 'standing') { this.endTask(a, false); continue; }
        const t = T.target;
        switch (T.type) {
          case 'repair':
            if (t.done) this.endTask(a, true);
            break;
          case 'heal':
            if (!t.injured || D(t) > 2.2) { this.endTask(a, false); break; }
            t.healProg += (dt / 14) * a.def.healMul;
            this._skillTick(a, dt);
            if (t.healProg >= 1) {
              t.healProg = 0; t.health = 2; a.stats.heals++;
              this.endTask(a, true);
              if (t.isPlayer) this.toast(`${a.name} te ha curado.`);
            }
            break;
          case 'recover':
            if (t.state !== 'downed' || D(t) > 2.2) { this.endTask(a, false); break; }
            t.recoverProg += (dt / 12) * a.def.healMul;
            this._skillTick(a, dt);
            if (t.recoverProg >= 1) {
              t.recoverProg = 0; t.state = 'standing'; t.health = 1; a.stats.heals++;
              this.endTask(a, true);
              this.toast(`${a.name} ha levantado a ${t.name}.`);
            }
            break;
          case 'unhook':
            if (t.state !== 'hooked') { this.endTask(a, false); break; }
            T.t += dt;
            if (T.t >= T.dur) { this.endTask(a, true); this._unhook(t, a); }
            break;
          case 'free':
            if (t.state !== 'trapped') { this.endTask(a, false); break; }
            T.t += dt;
            if (T.t >= T.dur) { this.endTask(a, true); this._freeTrap(t); }
            break;
          case 'gate':
            if (t.open) { this.endTask(a, true); break; }
            t.progress += dt / GATE_TIME;
            if (t.progress >= 1) { this.endTask(a, true); this._openGate(t); }
            break;
          default:
        }
      } else {
        const k = a, t = T.target;
        T.t += dt;
        if (T.type === 'pickup' && (t.state !== 'downed' || k.stun > 0)) { this.endTask(k, false); continue; }
        if (T.type === 'hook' && (!k.carrying || t.victim)) { this.endTask(k, false); continue; }
        if (T.type === 'break' && t.state !== 'down') { this.endTask(k, false); continue; }
        if (T.type === 'kick' && (t.done || t.workers.size > 0)) { this.endTask(k, false); continue; }
        if (T.t < T.dur) continue;
        this.endTask(k, true);
        if (T.type === 'pickup') this._pickup(k, t);
        else if (T.type === 'hook') this._hookSurvivor(k, t);
        else if (T.type === 'break') this._breakPallet(k, t);
        else if (T.type === 'kick') this._kickGen(k, t);
        else if (T.type === 'trap') this._placeTrap(k);
      }
    }
  }

  // ------------------------------------------------------------------ actions
  _dropPallet(s, p) {
    this.world.dropPallet(p);
    this.audio.play('pallet', p.x, p.z, 1);
    this.noise(p.x, p.z, 'pallet', 40);
    const c = this.palletCenter(p);
    const k = this.killer;
    const rel = (o) => ({
      lt: (o.pos.x - c.x) * p.t.x + (o.pos.z - c.z) * p.t.z,
      ln: (o.pos.x - c.x) * p.n.x + (o.pos.z - c.z) * p.n.z,
    });
    const r = rel(k);
    if (Math.abs(r.lt) < p.width / 2 + 0.5 && Math.abs(r.ln) < 1.2 && k.charge <= 0) {
      const side = r.ln >= 0 ? 1 : -1;
      k.pos.x = c.x + p.n.x * side * 1.05 + p.t.x * r.lt;
      k.pos.z = c.z + p.n.z * side * 1.05 + p.t.z * r.lt;
      this._stunKiller(k, 2.2, 'palé');
      s.stats.stuns++;
      if (k.task) this.endTask(k, false);
    }
    for (const o of this.survivors) {
      if (o.state !== 'standing' && o.state !== 'downed') continue;
      const q = rel(o);
      if (Math.abs(q.lt) < p.width / 2 + 0.3 && Math.abs(q.ln) < 0.75) {
        const side = q.ln >= 0 ? 1 : -1;
        o.pos.x = c.x + p.n.x * side * 0.8 + p.t.x * q.lt;
        o.pos.z = c.z + p.n.z * side * 0.8 + p.t.z * q.lt;
      }
    }
    for (let i = 0; i < 14; i++) {
      this.fx.norm.spawn({ x: p.x + (Math.random() - 0.5) * p.width, y: 0.2, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: (Math.random() - 0.5) * 2, life: 0.8, size: 0.12, color: 0x5a4a38, alpha: 0.8, alpha1: 0, gravity: 6, floor: 0.02 });
    }
  }

  _breakPallet(k, p) {
    this.world.breakPallet(p);
    k.stats.breaks++;
    this.audio.play('break', p.x, p.z, 1);
    this.noise(p.x, p.z, 'break', 30);
    for (let i = 0; i < 30; i++) {
      this.fx.norm.spawn({
        x: p.x + (Math.random() - 0.5) * p.width, y: 0.4 + Math.random() * 0.5, z: p.z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 4, vy: 1.5 + Math.random() * 3, vz: (Math.random() - 0.5) * 4,
        life: 1.2, size: 0.16, color: 0x6a5238, alpha: 1, alpha1: 0.6, gravity: 9, floor: 0.03, drag: 0.5,
      });
    }
    if (k.isPlayer) this.shake = Math.max(this.shake, 0.3);
  }

  _kickGen(k, gen) {
    gen.progress = Math.max(0, gen.progress - 0.06);
    gen.regress = true;
    gen.shake = 1;
    k.stats.kicks++;
    this.audio.play('kick', gen.x, gen.z, 1);
    for (let i = 0; i < 24; i++) {
      this.fx.add.spawn({ x: gen.x, y: 1.1, z: gen.z, vx: (Math.random() - 0.5) * 5, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.6, size: 0.07, color: 0xffd080, color1: 0xff4010, alpha: 1, alpha1: 0, gravity: 9 });
    }
    if (k.isPlayer) this.toast('Generador dañado: pierde progreso.');
  }

  _pickup(k, s) {
    s.state = 'carried';
    s.wiggle = 0;
    s.recoverProg = 0;
    k.carrying = s;
    if (s.task) this.endTask(s, false);
    this.audio.play(s.def.gender === 'f' ? 'screamF' : 'scream', k.pos.x, k.pos.z, 0.6);
    if (s.isPlayer) this.toast('¡Te ha cogido! Toca para forcejear.', 'warn');
  }

  _releaseCarried(k, escaped) {
    const s = k.carrying;
    if (!s) return;
    k.carrying = null;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    s.pos.set(k.pos.x + fx * 0.9, 0, k.pos.z + fz * 0.9);
    this.physics.collide(s.pos, s.radius);
    s.yaw = k.yaw;
    if (escaped) {
      s.state = 'standing';
      s.health = 1;
      s.haste = 1.8;
      s.pos.set(k.pos.x - fx * 0.9, 0, k.pos.z - fz * 0.9);
      this.physics.collide(s.pos, s.radius);
      this.toast(`${s.name} se ha liberado del asesino.`, s.isPlayer ? 'good' : '');
    } else {
      s.state = 'downed';
    }
  }

  _hookSurvivor(k, hook) {
    const s = k.carrying;
    if (!s || hook.victim) return;
    k.carrying = null;
    s.state = 'hooked';
    s.hook = hook;
    hook.victim = s;
    s.hookedAt = this.time;
    s.hookCount = (s.hookCount || 0) + 1;
    k.stats.hooks++;
    this.audio.play('hook', hook.x, hook.z, 1);
    this.audio.play(s.def.gender === 'f' ? 'screamF' : 'scream', hook.x, hook.z, 1);
    if (s.hookCount >= 3) { this._sacrifice(s); return; }
    if (s.hookCount === 2) s.hookProgress = Math.max(s.hookProgress, 1);
    this.toast(`${s.name} ha sido colgado${s.hookCount === 2 ? ' por segunda vez' : ''}.`, s.isPlayer ? 'warn' : '');
    if (k.ai) { k.ai.state = 'patrol'; k.ai.patrolGoal = null; k.ai.target = null; }
  }

  _unhook(s, by) {
    const h = s.hook;
    h.victim = null;
    s.hook = null;
    s.state = 'standing';
    s.health = 1;
    s.haste = 1.6;
    s.pos.set(h.point.x, 0, h.point.z);
    this.physics.collide(s.pos, s.radius);
    if (by) by.stats.rescues++;
    this.audio.play('unhook', h.x, h.z, 1);
    this.toast(by ? `${by.name} ha rescatado a ${s.name}.` : `${s.name} se ha soltado del gancho.`, s.isPlayer ? 'good' : '');
    const P = this.killer.ai ? this.killer.ai.P : null;
    this.noise(h.x, h.z, 'unhook', P && P.hookProxy > 0.3 ? 999 : 30);
  }

  _sacrifice(s) {
    const h = s.hook;
    s.state = 'dead';
    s.outcome = 'Sacrificado';
    if (h) { h.victim = null; h.spikeAnim = 1; }
    this.killer.stats.kills++;
    const p = h ? h.point : s.pos;
    this.audio.play('sacrifice', p.x, p.z, 1);
    for (let i = 0; i < 80; i++) {
      this.fx.add.spawn({
        x: p.x + (Math.random() - 0.5) * 0.8, y: 1 + Math.random() * 2, z: p.z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 5, vz: (Math.random() - 0.5) * 1.5,
        life: 1.5 + Math.random(), size: 0.18, size1: 0.02, color: 0xff3010, color1: 0x300000, alpha: 1, alpha1: 0, drag: 0.6,
      });
    }
    this.toast(`${s.name} ha sido sacrificado a la Entidad.`, s.isPlayer ? 'bad' : '');
    this._playerOut(s);
  }

  _kill(s, why) {
    if (s.out) return;
    if (s.state === 'hooked' && s.hook) { s.hook.victim = null; s.hook.spikeAnim = 1; }
    if (s.state === 'carried') this.killer.carrying = null;
    if (s.state === 'trapped' && s.trap) this._removeTrap(s.trap);
    s.state = 'dead';
    s.outcome = why;
    this.killer.stats.kills++;
    this._playerOut(s);
  }

  _playerOut(s) {
    if (s.task) this.endTask(s, false);
    this._releaseClaims(s);
    if (s.isPlayer && !this.spectate) {
      this.spectateT = 2.5;
      this.ui.setSpectate(true);
    }
  }

  _releaseClaims(s) {
    for (const [t, w] of this.claims) if (w === s || t === s) this.claims.delete(t);
  }

  _hitSurvivor(k, s) {
    k.stats.hits++;
    k.chaseT = 0;
    k.bloodlust = 0;
    if (s.state === 'trapped') {
      this._removeTrap(s.trap);
      s.trap = null;
      s.state = 'standing';
    }
    s.health -= 1;
    if (s.task) this.endTask(s, false);
    s.vault = null;
    const bx = s.pos.x, bz = s.pos.z;
    for (let i = 0; i < 26; i++) {
      this.fx.norm.spawn({
        x: bx, y: 1.2, z: bz, vx: Math.sin(k.yaw) * 2 + (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2.5,
        vz: Math.cos(k.yaw) * 2 + (Math.random() - 0.5) * 3, life: 0.9, size: 0.09 + Math.random() * 0.08,
        color: 0x8a0a0a, color1: 0x300000, alpha: 1, alpha1: 0.7, gravity: 9.8, floor: 0.02,
      });
    }
    this.audio.play('hit', bx, bz, 1);
    this.audio.play(s.def.gender === 'f' ? 'screamF' : 'scream', bx, bz, 0.9);
    if (s.health <= 0) {
      s.state = 'downed';
      s.health = 0;
      s.recoverProg = 0;
      s.healProg = 0;
      k.stats.downs++;
      if (s.isPlayer) this.toast('¡Derribado! Arrástrate y espera ayuda.', 'bad');
      else if (k.isPlayer) this.toast(`${s.name} derribado. Recógelo y cuélgalo.`);
    } else {
      s.haste = 1.8;
      s.healProg = 0;
    }
    if (s.isPlayer) { this.dmg = 1; this.shake = Math.max(this.shake, 0.5); }
    if (k.isPlayer) this.shake = Math.max(this.shake, 0.25);
  }

  killerAttack(k) {
    if (k.attack || k.stun > 0 || k.task || k.carrying || k.cloaked || k.charge > 0) return false;
    k.attack = { phase: 'lunge', t: 0.38, hit: false, yaw: k.yaw, mul: 1 };
    this.audio.play('swing', k.pos.x, k.pos.z, 0.8);
    if (k.isPlayer) this.vmSwing = 0;
    return true;
  }

  _stunKiller(k, t, why) {
    k.stun = Math.max(k.stun, t);
    k.chaseT = 0;
    k.bloodlust = 0;
    k.attack = null;
    k.charge = 0;
    k.stats.stunned++;
    if (k.task) this.endTask(k, false);
    if (k.carrying) this._releaseCarried(k, true);
    this.audio.play('stun', k.pos.x, k.pos.z, 1);
    if (k.isPlayer) { this.shake = Math.max(this.shake, 0.6); this.toast(`¡Aturdido por un ${why}!`, 'bad'); }
    else if (this.role === 'survivor') this.toast(`¡Asesino aturdido!`, 'good');
  }

  onChargeStep(k, ratio, hitWall) {
    for (const s of this.survivors) {
      if (!s.hittable) continue;
      if (dist(k.pos.x, k.pos.z, s.pos.x, s.pos.z) < k.radius + s.radius + 0.55) {
        this._hitSurvivor(k, s);
        k.charge = 0;
        k.attack = { phase: 'recover', t: 2.0, hit: true, mul: 0.4, yaw: k.yaw };
        return;
      }
    }
    for (const p of this.world.pallets) {
      if (p.state !== 'down') continue;
      const c = this.palletCenter(p);
      if (dist(k.pos.x, k.pos.z, c.x, c.z) < 1.7) this._breakPallet(k, p);
    }
    if (hitWall && ratio < 0.45) {
      k.charge = 0;
      k.stun = 1.3;
      this.audio.play('stun', k.pos.x, k.pos.z, 0.8);
      if (k.isPlayer) this.shake = Math.max(this.shake, 0.7);
    }
  }

  useAbility(a, yaw) {
    const id = a.def.ability.id;
    if (!a.isKiller) {
      const s = a;
      if (s.cd > 0 || s.state !== 'standing') return false;
      if (id === 'sprint') {
        s.sprint = 3;
        this.audio.play('whoosh', s.pos.x, s.pos.z, 0.8);
      } else if (id === 'medkit') {
        const dn = this.survivors.find((o) => o !== s && o.state === 'downed' && dist(o.pos.x, o.pos.z, s.pos.x, s.pos.z) < 3);
        if (dn) { dn.state = 'standing'; dn.health = 1; dn.recoverProg = 0; this.toast(`${s.name} levanta a ${dn.name} con el botiquín.`); }
        else if (s.health === 1) { s.health = 2; s.healProg = 0; }
        else return false;
        const tgt = dn || s;
        for (let i = 0; i < 30; i++) {
          this.fx.add.spawn({ x: tgt.pos.x + (Math.random() - 0.5), y: 0.3 + Math.random() * 1.6, z: tgt.pos.z + (Math.random() - 0.5), vy: 0.8, life: 1.1, size: 0.12, color: 0x9affb0, alpha: 0.9, alpha1: 0 });
        }
        this.audio.play('great', s.pos.x, s.pos.z, 0.6);
      } else if (id === 'flare') {
        const y = yaw ?? s.yaw;
        const fx = Math.sin(y), fz = Math.cos(y);
        const px = s.pos.x + fx * 1.4, pz = s.pos.z + fz * 1.4;
        this.audio.play('flare', px, pz, 1);
        this.flashes.push({ x: px, y: 1.5, z: pz, t: 0.6 });
        for (let i = 0; i < 70; i++) {
          this.fx.add.spawn({ x: px, y: 1.5, z: pz, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.3) * 7, vz: (Math.random() - 0.5) * 9, life: 0.5 + Math.random() * 0.8, size: 0.2, size1: 0.02, color: 0xffffff, color1: 0xff6040, alpha: 1, alpha1: 0, gravity: 4, drag: 2 });
        }
        const k = this.killer;
        const d = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
        if (d < 9 && Math.abs(angleDiff(y, yawTo(s.pos.x, s.pos.z, k.pos.x, k.pos.z))) < 0.95 && this.physics.los(s.pos.x, s.pos.z, k.pos.x, k.pos.z, 1.6) && !(k.cloak > 0)) {
          this._stunKiller(k, 3, 'destello');
          k.blind = 3;
          s.stats.stuns++;
        }
        this.noise(px, pz, 'flare', 40);
      } else if (id === 'shadow') {
        s.invis = 7;
        this.audio.play('cloak', s.pos.x, s.pos.z, 0.6);
      }
      s.cd = s.def.ability.cd;
      return true;
    }
    const k = a;
    if (k.stun > 0 || k.task) return false;
    if (id === 'cloak') {
      if (k.cloak > 0) { k.cloak = 0; k.uncloak = 0.5; k.cd = k.def.ability.cd; this.audio.play('cloak', k.pos.x, k.pos.z, 0.7); return true; }
      if (k.cd > 0 || k.cloaked || k.carrying || k.attack) return false;
      k.cloak = 6;
      this.audio.play('cloak', k.pos.x, k.pos.z, 0.7);
      return true;
    }
    if (k.cd > 0) return false;
    if (id === 'charge') {
      if (k.carrying || k.attack) return false;
      k.charge = 1.3;
      k.chargeYaw = k.yaw;
      k.cd = k.def.ability.cd;
      this.audio.play('roar', k.pos.x, k.pos.z, 1);
      if (k.isPlayer) this.shake = Math.max(this.shake, 0.3);
      return true;
    }
    if (id === 'trap') {
      if (k.carrying || k.attack || this.traps.length >= 4) {
        if (k.isPlayer && this.traps.length >= 4) this.toast('Ya tienes 4 cepos puestos.');
        return false;
      }
      if (!this.startTask(k, 'trap')) return false;
      k.cd = k.def.ability.cd;
      return true;
    }
    return false;
  }

  _placeTrap(k) {
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    let x = k.pos.x + fx * 0.9, z = k.pos.z + fz * 0.9;
    if (!this.physics.walkable(x, z)) { x = k.pos.x; z = k.pos.z; }
    const mesh = makeTrapMesh();
    mesh.position.set(x, 0, z);
    mesh.rotation.y = Math.random() * 6;
    this.scene.add(mesh);
    this.traps.push({ x, z, mesh, armed: true, known: false, victim: null, t: 0, closeAnim: 0 });
  }

  _removeTrap(trap) {
    if (!trap) return;
    const i = this.traps.indexOf(trap);
    if (i >= 0) this.traps.splice(i, 1);
    if (trap.known) this.physics.setExtra(trap.x, trap.z, 0.6, false);
    this.scene.remove(trap.mesh);
    trap.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  _freeTrap(s) {
    const t = s.trap;
    s.trap = null;
    if (s.state === 'trapped') s.state = 'standing';
    this._removeTrap(t);
    s.trapEsc = 0;
    if (s.isPlayer) this.toast('Te has liberado del cepo.', 'good');
  }

  _openGate(g) {
    g.open = true;
    g.progress = 1;
    this.physics.remove(g.obstacle);
    this.audio.play('gate', g.x, g.z, 1);
    this.toast('¡Una puerta se ha abierto!', 'good');
    if (this.collapse < 0) {
      this.collapse = COLLAPSE_TIME;
      this.toast(`La Entidad se despierta: ${fmtTime(COLLAPSE_TIME)} para escapar.`, 'warn');
    }
    this.noise(g.x, g.z, 'gate', 999);
  }

  _powerGates() {
    for (const g of this.world.gates) {
      g.powered = true;
      this.audio.play('siren', g.x, g.z, 1);
    }
    for (const gen of this.world.gens) {
      if (!gen.done) { gen.done = true; gen.blocked = true; for (const w of [...gen.workers]) this.endTask(w, false); }
    }
    this.toast('¡Las puertas de salida tienen corriente!', 'good');
  }

  _skillTick(s, dt) {
    s.skillT -= dt;
    if (s.skillT > 0) return;
    s.skillT = 5 + Math.random() * 7;
    if (Math.random() < 0.35) return;
    if (s.ai) {
      const P = s.ai.P;
      if (Math.random() < P.skillCheck) {
        if (Math.random() < P.great) this._skillResult(s, 'great');
      } else this._skillResult(s, 'fail');
    } else if (!this.skill) {
      this.audio.play('skillWarn');
      const zone = this.diff.skillZone;
      const start = 110 + Math.random() * 170;
      this.skill = { t: -0.55, dur: 1.15, start, len: zone, great: Math.max(9, zone * 0.24) };
    }
  }

  _skillResult(s, res) {
    const T = s.task;
    if (!T) return;
    const gen = T.type === 'repair' ? T.target : null;
    if (res === 'great') {
      if (gen) gen.progress = Math.min(0.999, gen.progress + 0.02);
      else if (T.type === 'heal') T.target.healProg += 0.03;
      else if (T.type === 'recover') T.target.recoverProg += 0.03;
      if (s.isPlayer) { this.audio.play('great'); this.ui.flashSkill('¡Genial!', 'great'); }
    } else if (res === 'good') {
      if (s.isPlayer) { this.audio.play('good'); this.ui.flashSkill('Bien', 'good'); }
    } else {
      const x = gen ? gen.x : s.pos.x, z = gen ? gen.z : s.pos.z;
      if (gen) {
        gen.progress = Math.max(0, gen.progress - 0.08);
        gen.shake = 1;
        for (let i = 0; i < 40; i++) {
          this.fx.add.spawn({ x, y: 1.1, z, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 0.7, size: 0.09, color: 0xffe0a0, color1: 0xff3000, alpha: 1, alpha1: 0, gravity: 9 });
        }
        this.audio.play('explode', x, z, 1);
      } else {
        if (T.type === 'heal') T.target.healProg = Math.max(0, T.target.healProg - 0.1);
        if (T.type === 'recover') T.target.recoverProg = Math.max(0, T.target.recoverProg - 0.1);
        this.audio.play('screamF', x, z, 0.4);
      }
      this.noise(x, z, 'fail', 999);
      if (this.role === 'killer') s.auraT = 3;
      if (s.isPlayer) { this.ui.flashSkill('¡Fallo!', 'fail'); this.dmg = Math.max(this.dmg, 0.4); }
    }
  }

  onNightSense(s) {
    if (this.role !== 'survivor') return;
    if (s.isPlayer) {
      this.toast('La Entidad le susurra dónde estás.', 'bad');
      this.audio.play('sense');
      this.dmg = Math.max(this.dmg, 0.6);
    }
  }

  // ------------------------------------------------------------------ player
  _playerControl(dt) {
    const inp = this.input, p = this.player;
    const look = inp.takeLook();
    if (this.settings.auto) { inp.pressed.clear(); return; }
    const sens = 0.0042;
    if (this.role === 'survivor') {
      this.camYaw -= look.x * sens;
      this.camPitch = clamp(this.camPitch + look.y * sens * 0.8, 0.02, 1.15);
    } else {
      this.camYaw -= look.x * sens;
      this.camPitch = clamp(this.camPitch - look.y * sens * 0.8, -1.2, 0.9);
    }
    if (inp.consume('pause')) { this.app.pause(); return; }
    const mv = inp.move();
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -fz, rz = fx;
    const I = p.intent;
    I.mx = fx * mv.y + rx * mv.x;
    I.mz = fz * mv.y + rz * mv.x;
    I.face = null; I.cancel = false;
    const mag = Math.hypot(mv.x, mv.y);
    if (this.role === 'killer') {
      const k = this.killer;
      I.face = this.camYaw;
      if (k.charge <= 0 && !k.task) k.yaw = this.camYaw;
      if (inp.consume('action') || inp.consume('attack')) this.killerAttack(k);
      if (inp.consume('ability')) this.useAbility(k);
      if (inp.consume('secondary')) {
        const c = this.context;
        if (c) this.startTask(k, c.type, c.target);
      }
      return;
    }
    const s = this.survivors[0];
    I.run = mag > 0.62;
    if (inp.consume('secondary')) { this.crouchOn = !this.crouchOn; }
    I.crouch = !!this.crouchOn;
    const tapped = inp.consume('action');
    if (inp.consume('ability')) {
      if (s.def.ability.id === 'flare') this.useAbility(s, this.camYaw);
      else this.useAbility(s);
    }
    if (s.state === 'carried' || s.state === 'trapped') {
      if (tapped) {
        s.wiggleTap = 0.4;
        if (s.state === 'trapped') s.trapEsc += 0.06 + Math.random() * 0.05;
      }
      return;
    }
    if (s.state === 'hooked') {
      if (tapped && s.selfTries > 0 && s.hookCount === 1 && s.hookProgress < 1) {
        s.selfTries--;
        if (Math.random() < 0.06) this._unhook(s, null);
        else { s.hookProgress += 0.12; this.toast(`No lo consigues… (${s.selfTries} intentos)`); }
      }
      return;
    }
    if (!tapped) return;
    if (this.skill && this.skill.t >= 0) { this._resolveSkill(); return; }
    if (s.task || s.state !== 'standing') return;
    const c = this.context;
    if (c) this.startTask(s, c.type, c.target);
  }

  _resolveSkill() {
    const S = this.skill;
    this.skill = null;
    const ang = (S.t / S.dur) * 360;
    const s = this.survivors[0];
    if (ang >= S.start && ang <= S.start + S.great) this._skillResult(s, 'great');
    else if (ang >= S.start && ang <= S.start + S.len) this._skillResult(s, 'good');
    else this._skillResult(s, 'fail');
  }

  _computeContext() {
    const p = this.player;
    const D = (o) => dist(p.pos.x, p.pos.z, o.x ?? o.pos.x, o.z ?? o.pos.z);
    if (this.role === 'killer') {
      const k = this.killer;
      if (k.task || k.stun > 0) return null;
      if (k.carrying) {
        const h = this.world.hooks.filter((h) => !h.victim && D(h) < 2.1).sort((a, b) => D(a) - D(b))[0];
        if (h) return { type: 'hook', target: h, label: 'Colgar' };
        return { type: 'drop', target: null, label: 'Soltar' };
      }
      const dn = this.survivors.filter((s) => s.state === 'downed' && D(s) < 2.0).sort((a, b) => D(a) - D(b))[0];
      if (dn) return { type: 'pickup', target: dn, label: 'Recoger' };
      const pal = this.world.pallets.find((pp) => pp.state === 'down' && D(this.palletCenter(pp)) < 2.7);
      if (pal) return { type: 'break', target: pal, label: 'Romper palé' };
      const gen = this.world.gens.find((g) => !g.done && !g.regress && g.progress > 0.01 && g.workers.size === 0 && this.genDist(g, k.pos.x, k.pos.z) < 1.6);
      if (gen) return { type: 'kick', target: gen, label: 'Patear' };
      return null;
    }
    const s = p;
    if (s.state !== 'standing') return null;
    const k = this.killer;
    const kd = D(k);
    const pal = this.world.pallets.filter((pp) => pp.state === 'up' && D(pp) < 1.9).sort((a, b) => D(a) - D(b))[0];
    const vault = this.world.pallets.find((pp) => pp.state === 'down' && D(this.palletCenter(pp)) < 2.0);
    if (kd < 12) {
      if (pal) return { type: 'drop', target: pal, label: 'Tirar palé' };
      if (vault) return { type: 'vault', target: vault, label: 'Saltar' };
    }
    const others = this.survivors.filter((o) => o !== s);
    const hk = others.find((o) => o.state === 'hooked' && D(o.hook.point) < 2.0);
    if (hk) return { type: 'unhook', target: hk, label: 'Rescatar' };
    const tr = others.find((o) => o.state === 'trapped' && D(o) < 1.7);
    if (tr) return { type: 'free', target: tr, label: 'Liberar' };
    const dn = others.find((o) => o.state === 'downed' && D(o) < 1.9);
    if (dn) return { type: 'recover', target: dn, label: 'Levantar' };
    const inj = others.find((o) => o.injured && D(o) < 1.9);
    if (inj) return { type: 'heal', target: inj, label: 'Curar' };
    const gate = this.world.gates.find((g) => g.powered && !g.open && D(g.lever) < 1.4);
    if (gate) return { type: 'gate', target: gate, label: 'Abrir puerta' };
    const gen = this.world.gens.find((g) => !g.done && this.genDist(g, s.pos.x, s.pos.z) < 1.15);
    if (gen) return { type: 'repair', target: gen, label: 'Reparar' };
    if (pal) return { type: 'drop', target: pal, label: 'Tirar palé' };
    if (vault) return { type: 'vault', target: vault, label: 'Saltar' };
    return null;
  }

  // ------------------------------------------------------------------ per-actor rules
  _survivorRules(s, dt) {
    const H = this.world.half;
    if (s.state === 'standing') {
      if (Math.abs(s.pos.z) > H + 3.2) {
        s.state = 'escaped';
        s.outcome = 'Escapó';
        this.audio.play('escape', s.pos.x, s.pos.z, 1);
        this.toast(`${s.name} ha escapado.`, s.isPlayer ? 'good' : '');
        this._playerOut(s);
        return;
      }
      const running = s.speedNow > 3.0 && !s.crouch && s.invis <= 0;
      if (running) {
        s.markT -= dt;
        if (s.markT <= 0) {
          s.markT = 0.32 / s.def.markMul;
          this._addMark(s, false);
        }
      }
      if (s.injured && s.invis <= 0) {
        s.bloodT -= dt;
        if (s.bloodT <= 0) { s.bloodT = 1.3; this._addMark(s, true); }
        s.groanT -= dt;
        if (s.groanT <= 0) { s.groanT = 3 + Math.random() * 3; this.audio.play('groan', s.pos.x, s.pos.z, s.def.markMul < 1 ? 0.3 : 0.6); }
      }
      if (s.task && s.task.type === 'repair') this._skillTick(s, dt);
      // traps
      for (const t of this.traps) {
        if (!t.armed) continue;
        const d = dist(t.x, t.z, s.pos.x, s.pos.z);
        if (s.ai && !t.known && d < s.ai.P.trapSpot) {
          t.known = true;
          this.physics.setExtra(t.x, t.z, 0.6, true);
        }
        if (d < 0.42 && !s.vault) { this._trapCatch(s, t); break; }
      }
      // footsteps
      if (s.speedNow > 1.5 && s.invis <= 0) {
        s.stepT -= dt * s.speedNow;
        if (s.stepT <= 0) { s.stepT = 1.6; if (!s.isPlayer) this.audio.play('step', s.pos.x, s.pos.z, s.crouch ? 0.15 : 0.5); }
      }
    } else if (s.state === 'downed') {
      s.bleed += dt / BLEEDOUT_TIME;
      if (s.bleed >= 1) {
        this._kill(s, 'Desangrado');
        this.toast(`${s.name} se ha desangrado.`);
      }
      s.bloodT -= dt;
      if (s.bloodT <= 0) { s.bloodT = 1.6; this._addMark(s, true); }
    } else if (s.state === 'carried') {
      const k = this.killer;
      if (s.ai) s.wiggle += (dt / 16) * s.ai.P.wiggle;
      else if (s.wiggleTap > 0) s.wiggle += dt / 13;
      s.wiggleTap = Math.max(0, s.wiggleTap - dt);
      if (s.wiggle >= 1) {
        this._releaseCarried(k, true);
        k.stun = Math.max(k.stun, 2.5);
        this.audio.play('stun', k.pos.x, k.pos.z, 0.8);
      }
    } else if (s.state === 'trapped') {
      if (s.ai) s.trapEsc += dt * 0.12 * s.ai.P.wiggle;
      if (s.trapEsc >= 1) this._freeTrap(s);
    }
  }

  _trapCatch(s, t) {
    t.armed = false;
    t.victim = s;
    s.trap = t;
    s.trapEsc = 0;
    if (s.task) this.endTask(s, false);
    s.health -= 1;
    this.audio.play('trap', t.x, t.z, 1);
    this.audio.play(s.def.gender === 'f' ? 'screamF' : 'scream', t.x, t.z, 1);
    s.pos.x = t.x; s.pos.z = t.z;
    s.vel.set(0, 0, 0);
    for (let i = 0; i < 20; i++) {
      this.fx.norm.spawn({ x: t.x, y: 0.3, z: t.z, vx: (Math.random() - 0.5) * 2.5, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.5, life: 0.8, size: 0.1, color: 0x8a0a0a, alpha: 1, alpha1: 0.6, gravity: 9, floor: 0.02 });
    }
    if (s.health <= 0) {
      s.health = 0;
      s.state = 'downed';
      this._removeTrap(t);
      s.trap = null;
    } else {
      s.state = 'trapped';
    }
    this.noise(t.x, t.z, 'trap', 999);
    if (this.role === 'killer') { s.auraT = 5; this.toast(`${s.name} ha caído en un cepo.`); }
    if (s.isPlayer) this.toast('¡Cepo! Toca rápido para soltarte.', 'bad');
  }

  _addMark(s, blood) {
    this.marks.push({ x: s.pos.x + (Math.random() - 0.5) * 0.7, z: s.pos.z + (Math.random() - 0.5) * 0.7, t: this.time, owner: s, rot: Math.random() * 6.28, blood });
    if (this.marks.length > 340) this.marks.shift();
  }

  _killerRules(k, dt) {
    const inChase = k.ai ? k.ai.state === 'chase' : this.chase > 0.45;
    k.chaseT = inChase && !k.carrying ? k.chaseT + dt : Math.max(0, k.chaseT - dt * 3);
    const tier = Math.min(3, Math.floor(k.chaseT / 12));
    if (tier > k.bloodlust && k.isPlayer) this.toast(`Sed de sangre ${'I'.repeat(tier)}`);
    k.bloodlust = tier;
    const A = k.attack;
    if (A && A.phase === 'lunge' && !A.hit) {
      for (const s of this.survivors) {
        if (!s.hittable || s.vault) continue;
        const dx = s.pos.x - k.pos.x, dz = s.pos.z - k.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.5 + s.radius) continue;
        if (d > 0.8 && Math.abs(angleDiff(k.yaw, Math.atan2(dx, dz))) > 0.8) continue;
        if (!this.physics.los(k.pos.x, k.pos.z, s.pos.x, s.pos.z, 0.95)) continue;
        A.hit = true;
        A.t = 0;
        this._hitSurvivor(k, s);
        break;
      }
    }
    if (k.speedNow > 1 && k.stun <= 0) {
      k.stepT -= dt * k.speedNow;
      if (k.stepT <= 0) {
        k.stepT = 2.2;
        if (!k.isPlayer && !(k.cloak > 0)) this.audio.play('kstep', k.pos.x, k.pos.z, 0.9);
      }
    }
  }

  _separate() {
    const all = [...this.survivors.filter((s) => s.state === 'standing' && !s.vault), this.killer];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (a.isKiller && b.charge > 0 || b.isKiller && b.charge > 0) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz), m = a.radius + b.radius;
        if (d >= m || d < 1e-4) continue;
        const push = (m - d) / d;
        const wa = b.isKiller ? 0.8 : a.isKiller ? 0.2 : 0.5;
        a.pos.x -= dx * push * wa; a.pos.z -= dz * push * wa;
        b.pos.x += dx * push * (1 - wa); b.pos.z += dz * push * (1 - wa);
      }
    }
  }

  _gens(dt) {
    for (const gen of this.world.gens) {
      if (gen.done) continue;
      const n = gen.workers.size;
      if (n > 0) {
        gen.regress = false;
        const eff = [0, 1, 0.9, 0.8, 0.7][Math.min(4, n)];
        let rate = 0;
        for (const w of gen.workers) {
          const r = (w.def.repairMul * eff) / GEN_TIME;
          rate += r;
          w.stats.repair += r * dt;
        }
        gen.progress += rate * dt;
        gen.humT = (gen.humT || 0) - dt;
        if (gen.humT <= 0) { gen.humT = 0.6; this.audio.play('gen', gen.x, gen.z, 0.7); }
      } else if (gen.regress) {
        gen.progress = Math.max(0, gen.progress - dt * 0.004);
        if (gen.progress <= 0) gen.regress = false;
      }
      if (gen.progress >= 1) this._genDone(gen);
    }
  }

  _genDone(gen) {
    gen.progress = 1;
    gen.done = true;
    gen.regress = false;
    for (const w of [...gen.workers]) this.endTask(w, true);
    this.gensDone++;
    this.audio.play('genDone', gen.x, gen.z, 1);
    for (let i = 0; i < 50; i++) {
      this.fx.add.spawn({ x: gen.x, y: 2.5, z: gen.z, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 4, vz: (Math.random() - 0.5) * 4, life: 1.2, size: 0.1, color: 0xfff0b0, color1: 0xffa020, alpha: 1, alpha1: 0, gravity: 5 });
    }
    this.noise(gen.x, gen.z, 'gen', 999);
    const left = Math.max(0, GENS_REQUIRED - this.gensDone);
    if (left > 0) this.toast(`Generador reparado. Faltan ${left}.`, this.role === 'survivor' ? 'good' : '');
    if (this.gensDone >= GENS_REQUIRED && !this.world.gates[0].powered) this._powerGates();
  }

  _hooks(dt) {
    for (const s of this.survivors) {
      if (s.state !== 'hooked') continue;
      const stage = s.hookProgress < 1 ? 0 : 1;
      const before = s.hookProgress;
      s.hookProgress += dt / HOOK_STAGE_TIME[stage];
      if (before < 1 && s.hookProgress >= 1) this.toast(`${s.name} lucha contra la Entidad.`, s.isPlayer ? 'bad' : '');
      if (s.hookProgress >= 2) this._sacrifice(s);
    }
  }

  _gates(dt) {
    if (this.collapse > 0) {
      this.collapse -= dt;
      if (this.collapse <= 0) {
        this.collapse = 0;
        for (const s of this.survivors) if (!s.out) this._kill(s, 'La Entidad');
        this.toast('La Entidad reclama a los rezagados.', 'bad');
      }
    }
  }

  _trapsTick(dt) {
    for (const t of this.traps) {
      const jaws = t.mesh.userData.jaws;
      const target = t.armed ? 1 : 0;
      t.closeAnim = damp(t.closeAnim, target, 20, dt);
      for (const j of jaws) j.g.rotation.x = j.s * -1.35 * t.closeAnim;
      if (t.victim && t.victim.state !== 'trapped') this._removeTrap(t);
    }
    for (const s of this.survivors) {
      if (s.state === 'trapped' && s.trap) { s.pos.x = s.trap.x; s.pos.z = s.trap.z; }
    }
  }

  _marksTick() {
    if (!this.markMesh.visible) return;
    const life = this.killer.def.markLife;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    const c = new THREE.Color();
    let n = 0;
    for (let i = this.marks.length - 1; i >= 0 && n < 360; i--) {
      const mk = this.marks[i];
      const age = this.time - mk.t;
      const L = mk.blood ? 9 : life;
      if (age > L) continue;
      if (dist(mk.x, mk.z, this.killer.pos.x, this.killer.pos.z) > 40) continue;
      e.set(0, mk.rot, 0);
      q.setFromEuler(e);
      v.set(mk.x, 0.03, mk.z);
      sc.setScalar(mk.blood ? 0.6 : 1);
      m.compose(v, q, sc);
      this.markMesh.setMatrixAt(n, m);
      const a = Math.max(0, 1 - age / L);
      if (mk.blood) c.setRGB(0.5 * a, 0.02 * a, 0.02 * a);
      else c.setRGB(1.0 * a, 0.12 * a, 0.08 * a);
      this.markMesh.setColorAt(n, c);
      n++;
    }
    this.markMesh.count = n;
    this.markMesh.instanceMatrix.needsUpdate = true;
    if (this.markMesh.instanceColor) this.markMesh.instanceColor.needsUpdate = true;
  }

  _endCheck(dt) {
    if (this.ended) {
      this.endT -= dt;
      if (this.endT <= 0 && !this.resultsShown) { this.resultsShown = true; this.app.showResults(this.summary()); }
      return;
    }
    if (this.survivors.every((s) => s.out)) {
      this.ended = true;
      this.endT = 2.5;
    }
  }

  finishNow() {
    if (this.resultsShown) return;
    this.ended = true;
    this.resultsShown = true;
    this.app.showResults(this.summary());
  }

  summary() {
    const k = this.killer;
    const kills = this.survivors.filter((s) => s.state === 'dead').length;
    const escaped = this.survivors.filter((s) => s.state === 'escaped').length;
    let title, sub, mood;
    if (this.role === 'killer') {
      if (kills === 4) { title = 'Victoria implacable'; mood = 'win'; }
      else if (kills === 3) { title = 'Victoria'; mood = 'win'; }
      else if (kills === 2) { title = 'Empate'; mood = 'tie'; }
      else { title = 'Derrota'; mood = 'lose'; }
      sub = `${kills} de 4 sacrificados · ${k.stats.hooks} ganchos · ${k.stats.hits} golpes`;
    } else {
      const me = this.survivors[0];
      if (me.state === 'escaped') { title = 'Has escapado'; mood = 'win'; }
      else if (me.state === 'dead') { title = me.outcome === 'Sacrificado' ? 'Sacrificado' : 'Has muerto'; mood = 'lose'; }
      else { title = 'Partida abandonada'; mood = 'tie'; }
      sub = `${escaped} de 4 escaparon · ${this.gensDone} generadores reparados`;
    }
    const rows = this.survivors.map((s) => ({
      name: s.def.full, role: s.def.role, you: s.isPlayer, color: s.def.colors.shirt,
      outcome: s.outcome || (s.state === 'escaped' ? 'Escapó' : s.state === 'dead' ? 'Muerto' : 'En juego'),
      detail: [
        `${s.stats.repair.toFixed(1).replace('.', ',')} gen. reparados`,
        plural(s.stats.rescues, 'rescate', 'rescates'),
        plural(s.stats.heals, 'cura', 'curas'),
        plural(s.stats.stuns, 'aturdimiento', 'aturdimientos'),
      ].join(' · '),
      good: s.state === 'escaped',
    }));
    return {
      title, sub, mood, rows, killer: k.name, killerYou: k.isPlayer,
      killerDetail: [
        plural(k.stats.hits, 'golpe', 'golpes'),
        plural(k.stats.hooks, 'gancho', 'ganchos'),
        plural(k.stats.breaks, 'palé roto', 'palés rotos'),
        plural(k.stats.kicks, 'patada', 'patadas'),
        `aturdido ${k.stats.stunned === 1 ? '1 vez' : `${k.stats.stunned} veces`}`,
      ].join(' · '),
      diff: this.diff.name, time: fmtTime(this.time),
    };
  }

  // ------------------------------------------------------------------ frame
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05) * this.timeScale;
    this.time += dt;
    if (!this.ended || this.endT > 0) {
      this._playerControl(dt);
      for (const s of this.survivors) if (s.ai) s.ai.update(dt);
      if (this.killer.ai) this.killer.ai.update(dt);
      for (const s of this.survivors) s.update(dt);
      this.killer.update(dt);
      this._separate();
      this._killerRules(this.killer, dt);
      for (const s of this.survivors) this._survivorRules(s, dt);
      this._tasks(dt);
      this._gens(dt);
      this._hooks(dt);
      this._gates(dt);
      this._trapsTick(dt);
      this._skillUpdate(dt);
    }
    this.context = this._computeContext();
    this._endCheck(dt);
    for (const s of this.survivors) s.animate(dt);
    this.killer.animate(dt);
    this._visuals(dt);
    this._camera(dt);
    this.world.update(dt, this._focus(), this.camera, this.fx);
    this._flashLights(dt);
    const scale = (this.app.renderer.domElement.height * 0.5) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.fx.add.update(dt, scale);
    this.fx.norm.update(dt, scale);
    this._marksTick();
    this._audio(dt);
    this._hud();
  }

  _skillUpdate(dt) {
    const S = this.skill;
    if (!S) return;
    const s = this.survivors[0];
    if (!s.task || !['repair', 'heal', 'recover'].includes(s.task.type)) { this.skill = null; return; }
    S.t += dt;
    if (S.t > S.dur) { this.skill = null; this._skillResult(s, 'fail'); }
  }

  _focus() {
    if (this.role === 'killer') return this.killer.pos;
    const s = this.spectate || this.survivors[0];
    if (s.state === 'carried') return this.killer.pos;
    return s.pos;
  }

  _visuals(dt) {
    const k = this.killer;
    const pl = this.role === 'survivor' ? this.survivors[0] : null;
    // killer visibility
    if (!k.isPlayer) {
      if (k.cloak > 0) k.rig.setOpacity(0.05 + Math.abs(Math.sin(this.time * 3)) * 0.04);
      else if (k.uncloak > 0) k.rig.setOpacity(0.1 + (1 - k.uncloak / 0.5) * 0.9);
      else k.rig.setOpacity(1);
    }
    for (const s of this.survivors) {
      if (s.invis > 0) s.rig.setOpacity(s === pl ? 0.35 : this.role === 'killer' ? 0.07 : 0.3);
      else s.rig.setOpacity(1);
      s.auraT = Math.max(0, (s.auraT || 0) - dt);
      let aura = null;
      if (this.role === 'survivor') {
        if (s !== pl && ['hooked', 'downed', 'carried', 'trapped'].includes(s.state)) aura = AURA_ALLY;
        else if (s !== pl && s.standing && dist(s.pos.x, s.pos.z, this.camera.position.x, this.camera.position.z) > 26) aura = 0x7fb4ff;
      } else if (s.auraT > 0) aura = AURA_KILLER;
      s.rig.setAura(aura, aura === 0x7fb4ff ? 0.25 : 0.55);
    }
    // red stain
    const sp = this.redStain;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const ahead = k.isPlayer ? 1.1 : 0.3;
    sp.position.set(k.pos.x + fx * ahead, k.isPlayer ? 2.3 : 2.0, k.pos.z + fz * ahead);
    sp.target.position.set(k.pos.x + fx * 7, 0, k.pos.z + fz * 7);
    sp.intensity = k.cloaked ? 0 : k.isPlayer ? 8 : 34;
    // viewmodel
    if (this.vm) {
      let rx = 0, ry = 0, px = 0.3, py = -0.34, pz = -0.5;
      const bob = Math.sin(this.time * 8) * Math.min(1, k.speedNow / 4) * 0.02;
      py += bob; px += bob * 0.5;
      if (k.attack && k.attack.phase === 'lunge') {
        const t = 1 - k.attack.t / 0.38;
        rx = t < 0.35 ? 0.9 * (t / 0.35) : 0.9 - 2.4 * ((t - 0.35) / 0.65);
        ry = t < 0.35 ? -0.4 : -0.4 + 1.2 * ((t - 0.35) / 0.65);
        px -= t * 0.2;
      } else if (k.attack && k.attack.hit) {
        rx = -0.3; ry = 0.6; py -= 0.1;
      } else if (k.carrying) { py -= 0.12; rx = -0.2; }
      this.vm.rotation.set(rx, ry, 0);
      this.vm.position.set(px, py, pz);
      this.vm.visible = !(k.cloak > 0);
    }
    this.dmg = Math.max(0, this.dmg - dt * 1.4);
  }

  // Flare bursts borrow the first pooled point light after the world assigned them.
  _flashLights(dt) {
    for (const f of this.flashes) f.t -= dt;
    this.flashes = this.flashes.filter((f) => f.t > 0);
    const L = this.world.pool[0];
    if (!this.flashes.length || !L) return;
    const f = this.flashes[0];
    L.position.set(f.x, f.y, f.z);
    L.color.setHex(0xfff2e0);
    L.intensity = 140 * (f.t / 0.6);
    L.distance = 26;
  }

  _camera(dt) {
    const cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    const jx = (Math.random() - 0.5) * sh * 0.25, jy = (Math.random() - 0.5) * sh * 0.25;
    const aspect = window.innerWidth / window.innerHeight;
    cam.fov = aspect < 1 ? 82 : 68;
    if (this.role === 'killer') {
      const k = this.killer;
      const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
      const bob = Math.sin(this.time * 7.5) * Math.min(1, k.speedNow / 4) * 0.05;
      let pitch = this.camPitch;
      if (k.stun > 0) pitch += Math.sin(this.time * 20) * 0.05 + 0.25;
      cam.position.set(k.pos.x + fx * 0.22, 2.25 + bob, k.pos.z + fz * 0.22);
      cam.rotation.set(pitch + jy, this.camYaw + Math.PI + jx, 0, 'YXZ');
      cam.updateProjectionMatrix();
      return;
    }
    if (this.spectateT > 0) {
      this.spectateT -= dt;
      if (this.spectateT <= 0) this.nextSpectate();
    }
    const s = this.spectate || this.survivors[0];
    let tx = s.pos.x, tz = s.pos.z, ty = 1.5;
    if (s.state === 'downed') ty = 0.75;
    else if (s.state === 'carried') { tx = this.killer.pos.x; tz = this.killer.pos.z; ty = 2.0; }
    else if (s.state === 'hooked' && s.hook) { tx = s.hook.point.x; tz = s.hook.point.z; ty = 1.8; }
    else if (s.state === 'trapped') ty = 1.1;
    else if (s.crouch) ty = 1.05;
    if (s.vault) ty += 0.3;
    const yaw = this.camYaw, pitch = this.camPitch;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = -fz, rz = fx;
    const side = 0.55;
    const D = s.state === 'hooked' ? 4.8 : 4.0;
    const ax = tx + rx * side, az = tz + rz * side;
    let cx = ax - fx * Math.cos(pitch) * D, cz = az - fz * Math.cos(pitch) * D;
    let cy = ty + Math.sin(pitch) * D;
    const t = this.physics.raycast(ax, az, cx, cz, Math.min(cy, 2.4));
    if (t <= 1) {
      const f = Math.max(0.12, t - 0.1);
      cx = ax + (cx - ax) * f; cz = az + (cz - az) * f;
      cy = ty + (cy - ty) * Math.max(0.5, f);
    }
    cy = Math.max(0.3, cy);
    const k = 1 - Math.exp(-dt * 16);
    this.camPos.x += (cx - this.camPos.x) * k;
    this.camPos.y += (cy - this.camPos.y) * k;
    this.camPos.z += (cz - this.camPos.z) * k;
    if (this.time < 0.1) this.camPos.set(cx, cy, cz);
    cam.position.set(this.camPos.x + jx, this.camPos.y + jy, this.camPos.z);
    cam.lookAt(ax + fx * 2, ty - 0.1 - (pitch - 0.3) * 0.6, az + fz * 2);
    if (this.fill) this.fill.position.set(tx - fx * 1.2, ty + 1.4, tz - fz * 1.2);
    cam.updateProjectionMatrix();
  }

  nextSpectate() {
    const alive = this.survivors.filter((s) => !s.out && !s.isPlayer);
    if (!alive.length) return;
    const i = alive.indexOf(this.spectate);
    this.spectate = alive[(i + 1) % alive.length];
  }

  _audio(dt) {
    const a = this.audio, k = this.killer;
    a.setListener(this.camera.position.x, this.camera.position.z, this.role === 'killer' ? this.camYaw : this.camYaw);
    if (this.role === 'survivor') {
      const s = this.spectate || this.survivors[0];
      const d = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
      const terror = !k.cloaked && !s.out && d < k.terror ? 1 - d / k.terror : 0;
      a.heartbeat(terror, dt);
      const chased = k.ai && k.ai.state === 'chase' && k.ai.target === s && k.ai.chasing;
      this.chase = damp(this.chase, chased ? 1 : 0, chased ? 2 : 0.5, dt);
      a.setChase(this.chase);
      this.terror = terror;
    } else {
      let near = false;
      for (const s of this.survivors) {
        if (!s.hittable) continue;
        const d = dist(s.pos.x, s.pos.z, k.pos.x, k.pos.z);
        if (d < 16 && this.killerCanSee(k, s, { vision: 30, fov: 110 })) { near = true; break; }
      }
      this.chase = damp(this.chase, near ? 0.8 : 0, near ? 2 : 0.4, dt);
      a.setChase(this.chase);
      this.terror = 0;
    }
  }

  // ------------------------------------------------------------------ HUD
  _hud() {
    const ui = this.ui, k = this.killer;
    const st = this._hudState || (this._hudState = {});
    st.role = this.role;
    st.team = this.survivors.map((s) => ({
      name: s.name, state: s.state, health: s.health, you: s.isPlayer, color: s.def.colors.shirt,
      hook: s.state === 'hooked' ? s.hookProgress / 2 : s.hookCount ? Math.min(1, s.hookCount / 3) : 0,
      hooks: s.hookCount || 0,
    }));
    st.gensLeft = Math.max(0, GENS_REQUIRED - this.gensDone);
    st.powered = this.world.gates[0].powered;
    st.collapse = this.collapse > 0 ? fmtTime(this.collapse) : null;
    st.kills = k.stats.kills;
    const p = this.player;
    st.ability = { name: p.def.ability.name, cd: p.cd, max: p.def.ability.cd, active: false };
    if (this.role === 'killer') {
      if (k.def.ability.id === 'cloak') st.ability.active = k.cloak > 0;
      if (k.def.ability.id === 'trap') st.ability.count = `${this.traps.length}/4`;
      st.action = { label: k.carrying ? 'Cargando' : 'Atacar', disabled: !!(k.carrying || k.attack || k.stun > 0 || k.cloak > 0) };
      st.secondary = this.context ? { label: this.context.label } : null;
      st.stunned = k.stun > 0;
    } else {
      const s = this.survivors[0];
      const c = this.context;
      let label = c ? c.label : '';
      if (s.state === 'carried') label = 'Forcejear';
      else if (s.state === 'trapped') label = 'Liberarse';
      else if (s.state === 'hooked') label = s.hookCount === 1 && s.hookProgress < 1 && s.selfTries > 0 ? 'Soltarse' : '';
      if (this.skill && this.skill.t >= 0) label = '¡Ahora!';
      st.action = { label: label || (s.task ? 'Trabajando' : 'Acción'), disabled: !label && !s.task, hot: !!(this.skill && this.skill.t >= 0) };
      st.secondary = { label: this.crouchOn ? 'De pie' : 'Agachar', on: !!this.crouchOn };
      st.ability.active = s.sprint > 0 || s.invis > 0;
      if (s.def.ability.id === 'medkit') st.ability.disabled = s.health === 2 && !this.survivors.some((o) => o !== s && o.state === 'downed' && dist(o.pos.x, o.pos.z, s.pos.x, s.pos.z) < 3);
    }
    st.progress = this._progressInfo();
    st.skill = this.skill && this.skill.t >= 0 ? this.skill : null;
    st.status = this._statusText();
    st.dmg = this.dmg;
    st.terror = this.terror || 0;
    st.blind = this.role === 'killer' ? Math.min(1, k.blind / 1.5) : 0;
    st.spectating = !!this.spectate || (this.role === 'survivor' && this.survivors[0].out);
    st.spectateName = this.spectate ? this.spectate.name : '';
    st.markers = this._markers();
    ui.hud(st);
  }

  _progressInfo() {
    if (this.role === 'killer') {
      const k = this.killer;
      if (k.task) {
        const L = { pickup: 'Recogiendo', hook: 'Colgando', break: 'Rompiendo palé', kick: 'Pateando generador', trap: 'Colocando cepo' }[k.task.type];
        return { label: L, value: k.task.t / k.task.dur, color: 'blood' };
      }
      if (k.carrying) return { label: `Forcejea: ${k.carrying.name}`, value: k.carrying.wiggle, color: 'warn' };
      return null;
    }
    const s = this.spectate || this.survivors[0];
    const T = s.task;
    if (T) {
      switch (T.type) {
        case 'repair': return { label: 'Reparando generador', value: T.target.progress, color: 'ember' };
        case 'heal': return { label: `Curando a ${T.target.name}`, value: T.target.healProg, color: 'ally' };
        case 'recover': return { label: `Levantando a ${T.target.name}`, value: T.target.recoverProg, color: 'ally' };
        case 'unhook': return { label: `Rescatando a ${T.target.name}`, value: T.t / T.dur, color: 'ally' };
        case 'free': return { label: `Liberando a ${T.target.name}`, value: T.t / T.dur, color: 'ally' };
        case 'gate': return { label: 'Abriendo la puerta', value: T.target.progress, color: 'ember' };
        default:
      }
    }
    if (s.state === 'carried') return { label: 'Forcejeo', value: s.wiggle, color: 'warn' };
    if (s.state === 'trapped') return { label: 'Abriendo el cepo', value: s.trapEsc, color: 'warn' };
    if (s.state === 'downed') {
      if (s.recoverProg > 0) return { label: 'Te están levantando', value: s.recoverProg, color: 'ally' };
      return { label: 'Desangrándote', value: 1 - s.bleed, color: 'blood' };
    }
    if (s.state === 'hooked') {
      const stage = s.hookProgress < 1 ? 0 : 1;
      return { label: stage ? 'Luchando contra la Entidad' : 'En el gancho', value: 1 - (s.hookProgress - stage), color: 'blood' };
    }
    if (s.healProg > 0 && s.injured) return { label: 'Te están curando', value: s.healProg, color: 'ally' };
    return null;
  }

  _statusText() {
    if (this.role === 'killer') {
      const k = this.killer;
      if (k.stun > 0) return 'Aturdido';
      if (k.cloak > 0) return `Velo · ${Math.ceil(k.cloak)} s`;
      if (k.charge > 0) return 'Embestida';
      if (k.bloodlust) return `Sed de sangre ${'I'.repeat(k.bloodlust)}`;
      return '';
    }
    const s = this.survivors[0];
    if (this.spectate) return '';
    switch (s.state) {
      case 'downed': return 'Derribado · arrástrate lejos del asesino';
      case 'hooked': return s.hookProgress < 1 ? 'Colgado · espera un rescate' : 'La Entidad te reclama';
      case 'carried': return 'Toca Forcejear sin parar';
      case 'trapped': return 'Atrapado · toca Liberarse';
      default:
    }
    if (s.invis > 0) return `Sombra · ${Math.ceil(s.invis)} s`;
    if (s.sprint > 0) return 'Carrera';
    if (s.injured) return 'Herido';
    return '';
  }

  _markers() {
    const out = this._mk || (this._mk = []);
    out.length = 0;
    const cam = this.camera;
    const v = this._v || (this._v = new THREE.Vector3());
    const W = window.innerWidth, H = window.innerHeight;
    const add = (x, y, z, kind, text, maxD = 1e9, edge = false) => {
      const d = dist(x, z, cam.position.x, cam.position.z);
      if (d > maxD) return;
      v.set(x, y, z).project(cam);
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const behind = v.z > 1;
      if (behind || sx < 0 || sx > W || sy < 0 || sy > H) {
        if (!edge) return;
        if (behind) { sx = W - sx; sy = H - sy; }
        sx = clamp(sx, 30, W - 30); sy = clamp(sy, 70, H - 40);
      }
      out.push({ x: sx, y: sy, kind, text, d: Math.round(d) });
    };
    if (this.role === 'survivor') {
      for (const g of this.world.gens) if (!g.done) add(g.x, 2.4, g.z, g.regress ? 'gen bad' : 'gen', `${Math.floor(g.progress * 100)}%`, 34);
      for (const s of this.survivors) if (s.state === 'hooked' && !s.isPlayer) add(s.hook.point.x, 3.1, s.hook.point.z, 'hook', s.name, 1e9, true);
      for (const g of this.world.gates) if (g.powered) add(g.lever.x, 2.2, g.lever.z, g.open ? 'exit open' : 'exit', g.open ? 'Salida' : `${Math.floor(g.progress * 100)}%`, 1e9, true);
    } else {
      const k = this.killer;
      for (const g of this.world.gens) if (!g.done) add(g.x, 2.4, g.z, g.regress ? 'gen bad' : 'gen dim', '', 55);
      if (k.carrying) for (const h of this.world.hooks) if (!h.victim) add(h.x, 3.2, h.z, 'hook free', '', 24, true);
      this.pings = this.pings.filter((p) => this.time - p.t < 3.5);
      for (const p of this.pings) add(p.x, 1.6, p.z, `ping ${p.kind}`, '', 1e9, true);
    }
    return out;
  }

  dispose() {
    this.audio.setChase(0);
    this.audio.stopAmbient();
    this.world.dispose();
    this.fx.add.dispose();
    this.fx.norm.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose && m.dispose());
    });
  }
}
