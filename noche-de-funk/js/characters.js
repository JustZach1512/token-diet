'use strict';
// Characters, all drawn with canvas paths. Coordinates: origin at the feet, facing right (+x),
// y grows downward (so the body lives at negative y). The game mirrors the player.
(function () {
  const NF = globalThis.NF;
  const U = NF.util;
  const D = NF.draw;
  const INK = D.INK;

  // ---------- color tinting (miss = purple wash, dead = grey) ----------
  const tintCache = new Map();
  function colorFn(tint, amt) {
    if (!tint) return (h) => h;
    return (h) => {
      const key = h + tint + amt;
      let v = tintCache.get(key);
      if (!v) {
        v = U.mix(h, tint, amt);
        tintCache.set(key, v);
      }
      return v;
    };
  }

  // ---------- poses ----------
  // Arm angles in degrees: 0 = hanging down, 90 = pointing forward, 180 = up, -90 = back.
  const POSE = {
    idle: { mic: [30, 150], free: [10, 28], head: 0, rot: 0, dx: 0, sx: 1, sy: 1, spread: 0 },
    left: { mic: [22, 148], free: [-82, -96], head: -0.07, rot: -0.1, dx: -14, sx: 1.03, sy: 0.98, spread: 7 },
    right: { mic: [48, 162], free: [88, 98], head: 0.07, rot: 0.1, dx: 14, sx: 1.03, sy: 0.98, spread: 7 },
    up: { mic: [42, 172], free: [118, 150], head: -0.15, rot: 0, dx: 0, sx: 0.95, sy: 1.08, spread: 0 },
    down: { mic: [24, 146], free: [28, 12], head: 0.12, rot: 0.02, dx: 0, sx: 1.08, sy: 0.87, spread: 13 },
    hey: { mic: [30, 150], free: [120, 168], head: -0.08, rot: -0.03, dx: 0, sx: 0.97, sy: 1.05, spread: 4 },
    sad: { mic: [20, 140], free: [8, 120], head: 0.12, rot: 0, dx: 0, sx: 1, sy: 0.97, spread: 0 },
    dead: { mic: [15, 40], free: [5, 20], head: 0.35, rot: -0.22, dx: -10, sx: 1.04, sy: 0.86, spread: 10 },
  };
  function pose(k) {
    const base = POSE[k.pose] || POSE.idle;
    const snap = k.pose === 'idle' || k.pose === 'dead' ? 0 : Math.exp(-k.pt * 18);
    const amp = 1 + 0.55 * snap;
    const bp = U.mod(k.beat || 0, 1);
    const bop = k.pose === 'idle' ? Math.exp(-bp * 6) : 0;
    return {
      dx: base.dx * amp,
      dy: bop * 3,
      rot: base.rot * amp,
      sx: 1 + (base.sx - 1) * amp + bop * 0.02,
      sy: 1 + (base.sy - 1) * amp - bop * 0.045,
      head: base.head * amp + bop * 0.03,
      headDy: bop * 4,
      mic: base.mic,
      free: base.free,
      spread: base.spread,
      bop,
      snap,
    };
  }
  // Face expression from the pose state.
  function expr(k) {
    const blink = U.mod(k.t || 0, 3.7) < 0.12;
    if (k.pose === 'dead') return { eyes: 'x', mouth: 'frown', brow: 'sad' };
    if (k.miss || k.pose === 'sad') return { eyes: 'shut', mouth: 'frown', brow: 'sad' };
    if (k.talk) return { eyes: blink ? 'shut' : 'open', mouth: Math.floor((k.t || 0) * 11) % 2 ? 'open' : 'small', brow: 'up' };
    if (k.pose === 'hey') return { eyes: 'happy', mouth: 'open', brow: 'up' };
    if (k.pose === 'idle') return { eyes: blink ? 'shut' : 'open', mouth: 'smile', brow: 'flat' };
    return { eyes: 'open', mouth: k.pose === 'up' ? 'o' : k.pose === 'down' ? 'wide' : 'open', brow: k.pose === 'down' ? 'angry' : 'up' };
  }

  // ---------- face parts ----------
  function eye(ctx, x, y, rx, ry, kind, c, look) {
    look = look || [rx * 0.25, ry * 0.1];
    if (kind === 'shut' || kind === 'happy') {
      ctx.beginPath();
      if (kind === 'happy') ctx.arc(x, y + ry * 0.3, rx * 0.9, Math.PI * 1.1, Math.PI * 1.9);
      else ctx.arc(x, y - ry * 0.2, rx * 0.9, Math.PI * 0.15, Math.PI * 0.85);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.stroke();
      return;
    }
    if (kind === 'x') {
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(x - rx * 0.7, y - rx * 0.7);
      ctx.lineTo(x + rx * 0.7, y + rx * 0.7);
      ctx.moveTo(x + rx * 0.7, y - rx * 0.7);
      ctx.lineTo(x - rx * 0.7, y + rx * 0.7);
      ctx.stroke();
      return;
    }
    D.ellipse(ctx, x, y, rx, ry, 0, c('#ffffff'), 3.5);
    D.circle(ctx, x + look[0], y + look[1], Math.min(rx, ry) * 0.58, INK, 0);
    D.circle(ctx, x + look[0] - rx * 0.18, y + look[1] - ry * 0.2, Math.min(rx, ry) * 0.2, '#ffffff', 0);
  }
  function brow(ctx, x1, y1, x2, y2, kind, w, color) {
    let a = 0;
    if (kind === 'sad') a = -5;
    else if (kind === 'angry') a = 6;
    else if (kind === 'up') a = -2;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + (x1 < x2 ? 0 : a));
    ctx.lineTo(x2, y2 + (x1 < x2 ? a : 0));
    ctx.lineWidth = w || 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color || INK;
    ctx.stroke();
  }
  function mouth(ctx, x, y, w, kind, c, lip) {
    const dark = c('#4a0d1e');
    if (kind === 'smile' || kind === 'frown' || kind === 'small') {
      ctx.beginPath();
      if (kind === 'smile') ctx.arc(x, y - w * 0.35, w * 0.5, Math.PI * 0.2, Math.PI * 0.8);
      else if (kind === 'frown') ctx.arc(x, y + w * 0.35, w * 0.45, Math.PI * 1.2, Math.PI * 1.8);
      else ctx.arc(x, y - w * 0.15, w * 0.3, Math.PI * 0.15, Math.PI * 0.85);
      ctx.lineWidth = lip ? 6 : 4;
      ctx.lineCap = 'round';
      ctx.strokeStyle = lip ? c(lip) : INK;
      ctx.stroke();
      return;
    }
    if (kind === 'o') {
      D.ellipse(ctx, x, y + w * 0.1, w * 0.26, w * 0.34, 0, dark, 4, lip ? c(lip) : INK);
      return;
    }
    const open = kind === 'wide' ? 0.75 : 0.55;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y - w * 0.05);
    ctx.quadraticCurveTo(x, y - w * 0.18, x + w / 2, y - w * 0.05);
    ctx.quadraticCurveTo(x + w * 0.35, y + w * open * 1.3, x, y + w * open * 1.25);
    ctx.quadraticCurveTo(x - w * 0.35, y + w * open * 1.3, x - w / 2, y - w * 0.05);
    ctx.closePath();
    D.paint(ctx, dark, lip ? 5 : 4, lip ? c(lip) : INK);
    ctx.save();
    ctx.clip();
    D.ellipse(ctx, x + w * 0.05, y + w * open * 1.15, w * 0.3, w * 0.22, 0, c('#ff6f8e'), 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - w / 2, y - w * 0.2, w, w * 0.16);
    ctx.restore();
  }
  function mic(ctx, x, y, ang, c, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    D.rect(ctx, -5, -2, 26, 10, 4, c('#2b2b36'), 4);
    D.circle(ctx, 28, 3, 10, c(color || '#b8bfcc'), 4);
    ctx.strokeStyle = 'rgba(20,15,31,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(22, 3);
    ctx.lineTo(34, 3);
    ctx.moveTo(28, -5);
    ctx.lineTo(28, 11);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- generic humanoid ----------
  // S describes proportions/colors; S.head draws the head centered at 0,0; S.body draws the torso.
  function human(ctx, k, S) {
    const c = k.c;
    const P = pose(k);
    ctx.save();
    ctx.translate(P.dx, P.dy);
    ctx.rotate(P.rot);
    ctx.scale(P.sx, P.sy);
    const hipY = -S.leg, shY = hipY - S.torso;
    // legs + shoes
    for (const side of [-1, 1]) {
      const hx = side * S.gap, fx = side * (S.gap + P.spread) + (k.pose === 'dead' ? side * 6 : 0);
      D.limb(ctx, hx, hipY + 8, fx, -12, S.legW, c(S.pants));
      if (S.shoe) S.shoe(ctx, c, fx, side);
      else {
        D.rect(ctx, fx - 14, -16, 38, 18, 8, c(S.shoes || '#ffffff'), 4.5);
        D.rect(ctx, fx - 14, -6, 38, 6, 3, c(S.sole || '#ffffff'), 3);
      }
    }
    // torso
    S.body(ctx, k, P, hipY, shY, c);
    // mic arm
    const msx = -S.shoulder * 0.42, msy = shY + 12;
    const [mex, mey] = D.dir(msx, msy, P.mic[0], S.upper);
    const [mhx, mhy] = D.dir(mex, mey, P.mic[1], S.lower);
    D.limb2(ctx, msx, msy, mex, mey, mhx, mhy, S.armW, c(S.skin));
    if (S.sleeve) D.limb2(ctx, msx, msy, mex, mey, ...D.dir(mex, mey, P.mic[1], S.lower * S.sleeveLen), S.armW + 5, c(S.sleeve));
    // head
    const headCX = S.headX || 0, headCY = shY - S.neck - S.headR * 0.8 + P.headDy;
    ctx.save();
    ctx.translate(headCX, shY - S.neck + P.headDy);
    ctx.rotate(P.head);
    ctx.translate(0, -S.headR * 0.8);
    S.head(ctx, k, c);
    ctx.restore();
    // mic + its hand, in front of the face
    if (S.hasMic !== false) {
      const mx = headCX + S.headR * 0.55, my = headCY + S.headR * 0.5;
      const ang = Math.atan2(my - mhy, mx - mhx);
      if (k.pose !== 'dead') mic(ctx, mhx, mhy, ang, c, S.micColor);
    }
    (S.hand || hand)(ctx, mhx, mhy, c, S);
    // free arm in front
    const fsx = S.shoulder * 0.38, fsy = shY + 12;
    const [fex, fey] = D.dir(fsx, fsy, P.free[0], S.upper);
    const [fhx, fhy] = D.dir(fex, fey, P.free[1], S.lower);
    D.limb2(ctx, fsx, fsy, fex, fey, fhx, fhy, S.armW, c(S.skin));
    if (S.sleeve) D.limb2(ctx, fsx, fsy, fex, fey, ...D.dir(fex, fey, P.free[1], S.lower * S.sleeveLen), S.armW + 5, c(S.sleeve));
    (S.hand || hand)(ctx, fhx, fhy, c, S);
    if (S.extra) S.extra(ctx, k, P, c, { hipY, shY, headCX, headCY });
    ctx.restore();
  }
  function hand(ctx, x, y, c, S) {
    D.circle(ctx, x, y, S.armW * 0.62, c(S.handColor || S.skin), 4);
  }

  // ============================================================
  // NICO — the player. Mint hair, backwards yellow cap, purple hoodie.
  // ============================================================
  const NICO = {
    leg: 58, legW: 22, gap: 13, pants: '#2d2b55', shoes: '#ffffff', sole: '#3ff0c0',
    torso: 64, shoulder: 64, neck: 4, headR: 54, upper: 30, lower: 28, armW: 15,
    skin: '#f2b38a', sleeve: '#6b4cff', sleeveLen: 0.85,
    body(ctx, k, P, hipY, shY, c) {
      // hood bump behind the neck
      D.ellipse(ctx, -16, shY + 2, 26, 16, -0.2, c('#4f33d6'), 5);
      D.rect(ctx, -32, shY, 64, hipY - shY + 14, 18, c('#6b4cff'), 5);
      D.rect(ctx, -22, hipY - 18, 44, 22, 9, c('#5a3de8'), 3.5);
      // lightning emblem
      D.poly(ctx, [4, shY + 16, -8, shY + 34, 0, shY + 34, -6, shY + 48, 10, shY + 28, 2, shY + 28, 8, shY + 16], c('#ffd23f'), 3);
      ctx.strokeStyle = c('#ffffff');
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, shY + 6);
      ctx.lineTo(-10, shY + 22);
      ctx.moveTo(8, shY + 6);
      ctx.lineTo(9, shY + 20);
      ctx.stroke();
    },
    head(ctx, k, c) {
      const R = 54, e = expr(k);
      // spiky back hair
      D.poly(ctx, [-R * 0.4, -R * 0.62, -R * 1.55, -R * 0.42, -R * 0.85, -R * 0.12, -R * 1.62, R * 0.12, -R * 0.8, R * 0.28, -R * 1.28, R * 0.7, -R * 0.3, R * 0.48], c('#3ff0c0'), 5);
      D.ellipse(ctx, R * 0.05, 0, R, R * 0.96, 0, c('#f2b38a'), 5);
      D.ellipse(ctx, -R * 0.46, R * 0.14, R * 0.12, R * 0.17, 0, c('#e89c72'), 4);
      // cap, worn backwards
      ctx.beginPath();
      ctx.moveTo(-R * 0.98, -R * 0.3);
      ctx.quadraticCurveTo(-R * 0.95, -R * 1.18, R * 0.1, -R * 1.12);
      ctx.quadraticCurveTo(R * 0.98, -R * 1.02, R * 1.0, -R * 0.36);
      ctx.quadraticCurveTo(0, -R * 0.52, -R * 0.98, -R * 0.3);
      D.paint(ctx, c('#ffd23f'), 5);
      D.poly(ctx, [-R * 0.8, -R * 0.5, -R * 1.62, -R * 0.5, -R * 1.68, -R * 0.27, -R * 0.84, -R * 0.24], c('#e8b10f'), 5);
      D.circle(ctx, R * 0.22, -R * 0.78, R * 0.15, c('#6b4cff'), 3.5);
      // bangs
      // tuft through the strap opening + bangs
      D.poly(ctx, [R * 0.3, -R * 0.62, R * 0.34, -R * 1.02, R * 0.52, -R * 0.74, R * 0.74, -R * 1.0, R * 0.78, -R * 0.62], c('#3ff0c0'), 4.5);
      D.poly(ctx, [R * 0.05, -R * 0.5, R * 0.24, -R * 0.17, R * 0.4, -R * 0.46, R * 0.58, -R * 0.15, R * 0.72, -R * 0.44, R * 0.98, -R * 0.2, R * 1.0, -R * 0.42], c('#3ff0c0'), 4.5);
      eye(ctx, R * 0.18, R * 0.04, R * 0.16, R * 0.23, e.eyes, c, [R * 0.05, R * 0.03]);
      eye(ctx, R * 0.6, R * 0.04, R * 0.14, R * 0.21, e.eyes, c, [R * 0.04, R * 0.03]);
      brow(ctx, R * 0.04, -R * 0.26, R * 0.3, -R * 0.29, e.brow, 5);
      brow(ctx, R * 0.48, -R * 0.29, R * 0.72, -R * 0.25, e.brow, 5);
      ctx.beginPath();
      ctx.arc(R * 0.9, R * 0.22, R * 0.08, -Math.PI * 0.4, Math.PI * 0.5);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      D.ellipse(ctx, R * 0.76, R * 0.38, R * 0.12, R * 0.07, 0, 'rgba(255,90,120,0.35)', 0);
      mouth(ctx, R * 0.5, R * 0.52, R * 0.42, e.mouth, c);
    },
  };

  // ============================================================
  // OPPONENT SPECS (generic humanoids)
  // ============================================================
  const TUERCA = {
    leg: 78, legW: 28, gap: 16, pants: '#5b2a86', shoes: '#ffffff', sole: '#ff8a1f',
    torso: 78, shoulder: 76, neck: 6, headR: 50, upper: 36, lower: 34, armW: 17,
    skin: '#8d5524', sleeve: '#ff8a1f', sleeveLen: 0.9,
    body(ctx, k, P, hipY, shY, c) {
      D.rect(ctx, -38, shY, 76, hipY - shY + 18, 16, c('#ff8a1f'), 5);
      ctx.fillStyle = c('#ffffff');
      ctx.fillRect(-3, shY + 4, 6, hipY - shY + 10);
      ctx.fillRect(-36, shY + 20, 8, hipY - shY - 10);
      D.rect(ctx, -38, hipY + 2, 76, 16, 7, c('#e06f0a'), 4);
      // gold chain + headphones
      ctx.beginPath();
      ctx.arc(2, shY + 8, 24, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 8;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.strokeStyle = c('#ffd23f');
      ctx.stroke();
      D.circle(ctx, 2, shY + 33, 7, c('#ffd23f'), 3.5);
      D.ellipse(ctx, -22, shY - 2, 11, 14, 0, c('#1fd2ff'), 4);
      D.ellipse(ctx, 22, shY - 2, 11, 14, 0, c('#1fd2ff'), 4);
    },
    head(ctx, k, c) {
      const R = 50, e = expr(k);
      // afro
      const pts = [];
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const rr = R * (1.32 + (i % 2) * 0.1);
        pts.push(-R * 0.12 + Math.cos(a) * rr, -R * 0.42 + Math.sin(a) * rr * 0.92);
      }
      D.blob(ctx, pts, c('#2b1a12'), 5);
      // pick comb
      D.rect(ctx, -R * 1.1, -R * 1.5, R * 0.22, R * 0.6, 4, c('#ff3d5e'), 3.5);
      D.ellipse(ctx, R * 0.08, R * 0.05, R * 0.92, R * 0.95, 0, c('#8d5524'), 5);
      D.ellipse(ctx, -R * 0.36, R * 0.1, R * 0.16, R * 0.22, 0, c('#7a4720'), 4);
      // shades
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-R * 0.05, -R * 0.2);
      ctx.lineTo(R * 1.02, -R * 0.24);
      ctx.lineTo(R * 0.95, R * 0.1);
      ctx.quadraticCurveTo(R * 0.72, R * 0.22, R * 0.55, R * 0.08);
      ctx.quadraticCurveTo(R * 0.25, R * 0.25, R * 0.0, R * 0.06);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, -R * 0.2, R, R * 0.2);
      g.addColorStop(0, c('#120c1c'));
      g.addColorStop(0.55, c('#3d1f5c'));
      g.addColorStop(1, c('#ff3fa4'));
      D.paint(ctx, g, 5);
      ctx.restore();
      if (e.eyes === 'x') eye(ctx, R * 0.5, -R * 0.05, R * 0.14, R * 0.14, 'x', c);
      brow(ctx, R * 0.02, -R * 0.36, R * 0.4, -R * 0.4, e.brow, 6);
      brow(ctx, R * 0.56, -R * 0.4, R * 0.92, -R * 0.36, e.brow, 6);
      D.ellipse(ctx, R * 0.86, R * 0.28, R * 0.12, R * 0.09, 0, c('#6e3c14'), 3);
      mouth(ctx, R * 0.52, R * 0.55, R * 0.5, e.mouth === 'smile' ? 'open' : e.mouth, c);
      if (e.mouth !== 'frown') D.rect(ctx, R * 0.56, R * 0.48, R * 0.1, R * 0.1, 2, c('#ffd23f'), 2);
      D.ellipse(ctx, R * 0.5, R * 0.95, R * 0.12, R * 0.08, 0, c('#2b1a12'), 3);
    },
  };

  const CATRIN = {
    leg: 80, legW: 18, gap: 12, pants: '#4b1f8f', torso: 82, shoulder: 62, neck: 8, headR: 50, upper: 36, lower: 34, armW: 13,
    skin: '#f4efe3', sleeve: '#6c2bd9', sleeveLen: 0.92, handColor: '#f4efe3',
    shoe(ctx, c, fx) {
      D.poly(ctx, [fx - 12, -16, fx + 12, -16, fx + 34, -4, fx + 30, 0, fx - 12, 0], c('#14101c'), 4.5);
    },
    hand(ctx, x, y, c) {
      D.circle(ctx, x, y, 8, c('#f4efe3'), 3.5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(x + 4, y + i * 4);
        ctx.lineTo(x + 12, y + i * 5);
      }
      ctx.stroke();
    },
    body(ctx, k, P, hipY, shY, c) {
      // coat tails
      D.poly(ctx, [-30, hipY - 6, -46, hipY + 46, -18, hipY + 30, -6, hipY + 4], c('#5a22b8'), 5);
      D.rect(ctx, -31, shY, 62, hipY - shY + 14, 14, c('#6c2bd9'), 5);
      D.poly(ctx, [-10, shY + 2, 12, shY + 2, 1, shY + 44], c('#ffffff'), 3.5);
      D.poly(ctx, [-10, shY + 2, -20, shY + 30, 1, shY + 46], c('#4b1f8f'), 3.5);
      D.poly(ctx, [12, shY + 2, 22, shY + 30, 1, shY + 46], c('#4b1f8f'), 3.5);
      D.poly(ctx, [-9, shY + 2, 1, shY + 9, 11, shY + 2, 11, shY + 16, 1, shY + 9, -9, shY + 16], c('#14101c'), 2.5);
      // marigold on the lapel
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        D.circle(ctx, 16 + Math.cos(a) * 5, shY + 22 + Math.sin(a) * 5, 4.5, c('#ff9f1c'), 2);
      }
      D.circle(ctx, 16, shY + 22, 3.5, c('#ffd23f'), 2);
      for (let i = 0; i < 3; i++) D.circle(ctx, 3, shY + 52 + i * 12, 2.6, c('#ffd23f'), 1.5);
    },
    head(ctx, k, c) {
      const R = 50, e = expr(k);
      const jawOpen = e.mouth === 'open' || e.mouth === 'wide' || e.mouth === 'o' ? (e.mouth === 'wide' ? 16 : 11) : 0;
      // jaw (moves when singing)
      D.rect(ctx, -R * 0.15, R * 0.42 + jawOpen, R * 0.95, R * 0.42, 14, c('#e9e2d2'), 5);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.moveTo(R * (0.02 + i * 0.16), R * 0.45 + jawOpen);
        ctx.lineTo(R * (0.02 + i * 0.16), R * 0.62 + jawOpen);
      }
      ctx.stroke();
      // skull
      ctx.beginPath();
      ctx.moveTo(-R * 0.9, R * 0.1);
      ctx.quadraticCurveTo(-R * 1.0, -R * 1.0, R * 0.15, -R * 0.98);
      ctx.quadraticCurveTo(R * 1.08, -R * 0.9, R * 1.0, R * 0.12);
      ctx.quadraticCurveTo(R * 0.95, R * 0.55, R * 0.6, R * 0.55);
      ctx.lineTo(-R * 0.4, R * 0.55);
      ctx.quadraticCurveTo(-R * 0.85, R * 0.5, -R * 0.9, R * 0.1);
      D.paint(ctx, c('#f4efe3'), 5);
      if (jawOpen) D.rect(ctx, -R * 0.12, R * 0.5, R * 0.9, jawOpen + 2, 4, c('#2a0f30'), 0);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        ctx.moveTo(R * (0.02 + i * 0.16), R * 0.36);
        ctx.lineTo(R * (0.02 + i * 0.16), R * 0.55);
      }
      ctx.stroke();
      // calavera decorations
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        D.circle(ctx, R * 0.22 + Math.cos(a) * R * 0.3, -R * 0.05 + Math.sin(a) * R * 0.33, 3.2, c(i % 2 ? '#ff3fa4' : '#1fd2ff'), 0);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        D.ellipse(ctx, R * 0.35 + Math.cos(a) * 9, -R * 0.62 + Math.sin(a) * 9, 7, 4, a, c('#ff9f1c'), 2);
      }
      D.circle(ctx, R * 0.35, -R * 0.62, 4, c('#ffd23f'), 2);
      // sockets
      const sock = (x, rx) => {
        D.ellipse(ctx, x, -R * 0.05, rx, R * 0.22, 0, c('#1a1426'), 4);
        if (e.eyes === 'x') eye(ctx, x, -R * 0.05, rx * 0.8, rx * 0.8, 'x', c);
        else if (e.eyes !== 'shut' && e.eyes !== 'happy') {
          D.circle(ctx, x + 3, -R * 0.03, rx * 0.42, '#ffd23f', 0);
          D.circle(ctx, x + 3, -R * 0.03, rx * 0.18, '#fff7c2', 0);
        } else {
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x - rx * 0.5, -R * 0.03);
          ctx.lineTo(x + rx * 0.5, -R * 0.03);
          ctx.stroke();
        }
      };
      sock(R * 0.1, R * 0.2);
      sock(R * 0.6, R * 0.18);
      D.poly(ctx, [R * 0.82, R * 0.16, R * 0.9, R * 0.3, R * 0.74, R * 0.3], c('#1a1426'), 2.5);
      // top hat
      ctx.save();
      ctx.rotate(-0.12);
      D.rect(ctx, -R * 0.62, -R * 1.95, R * 1.18, R * 1.05, 6, c('#1b1424'), 5);
      D.rect(ctx, -R * 0.62, -R * 1.2, R * 1.18, R * 0.24, 3, c('#6c2bd9'), 4);
      D.rect(ctx, -R * 1.02, -R * 1.0, R * 1.98, R * 0.2, 8, c('#1b1424'), 5);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        D.circle(ctx, R * 0.32 + Math.cos(a) * 7, -R * 1.08 + Math.sin(a) * 7, 6, c('#ff9f1c'), 2);
      }
      D.circle(ctx, R * 0.32, -R * 1.08, 5, c('#ffd23f'), 2);
      ctx.restore();
    },
  };

  const VERA = {
    leg: 74, legW: 20, gap: 12, pants: '#2b1846', torso: 64, shoulder: 66, neck: 8, headR: 48, upper: 32, lower: 30, armW: 13,
    skin: '#fcd5b5', sleeve: '#d8d8ec', sleeveLen: 0.8, micColor: '#ff3fa4',
    shoe(ctx, c, fx) {
      D.rect(ctx, fx - 13, -26, 30, 26, 6, c('#ff3fa4'), 4.5);
      D.rect(ctx, fx - 15, -9, 36, 9, 4, c('#9b1d63'), 3.5);
    },
    body(ctx, k, P, hipY, shY, c) {
      D.poly(ctx, [-30, hipY - 4, 30, hipY - 4, 40, hipY + 26, -40, hipY + 26], c('#14101c'), 5);
      D.rect(ctx, -26, shY + 8, 52, hipY - shY - 4, 12, c('#ff3fa4'), 4);
      // sequin jacket with shoulder pads
      D.poly(ctx, [-40, shY - 2, -14, shY - 4, -18, hipY - 4, -34, hipY - 8], c('#d8d8ec'), 5);
      D.poly(ctx, [40, shY - 2, 14, shY - 4, 18, hipY - 4, 34, hipY - 8], c('#d8d8ec'), 5);
      const r = U.rng(5);
      for (let i = 0; i < 14; i++) D.circle(ctx, (r() < 0.5 ? -1 : 1) * (18 + r() * 18), shY + 6 + r() * (hipY - shY - 14), 2, '#ffffff', 0);
      D.poly(ctx, [0, shY + 20, 6, shY + 32, 0, shY + 44, -6, shY + 32], c('#ffd23f'), 2.5);
    },
    head(ctx, k, c) {
      const R = 48, e = expr(k);
      const sway = Math.sin((k.t || 0) * 2.2) * 3;
      // huge hair
      D.blob(ctx, [-R * 1.5, -R * 0.2, -R * 1.3, -R * 1.4, -R * 0.2, -R * 1.9 + sway, R * 1.0, -R * 1.55, R * 1.35, -R * 0.6, R * 0.9, -R * 0.2, -R * 0.2, R * 0.1, -R * 1.3, R * 1.4, -R * 1.7, R * 0.7], c('#ff3fa4'), 5);
      D.blob(ctx, [-R * 1.0, -R * 1.0, -R * 0.2, -R * 1.55 + sway, R * 0.6, -R * 1.25, -R * 0.1, -R * 1.05], c('#ff8ccc'), 0);
      D.ellipse(ctx, R * 0.08, R * 0.05, R * 0.9, R * 0.95, 0, c('#fcd5b5'), 5);
      // bangs swoop
      ctx.beginPath();
      ctx.moveTo(-R * 0.6, -R * 0.65);
      ctx.quadraticCurveTo(R * 0.5, -R * 1.3, R * 1.05, -R * 0.2);
      ctx.quadraticCurveTo(R * 0.4, -R * 0.55, -R * 0.2, -R * 0.35);
      ctx.closePath();
      D.paint(ctx, c('#ff3fa4'), 4.5);
      // star clip
      const st = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 6 : 14;
        st.push(-R * 0.55 + Math.cos(a) * rr, -R * 0.75 + Math.sin(a) * rr);
      }
      D.poly(ctx, st, c('#ffd23f'), 3);
      // eye shadow + lashes
      D.ellipse(ctx, R * 0.2, -R * 0.06, R * 0.22, R * 0.2, 0, c('#b06bff'), 0);
      D.ellipse(ctx, R * 0.62, -R * 0.06, R * 0.2, R * 0.19, 0, c('#b06bff'), 0);
      eye(ctx, R * 0.2, R * 0.02, R * 0.15, R * 0.2, e.eyes, c, [R * 0.05, R * 0.03]);
      eye(ctx, R * 0.62, R * 0.02, R * 0.13, R * 0.18, e.eyes, c, [R * 0.04, R * 0.03]);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(R * 0.74, -R * 0.12);
      ctx.lineTo(R * 0.86, -R * 0.2);
      ctx.moveTo(R * 0.06, -R * 0.14);
      ctx.lineTo(-R * 0.04, -R * 0.24);
      ctx.stroke();
      D.ellipse(ctx, R * 0.78, R * 0.36, R * 0.12, R * 0.07, 0, 'rgba(255,60,140,0.35)', 0);
      mouth(ctx, R * 0.5, R * 0.52, R * 0.38, e.mouth, c, '#d1006b');
      ctx.beginPath();
      ctx.arc(-R * 0.38, R * 0.58, R * 0.14, 0, Math.PI * 2);
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = c('#ffd23f');
      ctx.stroke();
    },
  };

  // ============================================================
  // LUNA — sits on the speakers (front view). Also the tutorial opponent.
  // ============================================================
  function speakers(ctx, k, c) {
    const bop = Math.exp(-U.mod(k.beat || 0, 1) * 7);
    D.rect(ctx, -160, -158, 320, 158, 14, c('#2a2833'), 6);
    D.rect(ctx, -160, -158, 320, 16, 8, c('#3b3946'), 5);
    for (const sx of [-82, 82]) {
      const r = 50 * (1 + bop * 0.07);
      D.circle(ctx, sx, -72, 56, c('#17161d'), 5);
      D.circle(ctx, sx, -72, r * 0.86, c('#3a3946'), 4);
      D.circle(ctx, sx, -72, r * 0.36, c('#22212a'), 4);
      D.circle(ctx, sx - 8, -80, r * 0.12, 'rgba(255,255,255,0.18)', 0);
    }
    D.circle(ctx, 0, -110, 14, c('#17161d'), 4);
    D.circle(ctx, 0, -110, 7, c('#55536a'), 2);
    D.rect(ctx, -22, -40, 44, 16, 4, c('#ffb627'), 3);
    D.circle(ctx, 0, -60, 4, bop > 0.5 ? '#3ef06e' : '#1b5e33', 2);
  }
  function lunaHead(ctx, k, c, R) {
    const e = expr(k);
    const sway = Math.sin((k.t || 0) * 1.8) * 4;
    D.blob(ctx, [-R * 1.25, -R * 0.4, -R * 0.9, -R * 1.25, 0, -R * 1.35, R * 0.9, -R * 1.25, R * 1.25, -R * 0.4, R * 1.35 + sway, R * 1.4, R * 0.9, R * 2.3, -R * 0.9, R * 2.3, -R * 1.35 + sway, R * 1.4], c('#2a2350'), 5);
    ctx.strokeStyle = c('#4a3d86');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-R * 0.95, R * 0.1);
    ctx.quadraticCurveTo(-R * 1.2 + sway, R * 1.1, -R * 0.75, R * 2.0);
    ctx.moveTo(R * 0.95, R * 0.1);
    ctx.quadraticCurveTo(R * 1.2 + sway, R * 1.1, R * 0.75, R * 2.0);
    ctx.stroke();
    D.ellipse(ctx, 0, R * 0.08, R * 0.88, R * 0.98, 0, c('#f7cfae'), 5);
    // curtain bangs
    D.poly(ctx, [0, -R * 0.95, -R * 0.95, -R * 0.15, -R * 0.75, -R * 0.75], c('#2a2350'), 4);
    D.poly(ctx, [0, -R * 0.95, R * 0.95, -R * 0.15, R * 0.75, -R * 0.75], c('#2a2350'), 4);
    ctx.beginPath();
    ctx.moveTo(-R * 0.85, -R * 0.35);
    ctx.quadraticCurveTo(-R * 0.2, -R * 0.75, 0, -R * 0.95);
    ctx.quadraticCurveTo(R * 0.2, -R * 0.75, R * 0.85, -R * 0.35);
    ctx.lineTo(R * 0.6, -R * 0.95);
    ctx.lineTo(-R * 0.6, -R * 0.95);
    ctx.closePath();
    D.paint(ctx, c('#2a2350'), 0);
    // crescent moon clip
    ctx.save();
    ctx.translate(R * 0.62, -R * 0.62);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0.3 * Math.PI, 1.7 * Math.PI, false);
    ctx.arc(6, -2, 10, 1.6 * Math.PI, 0.4 * Math.PI, true);
    ctx.closePath();
    D.paint(ctx, c('#ffd23f'), 3);
    ctx.restore();
    const lx = e.eyes === 'open' ? R * 0.03 : 0;
    eye(ctx, -R * 0.36, R * 0.08, R * 0.17, R * 0.23, e.eyes, c, [lx, R * 0.03]);
    eye(ctx, R * 0.36, R * 0.08, R * 0.17, R * 0.23, e.eyes, c, [lx, R * 0.03]);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-R * 0.52, -R * 0.06);
    ctx.lineTo(-R * 0.62, -R * 0.14);
    ctx.moveTo(R * 0.52, -R * 0.06);
    ctx.lineTo(R * 0.62, -R * 0.14);
    ctx.stroke();
    brow(ctx, -R * 0.52, -R * 0.24, -R * 0.2, -R * 0.28, e.brow, 4);
    brow(ctx, R * 0.2, -R * 0.28, R * 0.52, -R * 0.24, e.brow, 4);
    D.ellipse(ctx, -R * 0.55, R * 0.42, R * 0.13, R * 0.08, 0, 'rgba(255,90,120,0.35)', 0);
    D.ellipse(ctx, R * 0.55, R * 0.42, R * 0.13, R * 0.08, 0, 'rgba(255,90,120,0.35)', 0);
    mouth(ctx, 0, R * 0.56, R * 0.36, e.mouth, c, '#e0244f');
    D.circle(ctx, -R * 0.88, R * 0.42, 4.5, c('#ffd23f'), 2.5);
    D.circle(ctx, R * 0.88, R * 0.42, 4.5, c('#ffd23f'), 2.5);
  }
  function drawLuna(ctx, k) {
    const c = k.c;
    speakers(ctx, k, c);
    const beat = k.beat || 0;
    const side = Math.floor(beat) % 2 ? 1 : -1;
    const bop = Math.exp(-U.mod(beat, 1) * 6);
    const singing = ['left', 'right', 'up', 'down'].includes(k.pose);
    const snap = singing ? Math.exp(-k.pt * 18) : 0;
    let lean = singing ? 0 : side * 0.05 * (1 - bop * 0.6);
    let lift = 0;
    let armsUp = k.pose === 'hey' || k.pose === 'up' ? 1 : 0;
    if (k.pose === 'left') lean = -0.12 * (1 + snap * 0.5);
    if (k.pose === 'right') lean = 0.12 * (1 + snap * 0.5);
    if (k.pose === 'up') lift = -10 * (1 + snap * 0.5);
    if (k.pose === 'down') lift = 10 * (1 + snap * 0.5);
    const seatY = -158;
    // legs dangling in front of the speaker, swinging with the beat
    const swing = Math.sin(beat * Math.PI) * 8;
    for (const s of [-1, 1]) {
      D.limb2(ctx, s * 18, seatY + 4, s * 22, seatY + 26, s * 20 + s * swing * 0.5, seatY + 92, 17, c('#f7cfae'));
      D.rect(ctx, s * 20 + s * swing * 0.5 - 14, seatY + 88, 28, 16, 7, c('#e0244f'), 4);
    }
    ctx.save();
    ctx.translate(0, seatY + 6 + lift + bop * 3);
    ctx.rotate(lean);
    // dress
    D.poly(ctx, [-26, -84, 26, -84, 44, 10, -44, 10], c('#ffb627'), 5);
    D.rect(ctx, -46, 0, 92, 18, 9, c('#f29e0c'), 4);
    ctx.strokeStyle = c('#f7cfae');
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-14, -84);
    ctx.lineTo(-16, -100);
    ctx.moveTo(14, -84);
    ctx.lineTo(16, -100);
    ctx.stroke();
    // arms
    for (const s of [-1, 1]) {
      const up = armsUp || (k.pose === 'left' && s < 0) || (k.pose === 'right' && s > 0);
      const sh = [s * 24, -78];
      let el, hd;
      if (k.pose === 'sad' && s > 0) {
        el = [s * 34, -40];
        hd = [s * 10, -112];
      } else if (up) {
        el = [s * 50, -110];
        hd = [s * 56, -150];
      } else {
        el = [s * 44, -40];
        hd = [s * 58, 2];
      }
      D.limb2(ctx, sh[0], sh[1], el[0], el[1], hd[0], hd[1], 13, c('#f7cfae'));
      D.circle(ctx, hd[0], hd[1], 8, c('#f7cfae'), 3.5);
    }
    ctx.save();
    ctx.translate(0, -96);
    ctx.rotate(lean * 0.6 + (singing ? 0 : side * 0.06 * bop));
    ctx.translate(0, -48);
    lunaHead(ctx, k, c, 46);
    ctx.restore();
    if (k.mic) mic(ctx, 40, -100, -2.4, c);
    ctx.restore();
  }

  // ============================================================
  // UNIDAD 808 — robot with a CRT face and a chest woofer
  // ============================================================
  function drawRobot(ctx, k) {
    const c = k.c;
    const P = pose(k);
    const e = expr(k);
    const singing = ['left', 'right', 'up', 'down'].includes(k.pose);
    ctx.save();
    ctx.translate(P.dx, P.dy);
    ctx.rotate(P.rot);
    ctx.scale(P.sx, P.sy);
    for (const s of [-1, 1]) {
      const fx = s * (24 + P.spread);
      D.rect(ctx, s * 24 - 12, -96, 24, 70, 6, c('#6c7884'), 5);
      D.rect(ctx, s * 24 - 16, -60, 32, 12, 4, c('#ffd23f'), 4);
      D.rect(ctx, fx - 24, -26, 52, 26, 8, c('#3c4450'), 5);
    }
    // torso
    D.rect(ctx, -60, -205, 120, 112, 18, c('#8d99a6'), 6);
    D.rect(ctx, -48, -112, 96, 16, 4, c('#ffd23f'), 4);
    ctx.save();
    D.rr(ctx, -48, -112, 96, 16, 4);
    ctx.clip();
    ctx.fillStyle = c('#14101c');
    for (let i = -60; i < 60; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, -96);
      ctx.lineTo(i + 8, -112);
      ctx.lineTo(i + 16, -112);
      ctx.lineTo(i + 8, -96);
      ctx.fill();
    }
    ctx.restore();
    const pump = singing ? 1 + 0.12 * Math.exp(-k.pt * 10) : 1 + 0.06 * P.bop;
    D.circle(ctx, 0, -158, 34, c('#2b313a'), 5);
    D.circle(ctx, 0, -158, 25 * pump, c('#55606c'), 4);
    D.circle(ctx, 0, -158, 9 * pump, c('#1a1e24'), 3);
    D.circle(ctx, 44, -192, 5, (k.t || 0) % 1 < 0.5 ? '#ff3d5e' : '#5c1020', 2);
    // arms
    const arm = (sx, a) => {
      const [ex, ey] = D.dir(sx, -190, a[0], 40);
      const [hx, hy] = D.dir(ex, ey, a[1], 38);
      D.limb2(ctx, sx, -190, ex, ey, hx, hy, 16, c('#6c7884'));
      D.circle(ctx, ex, ey, 9, c('#ffd23f'), 3.5);
      D.circle(ctx, hx, hy, 12, c('#3c4450'), 4);
      return [hx, hy];
    };
    const mh = arm(-50, P.mic);
    // CRT head
    ctx.save();
    ctx.translate(0, -212 + P.headDy);
    ctx.rotate(P.head);
    D.limb(ctx, 16, -78, 24, -112, 5, c('#3c4450'));
    D.circle(ctx, 24, -116, 8, (k.t || 0) % 0.6 < 0.3 ? '#ff3d5e' : '#ffd23f', 3.5);
    D.circle(ctx, -56, -40, 11, c('#ffd23f'), 4);
    D.circle(ctx, 60, -40, 11, c('#ffd23f'), 4);
    D.rect(ctx, -54, -84, 110, 84, 16, c('#9aa5b1'), 6);
    D.rect(ctx, -42, -74, 86, 62, 10, c('#08140e'), 4);
    // pixel face
    const px = (x, y, w, h) => {
      ctx.fillStyle = e.eyes === 'x' ? '#ff3d5e' : k.miss ? '#ff9f1c' : '#39ff88';
      ctx.fillRect(x, y, w, h);
    };
    if (e.eyes === 'x') {
      for (const ox of [-20, 18]) for (let i = -2; i <= 2; i++) {
        px(ox + i * 3, -54 + i * 3, 4, 4);
        px(ox - i * 3, -54 + i * 3, 4, 4);
      }
    } else if (e.eyes === 'shut' || e.eyes === 'happy') {
      px(-26, -52, 16, 4);
      px(12, -52, 16, 4);
    } else {
      px(-26, -62, 12, 16);
      px(12, -62, 12, 16);
    }
    if (singing || e.mouth === 'open') {
      for (let i = 0; i < 6; i++) {
        const h = 4 + Math.abs(Math.sin((k.t || 0) * 22 + i * 1.7)) * 14;
        px(-22 + i * 8, -22 - h, 6, h);
      }
    } else if (e.mouth === 'frown') {
      px(-14, -26, 30, 4);
      px(-18, -22, 4, 4);
      px(16, -22, 4, 4);
    } else {
      px(-16, -24, 34, 4);
    }
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    for (let y = -72; y < -14; y += 4) ctx.fillRect(-40, y, 82, 1.5);
    ctx.globalAlpha = 1;
    ctx.restore();
    if (k.pose !== 'dead') mic(ctx, mh[0], mh[1], -1.1, c, '#ffd23f');
    arm(50, P.free);
    ctx.restore();
  }

  // ============================================================
  // REY MAGMA — huge lava golem with horns and flaming hair
  // ============================================================
  function drawMagma(ctx, k) {
    const c = k.c;
    const P = pose(k);
    const e = expr(k);
    const t = k.t || 0;
    ctx.save();
    ctx.translate(P.dx, P.dy);
    ctx.rotate(P.rot);
    ctx.scale(P.sx, P.sy);
    const rock = c('#3b2b2b'), rock2 = c('#2a1d1d'), lava = c('#ff7b1c');
    const glow = (pts) => {
      ctx.save();
      ctx.shadowColor = '#ff7b1c';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = lava;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
      ctx.restore();
    };
    for (const s of [-1, 1]) {
      D.poly(ctx, [s * 14, -120, s * 62, -120, s * (64 + P.spread), -6, s * (12 + P.spread), -6], rock, 6);
      glow([s * 30, -110, s * 40, -70, s * 32, -40]);
      D.rect(ctx, s * (38 + P.spread) - 34, -22, 68, 22, 10, rock2, 5);
    }
    // torso
    D.poly(ctx, [-96, -300, 96, -300, 66, -112, -66, -112], rock, 6);
    D.poly(ctx, [-70, -128, 70, -128, 76, -96, -76, -96], rock2, 5);
    glow([-40, -280, -20, -230, -42, -190, -18, -150]);
    glow([46, -276, 30, -226, 52, -180]);
    glow([-4, -250, 10, -212, 0, -180]);
    // arms
    const arm = (sx, a, fist) => {
      const [ex, ey] = D.dir(sx, -282, a[0], 62);
      const [hx, hy] = D.dir(ex, ey, a[1], 58);
      D.limb2(ctx, sx, -282, ex, ey, hx, hy, 40, rock);
      glow([sx, -270, (sx + ex) / 2 + 6, (ey - 282) / 2, ex, ey]);
      D.circle(ctx, hx, hy, 26, rock2, 6);
      if (fist) glow([hx - 12, hy - 4, hx + 10, hy + 6]);
      return [hx, hy];
    };
    const mh = arm(-80, P.mic, false);
    // head
    ctx.save();
    ctx.translate(4, -300 + P.headDy);
    ctx.rotate(P.head);
    // flaming hair
    for (let i = 0; i < 7; i++) {
      const x = -54 + i * 18;
      const h = 60 + Math.sin(t * 9 + i * 1.9) * 16 + (i % 2) * 20;
      const pts = [x - 16, -70, x, -70 - h, x + 16, -70];
      D.poly(ctx, pts, c(i % 2 ? '#ff9f1c' : '#ff4b1f'), 4);
      D.poly(ctx, [x - 7, -70, x, -70 - h * 0.55, x + 7, -70], c('#ffe066'), 0);
    }
    // horns
    D.poly(ctx, [-50, -80, -96, -120, -112, -176, -84, -128, -36, -100], c('#e8dcc0'), 5);
    D.poly(ctx, [50, -80, 98, -118, 116, -176, 88, -126, 36, -100], c('#e8dcc0'), 5);
    D.poly(ctx, [-66, -96, -6, -112, 64, -96, 74, -30, 52, 6, -46, 6, -72, -30], rock, 6);
    glow([-50, -86, -30, -60, -44, -40]);
    // brow ridge + eyes
    D.poly(ctx, [-56, -64, 66, -64, 60, -46, -50, -46], rock2, 4);
    const eyeCol = e.eyes === 'x' ? '#666' : '#ffe066';
    if (e.eyes === 'x') {
      eye(ctx, -14, -36, 12, 12, 'x', c);
      eye(ctx, 36, -36, 12, 12, 'x', c);
    } else {
      ctx.save();
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 14;
      const h = e.eyes === 'shut' ? 2 : 7;
      D.poly(ctx, [-30, -40 - h, 2, -40 - h * 0.4, 2, -36, -30, -36], eyeCol, 0);
      D.poly(ctx, [22, -40 - h * 0.4, 54, -40 - h, 54, -36, 22, -36], eyeCol, 0);
      ctx.restore();
    }
    // jaw
    const open = e.mouth === 'open' || e.mouth === 'wide' || e.mouth === 'o' ? (e.mouth === 'wide' ? 26 : 18) : 4;
    D.rect(ctx, -34, -20, 76, 18 + open, 8, c('#3a0a05'), 5);
    ctx.save();
    ctx.shadowColor = '#ff7b1c';
    ctx.shadowBlur = 16;
    D.rect(ctx, -26, -12, 60, open + 2, 6, c('#ff7b1c'), 0);
    ctx.restore();
    for (let i = 0; i < 5; i++) D.poly(ctx, [-30 + i * 15, -20, -22 + i * 15, -20, -26 + i * 15, -10], '#fff6e0', 2);
    ctx.restore();
    if (k.pose !== 'dead') mic(ctx, mh[0] + 6, mh[1] - 12, -1.3, c, '#5a5a5a');
    arm(80, P.free, true);
    ctx.restore();
  }

  // ============================================================
  // EL SILENCIO — cloaked shadow with a floating white mask
  // ============================================================
  function drawSilencio(ctx, k) {
    const c = k.c;
    const P = pose(k);
    const e = expr(k);
    const t = k.t || 0;
    const phase2 = !!k.phase2;
    ctx.save();
    ctx.translate(P.dx, P.dy - 10 + Math.sin(t * 1.6) * 8);
    ctx.rotate(P.rot);
    ctx.scale(P.sx, P.sy);
    // cloak with a tattered, waving hem
    const hem = [];
    for (let i = 0; i <= 10; i++) {
      const x = 90 - i * 18;
      hem.push(x, -10 + Math.sin(t * 3 + i * 1.3) * 10 + (i % 2) * 18);
    }
    ctx.beginPath();
    ctx.moveTo(-34, -330);
    ctx.quadraticCurveTo(-70, -200, -96, -20);
    for (let i = hem.length - 2; i >= 0; i -= 2) ctx.lineTo(hem[i], hem[i + 1]);
    ctx.quadraticCurveTo(70, -200, 40, -330);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -330, 0, 0);
    g.addColorStop(0, c('#1a1630'));
    g.addColorStop(1, c('#05040a'));
    D.paint(ctx, g, 6, phase2 ? '#ff2a4a' : '#8f86c9');
    ctx.strokeStyle = 'rgba(155,140,255,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, -300);
    ctx.quadraticCurveTo(-30, -160, -40, -40);
    ctx.moveTo(18, -300);
    ctx.quadraticCurveTo(26, -160, 30, -40);
    ctx.stroke();
    // floating gloves
    const hand2 = (sx, a, len) => {
      const [hx, hy] = D.dir(sx, -260, a[0] * 0.6 + a[1] * 0.4, len);
      D.circle(ctx, hx, hy, 15, c('#f1efff'), 5);
      D.rect(ctx, hx - 12, hy + 8, 24, 10, 4, c('#d6d2f0'), 4);
      return [hx, hy];
    };
    const mh = hand2(-40, P.mic, 70);
    // hood + mask
    ctx.save();
    ctx.translate(2, -330 + P.headDy);
    ctx.rotate(P.head);
    D.blob(ctx, [-62, 10, -58, -70, 0, -112, 62, -70, 66, 12, 0, 30], c('#120f22'), 6, phase2 ? '#ff2a4a' : '#8f86c9');
    D.ellipse(ctx, 4, -34, 44, 52, 0, '#000000', 0);
    const jitter = phase2 || e.eyes === 'x' ? (Math.random() - 0.5) * 3 : 0;
    ctx.translate(jitter + 8, -38);
    ctx.beginPath();
    ctx.moveTo(-30, -38);
    ctx.quadraticCurveTo(0, -60, 30, -38);
    ctx.quadraticCurveTo(40, 4, 22, 34);
    ctx.quadraticCurveTo(0, 50, -22, 34);
    ctx.quadraticCurveTo(-40, 4, -30, -38);
    D.paint(ctx, c('#f1efff'), 5);
    const eyeY = -8;
    for (const ex of [-13, 13]) {
      D.ellipse(ctx, ex, eyeY, 8, e.eyes === 'shut' ? 2 : 11, ex < 0 ? 0.25 : -0.25, '#05040a', 0);
      if (e.eyes !== 'shut') D.circle(ctx, ex + 1, eyeY + 1, 2.5, phase2 ? '#ff2a4a' : '#ffffff', 0);
    }
    if (phase2) {
      ctx.strokeStyle = '#ff2a4a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(6, -46);
      ctx.lineTo(0, -26);
      ctx.lineTo(9, -14);
      ctx.lineTo(3, 6);
      ctx.stroke();
    }
    const mo = e.mouth === 'open' || e.mouth === 'wide' || e.mouth === 'o' ? (e.mouth === 'wide' ? 13 : 9) : 1.5;
    D.ellipse(ctx, 0, 22, mo === 1.5 ? 10 : 9, mo, 0, '#05040a', 0);
    ctx.restore();
    if (k.pose !== 'dead') mic(ctx, mh[0], mh[1], -1.2, c, '#6f6a8f');
    hand2(44, P.free, 76);
    ctx.restore();
  }

  // ============================================================
  // registry
  // ============================================================
  const C = (NF.CHARS = {});
  C.nico = {
    scale: 1.3,
    name: 'Nico', color: '#3ff0c0', focus: [0, -150], height: 250,
    voice: { wave: 'square', wave2: 'sawtooth', detune: 7, mix2: 0.35, formant: 1.22, vib: 0.3, vibRate: 6, gain: 0.95, cons: 'b', vowels: [3, 2, 1, 4] },
    blip: { f: 880, wave: 'square' },
    draw: (ctx, k) => human(ctx, k, NICO),
    head: NICO.head,
    iconScale: 0.82,
  };
  C.luna = {
    scale: 1.05,
    name: 'Luna', color: '#ffb627', focus: [0, -230], height: 330,
    voice: { wave: 'sawtooth', wave2: 'triangle', mix2: 0.5, formant: 1.32, vib: 0.42, vibRate: 5.8, gain: 0.95, cons: 'd', vowels: [0, 2, 3, 1] },
    blip: { f: 1100, wave: 'triangle' },
    draw: drawLuna,
    head: (ctx, k, c) => lunaHead(ctx, k, c, 46),
    iconScale: 0.86,
  };
  C.tuerca = {
    scale: 1.18,
    name: 'DJ Tuerca', color: '#ff8a1f', focus: [10, -190], height: 300,
    voice: { wave: 'square', formant: 0.95, vib: 0.22, gain: 0.9, cons: 'b', vowels: [3, 0, 4, 0], oct: -1, sub: 0.3 },
    blip: { f: 380, wave: 'square' },
    draw: (ctx, k) => human(ctx, k, TUERCA),
    head: TUERCA.head,
    iconScale: 0.66,
  };
  C.catrin = {
    scale: 1.12,
    name: 'El Catrín', color: '#c77dff', focus: [10, -200], height: 330,
    voice: { wave: 'triangle', wave2: 'square', mix2: 0.35, formant: 1.0, vib: 0.75, vibRate: 6.6, gain: 1.05, cons: 't', vowels: [0, 1, 0, 3] },
    blip: { f: 620, wave: 'triangle' },
    draw: (ctx, k) => human(ctx, k, CATRIN),
    head: CATRIN.head,
    iconScale: 0.62,
  };
  C.vera = {
    scale: 1.2,
    name: 'Vera Voltaje', color: '#ff3fa4', focus: [10, -180], height: 300,
    voice: { wave: 'sawtooth', formant: 1.36, vib: 0.5, vibRate: 6.2, gain: 0.85, cons: 'd', vowels: [0, 2, 1, 2] },
    blip: { f: 1300, wave: 'triangle' },
    draw: (ctx, k) => human(ctx, k, VERA),
    head: VERA.head,
    iconScale: 0.6,
  };
  C.robot = {
    scale: 1.12,
    name: 'Unidad 808', color: '#ffd23f', focus: [0, -190], height: 330,
    voice: { wave: 'square', formant: 1.1, vib: 0, ring: 60, gain: 0.8, cons: 't', vowels: [1, 3, 1, 4] },
    blip: { f: 520, wave: 'square' },
    draw: drawRobot,
    head: (ctx, k, c) => robotIcon(ctx, k, c),
    iconScale: 0.8,
  };
  C.magma = {
    scale: 0.98,
    name: 'Rey Magma', color: '#ff4b1f', focus: [0, -250], height: 440,
    voice: { wave: 'sawtooth', wave2: 'sawtooth', detune: 14, formant: 0.85, vib: 0.25, drive: 20, gain: 0.7, cons: 'r', vowels: [0, 3, 0, 4], oct: -1, sub: 0.5 },
    blip: { f: 200, wave: 'sawtooth' },
    draw: drawMagma,
    head: (ctx, k, c) => magmaIcon(ctx, k, c),
    iconScale: 0.5,
  };
  C.silencio = {
    scale: 1.04,
    name: 'El Silencio', color: '#e8e6ff', focus: [0, -260], height: 420,
    voice: { wave: 'sawtooth', wave2: 'sine', detune: 22, mix2: 0.6, formant: 0.92, vib: 0.15, ring: 23, gain: 0.9, cons: 's', vowels: [4, 3, 4, 0], sub: 0.45, rev: 0.5 },
    blip: { f: 150, wave: 'sine' },
    draw: drawSilencio,
    head: (ctx, k, c) => silencioIcon(ctx, k, c),
    iconScale: 0.72,
  };

  // Icon heads for characters whose head isn't a separate function.
  function robotIcon(ctx, k, c) {
    const e = expr(k);
    ctx.save();
    ctx.translate(0, 40);
    D.circle(ctx, -56, -40, 11, c('#ffd23f'), 4);
    D.circle(ctx, 60, -40, 11, c('#ffd23f'), 4);
    D.rect(ctx, -54, -84, 110, 84, 16, c('#9aa5b1'), 6);
    D.rect(ctx, -42, -74, 86, 62, 10, c('#08140e'), 4);
    ctx.fillStyle = k.pose === 'sad' ? '#ff9f1c' : '#39ff88';
    if (e.eyes === 'shut') {
      ctx.fillRect(-26, -52, 16, 4);
      ctx.fillRect(12, -52, 16, 4);
    } else {
      ctx.fillRect(-26, -62, 12, 16);
      ctx.fillRect(12, -62, 12, 16);
    }
    if (k.pose === 'sad') {
      ctx.fillRect(-14, -26, 30, 4);
      ctx.fillRect(-18, -22, 4, 4);
      ctx.fillRect(16, -22, 4, 4);
    } else ctx.fillRect(-16, -24, 34, 4);
    ctx.restore();
  }
  function magmaIcon(ctx, k) {
    ctx.save();
    ctx.translate(-4, 372);
    ctx.beginPath();
    ctx.rect(-135, -490, 270, 222);
    ctx.clip();
    drawMagma(ctx, Object.assign({}, k, { pose: k.pose === 'sad' ? 'sad' : 'idle', pt: 1, beat: 0.99 }));
    ctx.restore();
  }
  function silencioIcon(ctx, k) {
    ctx.save();
    ctx.translate(-6, 375);
    ctx.beginPath();
    ctx.rect(-80, -470, 160, 170);
    ctx.clip();
    drawSilencio(ctx, Object.assign({}, k, { pose: k.pose === 'sad' ? 'sad' : 'idle', pt: 1, beat: 0.99, t: 0 }));
    ctx.restore();
  }

  // Build a pose state object.
  NF.charState = function (opts) {
    const k = Object.assign({ pose: 'idle', pt: 0, beat: 0, t: 0, miss: false, talk: false }, opts);
    if (k.pose === 'dead') k.c = colorFn('#8a8798', 0.55);
    else if (k.miss) k.c = colorFn('#5b46b8', 0.42);
    else k.c = colorFn(k.tint || null, k.tintAmt || 0);
    return k;
  };

  // Draw a character at (x, y) feet position. flip mirrors (the player faces left).
  NF.drawChar = function (ctx, id, x, y, scale, opts) {
    const def = C[id];
    const k = NF.charState(opts);
    if (opts && opts.flip) {
      if (k.pose === 'left') k.pose = 'right';
      else if (k.pose === 'right') k.pose = 'left';
    }
    ctx.save();
    ctx.translate(x, y);
    // ground shadow
    if (!(opts && opts.noShadow)) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 2, (def.height || 250) * 0.32 * scale, 14 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.scale(opts && opts.flip ? -scale : scale, scale);
    def.draw(ctx, k);
    ctx.restore();
  };

  // Health-bar icon: the head in a ~size box. losing -> sad face.
  NF.drawIcon = function (ctx, id, x, y, size, losing, flip, t) {
    const def = C[id];
    const k = NF.charState({ pose: losing ? 'sad' : 'idle', t: t || 0, pt: 1, beat: 0.99 });
    ctx.save();
    ctx.translate(x, y);
    const s = (size / 110) * (def.iconScale || 0.8);
    ctx.scale(flip ? -s : s, s);
    def.head(ctx, k, k.c);
    ctx.restore();
  };
})();
