// Menús, HUD, bucle principal y audio de tensión.
(function () {
  'use strict';
  const NSF = window.NSF, C = NSF.CONST, U = NSF.U;
  const $ = (id) => document.getElementById(id);

  const svg = (p) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  const ICONS = {
    botiquin: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M12 10v7M8.5 13.5h7"/>'),
    sobrecarga: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    sprint: svg('<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/>'),
    sombra: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 21 21 3"/>'),
    destello: svg('<path d="M12 2v5M12 17v5M2 12h5M17 12h5M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3"/><circle cx="12" cy="12" r="2.5"/>'),
    embestida: svg('<path d="M3 12h13M12 6l6 6-6 6M20 5v14"/>'),
    velo: svg('<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>'),
    hacha: svg('<path d="M5 21 15 11"/><path d="M13 3c4 0 8 4 8 8-3 0-5-1-6.5-2.5S13 6 13 3z"/>'),
    runa: svg('<circle cx="12" cy="12" r="9"/><path d="M12 5 18 16H6z"/>'),
    attack: svg('<path d="M5 3l6 18M11 2l5 17M17 3l3 12"/>'),
  };

  const UI = {
    sel: { role: 'survivor', survivor: 'sara', killer: 'carnicero', diff: 'normal' },
    game: null, demo: null, playing: false, paused: false,
    last: 0, beatT: 0, hudT: 0, cache: {}, rotateOk: false,

    init() {
      NSF.settings = Object.assign({ sound: true, vibration: true }, U.store.get('settings', {}));
      Object.assign(this.sel, U.store.get('sel', {}));
      this.records = U.store.get('records', {});
      NSF.Audio.enabled = NSF.settings.sound;
      this.renderer = new NSF.Renderer($('cv'));
      this.input = new NSF.Input();
      this.bind();
      this.syncToggles();
      this.startDemo();
      this.show('title');
      requestAnimationFrame((t) => { this.last = t; this.frame(t); });
    },

    bind() {
      document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { NSF.Audio.init(); NSF.Audio.play('click'); this.show(b.dataset.go); }));
      document.querySelectorAll('.role-card').forEach((b) => b.addEventListener('click', () => {
        NSF.Audio.init(); NSF.Audio.play('click');
        this.sel.role = b.dataset.role; this.save();
        this.show('char');
      }));
      $('char-next').addEventListener('click', () => { NSF.Audio.play('click'); this.show('diff'); });
      $('diff-start').addEventListener('click', () => { NSF.Audio.init(); NSF.Audio.play('click'); this.startGame(); });
      $('intro-go').addEventListener('click', () => this.begin());
      $('btn-pause').addEventListener('click', () => this.pause());
      $('p-resume').addEventListener('click', () => this.resume());
      $('p-restart').addEventListener('click', () => this.startGame());
      $('p-quit').addEventListener('click', () => this.quit());
      $('e-again').addEventListener('click', () => this.startGame());
      $('e-menu').addEventListener('click', () => this.quit());
      const snd = () => {
        NSF.settings.sound = !NSF.settings.sound;
        NSF.Audio.init(); NSF.Audio.setEnabled(NSF.settings.sound);
        this.saveSettings(); this.syncToggles();
      };
      $('tg-sound').addEventListener('click', snd);
      $('tg-sound2').addEventListener('click', snd);
      $('tg-vib').addEventListener('click', () => { NSF.settings.vibration = !NSF.settings.vibration; this.saveSettings(); this.syncToggles(); U.vibrate(30); });
      $('tg-full').addEventListener('click', () => this.toggleFullscreen());
      $('rotate-ok').addEventListener('click', () => { this.rotateOk = true; $('rotate').hidden = true; });
      window.addEventListener('resize', () => { this.renderer.resize(); this.checkRotate(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing && !this.paused && !this.game.over) this.pause(); });
      document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.screen')) e.preventDefault(); }, { passive: false });
    },

    save() { U.store.set('sel', this.sel); },
    saveSettings() { U.store.set('settings', NSF.settings); },
    syncToggles() {
      const s = NSF.settings;
      for (const id of ['tg-sound', 'tg-sound2']) { $(id).setAttribute('aria-pressed', String(s.sound)); $(id).textContent = 'Sonido: ' + (s.sound ? 'sí' : 'no'); }
      $('tg-vib').setAttribute('aria-pressed', String(s.vibration));
      $('tg-vib').textContent = 'Vibración: ' + (s.vibration ? 'sí' : 'no');
    },
    toggleFullscreen() {
      const d = document;
      try {
        if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
        else {
          const el = d.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
          if (req) {
            const p = req.call(el);
            if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* sin bloqueo */ } }).catch(() => {});
          }
        }
      } catch (e) { /* no disponible */ }
    },

    // ------------------------------------------------------------ pantallas
    show(name) {
      document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== 'scr-' + name; });
      this.screen = name;
      if (name === 'role') document.querySelectorAll('#scr-role .portrait').forEach((cv) => {
        const list = cv.dataset.kind === 'survivor' ? NSF.SURVIVORS : NSF.KILLERS;
        NSF.Renderer.portrait(cv, cv.dataset.kind, list.find((d) => d.id === cv.dataset.id));
      });
      if (name === 'char') this.buildChars();
      if (name === 'diff') this.buildDiffs();
      const first = document.querySelector('#scr-' + name + ' button');
      if (first && name !== 'title') first.blur();
    },

    buildChars() {
      const killer = this.sel.role === 'killer';
      const list = killer ? NSF.KILLERS : NSF.SURVIVORS;
      const key = killer ? 'killer' : 'survivor';
      $('char-title').textContent = killer ? 'Elige asesino' : 'Elige superviviente';
      $('scr-char').classList.toggle('killer-mode', killer);
      const box = $('char-list');
      box.innerHTML = '';
      for (const d of list) {
        const b = document.createElement('button');
        b.className = 'char-card';
        b.setAttribute('aria-pressed', String(this.sel[key] === d.id));
        const stats = killer ? `<span class="char-stats"><span>Velocidad ${Math.round((d.speed / 4) * 100)} %</span><span>Terror ${d.terror} m</span></span>` : '';
        b.innerHTML = `<span class="char-top"><canvas class="portrait"></canvas><span><span class="char-name">${d.name}</span><span class="char-role">${d.role}</span></span></span>
          <span class="char-ab"><b>${d.ability.name}</b>${d.ability.desc}</span>
          <span class="char-pas"><b>${d.passive.name}.</b> ${d.passive.desc}</span>${stats}`;
        b.addEventListener('click', () => {
          NSF.Audio.play('click');
          this.sel[key] = d.id; this.save();
          box.querySelectorAll('.char-card').forEach((c) => c.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
        });
        box.appendChild(b);
        NSF.Renderer.portrait(b.querySelector('canvas'), killer ? 'killer' : 'survivor', d);
      }
    },

    buildDiffs() {
      const box = $('diff-list');
      box.innerHTML = '';
      const role = this.sel.role;
      const skulls = { normal: 1, hard: 2, nightmare: 3 };
      for (const id of ['normal', 'hard', 'nightmare']) {
        const D = NSF.DIFFICULTIES[id];
        const rec = ((this.records[role] || {})[id]) || { plays: 0, wins: 0 };
        const b = document.createElement('button');
        b.className = 'diff-card ' + id;
        b.setAttribute('aria-pressed', String(this.sel.diff === id));
        const winWord = role === 'survivor' ? 'escapes' : 'victorias';
        b.innerHTML = `<span class="diff-name">${D.name} <span class="skulls" aria-label="nivel ${skulls[id]} de 3">${'✕'.repeat(skulls[id])}</span></span>
          <span class="diff-tag">${D.tag}</span>
          <ul>${D.bullets[role].map((t) => `<li>${t}</li>`).join('')}</ul>
          <span class="diff-rec">${rec.plays} partidas · ${rec.wins} ${winWord}</span>`;
        b.addEventListener('click', () => {
          NSF.Audio.play('click');
          this.sel.diff = id; this.save();
          box.querySelectorAll('.diff-card').forEach((c) => c.setAttribute('aria-pressed', 'false'));
          b.setAttribute('aria-pressed', 'true');
        });
        box.appendChild(b);
      }
    },

    // ------------------------------------------------------------ partida
    startDemo() {
      this.demo = new NSF.Game({ role: 'demo', diff: 'hard', mute: true });
      this.renderer.setGame(this.demo);
    },

    startGame() {
      const s = this.sel;
      this.input.clear();
      this.game = new NSF.Game({ role: s.role, diff: s.diff, survivorId: s.survivor, killerId: s.role === 'killer' ? s.killer : null });
      this.demo = null;
      this.renderer.setGame(this.game);
      this.playing = true; this.paused = true;
      this.cache = {};
      $('toasts').innerHTML = '';
      this.setupControls();
      this.buildRoster();
      const g = this.game;
      if (s.role === 'survivor') {
        $('intro-eyebrow').textContent = 'Esta noche te caza';
        $('intro-name').textContent = g.killer.def.name;
        $('intro-ability').textContent = `${g.killer.def.ability.name}: ${g.killer.def.ability.desc}`;
        $('intro-goal').textContent = `Repara ${C.GENS_NEEDED} generadores · abre una puerta · escapa`;
      } else {
        $('intro-eyebrow').textContent = 'Tus presas';
        $('intro-name').textContent = g.survivors.map((x) => x.name).join(', ');
        $('intro-ability').textContent = `Tu habilidad, ${g.killer.def.ability.name}: ${g.killer.def.ability.desc}`;
        $('intro-goal').textContent = 'Cuélgalos tres veces antes de que escapen';
      }
      $('intro-name').style.color = s.role === 'survivor' ? '' : 'var(--bone)';
      $('hud').hidden = false;
      $('controls').hidden = true;
      this.show('intro');
      NSF.Audio.setChase(0);
    },

    begin() {
      NSF.Audio.init();
      NSF.Audio.play('click');
      this.show('none');
      this.paused = false;
      $('controls').hidden = false;
      this.checkRotate();
    },
    pause() {
      if (!this.playing || this.paused) return;
      this.paused = true;
      this.input.clear();
      $('controls').hidden = true;
      const g = this.game;
      $('pause-info').textContent = `${g.diff.name} · ${g.role === 'survivor' ? g.player.def.name + ' contra ' + g.killer.def.name : g.killer.def.name} · ${U.fmtTime(g.time)}`;
      NSF.Audio.setChase(0);
      this.show('pause');
    },
    resume() {
      this.show('none');
      this.paused = false;
      $('controls').hidden = false;
    },
    quit() {
      this.playing = false; this.paused = false; this.game = null;
      $('hud').hidden = true; $('controls').hidden = true; $('rotate').hidden = true;
      NSF.Audio.setChase(0);
      this.startDemo();
      this.show('title');
    },
    checkRotate() {
      $('rotate').hidden = !(this.playing && !this.paused && !this.rotateOk && window.innerHeight > window.innerWidth);
    },

    setupControls() {
      const g = this.game, killer = g.role === 'killer';
      $('controls').classList.toggle('killer-ctl', killer);
      const def = killer ? g.killer.def : g.player.def;
      $('b-ability-ico').innerHTML = ICONS[def.ability.id] || '';
      $('b-attack-ico').innerHTML = ICONS.attack;
      $('b-ability-lbl').textContent = def.ability.name;
    },

    buildRoster() {
      const box = $('roster');
      box.innerHTML = '';
      this.rosterEls = this.game.survivors.map((s) => {
        const li = document.createElement('li');
        if (s.isPlayer) li.classList.add('me');
        li.innerHTML = `<span class="dot" style="background:${s.def.color}"></span><span class="nm">${s.name}</span><span class="st"></span><span class="bar" hidden><i></i></span>`;
        box.appendChild(li);
        return { li, st: li.querySelector('.st'), bar: li.querySelector('.bar'), fill: li.querySelector('.bar i'), last: '' };
      });
    },

    // ------------------------------------------------------------ bucle
    frame(t) {
      const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
      this.last = t;
      try {
        if (this.playing && this.game) {
          const g = this.game;
          if (!this.paused && !g.over) {
            this.input.poll();
            if (this.input.take('pause')) this.pause();
            else {
              g.applyInput(this.input);
              g.update(dt);
              this.audioTick(dt);
            }
          }
          this.handleEvents();
          this.renderer.render(this.paused || g.over ? 0 : dt);
          this.updateHud(dt);
        } else if (this.demo) {
          this.demo.update(dt);
          this.demo.events.length = 0;
          if (this.demo.over || this.demo.time > 240) this.startDemo();
          this.renderer.render(dt);
        }
      } catch (err) {
        console.error(err);
      }
      requestAnimationFrame((tt) => this.frame(tt));
    },

    audioTick(dt) {
      const g = this.game, A = NSF.Audio;
      if (!A.ctx) return;
      if (g.role === 'survivor') {
        const p = g.player, k = g.killer, tr = k.terror;
        const d = U.dist(p.x, p.y, k.x, k.y);
        const inten = p.alive && p.status !== 'hooked' && tr > 0 && d < tr ? 1 - d / tr : 0;
        if (inten > 0) {
          this.beatT -= dt;
          if (this.beatT <= 0) { A.heartbeat(inten); this.beatT = U.lerp(1.15, 0.38, inten); }
        }
        const kai = g.killerAI;
        const chased = kai && kai.target === p && kai.state === 'chase';
        A.setChase(chased ? 1 : inten > 0.6 ? 0.4 : 0);
        A.setAmbient(1 - inten * 0.6);
      } else {
        const k = g.killer;
        const chasing = g.survivors.some((s) => s.status === 'free' && U.dist(k.x, k.y, s.x, s.y) < 7 && g.map.los(k.x, k.y, s.x, s.y));
        A.setChase(chasing ? 0.7 : 0);
      }
    },

    handleEvents() {
      const g = this.game;
      if (!g.events.length) return;
      const evs = g.events.splice(0);
      for (const e of evs) {
        if (e.type === 'toast') this.toast(e.msg, e.kind);
        else if (e.type === 'end') this.onEnd();
      }
    },

    toast(msg, kind) {
      const box = $('toasts');
      const el = document.createElement('div');
      el.className = 'toast ' + (kind || '');
      el.textContent = msg;
      box.appendChild(el);
      while (box.children.length > 3) box.removeChild(box.firstChild);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 3300);
    },

    onEnd() {
      const r = this.game.result;
      const rec = (this.records[r.role] = this.records[r.role] || {});
      const d = (rec[r.diff] = rec[r.diff] || { plays: 0, wins: 0 });
      d.plays++; if (r.win) d.wins++;
      U.store.set('records', this.records);
      $('controls').hidden = true; $('rotate').hidden = true; $('hud').hidden = true;
      $('toasts').innerHTML = '';
      NSF.Audio.setChase(0);
      $('end-eyebrow').textContent = `${NSF.DIFFICULTIES[r.diff].name} · ${U.fmtTime(r.time)}`;
      $('end-title').textContent = r.title;
      $('end-sub').textContent = r.sub;
      $('end-rows').innerHTML = r.rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
      $('end-points').textContent = r.points.toLocaleString('es-ES');
      const scr = $('scr-end');
      scr.classList.toggle('win', r.win); scr.classList.toggle('lose', !r.win);
      this.show('end');
    },

    setText(key, el, v) {
      if (this.cache[key] === v) return;
      this.cache[key] = v;
      el.textContent = v;
    },
    setClass(key, el, cls) {
      if (this.cache[key] === cls) return;
      this.cache[key] = cls;
      el.className = cls;
    },

    updateHud(dt) {
      const g = this.game;
      const role = g.role;
      // botones (cada fotograma)
      if (role === 'survivor') {
        const p = g.player;
        const ab = $('b-ability');
        const cdv = p.cd > 0 ? (p.cd / p.cdMax).toFixed(3) : '0';
        if (this.cache.cd !== cdv) { this.cache.cd = cdv; ab.style.setProperty('--cd', cdv); }
        const usable = p.status === 'free' && p.cd <= 0 && (p.def.ability.id !== 'botiquin' || p.health === 1);
        this.setClass('abc', ab, 'cbtn ability' + (usable ? ' ready' : ''));
        const ctx = g.survivorContext();
        this.setText('actl', $('b-action-lbl'), ctx ? ctx.label : 'Acción');
        let cls = 'cbtn action';
        if (!ctx) cls += ' off';
        else if (ctx.busy) cls += ' busy';
        else if (ctx.id === 'skill' || ctx.id === 'wiggle' || ctx.id === 'drop') cls += ' hot';
        this.setClass('actc', $('b-action'), cls);
      } else {
        const k = g.killer;
        const ab = $('b-ability');
        const cdv = k.cd > 0 && k.ab.cloak !== 'on' ? (k.cd / k.cdMax).toFixed(3) : '0';
        if (this.cache.cd !== cdv) { this.cache.cd = cdv; ab.style.setProperty('--cd', cdv); }
        this.setText('abl', $('b-ability-lbl'), k.abilityLabel());
        this.setClass('abc', ab, 'cbtn ability' + (k.abilityReady() && !k.carrying ? ' ready' : ''));
        const ctx = g.killerContext();
        this.setText('actl', $('b-action-lbl'), ctx ? ctx.label : 'Acción');
        this.setClass('actc', $('b-action'), 'cbtn action' + (ctx ? (ctx.id === 'hook' || ctx.id === 'pickup' ? ' hot' : '') : ' off'));
        const canAtk = k.canAct() && !k.carrying && !k.ab.cloak && k.recoverT <= 0;
        this.setClass('atk', $('b-attack'), 'cbtn attack' + (canAtk ? '' : ' off'));
      }
      // resto del HUD a 5 Hz
      this.hudT -= dt;
      if (this.hudT > 0 && dt > 0) return;
      this.hudT = 0.2;
      const left = C.GENS_NEEDED - g.gensDone;
      let txt;
      if (g.hatch && g.hatch.open) txt = role === 'survivor' ? 'Trampilla abierta' : 'Cierra la trampilla';
      else if (!g.endgame) txt = left === 1 ? '1 generador' : `${left} generadores`;
      else if (g.map.gates.some((gt) => gt.open)) txt = role === 'survivor' ? 'Escapa' : 'Que no escapen';
      else txt = role === 'survivor' ? 'Abre una puerta' : 'Vigila las puertas';
      this.setText('obj', $('obj-text'), txt);
      const col = $('collapse');
      if (g.collapse !== null) { col.hidden = false; this.setText('col', $('collapse-t'), U.fmtTime(g.collapse)); } else col.hidden = true;
      g.survivors.forEach((s, i) => {
        const r = this.rosterEls[i];
        let st, cls;
        switch (s.status) {
          case 'free': st = s.health === 2 ? (s.def.fem ? 'Sana' : 'Sano') : (s.def.fem ? 'Herida' : 'Herido'); cls = s.health === 2 ? 'ok' : 'injured'; break;
          case 'downed': st = s.def.fem ? 'Caída' : 'Caído'; cls = 'downed'; break;
          case 'carried': st = s.def.fem ? 'Cargada' : 'Cargado'; cls = 'carried'; break;
          case 'hooked': st = s.sac >= 0.5 ? 'Gancho · fase 2' : 'Gancho'; cls = 'hooked'; break;
          case 'dead': st = s.def.fem ? 'Muerta' : 'Muerto'; cls = 'dead'; break;
          default: st = 'Escapó'; cls = 'escaped';
        }
        if (s.hookCount > 0 && s.alive && s.status !== 'hooked') st += ` · ${s.hookCount}×`;
        if (r.last !== st) { r.last = st; r.st.textContent = st; r.li.className = cls + (s.isPlayer ? ' me' : ''); }
        r.bar.hidden = s.status !== 'hooked';
        if (s.status === 'hooked') r.fill.style.width = Math.round((1 - s.sac) * 100) + '%';
      });
    },
  };

  NSF.UI = UI;
  const boot = () => UI.init();
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
  else boot();
})();
