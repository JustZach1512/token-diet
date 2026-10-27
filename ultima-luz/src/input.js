// Touch (floating joystick + drag-to-look + buttons) and keyboard/mouse input.

export class Input {
  constructor(surface, joyEl, knobEl) {
    this.surface = surface;
    this.joyEl = joyEl;
    this.knobEl = knobEl;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookId = null;
    this.lx = 0; this.ly = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.keys = new Set();
    this.pressed = new Set();
    this.held = new Set();
    this.enabled = false;
    this.sens = 1;
    this.locked = false;
    this._bind();
  }

  _bind() {
    const s = this.surface;
    s.addEventListener('pointerdown', (e) => this._down(e));
    window.addEventListener('pointermove', (e) => this._moveP(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    window.addEventListener('pointercancel', (e) => this._up(e));
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) {
        if (k === 'KeyE' || k === 'Space') this._press('action');
        if (k === 'KeyQ') this._press('ability');
        if (k === 'KeyC' || k === 'ControlLeft') this._press('secondary');
        if (k === 'KeyF') this._press('secondary');
        if (k === 'Escape' || k === 'KeyP') this._press('pause');
      }
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'Space') this.held.delete('action');
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.surface; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked && this.enabled) { this.lookDX += e.movementX * 0.6; this.lookDY += e.movementY * 0.6; }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); this._resetJoy(); this.lookId = null; });
  }

  _press(name) { this.pressed.add(name); this.held.add(name); }

  bindButton(el, name) {
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled) return;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('down');
      this._press(name);
    };
    const up = (e) => {
      el.classList.remove('down');
      this.held.delete(name);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _down(e) {
    if (!this.enabled) return;
    const w = window.innerWidth;
    if (e.pointerType === 'mouse') {
      if (e.button === 0 && this.locked) { this._press('attack'); return; }
      if (!this.locked && this.surface.requestPointerLock && !this.noLock) {
        try {
          const p = this.surface.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch (err) { /* pointer lock unavailable */ }
      }
      this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
      return;
    }
    if (e.clientX < w * 0.45 && this.joy.id === null) {
      this.joy.id = e.pointerId;
      this.joy.ox = e.clientX; this.joy.oy = e.clientY;
      this.joy.x = 0; this.joy.y = 0;
      this.joyEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.joyEl.classList.add('on');
      this.knobEl.style.transform = 'translate(0px, 0px)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId; this.lx = e.clientX; this.ly = e.clientY;
    }
  }

  _moveP(e) {
    if (e.pointerId === this.joy.id) {
      const R = 56;
      let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.joy.x = dx / R; this.joy.y = -dy / R;
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === this.lookId && !this.locked) {
      this.lookDX += e.clientX - this.lx;
      this.lookDY += e.clientY - this.ly;
      this.lx = e.clientX; this.ly = e.clientY;
    }
  }

  _up(e) {
    if (e.pointerId === this.joy.id) this._resetJoy();
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  _resetJoy() {
    this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
    this.joyEl.classList.remove('on');
  }

  consume(name) {
    const had = this.pressed.has(name);
    this.pressed.delete(name);
    return had;
  }

  isHeld(name) { return this.held.has(name); }

  // Movement vector: x = right, y = forward. Magnitude up to 1.
  move() {
    let x = this.joy.x, y = this.joy.y;
    const K = this.keys;
    let kx = 0, ky = 0;
    if (K.has('KeyW') || K.has('ArrowUp')) ky += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) ky -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) kx += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) kx -= 1;
    if (kx || ky) {
      const m = Math.hypot(kx, ky);
      const walk = K.has('ShiftLeft') || K.has('ShiftRight');
      x = (kx / m) * (walk ? 0.5 : 1); y = (ky / m) * (walk ? 0.5 : 1);
    }
    return { x, y };
  }

  takeLook() {
    const d = { x: this.lookDX * this.sens, y: this.lookDY * this.sens };
    this.lookDX = 0; this.lookDY = 0;
    return d;
  }

  reset() {
    this.pressed.clear(); this.held.clear(); this.keys.clear();
    this._resetJoy(); this.lookId = null; this.lookDX = this.lookDY = 0;
    for (const el of document.querySelectorAll('.down')) el.classList.remove('down');
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
}
