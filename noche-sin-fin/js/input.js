// Controles: joystick táctil flotante, botones y teclado.
(function () {
  'use strict';
  const NSF = window.NSF;

  class Input {
    constructor() {
      this.x = 0; this.y = 0; this.mag = 0; this.walk = false;
      this.pressed = new Set();
      this.joy = { id: null, ox: 0, oy: 0 };
      this.keys = new Set();
      this.R = 56;
      this.base = document.getElementById('joybase');
      this.knob = document.getElementById('joyknob');
      this.zone = document.getElementById('joyzone');
      this.bind();
    }

    take(name) {
      if (!this.pressed.has(name)) return false;
      this.pressed.delete(name);
      return true;
    }
    clear() {
      this.pressed.clear(); this.keys.clear();
      this.x = this.y = this.mag = 0;
      this.joy.id = null;
      if (this.base) this.base.classList.remove('on');
    }

    bind() {
      const z = this.zone;
      z.addEventListener('pointerdown', (e) => {
        if (this.joy.id !== null) return;
        e.preventDefault();
        NSF.Audio.init();
        this.joy.id = e.pointerId;
        this.joy.ox = e.clientX; this.joy.oy = e.clientY;
        try { z.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
        this.base.style.left = e.clientX + 'px'; this.base.style.top = e.clientY + 'px';
        this.base.classList.add('on');
        this.moveJoy(e.clientX, e.clientY);
      });
      z.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.joy.id) return;
        e.preventDefault();
        this.moveJoy(e.clientX, e.clientY);
      });
      const end = (e) => {
        if (e.pointerId !== this.joy.id) return;
        this.joy.id = null;
        this.x = this.y = this.mag = 0;
        this.knob.style.transform = 'translate(-50%,-50%)';
        this.base.classList.remove('on');
      };
      z.addEventListener('pointerup', end);
      z.addEventListener('pointercancel', end);
      z.addEventListener('lostpointercapture', end);

      document.querySelectorAll('[data-btn]').forEach((b) => {
        const name = b.dataset.btn;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation();
          NSF.Audio.init();
          this.pressed.add(name);
          b.classList.add('down');
        });
        const up = () => b.classList.remove('down');
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });

      const map = { KeyW: 'u', ArrowUp: 'u', KeyS: 'd', ArrowDown: 'd', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
      window.addEventListener('keydown', (e) => {
        if (e.repeat && !map[e.code]) return;
        if (map[e.code]) { this.keys.add(map[e.code]); e.preventDefault(); }
        else if (e.code === 'Space' || e.code === 'Enter') { this.pressed.add('action'); e.preventDefault(); }
        else if (e.code === 'KeyE' || e.code === 'KeyQ') this.pressed.add('ability');
        else if (e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'KeyF') this.pressed.add('attack');
        else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.walk = true;
        else if (e.code === 'Escape' || e.code === 'KeyP') this.pressed.add('pause');
        NSF.Audio.init();
      });
      window.addEventListener('keyup', (e) => {
        if (map[e.code]) this.keys.delete(map[e.code]);
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.walk = false;
      });
      window.addEventListener('blur', () => this.clear());
    }

    moveJoy(px, py) {
      let dx = px - this.joy.ox, dy = py - this.joy.oy;
      const d = Math.hypot(dx, dy);
      // el joystick "sigue" al dedo si se aleja demasiado
      if (d > this.R * 1.4) {
        const k = (d - this.R * 1.4) / d;
        this.joy.ox += dx * k; this.joy.oy += dy * k;
        this.base.style.left = this.joy.ox + 'px'; this.base.style.top = this.joy.oy + 'px';
        dx = px - this.joy.ox; dy = py - this.joy.oy;
      }
      const dd = Math.hypot(dx, dy);
      const cl = Math.min(dd, this.R);
      const nx = dd > 0 ? dx / dd : 0, ny = dd > 0 ? dy / dd : 0;
      this.x = nx; this.y = ny; this.mag = cl / this.R;
      this.knob.style.transform = `translate(calc(-50% + ${nx * cl}px), calc(-50% + ${ny * cl}px))`;
    }

    poll() {
      if (this.joy.id !== null) return;
      let x = 0, y = 0;
      if (this.keys.has('l')) x -= 1;
      if (this.keys.has('r')) x += 1;
      if (this.keys.has('u')) y -= 1;
      if (this.keys.has('d')) y += 1;
      const m = Math.hypot(x, y);
      this.x = m ? x / m : 0; this.y = m ? y / m : 0; this.mag = m ? 1 : 0;
    }
  }

  NSF.Input = Input;
})();
