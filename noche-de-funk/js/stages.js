'use strict';
// Stage backgrounds. World space is 1280x720 around (640,360); the camera moves/zooms over it.
// Each stage draws parallax layers via set(f): f=0 is fixed to the screen, f=1 moves with the world.
(function () {
  const NF = globalThis.NF;
  const U = NF.util;
  const D = NF.draw;
  const GROUND = 660;
  NF.GROUND = GROUND;

  // Large static layers rendered once (scale 1 to keep memory sane).
  const layers = new Map();
  function layer(key, w, h, draw) {
    let c = layers.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    layers.set(key, c);
    return c;
  }
  NF.clearStageLayers = () => layers.clear();

  function skyline(g, w, h, seed, color, winColor, minH, maxH, winChance) {
    const r = U.rng(seed);
    let x = -20;
    while (x < w) {
      const bw = 60 + r() * 110, bh = minH + r() * (maxH - minH);
      g.fillStyle = color;
      g.fillRect(x, h - bh, bw, bh);
      if (r() < 0.3) g.fillRect(x + bw * 0.4, h - bh - 30, 6, 30);
      for (let wy = h - bh + 14; wy < h - 10; wy += 22) {
        for (let wx = x + 10; wx < x + bw - 14; wx += 18) {
          if (r() < winChance) {
            g.fillStyle = winColor;
            g.globalAlpha = 0.35 + r() * 0.65;
            g.fillRect(wx, wy, 8, 11);
            g.globalAlpha = 1;
          }
        }
      }
      x += bw + 4 + r() * 10;
    }
  }
  function gradient(ctx, x, y, w, h, stops) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  function stars(ctx, seed, n, w, h, t, alpha) {
    const r = U.rng(seed);
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, s = 0.6 + r() * 1.8, ph = r() * 6;
      ctx.globalAlpha = (alpha || 1) * (0.35 + 0.65 * Math.abs(Math.sin(t * 0.8 + ph)));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
  }
  // Simple particle pool.
  function particles(S, key) {
    return S[key] || (S[key] = []);
  }

  const ST = (NF.STAGES = {});

  // ---------------------------------------------------------------- rooftop (tutorial)
  ST.rooftop = {
    name: 'Azotea', zoom: 0.82,
    back(ctx, S, set) {
      set(0);
      gradient(ctx, 0, 0, 1280, 720, [[0, '#24184a'], [0.45, '#8a2f6b'], [0.75, '#f0715a'], [1, '#ffc56b']]);
      stars(ctx, 4, 50, 1280, 260, S.t, 0.6);
      set(0.05);
      const sg = ctx.createRadialGradient(640, 520, 10, 640, 520, 210);
      sg.addColorStop(0, 'rgba(255,240,180,1)');
      sg.addColorStop(0.35, 'rgba(255,190,110,0.9)');
      sg.addColorStop(1, 'rgba(255,150,90,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(400, 300, 480, 440);
      set(0.25);
      ctx.drawImage(layer('roof-far', 2200, 420, (g, w, h) => skyline(g, w, h, 11, '#4a2557', '#ffd27a', 120, 330, 0.25)), -460, 240);
      set(0.5);
      ctx.drawImage(layer('roof-mid', 2300, 380, (g, w, h) => skyline(g, w, h, 12, '#2a1638', '#ffcf6b', 90, 260, 0.35)), -520, 330);
      set(0.9);
      // water tower
      const wx = 70, wy = 300;
      D.rect(ctx, wx - 6, wy + 120, 12, 200, 0, '#2b1b33', 0);
      D.rect(ctx, wx + 104, wy + 120, 12, 200, 0, '#2b1b33', 0);
      D.rect(ctx, wx - 20, wy, 150, 130, 18, '#5a3448', 6, '#1c1020');
      D.poly(ctx, [wx - 30, wy + 4, wx + 55, wy - 60, wx + 140, wy + 4], '#3d2433', 6, '#1c1020');
      set(1);
      // parapet + roof floor
      D.rect(ctx, -400, 560, 2080, 50, 0, '#5b4566', 0);
      ctx.fillStyle = '#4a3656';
      for (let x = -400; x < 1680; x += 90) ctx.fillRect(x, 560, 4, 50);
      gradient(ctx, -400, 610, 2080, 400, [[0, '#3c2c47'], [1, '#1d1424']]);
      // string lights (bulbs blink on beat)
      for (let i = 0; i < 2; i++) {
        const x0 = i ? 640 : -120, x1 = i ? 1400 : 640;
        ctx.strokeStyle = '#1c1020';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, 150);
        ctx.quadraticCurveTo((x0 + x1) / 2, 260, x1, 150);
        ctx.stroke();
        for (let j = 1; j < 12; j++) {
          const tt = j / 12;
          const x = U.lerp(U.lerp(x0, (x0 + x1) / 2, tt), U.lerp((x0 + x1) / 2, x1, tt), tt);
          const y = (1 - tt) * (1 - tt) * 150 + 2 * (1 - tt) * tt * 260 + tt * tt * 150;
          const on = (j + Math.floor(S.beat)) % 3 !== 0;
          const col = ['#ffd23f', '#ff5c8a', '#3ff0c0'][j % 3];
          if (on) {
            ctx.fillStyle = U.rgba(col, 0.25 + 0.3 * S.bop);
            ctx.beginPath();
            ctx.arc(x, y + 8, 16, 0, Math.PI * 2);
            ctx.fill();
          }
          D.circle(ctx, x, y + 8, 6, on ? col : '#4a3656', 3, '#1c1020');
        }
      }
      // AC unit + antenna
      D.rect(ctx, 1150, 470, 150, 100, 8, '#7b6a8a', 5, '#1c1020');
      for (let i = 0; i < 5; i++) D.rect(ctx, 1162, 482 + i * 16, 126, 6, 3, '#5b4a6a', 0);
    },
  };

  // ---------------------------------------------------------------- street (week 1)
  ST.street = {
    name: 'Calle Caliente', zoom: 0.8,
    back(ctx, S, set) {
      set(0);
      gradient(ctx, 0, 0, 1280, 720, [[0, '#090720'], [0.6, '#24164f'], [1, '#3b2063']]);
      stars(ctx, 9, 70, 1280, 360, S.t, 0.8);
      set(0.08);
      D.circle(ctx, 820, 110, 50, '#fff3c4', 0);
      D.circle(ctx, 804, 100, 11, 'rgba(0,0,0,0.08)', 0);
      set(0.3);
      ctx.drawImage(layer('st-far', 2300, 460, (g, w, h) => skyline(g, w, h, 21, '#1b1240', '#ffcf5c', 160, 420, 0.3)), -500, 170);
      set(0.75);
      // brick wall with graffiti
      ctx.drawImage(
        layer('st-wall', 2200, 420, (g, w, h) => {
          g.fillStyle = '#6b2e2e';
          g.fillRect(0, 0, w, h);
          const r = U.rng(3);
          for (let y = 0; y < h; y += 26) {
            for (let x = (y / 26) % 2 ? -30 : 0; x < w; x += 60) {
              g.fillStyle = U.mix('#7d3636', '#5a2424', r());
              g.fillRect(x + 2, y + 2, 56, 22);
            }
          }
          const tag = (txt, x, y, size, fill, rot) => {
            g.save();
            g.translate(x, y);
            g.rotate(rot);
            g.font = `${size}px ${D.FONT}`;
            g.lineJoin = 'round';
            g.lineWidth = size * 0.22;
            g.strokeStyle = '#14101f';
            g.strokeText(txt, 0, 0);
            g.fillStyle = fill;
            g.fillText(txt, 0, 0);
            g.restore();
          };
          tag('FUNK!', 700, 240, 170, '#ff8a1f', -0.06);
          tag('bip bop', 1350, 170, 70, '#3ff0c0', 0.08);
          tag('TUERCA', 260, 150, 64, '#ffd23f', -0.1);
          tag('♪', 1650, 300, 140, '#ff3fa4', 0.2);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(0, h - 30, w, 30);
        }),
        -460, 230
      );
      // pulsing glow over the graffiti
      ctx.fillStyle = U.rgba('#ff8a1f', 0.12 * S.bop);
      ctx.fillRect(-460, 230, 2200, 420);
      set(0.9);
      // street lamp + light cone
      const lx = 1180;
      D.rect(ctx, lx - 8, 120, 16, 520, 4, '#1b1730', 4);
      D.rect(ctx, lx - 70, 112, 80, 16, 6, '#1b1730', 4);
      D.rect(ctx, lx - 92, 122, 46, 18, 8, '#fff3c4', 4);
      const cone = ctx.createLinearGradient(0, 140, 0, 660);
      cone.addColorStop(0, 'rgba(255,243,196,0.35)');
      cone.addColorStop(1, 'rgba(255,243,196,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(lx - 90, 140);
      ctx.lineTo(lx - 48, 140);
      ctx.lineTo(lx + 120, 660);
      ctx.lineTo(lx - 260, 660);
      ctx.closePath();
      ctx.fill();
      set(1);
      gradient(ctx, -400, 630, 2080, 60, [[0, '#6e6a80'], [1, '#55516a']]);
      ctx.fillStyle = '#3e3a52';
      for (let x = -400; x < 1680; x += 120) ctx.fillRect(x, 630, 4, 60);
      gradient(ctx, -400, 690, 2080, 400, [[0, '#2a2838'], [1, '#141220']]);
      ctx.fillStyle = '#ffd23f';
      for (let x = -400; x < 1680; x += 160) ctx.fillRect(x, 760, 90, 10);
      // hydrant
      const hx = 90;
      D.rect(ctx, hx - 22, 560, 44, 80, 10, '#e63946', 5);
      D.rect(ctx, hx - 30, 552, 60, 16, 6, '#c62d39', 5);
      D.rect(ctx, hx - 36, 586, 72, 14, 6, '#c62d39', 5);
      // boombox that hops on the beat
      const by = 618 - S.bop * 8;
      D.rect(ctx, 470, by - 50, 120, 62, 10, '#2b2b36', 5);
      D.circle(ctx, 502, by - 18, 18 * (1 + S.bop * 0.12), '#55536a', 4);
      D.circle(ctx, 558, by - 18, 18 * (1 + S.bop * 0.12), '#55536a', 4);
      D.rect(ctx, 490, by - 66, 80, 16, 6, '#14101f', 0);
    },
  };

  // ---------------------------------------------------------------- cemetery (week 2)
  ST.cemetery = {
    name: 'Panteón', zoom: 0.8,
    back(ctx, S, set) {
      set(0);
      gradient(ctx, 0, 0, 1280, 720, [[0, '#120626'], [0.55, '#3b1457'], [1, '#6b2a6e']]);
      stars(ctx, 33, 60, 1280, 380, S.t, 0.7);
      set(0.06);
      const mg = ctx.createRadialGradient(330, 170, 50, 330, 170, 200);
      mg.addColorStop(0, 'rgba(255,236,180,0.5)');
      mg.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(100, -60, 460, 460);
      D.circle(ctx, 330, 170, 96, '#ffeab0', 0);
      D.circle(ctx, 300, 150, 18, 'rgba(180,140,90,0.25)', 0);
      D.circle(ctx, 360, 200, 12, 'rgba(180,140,90,0.25)', 0);
      set(0.22);
      // hills + mansion
      ctx.fillStyle = '#28103d';
      ctx.beginPath();
      ctx.moveTo(-500, 520);
      ctx.quadraticCurveTo(200, 330, 760, 470);
      ctx.quadraticCurveTo(1200, 360, 1800, 500);
      ctx.lineTo(1800, 800);
      ctx.lineTo(-500, 800);
      ctx.fill();
      ctx.fillStyle = '#1c0a2c';
      ctx.fillRect(820, 300, 230, 170);
      D.poly(ctx, [800, 300, 935, 200, 1070, 300], '#1c0a2c', 0);
      ctx.fillRect(1000, 230, 26, 70);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = (i + Math.floor(S.beat / 2)) % 4 ? '#ff9f1c' : '#5c2a14';
        ctx.fillRect(840 + (i % 3) * 70, 330 + Math.floor(i / 3) * 60, 26, 34);
      }
      set(0.6);
      const r = U.rng(8);
      for (let i = 0; i < 16; i++) {
        const x = -300 + i * 130 + r() * 40, h = 60 + r() * 60;
        if (r() < 0.4) {
          D.rect(ctx, x + 14, 560 - h - 30, 12, h + 30, 2, '#2c1640', 0);
          D.rect(ctx, x - 4, 560 - h - 10, 48, 12, 2, '#2c1640', 0);
        } else D.rect(ctx, x, 560 - h, 44, h, 20, '#2c1640', 0);
      }
      set(1);
      gradient(ctx, -400, 600, 2080, 420, [[0, '#2b1d45'], [1, '#120a1f']]);
      // ofrenda candles
      for (let i = 0; i < 9; i++) {
        const x = -200 + i * 190 + (i % 2) * 40, y = 640 + (i % 3) * 10;
        D.rect(ctx, x - 7, y - 30, 14, 30, 3, '#f4efe3', 3);
        const fl = 1 + Math.sin(S.t * 13 + i * 2) * 0.18;
        ctx.fillStyle = 'rgba(255,170,60,0.25)';
        ctx.beginPath();
        ctx.arc(x, y - 40, 22 * fl, 0, Math.PI * 2);
        ctx.fill();
        D.ellipse(ctx, x, y - 40, 5, 10 * fl, 0, '#ffb627', 0);
        D.ellipse(ctx, x, y - 37, 2.5, 5 * fl, 0, '#fff3c4', 0);
      }
      // marigold petals on the ground
      const rp = U.rng(77);
      for (let i = 0; i < 60; i++) D.ellipse(ctx, -300 + rp() * 1900, 670 + rp() * 120, 6, 3, rp() * 3, rp() < 0.5 ? '#ff9f1c' : '#ffb627', 0);
      // papel picado banners swaying
      for (let row = 0; row < 2; row++) {
        const y0 = 70 + row * 70;
        ctx.strokeStyle = '#14101f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-300, y0);
        ctx.lineTo(1600, y0);
        ctx.stroke();
        const cols = ['#ff3fa4', '#ff9f1c', '#1fd2ff', '#c77dff', '#3ef06e', '#ffd23f'];
        for (let i = 0; i < 26; i++) {
          const x = -300 + i * 74 + row * 37;
          const sw = Math.sin(S.t * 2 + i * 0.7 + row) * 0.08;
          ctx.save();
          ctx.translate(x, y0);
          ctx.rotate(sw);
          ctx.fillStyle = cols[(i + row) % cols.length];
          ctx.beginPath();
          ctx.moveTo(-26, 0);
          ctx.lineTo(26, 0);
          ctx.lineTo(26, 40);
          for (let z = 0; z < 5; z++) ctx.lineTo(26 - z * 13 - 6.5, z % 2 ? 40 : 46);
          ctx.lineTo(-26, 40);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(20,16,31,0.35)';
          ctx.fillRect(-12, 12, 8, 8);
          ctx.fillRect(4, 12, 8, 8);
          ctx.fillRect(-4, 24, 8, 8);
          ctx.restore();
        }
      }
    },
    front(ctx, S, set) {
      set(1.05);
      const P = particles(S, 'petals');
      if (P.length < (S.low ? 14 : 34)) P.push({ x: -300 + Math.random() * 1900, y: -40, vx: -10 + Math.random() * 20, vy: 30 + Math.random() * 40, r: Math.random() * 6, col: Math.random() < 0.5 ? '#ff9f1c' : '#ffb627' });
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.x += (p.vx + Math.sin(S.t * 2 + p.r) * 20) * S.dt;
        p.y += p.vy * S.dt;
        p.r += S.dt * 2;
        if (p.y > 760) P.splice(i, 1);
        else D.ellipse(ctx, p.x, p.y, 6, 3, p.r, p.col, 0);
      }
    },
  };

  // ---------------------------------------------------------------- club (week 3)
  ST.club = {
    name: 'Club Neón', zoom: 0.8,
    back(ctx, S, set) {
      set(0);
      gradient(ctx, 0, 0, 1280, 720, [[0, '#0a0618'], [1, '#22103a']]);
      set(0.3);
      // neon signs
      const neon = (txt, x, y, size, col, on) => {
        ctx.save();
        ctx.font = `${size}px ${D.FONT}`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.shadowColor = col;
        ctx.shadowBlur = on ? 30 : 6;
        ctx.lineWidth = 6;
        ctx.strokeStyle = on ? col : U.shade(col, -0.6);
        ctx.strokeText(txt, x, y);
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = on ? '#ffffff' : U.shade(col, -0.4);
        ctx.strokeText(txt, x, y);
        ctx.restore();
      };
      const flick = S.flicker > 0.5 || Math.floor(S.beat) % 8 !== 7;
      neon('NEÓN', 640, 210, 150, '#ff3fa4', flick);
      neon('♥', 260, 230, 110, '#1fd2ff', Math.floor(S.beat) % 2 === 0);
      neon('ϟ', 1030, 230, 120, '#ffd23f', Math.floor(S.beat) % 2 === 1);
      set(0.6);
      // disco ball + light specks
      ctx.strokeStyle = '#3b2b55';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(640, -200);
      ctx.lineTo(640, 30);
      ctx.stroke();
      D.circle(ctx, 640, 70, 44, '#c8c8d8', 4, '#14101f');
      ctx.save();
      ctx.beginPath();
      ctx.arc(640, 70, 42, 0, Math.PI * 2);
      ctx.clip();
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        ctx.fillStyle = (i * 7 + j * 3 + Math.floor(S.t * 8)) % 5 ? '#9a9ab4' : '#ffffff';
        ctx.fillRect(640 + i * 13 - 6 + ((S.t * 20) % 13), 70 + j * 13 - 6, 11, 11);
      }
      ctx.restore();
      const r = U.rng(4);
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2 + S.t * 0.4, d = 200 + r() * 600;
        ctx.fillStyle = U.rgba(['#ff3fa4', '#1fd2ff', '#ffffff', '#ffd23f'][i % 4], 0.35);
        ctx.fillRect(640 + Math.cos(a) * d, 300 + Math.sin(a) * d * 0.45, 7, 7);
      }
      set(0.8);
      // lasers
      const n = S.energy >= 3 ? 6 : S.energy >= 2 ? 3 : 0;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        const a = Math.sin(S.t * 1.3 + i) * 0.5 + (side > 0 ? 2.2 : 0.9);
        const x0 = 640 + side * 760, y0 = -80;
        ctx.strokeStyle = U.rgba(['#ff3fa4', '#1fd2ff', '#3ef06e'][i % 3], 0.35 + 0.3 * S.bop);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(a) * 1600, y0 + Math.sin(a) * 1600);
        ctx.stroke();
      }
      ctx.restore();
      set(1);
      // stage edge + dance floor
      gradient(ctx, -420, 560, 2140, 520, [[0, '#2a1846'], [1, '#0c0618']]);
      D.rect(ctx, -420, 552, 2140, 14, 0, '#ff3fa4', 0);
      const cols = ['#ff3fa4', '#1fd2ff', '#ffd23f', '#3ef06e', '#c24bff'];
      let y = 600;
      for (let row = 0; row < 6; row++) {
        const h = 26 + row * 10;
        for (let i = -6; i < 22; i++) {
          const w = 120;
          const x = i * w - 400 + (row % 2) * 60;
          const lit = (i + row + Math.floor(S.beat)) % 3 === 0;
          ctx.fillStyle = lit ? U.rgba(cols[U.mod(i + row, 5)], 0.45 + 0.4 * S.bop) : '#21143a';
          ctx.fillRect(x + 4, y, w - 8, h - 6);
        }
        y += h;
      }
    },
    front(ctx, S, set) {
      set(1.25);
      // crowd silhouettes bobbing to the beat
      const r = U.rng(19);
      for (let i = 0; i < 22; i++) {
        const x = -420 + i * 100 + r() * 30, hop = (i % 2 ? S.bop : Math.exp(-U.mod(S.beat + 0.5, 1) * 6)) * 12;
        const y = 830 - hop + r() * 20;
        ctx.fillStyle = '#05030c';
        ctx.beginPath();
        ctx.arc(x, y - 70, 30, 0, Math.PI * 2);
        ctx.fill();
        D.rect(ctx, x - 50, y - 44, 100, 140, 40, '#05030c', 0);
        if (r() < 0.45) D.limb(ctx, x + 30, y - 30, x + 52, y - 120 - hop, 16, '#05030c', 0);
      }
    },
  };

  // ---------------------------------------------------------------- factory (week 4)
  function gear(ctx, x, y, r, teeth, rot, col) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? r : r * 1.16;
      ctx.lineTo(Math.cos(a - 0.12) * rr, Math.sin(a - 0.12) * rr);
      ctx.lineTo(Math.cos(a + 0.12) * rr, Math.sin(a + 0.12) * rr);
    }
    ctx.closePath();
    D.paint(ctx, col, 5, '#0b0e14');
    D.circle(ctx, 0, 0, r * 0.35, '#0b0e14', 0);
    ctx.restore();
  }
  ST.factory = {
    name: 'Fábrica 808', zoom: 0.8,
    back(ctx, S, set) {
      set(0);
      gradient(ctx, 0, 0, 1280, 720, [[0, '#0e1219'], [1, '#232b38']]);
      set(0.25);
      gear(ctx, 150, 200, 150, 14, S.t * 0.3, '#2c3646');
      gear(ctx, 400, 120, 90, 10, -S.t * 0.5, '#344052');
      gear(ctx, 1100, 260, 170, 16, -S.t * 0.25, '#2c3646');
      gear(ctx, 880, 90, 70, 9, S.t * 0.6, '#344052');
      ctx.strokeStyle = '#3b4658';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.moveTo(-300, 420);
      ctx.lineTo(1600, 420);
      ctx.moveTo(560, -100);
      ctx.lineTo(560, 420);
      ctx.stroke();
      set(0.6);
      // monitors with waveforms
      for (let m = 0; m < 3; m++) {
        const x = 160 + m * 470, y = 250;
        D.rect(ctx, x - 90, y - 60, 180, 120, 12, '#9aa5b1', 5, '#0b0e14');
        D.rect(ctx, x - 76, y - 48, 152, 96, 6, '#04140c', 0);
        ctx.strokeStyle = '#39ff88';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const xx = x - 72 + i * 4.8;
          const yy = y + Math.sin(i * 0.7 + S.t * 8 + m) * (8 + 26 * S.bop) * Math.sin((i / 30) * Math.PI);
          if (i) ctx.lineTo(xx, yy);
          else ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      // alarm light in intense parts
      if (S.energy >= 3) {
        const a = S.t * 6;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,40,60,0.18)';
        ctx.beginPath();
        ctx.moveTo(640, 40);
        ctx.arc(640, 40, 900, a, a + 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      D.circle(ctx, 640, 40, 22, S.energy >= 3 ? '#ff3d5e' : '#5c1020', 4, '#0b0e14');
      set(1);
      // conveyor belt
      D.rect(ctx, -420, 540, 2120, 40, 18, '#2a3240', 5, '#0b0e14');
      for (let x = -420 + ((S.t * 90) % 60); x < 1700; x += 60) D.circle(ctx, x, 560, 8, '#566173', 3, '#0b0e14');
      for (let i = 0; i < 9; i++) {
        const x = U.mod(i * 260 + S.t * 90, 2340) - 440;
        D.rect(ctx, x, 488, 70, 54, 6, '#b07a3c', 4, '#0b0e14');
        ctx.fillStyle = '#8a5a26';
        ctx.fillRect(x + 30, 488, 10, 54);
      }
      gradient(ctx, -400, 610, 2080, 420, [[0, '#4a5466'], [1, '#1c222c']]);
      for (let x = -400; x < 1700; x += 64) {
        ctx.fillStyle = '#3a4252';
        ctx.fillRect(x, 610, 3, 420);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(-400, 606, 2080, 18);
      ctx.clip();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(-400, 606, 2080, 18);
      ctx.fillStyle = '#14101f';
      for (let x = -400; x < 1700; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 624);
        ctx.lineTo(x + 18, 606);
        ctx.lineTo(x + 32, 606);
        ctx.lineTo(x + 14, 624);
        ctx.fill();
      }
      ctx.restore();
    },
    front(ctx, S, set) {
      set(1);
      const P = particles(S, 'sparks');
      if (Math.random() < (S.low ? 0.15 : 0.45)) for (let i = 0; i < 3; i++) P.push({ x: 1230, y: 470, vx: -120 - Math.random() * 200, vy: -150 + Math.random() * 160, life: 0.6 });
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.vy += 600 * S.dt;
        p.x += p.vx * S.dt;
        p.y += p.vy * S.dt;
        p.life -= S.dt;
        if (p.life <= 0) P.splice(i, 1);
        else {
          ctx.fillStyle = U.rgba('#ffd23f', Math.min(1, p.life * 2));
          ctx.fillRect(p.x, p.y, 4, 4);
        }
      }
    },
  };

  // ---------------------------------------------------------------- volcano (week 5)
  ST.volcano = {
    name: 'Volcán', zoom: 0.78,
    back(ctx, S, set) {
      set(0);
      gradient(ctx, 0, 0, 1280, 720, [[0, '#1a0303'], [0.6, '#5c1205'], [1, '#a8340c']]);
      set(0.15);
      ctx.fillStyle = '#240707';
      ctx.beginPath();
      ctx.moveTo(150, 640);
      ctx.lineTo(560, 170);
      ctx.lineTo(720, 170);
      ctx.lineTo(1130, 640);
      ctx.fill();
      const cg = ctx.createRadialGradient(640, 170, 10, 640, 170, 200 + 120 * S.erupt);
      cg.addColorStop(0, `rgba(255,170,40,${0.7 + 0.3 * S.erupt})`);
      cg.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(300, -200, 680, 700);
      ctx.strokeStyle = '#ff7b1c';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(600, 175);
      ctx.quadraticCurveTo(560, 320, 470, 420);
      ctx.moveTo(690, 175);
      ctx.quadraticCurveTo(760, 300, 800, 460);
      ctx.stroke();
      // eruption particles
      const P = particles(S, 'lava');
      if (S.erupt > 0.05) for (let i = 0; i < 4; i++) P.push({ x: 640, y: 170, vx: -220 + Math.random() * 440, vy: -400 - Math.random() * 300, life: 2 });
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.vy += 500 * S.dt;
        p.x += p.vx * S.dt;
        p.y += p.vy * S.dt;
        p.life -= S.dt;
        if (p.life <= 0 || p.y > 700) P.splice(i, 1);
        else D.circle(ctx, p.x, p.y, 7, '#ffb627', 0);
      }
      set(0.55);
      ctx.fillStyle = '#2e0b06';
      D.poly(ctx, [-400, 600, -200, 380, -60, 420, 60, 330, 220, 600], '#2e0b06', 0);
      D.poly(ctx, [1000, 600, 1150, 360, 1300, 410, 1450, 300, 1700, 600], '#2e0b06', 0);
      set(0.85);
      // lava river
      ctx.save();
      const lg = ctx.createLinearGradient(0, 540, 0, 620);
      lg.addColorStop(0, '#ffcc33');
      lg.addColorStop(1, '#ff4b1f');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(-500, 560);
      for (let x = -500; x <= 1800; x += 40) ctx.lineTo(x, 556 + Math.sin(x * 0.02 + S.t * 3) * 6);
      ctx.lineTo(1800, 640);
      ctx.lineTo(-500, 640);
      ctx.fill();
      ctx.restore();
      set(1);
      // rock platform with glowing cracks
      ctx.fillStyle = '#2a1414';
      ctx.beginPath();
      ctx.moveTo(-450, 618);
      ctx.lineTo(1750, 618);
      ctx.lineTo(1750, 1050);
      ctx.lineTo(-450, 1050);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = '#ff7b1c';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = U.rgba('#ff7b1c', 0.6 + 0.4 * S.bop);
      ctx.lineWidth = 4;
      const r = U.rng(5);
      for (let i = 0; i < 12; i++) {
        let x = -300 + i * 170, y = 640;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += -30 + r() * 60;
          y += 25 + r() * 25;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
    front(ctx, S, set) {
      set(1.1);
      const P = particles(S, 'embers');
      if (P.length < (S.low ? 15 : 40)) P.push({ x: -300 + Math.random() * 1900, y: 820, vy: -40 - Math.random() * 90, ph: Math.random() * 6, life: 4 + Math.random() * 3 });
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.y += p.vy * S.dt;
        p.life -= S.dt;
        if (p.life <= 0) P.splice(i, 1);
        else {
          ctx.fillStyle = U.rgba('#ffb627', Math.min(1, p.life / 2));
          ctx.fillRect(p.x + Math.sin(S.t * 2 + p.ph) * 18, p.y, 4, 4);
        }
      }
    },
  };

  // ---------------------------------------------------------------- tower (week 6, final)
  ST.tower = {
    name: 'Torre del Silencio', zoom: 0.76,
    back(ctx, S, set) {
      const red = S.phase2 ? 1 : 0;
      set(0);
      gradient(ctx, 0, 0, 1280, 720, red ? [[0, '#0a0004'], [1, '#2a0410']] : [[0, '#020107'], [1, '#14102a']]);
      stars(ctx, 66, 140, 1280, 720, S.t * 2, 0.9);
      set(0.08);
      // eclipse
      const pulse = 1 + 0.06 * S.bop;
      const cg = ctx.createRadialGradient(640, 160, 90, 640, 160, 260 * pulse);
      cg.addColorStop(0, red ? 'rgba(255,60,80,0.9)' : 'rgba(230,226,255,0.9)');
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(300, -180, 680, 680);
      D.circle(ctx, 640, 160, 104, '#000000', 0);
      set(0.45);
      // orbiting debris
      const r = U.rng(9);
      for (let i = 0; i < 12; i++) {
        const a = r() * Math.PI * 2 + S.t * (0.1 + r() * 0.15), d = 420 + r() * 380;
        const x = 640 + Math.cos(a) * d, y = 380 + Math.sin(a) * d * 0.35;
        const s = 14 + r() * 26;
        D.poly(ctx, [x - s, y, x - s * 0.3, y - s * 0.8, x + s, y - s * 0.2, x + s * 0.4, y + s * 0.7], '#1d1a30', 4, red ? '#ff2a4a' : '#6f66b8');
      }
      set(1);
      // tower top
      ctx.fillStyle = '#0c0a16';
      ctx.beginPath();
      ctx.moveTo(-200, 620);
      ctx.lineTo(1480, 620);
      ctx.lineTo(1360, 1100);
      ctx.lineTo(-80, 1100);
      ctx.fill();
      ctx.strokeStyle = red ? '#ff2a4a' : '#8f86c9';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-200, 620);
      ctx.lineTo(1480, 620);
      ctx.stroke();
      // rune circle
      ctx.save();
      ctx.translate(650, 700);
      ctx.scale(1, 0.22);
      ctx.rotate(S.t * 0.3);
      ctx.strokeStyle = U.rgba(red ? '#ff2a4a' : '#9b8cff', 0.35 + 0.4 * S.bop);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 430, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * 430, Math.sin(a) * 430);
        ctx.lineTo(Math.cos(a + 2.1) * 430, Math.sin(a + 2.1) * 430);
      }
      ctx.stroke();
      ctx.restore();
    },
    front(ctx, S, set) {
      // static overlay (screen space), stronger in silences and phase 2
      set(0);
      const amt = Math.max(S.static || 0, S.phase2 ? 0.25 : 0.08);
      if (amt > 0.01 && !S.low) {
        for (let i = 0; i < 40 * amt + 4; i++) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * amt * 0.6})`;
          ctx.fillRect(0, Math.random() * 720, 1280, 1 + Math.random() * 3);
        }
      }
    },
  };

  // Default character placement (feet positions in world space).
  NF.STAGE_POS = { opp: [300, GROUND], gf: [650, GROUND - 22], bf: [1005, GROUND] };
})();
