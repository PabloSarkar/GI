/* ==========================================================================
   GLADIVS IMPERIVM  —  battle.js
   The simulation engine. Owns every soldier, the spatial grid, projectiles
   and particles. Each tick it rebuilds the grid, refreshes the cached per-team
   centroids/frontlines the AI reads, steps every agent, resolves death and the
   morale shockwaves that ripple out from it, and watches for a decision.
   ========================================================================== */
(function (GI) {
  'use strict';
  const U = GI.util;

  // One placed formation. Tracks its living members so cohesion and "is this
  // unit broken" stay cheap.
  class Regiment {
    constructor(team, type, anchorX, anchorY, facing) {
      this.team = team; this.type = type; this.def = GI.UNITS[type];
      this.anchorX = anchorX; this.anchorY = anchorY; this.facing = facing;
      this.soldiers = [];
      this.alive = 0;
      this.broken = false;
      this._cx = anchorX; this._cy = anchorY; this._stamp = -1;
    }
    add(s) { s.regiment = this; this.soldiers.push(s); this.alive++; }
    cohesion() {
      // recompute the living centroid at most once per sim tick
      if (this._stamp === this._battle.stamp) return { x: this._cx, y: this._cy };
      let x = 0, y = 0, n = 0;
      for (const s of this.soldiers) if (!s.dead) { x += s.x; y += s.y; n++; }
      if (n > 0) { this._cx = x / n; this._cy = y / n; }
      this._stamp = this._battle.stamp;
      return { x: this._cx, y: this._cy };
    }
  }

  const CFG = {
    gridCell: 48,
    bounds: { x0: -900, y0: -480, x1: 900, y1: 480 },
    decideDelay: 2.0,     // seconds a side must have no fighters before it loses
    timeLimit: 150        // stalemate fallback
  };

  class Battle {
    constructor(audio, cam) {
      this.audio = audio;
      this.cam = cam;
      this.bounds = Object.assign({}, CFG.bounds);
      this.grid = new U.SpatialGrid(CFG.gridCell);
      this.soldiers = [];
      this.regiments = [];
      this.projectiles = new GI.Projectiles(this);
      this.particles = new GI.Particles(this);
      this.stamp = 0;
      this.time = 0;
      this._pending = [];        // deaths deferred to end of tick (fair ordering)
      this.over = false;
      this.result = null;       // 'win' | 'lose' | 'draw'
      this.kills = [0, 0];      // kills BY team 0, team 1
      this.startCount = [0, 0];
      this.rng = U.makeRNG(12345);
      this._noFighter = [0, 0];
      this._centroid = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
      this._front = [0, 0];
      this._drumT = 0;
      this.started = false;
    }

    reset(seed) {
      this.rng = U.makeRNG(seed >>> 0);
      this.soldiers.length = 0;
      this.regiments.length = 0;
      this.projectiles.list.length = 0;
      this.particles.list.length = 0;
      this.particles.decals.length = 0;
      this.time = 0; this.over = false; this.result = null;
      this.kills = [0, 0]; this.startCount = [0, 0];
      this._pending = [];
      this._noFighter = [0, 0]; this.started = false;
    }

    // Build a rectangular formation of `count` soldiers, rows facing the enemy.
    addRegiment(type, team, cx, cy, cols, rows, spacing) {
      const def = GI.UNITS[type];
      spacing = spacing || (def.radius * 2.2 + 2);
      const facing = team === 0 ? 0 : Math.PI;
      const reg = new Regiment(team, type, cx, cy, facing);
      reg._battle = this;
      const w = (cols - 1) * spacing, h = (rows - 1) * spacing;
      let placed = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ox = -w / 2 + c * spacing;
          const oy = -h / 2 + r * spacing;
          const s = new GI.Soldier(type, team, cx + ox, cy + oy, reg, this.rng);
          // formation slot is a WORLD-space offset from the unit's centre, so it
          // must match where the man was placed (cx+ox) for BOTH teams. Mirroring
          // it for team 1 made enemy ranks implode through their own centre.
          s.slotX = ox;
          s.slotY = oy;
          s.facing = facing;
          this.soldiers.push(s);
          reg.add(s);
          placed++;
        }
      }
      reg.startSize = placed;
      this.regiments.push(reg);
      this.startCount[team] += placed;
      return reg;
    }

    begin() {
      this.started = true;
      for (const s of this.soldiers) s.state = 'advancing';
      this.audio.horn(104);
    }

    // Remove a (still-deploying) formation and its men — used to disband.
    removeRegiment(reg) {
      const set = new Set(reg.soldiers);
      for (const s of reg.soldiers) s.dead = true;
      let w = 0;
      for (let i = 0; i < this.soldiers.length; i++) {
        if (!set.has(this.soldiers[i])) this.soldiers[w++] = this.soldiers[i];
      }
      this.soldiers.length = w;
      const ri = this.regiments.indexOf(reg);
      if (ri >= 0) this.regiments.splice(ri, 1);
      this.startCount[reg.team] = Math.max(0, this.startCount[reg.team] - reg.soldiers.length);
    }

    // ---- queries the AI relies on (cached per tick) ----------------------
    enemyCentroid(team) { return this._centroid[team ^ 1]; }
    centroid(team) { return this._centroid[team]; }
    frontline(team) { return this._front[team]; }

    _recompute() {
      const sum = [{ x: 0, y: 0, n: 0 }, { x: 0, y: 0, n: 0 }];
      let front0 = -Infinity, front1 = Infinity;
      for (const s of this.soldiers) {
        if (s.dead || s.state === 'routing') continue;
        const t = s.team;
        sum[t].x += s.x; sum[t].y += s.y; sum[t].n++;
        if (t === 0 && s.x > front0) front0 = s.x;
        if (t === 1 && s.x < front1) front1 = s.x;
      }
      for (let t = 0; t < 2; t++) {
        if (sum[t].n > 0) this._centroid[t] = { x: sum[t].x / sum[t].n, y: sum[t].y / sum[t].n };
      }
      this._front[0] = front0 === -Infinity ? this.bounds.x0 : front0;
      this._front[1] = front1 === Infinity ? this.bounds.x1 : front1;
      return sum;
    }

    // ---- the tick --------------------------------------------------------
    step(dt) {
      if (this.over) return;
      this.stamp++;
      this.time += dt;
      this.audio.frameReset();

      // rebuild spatial grid over the living
      this.grid.clear();
      for (const s of this.soldiers) if (!s.dead) this.grid.insert(s);

      const sums = this._recompute();

      // marching drum cadence once the lines are closing
      if (this.started) {
        this._drumT -= dt;
        if (this._drumT <= 0) { this.audio.drum(); this._drumT = 1.05; }
      }

      // Alternate iteration direction each tick. Updating in a fixed order
      // hands whoever-acts-first a killing-blow advantage every tick, which
      // compounds into a systematic bias (a mirror match must be a coin-flip).
      const arr = this.soldiers;
      if (this.stamp & 1) { for (let i = arr.length - 1; i >= 0; i--) if (!arr[i].dead) arr[i].update(dt, this); }
      else { for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[i].update(dt, this); }
      // second pass: everyone moves at once, from forces computed on the same
      // tick-start snapshot. This is what keeps a mirror match a true coin-flip.
      for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[i]._integrate(dt, this);

      this.projectiles.update(dt, this.grid);

      // apply deferred deaths now that every living man has had his turn
      if (this._pending.length) {
        for (let i = 0; i < this._pending.length; i++) this.kill(this._pending[i].t, this._pending[i].a);
        this._pending.length = 0;
      }

      this.particles.update(dt);

      // sweep out the dead so the array stays tight
      if (this.stamp % 8 === 0) {
        let w = 0;
        for (let i = 0; i < this.soldiers.length; i++) {
          if (!this.soldiers[i].dead) this.soldiers[w++] = this.soldiers[i];
        }
        this.soldiers.length = w;
      }

      if (this.started) this._checkDecision(sums, dt);
    }

    _checkDecision(sums, dt) {
      // a "fighter" is a living soldier not currently routing
      for (let t = 0; t < 2; t++) {
        if (sums[t].n === 0) this._noFighter[t] += dt; else this._noFighter[t] = 0;
      }
      if (this._noFighter[1] >= CFG.decideDelay && this._noFighter[0] < CFG.decideDelay) this._end('win');
      else if (this._noFighter[0] >= CFG.decideDelay && this._noFighter[1] < CFG.decideDelay) this._end('lose');
      else if (this._noFighter[0] >= CFG.decideDelay && this._noFighter[1] >= CFG.decideDelay) this._end('draw');
      else if (this.time >= CFG.timeLimit) {
        // stalemate → whoever kept more of their army wins
        const f0 = this.living(0) / Math.max(1, this.startCount[0]);
        const f1 = this.living(1) / Math.max(1, this.startCount[1]);
        this._end(f0 >= f1 ? 'win' : 'lose');
      }
    }
    _end(result) {
      this.over = true; this.result = result;
      if (result === 'win') this.audio.victory();
      else if (result === 'lose') this.audio.defeat();
    }

    // ---- damage / death --------------------------------------------------
    damage(t, dmg, attacker, opts) {
      if (t.dead) return;
      const applied = dmg * (1 - t.def.defense);
      t.hp -= applied;
      t.hurtT = 0.2;
      t.morale -= applied * 0.06 + (opts && opts.charge ? 8 : 0);
      if (attacker && (!t.target || t.target.dead) && t.def.role !== 'support') t.target = attacker;
      this.particles.blood(t.x, t.y);
      // a wounded elephant may panic — and a panicked elephant is your best ally.
      // The hurt it takes (especially from a charge) raises the chance each hit,
      // so steady missile fire is the way to break the beasts.
      if (t.def.panic && !t.panicRampage) {
        const frac = t.hp / t.maxHp;
        let chance = (opts && opts.charge) ? 0.5 : 0;
        if (frac < 0.7) chance += (0.7 - frac) * 0.09;     // grows as it bleeds
        if (this.rng() < chance) {
          t.panicRampage = true;
          t._rageDir = (t.team === 0 ? Math.PI : 0) + (this.rng() - 0.5) * 0.8; // bolt home, trampling its own
          this.audio.trumpet();
          if (this.cam) this.cam.shake(7, 0.4);
        }
      }
      // defer the kill to end of tick so a man struck down still strikes back
      // this tick — mutual destruction is then symmetric and update-order-free
      if (t.hp <= 0 && !t._pending) { t._pending = true; this._pending.push({ t: t, a: attacker }); }
    }

    kill(t, attacker) {
      if (t.dead) return;
      t.dead = true; t.state = 'dead'; t.hp = 0;
      this.particles.corpse(t);
      this.particles.blood(t.x, t.y, attacker ? U.angleTo(attacker.x, attacker.y, t.x, t.y) : 0);
      if (t.regiment) t.regiment.alive--;
      if (attacker) this.kills[attacker.team]++;
      // morale shockwave: the victim's comrades waver, the killers take heart
      this.grid.query(t.x, t.y, 52, (o) => {
        if (o.dead || o === t) return;
        if (o.team === t.team) o.morale -= 3; else o.morale += 2;
      });
      if (attacker && attacker.def.mounted) attacker.morale = Math.min(attacker.maxMorale, attacker.morale + 3);
    }

    // ---- tallies for the HUD --------------------------------------------
    living(team) { let n = 0; for (const s of this.soldiers) if (!s.dead && s.team === team) n++; return n; }
    fighting(team) { let n = 0; for (const s of this.soldiers) if (!s.dead && s.team === team && s.state !== 'routing') n++; return n; }
    strength(team) {
      let hp = 0, max = 0;
      for (const s of this.soldiers) if (s.team === team) { if (!s.dead) hp += s.hp; }
      // normalise against starting roster hp for a stable bar
      return { hp, count: this.living(team), start: this.startCount[team] };
    }
  }

  GI.Battle = Battle;
  GI.Regiment = Regiment;
  GI.BATTLE_CFG = CFG;
})(window.GI = window.GI || {});
