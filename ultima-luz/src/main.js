// Bootstrap: renderer, menu diorama, match lifecycle and the frame loop.
import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { Post } from './postfx.js';
import { World } from './world.js';
import { Game } from './game.js';
import { Particles } from './particles.js';
import { getTextures } from './textures.js';
import { makeSurvivorRig, makeKillerRig, animateRig } from './models.js';
import { QUALITY, SURVIVORS, KILLERS } from './config.js';

const KEY = 'ultima-luz-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const save = (S) => {
  try {
    const { role, survChar, killerChar, diff, quality, sound, sens } = S;
    localStorage.setItem(KEY, JSON.stringify({ role, survChar, killerChar, diff, quality, sound, sens }));
  } catch (e) { /* storage unavailable */ }
};
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

const coarse = window.matchMedia?.('(pointer: coarse)').matches;
const DEFAULTS = { role: 'survivor', survChar: 'marco', killerChar: 'carnicero', diff: 'normal', quality: coarse ? 'media' : 'alta', sound: true, sens: 1 };

class App {
  constructor(restore = {}) {
    const url = new URLSearchParams(location.search);
    this.S = { ...DEFAULTS, ...load(), ...restore };
    for (const k of ['role', 'diff', 'quality']) if (url.get(k)) this.S[k] = url.get(k);
    if (url.get('char')) { if (this.S.role === 'killer') this.S.killerChar = url.get('char'); else this.S.survChar = url.get('char'); }
    if (!QUALITY[this.S.quality]) this.S.quality = 'media';
    this.S.charId = this.S.role === 'killer' ? this.S.killerChar : this.S.survChar;
    this.auto = url.get('auto') === '1';
    this.timeScale = parseFloat(url.get('ts') || '1');

    this.canvas = document.getElementById('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.audio = new AudioEngine();
    this.audio.muted = !this.S.sound;
    this.ui = new UI();
    this.input = new Input(this.canvas, document.getElementById('joy'), document.getElementById('joyKnob'));
    this.input.sens = this.S.sens;
    document.getElementById('sens').value = this.S.sens;
    this.input.bindButton(document.getElementById('btnAction'), 'action');
    this.input.bindButton(document.getElementById('btnAbility'), 'ability');
    this.input.bindButton(document.getElementById('btnSecondary'), 'secondary');
    this.ui.setSound(this.S.sound);
    this._wire();

    this.game = null;
    this.paused = false;
    this.last = performance.now();
    this.t = 0;
    this.slow = 0;
    this.applyQuality(false);
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.game && !this.paused && !this.game.ended) this.pause(); });
    this.menu();
    requestAnimationFrame((t) => this.loop(t));
    if (url.get('start') === '1') this.startMatch();
    window.__app = this;
  }

  _wire() {
    const ui = this.ui, S = this.S;
    ui.on('play', () => { this.audio.init(); this.audio.play('ui'); ui.buildSetup(S); ui.show('setup'); this.menuMode = 'setup'; this._showcase(); });
    ui.on('how', () => { this.audio.init(); ui.buildSetup(S); ui.show('setup'); this.menuMode = 'setup'; this._showcase(); document.getElementById('how').open = true; });
    ui.on('back', () => { ui.show('title'); this.menuMode = 'title'; });
    ui.on('change', () => { save(S); this._showcase(); this.audio.play('ui'); });
    ui.on('quality', () => { save(S); this.applyQuality(true); });
    ui.on('start', () => this.startMatch());
    ui.on('sound', () => { S.sound = !S.sound; this.audio.setMuted(!S.sound); ui.setSound(S.sound); save(S); });
    ui.on('pause', () => this.pause());
    ui.on('resume', () => this.resume());
    ui.on('quit', () => this.toMenu());
    ui.on('again', () => this.startMatch());
    ui.on('menu', () => this.toMenu());
    ui.on('specNext', () => this.game?.nextSpectate());
    ui.on('specEnd', () => this.game?.finishNow());
    ui.on('sens', (v) => { S.sens = v; this.input.sens = v; save(S); });
  }

  get quality() { return QUALITY[this.S.quality]; }

  applyQuality(rebuild) {
    const q = this.quality;
    this.renderer.shadowMap.enabled = !!q.shadows;
    this.post?.dispose();
    this.post = new Post(this.renderer, q);
    this.ui.setPostFallback(!q.post);
    this.pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.resize();
    if (rebuild && !this.game) this.menu(true);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.pr);
    for (const cam of [this.menuCam, this.game?.camera]) {
      if (!cam) continue;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  // ---------------------------------------------------------------- menu
  menu(keepMode = false) {
    this._disposeMenu();
    const scene = this.menuScene = new THREE.Scene();
    this.menuCam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 600);
    scene.add(this.menuCam);
    this.menuWorld = new World(scene, this.quality, { diorama: true, seed: 7 }).build();
    this.menuFx = { add: new Particles(scene, 500, true, getTextures().glow) };
    this.menuMode = keepMode ? this.menuMode || 'title' : 'title';
    this._showcase();
    this.input.enabled = false;
    if (!keepMode) this.ui.show('title');
  }

  _showcase() {
    if (!this.menuScene) return;
    if (this.showRig) this.menuScene.remove(this.showRig.root);
    const S = this.S;
    const def = S.role === 'killer' ? KILLERS.find((k) => k.id === S.charId) : SURVIVORS.find((s) => s.id === S.charId);
    this.showRig = S.role === 'killer' ? makeKillerRig(def || KILLERS[0]) : makeSurvivorRig(def || SURVIVORS[0]);
    this.showRig.root.position.set(0, 0, 0.4);
    this.menuScene.add(this.showRig.root);
  }

  _disposeMenu() {
    if (!this.menuScene) return;
    this.menuWorld.dispose();
    this.menuFx.add.dispose();
    this.menuScene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
    });
    this.menuScene = null;
    this.showRig = null;
  }

  _menuFrame(dt) {
    const cam = this.menuCam, t = this.t;
    const portrait = window.innerWidth < window.innerHeight;
    const setup = this.menuMode === 'setup';
    const a = Math.sin(t * 0.12) * 0.55 + (setup ? 0.35 : 0.2);
    const r = setup ? (portrait ? 5.2 : 4.3) : 7.8;
    const h = setup ? 1.6 : 2.4;
    const target = new THREE.Vector3(0, setup ? 1.05 : 1.3, 0.4);
    cam.position.set(Math.sin(a) * r, h, 0.4 + Math.cos(a) * r);
    cam.fov = portrait ? 62 : 46;
    cam.updateProjectionMatrix();
    cam.lookAt(target);
    if (setup) {
      // shift framing so the character sits beside / above the sheet
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      if (portrait) target.y -= 1.05;
      else target.addScaledVector(right, 1.15);
      cam.lookAt(target);
    }
    if (this.showRig) {
      this.showRig.root.rotation.y = Math.sin(t * 0.4) * 0.25 + a * 0.6;
      animateRig(this.showRig, { mode: 'stand', speed: 0, attack: -1 }, dt);
    }
    this.menuWorld.update(dt, { x: 0, z: 0 }, cam, this.menuFx);
    const scale = (this.renderer.domElement.height * 0.5) / Math.tan((cam.fov * Math.PI) / 360);
    this.menuFx.add.update(dt, scale);
    this.post.u.terror = 0; this.post.u.damage = 0; this.post.u.desat = 0; this.post.u.blind = 0;
    this.post.render(this.menuScene, cam, t, false);
  }

  // ---------------------------------------------------------------- match
  async startMatch() {
    this.audio.init();
    this.audio.play('ui');
    try {
      if (coarse && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        await screen.orientation?.lock?.('landscape').catch(() => {});
      }
    } catch (e) { /* fullscreen not allowed */ }
    try { this.wake = await navigator.wakeLock?.request('screen'); } catch (e) { /* no wake lock */ }
    this.ui.show('loading');
    await frame(); await frame();
    if (this.game) { this.game.dispose(); this.game = null; }
    this._disposeMenu();
    await frame();
    this.game = new Game(this, { ...this.S, auto: this.auto, timeScale: this.timeScale });
    this.resize();
    this.ui.startHud(this.game);
    this.ui.show('hud');
    this.paused = false;
    this.input.reset();
    this.input.enabled = true;
    this.input.noLock = this.S.role === 'survivor' && coarse;
    this.last = performance.now();
  }

  pause() {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.reset();
    this.input.releaseLock();
    this.ui.el.pause.hidden = false;
    this.audio.suspend();
  }

  resume() {
    this.paused = false;
    this.ui.el.pause.hidden = true;
    this.input.reset();
    this.input.enabled = true;
    this.audio.resume();
    this.last = performance.now();
  }

  showResults(summary) {
    this.input.enabled = false;
    this.input.releaseLock();
    this.ui.showResults(summary);
  }

  toMenu() {
    this.paused = false;
    this.audio.resume();
    if (this.game) { this.game.dispose(); this.game = null; }
    this.input.releaseLock();
    this.wake?.release?.().catch?.(() => {});
    this.menu();
  }

  // ---------------------------------------------------------------- loop
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    if (this.game) {
      const g = this.game;
      if (!this.paused) g.update(dt);
      const p = g.player;
      const u = this.post.u;
      u.terror = damp(u.terror, g.terror || 0, 4, dt);
      u.damage = g.dmg;
      u.blind = g.role === 'killer' ? Math.min(1, g.killer.blind / 1.5) : 0;
      let desat = 0;
      if (g.role === 'survivor') {
        const s = g.spectate || p;
        desat = ['downed', 'hooked', 'carried'].includes(s.state) ? 0.55 : s.state === 'dead' ? 0.8 : s.injured ? 0.18 : 0;
      }
      u.desat = damp(u.desat, desat, 3, dt);
      this.post.render(g.scene, g.camera, this.t, g.nightmare);
      this._adapt(dt);
    } else if (this.menuScene) {
      this._menuFrame(dt);
    }
  }

  // Drops resolution when the frame rate stays low.
  _adapt(dt) {
    if (this.paused) return;
    this.slow = dt > 1 / 36 ? this.slow + dt : Math.max(0, this.slow - dt * 0.5);
    if (this.slow > 3 && this.pr > 0.6) {
      this.slow = 0;
      this.pr = Math.max(0.6, this.pr - 0.15);
      this.resize();
    }
  }
}

function damp(a, b, l, dt) { return a + (b - a) * (1 - Math.exp(-l * dt)); }

let app = null;
const boot = (data) => {
  if (app) return;
  app = new App((data && data.settings) || {});
};
try {
  const hot = window.claude?.hot;
  hot?.snapshot?.(() => ({ settings: app ? app.S : {} }));
  if (hot?.ready) hot.ready(boot); else boot(hot?.data ?? {});
} catch (e) {
  boot({});
}
