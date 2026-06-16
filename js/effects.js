/* ==========================================================================
   GLADIVS IMPERIVM  —  effects.js
   Projectiles (arrows / javelins / pila) and a pooled particle system
   (blood, dust, sparks, dropped shafts, drifting morale motes). Kept as flat
   object arrays with hand-rolled updates — at battle scale this matters.
   ========================================================================== */
(function (GI) {
  'use strict';
  const U = GI.util;

  class Projectiles {
    constructor(battle) { this.battle = battle; this.list = []; }
    spawn(x, y, tx, ty, team, dmg, kind, speed) {
      const ang = U.angleTo(x, y, tx, ty);
      const v = speed || 460;
      this.list.push({
        x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
        team, dmg, kind, life: 2.2, ang,
        z: 0, vz: 38 + Math.random() * 22       // little vertical arc for looks
      });
    }
    update(dt, grid) {
      const b = this.battle;
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.z += p.vz * dt; p.vz -= 120 * dt;       // arc rise/fall (cosmetic)
        p.life -= dt;
        let dead = p.life <= 0;
        if (!dead) {
          // hit test against enemies near the head of the shaft
          let hit = null, best = 999;
          grid.query(p.x, p.y, 16, (s) => {
            if (s.team === p.team || s.dead) return;
            const d = U.dist2(p.x, p.y, s.x, s.y);
            const rr = (s.r + 4) * (s.r + 4);
            if (d < rr && d < best) { best = d; hit = s; }
          });
          if (hit) {
            b.damage(hit, p.dmg, null, { ranged: true });
            b.particles.blood(p.x, p.y, p.ang);
            dead = true;
          }
        }
        if (p.x < b.bounds.x0 - 40 || p.x > b.bounds.x1 + 40 ||
            p.y < b.bounds.y0 - 40 || p.y > b.bounds.y1 + 40) dead = true;
        if (dead) {
          if (p.life <= 0 || p.z <= 0) b.particles.shaft(p.x, p.y, p.ang, p.kind);
          this.list.splice(i, 1);
        }
      }
    }
  }

  class Particles {
    constructor() { this.list = []; this.decals = []; }
    _push(o) { if (this.list.length < 2600) this.list.push(o); }

    blood(x, y, ang) {
      const n = 4 + (Math.random() * 4 | 0);
      for (let i = 0; i < n; i++) {
        const a = (ang || Math.random() * U.TAU) + (Math.random() - 0.5) * 1.6;
        const sp = 30 + Math.random() * 90;
        this._push({ k: 'blood', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.5 + Math.random() * 0.5, max: 1, r: 0.8 + Math.random() * 1.6, settled: false });
      }
    }
    dust(x, y) {
      this._push({ k: 'dust', x, y, vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.5) * 16,
        life: 0.6 + Math.random() * 0.6, max: 1.2, r: 3 + Math.random() * 4 });
    }
    spark(x, y) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * U.TAU, sp = 40 + Math.random() * 60;
        this._push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.18 + Math.random() * 0.12, max: 0.3, r: 0.7 + Math.random() });
      }
    }
    shaft(x, y, ang, kind) {
      if (this.decals.length > 1400) this.decals.shift();
      this.decals.push({ k: 'shaft', x, y, ang: ang || 0, kind: kind || 'arrow', t: 1 });
    }
    mote(x, y, color) {
      this._push({ k: 'mote', x, y, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 14,
        life: 0.7, max: 0.7, r: 1.4, color });
    }
    corpse(s) {
      if (this.decals.length > 1400) this.decals.shift();
      this.decals.push({ k: 'corpse', type: s.type, x: s.x, y: s.y, facing: s.facing,
        variant: s.variant, scale: s.spriteScale || 1, t: 1 });
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) { this.list.splice(i, 1); continue; }
        if (p.k === 'blood') {
          if (!p.settled) {
            p.x += p.vx * dt; p.y += p.vy * dt;
            p.vx *= 0.9; p.vy *= 0.9;
            if (p.life < 0.25) { p.settled = true; this._dropStain(p); }
          }
        } else if (p.k === 'dust') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.r += 8 * dt;
        } else if (p.k === 'spark') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.86; p.vy *= 0.86;
        } else if (p.k === 'mote') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 6 * dt;
        }
      }
    }
    _dropStain(p) {
      if (this.decals.length > 1400) this.decals.shift();
      this.decals.push({ k: 'stain', x: p.x, y: p.y, r: 2 + Math.random() * 3, t: 1 });
    }
  }

  GI.Projectiles = Projectiles;
  GI.Particles = Particles;
})(window.GI = window.GI || {});
