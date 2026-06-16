/* ==========================================================================
   GLADIVS IMPERIVM  —  soldier.js
   One autonomous fighting man (or horse, or elephant). The battle is just a
   few hundred of these steering, fighting, and breaking. Behaviour is split by
   role; morale and routing are shared. Steering blends three classic forces —
   seek the enemy, hold cohesion with your unit, separate from your neighbours —
   which is what makes loose recruits scatter and disciplined ranks lock shields.
   ========================================================================== */
(function (GI) {
  'use strict';
  const U = GI.util;

  let NEXT_ID = 1;

  class Soldier {
    constructor(type, team, x, y, regiment, rng) {
      const def = GI.UNITS[type];
      this.id = NEXT_ID++;
      this.type = type;
      this.def = def;
      this.team = team;                 // 0 = Rome (player), 1 = enemy
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.hp = def.hp; this.maxHp = def.hp;
      this.morale = def.morale; this.maxMorale = def.morale;
      this.r = def.radius;
      this.facing = team === 0 ? 0 : Math.PI;
      this.speed = def.speed;
      this.mass = def.mass;
      this.cooldown = rng.range(0, def.attackRate);
      this.ammo = def.ammo != null ? def.ammo : (def.javelins ? def.ammo : 0);
      this.target = null;
      this.state = 'forming';           // forming -> advancing/fighting -> routing -> dead
      this.dead = false;
      this.regiment = regiment;
      this.slotX = 0; this.slotY = 0;   // formation slot (set by regiment)
      this.variant = rng.int(0, 2);
      this.spriteScale = rng.range(0.92, 1.08);
      this.phase = (this.id % 12);      // staggers expensive work across ticks
      this.retargetT = rng.range(0, 0.3);
      this.flashT = 0;                  // attack swing animation
      this.hurtT = 0;                   // wound flash
      this.auraT = rng.range(0, 0.5);
      this.chargeReady = !!def.mounted || !!def.charge;
      this.rallyT = 0;
      this.panicRampage = false;
    }

    // ---- main per-tick update -------------------------------------------
    update(dt, B) {
      if (this.dead) return;
      this.flashT = Math.max(0, this.flashT - dt);
      this.hurtT = Math.max(0, this.hurtT - dt);
      this.cooldown -= dt;

      if (this.state === 'forming') { this._formUp(dt); return; }   // integrate runs in a 2nd pass

      // retarget on a stagger, or if current target is gone
      this.retargetT -= dt;
      if (this.retargetT <= 0 || !this.target || this.target.dead) {
        this.retargetT = 0.22 + (this.phase * 0.01);
        this._acquire(B);
      }

      // auras tick on their own cadence
      if (this.def.aura) { this.auraT -= dt; if (this.auraT <= 0) { this.auraT = 0.4; this._aura(B); } }

      this._moraleTick(dt, B);

      if (this.state === 'routing') this._route(dt, B);
      else if (this.def.role === 'beast') this._beast(dt, B);
      else if (this.def.role === 'cavalry') this._cavalry(dt, B);
      else if (this.def.role === 'ranged') this._ranged(dt, B);
      else if (this.def.role === 'support' && this.def.aura && this.def.aura.type === 'heal') this._medic(dt, B);
      else this._melee(dt, B);

      this._separate(dt, B);
      // movement is applied in battle's second pass (integrate) so that every
      // soldier this tick steers from the same snapshot — no update-order drift
    }

    // ---- targeting -------------------------------------------------------
    _acquire(B) {
      let best = null, bestD = Infinity;
      const range = this.def.range ? this.def.range * 1.2 : 260;
      B.grid.query(this.x, this.y, range, (s) => {
        if (s.team === this.team || s.dead) return;
        let d = U.dist2(this.x, this.y, s.x, s.y);
        if (s.state === 'routing') d *= 0.6;           // chase the kill; mild
        // Fuzz the "nearest" choice. Men engage whoever is in front of them,
        // not the mathematically closest foe — and this keeps targeting free of
        // the grid's insertion-order tie bias, so a mirror match stays fair.
        d *= 0.78 + 0.44 * B.rng();
        if (d < bestD) { bestD = d; best = s; }
      });
      this.target = best;
    }

    // ---- steering helpers ------------------------------------------------
    _seek(tx, ty, weight) {
      const a = U.angleTo(this.x, this.y, tx, ty);
      this.vx += Math.cos(a) * this.speed * weight;
      this.vy += Math.sin(a) * this.speed * weight;
    }
    _separate(dt, B) {
      let sx = 0, sy = 0;
      const rad = this.r * 2.4;
      B.grid.query(this.x, this.y, rad, (o) => {
        if (o === this || o.dead) return;
        const dx = this.x - o.x, dy = this.y - o.y;
        const d2 = dx * dx + dy * dy;
        const min = (this.r + o.r);
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / min;
          // heavier bodies shove lighter ones; enemies resist each other
          const w = (o.mass / (this.mass + o.mass)) * (o.team === this.team ? 1 : 0.55);
          sx += (dx / d) * push * w;
          sy += (dy / d) * push * w;
        }
      });
      this.vx += sx * 120;
      this.vy += sy * 120;
    }
    _cohesion(weight) {
      // pull toward formation slot so ranks stay dressed before contact
      const reg = this.regiment;
      if (!reg || reg.broken) return;
      const c = reg.cohesion();
      const tx = c.x + this.slotX, ty = c.y + this.slotY;
      const a = U.angleTo(this.x, this.y, tx, ty);
      const d = U.dist(this.x, this.y, tx, ty);
      const k = Math.min(1, d / 40);
      this.vx += Math.cos(a) * this.speed * weight * k;
      this.vy += Math.sin(a) * this.speed * weight * k;
    }

    // ---- behaviours ------------------------------------------------------
    _melee(dt, B) {
      const t = this.target;
      if (t) {
        const d = U.dist(this.x, this.y, t.x, t.y);
        const reach = this.r + t.r + this.def.reach;
        this.facing = U.angleTo(this.x, this.y, t.x, t.y);
        if (d <= reach) {
          if (this.def.charge && this.chargeReady) {
            if (Math.hypot(this.vx, this.vy) > this.speed * 0.45) this._meleeCharge(t, B);
            this.chargeReady = false;          // one charge per engagement
          }
          this._attack(t, B);                  // in contact: stand and fight
          this.vx *= 0.4; this.vy *= 0.4;
        } else {
          if (d > reach + 28) this.chargeReady = true;
          this._seek(t.x, t.y, 1.0);
          this._cohesion(0.25 * this.def.cohesion);
        }
      } else {
        this._advance(B);
      }
    }
    _meleeCharge(t, B) {
      let dmg = this.def.charge;
      if (t.def.spear || t.def.antiCav) dmg *= 0.5;   // braced points blunt the rush
      B.damage(t, dmg, this, { charge: true });
      B.particles.dust(t.x, t.y);
      B.audio.thud(0.3);
    }

    _ranged(dt, B) {
      const t = this.target;
      const def = this.def;
      const haveAmmo = this.ammo > 0 || def.ammo === Infinity || def.ammo == null && def.range;
      if (t && haveAmmo) {
        const d = U.dist(this.x, this.y, t.x, t.y);
        this.facing = U.angleTo(this.x, this.y, t.x, t.y);
        if (def.kite && d < def.range * 0.45) {
          // skirmish: back away from the threat while it's close
          this._seek(t.x, t.y, -0.9);
          this._cohesion(0.2);
        } else if (d > def.range) {
          this._seek(t.x, t.y, 0.8);
        } else {
          this.vx *= 0.6; this.vy *= 0.6;
          this._shoot(t, B);
        }
      } else {
        // out of javelins or no target → behave like light infantry
        if (t) this._melee(dt, B); else this._advance(B);
      }
    }

    _cavalry(dt, B) {
      const t = this.target;
      const def = this.def;
      if (def.javelins && this.ammo > 0 && t) {
        // Numidian harass: ride to javelin range, throw, keep distance
        const d = U.dist(this.x, this.y, t.x, t.y);
        this.facing = U.angleTo(this.x, this.y, t.x, t.y);
        if (d < def.range * 0.6) this._seek(t.x, t.y, -0.8);
        else if (d > def.range) this._seek(t.x, t.y, 0.9);
        else { this.vx *= 0.7; this.vy *= 0.7; this._shoot(t, B); }
        return;
      }
      if (t) {
        const d = U.dist(this.x, this.y, t.x, t.y);
        const reach = this.r + t.r + def.reach;
        this.facing = U.angleTo(this.x, this.y, t.x, t.y);
        const speed2 = this.vx * this.vx + this.vy * this.vy;
        if (d <= reach) {
          if (this.chargeReady && speed2 > (this.speed * 0.5) ** 2) {
            this._chargeHit(t, B);
            this.chargeReady = false;
          }
          this._attack(t, B);
          this.vx *= 0.6; this.vy *= 0.6;
        } else {
          if (d > reach + 30) this.chargeReady = true; // reset for next pass
          this._seek(t.x, t.y, 1.2);
          if (Math.random() < 0.3) B.particles.dust(this.x - Math.cos(this.facing) * 8, this.y - Math.sin(this.facing) * 8);
        }
      } else this._advance(B);
    }

    _beast(dt, B) {
      const def = this.def;
      if (this.panicRampage) {
        // frightened elephant: barrel straight, trampling friend and foe
        this._seekDir(this._rageDir, 1.0);
        this._trample(B, true);
        return;
      }
      const t = this.target;
      if (t) {
        this.facing = U.angleTo(this.x, this.y, t.x, t.y);
        const d = U.dist(this.x, this.y, t.x, t.y);
        if (d <= this.r + t.r + def.reach) { this._attack(t, B); }
        this._seek(t.x, t.y, 1.0);
      } else this._advance(B);
      this._trample(B, false);
    }

    _medic(dt, B) {
      // hang just behind the friendly front; the aura does the healing
      const reg = this.regiment;
      const front = B.frontline(this.team);
      const homeX = this.team === 0 ? front - 70 : front + 70;
      this._seek(homeX, this.y, 0.6);
      if (reg && !reg.broken) this._cohesion(0.4);
      // edge away from any nearby enemy
      const t = this.target;
      if (t && U.dist(this.x, this.y, t.x, t.y) < 80) this._seek(t.x, t.y, -0.8);
    }

    _advance(B) {
      // no target in sight: march toward the enemy mass, holding ranks
      const cx = B.enemyCentroid(this.team);
      this.facing = U.approach(this.facing, U.angleTo(this.x, this.y, cx.x, cx.y), 0.1);
      this._seek(cx.x, cx.y, 0.85);
      this._cohesion(0.4 * this.def.cohesion);
    }
    _seekDir(ang, w) { this.vx += Math.cos(ang) * this.speed * w; this.vy += Math.sin(ang) * this.speed * w; }

    // ---- combat ----------------------------------------------------------
    _attack(t, B) {
      if (this.cooldown > 0) return;
      this.cooldown = this.def.attackRate;
      this.flashT = 0.18;
      let dmg = this.def.attack;
      // anti-cavalry spears
      if (this.def.antiCav && t.def.mounted) dmg *= this.def.antiCav;
      // flank / rear bonus: hitting a foe whose facing points away from us.
      // Kept modest so positioning matters without letting a loose swarm
      // simply envelop and erase a disciplined line that out-fights it.
      const toMe = U.angleTo(t.x, t.y, this.x, this.y);
      const fa = Math.abs(U.angleDiff(t.facing, toMe));
      if (fa > 2.4) dmg *= 1.35; else if (fa > 1.5) dmg *= 1.12;
      if (this.def.frenzy && this.hp < this.maxHp * 0.5) dmg *= 1.3; // berserk
      B.damage(t, dmg, this);
      B.particles.spark((this.x + t.x) / 2, (this.y + t.y) / 2);
      B.audio.clash(0.2);
    }

    _chargeHit(t, B) {
      const speed = Math.hypot(this.vx, this.vy);
      const power = this.def.charge * (0.4 + speed / this.speed * 0.6);
      let dmg = power;
      if (t.def.antiCav || t.def.spear) dmg *= 0.45;     // braced spears blunt it
      B.damage(t, dmg, this, { charge: true });
      // knockback radiating from impact
      const a = U.angleTo(this.x, this.y, t.x, t.y);
      B.grid.query(t.x, t.y, 34, (o) => {
        if (o.team === this.team || o.dead) return;
        const kb = (1 - U.dist(t.x, t.y, o.x, o.y) / 34) * 160 / o.mass;
        if (kb > 0) { o.vx += Math.cos(a) * kb; o.vy += Math.sin(a) * kb; o.hurtT = 0.2; o.morale -= 6; }
      });
      B.cam && B.cam.shake(this.def.role === 'beast' ? 6 : 3, 0.25);
      B.particles.dust(t.x, t.y); B.particles.dust(t.x, t.y);
      B.audio.thud(0.5);
    }

    _trample(B, includeFriendly) {
      // anything directly in front of a moving elephant gets bowled over
      const ahead = 6;
      const fx = this.x + Math.cos(this.facing) * ahead;
      const fy = this.y + Math.sin(this.facing) * ahead;
      B.grid.query(fx, fy, this.r + 6, (o) => {
        if (o === this || o.dead) return;
        if (!includeFriendly && o.team === this.team) return;
        const d = U.dist(fx, fy, o.x, o.y);
        if (d < this.r + o.r) {
          const a = U.angleTo(this.x, this.y, o.x, o.y);
          o.vx += Math.cos(a) * 220 / o.mass;
          o.vy += Math.sin(a) * 220 / o.mass;
          if (this.cooldown <= 0) { B.damage(o, this.def.attack * 0.5, this); o.morale -= 14; }
        }
      });
      if (this.cooldown <= 0) this.cooldown = 0.25;
    }

    _shoot(t, B) {
      if (this.cooldown > 0) return;
      this.cooldown = this.def.attackRate;
      this.flashT = 0.15;
      // lead the target slightly
      const lead = U.dist(this.x, this.y, t.x, t.y) / this.def.projSpeed;
      const tx = t.x + t.vx * lead, ty = t.y + t.vy * lead;
      B.projectiles.spawn(this.x, this.y, tx, ty, this.team, this.def.projDmg, this.def.projType, this.def.projSpeed);
      if (this.def.ammo !== Infinity) this.ammo--;
      if (this.def.projType === 'arrow') B.audio.bow(); else B.audio.bow();
    }

    // ---- morale ----------------------------------------------------------
    _moraleTick(dt, B) {
      const def = this.def;
      if (def.frenzy || def.panic) { this.morale = this.maxMorale; return; } // fearless: never rout
      // gentle recovery toward a steady baseline when a man is left unpressed
      this.morale = U.approach(this.morale, this.maxMorale * 0.9, def.resolve * 4 * dt);
      if (this.state !== 'routing') {
        // The truest break comes from watching your own formation get butchered.
        // A unit that has lost roughly half its number begins to come apart —
        // which makes the side that is winning the casualty trade rout the other
        // first, and walk away with survivors. Decisive, and tied to who's winning.
        const reg = this.regiment;
        if (reg && reg.startSize) {
          const frac = reg.alive / reg.startSize;
          if (frac < 0.5) this.morale -= (0.5 - frac) * 38 * dt;
        }
        // local pressure: being outnumbered hand-to-hand, and one's own wounds
        let foes = 0, friends = 0;
        B.grid.query(this.x, this.y, 48, (o) => {
          if (o.dead) return;
          if (o.team === this.team) friends++; else foes++;
        });
        if (foes > friends) this.morale -= (foes - friends) * 1.1 * dt;
        if (this.hp < this.maxHp * 0.3) this.morale -= 3 * dt;
      }
      // break / rally thresholds with hysteresis
      if (this.state !== 'routing' && this.morale <= 0) {
        this.state = 'routing'; this.target = null; this.rallyT = 0;
        if (this.regiment) this.regiment.broken = true;
        B.audio.roar(0.15);
      } else if (this.state === 'routing') {
        this.rallyT += dt;
        if (this.morale > this.maxMorale * 0.5 && this.rallyT > 2.0) this.state = 'advancing';
      }
    }

    _route(dt, B) {
      // flee toward home edge; faster and clumsier than a fighting man
      const homeX = this.team === 0 ? B.bounds.x0 - 60 : B.bounds.x1 + 60;
      this.facing = U.angleTo(this.x, this.y, homeX, this.y);
      this.vx += Math.cos(this.facing) * this.speed * 1.25;
      this.vy += Math.sin(this.facing) * this.speed * 1.25 + (Math.random() - 0.5) * 20;
    }

    _aura(B) {
      const a = this.def.aura;
      B.grid.query(this.x, this.y, a.radius, (o) => {
        if (o.team !== this.team || o.dead || o === this) return;
        if (U.dist(this.x, this.y, o.x, o.y) > a.radius) return;
        if (a.type === 'heal') {
          if (o.hp < o.maxHp) {
            o.hp = Math.min(o.maxHp, o.hp + a.power * 0.4);
            if (Math.random() < 0.3) B.particles.mote(o.x, o.y, '#e9d27a');
          }
        } else if (a.type === 'morale') {
          o.morale = Math.min(o.maxMorale, o.morale + a.power * 0.4);
          if (o.state === 'routing' && o.morale > o.maxMorale * 0.4) { o.state = 'advancing'; }
          if (Math.random() < 0.05) B.particles.mote(o.x, o.y, '#d7c07a');
        }
      });
    }

    // ---- physics integration --------------------------------------------
    _formUp(dt) {
      const reg = this.regiment;
      if (!reg) return;
      const tx = reg.anchorX + this.slotX, ty = reg.anchorY + this.slotY;
      const a = U.angleTo(this.x, this.y, tx, ty);
      const d = U.dist(this.x, this.y, tx, ty);
      if (d > 1) { this.vx += Math.cos(a) * this.speed * 1.5; this.vy += Math.sin(a) * this.speed * 1.5; }
      this.facing = reg.facing;
    }

    _integrate(dt, B) {
      // cap to top speed, apply, then heavy friction (mass-like damping)
      const max = this.speed * (this.state === 'routing' ? 1.3 : 1.05);
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > max) { const k = max / sp; this.vx *= k; this.vy *= k; }
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.78; this.vy *= 0.78;
      // battlefield bounds (routers may run off the relevant edge to escape)
      const b = B.bounds;
      if (this.state !== 'routing') {
        if (this.x < b.x0) { this.x = b.x0; this.vx = 0; }
        if (this.x > b.x1) { this.x = b.x1; this.vx = 0; }
      }
      if (this.y < b.y0) { this.y = b.y0; this.vy = Math.abs(this.vy) * 0.3; }
      if (this.y > b.y1) { this.y = b.y1; this.vy = -Math.abs(this.vy) * 0.3; }
    }
  }

  GI.Soldier = Soldier;
})(window.GI = window.GI || {});
