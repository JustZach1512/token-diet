'use strict';
// Shared helpers, seeded RNG and save data. Loaded first; everything hangs off the NF namespace.
(function () {
  const NF = (globalThis.NF = globalThis.NF || {});
  const U = (NF.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  // Frame-rate independent smoothing toward b.
  U.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  U.mod = (a, n) => ((a % n) + n) % n;

  U.ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };

  // mulberry32: small, fast, deterministic. Charts depend on it, so never change it.
  U.rng = function (seed) {
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    f.range = (a, b) => a + f() * (b - a);
    f.weighted = (obj) => {
      let total = 0;
      for (const k in obj) total += obj[k];
      let r = f() * total;
      for (const k in obj) {
        r -= obj[k];
        if (r < 0) return k;
      }
      return Object.keys(obj)[0];
    };
    return f;
  };

  U.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  // ---- colors ----
  const rgbCache = new Map();
  U.hexToRgb = (hex) => {
    let c = rgbCache.get(hex);
    if (c) return c;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
    return c;
  };
  const toHex = (r, g, b) =>
    '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.rgba = (hex, a) => {
    const [r, g, b] = U.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };
  U.mix = (a, b, t) => {
    const A = U.hexToRgb(a), B = U.hexToRgb(b);
    return toHex(U.lerp(A[0], B[0], t), U.lerp(A[1], B[1], t), U.lerp(A[2], B[2], t));
  };
  // amt > 0 lightens toward white, < 0 darkens toward black.
  U.shade = (hex, amt) => (amt >= 0 ? U.mix(hex, '#ffffff', amt) : U.mix(hex, '#000000', -amt));

  U.fmtTime = (s) => {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  U.fmtNum = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // ---- save data (localStorage can be missing or throw: always fall back to memory) ----
  const KEY = 'nochedefunk_save_v1';
  const DEFAULT_OPTIONS = {
    downscroll: false,
    middlescroll: false,
    ghostTap: true,
    scrollSpeed: 0, // 0 = use the song's speed
    offset: 0, // ms
    practice: false,
    botplay: false,
    rate: 1,
    flashing: true,
    camZoom: true,
    showMs: false,
    timeBar: true,
    fps: false,
    lowQuality: false,
    musicVol: 0.8,
    voiceVol: 1,
    sfxVol: 0.7,
    hitsound: false,
  };
  const DEFAULT_KEYS = [
    ['ArrowLeft', 'KeyD'],
    ['ArrowDown', 'KeyF'],
    ['ArrowUp', 'KeyJ'],
    ['ArrowRight', 'KeyK'],
  ];

  const S = (NF.save = {
    DEFAULT_OPTIONS,
    DEFAULT_KEYS,
    data: null,
    fresh() {
      return {
        scores: {}, // "songId:diff" -> {score, acc, fc}
        weeks: {}, // "weekIndex:diff" -> best week score
        cleared: [], // week indexes beaten at least once
        unlockAll: false,
        deaths: 0,
        options: Object.assign({}, DEFAULT_OPTIONS),
        keys: DEFAULT_KEYS.map((k) => k.slice()),
      };
    },
    load() {
      let raw = null;
      try {
        raw = JSON.parse(globalThis.localStorage.getItem(KEY));
      } catch {
        raw = null;
      }
      const d = S.fresh();
      if (raw && typeof raw === 'object') {
        Object.assign(d.scores, raw.scores || {});
        Object.assign(d.weeks, raw.weeks || {});
        if (Array.isArray(raw.cleared)) d.cleared = raw.cleared.filter((n) => Number.isInteger(n));
        d.unlockAll = !!raw.unlockAll;
        d.deaths = raw.deaths | 0;
        if (raw.options) for (const k in DEFAULT_OPTIONS) if (k in raw.options) d.options[k] = raw.options[k];
        if (Array.isArray(raw.keys) && raw.keys.length === 4) d.keys = raw.keys.map((k) => (Array.isArray(k) ? k.slice(0, 2) : ['', '']));
      }
      S.data = d;
      return d;
    },
    flush() {
      try {
        globalThis.localStorage.setItem(KEY, JSON.stringify(S.data));
      } catch {
        /* storage unavailable: progress lives for this session only */
      }
    },
    reset() {
      const opts = S.data ? S.data.options : null;
      const keys = S.data ? S.data.keys : null;
      S.data = S.fresh();
      if (opts) S.data.options = opts;
      if (keys) S.data.keys = keys;
      S.flush();
    },
    get opt() {
      return S.data.options;
    },
    score(songId, diff) {
      return S.data.scores[songId + ':' + diff] || null;
    },
    // Returns true when this is a new best score.
    submitScore(songId, diff, score, acc, fc) {
      const k = songId + ':' + diff;
      const prev = S.data.scores[k];
      const best = !prev || score > prev.score;
      if (!prev) S.data.scores[k] = { score, acc, fc };
      else {
        if (score > prev.score) prev.score = score;
        if (acc > prev.acc) prev.acc = acc;
        const order = ['', 'Clear', 'SDCB', 'FC', 'GFC', 'SFC'];
        if (order.indexOf(fc) > order.indexOf(prev.fc || '')) prev.fc = fc;
      }
      S.flush();
      return best;
    },
    weekScore(week, diff) {
      return S.data.weeks[week + ':' + diff] || 0;
    },
    submitWeek(week, diff, score) {
      const k = week + ':' + diff;
      const best = score > (S.data.weeks[k] || 0);
      if (best) S.data.weeks[k] = score;
      const newlyCleared = !S.data.cleared.includes(week);
      if (newlyCleared) S.data.cleared.push(week);
      S.flush();
      return { best, newlyCleared };
    },
    weekUnlocked(week) {
      return S.data.unlockAll || week <= 1 || S.data.cleared.includes(week - 1);
    },
  });
})();
