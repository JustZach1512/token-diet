// DOM layer: menus, HUD, toasts, skill check dial, markers and results.
import { SURVIVORS, KILLERS, DIFFICULTIES, QUALITY } from './config.js';

const $ = (id) => document.getElementById(id);
const sv = (body, fill = 'none') => `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  gear: sv('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.4v2.8M12 18.8v2.8M2.4 12h2.8M18.8 12h2.8M5.2 5.2l2 2M16.8 16.8l2 2M5.2 18.8l2-2M16.8 7.2l2-2"/>'),
  hook: sv('<path d="M12 2v9"/><path d="M12 11a4.5 4.5 0 1 1-4.5 4.5"/><path d="M7.5 15.5l-1.8-1.2"/>'),
  skull: sv('<path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.4 4.2 3 5v3h8v-3c1.6-.8 3-2.4 3-5a7 7 0 0 0-7-7z"/><circle cx="9.3" cy="10.5" r="1.3" fill="currentColor"/><circle cx="14.7" cy="10.5" r="1.3" fill="currentColor"/><path d="M10 21v-3M14 21v-3"/>'),
  exit: sv('<path d="M5 21V4h9v17"/><path d="M14 12h7M18 9l3 3-3 3"/>'),
  bolt: sv('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  cross: sv('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'),
  sun: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  eyeOff: sv('<path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3 3.5M6.5 7.5C4.3 9 3 12 3 12s4 6 9 6c1.4 0 2.7-.4 3.8-1"/>'),
  charge: sv('<path d="M4 6l7 6-7 6M12 6l7 6-7 6"/>'),
  ghost: sv('<path d="M6 20V10a6 6 0 0 1 12 0v10l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5z"/><circle cx="10" cy="11" r=".8" fill="currentColor"/><circle cx="14" cy="11" r=".8" fill="currentColor"/>'),
  trap: sv('<path d="M3 15a9 9 0 0 1 18 0"/><path d="M6 15l1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3"/><path d="M2 18h20"/>'),
  hand: sv('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7s-5-2-6.5-5L3 13.5a1.5 1.5 0 0 1 2.5-1.6L8 14"/>'),
  knife: sv('<path d="M3 21l7-7"/><path d="M10 14L21 3c0 6-3 10-8 13z"/>'),
  drop: sv('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'),
  down: sv('<path d="M12 4v14M6 12l6 6 6-6"/>'),
  run: sv('<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v4M6 11l3-3 4 1 3 3 3 1M11 15l1-5"/>'),
  survivor: sv('<circle cx="12" cy="6" r="3"/><path d="M6 21v-5a6 6 0 0 1 12 0v5"/>'),
};

const ABILITY_ICON = { sprint: ICON.bolt, medkit: ICON.cross, flare: ICON.sun, shadow: ICON.eyeOff, charge: ICON.charge, cloak: ICON.ghost, trap: ICON.trap };
const STATE_ICON = { injured: ICON.drop, downed: ICON.down, carried: ICON.hand, hooked: ICON.hook, dead: ICON.skull, escaped: ICON.exit, trapped: ICON.trap };
const KILLER_COLOR = { carnicero: 0x6b4a34, espectro: 0x2a2f40, trampero: 0x4a5a34 };
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export class UI {
  constructor() {
    this.cb = {};
    this.el = {
      title: $('title'), setup: $('setup'), loading: $('loading'), hud: $('hud'), pause: $('pause'), results: $('results'),
      team: $('team'), objective: $('objective'), toasts: $('toasts'), statusText: $('statusText'),
      prog: $('prog'), progLabel: $('progLabel'), progBar: $('progBar'), progFill: $('progFill'),
      skill: $('skill'), skZone: $('skZone'), skGreat: $('skGreat'), skNeedle: $('skNeedle'), skillMsg: $('skillMsg'),
      action: $('btnAction'), ability: $('btnAbility'), secondary: $('btnSecondary'),
      markers: $('markers'), spectate: $('spectate'), specName: $('specName'),
      fxRed: $('fxRed'), fxWhite: $('fxWhite'), fxVig: $('fxVig'), fxGrain: $('fxGrain'), joyHint: $('joyHint'),
    };
    this.markerPool = [];
    this.last = {};
    const click = (id, ev) => $(id).addEventListener('click', () => this.emit(ev));
    click('btnPlay', 'play'); click('btnHow', 'how'); click('btnBack', 'back'); click('btnStart', 'start');
    click('btnSound', 'sound'); click('btnSound2', 'sound'); click('btnResume', 'resume'); click('btnQuit', 'quit');
    click('btnAgain', 'again'); click('btnMenu', 'menu'); click('btnSpecNext', 'specNext'); click('btnSpecEnd', 'specEnd');
    $('btnPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.emit('pause'); });
    $('sens').addEventListener('input', (e) => this.emit('sens', parseFloat(e.target.value)));
  }

  on(name, fn) { this.cb[name] = fn; }
  emit(name, arg) { this.cb[name]?.(arg); }

  show(name) {
    for (const k of ['title', 'setup', 'loading', 'hud']) this.el[k].hidden = k !== name;
    if (name !== 'hud') { this.el.pause.hidden = true; this.el.markers.innerHTML = ''; this.markerPool = []; }
    this.el.results.hidden = true;
  }

  setSound(on) {
    $('btnSound').textContent = `Sonido: ${on ? 'sí' : 'no'}`;
    $('btnSound').setAttribute('aria-pressed', on);
    $('btnSound2').textContent = on ? 'Sí' : 'No';
  }

  setPostFallback(noPost) {
    this.noPost = noPost;
    this.el.fxVig.hidden = !noPost;
    this.el.fxGrain.hidden = !noPost;
  }

  // ---------------------------------------------------------------- setup
  buildSetup(S) {
    const side = $('sideSeg');
    side.innerHTML = '';
    for (const [id, name, desc, icon] of [
      ['survivor', 'Superviviente', 'Repara, esconde, rescata y escapa.', ICON.survivor],
      ['killer', 'Asesino', 'Caza a los cuatro en primera persona.', ICON.knife],
    ]) {
      const b = document.createElement('button');
      b.className = `tile side-${id}`;
      b.setAttribute('aria-pressed', S.role === id);
      b.innerHTML = `<span class="ico">${icon}</span><b>${name}</b><small>${desc}</small>`;
      b.onclick = () => { S.role = id; S.charId = id === 'killer' ? S.killerChar : S.survChar; this.buildSetup(S); this.emit('change'); };
      side.appendChild(b);
    }
    const chars = $('chars');
    chars.innerHTML = '';
    const list = S.role === 'killer' ? KILLERS : SURVIVORS;
    $('charHint').textContent = S.role === 'killer' ? 'Tu rival: 4 supervivientes IA' : 'Tus compañeros: 3 IA';
    for (const d of list) {
      const b = document.createElement('button');
      b.className = 'char';
      b.setAttribute('aria-pressed', S.charId === d.id);
      const col = S.role === 'killer' ? KILLER_COLOR[d.id] : d.colors.shirt;
      b.innerHTML = `<div class="who"><span class="dot" style="background:${hex(col)}">${d.name.replace('El ', '').replace('La ', '')[0]}</span><div><b>${d.full || d.name}</b><span>${d.role}</span></div></div>
        <div class="ab"><em>${d.ability.name}</em> · ${d.ability.desc}</div>
        <div class="ps">${d.passive.name}: ${d.passive.desc}</div>`;
      b.onclick = () => {
        S.charId = d.id;
        if (S.role === 'killer') S.killerChar = d.id; else S.survChar = d.id;
        for (const c of chars.children) c.setAttribute('aria-pressed', c === b);
        this.emit('change');
      };
      chars.appendChild(b);
    }
    const diff = $('diffSeg');
    diff.innerHTML = '';
    for (const d of Object.values(DIFFICULTIES)) {
      const b = document.createElement('button');
      b.className = `tile diff-${d.id}`;
      b.setAttribute('aria-pressed', S.diff === d.id);
      b.innerHTML = `<b>${d.name}</b><small>${d.tag}</small>`;
      b.onclick = () => { S.diff = d.id; this.buildSetup(S); this.emit('change'); };
      diff.appendChild(b);
    }
    const D = DIFFICULTIES[S.diff];
    const bl = $('diffBlurb');
    bl.className = `blurb${S.diff === 'pesadilla' ? ' nm' : ''}`;
    bl.innerHTML = D.blurb.map((t) => `<span>${t}</span>`).join('');
    const q = $('qualChips');
    q.innerHTML = '';
    for (const Q of Object.values(QUALITY)) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.setAttribute('aria-pressed', S.quality === Q.id);
      b.textContent = Q.name;
      b.onclick = () => { S.quality = Q.id; this.buildSetup(S); this.emit('quality'); };
      q.appendChild(b);
    }
  }

  // ---------------------------------------------------------------- HUD
  startHud(game) {
    this.last = {};
    this.el.team.innerHTML = '';
    this.mates = game.survivors.map((s) => {
      const d = document.createElement('div');
      d.className = 'mate';
      d.style.background = `radial-gradient(circle at 35% 30%, ${hex(s.def.colors.shirt)}, #0b0c10 120%)`;
      d.innerHTML = `${s.name[0]}<span class="ring"></span><span class="st"></span><span class="pips"><i></i><i></i><i></i></span>`;
      this.el.team.appendChild(d);
      return d;
    });
    const killer = game.role === 'killer';
    this.el.action.classList.toggle('killer', killer);
    this.el.joyHint.hidden = false;
    clearTimeout(this._joyT);
    this._joyT = setTimeout(() => { this.el.joyHint.hidden = true; }, 9000);
    const ab = game.player.def.ability;
    this.el.ability.querySelector('.lbl').innerHTML = `${ABILITY_ICON[ab.id] || ''}<span>${ab.name}</span>`;
    this.el.toasts.innerHTML = '';
    this.el.spectate.hidden = true;
    this.el.skill.hidden = true;
  }

  setSpectate(on) { this.specOn = on; }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    const life = kind === 'big' ? 5 : 3.4;
    t.style.setProperty('--life', `${life}s`);
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), (life + 0.6) * 1000);
  }

  flashSkill(text, kind) {
    const m = this.el.skillMsg;
    m.textContent = text;
    m.className = `${kind}`;
    void m.offsetWidth;
    m.className = `${kind} show`;
  }

  _arc(a0, a1, r = 46) {
    const p = (a) => { const t = ((a - 90) * Math.PI) / 180; return `${(Math.cos(t) * r).toFixed(2)} ${(Math.sin(t) * r).toFixed(2)}`; };
    return `M ${p(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
  }

  hud(st) {
    const E = this.el, L = this.last;
    // team
    st.team.forEach((m, i) => {
      const el = this.mates[i];
      if (!el) return;
      const cls = m.state === 'standing' ? (m.health === 1 ? 'injured' : 'ok') : m.state;
      const key = `${cls}|${m.hooks}|${m.you}`;
      if (L[`m${i}`] !== key) {
        L[`m${i}`] = key;
        el.className = `mate ${cls}${m.you ? ' you' : ''}`;
        el.querySelector('.st').innerHTML = STATE_ICON[cls] || '';
        el.querySelector('.st').hidden = cls === 'ok';
        el.querySelectorAll('.pips i').forEach((p, k) => p.classList.toggle('on', k < m.hooks));
      }
      const ring = el.querySelector('.ring');
      if (m.state === 'hooked') ring.style.background = `conic-gradient(rgba(255,59,59,.9) ${m.hook * 360}deg, transparent 0)`, ring.style.webkitMask = 'radial-gradient(circle, transparent 62%, #000 64%)', ring.style.mask = 'radial-gradient(circle, transparent 62%, #000 64%)';
      else if (ring.style.background) ring.style.background = '';
    });
    // objective
    let obj, cls = '';
    if (st.collapse) { obj = `${ICON.skull}<span>Colapso</span><b>${st.collapse}</b>`; cls = 'collapse'; }
    else if (st.powered) { obj = `${ICON.exit}<span>${st.role === 'killer' ? 'Puertas con corriente' : 'Abre una puerta'}</span>`; cls = 'gates'; }
    else obj = `${ICON.gear}<b>${st.gensLeft}</b><span>${st.gensLeft === 1 ? 'generador' : 'generadores'}</span>`;
    if (st.role === 'killer') obj += `<span style="opacity:.5">·</span>${ICON.skull}<b style="color:var(--blood-hi)">${st.kills}</b>`;
    if (L.obj !== obj) { L.obj = obj; E.objective.innerHTML = obj; E.objective.className = cls; }
    // action
    const a = st.action;
    const akey = `${a.label}|${a.disabled}|${a.hot}`;
    if (L.action !== akey) {
      L.action = akey;
      const icon = st.role === 'killer' ? ICON.knife : ICON.hand;
      E.action.innerHTML = `<span class="lbl">${icon}${a.label}</span>`;
      E.action.classList.toggle('disabled', !!a.disabled);
      E.action.classList.toggle('hot', !!a.hot);
    }
    const sc = st.secondary;
    const skey = sc ? `${sc.label}|${sc.on}` : 'none';
    if (L.sec !== skey) {
      L.sec = skey;
      E.secondary.classList.toggle('disabled', !sc);
      E.secondary.classList.toggle('on', !!(sc && sc.on));
      E.secondary.querySelector('.lbl').textContent = sc ? sc.label : (st.role === 'killer' ? 'Usar' : '');
    }
    const ab = st.ability;
    const p = ab.cd > 0 ? ab.cd / ab.max : 0;
    E.ability.style.setProperty('--p', p.toFixed(3));
    const num = ab.cd > 0 ? Math.ceil(ab.cd) : '';
    if (L.abn !== num) { L.abn = num; E.ability.querySelector('.num').textContent = num; }
    E.ability.classList.toggle('ready', ab.cd <= 0 && !ab.disabled);
    E.ability.classList.toggle('cooling', ab.cd > 0);
    E.ability.classList.toggle('active', !!ab.active);
    E.ability.classList.toggle('disabled', !!ab.disabled && ab.cd <= 0);
    // status + progress
    if (L.status !== st.status) { L.status = st.status; E.statusText.textContent = st.status; }
    const pr = st.progress;
    E.prog.hidden = !pr;
    if (pr) {
      if (L.pl !== pr.label) { L.pl = pr.label; E.progLabel.textContent = pr.label; }
      if (L.pc !== pr.color) { L.pc = pr.color; E.progBar.className = `pbar ${pr.color}`; }
      E.progFill.style.width = `${Math.max(0, Math.min(1, pr.value)) * 100}%`;
    }
    // skill check
    const sk = st.skill;
    E.skill.hidden = !sk;
    if (sk) {
      const k = `${sk.start}|${sk.len}`;
      if (L.sk !== k) {
        L.sk = k;
        E.skZone.setAttribute('d', this._arc(sk.start, sk.start + sk.len));
        E.skGreat.setAttribute('d', this._arc(sk.start, sk.start + sk.great));
      }
      E.skNeedle.setAttribute('transform', `rotate(${(sk.t / sk.dur) * 360})`);
    }
    // overlays (only when no post-processing)
    if (this.noPost) {
      E.fxRed.style.opacity = Math.min(1, st.terror * 0.55 + st.dmg * 0.7).toFixed(3);
      E.fxWhite.style.opacity = (st.blind * 0.95).toFixed(3);
    } else {
      E.fxRed.style.opacity = '0';
      E.fxWhite.style.opacity = '0';
    }
    // spectate
    if (st.spectating !== L.spec || st.spectateName !== L.specName) {
      L.spec = st.spectating; L.specName = st.spectateName;
      E.spectate.hidden = !st.spectating;
      E.specName.textContent = st.spectateName || '—';
      $('controls').style.visibility = st.spectating ? 'hidden' : 'visible';
    }
    this._markers(st.markers);
  }

  _markers(list) {
    const pool = this.markerPool;
    while (pool.length < list.length) {
      const d = document.createElement('div');
      d.className = 'mk';
      this.el.markers.appendChild(d);
      pool.push({ el: d, kind: '', text: '' });
    }
    for (let i = 0; i < pool.length; i++) {
      const P = pool[i], m = list[i];
      if (!m) { if (P.el.style.display !== 'none') P.el.style.display = 'none'; continue; }
      P.el.style.display = '';
      P.el.style.left = `${m.x.toFixed(0)}px`;
      P.el.style.top = `${m.y.toFixed(0)}px`;
      if (P.kind !== m.kind || P.text !== m.text) {
        P.kind = m.kind; P.text = m.text;
        P.el.className = `mk ${m.kind}`;
        const base = m.kind.split(' ')[0];
        const icon = base === 'gen' ? ICON.gear : base === 'hook' ? ICON.hook : base === 'exit' ? ICON.exit : '';
        P.el.innerHTML = base === 'ping' ? '' : `${icon}${m.text ? `<span>${m.text}</span>` : ''}`;
      }
    }
  }

  showResults(r) {
    $('resEyebrow').textContent = `${r.diff} · ${r.time}`;
    const t = $('resTitle');
    t.textContent = r.title;
    t.className = `res-title ${r.mood}`;
    $('resSub').textContent = r.sub;
    $('resList').innerHTML = r.rows.map((row) => `
      <div class="res-row"><span class="sw" style="background:${hex(row.color)}"></span>
        <div><b>${row.name}${row.you ? '<span class="tag-you">Tú</span>' : ''}</b><small>${row.role} · ${row.detail}</small></div>
        <span class="out ${row.good ? 'good' : row.outcome === 'En juego' ? 'play' : ''}">${row.outcome}</span></div>`).join('');
    $('resKiller').textContent = `${r.killer}${r.killerYou ? ' (tú)' : ''}: ${r.killerDetail}`;
    this.el.results.hidden = false;
  }
}
