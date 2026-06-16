/* ==========================================================================
   GLADIVS IMPERIVM  —  game.js
   The state machine and main loop. Owns the camera, renderer and battle, and
   drives the two-phase flow Winter Falling is built on: a deployment phase
   where you spend denarii arraying formations (drag to draw a block), then a
   pausable, speed-controlled physics battle, then a result. Campaign progress
   persists to localStorage.
   ========================================================================== */
(function (GI) {
  'use strict';
  const U = GI.util;

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.cam = new U.Camera({ w: window.innerWidth, h: window.innerHeight });
      this.renderer = new GI.Renderer(this.canvas, this.cam);
      this.audio = GI.audio;
      this.battle = new GI.Battle(this.audio, this.cam);
      this.ui = null;                 // set by main

      this.phase = 'title';           // title | menu | sandbox | deploy | battle | result
      this.levelIndex = 0;
      this.level = null;
      this.custom = false;
      this.budget = 0; this.spent = 0;
      this.selectedType = null;       // place-mode unit (null = select/pan mode)
      this.selection = null;          // selected placed regiment
      this.ghost = null;
      this.speed = 2; this.paused = false;
      this.seed = 1;
      this.deployment = [];           // snapshot for restart/redeploy

      this.completed = this._loadProgress();
      this._acc = 0; this._last = 0; this._fixed = 1 / 60;
      this._resultShown = false;

      this._initInput();
      window.addEventListener('resize', () => this.renderer.resize());
    }

    // ----- lifecycle ------------------------------------------------------
    start() {
      GI.sprites.buildAll();
      this._last = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    _loop(t) {
      const dt = Math.min(0.05, (t - this._last) / 1000) || 0;
      this._last = t;
      this.cam.update(dt);

      if (this.phase === 'battle' && !this.paused && !this.battle.over) {
        for (let i = 0; i < this.speed; i++) this.battle.step(this._fixed);
        if (this.battle.over && !this._resultShown) this._onBattleEnd();
      }
      // gentle idle drift of forming troops in deploy so it feels alive
      if (this.phase === 'deploy') {
        for (const s of this.battle.soldiers) { s.update(this._fixed, this.battle); s._integrate(this._fixed, this.battle); }
      }

      if (this.phase === 'deploy' || this.phase === 'battle' || this.phase === 'result') {
        this.renderer.render(this.battle, this);
      }
      if (this.ui) this.ui.frame();
      requestAnimationFrame((tt) => this._loop(tt));
    }

    // ----- level setup ----------------------------------------------------
    loadLevel(index) {
      this.custom = false;
      this.levelIndex = index;
      this.level = GI.LEVELS[index];
      this._setupBattlefield(this.level.enemy, this.level.budget, this.level.id);
      this.ui.enterDeploy(this.level);
    }
    loadCustom(config) {
      this.custom = true;
      this.level = { id: 'custom', name: 'Custom Battle', place: 'A field of your choosing',
        brief: 'Defeat the host you have summoned.', hint: 'Combined arms wins battles.',
        budget: config.budget, enemy: config.enemy };
      this._setupBattlefield(config.enemy, config.budget, (Math.random() * 1e9) | 0);
      this.ui.enterDeploy(this.level);
    }

    _setupBattlefield(enemy, budget, seed) {
      this.seed = (seed * 2654435761) >>> 0 || 1;
      this.battle.reset(this.seed);
      this.renderer.buildTerrain(this.battle.bounds, this.seed);
      // enemy host (visible during deployment, in 'forming' state)
      for (const b of enemy) {
        const reg = this.battle.addRegiment(b.type, 1, b.x, b.y, b.cols, b.rows, b.spacing);
        reg.cols = b.cols; reg.rows = b.rows;
      }
      this.budget = budget; this.spent = 0;
      this.selectedType = null; this.selection = null; this.ghost = null;
      this.deployment = [];
      this.phase = 'deploy';
      this.paused = false; this._resultShown = false;
      this._fitCamera();
    }

    // Deploy view frames your whole zone and the foe; battle view glides in
    // closer so the clash — and the men in it — read clearly.
    _deployView() { return { x: -90, y: 0, zoom: U.clamp(Math.min(this.cam.view.w / 1600, this.cam.view.h / 1040), 0.46, 1.4) }; }
    _battleView() { return { x: -20, y: 0, zoom: U.clamp(this.cam.view.w / 1180, 0.7, 1.5) }; }
    _fitCamera() {
      const b = this.battle.bounds;
      this.cam.bounds = { minX: b.x0 - 200, minY: b.y0 - 200, maxX: b.x1 + 200, maxY: b.y1 + 200 };
      const v = this._deployView();
      this.cam.set(v.x, v.y, v.zoom);
    }

    // ----- deployment -----------------------------------------------------
    remaining() { return this.budget - this.spent; }

    selectType(type) {
      this.selectedType = (this.selectedType === type) ? null : type;
      this.selection = null;
      this.canvas.style.cursor = this.selectedType ? 'crosshair' : 'grab';
      this.ui.refreshRoster();
      this.ui.showInspector(this.selectedType ? { kind: 'unit', type: this.selectedType } : null);
    }

    _formationFromRect(type, ax, ay, bx, by) {
      const def = GI.UNITS[type];
      const z = GI.DEPLOY_ZONE;
      // clamp to deploy zone
      let x0 = U.clamp(Math.min(ax, bx), z.x0, z.x1), x1 = U.clamp(Math.max(ax, bx), z.x0, z.x1);
      let y0 = U.clamp(Math.min(ay, by), z.y0, z.y1), y1 = U.clamp(Math.max(ay, by), z.y0, z.y1);
      const spacing = def.radius * 2.2 + 3;
      let w = x1 - x0, h = y1 - y0;
      let cols, rows;
      if (w < spacing && h < spacing) { cols = 5; rows = 4; }     // click = default block
      else { cols = U.clamp(Math.round(w / spacing) + 1, 1, 32); rows = U.clamp(Math.round(h / spacing) + 1, 1, 24); }
      // recentre block so it sits inside the zone
      const bw = (cols - 1) * spacing, bh = (rows - 1) * spacing;
      let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      cx = U.clamp(cx, z.x0 + bw / 2, z.x1 - bw / 2);
      cy = U.clamp(cy, z.y0 + bh / 2, z.y1 - bh / 2);
      const count = cols * rows;
      const cost = count * def.cost;
      const points = [];
      const cap = Math.min(count, 240);
      for (let i = 0; i < cap; i++) {
        const r = (i / cols) | 0, c = i % cols;
        points.push({ x: cx - bw / 2 + c * spacing, y: cy - bh / 2 + r * spacing });
      }
      const valid = cost <= this.remaining() && count >= 1;
      return { type, cx, cy, cols, rows, count, cost, valid,
        x0: cx - bw / 2 - def.radius, y0: cy - bh / 2 - def.radius,
        w: bw + def.radius * 2, h: bh + def.radius * 2, points };
    }

    commitFormation(g) {
      if (!g || !g.valid) { if (g && !g.valid) this.ui.toast('Not enough denarii.'); return; }
      const reg = this.battle.addRegiment(g.type, 0, g.cx, g.cy, g.cols, g.rows);
      reg.cols = g.cols; reg.rows = g.rows; reg.cost = g.cost;
      this.spent += g.cost;
      this.audio.click();
      this.ui.refreshAll();
    }

    disband(reg) {
      if (!reg) return;
      this.spent -= (reg.cost || 0);
      this.battle.removeRegiment(reg);
      if (this.selection === reg) this.selection = null;
      this.audio.click();
      this.ui.refreshAll();
    }
    clearAll() {
      for (const reg of [...this.battle.regiments]) if (reg.team === 0) this.disband(reg);
      this.selection = null; this.ui.refreshAll();
    }

    autoArray() {
      this.clearAll();
      const z = GI.DEPLOY_ZONE;
      // wide battle lines (shallow depth, broad frontage) stacked front-to-back
      const lines = [
        { type: 'velites',    depth: 2, files: 14 },
        { type: 'hastati',    depth: 3, files: 14 },
        { type: 'principes',  depth: 3, files: 12 },
        { type: 'triarii',    depth: 2, files: 10 },
        { type: 'sagittarii', depth: 2, files: 12 },
      ];
      let lineX = z.x1 - 70;                    // front rank near the centre
      const place = (type, x, y, depth, files) => {
        const def = GI.UNITS[type];
        const cost = depth * files * def.cost;
        if (cost > this.remaining()) return 0;
        const reg = this.battle.addRegiment(type, 0, x, y, depth, files);
        reg.cols = depth; reg.rows = files; reg.cost = cost;
        this.spent += cost;
        return def.radius * 2.2 + 3;
      };
      for (const ln of lines) {
        const sp = place(ln.type, lineX, 0, ln.depth, ln.files);
        if (sp) lineX -= (ln.depth * sp + 30);
      }
      // a wing of horse on each flank
      place('equites', z.x1 - 95, -210, 2, 4);
      place('equites', z.x1 - 95, 210, 2, 4);
      // pour any remaining silver into deeper Principes reserves
      let guardX = lineX - 20;
      while (guardX > z.x0 + 50) {
        const sp = place('principes', guardX, 0, 2, 10);
        if (!sp) break;
        guardX -= (2 * sp + 28);
      }
      this.audio.click();
      this.ui.refreshAll();
      this.ui.toast('Standard array drawn up. Adjust as you see fit, Imperator.');
    }

    // ----- battle control -------------------------------------------------
    engage() {
      if (this.battle.living(0) === 0) { this.ui.toast('Deploy at least one unit first.'); return; }
      // snapshot the player's array for restart / redeploy
      this.deployment = this.battle.regiments.filter(r => r.team === 0)
        .map(r => ({ type: r.type, cx: r.anchorX, cy: r.anchorY, cols: r.cols, rows: r.rows, cost: r.cost }));
      this.selectedType = null; this.selection = null; this.ghost = null;
      this.phase = 'battle';
      this.paused = false; this._resultShown = false;
      this.battle.begin();
      this.audio.resume();
      const v = this._battleView(); this.cam.glideTo(v.x, v.y, v.zoom);
      this.ui.enterBattle();
    }
    _rebuild(started) {
      this.battle.reset(this.seed);
      this.renderer.buildTerrain(this.battle.bounds, this.seed);
      for (const b of this.level.enemy) {
        const reg = this.battle.addRegiment(b.type, 1, b.x, b.y, b.cols, b.rows, b.spacing);
        reg.cols = b.cols; reg.rows = b.rows;
      }
      for (const d of this.deployment) {
        const reg = this.battle.addRegiment(d.type, 0, d.cx, d.cy, d.cols, d.rows);
        reg.cols = d.cols; reg.rows = d.rows; reg.cost = d.cost;
      }
      this._resultShown = false;
      if (started) { this.phase = 'battle'; this.paused = false; this.battle.begin(); }
    }
    restartBattle() {
      this._rebuild(true);
      const v = this._battleView(); this.cam.glideTo(v.x, v.y, v.zoom);
      this.ui.enterBattle(); this.ui.hideResult();
    }
    redeploy() {
      this._rebuild(false);
      this.phase = 'deploy'; this.paused = false;
      const v = this._deployView(); this.cam.glideTo(v.x, v.y, v.zoom);
      this.ui.enterDeploy(this.level); this.ui.hideResult();
    }
    togglePause() { this.paused = !this.paused; this.ui.refreshBattleControls(); }
    setSpeed(s) { this.speed = s; this.ui.refreshBattleControls(); }

    _onBattleEnd() {
      this._resultShown = true;
      const r = this.battle.result;
      if (r === 'win' && !this.custom) {
        this.completed.add(this.level.id);
        this._saveProgress();
      }
      // let the dust settle a beat before the banner
      setTimeout(() => { if (this.battle.over) this.ui.showResult(r, this._battleStats()); }, 1100);
    }
    _battleStats() {
      return {
        result: this.battle.result,
        kills: this.battle.kills[0],
        losses: this.battle.startCount[0] - this.battle.living(0),
        survivors: this.battle.living(0),
        enemyStart: this.battle.startCount[1],
        enemyLeft: this.battle.living(1)
      };
    }
    nextLevel() {
      const ni = this.levelIndex + 1;
      if (ni < GI.LEVELS.length) { this.ui.hideResult(); this.loadLevel(ni); }
      else { this.ui.hideResult(); this.ui.showCampaignComplete(); }
    }

    // ----- progress -------------------------------------------------------
    _loadProgress() {
      try { return new Set(JSON.parse(localStorage.getItem('gi_progress') || '[]')); }
      catch (e) { return new Set(); }
    }
    _saveProgress() {
      try { localStorage.setItem('gi_progress', JSON.stringify([...this.completed])); } catch (e) {}
    }
    isUnlocked(index) {
      if (index === 0) return true;
      return this.completed.has(GI.LEVELS[index - 1].id);
    }

    // ----- input ----------------------------------------------------------
    _initInput() {
      const cv = this.canvas;
      let down = false, button = 0, startSX = 0, startSY = 0, moved = false;
      let dragWorldStart = null, panning = false;

      const worldOf = (ev) => {
        const rect = cv.getBoundingClientRect();
        return this.cam.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
      };

      cv.addEventListener('contextmenu', (e) => e.preventDefault());

      cv.addEventListener('pointerdown', (ev) => {
        if (this.phase !== 'deploy' && this.phase !== 'battle') return;
        try { cv.setPointerCapture(ev.pointerId); } catch (e) {}
        down = true; button = ev.button; moved = false;
        startSX = ev.clientX; startSY = ev.clientY;
        this.audio.resume();
        const w = worldOf(ev);
        const placing = this.phase === 'deploy' && this.selectedType && button === 0;
        if (placing) { dragWorldStart = w; this.ghost = this._formationFromRect(this.selectedType, w.x, w.y, w.x, w.y); }
        else { panning = true; dragWorldStart = null; cv.style.cursor = 'grabbing'; }
      });

      cv.addEventListener('pointermove', (ev) => {
        const rect = cv.getBoundingClientRect();
        const sx = ev.clientX - rect.left, sy = ev.clientY - rect.top;
        if (!down) return;
        const dx = ev.clientX - startSX, dy = ev.clientY - startSY;
        if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
        if (dragWorldStart && this.selectedType) {
          const w = this.cam.screenToWorld(sx, sy);
          this.ghost = this._formationFromRect(this.selectedType, dragWorldStart.x, dragWorldStart.y, w.x, w.y);
        } else if (panning) {
          this.cam.panBy(ev.movementX || dx, ev.movementY || dy);
          startSX = ev.clientX; startSY = ev.clientY;
        }
      });

      const endPointer = (ev) => {
        if (!down) return;
        down = false;
        if (dragWorldStart && this.ghost) {
          this.commitFormation(this.ghost);
          this.ghost = null;
        } else if (!moved && this.phase === 'deploy') {
          // a plain click in select mode → pick a regiment under the cursor
          const w = worldOf(ev);
          this._pickRegiment(w);
        }
        panning = false; dragWorldStart = null;
        cv.style.cursor = this.selectedType ? 'crosshair' : 'grab';
      };
      cv.addEventListener('pointerup', endPointer);
      cv.addEventListener('pointercancel', endPointer);

      cv.addEventListener('wheel', (ev) => {
        ev.preventDefault();
        const rect = cv.getBoundingClientRect();
        this.cam.zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY < 0 ? 1.12 : 0.89);
      }, { passive: false });

      window.addEventListener('keydown', (ev) => this._onKey(ev));
    }

    _pickRegiment(w) {
      let best = null, bestD = 60 * 60;
      for (const reg of this.battle.regiments) {
        if (reg.team !== 0 || reg.alive <= 0) continue;
        const c = reg.cohesion();
        const d = U.dist2(w.x, w.y, c.x, c.y);
        if (d < bestD) { bestD = d; best = reg; }
      }
      this.selection = best;
      this.ui.showInspector(best ? { kind: 'regiment', reg: best } : null);
    }

    _onKey(ev) {
      const k = ev.key.toLowerCase();
      if (k === 'escape') {
        if (this.selectedType) { this.selectType(this.selectedType); }
        else if (this.selection) { this.selection = null; this.ui.showInspector(null); }
        else if (this.ui) this.ui.closeOverlays();
        return;
      }
      if (this.phase === 'deploy') {
        if ((k === 'delete' || k === 'backspace') && this.selection) { this.disband(this.selection); ev.preventDefault(); }
        if (k === 'enter') this.engage();
      }
      if (this.phase === 'battle') {
        if (k === ' ') { this.togglePause(); ev.preventDefault(); }
        if (k === '1') this.setSpeed(1);
        if (k === '2') this.setSpeed(2);
        if (k === '3') this.setSpeed(3);
        if (k === 'r') this.restartBattle();
      }
      const pan = 60;
      if (k === 'a' || k === 'arrowleft') this.cam.panBy(pan, 0);
      if (k === 'd' || k === 'arrowright') this.cam.panBy(-pan, 0);
      if (k === 'w' || k === 'arrowup') this.cam.panBy(0, pan);
      if (k === 's' || k === 'arrowdown') this.cam.panBy(0, -pan);
      if (k === '=' || k === '+') this.cam.zoomAt(this.cam.view.w / 2, this.cam.view.h / 2, 1.12);
      if (k === '-') this.cam.zoomAt(this.cam.view.w / 2, this.cam.view.h / 2, 0.89);
    }
  }

  GI.Game = Game;
})(window.GI = window.GI || {});
