/* ==========================================================================
   GLADIVS IMPERIVM  —  ui.js
   The DOM layer. Builds the roster, campaign map, sandbox, intel, help and
   result screens, wires every button to the game, and refreshes the HUD
   (denarii, army-strength bars, counts) each frame. Unit icons are drawn live
   from the same baked sprites used on the battlefield.
   ========================================================================== */
(function (GI) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const show = (el) => el && el.classList.remove('hidden');
  const hide = (el) => el && el.classList.add('hidden');

  function unitIcon(type, size) {
    const variants = GI.sprites.getCache(type);
    const spr = variants[0];
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#2a2012'); g.addColorStop(1, '#140d06');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    const maxPx = Math.max(spr.w, spr.h) * 2;
    const f = (size * 0.86) / maxPx;
    x.translate(size / 2, size / 2 + size * 0.04);
    x.scale(f, f);
    x.drawImage(spr.canvas, -spr.pivotX * 2, -spr.pivotY * 2);
    return c;
  }

  const ROLE_LABEL = { melee: 'Heavy Foot', ranged: 'Missiles', cavalry: 'Cavalry', support: 'Support', beast: 'War Beast' };

  class UI {
    constructor(game) {
      this.game = game;
      this._toastT = null;
      this._cache();
      this._bind();
      this._buildHelp();
    }

    _cache() {
      this.hud = $('hud'); this.bars = $('bars'); this.roster = $('roster');
      this.rosterList = $('roster-list'); this.inspector = $('inspector');
      this.controls = $('controls'); this.deployCtl = $('deploy-controls'); this.battleCtl = $('battle-controls');
      this.denarii = $('denarii'); this.levelName = $('level-name'); this.levelPlace = $('level-place');
      this.barRome = $('bar-rome'); this.barFoe = $('bar-foe'); this.cntRome = $('cnt-rome'); this.cntFoe = $('cnt-foe');
      this.playpause = $('btn-playpause'); this.toastEl = $('toast');
      this.titleScreen = $('title-screen'); this.levelSelect = $('level-select'); this.sandbox = $('sandbox');
      this.result = $('result'); this.help = $('help'); this.intel = $('intel');
    }

    _bind() {
      const g = this.game;
      // title
      $('btn-campaign').onclick = () => { this.audioClick(); this.showLevelSelect(); };
      $('btn-sandbox').onclick = () => { this.audioClick(); this.showSandbox(); };
      $('btn-howto').onclick = () => { this.audioClick(); show(this.help); };
      // hud
      $('btn-help').onclick = () => show(this.help);
      $('btn-intel').onclick = () => this.toggleIntel();
      $('btn-mute').onclick = (e) => { const m = !GI.audio.muted; GI.audio.setMuted(m); e.target.textContent = m ? '♪̸' : '♪'; e.target.style.opacity = m ? .5 : 1; };
      $('btn-menu').onclick = () => { this.audioClick(); this.toMenu(); };
      $('intel-close').onclick = () => hide(this.intel);
      $('help-close').onclick = () => hide(this.help);
      // deploy
      $('btn-engage').onclick = () => { this.audioClick(); g.engage(); };
      $('btn-clear').onclick = () => { this.audioClick(); g.clearAll(); };
      $('btn-auto').onclick = () => { this.audioClick(); g.autoArray(); };
      $('btn-disband').onclick = () => { if (g.selection) g.disband(g.selection); };
      // battle
      this.playpause.onclick = () => { this.audioClick(); g.togglePause(); };
      $('btn-restart').onclick = () => { this.audioClick(); g.restartBattle(); };
      $('btn-redeploy').onclick = () => { this.audioClick(); g.redeploy(); };
      document.querySelectorAll('.spd').forEach(b => b.onclick = () => { this.audioClick(); g.setSpeed(+b.dataset.spd); });
      // level select / sandbox / result
      $('ls-back').onclick = () => { this.audioClick(); this.toTitle(); };
      $('sb-back').onclick = () => { this.audioClick(); this.toTitle(); };
      $('sb-start').onclick = () => { this.audioClick(); this.startSandbox(); };
      $('res-next').onclick = () => { this.audioClick(); g.nextLevel(); };
      $('res-retry').onclick = () => { this.audioClick(); g.restartBattle(); };
      $('res-menu').onclick = () => { this.audioClick(); this.toMenu(); };
    }
    audioClick() { GI.audio.init(); GI.audio.resume(); GI.audio.click(); }

    // ---- screen transitions ---------------------------------------------
    toTitle() {
      this.game.phase = 'title';
      hide(this.levelSelect); hide(this.sandbox); hide(this.result); hide(this.hud);
      hide(this.bars); hide(this.roster); hide(this.inspector); hide(this.controls);
      show(this.titleScreen);
    }
    toMenu() {
      this.game.phase = 'menu';
      hide(this.hud); hide(this.bars); hide(this.roster); hide(this.inspector);
      hide(this.controls); hide(this.result); hide(this.intel);
      this.showLevelSelect();
    }
    showLevelSelect() {
      hide(this.titleScreen);
      this._buildLevelSelect();
      show(this.levelSelect);
    }
    showSandbox() { hide(this.titleScreen); this._buildSandbox(); show(this.sandbox); }

    enterDeploy(level) {
      hide(this.titleScreen); hide(this.levelSelect); hide(this.sandbox); hide(this.result);
      show(this.hud); show(this.roster); show(this.controls);
      hide(this.bars); show(this.deployCtl); hide(this.battleCtl); hide(this.inspector);
      this.levelName.textContent = level.name;
      this.levelPlace.textContent = `${level.place}${level.year ? ' · ' + level.year : ''}`;
      this._buildRoster();
      this._buildIntel(level);
      this.refreshAll();
      this.toast(level.brief, 6500);
    }
    enterBattle() {
      hide(this.deployCtl); show(this.battleCtl); show(this.bars);
      hide(this.roster); hide(this.inspector);
      this.refreshBattleControls();
    }

    // ---- roster ----------------------------------------------------------
    _buildRoster() {
      this.rosterList.innerHTML = '';
      for (const type of GI.ROSTER) {
        const def = GI.UNITS[type];
        const card = document.createElement('div');
        card.className = 'unit-card'; card.dataset.type = type;
        const icon = unitIcon(type, 40); icon.className = 'unit-icon';
        const meta = document.createElement('div'); meta.className = 'unit-meta';
        meta.innerHTML = `<div class="unit-name">${def.name}</div><div class="unit-role">${ROLE_LABEL[def.role] || def.role}</div>`;
        const cost = document.createElement('div'); cost.className = 'unit-cost'; cost.textContent = def.cost;
        card.appendChild(icon); card.appendChild(meta); card.appendChild(cost);
        card.onclick = () => { this.audioClick(); this.game.selectType(type); };
        card.onmouseenter = () => { if (!this.game.selectedType) this.showInspector({ kind: 'unit', type }); };
        this.rosterList.appendChild(card);
      }
      this.refreshRoster();
    }
    refreshRoster() {
      const rem = this.game.remaining();
      this.rosterList.querySelectorAll('.unit-card').forEach(card => {
        const def = GI.UNITS[card.dataset.type];
        card.classList.toggle('active', this.game.selectedType === card.dataset.type);
        card.classList.toggle('unaffordable', def.cost > rem);
      });
    }

    // ---- inspector -------------------------------------------------------
    showInspector(obj) {
      if (!obj) { hide(this.inspector); return; }
      show(this.inspector);
      const disband = $('btn-disband');
      if (obj.kind === 'unit') {
        const d = GI.UNITS[obj.type];
        $('insp-name').textContent = d.name;
        $('insp-stats').innerHTML = this._statRows(d);
        $('insp-desc').textContent = d.desc;
        hide(disband);
      } else if (obj.kind === 'regiment') {
        const reg = obj.reg, d = reg.def;
        $('insp-name').textContent = `${d.name} — ${reg.alive} men`;
        $('insp-stats').innerHTML = this._statRows(d);
        $('insp-desc').textContent = `This formation cost ${reg.cost} denarii. Press Disband to recover the silver.`;
        show(disband);
      }
    }
    _statRows(d) {
      const rows = [
        ['Health', d.hp], ['Attack', d.attack],
        ['Armour', Math.round(d.defense * 100) + '%'], ['Speed', d.speed],
        ['Resolve', d.resolve.toFixed(1)], ['Reach', d.reach]
      ];
      if (d.range) rows.push(['Missile range', d.range], ['Ammo', d.ammo === Infinity ? '∞' : d.ammo]);
      if (d.charge) rows.push(['Charge', '+' + d.charge]);
      if (d.antiCav) rows.push(['vs Cavalry', '×' + d.antiCav]);
      if (d.aura) rows.push([d.aura.type === 'heal' ? 'Heals allies' : 'Steadies allies', '✓']);
      return rows.map(r => `<div class="s"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
    }

    // ---- intel -----------------------------------------------------------
    _buildIntel(level) {
      const body = $('intel-body');
      const roster = GI.enemyRoster(level);
      const v = GI.enemyValue(level);
      body.innerHTML = `<div style="margin-bottom:8px;color:#c9b88f;font-style:italic">
        The enemy fields <b style="color:#e7c558">${v.count}</b> soldiers.</div>`;
      roster.forEach(r => {
        const d = GI.UNITS[r.type];
        const row = document.createElement('div'); row.className = 'intel-row';
        const ic = unitIcon(r.type, 34); ic.className = 'ic';
        const nm = document.createElement('div'); nm.className = 'nm';
        nm.innerHTML = `<b>${d.name}</b><small>${d.desc.split('.')[0]}.</small>`;
        const qty = document.createElement('div'); qty.className = 'qty'; qty.textContent = '×' + r.n;
        row.appendChild(ic); row.appendChild(nm); row.appendChild(qty);
        body.appendChild(row);
      });
      if (level.hint) {
        const h = document.createElement('div');
        h.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid rgba(180,150,90,.25);font-style:italic;color:#d8c8a4';
        h.innerHTML = `<b style="color:#e7c558">Counsel:</b> ${level.hint}`;
        body.appendChild(h);
      }
    }
    toggleIntel() { this.intel.classList.contains('hidden') ? show(this.intel) : hide(this.intel); }

    // ---- level select ----------------------------------------------------
    _buildLevelSelect() {
      const grid = $('ls-grid'); grid.innerHTML = '';
      GI.LEVELS.forEach((lv, i) => {
        const unlocked = this.game.isUnlocked(i);
        const done = this.game.completed.has(lv.id);
        const card = document.createElement('div');
        card.className = 'ls-card' + (unlocked ? '' : ' locked');
        const v = GI.enemyValue(lv);
        card.innerHTML = `
          <div class="ls-num">SCENARIO ${lv.id}</div>
          <div class="ls-name">${lv.name.replace(/^[IVX]+\.\s*/, '')}</div>
          <div class="ls-place">${lv.place}</div>
          <div class="ls-foes">Enemy host: ${v.count} soldiers</div>
          ${done ? '<div class="ls-done">✦ Victory won</div>' : (unlocked ? '' : '<div class="ls-done" style="color:#a98">🔒 Locked</div>')}`;
        if (unlocked) card.onclick = () => { this.audioClick(); hide(this.levelSelect); this.game.loadLevel(i); };
        grid.appendChild(card);
      });
    }

    // ---- sandbox ---------------------------------------------------------
    _buildSandbox() {
      const wrap = $('sb-foes'); wrap.innerHTML = '';
      const foes = ['gaul_warrior', 'gaul_archer', 'berserker', 'chieftain', 'cart_spear', 'numidian', 'elephant'];
      const defaults = { gaul_warrior: 30, gaul_archer: 12, berserker: 0, chieftain: 0, cart_spear: 18, numidian: 0, elephant: 2 };
      foes.forEach(type => {
        const d = GI.UNITS[type];
        const row = document.createElement('div'); row.className = 'sb-foe';
        const ic = unitIcon(type, 30); ic.style.borderRadius = '5px';
        const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = d.name;
        const inp = document.createElement('input'); inp.type = 'number'; inp.min = 0; inp.max = 80;
        inp.value = defaults[type] || 0; inp.dataset.type = type;
        row.appendChild(ic); row.appendChild(nm); row.appendChild(inp);
        wrap.appendChild(row);
      });
      const slider = $('sb-budget'), val = $('sb-budget-val');
      slider.oninput = () => val.textContent = slider.value;
      val.textContent = slider.value;
    }
    startSandbox() {
      const blocks = [];
      const inputs = $('sb-foes').querySelectorAll('input');
      let yslot = -260, total = 0;
      inputs.forEach(inp => {
        const n = Math.max(0, Math.min(80, +inp.value | 0));
        if (n <= 0) return;
        total += n;
        const type = inp.dataset.type;
        if (type === 'elephant') {
          for (let i = 0; i < n; i++) { blocks.push({ type, x: 430, y: yslot, cols: 1, rows: 1 }); yslot += 140; }
        } else {
          const cols = Math.min(10, Math.max(4, Math.ceil(Math.sqrt(n * 1.6))));
          const rows = Math.ceil(n / cols);
          blocks.push({ type, x: 380 + Math.random() * 80, y: yslot + rows * 6, cols, rows });
          yslot += rows * 22 + 40;
        }
      });
      if (total === 0) { this.toast('Summon at least one foe.'); return; }
      hide(this.sandbox);
      this.game.loadCustom({ budget: +$('sb-budget').value, enemy: blocks });
    }

    // ---- result ----------------------------------------------------------
    showResult(result, stats) {
      const title = $('result-title'), sub = $('result-sub'), box = $('result-stats');
      title.classList.remove('win', 'lose');
      if (result === 'win') {
        title.textContent = 'VICTORIA'; title.classList.add('win');
        sub.textContent = this.game.custom ? 'The field is yours.' : (this.game.levelIndex + 1 >= GI.LEVELS.length ? 'Rome endures. The war is won!' : 'The enemy breaks and flees. Rome advances.');
      } else if (result === 'lose') {
        title.textContent = 'CLADES'; title.classList.add('lose');
        sub.textContent = 'The line is shattered. Regroup and try again.';
      } else { title.textContent = 'STALEMATE'; sub.textContent = 'Neither eagle nor standard holds the field.'; }
      box.innerHTML = `
        <div class="rs"><div class="v">${stats.kills}</div><div class="l">Enemy slain</div></div>
        <div class="rs"><div class="v">${stats.survivors}</div><div class="l">Survivors</div></div>
        <div class="rs"><div class="v">${stats.losses}</div><div class="l">Fallen</div></div>`;
      $('res-next').style.display = (result === 'win' && !this.game.custom && this.game.levelIndex + 1 < GI.LEVELS.length) ? '' : 'none';
      show(this.result);
    }
    hideResult() { hide(this.result); }
    showCampaignComplete() {
      const title = $('result-title'), sub = $('result-sub'), box = $('result-stats');
      title.textContent = 'ROMA VICTRIX'; title.classList.add('win');
      sub.textContent = 'Every foe is thrown down. The Republic stands triumphant — and so do you, Imperator.';
      box.innerHTML = '<div class="rs"><div class="v">X / X</div><div class="l">Scenarios won</div></div>';
      $('res-next').style.display = 'none';
      show(this.result);
    }

    closeOverlays() { hide(this.intel); hide(this.help); }

    // ---- help ------------------------------------------------------------
    _buildHelp() {
      $('help-body').innerHTML = `
        <div class="help-card"><h3>The Two Phases</h3><p>Every battle has a <b>deployment</b> and a <b>fight</b>.
          First spend your <b>denarii</b> arraying formations. Then press <b>Engage</b> and the armies clash on their own —
          your tactics are decided <i>before</i> the first blow.</p></div>
        <div class="help-card"><h3>Arraying Troops</h3><ul>
          <li>Pick a unit, then <b>drag</b> on the green field to draw a block of men.</li>
          <li>A wider drag = a longer line; a deeper drag = more ranks.</li>
          <li>Click a placed formation to select it, then <b>Disband</b> for a refund.</li>
          <li>Hold <b>right-mouse</b> (or use WASD / arrows) to pan; scroll to zoom.</li></ul></div>
        <div class="help-card"><h3>The Clash</h3><ul>
          <li><b>Pause</b> any time and watch at <b>1× / 2× / 3×</b>.</li>
          <li>Soldiers have <b>morale</b>: surround or outmatch a unit and it will <b>break and rout</b>.</li>
          <li><b>Reset Battle</b> re-runs the same plan; <b>Redeploy</b> lets you adjust it.</li></ul></div>
        <div class="help-card"><h3>The Trade of Arms</h3><ul>
          <li><b>Hastati / Principes</b> — the shield wall. Win the centre.</li>
          <li><b>Triarii</b> — spears that <b>shatter cavalry</b>. Brace your flanks.</li>
          <li><b>Sagittarii / Velites</b> — missiles. Keep them <b>behind</b> the line.</li>
          <li><b>Equites</b> — charge flanks and run down routers; avoid spears.</li>
          <li><b>Medicus</b> mends the line; the <b>Aquilifer</b>'s Eagle keeps men from breaking.</li>
          <li><b>Flank and rear</b> attacks hit far harder. Encircle the enemy.</li></ul></div>`;
    }

    // ---- per-frame -------------------------------------------------------
    frame() {
      const g = this.game;
      if (g.phase === 'deploy') {
        this.denarii.textContent = g.remaining();
      } else if (g.phase === 'battle' || g.phase === 'result') {
        const b = g.battle;
        const r0 = b.startCount[0] || 1, r1 = b.startCount[1] || 1;
        const l0 = b.living(0), l1 = b.living(1);
        this.barRome.style.width = Math.max(0, l0 / r0 * 100) + '%';
        this.barFoe.style.width = Math.max(0, l1 / r1 * 100) + '%';
        this.cntRome.textContent = l0; this.cntFoe.textContent = l1;
      }
    }
    refreshAll() { this.refreshRoster(); this.denarii.textContent = this.game.remaining();
      if (this.game.selection) this.showInspector({ kind: 'regiment', reg: this.game.selection }); }
    refreshBattleControls() {
      this.playpause.textContent = this.game.paused ? '▶ Play' : '❚❚ Pause';
      document.querySelectorAll('.spd').forEach(b => b.classList.toggle('active', +b.dataset.spd === this.game.speed));
    }

    toast(msg, ms) {
      this.toastEl.textContent = msg; show(this.toastEl); this.toastEl.style.opacity = '1';
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => { this.toastEl.style.opacity = '0'; setTimeout(() => hide(this.toastEl), 300); }, ms || 3200);
    }
  }

  GI.UI = UI;
})(window.GI = window.GI || {});
