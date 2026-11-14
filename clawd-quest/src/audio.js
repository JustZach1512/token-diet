// ============================================================================
// AUDIO / MÚSICA — Web Audio API en tiempo real
// Cadena: voces → bus música (filtro paso bajo para pausa) / bus efectos →
//         master → compresor → limitador → salida.  Reverb (IR generada) y
//         delay con realimentación filtrada como envíos.
// Secuenciador propio con lookahead programado sobre audioContext.currentTime.
// ============================================================================
const AUDIO = (() => {
  'use strict';
  let ctx = null, master, musicBus, sfxBus, musicFilter, revIn, delayIn, noiseBuf, PW = {};
  const settings = { music: 0.7, sfx: 0.8, muted: false };
  let activeSfx = 0;
  const lastPlay = {};

  // ------------------------------------------------------------ INICIALIZACIÓN
  function init() {
    if (ctx) { resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 20000; musicFilter.Q.value = 0.7;
    musicBus = ctx.createGain(); musicBus.connect(musicFilter); musicFilter.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    // reverb: respuesta impulsiva estéreo generada (ruido con decaimiento exponencial)
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 80 ? i / 80 : 1); }
    }
    rev.buffer = ir;
    revIn = ctx.createGain(); revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.28;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(master);
    const musicRevSend = ctx.createGain(); musicRevSend.gain.value = 0.22; musicFilter.connect(musicRevSend); musicRevSend.connect(revIn);
    const sfxRevSend = ctx.createGain(); sfxRevSend.gain.value = 0.12; sfxBus.connect(sfxRevSend); sfxRevSend.connect(revIn);
    // delay (eco) con realimentación filtrada
    delayIn = ctx.createGain();
    const dl = ctx.createDelay(1.0); dl.delayTime.value = 0.214;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    const dlOut = ctx.createGain(); dlOut.gain.value = 0.32;
    delayIn.connect(dl); dl.connect(dlf); dlf.connect(fb); fb.connect(dl); dlf.connect(dlOut); dlOut.connect(musicFilter);
    // ruido blanco reutilizable
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    // ondas de pulso con distinto ciclo de trabajo (duty cycle)
    for (const [name, duty] of [['p12', 0.125], ['p25', 0.25], ['p50', 0.5]]) {
      const N = 48, re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) { re[n] = (2 / (n * Math.PI)) * Math.sin(2 * n * Math.PI * duty); im[n] = (4 / (n * Math.PI)) * Math.pow(Math.sin(n * Math.PI * duty), 2); }
      PW[name] = ctx.createPeriodicWave(re, im);
    }
    applyVolumes();
    setInterval(scheduler, 25);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  }
  function resume() { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }
  function applyVolumes() {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicBus.gain.setTargetAtTime(settings.muted ? 0 : settings.music * 0.6, t, 0.05);
    sfxBus.gain.setTargetAtTime(settings.muted ? 0 : settings.sfx * 0.75, t, 0.05);
  }
  function setVolumes(m, s, muted) { settings.music = m; settings.sfx = s; settings.muted = muted; applyVolumes(); }

  // ------------------------------------------------------------ VOCES (ADSR sin clics)
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function osc(o) {
    const n = ctx.createOscillator();
    if (o.wave && PW[o.wave]) n.setPeriodicWave(PW[o.wave]); else n.type = o.type || 'square';
    return n;
  }
  // Nota musical. inst = {wave|type, a,d,s,r, vol, lp, vib, delay}
  function note(t, freq, dur, inst, vel, out) {
    const o = osc(inst), g = ctx.createGain();
    o.frequency.setValueAtTime(freq, t);
    let node = o;
    if (inst.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(inst.lp, t); f.Q.value = inst.q || 1; node.connect(f); node = f; }
    node.connect(g); g.connect(out);
    if (inst.delay) { const ds = ctx.createGain(); ds.gain.value = 0.5; g.connect(ds); ds.connect(delayIn); }
    const v = inst.vol * vel, a = inst.a, d = inst.d, s = inst.s, r = inst.r;
    const hold = Math.max(dur, a + 0.005);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setTargetAtTime(v * s, t + a, d);
    g.gain.setTargetAtTime(0, t + hold, r);
    if (inst.vib && dur > 0.18) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.009, t + Math.min(dur, 0.35));
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + hold + r * 6);
    }
    if (inst.bend) o.frequency.exponentialRampToValueAtTime(freq * inst.bend, t + hold);
    o.start(t); o.stop(t + hold + r * 6 + 0.02);
  }
  function drum(t, kind, vel, out) {
    if (kind === 'k') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55 * vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.3);
      nz(t, 0.012, 0.12 * vel, 'highpass', 3000, 3000, 0.7, out);
    } else if (kind === 's') {
      nz(t, 0.16, 0.3 * vel, 'bandpass', 1900, 1500, 0.8, out);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25 * vel, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.12);
    } else if (kind === 'h') nz(t, 0.035, 0.09 * vel, 'highpass', 7600, 7600, 0.8, out);
    else if (kind === 'o') nz(t, 0.2, 0.08 * vel, 'highpass', 6800, 6000, 0.8, out);
    else if (kind === 'c') nz(t, 1.1, 0.16 * vel, 'highpass', 4200, 3000, 0.6, out);
    else if (kind === 't' || kind === 'u') {
      const f = kind === 't' ? 210 : 120;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.2);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4 * vel, t + 0.003); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.27);
    }
  }
  function nz(t, dur, vol, ftype, f0, f1, q, out) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.setValueAtTime(f0, t); f.Q.value = q;
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    return src;
  }

  // ------------------------------------------------------------ INSTRUMENTOS
  const INST = {
    lead: { wave: 'p25', a: 0.004, d: 0.14, s: 0.6, r: 0.05, vol: 0.15, vib: true },
    lead2: { wave: 'p12', a: 0.004, d: 0.12, s: 0.65, r: 0.06, vol: 0.15, vib: true, delay: true },
    leadSaw: { type: 'sawtooth', lp: 2600, a: 0.008, d: 0.2, s: 0.6, r: 0.07, vol: 0.1, vib: true, delay: true },
    pluck: { wave: 'p25', a: 0.002, d: 0.08, s: 0.25, r: 0.05, vol: 0.17, delay: true },
    ctr: { wave: 'p50', a: 0.006, d: 0.18, s: 0.5, r: 0.06, vol: 0.06 },
    bass: { type: 'triangle', a: 0.003, d: 0.12, s: 0.85, r: 0.04, vol: 0.34 },
    bassP: { wave: 'p50', lp: 700, a: 0.003, d: 0.1, s: 0.6, r: 0.04, vol: 0.12 },
    arp: { wave: 'p12', a: 0.002, d: 0.05, s: 0.25, r: 0.03, vol: 0.05, delay: true },
    pad: { type: 'sawtooth', lp: 1100, a: 0.18, d: 0.5, s: 0.7, r: 0.25, vol: 0.03 },
    bell: { type: 'sine', a: 0.002, d: 0.35, s: 0.15, r: 0.3, vol: 0.09, delay: true },
  };

  // ------------------------------------------------------------ COMPOSICIONES ORIGINALES
  // Notación: compases separados por "|"; cada nota "Nota+octava:duración(en semicorcheas)", "r" = silencio.
  // Acordes por compás (uno o dos por compás). Bajo, arpegios, contramelodía y pads se generan de los acordes.
  const SONGS = {
    title: { bpm: 116, order: ['intro', 'A', 'B'], loop: 1, sec: {
      intro: { ch: 'G | D', mel: 'r:16 | r:8 D5:2 G5:2 B5:2 D6:2', bass: 'half', arp: 'bell', drums: 'soft', pad: 1 },
      A: { ch: 'G | D | Em | C | G | Em | Am | D',
        mel: 'D5:2 G5:2 B5:4 A5:2 G5:2 D5:4 | F#5:2 A5:2 D6:4 C6:2 A5:2 F#5:4 | G5:2 B5:2 E6:4 D6:2 B5:2 G5:4 | E5:4 G5:4 C6:6 r:2 | B5:2 D6:2 G6:4 F#6:2 D6:2 B5:4 | G5:2 B5:2 E6:4 G6:4 E6:4 | C6:2 E6:2 A6:4 G6:2 E6:2 C6:2 E6:2 | D6:8 A5:4 F#5:4',
        ctr: 'sus', bass: 'bounce', arp: 'up16', drums: 'soft2', pad: 1, inst: 'lead' },
      B: { ch: 'C | D | Bm | Em | C | D | G | G',
        mel: 'E6:6 D6:2 C6:4 G5:4 | F#6:6 E6:2 D6:4 A5:4 | D6:2 F#6:2 B6:4 A6:2 F#6:2 D6:4 | E6:8 B5:4 G5:4 | C6:2 E6:2 G6:4 E6:4 C6:4 | D6:2 F#6:2 A6:4 F#6:4 D6:4 | B6:4 A6:2 G6:2 D6:4 B5:4 | G6:8 r:8',
        ctr: 'harm', bass: 'walk', arp: 'bell', drums: 'soft2', pad: 1, inst: 'lead2', fills: [7] },
    }, drums: {
      soft: { k: 'x.......x.......', h: '....x.......x...' },
      soft2: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
      fill: { k: 'x.....x.........', s: '....x.......x.xx', h: 'x.x.x.x.x.x.....' },
    } },

    surface: { bpm: 140, order: ['intro', 'A', 'B', 'A2', 'C'], loop: 1, sec: {
      intro: { ch: 'C | G', mel: 'r:16 | r:8 G4:2 C5:2 E5:2 G5:2', bass: 'bounce', drums: 'intro' },
      A: { ch: 'C | Em | F | G | C | Am | Dm G | C',
        mel: 'E5:2 G5:2 r:1 G5:1 A5:2 G5:2 E5:2 C5:2 D5:2 | E5:3 D5:1 B4:2 G4:2 r:2 B4:2 D5:2 E5:2 | F5:2 A5:2 r:1 A5:1 C6:2 A5:2 F5:2 G5:2 A5:2 | G5:6 D5:2 B4:2 D5:2 G5:2 F5:2 | E5:2 G5:2 r:1 G5:1 C6:2 B5:2 G5:2 E5:2 G5:2 | A5:3 G5:1 E5:2 C5:2 r:2 E5:2 A5:2 G5:2 | F5:2 E5:2 D5:2 F5:2 G5:2 A5:2 B5:2 D6:2 | C6:6 G5:2 E5:2 C5:2 r:4',
        ctr: 'sus', bass: 'bounce', arp: 'up16', drums: 'beat', fills: [7], inst: 'lead' },
      B: { ch: 'F | G | Em | Am | Dm | G | Em Am | Dm G',
        mel: 'A5:2 G5:2 F5:2 C5:2 r:2 F5:2 A5:2 C6:2 | B5:4 A5:2 G5:2 D5:4 r:2 G5:2 | G5:2 E5:2 B4:2 E5:2 G5:2 B5:2 A5:2 G5:2 | A5:6 E5:2 C5:2 E5:2 A5:2 B5:2 | D6:2 C6:2 A5:2 F5:2 r:2 A5:2 C6:2 D6:2 | B5:4 G5:4 D5:4 G5:4 | E5:2 G5:2 B5:2 G5:2 A5:2 C6:2 E6:2 C6:2 | D6:4 C6:2 B5:2 A5:2 B5:2 G5:4',
        ctr: 'harm', bass: 'walk', arp: 'up16', drums: 'beat2', fills: [3, 7], inst: 'lead' },
      A2: { from: 'A', inst: 'lead2', ctr: 'harm', arp: 'updown',
        replace: { 6: 'F5:2 A5:2 D6:2 C6:2 B5:2 G5:2 A5:2 B5:2', 7: 'C6:4 E6:2 D6:2 C6:4 r:4' } },
      C: { ch: 'Am | F | Dm | G', mel: 'C6:2 B5:2 A5:4 E5:4 A5:4 | C6:2 A5:2 F5:4 C5:4 F5:4 | D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 A5:2 | G5:2 A5:2 B5:2 C6:2 D6:6 r:2',
        ctr: 'sus', bass: 'drive', arp: 'broken', drums: 'half', fills: [3], inst: 'leadSaw', pad: 1 },
    }, drums: {
      intro: { k: 'x.......x.......', s: '............x.x.', h: '..x...x...x...x.' },
      beat: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.xxx.x.x.xxx.x.' },
      beat2: { k: 'x...x...x...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
      half: { k: 'x.......x.....x.', s: '........x.......', h: 'x...x...x...x...' },
      fill: { k: 'x.......x.......', s: '....x...x.x.xxxx', h: 'x.x.x.x.........' },
    } },

    cave: { bpm: 120, order: ['intro', 'A', 'B', 'A2', 'C'], loop: 1, sec: {
      intro: { ch: 'Dm | Dm', mel: 'r:16 | r:16', bass: 'synco', arp: 'broken', drums: 'intro' },
      A: { ch: 'Dm | Dm | C | C | Bb | Bb | A | A',
        mel: 'D5:1 r:1 F5:1 r:1 A5:2 r:2 G5:1 r:1 F5:1 r:1 E5:2 F5:2 | D5:4 r:4 A4:2 C5:2 D5:2 E5:2 | E5:1 r:1 G5:1 r:1 C6:2 r:2 B5:1 r:1 G5:1 r:1 E5:2 G5:2 | C5:4 r:4 G4:2 B4:2 C5:2 D5:2 | D5:1 r:1 F5:1 r:1 Bb5:2 r:2 A5:1 r:1 F5:1 r:1 D5:2 F5:2 | G5:4 F5:2 D5:2 Bb4:4 r:4 | C#5:2 E5:2 A5:2 G5:2 F5:2 E5:2 D5:2 C#5:2 | E5:8 r:4 A4:4',
        bass: 'synco', arp: 'broken', drums: 'beat', inst: 'pluck', fills: [7] },
      B: { ch: 'F | C | Dm | Am | Bb | F | G | A',
        mel: 'A5:4 C6:2 A5:2 G5:4 F5:4 | E5:4 G5:2 E5:2 D5:4 C5:4 | D5:2 F5:2 A5:4 D6:4 C6:4 | E6:6 D6:2 C6:4 A5:4 | Bb5:4 A5:2 G5:2 F5:4 D5:4 | C5:2 F5:2 A5:4 C6:4 F6:4 | E6:4 D6:2 B5:2 G5:4 B5:4 | C#6:8 E6:4 r:4',
        ctr: 'harm', bass: 'walk', arp: 'up16', drums: 'beat2', inst: 'leadSaw', fills: [7] },
      A2: { from: 'A', inst: 'lead2', ctr: 'harm', arp: 'up16' },
      C: { ch: 'Gm | Dm | Eb | A', mel: 'Bb4:2 D5:2 G5:2 Bb5:2 A5:4 G5:4 | F5:2 A5:2 D6:4 A5:4 F5:4 | G5:2 Bb5:2 Eb6:4 D6:4 Bb5:4 | A5:4 C#6:4 E6:4 r:4',
        ctr: 'sus', bass: 'half', drums: 'half', pad: 1, inst: 'lead', fills: [3] },
    }, drums: {
      intro: { k: 'x.....x...x.....', t: '..........x...x.', h: 'x.x.x.x.x.x.x.x.' },
      beat: { k: 'x.....x...x.....', s: '....x.......x..x', h: 'x.xx..x.x.xx..x.' },
      beat2: { k: 'x.....x...x...x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
      half: { k: 'x.........x.....', s: '........x.......', h: 'x..x..x..x..x...', t: '..............x.' },
      fill: { k: 'x.....x.........', s: '....x.....x.x.x.', t: '........x.......', u: '............x.x.' },
    } },

    sky: { bpm: 132, order: ['intro', 'A', 'B', 'A2', 'C'], loop: 1, sec: {
      intro: { ch: 'F | G', mel: 'r:16 | r:4 C5:2 F5:2 A5:2 C6:2 E6:4', bass: 'half', arp: 'up16', drums: 'intro', pad: 1 },
      A: { ch: 'F | C | Dm | Bb | F | C | Bb | C',
        mel: 'C5:2 F5:2 A5:2 C6:4 A5:2 G5:2 F5:2 | G5:6 E5:2 C5:4 E5:2 G5:2 | F5:2 A5:2 D6:4 C6:2 A5:2 F5:2 A5:2 | Bb5:6 A5:2 G5:2 F5:2 D5:4 | C6:2 A5:2 F5:2 A5:2 C6:4 F6:4 | E6:4 D6:2 C6:2 G5:4 E5:4 | D6:2 C6:2 Bb5:2 A5:2 G5:2 F5:2 G5:2 A5:2 | G5:8 r:4 C5:4',
        ctr: 'sus', bass: 'bounce', arp: 'up16', drums: 'beat', pad: 1, inst: 'lead', fills: [7] },
      B: { ch: 'Bb | C | Am | Dm | Gm | C | F | F7',
        mel: 'D5:4 F5:2 Bb5:2 D6:4 C6:2 Bb5:2 | C6:4 G5:2 E5:2 C5:4 E5:2 G5:2 | A5:4 C6:2 E6:2 D6:4 C6:2 A5:2 | D6:8 A5:4 F5:4 | G5:2 Bb5:2 D6:4 C6:2 Bb5:2 A5:2 G5:2 | E5:2 G5:2 C6:4 Bb5:4 G5:4 | A5:4 C6:4 F6:4 E6:2 C6:2 | F6:8 r:8',
        ctr: 'harm', bass: 'walk', arp: 'updown', drums: 'beat2', inst: 'leadSaw', fills: [3, 7] },
      A2: { from: 'A', inst: 'lead2', ctr: 'harm', chReplace: { 6: 'Bb C', 7: 'F' },
        replace: { 6: 'D6:2 F6:2 E6:2 D6:2 C6:2 Bb5:2 A5:2 G5:2', 7: 'F5:4 A5:2 C6:2 F6:4 r:4' } },
      C: { ch: 'Dm | Bb | Gm | C', mel: 'A5:2 F5:2 D5:2 F5:2 A5:4 D6:4 | D6:2 Bb5:2 F5:2 Bb5:2 D6:4 F6:4 | G6:4 F6:2 D6:2 Bb5:4 G5:4 | C6:4 E6:4 G6:4 r:4',
        bass: 'drive', arp: 'up16', drums: 'half', pad: 1, inst: 'lead', fills: [3] },
    }, drums: {
      intro: { k: 'x.......x.......', h: '..x...x...x...x.', o: '..............x.' },
      beat: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '......x.........' },
      beat2: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
      half: { k: 'x.......x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
      fill: { k: 'x.......x.......', s: '....x...xxx.x.xx', h: 'x.x.x.x.........' },
    } },

    fortress: { bpm: 112, order: ['intro', 'A', 'B', 'C', 'A2'], loop: 1, sec: {
      intro: { ch: 'Cm | Cm', mel: 'r:16 | r:16', bass: 'drive', drums: 'intro', pad: 1 },
      A: { ch: 'Cm | Ab | Bb | Cm | Cm | Ab | Fm | G',
        mel: 'C5:4 Eb5:2 G5:2 C6:6 Bb5:2 | Ab5:4 G5:2 F5:2 Eb5:4 C5:4 | D5:4 F5:2 Bb5:2 D6:4 C6:2 Bb5:2 | C6:8 G5:4 Eb5:4 | G5:2 G5:2 C6:4 Bb5:2 Ab5:2 G5:4 | Ab5:2 C6:2 Eb6:4 D6:2 C6:2 Ab5:4 | F5:2 Ab5:2 C6:4 Bb5:2 Ab5:2 F5:4 | G5:4 B5:4 D6:4 F6:4',
        ctr: 'sus', bass: 'drive', drums: 'march', pad: 1, inst: 'leadSaw', fills: [3, 7] },
      B: { ch: 'Ab | Bb | Gm | Cm | Fm | Bb | Eb | G',
        mel: 'Eb6:6 C6:2 Ab5:4 C6:4 | D6:6 Bb5:2 F5:4 Bb5:4 | G5:2 Bb5:2 D6:4 F6:4 D6:4 | Eb6:8 D6:4 C6:4 | C6:4 Ab5:2 F5:2 Ab5:4 C6:4 | D6:4 F6:4 Eb6:2 D6:2 Bb5:4 | G5:4 Bb5:2 Eb6:2 G6:4 F6:2 Eb6:2 | D6:8 B5:4 G5:4',
        ctr: 'harm', bass: 'gallop', arp: 'up16', drums: 'march2', pad: 1, inst: 'lead', fills: [7] },
      C: { ch: 'Ab | Fm | Db | G', mel: 'C6:2 Eb6:2 Ab6:4 G6:4 Eb6:4 | F6:4 C6:4 Ab5:4 F5:4 | Db6:4 F5:2 Ab5:2 Db6:4 F6:4 | G6:4 F6:2 D6:2 B5:4 G5:4',
        bass: 'half', drums: 'toms', pad: 1, inst: 'leadSaw', fills: [3] },
      A2: { from: 'A', inst: 'lead2', ctr: 'harm', arp: 'up16', drums: 'march2' },
    }, drums: {
      intro: { k: 'x.......x.......', u: '....x.x.....x.x.', h: 'x...x...x...x...' },
      march: { k: 'x.x.....x.x.....', s: '....x.......x.x.', h: 'x.x.x.x.x.x.x.x.' },
      march2: { k: 'x.x.x...x.x.x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', t: '..............x.' },
      toms: { k: 'x.......x.......', t: '..x...x...x.....', u: '....x.......x.x.', h: 'x...x...x...x...' },
      fill: { k: 'x.......x.......', s: '....x.......xxxx', t: '........xx......', u: '..........xx....' },
    } },

    boss: { bpm: 156, order: ['intro', 'A', 'B'], loop: 1, sec: {
      intro: { ch: 'Em | B', mel: 'E5:2 r:2 E5:2 r:2 E5:2 D#5:2 E5:2 F#5:2 | G5:4 F#5:4 D#5:4 B4:4', bass: 'gallop', drums: 'introB', inst: 'leadSaw' },
      A: { ch: 'Em | C | D | B | Em | C | Am | B7',
        mel: 'E5:2 G5:2 B5:2 E6:2 D6:2 B5:2 G5:2 B5:2 | C6:4 B5:2 G5:2 E5:4 G5:4 | F#5:2 A5:2 D6:2 F#6:2 E6:2 D6:2 A5:2 D6:2 | D#6:8 B5:4 F#5:4 | G5:2 E5:2 B5:2 G5:2 E6:2 B5:2 G6:4 | E6:4 D6:2 C6:2 G5:4 C6:4 | A5:2 C6:2 E6:2 A6:2 G6:2 E6:2 C6:2 E6:2 | D#6:4 F#6:4 A6:4 B6:4',
        ctr: 'harm', bass: 'gallop', arp: 'up16', drums: 'boss', inst: 'leadSaw', fills: [7] },
      B: { ch: 'C | D | Em | Em | C | D | B | B',
        mel: 'G6:6 E6:2 C6:4 E6:4 | F#6:6 D6:2 A5:4 D6:4 | E6:2 F#6:2 G6:2 A6:2 B6:4 G6:4 | E6:8 B5:4 E6:4 | C6:2 E6:2 G6:2 E6:2 C7:4 B6:4 | A6:2 F#6:2 D6:2 F#6:2 A6:4 D7:4 | B6:4 A6:2 F#6:2 D#6:4 B5:4 | F#6:8 D#6:4 B5:4',
        ctr: 'harm', bass: 'drive', arp: 'up16', drums: 'boss2', inst: 'lead2', pad: 1, fills: [3, 7] },
    }, drums: {
      introB: { k: 'x...x...x...x...', s: '........x...x.xx', c: 'x...............' },
      boss: { k: 'x.x...x.x.x...x.', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' },
      boss2: { k: 'x...x...x...x...', s: '....x..x....x...', h: 'x.x.x.x.x.x.x.x.', o: '..x...x...x...x.' },
      fill: { k: 'x.x.x.x.........', s: '........xxxxxxxx', t: '....x.x.........' },
    } },

    star: { bpm: 170, order: ['A'], loop: 0, sec: {
      A: { ch: 'A | E | F#m | D | A | E | F#m | E',
        mel: 'A5:1 C#6:1 E6:2 A6:2 E6:2 C#6:1 E6:1 A6:2 B6:2 C#7:2 | B6:2 G#6:2 E6:2 B5:2 E6:2 G#6:2 B6:4 | A6:2 F#6:2 C#6:2 F#6:2 A6:2 C#7:2 B6:2 A6:2 | F#6:4 E6:2 D6:2 A5:4 B5:4 | A5:1 C#6:1 E6:2 A6:2 E6:2 C#6:1 E6:1 A6:2 B6:2 C#7:2 | B6:2 G#6:2 E6:2 B5:2 E6:2 G#6:2 B6:4 | A6:2 F#6:2 C#6:2 F#6:2 A6:2 C#7:2 B6:2 A6:2 | G#6:4 B6:4 E7:4 r:4',
        ctr: 'harm', bass: 'drive', arp: 'up16', drums: 'run', inst: 'lead2' },
    }, drums: { run: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' } } },

    clear: { bpm: 150, order: ['A'], loop: -1, sec: {
      A: { ch: 'C | F G | C', mel: 'G5:2 C6:2 E6:2 G6:2 E6:2 C6:2 D6:2 E6:2 | F6:2 A6:2 G6:2 E6:2 D6:2 B5:2 G5:2 B5:2 | C6:12 r:4',
        ctr: 'harm', bass: 'walk', arp: 'up16', drums: 'fan', inst: 'lead' },
    }, drums: { fan: { k: 'x.......x.......', s: '....x...x.x.xxxx', h: 'x.x.x.x.x.x.x.x.' } } },

    world: { bpm: 132, order: ['A'], loop: -1, sec: {
      A: { ch: 'C | Am | F | G | F G | C',
        mel: 'C5:2 E5:2 G5:2 C6:6 B5:2 C6:2 | A5:2 C6:2 E6:4 D6:2 C6:2 A5:4 | F5:2 A5:2 C6:2 F6:6 E6:2 F6:2 | G6:4 F6:2 E6:2 D6:4 B5:4 | E6:2 D6:2 C6:2 D6:2 E6:2 G6:2 A6:2 B6:2 | C7:16',
        ctr: 'harm', bass: 'bounce', arp: 'up16', drums: 'fan', inst: 'lead2', pad: 1, fills: [4] },
    }, drums: { fan: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', c: 'x...............' },
      fill: { k: 'x...x...x...x...', s: '....x...x.x.xxxx', h: 'x.x.x.x.........' } } },

    death: { bpm: 150, order: ['A'], loop: -1, sec: {
      A: { ch: 'C Fm | C', mel: 'G5:2 E5:2 C5:2 r:1 Bb4:1 A4:3 Ab4:1 G4:4 | C4:8 r:8', bass: 'sustain', inst: 'lead' },
    }, drums: {} },

    gameover: { bpm: 84, order: ['A'], loop: -1, sec: {
      A: { ch: 'Cm | Fm G | C', mel: 'Eb5:4 D5:4 C5:4 G4:4 | Ab4:4 F4:4 B4:4 D5:4 | C5:12 r:4', bass: 'half', ctr: 'harm', pad: 1, inst: 'lead' },
    }, drums: {} },
  };

  // ------------------------------------------------------------ COMPILADOR DE CANCIONES
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseNote(n) {
    const m = n.match(/^([A-G])([#b]?)(\d)$/);
    if (!m) return null;
    return 12 * (+m[3] + 1) + NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  const QUAL = { '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'sus4': [0, 5, 7], 'dim': [0, 3, 6] };
  function parseChord(c) {
    const m = c.match(/^([A-G])([#b]?)(.*)$/);
    const pc = (NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    return { pc, iv: QUAL[m[3]] || QUAL[''] };
  }
  const BASS = {
    bounce: [[0, 'R', 3], [4, '5', 2], [6, '8', 2], [8, 'R', 3], [12, '5', 2], [14, '3', 2]],
    walk: [[0, 'R', 4], [4, '3', 4], [8, '5', 4], [12, '8', 4]],
    drive: [[0, 'R', 2], [2, 'R', 2], [4, '8', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, '8', 2], [14, '5', 2]],
    synco: [[0, 'R', 2], [3, 'R', 1], [6, '5', 2], [8, '8', 1], [10, 'R', 2], [13, '5', 2]],
    gallop: [[0, 'R', 1], [2, 'R', 1], [3, 'R', 1], [4, '8', 1], [6, 'R', 1], [7, 'R', 1], [8, '5', 1], [10, 'R', 1], [11, 'R', 1], [12, '8', 1], [14, '5', 1], [15, 'R', 1]],
    half: [[0, 'R', 8], [8, '5', 8]],
    sustain: [[0, 'R', 16]],
  };
  function degree(ch, d, base) {
    const r = base + ch.pc;
    if (d === 'R') return r;
    if (d === '8') return r + 12;
    if (d === '5') return r + ch.iv[2];
    if (d === '3') return r + ch.iv[1];
    return r;
  }
  function compile(song) {
    const bars = [];
    let loopBar = 0;
    song.order.forEach((secName, oi) => {
      let sec = song.sec[secName];
      if (sec.from) {
        const base = song.sec[sec.from];
        const merged = Object.assign({}, base, sec);
        const mb = base.mel.split('|'), cb = base.ch.split('|');
        if (sec.replace) for (const k in sec.replace) mb[k] = sec.replace[k];
        if (sec.chReplace) for (const k in sec.chReplace) cb[k] = sec.chReplace[k];
        merged.mel = mb.join('|'); merged.ch = cb.join('|');
        sec = merged;
      }
      if (oi === song.loop) loopBar = bars.length;
      const chordBars = sec.ch.split('|').map(s => s.trim().split(/\s+/).map(parseChord));
      const melBars = sec.mel.split('|').map(s => s.trim());
      const nb = chordBars.length;
      const inst = INST[sec.inst || 'lead'];
      for (let b = 0; b < nb; b++) {
        const ev = [];
        const chords = chordBars[b];
        const segLen = 16 / chords.length;
        const chordAt = (step) => chords[Math.min(chords.length - 1, Math.floor(step / segLen))];
        // melodía
        let pos = 0;
        const melNotes = [];
        for (const tok of (melBars[b] || 'r:16').split(/\s+/)) {
          if (!tok) continue;
          const [n, l] = tok.split(':'); const len = +l || 1;
          if (n !== 'r') { const m = parseNote(n); melNotes.push([pos, m, len]); ev.push({ s: pos, k: 'n', m, len, inst, vel: len >= 4 ? 1 : 0.86 }); }
          pos += len;
        }
        if (pos !== 16 && typeof console !== 'undefined') console.warn('Compás de longitud', pos, 'en', secName, b);
        // contramelodía
        if (sec.ctr === 'harm') {
          for (const [p, m, len] of melNotes) {
            if (len < 2) continue;
            const ch = chordAt(p);
            let best = null;
            for (let c = m - 3; c >= m - 9; c--) if (ch.iv.some(iv => (ch.pc + iv - c + 120) % 12 === 0)) { best = c; break; }
            if (best) ev.push({ s: p, k: 'n', m: best, len, inst: INST.ctr, vel: 1 });
          }
        } else if (sec.ctr === 'sus') {
          chords.forEach((ch, ci) => ev.push({ s: ci * segLen, k: 'n', m: 60 + ((ch.pc + ch.iv[1]) % 12), len: segLen, inst: INST.ctr, vel: 0.8 }));
        }
        // bajo
        if (sec.bass) {
          const pat = BASS[sec.bass];
          chords.forEach((ch, ci) => {
            let base = 36; if (base + ch.pc < 40) base += 12;
            for (const [st, d, len] of pat) {
              if (st >= segLen) continue;
              ev.push({ s: ci * segLen + st, k: 'n', m: degree(ch, d, base), len: Math.min(len, segLen - st), inst: INST.bass, vel: st % 4 === 0 ? 1 : 0.8 });
            }
          });
        }
        // arpegios
        if (sec.arp) {
          for (let st = 0; st < 16; st += (sec.arp === 'bell' ? 2 : 1)) {
            const ch = chordAt(st);
            const tones = ch.iv.map(iv => 72 + ch.pc + iv);
            if (tones.length === 3) tones.push(tones[0] + 12);
            let m;
            if (sec.arp === 'up16') m = tones[st % 4];
            else if (sec.arp === 'updown') m = tones[[0, 1, 2, 3, 2, 1][st % 6]];
            else if (sec.arp === 'broken') m = tones[[0, 2, 3, 2, 1, 2, 3, 2][st % 8]];
            else m = tones[(st / 2) % 4] + 12;
            ev.push({ s: st, k: 'n', m, len: 1, inst: sec.arp === 'bell' ? INST.bell : INST.arp, vel: st % 4 === 0 ? 1 : 0.7 });
          }
        }
        // pad
        if (sec.pad) chords.forEach((ch, ci) => ch.iv.slice(0, 3).forEach(iv => ev.push({ s: ci * segLen, k: 'n', m: 60 + ((ch.pc + iv) % 12), len: segLen, inst: INST.pad, vel: 1 })));
        // batería
        const dname = (sec.fills && sec.fills.indexOf(b) >= 0 && song.drums.fill) ? 'fill' : sec.drums;
        const dp = dname && song.drums[dname];
        if (dp) for (const kind in dp) for (let st = 0; st < 16; st++) if (dp[kind][st] === 'x') ev.push({ s: st, k: 'd', d: kind, vel: st % 4 === 0 ? 1 : 0.75 });
        if (b === 0 && oi > 0 && dp && song.drums[dname]) ev.push({ s: 0, k: 'd', d: 'c', vel: 0.7 });
        ev.sort((a, c) => a.s - c.s);
        bars.push(ev);
      }
    });
    return { bars, loopBar, bpm: song.bpm, loop: song.loop };
  }
  const compiled = {};
  for (const k in SONGS) compiled[k] = compile(SONGS[k]);

  // ------------------------------------------------------------ SECUENCIADOR CON LOOKAHEAD
  const LOOKAHEAD = 0.14;
  let cur = null, tempoMul = 1, curName = null, onEnd = null;
  function play(name, opts) {
    opts = opts || {};
    if (!ctx) { curName = name; return; }
    if (curName === name && cur && !cur.ended && !opts.restart) return;
    stop(opts.fade == null ? 0.35 : opts.fade);
    curName = name;
    const song = compiled[name];
    if (!song) return;
    const g = ctx.createGain();
    const t = ctx.currentTime + 0.06;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + (opts.fadeIn == null ? 0.12 : opts.fadeIn));
    g.connect(musicBus);
    cur = { song, gain: g, bar: 0, step: 0, next: t, ended: false, name };
    onEnd = opts.onEnd || null;
    tempoMul = opts.tempo || 1;
  }
  function stop(fade) {
    if (!cur || !ctx) { cur = null; curName = null; return; }
    const g = cur.gain, t = ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade || 0.05));
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* ya desconectado */ } }, (fade + 0.6) * 1000);
    cur = null; curName = null;
  }
  function setTempo(m) { tempoMul = m; }
  function scheduler() {
    if (!ctx || !cur || cur.ended) return;
    const now = ctx.currentTime;
    if (cur.next < now - 0.25) cur.next = now + 0.02; // tras un parón largo, re-sincroniza sin ráfagas
    while (cur.next < now + LOOKAHEAD) {
      const song = cur.song;
      const stepDur = 60 / (song.bpm * tempoMul) / 4;
      const bar = song.bars[cur.bar];
      for (const e of bar) {
        if (e.s !== cur.step) continue;
        if (e.k === 'n') note(cur.next, mtof(e.m), e.len * stepDur * 0.92, e.inst, e.vel, cur.gain);
        else drum(cur.next, e.d, e.vel, cur.gain);
      }
      cur.next += stepDur;
      if (++cur.step >= 16) {
        cur.step = 0; cur.bar++;
        if (cur.bar >= song.bars.length) {
          if (song.loop >= 0) cur.bar = song.loopBar;
          else {
            cur.ended = true;
            const cb = onEnd, delay = Math.max(0, cur.next - now) * 1000 + 300;
            onEnd = null;
            if (cb) setTimeout(cb, delay);
            return;
          }
        }
      }
    }
  }
  function setPaused(p) {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setTargetAtTime(p ? 650 : 20000, t, p ? 0.08 : 0.15);
  }

  // ------------------------------------------------------------ EFECTOS DE SONIDO
  // tono con barrido de frecuencia
  function tone(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const n = osc(o), g = ctx.createGain();
    const v = 1 + (o.vary ? (Math.random() * 2 - 1) * 0.03 : 0);
    n.frequency.setValueAtTime(o.f0 * v, t);
    if (o.f1) { if (o.lin) n.frequency.linearRampToValueAtTime(o.f1 * v, t + o.dur); else n.frequency.exponentialRampToValueAtTime(o.f1 * v, t + o.dur); }
    let node = n;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; n.connect(f); node = f; }
    node.connect(g); g.connect(o.out || sfxBus);
    const a = o.a || 0.004;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol, t + a);
    if (o.sus) g.gain.setValueAtTime(o.vol, t + o.dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(n.frequency); l.start(t); l.stop(t + o.dur + 0.05);
    }
    n.start(t); n.stop(t + o.dur + 0.03);
    activeSfx++; n.onended = () => activeSfx--;
  }
  function noise(o) {
    const t = ctx.currentTime + (o.delay || 0);
    const s = nz(t, o.dur, o.vol, o.type || 'bandpass', o.f0 || 1000, o.f1 || o.f0 || 1000, o.q || 1, sfxBus);
    activeSfx++; s.onended = () => activeSfx--;
  }
  function arp(freqs, step, o) { freqs.forEach((f, i) => tone(Object.assign({ f0: f, dur: step * 1.6, vol: 0.12, wave: 'p25', delay: i * step }, o))); }
  let chipStreak = 0, chipLast = 0;
  const SFX = {
    jump: (d) => { const hi = d.v > 5.0; tone({ wave: 'p25', f0: d.big ? 240 : 300, f1: (hi ? 1150 : 880) * (d.big ? 0.85 : 1), dur: 0.17, vol: 0.13, vary: 1 }); },
    land: (d) => noise({ dur: 0.07, vol: Math.min(0.22, 0.04 + (d.v || 0) * 0.035), type: 'lowpass', f0: 700, f1: 160 }),
    step: (d) => noise({ dur: 0.03, vol: 0.045, type: 'bandpass', f0: (d && d.alt ? 2600 : 2100) * (1 + (Math.random() - 0.5) * 0.06), q: 2.5 }),
    skid: () => noise({ dur: 0.2, vol: 0.12, type: 'bandpass', f0: 3200, f1: 1100, q: 4 }),
    stomp: (d) => { const p = Math.pow(1.122, Math.min(8, (d.combo || 1) - 1)); tone({ wave: 'p50', f0: 520 * p, f1: 160 * p, dur: 0.08, vol: 0.16, vary: 1 }); tone({ wave: 'p25', f0: 880 * p, f1: 1400 * p, dur: 0.09, vol: 0.09, delay: 0.06 }); },
    kick: () => { tone({ wave: 'p50', f0: 180, f1: 900, dur: 0.09, vol: 0.14 }); noise({ dur: 0.05, vol: 0.12, type: 'highpass', f0: 2500 }); },
    kill: () => { tone({ wave: 'p12', f0: 950, f1: 110, dur: 0.24, vol: 0.13, vary: 1 }); noise({ dur: 0.12, vol: 0.08, type: 'highpass', f0: 2200 }); },
    hurt: () => arp([740, 587, 466, 370, 294], 0.06, { wave: 'p50', vol: 0.12 }),
    grow: () => { const f = [262, 330, 392, 330, 392, 523, 392, 523, 659, 523, 659, 784]; f.forEach((x, i) => tone({ wave: 'p25', f0: x, dur: 0.06, vol: 0.1, delay: i * 0.055 })); },
    powerAppear: () => { tone({ type: 'triangle', f0: 300, f1: 1100, dur: 0.5, vol: 0.14, vib: [14, 40], lin: 1 }); },
    powerGet: () => arp([523, 659, 784, 1047, 1319, 1568], 0.045, { wave: 'p25', vol: 0.11 }),
    fire: () => tone({ wave: 'p25', f0: 1300, f1: 380, dur: 0.08, vol: 0.09, vary: 1 }),
    fireBounce: () => tone({ type: 'triangle', f0: 620, f1: 480, dur: 0.035, vol: 0.035, vary: 1 }),
    puff: () => noise({ dur: 0.09, vol: 0.08, type: 'bandpass', f0: 1600, f1: 600, q: 1.5 }),
    chip: () => {
      const now = ctx.currentTime; chipStreak = (now - chipLast < 0.45) ? Math.min(chipStreak + 1, 10) : 0; chipLast = now;
      const k = Math.pow(1.03, chipStreak);
      tone({ wave: 'p25', f0: 1319 * k, dur: 0.06, vol: 0.09, sus: 1 }); tone({ wave: 'p25', f0: 1976 * k, dur: 0.3, vol: 0.09, delay: 0.055 });
    },
    bump: () => { tone({ type: 'triangle', f0: 190, f1: 85, dur: 0.09, vol: 0.28, vary: 1 }); noise({ dur: 0.05, vol: 0.06, type: 'lowpass', f0: 900 }); },
    bumpBrick: () => tone({ type: 'triangle', f0: 170, f1: 90, dur: 0.08, vol: 0.24, vary: 1 }),
    break: () => { noise({ dur: 0.32, vol: 0.22, type: 'lowpass', f0: 3000, f1: 250 }); tone({ wave: 'p50', f0: 220, f1: 55, dur: 0.16, vol: 0.12 }); },
    thud: () => tone({ type: 'triangle', f0: 130, f1: 80, dur: 0.07, vol: 0.22, vary: 1 }),
    pipe: () => { [0, 0.09, 0.18].forEach((dl, i) => tone({ wave: 'p50', f0: 520 - i * 90, f1: 160 - i * 20, dur: 0.09, vol: 0.12, delay: dl })); },
    spring: () => tone({ type: 'sine', f0: 180, f1: 900, dur: 0.3, vol: 0.2, vib: [20, 70] }),
    fallplat: () => { noise({ dur: 0.25, vol: 0.08, type: 'bandpass', f0: 500, f1: 260, q: 6 }); tone({ wave: 'p50', f0: 140, f1: 90, dur: 0.2, vol: 0.05, lp: 600 }); },
    chispa: () => { noise({ dur: 0.18, vol: 0.07, type: 'highpass', f0: 5000, f1: 2000 }); tone({ type: 'sawtooth', f0: 300, f1: 1200, dur: 0.12, vol: 0.04, lp: 3000 }); },
    lavaPlop: () => noise({ dur: 0.18, vol: 0.06, type: 'lowpass', f0: 500, f1: 120 }),
    splash: () => { noise({ dur: 0.35, vol: 0.14, type: 'bandpass', f0: 2500, f1: 500, q: 0.8 }); tone({ type: 'sine', f0: 900, f1: 300, dur: 0.12, vol: 0.05 }); },
    swim: () => { tone({ type: 'sine', f0: 380, f1: 720, dur: 0.1, vol: 0.08, vary: 1 }); noise({ dur: 0.1, vol: 0.04, type: 'bandpass', f0: 1200, q: 2 }); },
    lever: () => { noise({ dur: 0.04, vol: 0.12, type: 'highpass', f0: 3000 }); tone({ wave: 'p50', f0: 600, dur: 0.05, vol: 0.08, delay: 0.05 }); tone({ wave: 'p50', f0: 900, dur: 0.08, vol: 0.08, delay: 0.11 }); },
    door: () => { tone({ type: 'sawtooth', f0: 70, f1: 55, dur: 0.9, vol: 0.12, lp: 300, vib: [9, 6] }); noise({ dur: 0.8, vol: 0.06, type: 'lowpass', f0: 400, f1: 150 }); },
    key: () => arp([1047, 1319, 1568, 2093], 0.05, { wave: 'p12', vol: 0.1 }),
    bossHit: () => { noise({ dur: 0.18, vol: 0.25, type: 'lowpass', f0: 2000, f1: 200 }); tone({ wave: 'p50', f0: 400, f1: 70, dur: 0.25, vol: 0.18 }); },
    bossRoar: () => { tone({ type: 'sawtooth', f0: 110, f1: 70, dur: 1.0, vol: 0.2, lp: 900, vib: [11, 12] }); noise({ dur: 0.9, vol: 0.1, type: 'bandpass', f0: 600, f1: 300, q: 1.5 }); },
    bossLand: () => { tone({ type: 'sine', f0: 120, f1: 35, dur: 0.4, vol: 0.4 }); noise({ dur: 0.45, vol: 0.14, type: 'lowpass', f0: 800, f1: 90 }); },
    bossStep: () => tone({ type: 'sine', f0: 90, f1: 40, dur: 0.18, vol: 0.25 }),
    bossThrow: () => tone({ wave: 'p25', f0: 300, f1: 700, dur: 0.12, vol: 0.09 }),
    bossJump: () => tone({ wave: 'p50', f0: 150, f1: 450, dur: 0.25, vol: 0.1, lp: 1500 }),
    bossCrouch: () => noise({ dur: 0.45, vol: 0.06, type: 'bandpass', f0: 300, f1: 1500, q: 4 }),
    bossAim: () => { noise({ dur: 0.6, vol: 0.06, type: 'bandpass', f0: 400, f1: 3000, q: 5 }); tone({ wave: 'p12', f0: 220, f1: 880, dur: 0.6, vol: 0.05 }); },
    bossCharge: () => noise({ dur: 0.5, vol: 0.12, type: 'bandpass', f0: 3000, f1: 400, q: 2 }),
    bossExplode: () => { noise({ dur: 0.35, vol: 0.18, type: 'lowpass', f0: 3000, f1: 100 }); tone({ wave: 'p50', f0: 300 + Math.random() * 400, f1: 60, dur: 0.25, vol: 0.08 }); },
    bossDead: () => { noise({ dur: 2.2, vol: 0.3, type: 'lowpass', f0: 4000, f1: 60 }); tone({ type: 'sine', f0: 160, f1: 30, dur: 1.6, vol: 0.4 }); },
    bossDying: () => tone({ type: 'sawtooth', f0: 400, f1: 60, dur: 1.4, vol: 0.12, lp: 2000, vib: [7, 30] }),
    flag: () => tone({ wave: 'p25', f0: 1400, f1: 220, dur: 0.9, vol: 0.1, lin: 1 }),
    tick: () => tone({ wave: 'p25', f0: 1760, dur: 0.035, vol: 0.05 }),
    oneup: () => arp([659, 784, 1319, 1047, 1175, 1568], 0.075, { wave: 'p25', vol: 0.12 }),
    checkpoint: () => arp([784, 988, 1175, 1568], 0.07, { type: 'triangle', wave: null, vol: 0.18 }),
    secret: () => { arp([523, 784, 1047, 1568, 2093, 2637], 0.06, { wave: 'p12', vol: 0.08 }); },
    vine: () => arp([392, 523, 659, 784, 1047], 0.09, { type: 'triangle', wave: null, vol: 0.16 }),
    menuMove: () => tone({ wave: 'p50', f0: 880, dur: 0.035, vol: 0.07 }),
    menuOk: () => { tone({ wave: 'p25', f0: 660, dur: 0.06, vol: 0.1 }); tone({ wave: 'p25', f0: 990, dur: 0.12, vol: 0.1, delay: 0.06 }); },
    menuBack: () => { tone({ wave: 'p25', f0: 660, dur: 0.06, vol: 0.1 }); tone({ wave: 'p25', f0: 440, dur: 0.12, vol: 0.1, delay: 0.06 }); },
    pause: () => { tone({ wave: 'p25', f0: 988, dur: 0.06, vol: 0.09 }); tone({ wave: 'p25', f0: 659, dur: 0.06, vol: 0.09, delay: 0.07 }); tone({ wave: 'p25', f0: 988, dur: 0.12, vol: 0.09, delay: 0.14 }); },
    hurry: () => { [0, 0.16, 0.32].forEach(dl => tone({ wave: 'p25', f0: 1568, dur: 0.1, vol: 0.1, delay: dl })); },
    shieldHit: () => tone({ type: 'triangle', f0: 1200, f1: 600, dur: 0.15, vol: 0.1 }),
    rescue: () => arp([523, 659, 784], 0.06, { type: 'triangle', wave: null, vol: 0.14 }),
    gateClose: () => { tone({ type: 'sine', f0: 100, f1: 40, dur: 0.5, vol: 0.35 }); noise({ dur: 0.3, vol: 0.12, type: 'highpass', f0: 1500 }); },
    pixelShake: () => noise({ dur: 0.3, vol: 0.05, type: 'bandpass', f0: 4000, q: 8 }),
    pixelLand: () => tone({ type: 'triangle', f0: 160, f1: 80, dur: 0.08, vol: 0.18 }),
    helmOff: () => { tone({ wave: 'p50', f0: 1250, f1: 1100, dur: 0.25, vol: 0.08 }); tone({ wave: 'p50', f0: 1870, f1: 1700, dur: 0.2, vol: 0.06 }); },
    shellBounce: () => tone({ type: 'triangle', f0: 220, f1: 120, dur: 0.05, vol: 0.18, vary: 1 }),
    unshell: () => tone({ wave: 'p25', f0: 400, f1: 800, dur: 0.08, vol: 0.06 }),
    castleDoor: () => { noise({ dur: 0.4, vol: 0.06, type: 'bandpass', f0: 300, f1: 900, q: 6 }); arp([784, 1047], 0.08, { type: 'triangle', wave: null, vol: 0.12 }); },
    pauseOff: () => { tone({ wave: 'p25', f0: 659, dur: 0.06, vol: 0.09 }); tone({ wave: 'p25', f0: 988, dur: 0.1, vol: 0.09, delay: 0.07 }); },
  };
  const COOLDOWN = { step: 0.06, tick: 0.025, chip: 0.03, fireBounce: 0.04, land: 0.05, bump: 0.05, stomp: 0.03, puff: 0.04, bossExplode: 0.06, shellBounce: 0.05, chispa: 0.1, lavaPlop: 0.1 };
  const LOWPRI = { step: 1, tick: 1, fireBounce: 1, land: 1, chispa: 1, lavaPlop: 1, pixelShake: 1 };
  function sfx(name, d) {
    if (!ctx || settings.muted || ctx.state !== 'running') return;
    const f = SFX[name]; if (!f) return;
    const now = ctx.currentTime;
    if (COOLDOWN[name] && lastPlay[name] && now - lastPlay[name] < COOLDOWN[name]) return;
    if (activeSfx > 30 && LOWPRI[name]) return;
    if (activeSfx > 48) return;
    lastPlay[name] = now;
    try { f(d || {}); } catch (e) { /* un efecto nunca debe romper el juego */ }
  }

  return { init, resume, play, stop, setTempo, setPaused, sfx, setVolumes, settings, SONGS, compiled, get current() { return curName; }, get ctx() { return ctx; } };
})();
