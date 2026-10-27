// Reglas de la partida: generadores, ganchos, palés, puertas, colapso y trampilla.
(function () {
  'use strict';
  const NSF = window.NSF, C = NSF.CONST, U = NSF.U, T = NSF.T;

  class Game {
    // opts: { role: 'survivor'|'killer'|'demo', diff, survivorId, killerId, sim }
    constructor(opts) {
      this.opts = opts;
      this.role = opts.role;
      this.sim = !!opts.sim;
      const D = NSF.DIFFICULTIES[opts.diff] || NSF.DIFFICULTIES.normal;
      this.diff = D;
      this.world = Object.assign({}, D.world);
      this.map = new NSF.GameMap();
      this.time = 0; this.gensDone = 0; this.endgame = false; this.collapse = null;
      this.over = false; this.result = null; this.endT = 0;
      this.noises = []; this.scratches = []; this.blood = []; this.particles = []; this.texts = [];
      this.traps = []; this.axes = []; this.events = []; this.alerts = []; this.flashes = [];
      this.claims = { rescue: new Map(), revive: new Map(), heal: new Map() };
      this.shake = 0; this.skillFlash = null; this.hatch = null; this.hatchChecked = false;

      const playerKiller = this.role === 'killer';
      const playerSurv = this.role === 'survivor';
      const kprof = D.killer;
      const sprof = NSF.DIFFICULTIES[opts.sprofKey || (playerSurv ? D.allies : D.id)].survivor;
      this.sprof = sprof;

      const kdef = NSF.KILLERS.find((k) => k.id === opts.killerId) || U.pick(NSF.KILLERS);
      this.killer = new NSF.Killer(this, kdef, playerKiller, playerKiller ? null : kprof);
      this.kprof = playerKiller ? null : kprof;
      this.killer.x = this.map.spawnK.x; this.killer.y = this.map.spawnK.y;

      let defs;
      if (playerSurv) {
        const me = NSF.SURVIVORS.find((s) => s.id === opts.survivorId) || NSF.SURVIVORS[0];
        defs = [me].concat(U.shuffle(NSF.SURVIVORS.filter((s) => s !== me)).slice(0, 3));
      } else defs = U.shuffle(NSF.SURVIVORS.slice()).slice(0, 4);
      this.survivors = defs.map((d, i) => {
        const isP = playerSurv && i === 0;
        const s = new NSF.Survivor(this, d, i, isP, isP ? NSF.PLAYER_PROFILE : sprof);
        s.x = this.map.spawnS[i].x; s.y = this.map.spawnS[i].y;
        s.face = Math.atan2(this.killer.y - s.y, this.killer.x - s.x) + Math.PI;
        if (!isP) s.ai = new NSF.SurvivorAI(s, sprof);
        return s;
      });
      this.killerAI = playerKiller ? null : new NSF.KillerAI(this.killer, kprof);
      this.player = playerSurv ? this.survivors[0] : playerKiller ? this.killer : null;
      this.viewer = this.player || this.killer;
    }

    // ------------------------------------------------------------ bucle
    update(dt) {
      if (this.over) return;
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt);
      for (const gen of this.map.gens) gen.workers = 0;
      for (const s of this.survivors) if (s.act && s.act.type === 'repair') s.act.target.workers++;

      if (this.killerAI) this.killerAI.update(dt);
      for (const s of this.survivors) if (s.ai) s.ai.update(dt);
      this.killer.update(dt);
      for (const s of this.survivors) {
        s.update(dt);
        if (s.isPlayer) s.updateSkill(dt);
      }

      for (const gen of this.map.gens) {
        gen.spark = Math.max(0, gen.spark - dt * 1.5);
        gen.flash = Math.max(0, gen.flash - dt * 0.6);
        if (gen.workers > 0) gen.regress = false;
        if (gen.regress && !gen.done && !gen.blocked) {
          gen.progress -= (dt * 0.25) / C.GEN_WORK;
          if (gen.progress <= 0) { gen.progress = 0; gen.regress = false; }
        }
      }
      this.updateAxes(dt);
      this.updateHatch();

      if (this.collapse !== null) {
        this.collapse -= dt;
        if (this.collapse <= 0) {
          this.collapse = 0;
          for (const s of this.survivors) if (s.alive) this.kill(s, 'collapse');
        }
      }

      const now = this.time;
      if (this.noises.length && now - this.noises[0].t > 4) this.noises = this.noises.filter((n) => now - n.t < 4);
      if (this.scratches.length > 500 || (this.scratches.length && now - this.scratches[0].t > 9)) this.scratches = this.scratches.filter((n) => now - n.t < 9).slice(-500);
      if (this.blood.length > 320) this.blood.splice(0, this.blood.length - 320);
      if (!this.sim) this.updateFx(dt);
      this.checkEnd(dt);
    }

    updateFx(dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 1 - dt * (p.drag || 3); p.vy *= 1 - dt * (p.drag || 3);
      }
      for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.y -= dt * 0.6; if (t.life <= 0) this.texts.splice(i, 1); }
      for (let i = this.alerts.length - 1; i >= 0; i--) { this.alerts[i].life -= dt; if (this.alerts[i].life <= 0) this.alerts.splice(i, 1); }
      for (let i = this.flashes.length - 1; i >= 0; i--) { this.flashes[i].life -= dt; if (this.flashes[i].life <= 0) this.flashes.splice(i, 1); }
      if (this.skillFlash) { this.skillFlash.t -= dt; if (this.skillFlash.t <= 0) this.skillFlash = null; }
    }

    checkEnd(dt) {
      let done;
      if (this.role === 'survivor') done = !this.player.alive;
      else done = this.survivors.every((s) => !s.alive);
      if (!done) return;
      this.endT += dt;
      if (this.endT > (this.sim ? 0 : 1.8)) this.finish();
    }

    finish() {
      if (this.over) return;
      this.over = true;
      const S = this.survivors, k = this.killer;
      const escaped = S.filter((s) => s.status === 'escaped').length;
      const dead = S.filter((s) => s.status === 'dead').length;
      const r = { role: this.role, diff: this.diff.id, escaped, dead, time: this.time, gens: this.gensDone, killer: k.def.name };
      if (this.role === 'survivor') {
        const p = this.player;
        r.win = p.status === 'escaped';
        r.title = r.win ? 'Has escapado' : p.deathCause === 'bleed' ? 'Te has desangrado' : p.deathCause === 'collapse' ? 'El colapso te atrapó' : p.def.fem ? 'Sacrificada' : 'Sacrificado';
        r.sub = `${escaped} de 4 supervivientes escaparon de ${k.def.name}.`;
        const st = p.stats;
        r.rows = [
          ['Generadores reparados (tu parte)', Math.round(st.repair * 100) + ' %'],
          ['Pruebas perfectas / fallidas', `${st.greats} / ${st.fails}`],
          ['Curaciones y levantamientos', String(st.heals + st.revives)],
          ['Rescates del gancho', String(st.rescues)],
          ['Aturdimientos con palé', String(st.stuns)],
          ['Tiempo de partida', U.fmtTime(this.time)],
        ];
        r.points = Math.round(st.repair * 2500 + st.greats * 150 + (st.heals + st.revives) * 800 + st.rescues * 1250 + st.stuns * 900 + (r.win ? 5000 : 0) + this.time * 4);
      } else {
        r.win = dead >= 3;
        r.title = ['Todos escapan', 'Derrota', 'Empate brutal', 'Victoria', 'Masacre implacable'][dead];
        r.sub = `Has sacrificado a ${dead} de 4 supervivientes.`;
        const st = k.stats;
        r.rows = [
          ['Golpes / derribos', `${st.hits} / ${st.downs}`],
          ['Colgados en el gancho', String(st.hooks)],
          ['Sacrificios', String(dead)],
          ['Generadores pateados', String(st.kicks)],
          ['Palés destrozados', String(st.breaks)],
          ['Veces aturdido', String(st.stunned)],
          ['Generadores completados por ellos', `${this.gensDone} de ${C.GENS_NEEDED}`],
        ];
        r.points = Math.round(st.hits * 400 + st.downs * 600 + st.hooks * 1200 + dead * 2500 + st.kicks * 300 + st.breaks * 300 + (C.GENS_NEEDED - Math.min(C.GENS_NEEDED, this.gensDone)) * 600);
      }
      this.result = r;
      this.events.push({ type: 'end' });
    }

    // ------------------------------------------------------------ jugador
    survivorContext() {
      const p = this.player;
      if (!p || this.role !== 'survivor') return null;
      if (p.status === 'carried') return { id: 'wiggle', label: 'Forcejear' };
      if (p.status === 'hooked' && p.hookCount === 1 && p.sac < 0.5 && p.selfTries < 3) {
        return { id: 'struggle', label: `Soltarte (${3 - p.selfTries})`, run: () => this.selfUnhook(p) };
      }
      if (p.status !== 'free') return null;
      if (p.skill) return { id: 'skill', label: '¡Ya!' };
      if (p.act) {
        const names = { repair: 'Reparando', heal: 'Curando', revive: 'Levantando', rescue: 'Rescatando', gate: 'Abriendo' };
        return { id: 'busy', label: names[p.act.type] || '…', busy: true };
      }
      const opts = [];
      const add = (id, label, d, run) => opts.push({ id, label, d, run });
      const drop = p.canDrop();
      if (drop) add('drop', 'Tirar palé', 0.4, () => p.tryDropPallet());
      const v = p.canVault();
      if (v) add('vault', 'Saltar', 0.5, () => p.tryVault());
      for (const o of this.survivors) {
        if (o === p) continue;
        if (o.status === 'hooked') { const d = U.dist(p.x, p.y, o.hook.cx, o.hook.cy); if (d < 1.45) add('rescue', 'Rescatar', d - 1, () => p.startAct('rescue', o)); }
        else if (o.status === 'downed') { const d = U.dist(p.x, p.y, o.x, o.y); if (d < 1.4) add('revive', 'Levantar', d - 0.8, () => p.startAct('revive', o)); }
        else if (o.status === 'free' && o.health === 1) { const d = U.dist(p.x, p.y, o.x, o.y); if (d < 1.4) add('heal', 'Curar', d - 0.3, () => p.startAct('heal', o)); }
      }
      if (this.hatch && this.hatch.open && U.dist(p.x, p.y, this.hatch.x, this.hatch.y) < 1.2) add('hatch', 'Trampilla', -2, () => this.escape(p, 'hatch'));
      if (this.endgame) {
        for (const gt of this.map.gates) {
          const d = U.dist(p.x, p.y, gt.lever.x, gt.lever.y);
          if (!gt.open && d < 1.35) add('gate', 'Abrir puerta', d, () => p.startAct('gate', gt));
        }
      }
      for (const gen of this.map.gens) {
        if (gen.done || gen.blocked) continue;
        const d = U.dist(p.x, p.y, gen.cx, gen.cy);
        if (d < 1.3) add('repair', 'Reparar', d, () => p.startAct('repair', gen));
      }
      if (!opts.length) return null;
      opts.sort((a, b) => a.d - b.d);
      return opts[0];
    }

    killerContext() {
      const k = this.killer;
      if (this.hatch && this.hatch.open && k.canAct() && !k.carrying && U.dist(k.x, k.y, this.hatch.x, this.hatch.y) < 1.4) {
        return { id: 'hatch', label: 'Cerrar trampilla', run: () => this.closeHatch(k) };
      }
      const c = k.context();
      return c ? { id: c.id, label: c.label, run: () => k.doContext(c) } : null;
    }

    applyInput(inp) {
      const p = this.player;
      if (!p) return;
      const mag = Math.min(1, inp.mag);
      if (this.role === 'survivor') {
        if (p.status === 'free' || p.status === 'downed') {
          if (mag > 0.15) {
            p.ix = inp.x; p.iy = inp.y;
            p.walk = inp.walk || mag < 0.55;
            if (p.act && mag > 0.35) p.cancelAct();
          } else { p.ix = p.iy = 0; }
        }
        if (inp.take('action')) {
          if (p.status === 'carried') { p.wiggle += C.WIGGLE_TAP; this.killer.wiggleFx = 0.25; }
          else if (p.skill) p.pressSkill();
          else {
            const c = this.survivorContext();
            if (c && c.run) c.run();
          }
        }
        if (inp.take('ability')) {
          if (!p.useAbility() && p.def.ability.id === 'botiquin' && p.cd <= 0) this.toast('Solo puedes usarlo herida', 'info');
        }
      } else {
        const k = p;
        if (mag > 0.15) { k.ix = inp.x; k.iy = inp.y; } else { k.ix = k.iy = 0; }
        if (inp.take('attack')) {
          const t = this.aimAssist(k, 0.75, 2.8);
          if (t && k.canAct()) k.face = Math.atan2(t.y - k.y, t.x - k.x);
          k.startAttack();
        }
        if (inp.take('action')) { const c = this.killerContext(); if (c) c.run(); }
        if (inp.take('ability')) k.useAbility();
      }
    }

    aimAssist(k, cone, range) {
      let best = null, bd = 1e9;
      for (const s of this.survivors) {
        if (s.status !== 'free' || s.stealthT > 0) continue;
        const d = U.dist(k.x, k.y, s.x, s.y);
        if (d > range) continue;
        const da = Math.abs(U.angDiff(k.face, Math.atan2(s.y - k.y, s.x - k.x)));
        if (da > cone || !this.map.los(k.x, k.y, s.x, s.y)) continue;
        const sc = d + da * 3;
        if (sc < bd) { bd = sc; best = s; }
      }
      return best;
    }

    // ------------------------------------------------------------ reglas
    repairGen(gen, amt) {
      if (gen.done || gen.blocked) return;
      gen.regress = false;
      gen.progress += amt;
      if (gen.progress >= 1) this.completeGen(gen);
    }
    completeGen(gen) {
      gen.progress = 1; gen.done = true; gen.flash = 1;
      this.gensDone++;
      this.noise(gen.cx, gen.cy, 999, 'gen');
      for (const s of this.survivors) if (s.act && s.act.target === gen) s.cancelAct();
      const left = C.GENS_NEEDED - this.gensDone;
      this.toast(left > 0 ? `Generador reparado · faltan ${left}` : 'Las puertas tienen energía', 'good');
      this.sfx('gen', gen.cx, gen.cy, true);
      if (this.kprof && this.kprof.sense) {
        for (const s of this.survivors) if (s.status === 'free' && U.dist(s.x, s.y, gen.cx, gen.cy) < 8) s.revealT = Math.max(s.revealT, 4 * this.kprof.sense);
      }
      if (left <= 0) this.powerGates();
    }
    powerGates() {
      if (this.endgame) return;
      this.endgame = true;
      for (const gen of this.map.gens) if (!gen.done) { gen.blocked = true; gen.regress = false; }
      for (const s of this.survivors) if (s.act && s.act.type === 'repair') s.cancelAct();
      this.sfx('siren', 0, 0, true);
    }
    openGate(gate) {
      if (gate.open) return;
      gate.open = true; gate.progress = 1;
      this.map.open[this.map.idx(gate.x, gate.y)] = 1;
      this.map.open[this.map.idx(gate.x, gate.y + 1)] = 1;
      if (this.collapse === null) {
        this.collapse = C.COLLAPSE * this.world.collapseMul;
        this.toast('¡Puerta abierta! El colapso ha comenzado', 'bad');
      } else this.toast('Otra puerta se ha abierto', 'good');
      this.noise(gate.lever.x, gate.lever.y, 40, 'gate');
      this.sfx('gate', gate.cx, gate.cy, true);
    }
    escape(s, via) {
      if (!s.alive) return;
      s.cancelAct();
      s.status = 'escaped'; s.stats.escaped = true;
      this.toast(via === 'hatch' ? `${s.name} ha escapado por la trampilla` : `${s.name} ha escapado`, 'good');
      this.sfx('escape', s.x, s.y);
      if (via === 'hatch' && this.hatch) { this.hatch.open = false; this.hatch.used = true; }
    }
    kill(s, why) {
      if (!s.alive) return;
      if (s.hook) { s.hook.s = null; }
      if (this.killer.carrying === s) this.killer.carrying = null;
      s.status = 'dead'; s.deathT = 0; s.deathCause = why; s.cancelAct();
      if (why !== 'collapse') this.killer.stats.kills++;
      const o = s.def.fem ? 'a' : 'o';
      const msg = why === 'bleed' ? `${s.name} se ha desangrado` : why === 'collapse' ? `${s.name} quedó atrapad${o} en el colapso` : `${s.name} ha sido sacrificad${o}`;
      this.toast(msg, 'bad');
      this.sfx('dead', s.x, s.y, true);
      if (!this.sim) for (let i = 0; i < 26; i++) {
        const a = U.rand(0, U.TAU), v = U.rand(0.5, 3);
        this.particles.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: U.rand(0.6, 1.6), max: 1.6, color: '#1a0a0c', size: U.rand(0.08, 0.2), drag: 1.5 });
      }
    }
    pickup(k, s) {
      s.status = 'carried'; s.wiggle = 0; s.cancelAct(); s.vault = null;
      k.carrying = s;
      this.sfx('pickup', k.x, k.y);
      if (s.isPlayer) this.toast('¡Pulsa ACCIÓN repetidamente para forcejear!', 'bad');
    }
    dropCarried(k) {
      const s = k.carrying;
      if (!s) return;
      k.carrying = null;
      s.status = 'free'; s.health = 1; s.hitHasteT = 1.6; s.wiggle = 0;
      const a = k.face + Math.PI;
      s.x = k.x + Math.cos(a) * 0.6; s.y = k.y + Math.sin(a) * 0.6;
      s.collide();
      if (this.map.solidS(s.x | 0, s.y | 0)) { s.x = k.x; s.y = k.y; s.collide(); }
    }
    escapeCarry(s) {
      const k = this.killer;
      this.dropCarried(k);
      k.stunT = Math.max(k.stunT, 3); k.stats.stunned++;
      this.toast(`${s.name} se ha liberado`, 'good');
      this.sfx('stun', k.x, k.y);
    }
    hookSurvivor(k, s, h) {
      k.carrying = null;
      s.hookCount++; s.cancelAct();
      s.status = 'hooked'; s.hook = h; h.s = s; s.x = h.cx; s.y = h.cy;
      k.stats.hooks++;
      this.sfx('hook', h.cx, h.cy, true);
      if (s.hookCount >= 3) { this.kill(s, 'hook'); return; }
      s.sac = s.hookCount === 1 ? 0 : Math.max(s.sac, 0.5);
      this.toast(`${s.name} está en el gancho`, 'bad');
      if (this.killerAI) this.killerAI.onHooked(s);
    }
    rescue(r, s) {
      const h = s.hook;
      h.s = null; s.hook = null;
      s.status = 'free'; s.health = 1; s.protectT = 6; s.hitHasteT = 1.2; s.unhookT = this.time;
      const a = Math.atan2(r.y - h.cy, r.x - h.cx);
      s.x = h.cx + Math.cos(a) * 0.7; s.y = h.cy + Math.sin(a) * 0.7;
      s.collide();
      if (r !== s) { r.stats.rescues++; this.toast(`${r.name} ha rescatado a ${s.name}`, 'good'); }
      this.sfx('rescue', h.cx, h.cy);
      this.noise(h.cx, h.cy, 18, 'rescue', r);
      if (this.killerAI) this.killerAI.onUnhooked(s);
    }

    // Intento de soltarse del gancho: 4 % de éxito; fallar acelera a la Entidad.
    selfUnhook(s) {
      if (s.status !== 'hooked') return;
      s.selfTries++;
      if (U.chance(0.04)) { this.rescue(s, s); this.toast(`${s.name} ha escapado del gancho`, 'good'); return; }
      s.sac = Math.min(0.49, s.sac + 0.08);
      this.sfx('hook', s.x, s.y);
      if (s.isPlayer) U.vibrate(60);
    }

    dropPallet(sp, s) {
      const map = this.map, k = this.killer;
      map.set(sp.x, sp.y, T.PALLET_DOWN);
      this.sfx('pallet', sp.cx, sp.cy);
      this.noise(sp.cx, sp.cy, 14, 'pallet', s);
      this.addDust(sp.cx, sp.cy, 8);
      const along = (a) => (sp.ax === 1 ? a.x - sp.cx : a.y - sp.cy);
      const lat = (a) => (sp.ax === 1 ? a.y - sp.cy : a.x - sp.cx);
      const setAlong = (a, v) => { if (sp.ax === 1) a.x = sp.cx + v; else a.y = sp.cy + v; };
      const ka = along(k);
      const inZone = Math.abs(lat(k)) < 0.85 && !k.vault && ((Math.sign(ka) === -sp.side && Math.abs(ka) < 1.05) || Math.abs(ka) < 0.5 + k.r * 0.6);
      if (inZone) {
        setAlong(k, -sp.side * (0.5 + k.r + 0.05));
        k.stunT = Math.max(k.stunT, C.PALLET_STUN);
        k.attack = null; k.busy = null; if (k.ab.phase) k.ab.phase = null;
        s.stats.stuns++; k.stats.stunned++;
        if (k.carrying) this.dropCarried(k);
        this.fxText(k.x, k.y, '¡Aturdido!', '#e8c46a');
        this.sfx('stun', k.x, k.y);
        if (k.isPlayer) { U.vibrate(150); this.shake = 0.5; }
      } else if (Math.abs(ka) < 0.5 + k.r && Math.abs(lat(k)) < 0.85) setAlong(k, (Math.sign(ka) || 1) * (0.5 + k.r + 0.05));
      for (const o of this.survivors) {
        if (o.status !== 'free' && o.status !== 'downed') continue;
        const oa = along(o);
        if (Math.abs(oa) < 0.5 + o.r && Math.abs(lat(o)) < 0.85) setAlong(o, (o === s ? sp.side : Math.sign(oa) || sp.side) * (0.5 + o.r + 0.05));
      }
    }
    breakPallet(sp, k, viaDash) {
      if (this.map.get(sp.x, sp.y) !== T.PALLET_DOWN) return;
      this.map.set(sp.x, sp.y, T.DEBRIS);
      this.map.axis[this.map.idx(sp.x, sp.y)] = 0;
      k.stats.breaks++;
      this.sfx('break', sp.cx, sp.cy);
      this.addDust(sp.cx, sp.cy, viaDash ? 14 : 10, '#6b4a2c');
    }
    kickGen(gen, k) {
      if (gen.done || gen.blocked) return;
      gen.progress = Math.max(0, gen.progress - 0.05);
      gen.regress = true; gen.spark = 1;
      k.stats.kicks++;
      this.sfx('kick', gen.cx, gen.cy);
      this.addSparks(gen.cx, gen.cy);
    }

    flash(s) {
      const k = this.killer;
      this.flashes.push({ x: s.x, y: s.y, a: s.face, life: 0.5 });
      const d = U.dist(s.x, s.y, k.x, k.y);
      const da = Math.abs(U.angDiff(s.face, Math.atan2(k.y - s.y, k.x - s.x)));
      if (d < 4.5 && da < 0.6 && this.map.los(s.x, s.y, k.x, k.y)) {
        k.blindT = 3;
        if (k.ab.cloak) { k.ab.cloak = null; k.cd = k.cdMax; }
        if (k.carrying) {
          const c = k.carrying;
          this.dropCarried(k);
          k.stunT = Math.max(k.stunT, 0.8);
          this.toast(`${s.name} ha liberado a ${c.name} con el flash`, 'good');
        }
        this.fxText(k.x, k.y, '¡Cegado!', '#fffbe6');
        s.stats.stuns++; k.stats.stunned++;
        if (k.isPlayer) U.vibrate(120);
      }
    }

    placeTrap(k) {
      if (this.traps.length >= 4) this.traps.shift();
      this.traps.push({ x: k.x, y: k.y, t: this.time });
      this.sfx('trapSet', k.x, k.y);
    }
    checkTraps(s) {
      if (s.walk || s.moving < 2.6 || s.vault || s.stealthT > 0) return;
      for (let i = 0; i < this.traps.length; i++) {
        const tr = this.traps[i];
        if (U.dist(s.x, s.y, tr.x, tr.y) < 0.6) {
          this.traps.splice(i, 1);
          s.snareT = 2.2; s.revealT = 6; s.cancelAct();
          this.killer.ab.tele = { x: tr.x, y: tr.y, t: this.time };
          this.noise(tr.x, tr.y, 999, 'trap', s);
          this.sfx('trap', tr.x, tr.y, true);
          this.addPuff(tr.x, tr.y, '#7fbf6a');
          if (s.isPlayer) { U.vibrate(200); this.toast('¡Una runa te atrapa!', 'bad'); }
          if (this.killer.isPlayer) this.toast('¡Runa activada! Pulsa «Ir a runa» para teletransportarte', 'good');
          return;
        }
      }
    }

    throwAxe(k, a) {
      this.axes.push({ x: k.x + Math.cos(a) * 0.5, y: k.y + Math.sin(a) * 0.5, vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, a, spin: 0, life: 16 / 14 });
      this.sfx('axe', k.x, k.y);
    }
    updateAxes(dt) {
      for (let i = this.axes.length - 1; i >= 0; i--) {
        const ax = this.axes[i];
        ax.life -= dt; ax.spin += dt * 22;
        let dead = ax.life <= 0;
        const steps = 4;
        for (let s = 0; s < steps && !dead; s++) {
          ax.x += (ax.vx * dt) / steps; ax.y += (ax.vy * dt) / steps;
          if (this.map.blocksAxe(ax.x | 0, ax.y | 0)) { dead = true; this.addSparks(ax.x, ax.y, 5); this.sfx('thud', ax.x, ax.y); break; }
          for (const sv of this.survivors) {
            if (sv.status !== 'free') continue;
            if (U.dist(ax.x, ax.y, sv.x, sv.y) < sv.r + 0.2) {
              if (sv.takeHit(false)) {
                this.killer.stats.hits++;
                if (sv.status === 'downed') this.killer.stats.downs++;
                this.sfx('hit', sv.x, sv.y);
                this.onKillerHit(sv);
              }
              dead = true; break;
            }
          }
        }
        if (dead) this.axes.splice(i, 1);
      }
    }
    onKillerHit() {
      if (this.killer.isPlayer) { this.shake = 0.25; U.vibrate(40); }
    }

    // Trampilla: aparece cuando solo queda un superviviente libre.
    updateHatch() {
      if (this.hatch || this.endgame) return;
      const alive = this.survivors.filter((s) => s.alive);
      if (alive.length !== 1 || alive[0].status !== 'free') return;
      const k = this.killer, map = this.map;
      for (let i = 0; i < 200; i++) {
        const x = U.randi(3, map.W - 4), y = U.randi(3, map.H - 4);
        if (map.get(x, y) !== T.FLOOR || U.dist(x, y, k.x, k.y) < 14) continue;
        this.hatch = { x: x + 0.5, y: y + 0.5, open: true };
        this.toast('Se oye una trampilla abrirse en la niebla…', 'info');
        this.sfx('hatch', x, y, true);
        return;
      }
    }
    closeHatch(k) {
      if (!this.hatch || !this.hatch.open) return;
      k.startBusy('hatch', 1.4);
      this.hatch.closing = true;
      const done = () => {
        if (!this.hatch || !this.hatch.open) return;
        this.hatch.open = false;
        this.toast('La trampilla se ha cerrado: abrid una puerta', 'bad');
        this.powerGates();
        if (this.collapse === null) this.collapse = C.COLLAPSE * this.world.collapseMul;
      };
      k.busy.onDone = done;
    }

    // ------------------------------------------------------------ percepción
    noise(x, y, r, type, src) {
      const n = { x, y, r, type, t: this.time, src };
      this.noises.push(n);
      const k = this.killer;
      if (k.isPlayer && type !== 'groan' && (r >= 999 || U.dist(x, y, k.x, k.y) <= r)) {
        this.alerts.push({ x, y, type, life: type === 'gen' || type === 'trap' ? 3 : 2 });
      }
    }
    heardNoise(k, hearing, since) {
      let best = null, bp = -1;
      const pri = { skill: 5, gen: 4, trap: 5, scream: 4, gate: 3, pallet: 3, vault: 2, rescue: 3, hook: 1, groan: 1 };
      for (const n of this.noises) {
        if (n.t <= since) continue;
        if (n.r < 999 && U.dist(n.x, n.y, k.x, k.y) > n.r * hearing) continue;
        if (n.type === 'gen' && U.chance(0.5)) continue;
        const p = (pri[n.type] || 1) + n.t * 0.01;
        if (p > bp) { bp = p; best = n; }
      }
      return best;
    }
    addScratch(s) {
      if (this.sim && !this.killerAI) return;
      this.scratches.push({ x: s.x + U.rand(-0.15, 0.15), y: s.y + U.rand(-0.15, 0.15), a: U.rand(0, Math.PI), t: this.time, s });
    }
    // Marca más reciente de un superviviente que el asesino puede ver desde donde está.
    trackScratch(s, k, range, minAge) {
      const now = this.time;
      for (let i = this.scratches.length - 1; i >= 0; i--) {
        const sc = this.scratches[i];
        if (sc.s !== s) continue;
        const age = now - sc.t;
        if (age < minAge) continue;
        if (age > 8) break;
        const d = U.dist(k.x, k.y, sc.x, sc.y);
        if (d > range || d < 0.9) continue;
        if (!this.map.los(k.x, k.y, sc.x, sc.y)) continue;
        return sc;
      }
      return null;
    }
    findScratch(s, at) {
      let best = null, bd = 0.7;
      for (let i = this.scratches.length - 1; i >= 0; i--) {
        const sc = this.scratches[i];
        if (sc.s !== s) continue;
        const d = Math.abs(sc.t - at);
        if (d < bd) { bd = d; best = sc; }
        if (sc.t < at - 1) break;
      }
      return best;
    }

    // ------------------------------------------------------------ efectos
    toast(msg, kind) { this.events.push({ type: 'toast', msg, kind: kind || 'info' }); }
    sfx(name, x, y, global) {
      if (this.sim || this.opts.mute || !NSF.Audio) return;
      let vol = 1;
      if (!global && x !== undefined) {
        const v = this.viewer;
        const d = U.dist(v.x, v.y, x, y);
        vol = U.clamp(1 - d / 22, 0, 1);
        if (vol <= 0.02) return;
      }
      NSF.Audio.play(name, vol);
    }
    shakeAt(x, y, amt) {
      const v = this.viewer;
      if (U.dist(v.x, v.y, x, y) < 10) this.shake = Math.max(this.shake, amt);
    }
    fxText(x, y, text, color) { if (!this.sim) this.texts.push({ x, y: y - 0.6, text, color, life: 1.2 }); }
    addBlood(x, y, amt, burst) {
      if (this.sim) return;
      const n = burst ? 10 : 1;
      for (let i = 0; i < n; i++) this.blood.push({ x: x + U.rand(-0.25, 0.25) * amt, y: y + U.rand(-0.25, 0.25) * amt, r: U.rand(0.04, 0.1) * (burst ? 1.4 : 1), t: this.time });
      if (burst) for (let i = 0; i < 16; i++) {
        const a = U.rand(0, U.TAU), v = U.rand(1, 4);
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.3, 0.7), max: 0.7, color: '#8e1016', size: U.rand(0.04, 0.09) });
      }
    }
    addSparks(x, y, n = 14) {
      if (this.sim) return;
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), v = U.rand(2, 6);
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.2, 0.6), max: 0.6, color: '#ffc266', size: 0.05, glow: true });
      }
    }
    addDust(x, y, n = 2, color = '#5d5a52') {
      if (this.sim) return;
      for (let i = 0; i < n; i++) {
        const a = U.rand(0, U.TAU), v = U.rand(0.3, 1.5);
        this.particles.push({ x: x + U.rand(-0.2, 0.2), y: y + U.rand(-0.2, 0.2), vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.4, 0.9), max: 0.9, color, size: U.rand(0.08, 0.16), drag: 2 });
      }
    }
    addPuff(x, y, color) {
      if (this.sim) return;
      for (let i = 0; i < 22; i++) {
        const a = U.rand(0, U.TAU), v = U.rand(0.5, 2.5);
        this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.5, 1.1), max: 1.1, color, size: U.rand(0.06, 0.14), glow: true, drag: 2 });
      }
    }
  }

  // El cierre de trampilla usa la cola de acciones del asesino.
  const finishBusy = NSF.Killer.prototype.finishBusy;
  NSF.Killer.prototype.finishBusy = function (b) {
    if (b.type === 'hatch') { if (b.onDone) b.onDone(); return; }
    finishBusy.call(this, b);
  };

  NSF.Game = Game;
})();
