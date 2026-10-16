'use strict';
// Chart/difficulty checks for the procedural songs. Run: node --test noche-de-funk/test
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const JS = path.join(__dirname, '..', 'js');
function load() {
  const ctx = vm.createContext({ console });
  ctx.globalThis = ctx;
  for (const f of ['util.js', 'music.js', 'songs.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  return ctx.NF;
}
const NF = load();
const M = NF.music;
const DIFFS = [0, 1, 2];
const all = [];
for (const id of NF.SONG_ORDER) for (const d of DIFFS) all.push({ id, d, data: M.build(NF.SONGS[id], d, 1) });

test('every chart is well-formed', () => {
  for (const { id, d, data } of all) {
    const where = `${id}/${d}`;
    assert.ok(data.notes.length > 20, `${where}: too few notes`);
    let prev = -1;
    for (const n of data.notes) {
      assert.ok(Number.isFinite(n.t) && n.t >= 0 && n.t < data.length, `${where}: bad time ${n.t}`);
      assert.ok(n.t >= prev, `${where}: unsorted`);
      prev = n.t;
      assert.ok([0, 1, 2, 3].includes(n.lane), `${where}: bad lane`);
      assert.ok(n.side === 0 || n.side === 1, `${where}: bad side`);
      assert.ok(n.len >= 0 && Number.isFinite(n.len), `${where}: bad hold`);
      if (n.type === 0) assert.ok(n.m > 30 && n.m < 110, `${where}: unsingable pitch ${n.m}`);
    }
    for (const e of data.events) assert.ok(Number.isFinite(e.t) && e.t >= 0, `${where}: bad event time`);
  }
});

test('lanes never overlap: no note inside a hold or a jack faster than allowed', () => {
  for (const { id, d, data } of all) {
    for (const side of [0, 1]) {
      const lastEnd = [-9, -9, -9, -9];
      for (const n of data.notes.filter((x) => x.side === side && x.type === 0)) {
        assert.ok(n.t - lastEnd[n.lane] > data.spb * 0.24, `${id}/${d}: lane ${n.lane} collision at ${n.t.toFixed(3)}s`);
        lastEnd[n.lane] = n.t + n.len;
      }
    }
  }
});

test('hurt notes sit outside the hit window of real notes in their lane', () => {
  for (const { id, d, data } of all) {
    const real = data.notes.filter((n) => n.side === 1 && n.type === 0);
    for (const h of data.notes.filter((n) => n.type === 1)) {
      for (const n of real) {
        if (n.lane !== h.lane) continue;
        const clear = h.t < n.t - M.RULES.win.shit || h.t > n.t + n.len + M.RULES.win.shit;
        assert.ok(clear, `${id}/${d}: hurt note at ${h.t.toFixed(3)} collides with a note`);
      }
    }
  }
});

test('easy charts never ask for notes closer than an eighth note', () => {
  for (const { id, d, data } of all) {
    if (d !== 0) continue;
    const t = data.notes.filter((n) => n.side === 1 && n.type === 0).map((n) => n.t);
    for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) assert.ok(t[i] - t[i - 1] >= data.spb * 0.5 - 1e-6, `${id}: gap too small`);
  }
});

test('each song is harder than the previous one, on every difficulty', () => {
  for (const d of DIFFS) {
    const nps = NF.SONG_ORDER.map((id) => M.build(NF.SONGS[id], d, 1).nps);
    for (let i = 1; i < nps.length; i++) {
      assert.ok(nps[i] > nps[i - 1], `diff ${d}: ${NF.SONG_ORDER[i]} (${nps[i].toFixed(2)}) not harder than ${NF.SONG_ORDER[i - 1]} (${nps[i - 1].toFixed(2)})`);
    }
  }
});

test('difficulties are ordered inside each song and the final song is the hardest', () => {
  for (const id of NF.SONG_ORDER) {
    const [e, n, h] = DIFFS.map((d) => M.build(NF.SONGS[id], d, 1).nps);
    assert.ok(e < n && n < h, `${id}: ${e} ${n} ${h}`);
  }
  const final = NF.WEEKS[NF.WEEKS.length - 1].songs.slice(-1)[0];
  const mech = NF.SONGS[final].mech;
  assert.ok(mech.drain > 0 && mech.hurt > 0 && mech.mod, 'final song keeps its extra mechanics');
  const hardest = Math.max(...NF.SONG_ORDER.map((id) => M.build(NF.SONGS[id], 2, 1).nps));
  assert.strictEqual(M.build(NF.SONGS[final], 2, 1).nps, hardest);
});

test('charts are deterministic', () => {
  const other = load();
  for (const id of NF.SONG_ORDER) {
    const a = M.build(NF.SONGS[id], 2, 1).notes, b = other.music.build(other.SONGS[id], 2, 1).notes;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), id);
  }
});

// A 95%-accurate player (seeded misses, never touches hurt notes) must survive everything:
// the game is hard, not unfair.
test('balance: a strong player survives every chart', () => {
  const R = M.RULES;
  for (const { id, d, data } of all) {
    const rnd = NF.util.rng(7);
    const mech = data.def.mech || {};
    let hp = 1, low = 1;
    for (const n of data.notes) {
      if (n.type === 1) continue;
      if (n.side === 0) {
        if (mech.drain && hp > mech.drainFloor) hp = Math.max(mech.drainFloor, hp - mech.drain * R.drainScale[d]);
        continue;
      }
      if (rnd() < 0.05) hp += R.health.miss;
      else hp += R.health.sick + n.len * R.health.holdPerSec;
      hp = Math.min(2, hp);
      low = Math.min(low, hp);
    }
    assert.ok(low > 0, `${id}/${d}: died (min health ${low.toFixed(3)})`);
  }
});

test('freeplay previews and menu themes build', () => {
  for (const id of NF.SONG_ORDER) {
    const p = M.preview(NF.SONGS[id]);
    assert.ok(p.loopTo > p.loopFrom && p.events.every((e) => e.k !== 'voice'), id);
  }
  for (const name of ['menu', 'pause', 'gameover', ...NF.WEEKS.map((w) => w.dlg)]) {
    const th = M.theme(name);
    assert.ok(th.events.length > 10 && th.loopTo > 0, name);
  }
});
