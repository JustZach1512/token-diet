// Utilidades matemáticas, almacenamiento y montículo para A*.
(function () {
  'use strict';
  const NSF = (window.NSF = window.NSF || {});
  const TAU = Math.PI * 2;

  NSF.U = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    chance: (p) => Math.random() < p,
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    angDiff(a, b) {
      let d = (b - a) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    },
    turn(cur, target, maxStep) {
      const d = NSF.U.angDiff(cur, target);
      return cur + NSF.U.clamp(d, -maxStep, maxStep);
    },
    fmtTime(s) {
      s = Math.max(0, Math.ceil(s));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    },
    store: {
      get(k, def) {
        try {
          const v = localStorage.getItem('nsf:' + k);
          return v == null ? def : JSON.parse(v);
        } catch (e) { return def; }
      },
      set(k, v) {
        try { localStorage.setItem('nsf:' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ }
      },
    },
    vibrate(ms) {
      try { if (NSF.settings && NSF.settings.vibration && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no disponible */ }
    },
  };

  class MinHeap {
    constructor() { this.p = []; this.v = []; }
    get size() { return this.v.length; }
    clear() { this.p.length = 0; this.v.length = 0; }
    push(pri, val) {
      const p = this.p, v = this.v;
      let i = v.length;
      p.push(pri); v.push(val);
      while (i > 0) {
        const j = (i - 1) >> 1;
        if (p[j] <= pri) break;
        p[i] = p[j]; v[i] = v[j]; i = j;
      }
      p[i] = pri; v[i] = val;
    }
    pop() {
      const p = this.p, v = this.v;
      const top = v[0];
      const lp = p.pop(), lv = v.pop();
      const n = v.length;
      if (n > 0) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && p[c + 1] < p[c]) c++;
          if (p[c] >= lp) break;
          p[i] = p[c]; v[i] = v[c]; i = c;
        }
        p[i] = lp; v[i] = lv;
      }
      return top;
    }
  }
  NSF.MinHeap = MinHeap;
})();
