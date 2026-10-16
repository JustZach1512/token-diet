'use strict';
// Procedural composer. A song definition (bpm, key, style, level, seed) becomes:
//  - events: everything the sequencer plays (drums, bass, chords, opponent vocals)
//  - notes:  the chart; every note IS a sung melody note, so hits literally sing the song
//  - sections / gameplay events for the camera and effects.
// Deterministic: the same definition always yields the same song and chart.
(function () {
  const NF = globalThis.NF;
  const U = NF.util;
  const M = (NF.music = {});

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    phrygdom: [0, 1, 4, 5, 7, 8, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };
  const KEYS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  M.SCALES = SCALES;
  M.DIFFS = ['FÁCIL', 'NORMAL', 'DIFÍCIL'];

  // Judgement + health rules, shared by the game and the balance tests.
  M.RULES = {
    win: { sick: 0.045, good: 0.09, bad: 0.135, shit: 0.166 },
    hurtWin: 0.1,
    score: { sick: 350, good: 200, bad: 100, shit: 50, miss: -10 },
    acc: { sick: 1, good: 0.67, bad: 0.34, shit: 0 },
    health: { sick: 0.023, good: 0.018, bad: 0.006, shit: -0.004, miss: -0.0475, ghost: -0.035, drop: -0.04, holdPerSec: 0.16 },
    hurt: { fire: -0.33, static: -0.42 },
    drainScale: [0.4, 0.7, 1],
  };
  M.judge = (dt) => {
    const a = Math.abs(dt), W = M.RULES.win;
    return a <= W.sick ? 'sick' : a <= W.good ? 'good' : a <= W.bad ? 'bad' : 'shit';
  };

  const semi = (scale, deg) => scale[U.mod(deg, 7)] + 12 * Math.floor(deg / 7);
  const isChordTone = (deg, root) => [0, 2, 4].includes(U.mod(deg - root, 7));
  function nearestChordTone(deg, root, prefer) {
    if (prefer === 'root') {
      let best = deg, bd = 99;
      for (let d = deg - 4; d <= deg + 4; d++) if (U.mod(d - root, 7) === 0 && Math.abs(d - deg) < bd) (bd = Math.abs(d - deg)), (best = d);
      return best;
    }
    for (let k = 0; k <= 3; k++) {
      if (isChordTone(deg + k, root)) return deg + k;
      if (isChordTone(deg - k, root)) return deg - k;
    }
    return deg;
  }

  // ---------- rhythm vocabulary (onsets inside one beat) ----------
  const CELLS = {
    R: [], Q: [0], E: [0, 0.5], O: [0.5], D: [0, 0.75], G1: [0, 0.5, 0.75], G2: [0, 0.25, 0.5],
    S: [0, 0.25, 0.5, 0.75], T: [0, 1 / 3, 2 / 3], X: [0.25, 0.75], Y: [0, 0.25], Z: [0.5, 0.75],
  };
  // Cell weights by difficulty level (1 = gentlest, 30 = the final boss on hard).
  const ANCHORS = [
    [1, { R: 4, Q: 6, E: 1 }],
    [5, { R: 3, Q: 5, E: 3, O: 1, D: 0.5 }],
    [10, { R: 2, Q: 3, E: 5, O: 1, D: 2, G1: 1, Z: 0.5 }],
    [15, { R: 1.5, Q: 2, E: 5, O: 1, D: 2, G1: 2, G2: 1.5, S: 1, T: 0.5, Z: 1 }],
    [20, { R: 1, Q: 1, E: 4, O: 0.5, D: 2, G1: 3, G2: 3, S: 3, T: 1, X: 1, Z: 1, Y: 1 }],
    [25, { R: 0.7, Q: 0.5, E: 3, D: 1.5, G1: 3, G2: 3, S: 5, T: 1.5, X: 1.5, Z: 1, Y: 1 }],
    [30, { R: 0.4, Q: 0.3, E: 2, D: 1, G1: 3, G2: 3, S: 8.5, T: 2, X: 1.5, Z: 1, Y: 1 }],
  ];
  function cellWeights(level) {
    const L = U.clamp(level, 1, 30);
    let i = 0;
    while (i < ANCHORS.length - 2 && L > ANCHORS[i + 1][0]) i++;
    const [l0, w0] = ANCHORS[i], [l1, w1] = ANCHORS[i + 1];
    const t = U.clamp((L - l0) / (l1 - l0), 0, 1);
    const w = {};
    for (const k of Object.keys(CELLS)) {
      const v = U.lerp(w0[k] || 0, w1[k] || 0, t);
      if (v > 0) w[k] = v;
    }
    return w;
  }
  M.effLevel = (level, diff) => (diff === 0 ? Math.max(1, level * 0.55) : diff === 1 ? Math.max(1, level * 0.75) : level);

  function profile(level, diff, bpm) {
    const bps = bpm / 60;
    const jackSec = U.lerp(0.5, 0.118, U.clamp((level - 1) / 29, 0, 1));
    const minGap = diff === 0 ? 0.5 : diff === 1 ? (level < 11 ? 0.5 : 0.25) : 0;
    return {
      level,
      diff,
      w: cellWeights(level),
      minGap,
      jack: Math.max(minGap, jackSec * bps), // beats between two notes in the same lane
      chord: diff === 0 ? 0 : level < 10 ? 0 : Math.min(0.42, (level - 9) * 0.021),
      triple: diff === 2 && level >= 26 ? 0.18 : 0,
      chordHold: diff === 2 && level >= 21 ? 0.3 : 0,
      hold: 0.55,
      extra: diff === 0 || level < 9 ? 0 : Math.min(0.45, (level - 8) * 0.02),
      rep: level < 8 ? 0.35 : 1,
      holdGap: diff === 0 ? 0.75 : 0.5,
    };
  }

  // ---------- melody ----------
  function makeRhythm(rng, P, bars) {
    const on = [];
    let motif = null;
    for (let bar = 0; bar < bars; bar++) {
      const last = bar === bars - 1;
      let cells = motif && !last && rng.chance(0.5) ? motif.slice() : [0, 1, 2, 3].map(() => rng.weighted(P.w));
      if (bar === 0) {
        if (!CELLS[cells[0]].includes(0) && rng.chance(0.75)) cells[0] = rng.chance(0.5) ? 'Q' : 'E';
        motif = cells.slice();
      }
      if (last && bars > 1) {
        const r = rng();
        if (r < 0.55) (cells[2] = 'Q'), (cells[3] = 'R');
        else if (r < 0.8) (cells[1] = 'Q'), (cells[2] = 'R'), (cells[3] = 'R');
        else cells[3] = rng.chance(0.5) ? 'Q' : 'R';
      } else if (last) {
        cells[3] = 'R';
      }
      for (let beat = 0; beat < 4; beat++) for (const off of CELLS[cells[beat]]) on.push(bar * 4 + beat + off);
    }
    const out = [];
    for (const b of on) if (!out.length || b - out[out.length - 1] >= P.minGap - 1e-6) out.push(b);
    if (!out.length) out.push(0);
    return out;
  }

  function pitchWalk(rng, P, beats, chordAt, range, startDeg) {
    const center = (range[0] + range[1]) / 2;
    const degs = [];
    let deg = startDeg != null ? startDeg : Math.round(center + rng.int(-2, 2));
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      const root = chordAt(b);
      if (i === 0) deg = nearestChordTone(deg, root);
      else {
        let step = +rng.weighted({ 0: P.rep, 1: 3.4, '-1': 3.4, 2: 1.5, '-2': 1.5, 3: 0.45, '-3': 0.45, 4: 0.25, '-4': 0.25 });
        if (deg > center + 3 && step > 0 && rng.chance(0.6)) step = -step;
        if (deg < center - 3 && step < 0 && rng.chance(0.6)) step = -step;
        deg += step;
        const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
        if (onBeat && rng.chance(0.75)) deg = nearestChordTone(deg, root);
      }
      if (deg > range[1]) deg = range[1] - rng.int(0, 2);
      if (deg < range[0]) deg = range[0] + rng.int(0, 2);
      degs.push(deg);
    }
    if (degs.length) {
      const lb = beats[beats.length - 1];
      degs[degs.length - 1] = nearestChordTone(degs[degs.length - 1], chordAt(lb), rng.chance(0.5) ? 'root' : null);
    }
    return degs;
  }

  // A phrase: [{b, dur, deg}] relative to its first beat.
  function makePhrase(rng, P, bars, chordAt, range, startDeg) {
    const beats = makeRhythm(rng, P, bars);
    const degs = pitchWalk(rng, P, beats, chordAt, range, startDeg);
    const total = bars * 4;
    return beats.map((b, i) => {
      const next = i + 1 < beats.length ? beats[i + 1] : total - 0.5;
      return { b, dur: Math.max(0.25, Math.min(next - b, 3)), deg: degs[i], last: i === beats.length - 1 };
    });
  }

  // Player's answer: same rhythm (that's the game), re-harmonized and sometimes embellished.
  function answerPhrase(rng, P, call, chordAt, range) {
    const out = call.map((n) => Object.assign({}, n));
    for (const n of out) {
      const onBeat = Math.abs(n.b - Math.round(n.b)) < 1e-6;
      if (onBeat) n.deg = nearestChordTone(n.deg, chordAt(n.b));
    }
    if (rng.chance(0.35)) {
      // re-sing the second half differently
      const half = out.length >> 1;
      const tail = out.slice(half);
      const degs = pitchWalk(rng, P, tail.map((n) => n.b), chordAt, range, out[half] ? out[half].deg : null);
      tail.forEach((n, i) => (n.deg = degs[i]));
    }
    if (P.extra > 0) {
      const add = [];
      for (let i = 0; i < out.length - 1; i++) {
        const a = out[i], gap = out[i + 1].b - a.b;
        if (gap >= 0.5 && rng.chance(P.extra)) {
          const half = gap >= 1 ? 0.5 : 0.25;
          if (half < P.minGap) continue;
          add.push({ b: a.b + half, dur: gap - half, deg: a.deg + (rng.chance(0.5) ? 1 : -1), last: false });
          a.dur = half;
        }
      }
      out.push(...add);
      out.sort((x, y) => x.b - y.b);
    }
    const last = out[out.length - 1];
    if (last && rng.chance(0.5)) last.deg = nearestChordTone(last.deg + (rng.chance(0.5) ? 2 : -2), chordAt(last.b));
    return out;
  }

  // ---------- song structure ----------
  const SLOT2 = (who) => [[who[0], 2], [who[1], 2], [who[0], 2], [who[1], 2]];
  const SEC = {
    intro: (bars) => ({ type: 'intro', energy: 1, slots: [['none', bars]] }),
    verse: () => ({ type: 'verse', energy: 2, slots: SLOT2(['opp', 'bf']) }),
    chorus: () => ({ type: 'chorus', energy: 3, slots: SLOT2(['opp', 'bf']) }),
    bridge: () => ({ type: 'bridge', energy: 2, slots: [['opp', 1], ['bf', 1], ['opp', 1], ['bf', 1], ['opp', 1], ['bf', 1], ['opp', 1], ['bf', 1]] }),
    duet: () => ({ type: 'duet', energy: 3, slots: [['both', 2], ['both', 2], ['both', 2], ['both', 2]] }),
    brk: () => ({ type: 'break', energy: 1, slots: [['none', 4]] }),
    drop: () => ({ type: 'drop', energy: 3, slots: [['opp', 1], ['bf', 1], ['opp', 1], ['bf', 1], ['opp', 1], ['bf', 1], ['opp', 1], ['bf', 1]] }),
    outro: (bars) => ({ type: 'outro', energy: 1, slots: [['none', bars]] }),
  };
  const FORMS = {
    short: ['intro2', 'verse', 'chorus', 'verse', 'chorus', 'outro2'],
    standard: ['intro4', 'verse', 'chorus', 'verse', 'bridge', 'chorus', 'chorus', 'outro2'],
    long: ['intro4', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'brk', 'chorus', 'duet', 'outro2'],
    boss: ['intro8', 'verse', 'chorus', 'verse', 'chorus', 'brk', 'bridge', 'drop', 'chorus', 'duet', 'drop', 'chorus', 'outro4'],
    final: ['intro8', 'verse', 'chorus', 'verse', 'chorus', 'brk', 'bridge', 'drop', 'chorus', 'duet', 'brk', 'drop', 'duet', 'chorus', 'drop', 'outro4'],
  };
  function makeStructure(form) {
    return FORMS[form].map((s) => {
      const m = s.match(/^([a-z]+)(\d*)$/);
      return SEC[m[1]](+m[2] || 0);
    });
  }

  // ---------- instrumental styles ----------
  // Drum lines: k kick, s snare, c clap, h hat, H open hat, r ride, p style percussion.
  // x = full, o = medium, g = ghost. Bass lines: r root, o octave, f fifth, t third, n approach, '-' tie.
  const STYLES = {
    pop: {
      kit: { kick: 'punch', snare: 'tight' },
      drums: [
        {},
        { k: 'x.......x.......', h: '..x...x...x...x.' },
        { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x.....x.x.x.....', s: '....x.......x...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', H: '..............x.' },
      ],
      bass: { p: 'pluck', pat: ['r-------r-------', 'r.r.r.r.r.r.r.o.', 'r--.r-r.r--.r-f-', 'r.r.r.r.r.o.r.f.'] },
      pad: { p: 'warm', mode: 'bar' },
      arp: { p: 'pluck', rate: 0.5, min: 3, oct: 1 },
      lead: 'pluck',
      fill: 'snare',
    },
    hiphop: {
      kit: { kick: 'punch', snare: 'tight' },
      swing: 0.22,
      drums: [
        {},
        { k: 'x.........x.....', h: 'o.o.o.o.o.o.o.o.' },
        { k: 'x.....x...x..x..', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo' },
        { k: 'x.....x.x.x..x..', s: '....x..g....x..g', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxx' },
      ],
      bass: { p: 'funk', pat: ['r-------r-------', 'r.......r..r....', 'r..r..o.r.r..f..', 'r.rr..r.o.rr.fo.'] },
      pad: { p: 'keys', mode: 'half', sev: true },
      lead: 'brass',
      fill: 'snare',
      scratch: true,
    },
    cumbia: {
      kit: { kick: 'soft', snare: 'rim' },
      perc: 'guiro',
      drums: [
        {},
        { k: 'x.......x.......', p: 'o.oo.oo.o.oo.oo.' },
        { k: 'x..x....x..x....', s: '....x.......x...', p: 'x.xxx.xxx.xxx.xx' },
        { k: 'x..x....x..x....', s: '....x..x....x..x', c: '....x.......x...', p: 'x.xxx.xxx.xxx.xx', H: '..x...x...x...x.' },
      ],
      bass: { p: 'pluck', pat: ['r-------f-------', 'r...f...r...f...', 'r...f...r...f..n', 'r..rf...r..rf.fn'] },
      pad: { p: 'organ', mode: 'stab', pat: '..x...x...x...x.', min: 2 },
      arp: { p: 'marimba', rate: 0.5, min: 3, oct: 2, pat: 'updown' },
      lead: 'theremin',
      fill: 'tom',
    },
    disco: {
      kit: { kick: 'punch', snare: 'tight' },
      drums: [
        {},
        { k: 'x...x...x...x...', h: '..x...x...x...x.' },
        { k: 'x...x...x...x...', c: '....x.......x...', H: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x...x...x...x...', c: '....x.......x...', s: '....x.......x...', H: '..x...x...x...x.', h: 'ogogogogogogogog' },
      ],
      bass: { p: 'saw', pat: ['r-------r-------', 'r.o.r.o.r.o.r.o.', 'r.o.r.o.r.o.r.o.', 'rro.rro.rro.rrof'] },
      pad: { p: 'strings', mode: 'bar', sev: true },
      arp: { p: 'pluck', rate: 0.25, min: 2, oct: 2 },
      lead: 'square',
      fill: 'snare',
    },
    chip: {
      kit: { kick: 'punch', snare: 'rim' },
      drums: [
        {},
        { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x..x..x...x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x..x..x.x.x..x..', s: '....x..x....x...', h: 'xoxoxoxoxoxoxoxo' },
      ],
      bass: { p: 'chip', pat: ['r-------r-------', 'r.r.r.r.r.r.r.r.', 'r.ror.ror.ror.rf', 'rorrorrororrorfo'] },
      pad: { p: 'chip', mode: 'stab', pat: 'x..x..x.x..x..x.', min: 2 },
      arp: { p: 'chip', rate: 0.25, min: 2, oct: 2 },
      lead: 'chip',
      fill: 'roll',
    },
    metal: {
      kit: { kick: 'hard', snare: 'big' },
      drums: [
        {},
        { k: 'x.......x.......', r: 'x...x...x...x...' },
        { k: 'x.x.x.x.x.x.x.x.', s: '....x.......x...', r: 'x.x.x.x.x.x.x.x.' },
        { k: 'xxxxxxxxxxxxxxxx', s: '....x.......x...', r: 'x.x.x.x.x.x.x.x.' },
      ],
      bass: { p: 'dist', pat: ['r-------r-------', 'r-------r-------', 'r.r.r.r.r.r.r.r.', 'rrrrrrrrrrrrrrrr'] },
      pad: { p: 'power', mode: 'stab', pat: 'x.xxx.xxx.xxx.xx', min: 2 },
      pad2: { p: 'choir', min: 3 },
      lead: 'guitar',
      fill: 'tom',
    },
    breakcore: {
      kit: { kick: 'hard', snare: 'tight' },
      perc: 'glitch',
      drums: [
        {},
        { k: 'x.........x.....', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x.x.......xx....', s: '....x..g.g..x..g', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x.x.......x.x...', s: '....x..x.x.xx..x', h: 'xxxxxxxxxxxxxxxx', H: '..x.......x.....', p: '.......o.......o' },
      ],
      bass: { p: 'reese', pat: ['r---------------', 'r---------------', 'r-------r-----n-', 'r---r---r-r-f---'] },
      pad: { p: 'dark', mode: 'bar' },
      pad2: { p: 'choir', min: 3 },
      arp: { p: 'bell', rate: 0.5, min: 3, oct: 2, pat: 'random' },
      lead: 'bell',
      fill: 'stutter',
    },
    menu: {
      kit: { kick: 'punch', snare: 'tight' },
      drums: [
        {},
        { k: 'x...x...x...x...', h: 'x.x.x.x.x.x.x.x.' },
        { k: 'x...x...x...x...', c: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', H: '..x...x...x...x.' },
        { k: 'x...x...x..xx...', c: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', H: '..x...x...x...x.' },
      ],
      bass: { p: 'funk', pat: ['r-------r-------', 'r..r..o.r.r..fo.', 'r..r..o.r.r..fo.', 'r.rr..o.r.rr.fo.'] },
      pad: { p: 'keys', mode: 'stab', pat: '..x..x....x..x..', sev: true },
      lead: 'pluck',
      fill: 'snare',
    },
  };
  M.STYLES = STYLES;

  const VEL = { x: 1, o: 0.6, g: 0.32 };

  // Arrange the instrumental for a list of bars. Returns events with t/d in seconds.
  function arrange(ctx) {
    const { style, bars, spb, key, scale, rng, cutBars } = ctx;
    const S = STYLES[style];
    const ev = [];
    const barSec = spb * 4;
    const stepSec = spb / 4;
    const swing = (S.swing || 0) * stepSec;
    const chordPitches = (deg, sev) => {
      const tones = [0, 2, 4].concat(sev ? [6] : []).map((k) => key + semi(scale, deg + k));
      // simple voice-leading: fold every tone into [55, 67)
      return tones.map((p) => {
        let m = p + 60;
        while (m >= 67) m -= 12;
        while (m < 55) m += 12;
        return m;
      }).sort((a, b) => a - b);
    };
    const bassRoot = (deg) => {
      let m = 36 + U.mod(key + semi(scale, deg), 12);
      if (m > 43) m -= 12;
      return m;
    };
    const kit = S.kit;
    for (let bi = 0; bi < bars.length; bi++) {
      const B = bars[bi];
      const t0 = bi * barSec;
      const E = B.energy;
      const pat = S.drums[E] || {};
      const cut = cutBars && cutBars.has(bi) ? 8 : 16; // second half silent before a drop
      const fill = B.fill && E > 0;
      const stepT = (st) => t0 + st * stepSec + (st % 2 === 1 ? swing : 0);
      // drums
      for (const line of ['k', 's', 'c', 'h', 'H', 'r', 'p']) {
        const str = pat[line];
        if (!str) continue;
        for (let st = 0; st < cut; st++) {
          if (fill && st >= 8 && (line === 's' || line === 'c' || line === 'p')) continue;
          const ch = str[st];
          if (ch === '.' || !ch) continue;
          const v = VEL[ch] || 1;
          const t = stepT(st);
          if (line === 'k') ev.push({ t, k: 'kick', v: v * 0.95, p: kit.kick });
          else if (line === 's') ev.push({ t, k: 'snare', v: v * 0.8, p: kit.snare });
          else if (line === 'c') ev.push({ t, k: 'clap', v: v * 0.7 });
          else if (line === 'h') ev.push({ t, k: 'hat', v: v * 0.45 });
          else if (line === 'H') ev.push({ t, k: 'ohat', v: v * 0.4 });
          else if (line === 'r') ev.push({ t, k: 'ride', v: v * 0.6 });
          else if (line === 'p') ev.push({ t, k: 'perc', v: v * 0.6, p: S.perc || 'shaker' });
        }
      }
      if (fill) {
        for (let st = 8; st < 16; st++) {
          const t = stepT(st);
          const v = 0.45 + ((st - 8) / 8) * 0.55;
          if (S.fill === 'tom') {
            if (st % 2 === 0 || st >= 12) ev.push({ t, k: 'tom', v, f: 220 - (st - 8) * 18 });
          } else if (S.fill === 'roll') {
            ev.push({ t, k: 'snare', v: v * 0.7, p: kit.snare });
          } else if (S.fill === 'stutter') {
            ev.push({ t, k: 'snare', v: v * 0.75, p: kit.snare });
            if (st >= 12) ev.push({ t: t + stepSec / 2, k: 'snare', v: v * 0.6, p: kit.snare });
          } else if (st % 2 === 0 || st >= 13) ev.push({ t, k: 'snare', v: v * 0.8, p: kit.snare });
        }
      }
      if (B.crash && E >= 2) ev.push({ t: t0, k: 'crash', v: 0.9 });
      if (S.scratch && B.fill && E >= 2) ev.push({ t: t0 + 14 * stepSec, k: 'perc', v: 0.8, p: 'scratch' });

      // bass
      const bp = S.bass.pat[E];
      if (bp && E > 0) {
        const root = bassRoot(B.chord);
        const nextRoot = bassRoot(B.next);
        let st = 0;
        while (st < cut) {
          const ch = bp[st];
          if (ch === '.' || ch === '-') {
            st++;
            continue;
          }
          let len = 1;
          while (st + len < 16 && bp[st + len] === '-') len++;
          let m = root;
          if (ch === 'o') m = root + 12;
          else if (ch === 'f') m = root + 7;
          else if (ch === 't') m = bassRoot(B.chord + 2);
          else if (ch === 'n') m = nextRoot + (nextRoot > root ? -1 : 1);
          ev.push({ t: stepT(st), k: 'bass', m, d: len * stepSec * 0.92, v: 0.9, p: S.bass.p });
          st += len;
        }
      }
      // chords
      const pd = S.pad;
      if (pd && E > 0) {
        const ms = chordPitches(B.chord, pd.sev);
        if (pd.mode === 'stab' && E >= (pd.min || 1)) {
          for (let st = 0; st < cut; st++) if (pd.pat[st] === 'x') ev.push({ t: stepT(st), k: 'pad', ms, d: stepSec * 1.6, v: 1, p: pd.p });
        } else if (pd.mode === 'half') {
          ev.push({ t: t0, k: 'pad', ms, d: barSec / 2 - 0.02, v: 1, p: pd.p });
          if (cut === 16) ev.push({ t: t0 + barSec / 2, k: 'pad', ms, d: barSec / 2 - 0.02, v: 0.9, p: pd.p });
        } else {
          ev.push({ t: t0, k: 'pad', ms, d: (cut === 16 ? barSec : barSec / 2) - 0.03, v: 1, p: pd.mode === 'stab' ? 'warm' : pd.p });
        }
      }
      if (S.pad2 && E >= S.pad2.min) ev.push({ t: t0, k: 'pad', ms: chordPitches(B.chord).map((m) => m + 12), d: barSec - 0.05, v: 1, p: S.pad2.p });
      // arpeggio
      const ap = S.arp;
      if (ap && E >= ap.min) {
        const base = chordPitches(B.chord).map((m) => m + 12);
        const notes = [];
        for (let o = 0; o < (ap.oct || 1); o++) for (const m of base) notes.push(m + 12 * o);
        const n = Math.round(4 / ap.rate);
        for (let i = 0; i < n; i++) {
          const t = t0 + i * ap.rate * spb;
          if (t >= t0 + (cut / 16) * barSec) break;
          let idx;
          if (ap.pat === 'updown') {
            const cyc = notes.length * 2 - 2;
            const j = i % cyc;
            idx = j < notes.length ? j : cyc - j;
          } else if (ap.pat === 'random') idx = rng.int(0, notes.length - 1);
          else idx = i % notes.length;
          ev.push({ t, k: 'lead', m: notes[idx], d: ap.rate * spb * 0.8, v: 0.55, p: ap.p });
        }
      }
    }
    return ev;
  }

  // ---------- full song build ----------
  // Layout = everything that doesn't depend on difficulty (form, harmony, instrumental).
  const layoutCache = new Map();
  function layout(def, rate) {
    const ck = def.id + ':' + rate;
    if (layoutCache.has(ck)) return layoutCache.get(ck);
    const bpm = def.bpm * rate;
    const spb = 60 / bpm;
    const key = KEYS[def.key];
    const scale = SCALES[def.scale];
    const mech = def.mech || {};
    const form = def.form || (def.bpm < 112 ? 'short' : def.bpm < 150 ? 'standard' : def.bpm < 186 ? 'long' : 'boss');
    const structure = makeStructure(form);
    const rArr = U.rng(def.seed * 7 + 11);
    const progs = Object.assign({}, def.prog || {});
    const minorish = def.scale !== 'major' && def.scale !== 'mixolydian';
    const PROG_LIB = minorish
      ? [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 4, 0], [0, 5, 3, 4], [5, 6, 0, 0], [0, 0, 5, 6], [3, 4, 0, 0], [0, 3, 5, 4]]
      : [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 5], [0, 3, 0, 4], [5, 3, 0, 4], [0, 3, 4, 4]];
    const progFor = (type) => {
      if (!progs[type]) progs[type] = rArr.pick(PROG_LIB);
      return progs[type];
    };
    const range = def.range || [-2, 9];

    const bars = [];
    const sections = [];
    let barCursor = 0;
    structure.forEach((sec, si) => {
      // the intro carries the chorus hook, so it shares the chorus harmony
      const prog =
        sec.type === 'intro' || sec.type === 'drop' ? progFor('chorus') : sec.type === 'outro' || sec.type === 'break' ? progFor('verse') : progFor(sec.type);
      let b = 0;
      sec.slots.forEach(([who, n]) => {
        sections.push({ b0: barCursor + b, b1: barCursor + b + n, who, type: sec.type, energy: sec.energy, si, off: b });
        b += n;
      });
      for (let i = 0; i < b; i++) bars.push({ chord: prog[i % prog.length], energy: sec.energy, sec: si, type: sec.type, crash: i === 0, fill: false, next: 0 });
      barCursor += b;
    });
    for (let i = 0; i < bars.length; i++) {
      const nb = bars[i + 1];
      bars[i].next = nb ? nb.chord : bars[i].chord;
      if (nb && nb.sec !== bars[i].sec && nb.energy >= 2) bars[i].fill = true;
    }
    bars[bars.length - 1].energy = 1;
    // Silence before drops: the second half of the previous bar is cut ("El Silencio" moments).
    const cutBars = new Set();
    sections.forEach((s) => {
      if (s.type === 'drop' && s.off === 0 && s.b0 > 0 && bars[s.b0 - 1].type !== 'drop') cutBars.add(s.b0 - 1);
    });
    const events = arrange({ style: def.style, bars, spb, key, scale, rng: rArr, cutBars });

    // The intro lead teases the chorus hook (difficulty-independent).
    const rHook = U.rng(def.seed * 17 + 3);
    const hookP = profile(Math.min(def.level, 12), 2, bpm);
    hookP.minGap = 0.25;
    const chorusProg = progFor('chorus');
    const hook = makePhrase(rHook, hookP, 2, (b) => chorusProg[Math.floor(b / 4) % chorusProg.length], range);
    const introSec = sections[0];
    if (introSec && introSec.who === 'none') {
      const S = STYLES[def.style];
      const reps = Math.floor((introSec.b1 - introSec.b0) / 2);
      for (let r = Math.max(0, reps - 2); r < reps; r++) {
        for (const n of hook) {
          events.push({ t: ((introSec.b0 + r * 2) * 4 + n.b) * spb, k: 'lead', m: key + 72 + semi(scale, n.deg), d: Math.min(n.dur, 1) * spb * 0.9, v: 0.7, p: S.lead });
        }
      }
    }
    const endT = bars.length * 4 * spb;
    const lastChord = bars[bars.length - 1].chord;
    events.push({ t: endT - 4 * spb, k: 'pad', ms: [0, 2, 4].map((k) => key + 60 + semi(scale, lastChord + k)), d: 4 * spb, v: 1, p: 'warm' });

    // Gameplay events: camera bumps, flashes, drops, silences, modchart toggles.
    const gev = [];
    sections.forEach((s, i) => {
      const t = s.b0 * 4 * spb;
      const prev = sections[i - 1];
      if (s.off !== 0) return;
      gev.push({ t, e: 'bump', every: s.type === 'drop' ? 1 : s.energy >= 3 ? 2 : 4 });
      if (s.energy >= 3) gev.push({ t, e: 'flash', a: s.type === 'drop' ? 0.55 : 0.3 });
      if (s.type === 'drop') {
        gev.push({ t, e: 'shake', a: 10 });
        events.push({ t, k: 'fx', n: 'boom' });
      }
      if (mech.mod) {
        if (s.type === 'drop' || s.type === 'duet') gev.push({ t, e: 'mod', on: true, kind: s.type === 'drop' ? 'wave' : 'drunk' });
        else if (prev && (prev.type === 'drop' || prev.type === 'duet')) gev.push({ t, e: 'mod', on: false });
      }
      if (s.type === 'break') events.push({ t: t + 8 * spb, k: 'fx', n: 'riser' });
    });
    for (const b of cutBars) {
      const t = (b * 4 + 2) * spb;
      events.push({ t, k: 'fx', n: 'tapestop' });
      gev.push({ t, e: 'silence', d: 2 * spb });
    }
    if (mech.phase2) {
      const firstDrop = sections.find((s) => s.type === 'drop');
      if (firstDrop) gev.push({ t: firstDrop.b0 * 4 * spb, e: 'phase2' });
    }
    gev.push({ t: endT - 4 * spb, e: 'end' });
    gev.sort((a, b) => a.t - b.t);
    events.sort((a, b) => a.t - b.t);

    const singing = sections.filter((s) => s.who === 'bf' || s.who === 'both').reduce((a, s) => a + (s.b1 - s.b0) * 4 * spb, 0);
    const L = { bpm, spb, key, scale, bars, sections, events, gev, endT, range, singing, mech };
    layoutCache.set(ck, L);
    return L;
  }

  function scaleWeights(w, mul) {
    const o = {};
    for (const k in w) o[k] = w[k] * Math.pow(mul, CELLS[k].length - 1.5);
    return o;
  }

  // The chart for one difficulty at one density multiplier.
  function chart(def, diff, L, P0, mul) {
    const { spb, key, scale, bars, sections, range, mech } = L;
    const P = Object.assign({}, P0, { w: scaleWeights(P0.w, mul) });
    const rMel = U.rng(def.seed * 13 + 101 + diff * 7919);
    const chordAtBar = (bar) => (bars[bar] ? bars[bar].chord : 0);
    const material = {}; // per section type + slot: reused when the section repeats
    const vocal = { opp: [], bf: [] };
    let phraseNo = 0;
    const push = (side, phrase, startBar, s) => {
      for (const n of phrase) vocal[side].push({ b: startBar * 4 + n.b, dur: n.dur, deg: n.deg, last: n.last, ph: phraseNo, harm: [], hold: 0, energy: s.energy });
      phraseNo++;
    };
    for (const s of sections) {
      if (s.who === 'none') continue;
      const chordAt = (b) => chordAtBar(s.b0 + Math.floor(b / 4));
      const mk = s.type + ':' + s.off;
      let mat = material[mk];
      if (!mat) {
        const len = s.b1 - s.b0;
        if (s.who === 'opp' || s.who === 'both') {
          const call = makePhrase(rMel, P, len, chordAt, range);
          mat = { call };
          if (s.who === 'both') {
            const harm = call.map((n) => Object.assign({}, n, { deg: n.deg + 2 }));
            mat.bf = P.extra > 0 ? answerPhrase(rMel, P, harm, chordAt, [range[0] + 2, range[1] + 2]) : harm;
          }
        } else {
          // the player answers the opponent's previous phrase
          const prev = material[s.type + ':' + (s.off - len)];
          const call = prev ? prev.call : makePhrase(rMel, P, len, chordAt, range);
          mat = { call: answerPhrase(rMel, P, call, chordAt, range) };
        }
        material[mk] = mat;
      }
      if (s.who === 'opp') push('opp', mat.call, s.b0, s);
      else if (s.who === 'bf') push('bf', mat.call, s.b0, s);
      else {
        push('opp', mat.call, s.b0, s);
        push('bf', mat.bf, s.b0, s);
      }
    }

    // Holds, chords and lanes. A note may be nudged a scale step so its lane is playable
    // (no jacks faster than the level allows, nothing inside a held lane); the sung pitch
    // follows, so the chart and the melody never disagree.
    const perm = [[0, 1, 2, 3], [1, 3, 0, 2], [2, 0, 3, 1], [3, 2, 1, 0]][def.seed % 4];
    const laneOf = (deg) => perm[U.mod(deg, 4)];
    const notes = [];
    for (const side of ['opp', 'bf']) {
      const list = vocal[side].sort((a, b) => a.b - b.b);
      const rS = U.rng(def.seed * 31 + (side === 'bf' ? 7 : 3) + diff * 101);
      const free = [-9, -9, -9, -9];
      for (let i = 0; i < list.length; i++) {
        const n = list[i];
        n.hold = n.dur >= 1 && (n.last || rS.chance(P.hold)) ? Math.max(0.5, n.dur - (n.dur >= 1.5 ? 0.5 : 0.25)) : 0;
        const strong = Math.abs(n.b - Math.round(n.b)) < 1e-6 && Math.round(n.b) % 2 === 0;
        if (strong && n.energy >= 3 && rS.chance(P.chord)) {
          n.harm.push(n.deg + 2 <= range[1] + 2 ? n.deg + 2 : n.deg - 2);
          if (rS.chance(P.triple)) n.harm.push(n.deg + 5 <= range[1] + 4 ? n.deg + 5 : n.deg - 3);
        }
        const placed = [];
        const tryPlace = (deg, isHarm) => {
          for (const o of [0, 1, -1, 2, -2, 3, -3]) {
            const l = laneOf(deg + o);
            if (free[l] <= n.b + 1e-6 && !placed.some((p) => p.lane === l)) return { deg: deg + o, lane: l, harm: isHarm };
          }
          return null;
        };
        const mel = tryPlace(n.deg, false);
        if (!mel) continue; // every lane busy: this note is simply not charted
        placed.push(mel);
        for (const h of n.harm) {
          const ph = tryPlace(h, true);
          if (ph) placed.push(ph);
        }
        const nextB = list[i + 1] ? list[i + 1].b : n.b + 4;
        for (const p of placed) {
          let hold = n.hold;
          if (p.harm && !hold && P.chordHold && rS.chance(P.chordHold)) hold = Math.min(2, Math.max(0.75, nextB - n.b + 0.75));
          free[p.lane] = hold > 0 ? n.b + hold + P.holdGap : n.b + P.jack;
          notes.push({
            t: n.b * spb,
            b: n.b,
            lane: p.lane,
            side: side === 'opp' ? 0 : 1,
            len: hold > 0 ? hold * spb : 0,
            m: key + 60 + semi(scale, p.deg),
            vd: (hold > 0 ? hold : Math.min(n.dur, 1.5) * 0.92) * spb,
            vw: (i + n.ph) % 4,
            harm: p.harm,
            type: 0,
          });
        }
      }
    }

    // Hurt notes (fire/static): player side only, well clear of real notes in that lane.
    if (mech.hurt) {
      const rH = U.rng(def.seed * 41 + diff);
      const amount = mech.hurt * [0.45, 0.75, 1][diff];
      const bfNotes = notes.filter((n) => n.side === 1);
      const clear = (t, lane) => bfNotes.every((n) => n.lane !== lane || t < n.t - 0.26 || t > n.t + n.len + 0.26);
      for (const s of sections) {
        if (s.who !== 'bf' && s.who !== 'both') continue;
        for (let beat = s.b0 * 4; beat < s.b1 * 4; beat++) {
          if (!rH.chance(amount)) continue;
          const b = beat + (rH.chance(0.5) ? 0 : 0.5);
          const lane = rH.int(0, 3);
          if (clear(b * spb, lane)) notes.push({ t: b * spb, b, lane, side: 1, len: 0, m: 0, vd: 0, vw: 0, harm: true, type: 1 });
        }
      }
    }
    notes.sort((a, b) => a.t - b.t || a.side - b.side || a.lane - b.lane);
    return notes;
  }

  // Remove the least important notes (16th off-beats, chord extras, off-beats...) so each side
  // keeps `ratio` of its notes. Holds and phrase-ending notes are never removed.
  function thin(notes, ratio, spb) {
    const frac = (x) => Math.abs(x - Math.round(x)) > 1e-6;
    const pr = (n) => (n.len > 0 ? 9 : frac(n.b * 2) ? 1 : n.harm ? 1.5 : frac(n.b) ? 2 : Math.round(n.b) % 2 ? 3 : 4);
    const spread = (n) => (n.b * 0.6180339887) % 1;
    const drop = new Set();
    for (const side of [0, 1]) {
      const mine = notes.filter((n) => n.side === side && n.type === 0);
      const excess = mine.length - Math.round(mine.length * ratio);
      if (excess <= 0) continue;
      mine.filter((n) => pr(n) < 9).sort((a, b) => pr(a) - pr(b) || spread(a) - spread(b)).slice(0, excess).forEach((n) => drop.add(n));
    }
    return notes.filter((n) => !drop.has(n));
  }

  const playerNps = (notes, L) => notes.filter((n) => n.side === 1 && n.type === 0).length / Math.max(1, L.singing);
  M.targetNps = (def, diff) => def.nps * [0.5, 0.72, 1][diff];

  const cache = new Map();
  M.build = function (def, diff, rate) {
    rate = rate || 1;
    const ck = def.id + ':' + diff + ':' + rate;
    if (cache.has(ck)) return cache.get(ck);
    const L = layout(def, rate);
    const level = M.effLevel(def.level, diff);
    const P = profile(level, diff, L.bpm);
    // Calibrate density so every chart lands on its notes-per-second target: this is what
    // guarantees each song is harder than the one before it. Density moves in jumps (phrases
    // repeat), so take the lightest chart at or above target and thin its weakest notes.
    const target = M.targetNps(def, diff) * rate;
    let over = null, under = null, lo = Math.log(0.2), hi = Math.log(5);
    for (let it = 0; it < 12; it++) {
      const mul = Math.exp((lo + hi) / 2);
      const notes = chart(def, diff, L, P, mul);
      const nps = playerNps(notes, L);
      if (nps >= target) {
        if (!over || mul < over.mul) over = { notes, nps, mul };
        hi = Math.log(mul);
      } else {
        if (!under || mul > under.mul) under = { notes, nps, mul };
        lo = Math.log(mul);
      }
      if (Math.abs(nps - target) <= target * 0.01) break;
    }
    const best = over || under;
    const notes = best.nps > target ? thin(best.notes, target / best.nps, L.spb) : best.notes;
    best.nps = playerNps(notes, L);
    const events = L.events.slice();
    // Opponent vocals are part of the backing track; the player's are sung on hit.
    for (const n of notes) {
      if (n.side !== 0 || n.type !== 0) continue;
      events.push({ t: n.t, k: 'voice', ch: 'opp', m: n.m, d: n.vd, v: n.harm ? 0.45 : 1, vw: n.vw, c: n.harm ? 0 : 1 });
    }
    events.sort((a, b) => a.t - b.t);
    const data = {
      def,
      diff,
      rate,
      bpm: L.bpm,
      spb: L.spb,
      events,
      notes,
      gev: L.gev,
      sections: L.sections.map((s) => ({ t0: s.b0 * 4 * L.spb, t1: s.b1 * 4 * L.spb, who: s.who, type: s.type, energy: s.energy })),
      length: L.endT + 0.5,
      bars: L.bars.length,
      singing: L.singing,
      level,
      nps: best.nps,
      mul: best.mul,
    };
    cache.set(ck, data);
    return data;
  };

  // Stats used by tests and the freeplay screen.
  M.stats = function (data) {
    const pn = data.notes.filter((n) => n.side === 1 && n.type === 0);
    const singing = data.sections.filter((s) => s.who === 'bf' || s.who === 'both').reduce((a, s) => a + (s.t1 - s.t0), 0);
    let peak = 0;
    for (let i = 0; i < pn.length; i++) {
      let j = i;
      while (j < pn.length && pn[j].t - pn[i].t < 1) j++;
      peak = Math.max(peak, j - i);
    }
    return { notes: pn.length, nps: singing ? pn.length / singing : 0, peak, hurt: data.notes.filter((n) => n.type === 1).length, length: data.length };
  };

  // ---------- small looping themes ----------
  function themeFromBars(style, keyName, scaleName, bpm, chords, energies, opts) {
    const spb = 60 / bpm;
    const key = KEYS[keyName], scale = SCALES[scaleName];
    const bars = chords.map((c, i) => ({ chord: c, energy: energies[i % energies.length], crash: i === 0, fill: false, next: chords[(i + 1) % chords.length] }));
    const rng = U.rng(opts.seed || 5);
    const events = arrange({ style, bars, spb, key, scale, rng });
    if (opts.lead) {
      const P = profile(opts.leadLevel || 6, 2, bpm);
      P.minGap = 0.25;
      for (let ph = 0; ph < chords.length / 2; ph++) {
        const chordAt = (b) => chords[(ph * 2 + Math.floor(b / 4)) % chords.length];
        const r2 = U.rng((opts.seed || 5) * 3 + (ph % 2));
        const phrase = makePhrase(r2, P, 2, chordAt, [0, 8]);
        for (const n of phrase) {
          events.push({ t: (ph * 8 + n.b) * spb, k: 'lead', m: key + 72 + semi(scale, n.deg), d: Math.min(n.dur, 1) * spb * 0.9, v: opts.leadVol || 0.8, p: opts.lead });
        }
      }
    }
    events.sort((a, b) => a.t - b.t);
    return { events, bpm, loopFrom: 0, loopTo: chords.length * 4 * spb };
  }
  const themes = {};
  M.theme = function (name) {
    if (themes[name]) return themes[name];
    let th;
    if (name === 'menu') th = themeFromBars('menu', 'A', 'dorian', 102, [0, 0, 3, 3, 5, 5, 4, 4], [2, 3, 3, 3, 3, 3, 3, 3], { lead: 'pluck', seed: 21, leadLevel: 9 });
    else if (name === 'pause') th = themeFromBars('pop', 'F', 'major', 88, [0, 5, 3, 4], [1], { lead: 'bell', seed: 4, leadLevel: 3, leadVol: 0.6 });
    else if (name === 'gameover') th = themeFromBars('pop', 'D', 'minor', 80, [0, 5, 3, 4], [1], { lead: 'theremin', seed: 9, leadLevel: 2, leadVol: 0.5 });
    else if (name.startsWith('dlg:')) {
      // dialogue backing for a week: its style, gentle energy
      const [, style, keyName, scaleName, bpm] = name.split(':');
      th = themeFromBars(style, keyName, scaleName, +bpm, [0, 5, 3, 4], [1], { seed: 13 });
    }
    themes[name] = th;
    return th;
  };

  // Freeplay preview: the instrumental from the first chorus, looping 8 bars.
  M.preview = function (def) {
    const d = M.build(def, 2, 1);
    const events = d.events.filter((e) => e.k !== 'voice');
    const ch = d.sections.find((s) => s.type === 'chorus') || d.sections[0];
    return { events, bpm: d.bpm, loopFrom: ch.t0, loopTo: Math.min(d.length - 0.5, ch.t0 + 8 * 4 * d.spb) };
  };
})();
