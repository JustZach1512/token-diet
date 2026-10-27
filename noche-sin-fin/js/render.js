// Render en canvas 2D: mapa pre-pintado, entidades, oscuridad con línea de vista y auras.
(function () {
  'use strict';
  const NSF = window.NSF, C = NSF.CONST, U = NSF.U, T = NSF.T;
  const BASE = 40; // px por casilla en el mapa pre-pintado

  const COL = {
    void: '#05060a', ground: '#141912', wall: '#2c2b31', wallTop: '#3a3940', wallEdge: '#4a4850',
    wood: '#6b4a2c', woodLight: '#8a6440', blood: '#8e1016', amber: '#ffc35a', bone: '#e6dfd0',
    aura: '#cfe0ff', red: '#ff3b3b',
  };

  function ellipse(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, U.TAU); }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, U.TAU); }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.c = canvas.getContext('2d');
      this.dark = document.createElement('canvas');
      this.dc = this.dark.getContext('2d');
      this.camX = 0; this.camY = 0; this.S = 36;
      this.base = null; this.game = null;
      this.motes = [];
      this.flickerT = 0; this.time = 0;
      this.poly = new Float32Array(2 * 220);
      this.makeSprites();
      this.resize();
    }

    makeSprites() {
      const fog = document.createElement('canvas');
      fog.width = fog.height = 128;
      const f = fog.getContext('2d');
      const g = f.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(170,180,190,0.55)'); g.addColorStop(1, 'rgba(170,180,190,0)');
      f.fillStyle = g; f.fillRect(0, 0, 128, 128);
      this.fogSprite = fog;
      const gr = document.createElement('canvas');
      gr.width = gr.height = 128;
      const gc = gr.getContext('2d');
      const img = gc.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22;
      }
      gc.putImageData(img, 0, 0);
      this.grain = gr;
      this.grainPat = this.c.createPattern(gr, 'repeat');
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.w = w; this.h = h; this.dpr = dpr;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.ds = 0.5 * dpr;
      this.dark.width = Math.ceil(w * this.ds); this.dark.height = Math.ceil(h * this.ds);
      this.S = U.clamp(Math.min(w / 16, h / 9.5), 24, 68);
    }

    setGame(game) {
      this.game = game;
      this.base = this.prerender(game.map);
      this.camX = game.viewer.x; this.camY = game.viewer.y;
      this.motes = [];
      for (let i = 0; i < 16; i++) this.motes.push({ x: game.viewer.x + U.rand(-14, 14), y: game.viewer.y + U.rand(-9, 9), r: U.rand(2, 5), vx: U.rand(-0.25, 0.25), vy: U.rand(-0.12, 0.12), a: U.rand(0.05, 0.14) });
    }

    // ---------------------------------------------------------------- mapa base
    prerender(map) {
      const W = map.W, H = map.H;
      const cv = document.createElement('canvas');
      cv.width = W * BASE; cv.height = H * BASE;
      const c = cv.getContext('2d');
      c.scale(BASE, BASE);
      c.fillStyle = COL.ground; c.fillRect(0, 0, W, H);
      // manchas grandes de tierra y musgo
      for (let i = 0; i < 70; i++) {
        const x = U.rand(0, W), y = U.rand(0, H), r = U.rand(1.5, 5);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        const dirt = Math.random() < 0.5;
        g.addColorStop(0, dirt ? 'rgba(48,40,28,0.45)' : 'rgba(26,38,24,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const v = map.v[map.idx(x, y)];
          c.fillStyle = `rgba(${20 + (v % 18)},${26 + (v % 12)},${18 + (v % 9)},0.35)`;
          c.fillRect(x, y, 1, 1);
          for (let k = 0; k < 3; k++) {
            const sx = x + ((v * (k + 3)) % 97) / 97, sy = y + ((v * (k + 7)) % 89) / 89;
            c.fillStyle = k === 0 ? 'rgba(60,70,50,0.35)' : 'rgba(0,0,0,0.25)';
            c.fillRect(sx, sy, 0.05, 0.05);
          }
          if (v % 4 === 0) {
            c.strokeStyle = 'rgba(48,66,40,0.55)'; c.lineWidth = 0.035;
            const gx = x + (v % 7) / 8 + 0.1, gy = y + ((v >> 3) % 7) / 8 + 0.1;
            c.beginPath();
            c.moveTo(gx, gy); c.lineTo(gx - 0.06, gy - 0.16);
            c.moveTo(gx + 0.04, gy); c.lineTo(gx + 0.08, gy - 0.18);
            c.moveTo(gx + 0.08, gy); c.lineTo(gx + 0.16, gy - 0.12);
            c.stroke();
          }
          if (v === 77 || v === 155) {
            c.fillStyle = 'rgba(210,200,180,0.28)';
            ellipse(c, x + 0.5, y + 0.5, 0.12, 0.05, v / 40); c.fill();
            circle(c, x + 0.62, y + 0.46, 0.05); c.fill();
          }
        }
      }
      // sombras
      c.fillStyle = 'rgba(0,0,0,0.42)';
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = map.get(x, y);
          if (t === T.WALL || t === T.WINDOW) c.fillRect(x + 0.14, y + 0.2, 1, 1);
          else if (t === T.ROCK) { ellipse(c, x + 0.62, y + 0.66, 0.46, 0.4); c.fill(); }
          else if (t === T.TREE) { ellipse(c, x + 0.7, y + 0.75, 0.5, 0.32); c.fill(); }
        }
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = map.get(x, y);
          if (t === T.WALL) this.paintWall(c, map, x, y);
          else if (t === T.WINDOW) this.paintWindow(c, map, x, y);
          else if (t === T.ROCK) this.paintRock(c, map, x, y);
          else if (t === T.TREE) this.paintTree(c, map, x, y);
        }
      }
      return cv;
    }

    paintWall(c, map, x, y) {
      const isW = (xx, yy) => { const t = map.get(xx, yy); return t === T.WALL || t === T.WINDOW || t === T.GATE; };
      const v = map.v[map.idx(x, y)];
      c.fillStyle = COL.wall; c.fillRect(x, y, 1, 1);
      c.fillStyle = `rgba(255,255,255,${0.02 + (v % 5) * 0.008})`; c.fillRect(x, y, 1, 1);
      c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 0.03;
      c.beginPath();
      const off = (y % 2) * 0.5;
      c.moveTo(x, y + 0.5); c.lineTo(x + 1, y + 0.5);
      c.moveTo(x + off + 0.25, y); c.lineTo(x + off + 0.25, y + 0.5);
      c.moveTo(x + ((off + 0.75) % 1), y + 0.5); c.lineTo(x + ((off + 0.75) % 1), y + 1);
      c.stroke();
      c.fillStyle = COL.wallEdge;
      if (!isW(x, y - 1)) c.fillRect(x, y, 1, 0.08);
      if (!isW(x - 1, y)) c.fillRect(x, y, 0.06, 1);
      c.fillStyle = 'rgba(0,0,0,0.45)';
      if (!isW(x, y + 1)) c.fillRect(x, y + 0.9, 1, 0.1);
      if (!isW(x + 1, y)) c.fillRect(x + 0.94, y, 0.06, 1);
      if (v % 9 === 0) { c.fillStyle = 'rgba(70,90,50,0.35)'; ellipse(c, x + 0.3, y + 0.7, 0.18, 0.1); c.fill(); }
    }

    paintWindow(c, map, x, y) {
      const ax = map.axis[map.idx(x, y)];
      c.fillStyle = COL.wall;
      if (ax === 1) { c.fillRect(x, y, 1, 0.2); c.fillRect(x, y + 0.8, 1, 0.2); }
      else { c.fillRect(x, y, 0.2, 1); c.fillRect(x + 0.8, y, 0.2, 1); }
      c.fillStyle = '#4a3a2a';
      if (ax === 1) c.fillRect(x + 0.3, y + 0.2, 0.4, 0.6); else c.fillRect(x + 0.2, y + 0.3, 0.6, 0.4);
      c.fillStyle = '#6f5a40';
      if (ax === 1) { c.fillRect(x + 0.3, y + 0.2, 0.06, 0.6); c.fillRect(x + 0.64, y + 0.2, 0.06, 0.6); }
      else { c.fillRect(x + 0.2, y + 0.3, 0.6, 0.06); c.fillRect(x + 0.2, y + 0.64, 0.6, 0.06); }
      c.fillStyle = 'rgba(180,200,210,0.35)';
      c.beginPath();
      if (ax === 1) { c.moveTo(x + 0.4, y + 0.22); c.lineTo(x + 0.52, y + 0.22); c.lineTo(x + 0.44, y + 0.34); }
      else { c.moveTo(x + 0.22, y + 0.4); c.lineTo(x + 0.22, y + 0.52); c.lineTo(x + 0.34, y + 0.44); }
      c.fill();
    }

    paintRock(c, map, x, y) {
      const v = map.v[map.idx(x, y)];
      c.fillStyle = '#34322d';
      c.beginPath();
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * U.TAU, r = 0.42 + (((v * (i + 1)) % 13) / 13) * 0.1;
        const px = x + 0.5 + Math.cos(a) * r, py = y + 0.5 + Math.sin(a) * r * 0.9;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.08)'; ellipse(c, x + 0.38, y + 0.36, 0.2, 0.12, -0.4); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.03;
      c.beginPath(); c.moveTo(x + 0.3, y + 0.6); c.lineTo(x + 0.55, y + 0.5); c.lineTo(x + 0.7, y + 0.66); c.stroke();
    }

    paintTree(c, map, x, y) {
      const v = map.v[map.idx(x, y)];
      const cx = x + 0.5, cy = y + 0.5;
      c.fillStyle = '#0f130d'; circle(c, cx, cy, 0.5); c.fill();
      c.fillStyle = '#18201a';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * U.TAU + v; circle(c, cx + Math.cos(a) * 0.3, cy + Math.sin(a) * 0.3, 0.2); c.fill(); }
      c.strokeStyle = '#2d241b'; c.lineCap = 'round';
      const nb = 5 + (v % 3);
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * U.TAU + (v % 10) * 0.3;
        const l = 0.55 + ((v * (i + 2)) % 7) * 0.05;
        const ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l;
        c.lineWidth = 0.07; c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke();
        c.lineWidth = 0.03; c.beginPath();
        c.moveTo(cx + Math.cos(a) * l * 0.6, cy + Math.sin(a) * l * 0.6);
        c.lineTo(cx + Math.cos(a + 0.5) * l * 0.85, cy + Math.sin(a + 0.5) * l * 0.85);
        c.stroke();
      }
      c.fillStyle = '#2a2019'; circle(c, cx, cy, 0.17); c.fill();
      c.fillStyle = '#3a2d22'; circle(c, cx - 0.04, cy - 0.04, 0.09); c.fill();
      c.lineCap = 'butt';
    }

    // ---------------------------------------------------------------- frame
    viewInfo(g) {
      const v = g.viewer;
      let x = v.x, y = v.y, R;
      if (v instanceof NSF.Survivor) {
        R = C.SURV_VISION * (v.def.stats.visionMul || 1) * g.world.visionMul;
        if (v.status === 'downed') R *= 0.6;
        if (v.status === 'carried') { x = g.killer.x; y = g.killer.y; R *= 0.7; }
        if (v.status === 'hooked') R *= 0.85;
      } else {
        R = C.KILLER_VISION * (g.role === 'killer' ? g.world.killerVisionMul : 1);
        if (v.blindT > 0) R = 1.4;
      }
      if (this.flickerT > 0) R *= 0.55;
      return { x, y, R };
    }

    canSee(vi, x, y) {
      return U.dist(vi.x, vi.y, x, y) <= vi.R && this.game.map.los(vi.x, vi.y, x, y);
    }

    render(dt) {
      const g = this.game;
      if (!g) return;
      this.time += dt;
      const c = this.c, w = this.w, h = this.h, S = this.S;
      const v = g.viewer;
      // cámara
      let tx = v.x, ty = v.y;
      if (v.status === 'carried') { tx = g.killer.x; ty = g.killer.y; }
      tx += (v.vx || 0) * 0.25; ty += (v.vy || 0) * 0.25;
      const k = 1 - Math.pow(0.002, dt);
      this.camX += (tx - this.camX) * k; this.camY += (ty - this.camY) * k;
      const halfW = w / 2 / S, halfH = h / 2 / S;
      const map = g.map;
      this.camX = map.W > halfW * 2 ? U.clamp(this.camX, halfW - 1, map.W - halfW + 1) : map.W / 2;
      this.camY = map.H > halfH * 2 ? U.clamp(this.camY, halfH - 1, map.H - halfH + 1) : map.H / 2;
      let sx = 0, sy = 0;
      if (g.shake > 0) { sx = U.rand(-1, 1) * g.shake * 0.25; sy = U.rand(-1, 1) * g.shake * 0.25; }
      const cx = this.camX + sx, cy = this.camY + sy;
      this.view = { x0: cx - halfW - 1, y0: cy - halfH - 1, x1: cx + halfW + 1, y1: cy + halfH + 1 };

      // parpadeo de Pesadilla
      if (g.world.flicker) {
        this.flickerT -= dt;
        if (this.flickerT < -0.2 && Math.random() < dt * 0.25) { this.flickerT = U.rand(0.06, 0.22); if (Math.random() < 0.4) NSF.Audio.play('whisper', 0.6); }
      }

      const dpr = this.dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = COL.void; c.fillRect(0, 0, w, h);
      c.setTransform(dpr * S, 0, 0, dpr * S, dpr * (w / 2 - cx * S), dpr * (h / 2 - cy * S));
      this.wt = { cx, cy };
      c.imageSmoothingEnabled = true;
      {
        const x0 = U.clamp(Math.floor(this.view.x0), 0, map.W), y0 = U.clamp(Math.floor(this.view.y0), 0, map.H);
        const x1 = U.clamp(Math.ceil(this.view.x1), 0, map.W), y1 = U.clamp(Math.ceil(this.view.y1), 0, map.H);
        if (x1 > x0 && y1 > y0) c.drawImage(this.base, x0 * BASE, y0 * BASE, (x1 - x0) * BASE, (y1 - y0) * BASE, x0, y0, x1 - x0, y1 - y0);
      }

      const vi = this.viewInfo(g);
      this.vi = vi;
      const isKillerView = v === g.killer;

      this.drawDecals(c, g);
      this.drawObjects(c, g, isKillerView);
      this.drawActors(c, g, vi, isKillerView);
      this.drawFx(c, g);
      this.drawFog(c, dt);
      this.drawDarkness(g, vi, isKillerView);
      c.setTransform(dpr * S, 0, 0, dpr * S, dpr * (w / 2 - cx * S), dpr * (h / 2 - cy * S));
      this.drawAuras(c, g, vi, isKillerView);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawTexts(c, g);
      this.drawScreenFx(c, g, vi, isKillerView);
      this.drawIndicators(c, g, isKillerView);
      if (g.player) this.drawStatusBar(c, g);
      if (g.player && g.player.skill) this.drawSkill(c, g.player.skill);
      if (g.skillFlash) this.drawSkillFlash(c, g.skillFlash);
    }

    toScreen(x, y) { return [(x - this.wt.cx) * this.S + this.w / 2, (y - this.wt.cy) * this.S + this.h / 2]; }
    inView(x, y, m = 0) { const v = this.view; return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m; }

    drawDecals(c, g) {
      const now = g.time;
      for (const b of g.blood) {
        if (!this.inView(b.x, b.y)) continue;
        const a = U.clamp(1 - (now - b.t) / 40, 0, 1) * 0.7;
        if (a <= 0) continue;
        c.fillStyle = `rgba(90,8,14,${a})`;
        circle(c, b.x, b.y, b.r); c.fill();
      }
      // trampas visibles
      const v = g.viewer;
      for (const tr of g.traps) {
        if (!this.inView(tr.x, tr.y)) continue;
        let a = 0;
        if (v === g.killer) a = 0.75;
        else { const d = U.dist(v.x, v.y, tr.x, tr.y); a = d < 1.8 ? 0.55 * (1 - d / 1.8) + 0.1 : 0; }
        if (a > 0) this.drawRune(c, tr.x, tr.y, a);
      }
    }

    drawRune(c, x, y, a) {
      c.save();
      c.globalAlpha = a;
      c.strokeStyle = '#7fbf6a'; c.lineWidth = 0.04;
      circle(c, x, y, 0.42); c.stroke();
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const an = -Math.PI / 2 + (i / 3) * U.TAU + this.time * 0.3;
        const px = x + Math.cos(an) * 0.36, py = y + Math.sin(an) * 0.36;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.stroke();
      circle(c, x, y, 0.08); c.stroke();
      c.restore();
    }

    drawObjects(c, g, killerView) {
      const map = g.map, t = this.time;
      const v = this.view;
      // palés
      for (let y = Math.max(0, v.y0 | 0); y < Math.min(map.H, v.y1 + 1); y++) {
        for (let x = Math.max(0, v.x0 | 0); x < Math.min(map.W, v.x1 + 1); x++) {
          const tt = map.get(x, y);
          if (tt === T.PALLET) this.drawPallet(c, map, x, y, false);
          else if (tt === T.PALLET_DOWN) this.drawPallet(c, map, x, y, true);
          else if (tt === T.DEBRIS) this.drawDebris(c, map, x, y);
        }
      }
      for (const gen of map.gens) if (this.inView(gen.cx, gen.cy, 1)) this.drawGen(c, gen, t);
      for (const gt of map.gates) if (this.inView(gt.cx, gt.cy, 3)) this.drawGate(c, g, gt, t);
      if (g.hatch && this.inView(g.hatch.x, g.hatch.y, 1)) this.drawHatch(c, g.hatch, t);
      for (const hk of map.hooks) if (this.inView(hk.cx, hk.cy, 1)) this.drawHook(c, hk, t);
    }

    drawPallet(c, map, x, y, down) {
      const ax = map.axis[map.idx(x, y)];
      c.save();
      c.translate(x + 0.5, y + 0.5);
      if (ax === 2) c.rotate(Math.PI / 2);
      // en local: el cruce es en X; el hueco se extiende en Y
      if (down) {
        c.fillStyle = '#3d2a18'; c.fillRect(-0.28, -0.55, 0.56, 1.1);
        c.fillStyle = COL.wood; c.fillRect(-0.25, -0.52, 0.5, 1.04);
        c.fillStyle = COL.woodLight;
        for (let i = 0; i < 4; i++) c.fillRect(-0.25 + i * 0.135, -0.52, 0.07, 1.04);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-0.25, -0.1, 0.5, 0.08); c.fillRect(-0.25, 0.3, 0.5, 0.08);
      } else {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-0.18, -0.5, 0.36, 0.42);
        c.fillStyle = COL.wood;
        c.beginPath(); c.moveTo(-0.2, -0.52); c.lineTo(0.2, -0.52); c.lineTo(0.24, -0.12); c.lineTo(-0.24, -0.12); c.closePath(); c.fill();
        c.fillStyle = COL.woodLight;
        c.fillRect(-0.2, -0.46, 0.4, 0.06); c.fillRect(-0.22, -0.3, 0.44, 0.06); c.fillRect(-0.24, -0.18, 0.48, 0.06);
      }
      c.restore();
    }
    drawDebris(c, map, x, y) {
      const v = map.v[map.idx(x, y)];
      c.fillStyle = '#4b3420';
      for (let i = 0; i < 5; i++) {
        c.save();
        c.translate(x + 0.2 + ((v * (i + 1)) % 7) / 10, y + 0.2 + ((v * (i + 3)) % 7) / 10);
        c.rotate(v + i);
        c.fillRect(-0.15, -0.03, 0.3, 0.06);
        c.restore();
      }
    }

    drawGen(c, gen, t) {
      const x = gen.x, y = gen.y;
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x + 0.16, y + 0.2, 0.9, 0.86);
      c.fillStyle = '#25282b'; c.fillRect(x + 0.06, y + 0.08, 0.88, 0.86);
      c.fillStyle = '#3a3f44'; c.fillRect(x + 0.1, y + 0.12, 0.8, 0.5);
      const work = gen.workers > 0 && !gen.done;
      const pump = work ? Math.sin(t * 22) * 0.06 : 0;
      c.fillStyle = '#5b6168';
      c.fillRect(x + 0.2, y + 0.28 + pump, 0.18, 0.24);
      c.fillRect(x + 0.62, y + 0.28 - pump, 0.18, 0.24);
      c.fillStyle = '#1a1c1e'; c.fillRect(x + 0.1, y + 0.66, 0.8, 0.22);
      const lit = gen.done ? 5 : Math.floor(gen.progress * 5 + 0.0001);
      for (let i = 0; i < 5; i++) {
        let col = '#2b2520';
        if (gen.blocked) col = i % 2 ? '#3a1010' : '#5a1414';
        else if (i < lit) col = gen.done ? '#ffe08a' : '#ffbe4d';
        else if (i === lit && gen.progress > 0) col = (Math.sin(t * 6) > 0) ? '#a8762c' : '#2b2520';
        if (gen.regress && i === lit - 1 && Math.sin(t * 14) > 0) col = '#ff7a2a';
        c.fillStyle = col;
        circle(c, x + 0.18 + i * 0.16, y + 0.77, 0.055); c.fill();
      }
      if (gen.done) {
        c.globalCompositeOperation = 'lighter';
        const gr = c.createRadialGradient(x + 0.5, y + 0.4, 0, x + 0.5, y + 0.4, 1.6);
        gr.addColorStop(0, `rgba(255,210,120,${0.25 + gen.flash * 0.4})`); gr.addColorStop(1, 'rgba(255,210,120,0)');
        c.fillStyle = gr; c.fillRect(x - 1.2, y - 1.2, 3.4, 3.4);
        c.globalCompositeOperation = 'source-over';
      }
      if (gen.spark > 0.3 && Math.random() < 0.5) {
        c.fillStyle = '#ffd38a';
        circle(c, x + U.rand(0.1, 0.9), y + U.rand(0.1, 0.6), 0.04); c.fill();
      }
    }

    drawHook(c, h, t) {
      const x = h.cx, y = h.cy;
      c.fillStyle = 'rgba(0,0,0,0.45)'; ellipse(c, x + 0.08, y + 0.12, 0.22, 0.12); c.fill();
      c.fillStyle = '#1e1c1b'; ellipse(c, x, y + 0.05, 0.18, 0.1); c.fill();
      c.strokeStyle = '#5d5853'; c.lineWidth = 0.07;
      c.beginPath(); c.moveTo(x, y + 0.05); c.lineTo(x, y - 0.75); c.lineTo(x + 0.28, y - 0.75); c.stroke();
      c.strokeStyle = '#7a4a2a'; c.lineWidth = 0.05;
      c.beginPath(); c.arc(x + 0.28, y - 0.6, 0.15, -Math.PI / 2, Math.PI * 0.7); c.stroke();
      const s = h.s;
      if (s) {
        const sway = Math.sin(t * 3 + s.idx) * 0.06;
        c.save();
        c.translate(x + 0.28 + sway, y - 0.35);
        this.survivorBody(c, s, Math.PI / 2, 0.85, t * 6);
        c.restore();
        if (s.sac >= 0.5) {
          c.strokeStyle = 'rgba(20,10,12,0.9)'; c.lineWidth = 0.06;
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * U.TAU + t * 0.6;
            const r1 = 0.9, r2 = 0.25 + Math.sin(t * 2 + i) * 0.08;
            c.beginPath();
            c.moveTo(x + Math.cos(a) * r1, y - 0.35 + Math.sin(a) * r1);
            c.quadraticCurveTo(x + Math.cos(a + 0.8) * 0.7, y - 0.35 + Math.sin(a + 0.8) * 0.7, x + 0.28 + Math.cos(a) * r2, y - 0.35 + Math.sin(a) * r2);
            c.stroke();
          }
        }
      }
    }

    drawGate(c, g, gt, t) {
      const x = gt.x, y = gt.y, dir = gt.dir;
      if (gt.open) {
        const gr = c.createLinearGradient(x + (dir > 0 ? 0 : 1), 0, x + (dir > 0 ? 1.8 : -0.8), 0);
        gr.addColorStop(0, 'rgba(220,235,255,0.55)'); gr.addColorStop(1, 'rgba(220,235,255,0)');
        c.fillStyle = gr;
        c.fillRect(dir > 0 ? x : x - 0.8, y, 1.8, 2);
        c.fillStyle = '#3c3f44'; c.fillRect(x, y - 0.05, 1, 0.18); c.fillRect(x, y + 1.87, 1, 0.18);
      } else {
        c.fillStyle = '#2f3237'; c.fillRect(x, y, 1, 2);
        c.fillStyle = '#4a4e55';
        for (let i = 0; i < 5; i++) c.fillRect(x + 0.08, y + 0.1 + i * 0.38, 0.84, 0.12);
        c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x + 0.46, y, 0.08, 2);
      }
      // palanca
      const lx = gt.lever.x, ly = gt.lever.y;
      c.fillStyle = '#1b1d20'; c.fillRect(lx - 0.24, ly - 0.3, 0.48, 0.56);
      c.fillStyle = '#3a3e43'; c.fillRect(lx - 0.2, ly - 0.26, 0.4, 0.48);
      for (let i = 0; i < 3; i++) {
        let col = '#2a1414';
        if (g.endgame) col = gt.progress > (i + 1) / 3 - 0.001 || gt.open ? '#6dff8a' : '#ff3b3b';
        c.fillStyle = col;
        circle(c, lx - 0.12 + i * 0.12, ly - 0.14, 0.04); c.fill();
      }
      c.strokeStyle = '#8a8f96'; c.lineWidth = 0.05;
      const la = gt.open ? 0.6 : -0.6 + gt.progress * 1.2;
      c.beginPath(); c.moveTo(lx, ly + 0.12); c.lineTo(lx + Math.sin(la) * 0.22, ly + 0.12 - Math.cos(la) * 0.22); c.stroke();
    }

    drawHatch(c, hatch, t) {
      const x = hatch.x, y = hatch.y;
      c.fillStyle = '#2a2219'; c.fillRect(x - 0.42, y - 0.42, 0.84, 0.84);
      c.strokeStyle = '#5d5853'; c.lineWidth = 0.05; c.strokeRect(x - 0.42, y - 0.42, 0.84, 0.84);
      if (hatch.open) {
        c.fillStyle = '#000'; c.fillRect(x - 0.34, y - 0.34, 0.68, 0.68);
        c.strokeStyle = `rgba(150,200,220,${0.2 + Math.sin(t * 3) * 0.1})`; c.lineWidth = 0.03;
        circle(c, x, y, 0.2 + (t % 1) * 0.1); c.stroke();
      } else {
        c.strokeStyle = '#3d3226'; c.beginPath(); c.moveTo(x - 0.4, y); c.lineTo(x + 0.4, y); c.stroke();
      }
    }

    // ---------------------------------------------------------------- personajes
    survivorBody(c, s, face, scale = 1, animOverride) {
      const def = s.def;
      c.save();
      c.rotate(face);
      c.scale(scale, scale);
      const anim = animOverride !== undefined ? animOverride : s.anim;
      const sw = Math.sin(anim * 1.0) * 0.09 * (s.moving > 0.3 || animOverride !== undefined ? 1 : 0);
      const working = s.act && s.status === 'free';
      c.fillStyle = def.skin;
      if (working) {
        const w = Math.sin(anim * 8) * 0.03;
        circle(c, 0.26 + w, -0.12, 0.065); c.fill();
        circle(c, 0.26 - w, 0.12, 0.065); c.fill();
      } else {
        circle(c, sw, -0.25, 0.065); c.fill();
        circle(c, -sw, 0.25, 0.065); c.fill();
      }
      c.fillStyle = def.color;
      ellipse(c, 0, 0, 0.17, 0.26); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.035; c.stroke();
      c.fillStyle = 'rgba(0,0,0,0.18)'; ellipse(c, -0.06, 0, 0.09, 0.2); c.fill();
      if (s.health === 1 || s.status === 'hooked') { c.fillStyle = '#7a1015'; ellipse(c, -0.02, 0.09, 0.08, 0.06, 0.4); c.fill(); }
      c.fillStyle = def.skin; circle(c, 0.04, 0, 0.13); c.fill();
      c.fillStyle = def.hair; c.beginPath(); c.arc(0.02, 0, 0.135, Math.PI * 0.55, Math.PI * 1.45); c.fill();
      c.restore();
    }

    drawSurvivor(c, s, alpha) {
      c.save();
      c.globalAlpha = alpha;
      c.translate(s.x, s.y);
      let hop = 0;
      if (s.vault) hop = Math.sin(Math.min(1, s.vault.t / s.vault.dur) * Math.PI) * 0.25;
      c.fillStyle = 'rgba(0,0,0,0.45)'; ellipse(c, 0.05, 0.1, 0.3, 0.2); c.fill();
      if (s.status === 'downed') {
        c.rotate(s.face);
        c.fillStyle = 'rgba(90,8,14,0.6)'; ellipse(c, -0.05, 0.05, 0.35, 0.22); c.fill();
        c.fillStyle = s.def.color; ellipse(c, -0.05, 0, 0.3, 0.15); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.03; c.stroke();
        c.fillStyle = s.def.skin;
        const r = Math.sin(s.anim * 2) * 0.06;
        circle(c, 0.38 + r, -0.12, 0.055); c.fill(); circle(c, 0.38 - r, 0.12, 0.055); c.fill();
        circle(c, 0.28, 0, 0.11); c.fill();
        c.fillStyle = s.def.hair; c.beginPath(); c.arc(0.27, 0, 0.115, Math.PI * 0.55, Math.PI * 1.45); c.fill();
        c.restore();
        return;
      }
      if (hop) c.translate(0, -hop);
      if (s.hitHasteT > 0 || s.sprintT > 0) {
        c.strokeStyle = 'rgba(230,223,208,0.25)'; c.lineWidth = 0.03;
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(-Math.cos(s.face) * 0.35 + i * 0.12 * Math.sin(s.face), -Math.sin(s.face) * 0.35 - i * 0.12 * Math.cos(s.face));
          c.lineTo(-Math.cos(s.face) * 0.7 + i * 0.12 * Math.sin(s.face), -Math.sin(s.face) * 0.7 - i * 0.12 * Math.cos(s.face));
          c.stroke();
        }
      }
      this.survivorBody(c, s, s.face);
      if (s.hitFlash > 0) { c.fillStyle = `rgba(255,60,60,${s.hitFlash * 0.6})`; circle(c, 0, 0, 0.34); c.fill(); }
      if (s.snareT > 0) {
        c.strokeStyle = '#7fbf6a'; c.lineWidth = 0.04;
        for (let i = 0; i < 3; i++) { circle(c, 0, 0, 0.36 + i * 0.08 + Math.sin(this.time * 6 + i) * 0.02); c.stroke(); }
      }
      if (s.stunT > 0) { c.fillStyle = '#ffd38a'; circle(c, 0.2, -0.4, 0.04); c.fill(); }
      c.restore();
    }

    drawKiller(c, k, alpha) {
      const t = this.time;
      c.save();
      c.globalAlpha = alpha;
      c.translate(k.x, k.y);
      // mancha roja
      if (!k.ab.cloak && alpha > 0.5) {
        c.save();
        c.rotate(k.face);
        const gr = c.createRadialGradient(0.6, 0, 0, 0.6, 0, 2.6);
        gr.addColorStop(0, 'rgba(200,10,10,0.28)'); gr.addColorStop(1, 'rgba(200,10,10,0)');
        c.fillStyle = gr;
        c.beginPath(); c.moveTo(0.2, 0); c.arc(0.2, 0, 2.8, -0.45, 0.45); c.closePath(); c.fill();
        c.restore();
      }
      c.fillStyle = 'rgba(0,0,0,0.5)'; ellipse(c, 0.06, 0.12, 0.42, 0.28); c.fill();
      if (k.vault) c.translate(0, -Math.sin(Math.min(1, k.vault.t / k.vault.dur) * Math.PI) * 0.3);
      if (k.ab.phase === 'wind' && k.def.id === 'embestida') c.translate(U.rand(-0.03, 0.03), U.rand(-0.03, 0.03));
      if (k.dashing) {
        c.strokeStyle = 'rgba(200,180,160,0.35)'; c.lineWidth = 0.05;
        for (let i = -2; i <= 2; i++) {
          const ox = -Math.cos(k.face), oy = -Math.sin(k.face), px = -oy * i * 0.14, py = ox * i * 0.14;
          c.beginPath(); c.moveTo(ox * 0.4 + px, oy * 0.4 + py); c.lineTo(ox * 1.3 + px, oy * 1.3 + py); c.stroke();
        }
      }
      c.rotate(k.face);
      const sw = Math.sin(k.anim) * 0.07 * (k.moving > 0.3 ? 1 : 0);
      const swing = k.swing;
      const wig = k.carrying ? Math.sin(t * 18) * 0.04 * (k.carrying.isPlayer ? 1 : 0.5) : 0;
      c.rotate(wig);
      switch (k.def.id) {
        case 'carnicero': {
          c.fillStyle = '#4a3028'; circle(c, sw + 0.02, -0.4, 0.12); c.fill();
          c.fillStyle = '#3a221c'; ellipse(c, 0, 0, 0.26, 0.42); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.04; c.stroke();
          c.fillStyle = '#6b5a48'; c.fillRect(0.06, -0.2, 0.16, 0.4);
          c.fillStyle = 'rgba(120,10,14,0.7)'; ellipse(c, 0.14, 0.05, 0.06, 0.09); c.fill();
          c.save();
          c.translate(-sw + 0.02, 0.4);
          c.rotate(-0.4 + swing * 1.6);
          c.fillStyle = '#4a3028'; circle(c, 0, 0, 0.12); c.fill();
          c.fillStyle = '#2b1d16'; c.fillRect(0.05, -0.03, 0.22, 0.06);
          c.fillStyle = '#9aa0a6'; c.fillRect(0.25, -0.12, 0.3, 0.2);
          c.fillStyle = 'rgba(120,10,14,0.8)'; c.fillRect(0.42, -0.12, 0.13, 0.2);
          c.restore();
          c.fillStyle = '#7e6a4a'; circle(c, 0.05, 0, 0.19); c.fill();
          c.strokeStyle = '#3a2d1f'; c.lineWidth = 0.025;
          c.beginPath(); c.moveTo(-0.08, -0.12); c.lineTo(0.16, 0.12); c.moveTo(-0.08, 0.12); c.lineTo(0.16, -0.12); c.stroke();
          c.fillStyle = '#ff2a2a'; circle(c, 0.17, -0.06, 0.025); c.fill(); circle(c, 0.17, 0.06, 0.025); c.fill();
          break;
        }
        case 'espectro': {
          const cl = k.ab.cloak;
          if (cl === 'on' || cl === 'in') c.globalAlpha = alpha * (cl === 'on' ? (k.isPlayer ? 0.42 : 0.16) + Math.sin(t * 9) * 0.05 : 0.5);
          c.fillStyle = '#a9a499';
          c.beginPath();
          for (let i = 0; i <= 14; i++) {
            const a = (i / 14) * U.TAU;
            const r = (i % 2 ? 0.3 : 0.38) + Math.sin(t * 5 + i) * 0.02;
            const px = Math.cos(a) * r * 0.62, py = Math.sin(a) * r;
            if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.closePath(); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.03; c.stroke();
          c.strokeStyle = '#8f8a80'; c.lineWidth = 0.06;
          c.beginPath(); c.moveTo(0, -0.28); c.lineTo(0.34 + sw, -0.3); c.moveTo(0, 0.28); c.lineTo(0.3 - sw + swing * 0.4, 0.3); c.stroke();
          c.fillStyle = '#b08d3a'; circle(c, 0.36 + sw, -0.3, 0.07); c.fill();
          c.fillStyle = '#d8d3c6'; circle(c, 0.04, 0, 0.15); c.fill();
          c.fillStyle = '#111'; ellipse(c, 0.12, -0.06, 0.03, 0.04); c.fill(); ellipse(c, 0.12, 0.06, 0.03, 0.04); c.fill();
          break;
        }
        case 'cazadora': {
          c.fillStyle = '#4b3a2a'; ellipse(c, 0, 0, 0.27, 0.4); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.04; c.stroke();
          c.fillStyle = '#6a5440';
          c.beginPath();
          for (let i = 0; i <= 16; i++) {
            const a = (i / 16) * U.TAU, r = i % 2 ? 0.2 : 0.27;
            const px = Math.cos(a) * r * 0.8, py = Math.sin(a) * r;
            if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.closePath(); c.fill();
          c.fillStyle = '#5b4733'; circle(c, sw, -0.38, 0.1); c.fill();
          const wind = k.ab.phase === 'wind' ? Math.min(1, k.ab.t / 0.45) : 0;
          c.save();
          c.translate(-sw, 0.38);
          c.rotate(-0.3 - wind * 1.8 + swing * 1.4);
          c.fillStyle = '#5b4733'; circle(c, 0, 0, 0.1); c.fill();
          c.fillStyle = '#3a2a1c'; c.fillRect(0.02, -0.025, 0.34, 0.05);
          c.fillStyle = '#9aa0a6'; c.beginPath(); c.moveTo(0.3, -0.03); c.lineTo(0.42, -0.16); c.lineTo(0.42, 0.06); c.closePath(); c.fill();
          c.restore();
          c.fillStyle = '#e8e3d6';
          ellipse(c, -0.18, -0.07, 0.16, 0.045, 0.15); c.fill();
          ellipse(c, -0.18, 0.07, 0.16, 0.045, -0.15); c.fill();
          circle(c, 0.05, 0, 0.15); c.fill();
          c.fillStyle = '#1a1a1a'; circle(c, 0.13, -0.06, 0.03); c.fill(); circle(c, 0.13, 0.06, 0.03); c.fill();
          break;
        }
        case 'bruja': {
          c.strokeStyle = '#4b5a3e'; c.lineWidth = 0.06; c.lineCap = 'round';
          c.beginPath(); c.moveTo(0, -0.22); c.lineTo(0.42 + sw, -0.26); c.moveTo(0, 0.22); c.lineTo(0.42 - sw + swing * 0.3, 0.26); c.stroke();
          c.strokeStyle = '#1d2418'; c.lineWidth = 0.025;
          for (const sy of [-0.26, 0.26]) {
            const bx = 0.42 + (sy < 0 ? sw : -sw);
            c.beginPath();
            for (let i = -1; i <= 1; i++) { c.moveTo(bx, sy); c.lineTo(bx + 0.14, sy + i * 0.05); }
            c.stroke();
          }
          c.lineCap = 'butt';
          c.fillStyle = '#2c3627'; ellipse(c, -0.05, 0, 0.22, 0.3); c.fill();
          c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.03; c.stroke();
          c.fillStyle = '#5d6b4a'; circle(c, 0.08, 0, 0.13); c.fill();
          c.strokeStyle = '#10140e'; c.lineWidth = 0.025;
          for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(0.02, i * 0.03); c.lineTo(-0.22, i * 0.06 + Math.sin(t * 3 + i) * 0.02); c.stroke(); }
          c.fillStyle = '#b8ff7a'; circle(c, 0.17, -0.05, 0.022); c.fill(); circle(c, 0.17, 0.05, 0.022); c.fill();
          break;
        }
      }
      c.restore();
      if (k.carrying) {
        c.save(); c.globalAlpha = alpha;
        c.translate(k.x - Math.sin(k.face) * -0.05, k.y - 0.15);
        this.survivorBody(c, k.carrying, k.face + Math.PI / 2 + Math.sin(t * 12) * 0.25, 0.8, t * 10);
        c.restore();
      }
      if (k.stunT > 0 || k.blindT > 0) {
        c.save();
        c.globalAlpha = alpha;
        c.fillStyle = k.blindT > 0 ? '#fffbe6' : '#ffd38a';
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + (i / 3) * U.TAU;
          circle(c, k.x + Math.cos(a) * 0.3, k.y - 0.55 + Math.sin(a) * 0.1, 0.05); c.fill();
        }
        c.restore();
      }
      if (k.busy) {
        const p = Math.min(1, k.busy.t / k.busy.dur);
        c.strokeStyle = 'rgba(230,223,208,0.8)'; c.lineWidth = 0.06;
        c.beginPath(); c.arc(k.x, k.y, 0.6, -Math.PI / 2, -Math.PI / 2 + p * U.TAU); c.stroke();
      }
    }

    drawActors(c, g, vi, killerView) {
      const list = [];
      const v = g.viewer;
      for (const s of g.survivors) {
        if (s.status === 'dead' || s.status === 'escaped' || s.status === 'carried' || s.status === 'hooked') continue;
        if (!this.inView(s.x, s.y, 1)) continue;
        let alpha = 1;
        if (s !== v) {
          if (!this.canSee(vi, s.x, s.y)) continue;
          if (killerView && s.stealthT > 0) { if (U.dist(v.x, v.y, s.x, s.y) > 2.5) continue; alpha = 0.15; }
        } else if (s.stealthT > 0) alpha = 0.45;
        list.push({ y: s.y, f: () => this.drawSurvivor(c, s, alpha) });
      }
      const k = g.killer;
      if (this.inView(k.x, k.y, 2)) {
        let alpha = 1;
        if (k !== v) {
          const d = U.dist(v.x, v.y, k.x, k.y);
          if (!this.canSee(vi, k.x, k.y)) alpha = 0;
          else if (k.ab.cloak === 'on') alpha = d < 3 ? 1 : 0;
        }
        if (alpha > 0) list.push({ y: k.y, f: () => this.drawKiller(c, k, alpha) });
      }
      list.sort((a, b) => a.y - b.y);
      for (const it of list) it.f();
    }

    drawFx(c, g) {
      for (const ax of g.axes) {
        c.save();
        c.translate(ax.x, ax.y); c.rotate(ax.spin);
        c.fillStyle = '#3a2a1c'; c.fillRect(-0.22, -0.03, 0.44, 0.06);
        c.fillStyle = '#b7bcc2'; c.beginPath(); c.moveTo(0.14, -0.04); c.lineTo(0.26, -0.18); c.lineTo(0.28, 0.06); c.closePath(); c.fill();
        c.restore();
      }
      for (const p of g.particles) {
        const a = U.clamp(p.life / p.max, 0, 1);
        if (p.glow) c.globalCompositeOperation = 'lighter';
        c.globalAlpha = a;
        c.fillStyle = p.color;
        circle(c, p.x, p.y, p.size); c.fill();
        c.globalCompositeOperation = 'source-over';
      }
      c.globalAlpha = 1;
      for (const f of g.flashes) {
        c.save();
        c.translate(f.x, f.y); c.rotate(f.a);
        c.globalCompositeOperation = 'lighter';
        const gr = c.createRadialGradient(0, 0, 0, 0, 0, 4.5);
        gr.addColorStop(0, `rgba(255,250,230,${f.life * 1.4})`); gr.addColorStop(1, 'rgba(255,250,230,0)');
        c.fillStyle = gr;
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 4.5, -0.6, 0.6); c.closePath(); c.fill();
        c.restore();
      }
    }

    drawFog(c, dt) {
      const v = this.view;
      for (const m of this.motes) {
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.x < v.x0 - 6) m.x = v.x1 + 5; if (m.x > v.x1 + 6) m.x = v.x0 - 5;
        if (m.y < v.y0 - 6) m.y = v.y1 + 5; if (m.y > v.y1 + 6) m.y = v.y0 - 5;
        c.globalAlpha = m.a;
        c.drawImage(this.fogSprite, m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
      c.globalAlpha = 1;
    }

    drawDarkness(g, vi, killerView) {
      const dc = this.dc, ds = this.ds, S = this.S, w = this.w, h = this.h;
      const cx = this.wt.cx, cy = this.wt.cy;
      dc.setTransform(1, 0, 0, 1, 0, 0);
      dc.globalCompositeOperation = 'source-over';
      dc.clearRect(0, 0, this.dark.width, this.dark.height);
      let dark = g.world.dark - (killerView ? 0.08 : 0);
      if (this.flickerT > 0) dark = 0.985;
      dc.fillStyle = `rgba(3,4,8,${dark})`;
      dc.fillRect(0, 0, this.dark.width, this.dark.height);
      dc.globalCompositeOperation = 'destination-out';
      dc.setTransform(ds * S, 0, 0, ds * S, ds * (w / 2 - cx * S), ds * (h / 2 - cy * S));
      // polígono de visión
      const N = 200, poly = this.poly, map = g.map;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * U.TAU;
        const d = Math.min(vi.R, map.ray(vi.x, vi.y, a, vi.R) + 0.35);
        poly[i * 2] = vi.x + Math.cos(a) * d; poly[i * 2 + 1] = vi.y + Math.sin(a) * d;
      }
      const gr = dc.createRadialGradient(vi.x, vi.y, 0, vi.x, vi.y, vi.R);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.92)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = gr;
      dc.beginPath();
      dc.moveTo(poly[0], poly[1]);
      for (let i = 1; i < N; i++) dc.lineTo(poly[i * 2], poly[i * 2 + 1]);
      dc.closePath(); dc.fill();
      // halo propio
      const hr = 1.3;
      const g2 = dc.createRadialGradient(vi.x, vi.y, 0, vi.x, vi.y, hr);
      g2.addColorStop(0, 'rgba(0,0,0,0.7)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      dc.fillStyle = g2; dc.fillRect(vi.x - hr, vi.y - hr, hr * 2, hr * 2);
      // luces de generadores reparados y puertas abiertas
      const light = (x, y, r, a) => {
        if (!this.inView(x, y, r)) return;
        const lg = dc.createRadialGradient(x, y, 0, x, y, r);
        lg.addColorStop(0, `rgba(0,0,0,${a})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
        dc.fillStyle = lg; dc.fillRect(x - r, y - r, r * 2, r * 2);
      };
      for (const gen of map.gens) if (gen.done) light(gen.cx, gen.cy, 3.4, 0.75);
      for (const gt of map.gates) if (gt.open) light(gt.cx + gt.dir * 1.5, gt.cy, 4, 0.8);
      for (const f of g.flashes) light(f.x + Math.cos(f.a) * 2, f.y + Math.sin(f.a) * 2, 3, f.life * 1.6);
      const c = this.c;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.drawImage(this.dark, 0, 0, w, h);
    }

    aura(c, x, y, r, color, a) {
      c.globalAlpha = a;
      c.strokeStyle = color; c.lineWidth = 0.07;
      circle(c, x, y, r); c.stroke();
      c.globalAlpha = a * 0.25;
      c.fillStyle = color; circle(c, x, y, r); c.fill();
      c.globalAlpha = 1;
    }

    drawAuras(c, g, vi, killerView) {
      const t = this.time, v = g.viewer, map = g.map;
      const pulse = 0.65 + Math.sin(t * 5) * 0.25;
      c.globalCompositeOperation = 'lighter';
      if (killerView) {
        // marcas de arañazos
        for (const sc of g.scratches) {
          if (!this.inView(sc.x, sc.y) || U.dist(v.x, v.y, sc.x, sc.y) > 14) continue;
          const a = U.clamp(1 - (g.time - sc.t) / 9, 0, 1) * 0.85;
          c.strokeStyle = `rgba(210,40,40,${a})`; c.lineWidth = 0.04;
          c.save(); c.translate(sc.x, sc.y); c.rotate(sc.a);
          c.beginPath();
          for (let i = -1; i <= 1; i++) { c.moveTo(-0.16, i * 0.07); c.lineTo(0.16, i * 0.07 + 0.04); }
          c.stroke(); c.restore();
        }
        for (const gen of map.gens) {
          if (gen.done) continue;
          if (!this.inView(gen.cx, gen.cy, 1)) continue;
          const col = gen.blocked ? '#ff3b3b' : gen.regress ? '#ff9a3b' : '#e6dfd0';
          c.globalAlpha = 0.35; c.strokeStyle = col; c.lineWidth = 0.06;
          c.strokeRect(gen.x + 0.02, gen.y + 0.04, 0.96, 0.94);
          c.globalAlpha = 1;
        }
        for (const s of g.survivors) {
          if (!s.alive) continue;
          const show = s.status === 'hooked' || (s.revealT > 0 && s.status !== 'carried');
          if (show && this.inView(s.x, s.y, 1)) this.aura(c, s.x, s.status === 'hooked' ? s.y - 0.35 : s.y, 0.42, COL.red, pulse);
        }
        if (g.killer.carrying) for (const h of map.hooks) if (!h.s && this.inView(h.cx, h.cy, 1)) this.aura(c, h.cx, h.cy - 0.4, 0.4, COL.red, 0.6);
        if (g.hatch && g.hatch.open && U.dist(v.x, v.y, g.hatch.x, g.hatch.y) < 12) this.aura(c, g.hatch.x, g.hatch.y, 0.5, '#9fd8ff', 0.5);
        for (const al of g.alerts) {
          if (!this.inView(al.x, al.y, 2)) continue;
          const k = 1 - al.life / 3;
          c.globalAlpha = U.clamp(al.life, 0, 1);
          c.strokeStyle = al.type === 'skill' || al.type === 'trap' ? '#ffd23b' : '#ffb03b'; c.lineWidth = 0.08;
          circle(c, al.x, al.y, 0.4 + k * 1.6); c.stroke();
          c.globalAlpha = 1;
        }
      } else {
        for (const s of g.survivors) {
          if (s === v || !s.alive) continue;
          if (s.status === 'hooked') { this.aura(c, s.x, s.y - 0.35, 0.42, COL.red, pulse); continue; }
          if (s.status === 'carried') continue;
          if (s.status === 'downed') { this.aura(c, s.x, s.y, 0.42, '#ff6b3b', pulse); continue; }
          if (!this.canSee(vi, s.x, s.y) && this.inView(s.x, s.y, 1)) this.aura(c, s.x, s.y, 0.34, s.health === 1 ? '#ffb0a0' : COL.aura, 0.35);
        }
        for (const gen of map.gens) {
          if (gen.done || gen.blocked || !this.inView(gen.cx, gen.cy, 1)) continue;
          if (this.canSee(vi, gen.cx, gen.cy)) continue;
          c.globalAlpha = 0.28; c.strokeStyle = COL.amber; c.lineWidth = 0.06;
          c.strokeRect(gen.x + 0.06, gen.y + 0.08, 0.88, 0.86);
          c.globalAlpha = 1;
        }
        if (g.endgame) for (const gt of map.gates) if (this.inView(gt.lever.x, gt.lever.y, 1)) this.aura(c, gt.lever.x, gt.lever.y, 0.45, gt.open ? '#6dff8a' : '#fff4c0', 0.55);
        if (g.hatch && g.hatch.open) this.aura(c, g.hatch.x, g.hatch.y, 0.5, '#9fd8ff', pulse);
        // ojos del asesino en la oscuridad
        const k = g.killer;
        if (g.world.eyes && v.status === 'free' && !k.ab.cloak) {
          const d = U.dist(v.x, v.y, k.x, k.y);
          const facing = Math.abs(U.angDiff(k.face, Math.atan2(v.y - k.y, v.x - k.x))) < 0.7;
          if (d < k.terror && facing && !this.canSee(vi, k.x, k.y) && this.inView(k.x, k.y, 1)) {
            const a = (1 - d / k.terror) * 0.7;
            c.fillStyle = `rgba(255,40,30,${a})`;
            const px = -Math.sin(k.face) * 0.08, py = Math.cos(k.face) * 0.08;
            circle(c, k.x + px, k.y + py, 0.045); c.fill();
            circle(c, k.x - px, k.y - py, 0.045); c.fill();
          }
        }
      }
      c.globalCompositeOperation = 'source-over';
    }

    drawTexts(c, g) {
      c.textAlign = 'center';
      c.font = `600 ${Math.round(this.S * 0.42)}px "Barlow Condensed", system-ui, sans-serif`;
      for (const t of g.texts) {
        const [x, y] = this.toScreen(t.x, t.y);
        c.globalAlpha = U.clamp(t.life, 0, 1);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText(t.text, x + 1, y + 1);
        c.fillStyle = t.color; c.fillText(t.text, x, y);
      }
      c.globalAlpha = 1;
    }

    drawScreenFx(c, g, vi, killerView) {
      const w = this.w, h = this.h, v = g.viewer;
      // radio de terror
      if (!killerView && v.alive) {
        const k = g.killer, tr = k.terror;
        const d = U.dist(v.x, v.y, k.x, k.y);
        if (tr > 0 && d < tr) {
          const inten = 1 - d / tr;
          const beat = Math.pow(Math.max(0, Math.sin(this.time * (3 + inten * 5))), 6);
          const a = inten * 0.35 + beat * inten * 0.25;
          const gr = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
          gr.addColorStop(0, 'rgba(120,0,0,0)'); gr.addColorStop(1, `rgba(130,0,4,${a})`);
          c.fillStyle = gr; c.fillRect(0, 0, w, h);
        }
      }
      if (killerView && v.blindT > 0) {
        c.fillStyle = `rgba(255,250,235,${U.clamp(v.blindT / 3, 0, 1) * 0.85})`;
        c.fillRect(0, 0, w, h);
      }
      // viñeta y grano
      const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      c.fillStyle = vg; c.fillRect(0, 0, w, h);
      c.save();
      c.translate(U.rand(0, 128) | 0, U.rand(0, 128) | 0);
      c.fillStyle = this.grainPat; c.fillRect(-128, -128, w + 256, h + 256);
      c.restore();
    }

    drawIndicators(c, g, killerView) {
      const v = g.viewer, map = g.map, items = [];
      if (killerView) {
        for (const al of g.alerts) items.push({ x: al.x, y: al.y, col: '#ffd23b', r: 7 });
        if (v.carrying) {
          const hs = map.hooks.filter((h) => !h.s).sort((a, b) => U.dist(v.x, v.y, a.cx, a.cy) - U.dist(v.x, v.y, b.cx, b.cy)).slice(0, 2);
          for (const h of hs) items.push({ x: h.cx, y: h.cy, col: COL.red, r: 6 });
        }
        for (const s of g.survivors) if (s.alive && s.revealT > 0 && s.status !== 'carried') items.push({ x: s.x, y: s.y, col: COL.red, r: 6 });
        if (v.ab.tele && g.time - v.ab.tele.t < 5) items.push({ x: v.ab.tele.x, y: v.ab.tele.y, col: '#7fbf6a', r: 8 });
      } else {
        const gens = map.gens.filter((gn) => !gn.done && !gn.blocked).sort((a, b) => U.dist(v.x, v.y, a.cx, a.cy) - U.dist(v.x, v.y, b.cx, b.cy)).slice(0, 2);
        for (const gn of gens) items.push({ x: gn.cx, y: gn.cy, col: COL.amber, r: 5 });
        for (const s of g.survivors) {
          if (s === v) continue;
          if (s.status === 'hooked') items.push({ x: s.x, y: s.y, col: COL.red, r: 7 });
          else if (s.status === 'downed') items.push({ x: s.x, y: s.y, col: '#ff6b3b', r: 6 });
        }
        if (g.endgame) for (const gt of map.gates) items.push({ x: gt.lever.x, y: gt.lever.y, col: gt.open ? '#6dff8a' : '#fff4c0', r: 6 });
        if (g.hatch && g.hatch.open) items.push({ x: g.hatch.x, y: g.hatch.y, col: '#9fd8ff', r: 7 });
      }
      const w = this.w, h = this.h, mTop = 56, mSide = 22, mBot = 22;
      for (const it of items) {
        const [sx, sy] = this.toScreen(it.x, it.y);
        if (sx > mSide && sx < w - mSide && sy > mTop && sy < h - mBot) continue;
        const dx = sx - w / 2, dy = sy - h / 2;
        const kx = dx > 0 ? (w / 2 - mSide) / dx : (-(w / 2 - mSide)) / dx;
        const ky = dy > 0 ? (h / 2 - mBot) / dy : (-(h / 2 - mTop)) / dy;
        const kk = Math.min(Math.abs(kx), Math.abs(ky));
        const px = w / 2 + dx * kk, py = h / 2 + dy * kk;
        const a = Math.atan2(dy, dx);
        c.save();
        c.translate(px, py); c.rotate(a);
        c.globalAlpha = 0.85;
        c.fillStyle = it.col;
        c.beginPath(); c.moveTo(it.r + 6, 0); c.lineTo(-2, -it.r); c.lineTo(-2, it.r); c.closePath(); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    }

    drawStatusBar(c, g) {
      const p = g.player;
      let label = null, val = 0, col = COL.bone;
      if (p instanceof NSF.Survivor) {
        if (p.act) {
          const a = p.act, t = a.target;
          if (a.type === 'repair') { label = p.boostT > 0 ? 'Reparando ×3' : 'Reparando'; val = t.progress; col = COL.amber; }
          else if (a.type === 'heal') { label = `Curando a ${t.name}`; val = t.healProg; col = '#9fe0a0'; }
          else if (a.type === 'revive') { label = `Levantando a ${t.name}`; val = t.reviveProg; col = '#9fe0a0'; }
          else if (a.type === 'rescue') { label = `Rescatando a ${t.name}`; val = a.t / C.RESCUE_TIME; col = '#9fe0a0'; }
          else if (a.type === 'gate') { label = 'Abriendo la puerta'; val = t.progress; col = '#fff4c0'; }
        } else if (p.status === 'free' && p.healProg > 0 && g.survivors.some((o) => o.act && o.act.target === p)) { label = 'Te están curando'; val = p.healProg; col = '#9fe0a0'; }
        else if (p.status === 'downed') { label = p.reviveProg > 0 ? 'Te están levantando' : 'Desangrándote · arrástrate hacia un aliado'; val = p.reviveProg > 0 ? p.reviveProg : 1 - p.bleed; col = p.reviveProg > 0 ? '#9fe0a0' : COL.red; }
        else if (p.status === 'carried') { label = 'Forcejea: pulsa ACCIÓN rápido'; val = p.wiggle; col = '#ffd38a'; }
        else if (p.status === 'hooked') { label = p.sac < 0.5 && p.hookCount === 1 ? 'En el gancho · espera un rescate' : 'La Entidad te reclama'; val = 1 - p.sac; col = COL.red; }
      } else if (p.busy) {
        const names = { pickup: 'Recogiendo', hook: 'Colgando', break: 'Rompiendo palé', kick: 'Pateando generador', trap: 'Dibujando runa', hatch: 'Cerrando trampilla' };
        label = names[p.busy.type]; val = p.busy.t / p.busy.dur;
      } else if (p.carrying) { label = `Cargando a ${p.carrying.name}`; val = 1 - p.carrying.wiggle; col = COL.red; }
      if (!label) return;
      const w = Math.min(280, this.w * 0.42), x = this.w / 2 - w / 2, y = this.h - 64;
      c.fillStyle = 'rgba(5,6,10,0.65)'; c.fillRect(x - 8, y - 22, w + 16, 40);
      c.font = `600 15px "Barlow Condensed", system-ui, sans-serif`;
      c.textAlign = 'left'; c.fillStyle = COL.bone; c.fillText(label.toUpperCase(), x, y - 6);
      c.fillStyle = 'rgba(230,223,208,0.15)'; c.fillRect(x, y + 2, w, 6);
      c.fillStyle = col; c.fillRect(x, y + 2, w * U.clamp(val, 0, 1), 6);
    }

    drawSkill(c, s) {
      if (s.t < -0.3) return;
      const cx = this.w / 2, cy = this.h * 0.4, r = Math.min(52, this.h * 0.12);
      const appear = U.clamp((s.t + 0.3) / 0.2, 0, 1);
      c.save();
      c.globalAlpha = appear;
      c.fillStyle = 'rgba(5,6,10,0.55)'; circle(c, cx, cy, r + 14); c.fill();
      c.strokeStyle = 'rgba(230,223,208,0.35)'; c.lineWidth = 3;
      circle(c, cx, cy, r); c.stroke();
      const dir = s.rev ? -1 : 1;
      const A = (f) => -Math.PI / 2 + dir * f * U.TAU;
      c.lineWidth = 9;
      c.strokeStyle = '#e6dfd0';
      c.beginPath(); c.arc(cx, cy, r, Math.min(A(s.start + s.great), A(s.start + s.len)), Math.max(A(s.start + s.great), A(s.start + s.len))); c.stroke();
      c.strokeStyle = '#ffc35a';
      c.beginPath(); c.arc(cx, cy, r, Math.min(A(s.start), A(s.start + s.great)), Math.max(A(s.start), A(s.start + s.great))); c.stroke();
      const p = Math.max(0, s.t / s.dur);
      const na = A(p);
      c.strokeStyle = '#ff3b3b'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * (r + 8), cy + Math.sin(na) * (r + 8)); c.stroke();
      c.fillStyle = '#e6dfd0';
      c.font = `700 14px "Barlow Condensed", system-ui, sans-serif`; c.textAlign = 'center';
      c.fillText(s.rev ? '↺ PULSA ACCIÓN' : 'PULSA ACCIÓN', cx, cy + 5);
      c.restore();
    }

    drawSkillFlash(c, f) {
      const txt = f.res === 'great' ? '¡PERFECTA!' : f.res === 'good' ? 'BIEN' : 'FALLO';
      const col = f.res === 'great' ? '#ffc35a' : f.res === 'good' ? '#e6dfd0' : '#ff3b3b';
      c.globalAlpha = U.clamp(f.t / 0.6, 0, 1);
      c.font = `700 22px "Barlow Condensed", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = col;
      c.fillText(txt, this.w / 2, this.h * 0.4 + 6);
      c.globalAlpha = 1;
    }
  }

  // Retrato de un personaje para los menús.
  Renderer.portrait = function (canvas, kind, def) {
    const c = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.clientWidth || 72;
    canvas.width = size * dpr; canvas.height = size * dpr;
    c.setTransform(dpr * size / 1.6, 0, 0, dpr * size / 1.6, dpr * size / 2, dpr * size / 2);
    const fake = { g: null, x: 0, y: 0 };
    const r = Renderer.prototype;
    const ctxObj = { time: 1.3, survivorBody: r.survivorBody };
    if (kind === 'survivor') {
      const s = { def, anim: 0.8, moving: 1, act: null, status: 'free', health: 2, face: -Math.PI / 2, x: 0, y: 0 };
      c.fillStyle = 'rgba(0,0,0,0.4)'; ellipse(c, 0.05, 0.1, 0.3, 0.2); c.fill();
      ctxObj.survivorBody.call(ctxObj, c, s, -Math.PI / 2, 1.5);
    } else {
      const k = Object.assign(fake, { def, face: -Math.PI / 2, anim: 0.8, moving: 1, swing: 0, ab: {}, carrying: null, stunT: 0, blindT: 0, busy: null, vault: null, dashing: false });
      c.scale(1.25, 1.25);
      r.drawKiller.call(ctxObj, c, k, 1);
    }
  };

  NSF.Renderer = Renderer;
})();
