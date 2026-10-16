'use strict';
// Canvas helpers: outlined text, chunky arrows, cached sprites and outlined shapes for characters.
(function () {
  const NF = globalThis.NF;
  const U = NF.util;
  const D = (NF.draw = {});

  D.FONT = '"Lilita One", "Arial Black", Impact, sans-serif';
  D.HUD = '"VT323", "Courier New", monospace';
  D.INK = '#140f1f';
  D.LANE_COLORS = ['#c24bff', '#1fd2ff', '#3ef06e', '#ff3d5e'];
  D.LANE_NAMES = ['IZQUIERDA', 'ABAJO', 'ARRIBA', 'DERECHA'];
  D.LANE_ROT = [-Math.PI / 2, Math.PI, 0, Math.PI / 2]; // arrows are drawn pointing up

  // ---------- text ----------
  D.font = (size, face) => `${size}px ${face || D.FONT}`;
  D.text = function (ctx, str, x, y, o) {
    o = o || {};
    const size = o.size || 32;
    ctx.font = D.font(size, o.font);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    if (o.shadow) {
      ctx.fillStyle = o.shadow;
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.lw != null ? o.lw : Math.max(2, size * 0.18);
      ctx.strokeStyle = o.shadow;
      const sy = o.shadowY != null ? o.shadowY : size * 0.09;
      ctx.strokeText(str, x, y + sy);
      ctx.fillText(str, x, y + sy);
    }
    if (o.stroke !== false) {
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.lineWidth = o.lw != null ? o.lw : Math.max(2, size * 0.18);
      ctx.strokeStyle = o.stroke || D.INK;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.fill || '#fff';
    ctx.fillText(str, x, y);
  };
  D.measure = (ctx, str, size, face) => {
    ctx.font = D.font(size, face);
    return ctx.measureText(str).width;
  };
  // Word-wrap into lines no wider than w.
  D.wrap = function (ctx, str, w, size, face) {
    ctx.font = D.font(size, face);
    const words = str.split(' ');
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd;
      if (ctx.measureText(test).width > w && cur) {
        lines.push(cur);
        cur = wd;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // ---------- shapes ----------
  D.rr = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  // Fill the current path and outline it.
  D.paint = function (ctx, fill, lw, stroke) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (lw !== 0) {
      ctx.lineWidth = lw || 5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = stroke || D.INK;
      ctx.stroke();
    }
  };
  D.circle = function (ctx, x, y, r, fill, lw, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
    D.paint(ctx, fill, lw, stroke);
  };
  D.ellipse = function (ctx, x, y, rx, ry, rot, fill, lw, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, Math.PI * 2);
    D.paint(ctx, fill, lw, stroke);
  };
  D.rect = function (ctx, x, y, w, h, r, fill, lw, stroke) {
    D.rr(ctx, x, y, w, h, r || 0);
    D.paint(ctx, fill, lw, stroke);
  };
  D.poly = function (ctx, pts, fill, lw, stroke, open) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    if (!open) ctx.closePath();
    D.paint(ctx, fill, lw, stroke);
  };
  // Smooth closed blob through points (quadratic midpoints).
  D.blob = function (ctx, pts, fill, lw, stroke) {
    const n = pts.length / 2;
    ctx.beginPath();
    const mx = (i) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
    const my = (i) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
    ctx.moveTo(mx(n - 1), my(n - 1));
    for (let i = 0; i < n; i++) ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx(i), my(i));
    ctx.closePath();
    D.paint(ctx, fill, lw, stroke);
  };
  // Thick rounded segment with an outline (arms, legs).
  D.limb = function (ctx, x1, y1, x2, y2, w, fill, lw) {
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    if (lw !== 0) {
      ctx.strokeStyle = D.INK;
      ctx.lineWidth = w + (lw || 5) * 2;
      ctx.stroke();
    }
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  // Two-segment limb through a joint (shoulder -> elbow -> hand).
  D.limb2 = function (ctx, x1, y1, x2, y2, x3, y3, w, fill, lw) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    if (lw !== 0) {
      ctx.strokeStyle = D.INK;
      ctx.lineWidth = w + (lw || 5) * 2;
      ctx.stroke();
    }
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
  };
  // Point at angle a (degrees, 0 = straight down, 90 = forward/right) and length len from x,y.
  D.dir = (x, y, a, len) => {
    const r = (a * Math.PI) / 180;
    return [x + Math.sin(r) * len, y + Math.cos(r) * len];
  };

  // ---------- sprite cache ----------
  D.spriteScale = 2;
  const cache = new Map();
  D.sprite = function (key, w, h, draw) {
    let c = cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    const s = D.spriteScale;
    c.width = Math.ceil(w * s);
    c.height = Math.ceil(h * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    draw(g, w, h);
    c.lw = w;
    c.lh = h;
    cache.set(key, c);
    return c;
  };
  D.clearSprites = () => cache.clear();
  D.blit = function (ctx, spr, x, y, scale, alpha) {
    const w = spr.lw * (scale || 1), h = spr.lh * (scale || 1);
    if (alpha != null && alpha < 1) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * alpha;
      ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
      ctx.globalAlpha = a;
    } else ctx.drawImage(spr, x - w / 2, y - h / 2, w, h);
  };

  // ---------- arrows ----------
  function arrowPath(g, k) {
    k = k || 1;
    g.beginPath();
    g.moveTo(0, -46 * k);
    g.lineTo(45 * k, 2 * k);
    g.lineTo(19 * k, 2 * k);
    g.lineTo(19 * k, 42 * k);
    g.lineTo(-19 * k, 42 * k);
    g.lineTo(-19 * k, 2 * k);
    g.lineTo(-45 * k, 2 * k);
    g.closePath();
  }
  D.arrowPath = arrowPath;
  const SZ = 128;
  function withLane(g, lane, fn) {
    g.save();
    g.translate(SZ / 2, SZ / 2);
    g.rotate(D.LANE_ROT[lane]);
    fn(g);
    g.restore();
  }
  // kind: note | static | press | confirm | fire | void
  D.arrow = function (lane, kind) {
    return D.sprite('arrow:' + lane + ':' + kind, SZ, SZ, (g) =>
      withLane(g, lane, (g) => {
        const col = D.LANE_COLORS[lane];
        g.lineJoin = 'round';
        g.miterLimit = 2;
        if (kind === 'static' || kind === 'press') {
          arrowPath(g, kind === 'press' ? 0.9 : 1);
          g.lineWidth = 12;
          g.strokeStyle = D.INK;
          g.stroke();
          const grad = g.createLinearGradient(-40, -40, 40, 40);
          if (kind === 'static') {
            grad.addColorStop(0, '#b9cad6');
            grad.addColorStop(1, '#6c8194');
          } else {
            grad.addColorStop(0, U.shade(col, -0.2));
            grad.addColorStop(1, U.shade(col, -0.55));
          }
          g.fillStyle = grad;
          g.fill();
          arrowPath(g, kind === 'press' ? 0.62 : 0.68);
          g.lineWidth = 3;
          g.strokeStyle = 'rgba(255,255,255,0.25)';
          g.stroke();
          return;
        }
        if (kind === 'confirm') {
          g.shadowColor = col;
          g.shadowBlur = 26;
        }
        arrowPath(g, 1);
        g.lineWidth = 15;
        g.strokeStyle = D.INK;
        g.stroke();
        g.shadowBlur = 0;
        g.lineWidth = 8;
        g.strokeStyle = kind === 'void' ? '#ff2a4a' : kind === 'confirm' ? '#ffffff' : '#f4f1ff';
        g.stroke();
        const grad = g.createLinearGradient(-30, -46, 30, 42);
        if (kind === 'fire') {
          grad.addColorStop(0, '#ffe066');
          grad.addColorStop(0.5, '#ff7b1c');
          grad.addColorStop(1, '#c4161c');
        } else if (kind === 'void') {
          grad.addColorStop(0, '#2a2833');
          grad.addColorStop(1, '#050408');
        } else {
          grad.addColorStop(0, U.shade(col, kind === 'confirm' ? 0.6 : 0.35));
          grad.addColorStop(1, U.shade(col, kind === 'confirm' ? 0 : -0.25));
        }
        g.fillStyle = grad;
        g.fill();
        if (kind === 'void') {
          // static noise lines + a red X
          g.save();
          arrowPath(g, 1);
          g.clip();
          const r = U.rng(lane * 9 + 3);
          for (let i = 0; i < 16; i++) {
            g.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.35})`;
            g.fillRect(-50, -46 + r() * 90, 100, 1 + r() * 3);
          }
          g.restore();
          g.lineWidth = 7;
          g.strokeStyle = '#ff2a4a';
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(-12, -6);
          g.lineTo(12, 18);
          g.moveTo(12, -6);
          g.lineTo(-12, 18);
          g.stroke();
        } else if (kind === 'fire') {
          g.fillStyle = '#fff3b0';
          g.beginPath();
          g.moveTo(-8, 30);
          g.quadraticCurveTo(-14, 10, 0, -14);
          g.quadraticCurveTo(14, 10, 8, 30);
          g.closePath();
          g.fill();
        } else {
          // glossy highlight
          g.save();
          arrowPath(g, 1);
          g.clip();
          g.fillStyle = 'rgba(255,255,255,0.28)';
          g.beginPath();
          g.ellipse(-12, -14, 22, 12, -0.6, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      })
    );
  };

  // Hold trail between y0 (head) and y1 (tail), lane-colored.
  D.hold = function (ctx, x, y0, y1, lane, alpha, kind) {
    if (Math.abs(y1 - y0) < 1) return;
    const col = kind === 'fire' ? '#ff7b1c' : D.LANE_COLORS[lane];
    const w = 26;
    const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
    ctx.save();
    ctx.globalAlpha *= alpha == null ? 0.9 : alpha;
    D.rr(ctx, x - w / 2, top, w, h, 12);
    ctx.fillStyle = U.shade(col, 0.05);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = D.INK;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x - w / 2 + 5, top + 6, 5, Math.max(0, h - 12));
    ctx.restore();
  };

  // ---------- misc ----------
  D.vignette = function (ctx, w, h, strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength || 0.55})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  // Little lock icon for locked weeks/songs.
  D.lock = function (ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, -10, 13, Math.PI, 0);
    ctx.lineWidth = 14;
    ctx.strokeStyle = D.INK;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#d7d3e6';
    ctx.stroke();
    D.rect(ctx, -20, -10, 40, 32, 6, '#f2c94c', 5);
    D.circle(ctx, 0, 4, 4, D.INK, 0);
    ctx.restore();
  };
})();
