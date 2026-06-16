/* ==========================================================================
   GLADIVS IMPERIVM  —  renderer.js
   Draws the world: a baked battlefield, ground decals (corpses, blood, spent
   shafts), the armies (y-sorted for depth) with wound/rout cues, missiles,
   particles, unit banners, and the deployment overlay. A parchment vignette is
   laid over the top in screen space to keep everything in an old-painting key.
   ========================================================================== */
(function (GI) {
  'use strict';
  const U = GI.util;

  class Renderer {
    constructor(canvas, cam) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cam = cam;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.terrain = null;
      this.grain = this._buildGrain();
      this.resize();
    }

    resize() {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.cam.view.w = w; this.cam.view.h = h;
    }

    // ----- baked battlefield ---------------------------------------------
    buildTerrain(bounds, seed) {
      const pad = 260;
      const w = (bounds.x1 - bounds.x0) + pad * 2;
      const h = (bounds.y1 - bounds.y0) + pad * 2;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      const rng = U.makeRNG((seed || 1) >>> 0);
      // base earth wash
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#9a8a63'); g.addColorStop(0.5, '#8c7c54'); g.addColorStop(1, '#7e6f49');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      // broad soft patches of grass and bare dirt
      for (let i = 0; i < 90; i++) {
        const px = rng() * w, py = rng() * h, r = 60 + rng() * 200;
        const grass = rng() < 0.55;
        const rg = x.createRadialGradient(px, py, 0, px, py, r);
        const col = grass ? '#7e864a' : '#8f7c50';
        rg.addColorStop(0, U.rgba(col, 0.5)); rg.addColorStop(1, U.rgba(col, 0));
        x.fillStyle = rg; x.beginPath(); x.arc(px, py, r, 0, U.TAU); x.fill();
      }
      // a worn road running across the field
      x.save();
      x.translate(0, h * 0.5 + rng.range(-40, 40));
      x.fillStyle = U.rgba('#6f6044', 0.55);
      x.beginPath();
      x.moveTo(0, -34);
      for (let xx = 0; xx <= w; xx += 40) x.lineTo(xx, -34 + Math.sin(xx * 0.01) * 12);
      for (let xx = w; xx >= 0; xx -= 40) x.lineTo(xx, 34 + Math.sin(xx * 0.01) * 12);
      x.closePath(); x.fill();
      // paving stones
      x.strokeStyle = U.rgba('#54482f', 0.4); x.lineWidth = 1.5;
      for (let xx = 0; xx < w; xx += 26) {
        x.beginPath(); x.moveTo(xx, -34 + Math.sin(xx * 0.01) * 12); x.lineTo(xx, 34 + Math.sin(xx * 0.01) * 12); x.stroke();
      }
      x.restore();
      // grass tufts
      for (let i = 0; i < 1700; i++) {
        const px = rng() * w, py = rng() * h;
        const len = 2 + rng() * 4;
        x.strokeStyle = U.rgba(rng() < 0.5 ? '#6f7a3e' : '#828a4c', 0.7);
        x.lineWidth = 0.8;
        for (let b = 0; b < 3; b++) {
          x.beginPath(); x.moveTo(px, py);
          x.lineTo(px + (rng() - 0.5) * 3, py - len - rng() * 2); x.stroke();
        }
      }
      // rocks + pebbles
      for (let i = 0; i < 120; i++) {
        const px = rng() * w, py = rng() * h, r = 2 + rng() * 7;
        x.fillStyle = U.rgba('#6b6354', 0.8);
        x.beginPath(); x.ellipse(px, py, r, r * 0.7, rng() * 3, 0, U.TAU); x.fill();
        x.strokeStyle = U.rgba('#3f3a2c', 0.5); x.lineWidth = 0.8; x.stroke();
      }
      // edge darkening so the field reads as a contained arena
      const vg = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(30,22,10,0.45)');
      x.fillStyle = vg; x.fillRect(0, 0, w, h);
      this.terrain = { canvas: c, ox: bounds.x0 - pad, oy: bounds.y0 - pad };
    }

    _buildGrain() {
      const c = document.createElement('canvas');
      c.width = c.height = 220;
      const x = c.getContext('2d');
      const img = x.createImageData(220, 220);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 120 + (Math.random() * 90 | 0);
        img.data[i] = v; img.data[i + 1] = v - 8; img.data[i + 2] = v - 24; img.data[i + 3] = 16;
      }
      x.putImageData(img, 0, 0);
      return c;
    }

    // ----- main draw ------------------------------------------------------
    render(B, game) {
      const ctx = this.ctx, cam = this.cam;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, cam.view.w, cam.view.h);
      // sky/void behind the field
      ctx.fillStyle = '#37301f';
      ctx.fillRect(0, 0, cam.view.w, cam.view.h);

      ctx.save();
      cam.apply(ctx);

      if (this.terrain) ctx.drawImage(this.terrain.canvas, this.terrain.ox, this.terrain.oy);

      this._decals(ctx, B);

      if (game.phase === 'deploy') this._deployZone(ctx, game);

      this._soldiers(ctx, B, cam);
      this._projectiles(ctx, B);
      this._particles(ctx, B);
      this._banners(ctx, B, game);

      if (game.phase === 'deploy' && game.ghost) this._ghost(ctx, game);
      if (game.selection) this._selection(ctx, game);

      ctx.restore();

      this._overlay(ctx, cam);
    }

    _decals(ctx, B) {
      const d = B.particles.decals;
      for (let i = 0; i < d.length; i++) {
        const o = d[i];
        if (o.k === 'corpse') {
          const variants = GI.sprites.getCache(o.type);
          const spr = variants[o.variant % variants.length];
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.globalAlpha = 0.62;
          ctx.rotate(o.facing + 0.5);
          const k = (o.scale || 1) / 2 * 0.92;
          ctx.scale(k, k * 0.7);            // squashed = lying down
          ctx.globalCompositeOperation = 'multiply';
          ctx.drawImage(spr.canvas, -spr.pivotX * 2, -spr.pivotY * 2);
          ctx.restore();
        } else if (o.k === 'stain') {
          ctx.fillStyle = 'rgba(96,20,14,0.5)';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, U.TAU); ctx.fill();
        } else if (o.k === 'shaft') {
          ctx.strokeStyle = o.kind === 'javelin' ? 'rgba(70,50,28,0.8)' : 'rgba(60,42,24,0.75)';
          ctx.lineWidth = o.kind === 'javelin' ? 1.8 : 1.1;
          const len = o.kind === 'javelin' ? 12 : 8;
          ctx.beginPath();
          ctx.moveTo(o.x, o.y);
          ctx.lineTo(o.x - Math.cos(o.ang) * len, o.y - Math.sin(o.ang) * len);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    _deployZone(ctx, game) {
      const z = GI.DEPLOY_ZONE;
      ctx.save();
      ctx.fillStyle = 'rgba(120,150,90,0.10)';
      ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      ctx.setLineDash([12, 10]);
      ctx.strokeStyle = 'rgba(230,200,120,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      ctx.setLineDash([]);
      ctx.restore();
    }

    _soldiers(ctx, B, cam) {
      // y-sort a *copy* for painterly depth — never reorder the live sim array,
      // which would bias soldier update order. Reuse a scratch list to avoid GC.
      const dl = this._dl || (this._dl = []);
      dl.length = 0;
      for (let i = 0; i < B.soldiers.length; i++) if (!B.soldiers[i].dead) dl.push(B.soldiers[i]);
      dl.sort((a, b) => a.y - b.y);
      const arr = dl;
      const showBars = cam.zoom > 0.95;
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s.dead) continue;
        GI.sprites.drawSoldier(ctx, s, 1);
        // wound flash
        if (s.hurtT > 0) {
          ctx.globalAlpha = s.hurtT * 1.6;
          ctx.fillStyle = '#e23b2a';
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 1.1, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // attack swing spark arc
        if (s.flashT > 0 && s.def.role !== 'ranged') {
          ctx.strokeStyle = 'rgba(255,240,200,' + (s.flashT * 3).toFixed(2) + ')';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const a0 = s.facing - 0.6, a1 = s.facing + 0.6;
          ctx.arc(s.x, s.y, s.r + s.def.reach * 0.7, a0, a1);
          ctx.stroke();
        }
        // routing cue
        if (s.state === 'routing') {
          ctx.fillStyle = 'rgba(240,220,160,0.9)';
          ctx.font = '8px serif';
          ctx.fillText('!', s.x - 1.5, s.y - s.r - 4);
        }
        // health pip when hurt and zoomed in
        if (showBars && s.hp < s.maxHp) {
          const w = s.r * 2.0, hp = Math.max(0, s.hp / s.maxHp);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(s.x - w / 2, s.y - s.r - 4.5, w, 1.8);
          ctx.fillStyle = s.team === 0 ? '#d7b94e' : '#c0563f';
          ctx.fillRect(s.x - w / 2, s.y - s.r - 4.5, w * hp, 1.8);
        }
      }
    }

    _projectiles(ctx, B) {
      const list = B.projectiles.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const len = p.kind === 'javelin' ? 11 : 8;
        const zx = p.x, zy = p.y - p.z;           // lift by arc height
        // faint shadow
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - Math.cos(p.ang) * len, p.y - Math.sin(p.ang) * len); ctx.stroke();
        ctx.strokeStyle = p.kind === 'javelin' ? '#5a3f22' : '#3c2c18';
        ctx.lineWidth = p.kind === 'javelin' ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(zx, zy);
        ctx.lineTo(zx - Math.cos(p.ang) * len, zy - Math.sin(p.ang) * len);
        ctx.stroke();
        if (p.kind !== 'javelin') {            // arrowhead
          ctx.fillStyle = '#cfc4a6';
          ctx.beginPath(); ctx.arc(zx, zy, 1.1, 0, U.TAU); ctx.fill();
        }
      }
    }

    _particles(ctx, B) {
      const list = B.particles.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const a = Math.max(0, p.life / p.max);
        if (p.k === 'blood') { ctx.fillStyle = 'rgba(150,28,18,' + (a * 0.9).toFixed(2) + ')'; }
        else if (p.k === 'dust') { ctx.fillStyle = 'rgba(150,134,98,' + (a * 0.45).toFixed(2) + ')'; }
        else if (p.k === 'spark') { ctx.fillStyle = 'rgba(255,236,180,' + a.toFixed(2) + ')'; }
        else if (p.k === 'mote') { ctx.fillStyle = (p.color || '#e9d27a'); ctx.globalAlpha = a; }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, U.TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    _banners(ctx, B, game) {
      // a small standard over each living friendly regiment (and enemy in deploy)
      for (const reg of B.regiments) {
        if (reg.alive <= 0) continue;
        if (B.started && reg.team === 1) continue;       // declutter enemy mid-fight
        const c = reg.cohesion();
        const def = reg.def;
        const top = c.y - 26;
        ctx.save();
        ctx.globalAlpha = B.started ? 0.6 : 0.95;
        ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, top); ctx.stroke();
        const pal = GI.paletteOf(reg.type);
        ctx.fillStyle = reg.team === 0 ? pal.tunic : '#5b3a78';
        this._pennant(ctx, c.x, top, 16, 10);
        ctx.fillStyle = 'rgba(255,245,220,0.95)';
        ctx.font = 'bold 9px serif'; ctx.textAlign = 'center';
        ctx.fillText(this._glyph(def), c.x + 8, top + 8);
        ctx.restore();
      }
      ctx.textAlign = 'left';
    }
    _pennant(ctx, x, y, w, h) {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 4, y + h / 2);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = 'rgba(40,30,18,0.7)'; ctx.lineWidth = 1; ctx.stroke();
    }
    _glyph(def) {
      if (def.role === 'cavalry') return '⚡';
      if (def.role === 'ranged') return '↑';
      if (def.role === 'beast') return '◆';
      if (def.standard) return '♦';
      if (def.aura) return '+';
      if (def.spear) return '↑';
      return '†';
    }

    _ghost(ctx, game) {
      const g = game.ghost;
      ctx.save();
      const ok = g.valid;
      ctx.fillStyle = ok ? 'rgba(120,180,110,0.16)' : 'rgba(190,60,40,0.18)';
      ctx.strokeStyle = ok ? 'rgba(220,235,180,0.8)' : 'rgba(220,120,90,0.85)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(g.x0, g.y0, g.w, g.h);
      ctx.strokeRect(g.x0, g.y0, g.w, g.h);
      // soldier dots preview
      ctx.fillStyle = ok ? 'rgba(230,210,150,0.85)' : 'rgba(220,120,90,0.85)';
      for (const p of g.points) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, U.TAU); ctx.fill(); }
      // label
      ctx.fillStyle = 'rgba(20,14,6,0.8)';
      ctx.fillRect(g.x0, g.y0 - 16, 120, 14);
      ctx.fillStyle = ok ? '#f0e2b8' : '#f0b8a0';
      ctx.font = '11px serif';
      ctx.fillText(`${GI.UNITS[g.type].name}  ×${g.count}  ${g.cost}d`, g.x0 + 4, g.y0 - 5);
      ctx.restore();
    }

    _selection(ctx, game) {
      const reg = game.selection;
      if (!reg || reg.alive <= 0) return;
      const c = reg.cohesion();
      ctx.save();
      ctx.strokeStyle = 'rgba(240,220,140,0.9)';
      ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y, 48, 0, U.TAU); ctx.stroke();
      ctx.restore();
    }

    _overlay(ctx, cam) {
      // parchment grain
      const p = ctx.createPattern(this.grain, 'repeat');
      ctx.fillStyle = p; ctx.fillRect(0, 0, cam.view.w, cam.view.h);
      // soft screen vignette
      const g = ctx.createRadialGradient(
        cam.view.w / 2, cam.view.h / 2, Math.min(cam.view.w, cam.view.h) * 0.35,
        cam.view.w / 2, cam.view.h / 2, Math.max(cam.view.w, cam.view.h) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,12,4,0.4)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cam.view.w, cam.view.h);
    }
  }

  GI.Renderer = Renderer;
})(window.GI = window.GI || {});
