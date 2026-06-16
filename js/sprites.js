/* ==========================================================================
   GLADIVS IMPERIVM  —  sprites.js
   Procedural figure painter. Every soldier is drawn by code in an ancient
   fresco / woodcut idiom: earthy fills, dark umber outlines, a single light
   from the upper-left. Figures are baked once per unit type into small
   offscreen canvases (three jittered variants each) and then rotate-blitted
   at battle time, which is what keeps a thousand men on screen smooth.

   Local space of a baked sprite: origin at the soldier's centre, forward = +x.
   ========================================================================== */
(function (GI) {
  'use strict';
  const U = GI.util;
  const SS = 2;                 // supersample factor for crisp sprites
  const INK = '#241608';        // outline umber

  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * SS); c.height = Math.ceil(h * SS);
    const x = c.getContext('2d');
    x.scale(SS, SS);
    x.lineJoin = 'round'; x.lineCap = 'round';
    return { c, x, w, h };
  }

  // Jitter a palette slightly so three baked variants don't look like clones.
  function jitter(pal, rng) {
    const out = {};
    for (const k in pal) out[k] = U.shade(pal[k], rng.gauss() * 0.06);
    return out;
  }

  function outline(x, lw) { x.lineWidth = lw == null ? 1.4 : lw; x.strokeStyle = INK; x.stroke(); }

  // ----- limb / prop primitives ------------------------------------------
  function ellipse(x, cx, cy, rx, ry, fill, stroke) {
    x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, U.TAU);
    x.fillStyle = fill; x.fill(); if (stroke !== false) outline(x);
  }
  function roundRect(x, rx, ry, w, h, r) {
    x.beginPath();
    x.moveTo(rx + r, ry);
    x.arcTo(rx + w, ry, rx + w, ry + h, r);
    x.arcTo(rx + w, ry + h, rx, ry + h, r);
    x.arcTo(rx, ry + h, rx, ry, r);
    x.arcTo(rx, ry, rx + w, ry, r);
    x.closePath();
  }

  // A generic standing body: shadow handled at draw time, here just the torso,
  // a cloak hint, and the head with helmet. Returns nothing; draws at origin.
  function body(x, pal, opt) {
    opt = opt || {};
    const sc = opt.scale || 1;
    // torso — wider across (y) than deep (x); slight forward lean
    x.save(); x.scale(sc, sc);
    // cloak / tunic skirt behind
    ellipse(x, -1.5, 0, 6.5, 8.2, U.shade(pal.cloth, -0.12));
    // shoulders / torso
    ellipse(x, 0.5, 0, 6.2, 7.4, pal.tunic);
    // chest highlight
    x.beginPath(); x.ellipse(1.6, -2.2, 3.0, 3.4, 0, 0, U.TAU);
    x.fillStyle = U.rgba('#ffffff', 0.10); x.fill();
    // armour band (lorica hint) for heavy types
    if (opt.armour) {
      x.strokeStyle = U.shade(pal.metal, 0.15); x.lineWidth = 1.2;
      for (let i = -1; i <= 1; i++) { x.beginPath(); x.ellipse(1.0, i * 2.3, 5.4, 2.0, 0, 0, Math.PI); x.stroke(); }
    }
    // head
    ellipse(x, 3.2, 0, 3.4, 3.4, pal.skin);
    // helmet dome
    if (opt.helmet !== false) {
      x.beginPath(); x.ellipse(3.2, 0, 3.7, 3.7, 0, -Math.PI * 0.95, Math.PI * 0.95);
      x.fillStyle = pal.metal; x.fill(); outline(x, 1.2);
      // cheek/neck guard
      x.beginPath(); x.arc(3.2, 0, 3.7, Math.PI * 0.55, Math.PI * 1.45);
      x.strokeStyle = U.shade(pal.metal, -0.25); x.lineWidth = 1.6; x.stroke();
    }
    // helmet crest — bold so a legionary reads instantly from above
    if (opt.crest) {
      const cc = opt.crestColor || '#b5302a';
      if (opt.crest === 'transverse') {       // plume running side-to-side
        roundRect(x, 2.3, -4.6, 1.9, 9.2, 0.9);
        x.fillStyle = cc; x.fill(); outline(x, 0.9);
        x.beginPath(); x.moveTo(3.25, -4.4); x.lineTo(3.25, 4.4);
        x.strokeStyle = U.shade(cc, 0.3); x.lineWidth = 0.5; x.stroke();
      } else {                                 // plume running front-to-back
        roundRect(x, 1.2, -1.0, 5.2, 2.0, 0.9);
        x.fillStyle = cc; x.fill(); outline(x, 0.9);
      }
    }
    x.restore();
  }

  // Roman scutum (big curved rectangle) or a round tribal shield.
  function shield(x, pal, kind, sc) {
    sc = sc || 1; x.save(); x.scale(sc, sc);
    if (kind === 'round') {
      ellipse(x, 4.5, -3.5, 4.6, 4.6, pal.shield);
      ellipse(x, 4.5, -3.5, 1.6, 1.6, pal.metal);
      x.strokeStyle = U.shade(pal.shield, 0.2); x.lineWidth = 0.8;
      x.beginPath(); x.arc(4.5, -3.5, 3.2, 0, U.TAU); x.stroke();
    } else { // scutum
      roundRect(x, 1.5, -8.5, 5.2, 12, 2.2);
      x.fillStyle = pal.shield; x.fill(); outline(x, 1.4);
      // vertical highlight + boss
      x.strokeStyle = U.rgba(pal.trim, 0.85); x.lineWidth = 0.9;
      x.beginPath(); x.moveTo(4.1, -7.6); x.lineTo(4.1, 2.6); x.stroke();
      ellipse(x, 4.1, -2.5, 1.5, 1.7, pal.metal);
      // gilt wing motif
      x.strokeStyle = U.rgba(pal.trim, 0.7); x.lineWidth = 0.7;
      x.beginPath(); x.moveTo(2.6, -5.5); x.quadraticCurveTo(4.1, -4.0, 5.6, -5.5); x.stroke();
      x.beginPath(); x.moveTo(2.6, 0.5); x.quadraticCurveTo(4.1, -1.0, 5.6, 0.5); x.stroke();
    }
    x.restore();
  }

  function sword(x, pal, sc) {
    sc = sc || 1; x.save(); x.scale(sc, sc);
    x.strokeStyle = U.shade(pal.metal, 0.25); x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(2, 5.5); x.lineTo(8.5, 7.2); x.stroke();
    x.strokeStyle = INK; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(2, 5.5); x.lineTo(8.5, 7.2); x.stroke();
    x.restore();
  }

  function spearProp(x, pal, len, sc) {
    sc = sc || 1; x.save(); x.scale(sc, sc);
    x.strokeStyle = '#6e4a26'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(-3, 1.5); x.lineTo(len, -1.5); x.stroke();
    // iron head
    x.beginPath();
    x.moveTo(len, -1.5); x.lineTo(len + 4, -2.4); x.lineTo(len + 1, -0.2); x.closePath();
    x.fillStyle = pal.metal; x.fill(); outline(x, 0.7);
    x.restore();
  }

  function bowProp(x, pal, sc) {
    sc = sc || 1; x.save(); x.scale(sc, sc);
    x.strokeStyle = '#6e4a26'; x.lineWidth = 1.6;
    x.beginPath(); x.arc(5.5, 0, 6.5, -1.1, 1.1); x.stroke();
    x.strokeStyle = U.rgba('#e8e0c8', 0.8); x.lineWidth = 0.5;
    x.beginPath(); x.moveTo(5.5 + 6.5 * Math.cos(-1.1), 6.5 * Math.sin(-1.1));
    x.lineTo(5.5 + 6.5 * Math.cos(1.1), 6.5 * Math.sin(1.1)); x.stroke();
    x.restore();
  }

  // ----- horse for cavalry ------------------------------------------------
  function horse(x, pal) {
    const hide = U.shade('#6b4a2e', pal._huejit || 0);
    // body
    ellipse(x, -2, 1.5, 11, 6.5, hide);
    // hindquarter
    ellipse(x, -9, 1.5, 6, 6, U.shade(hide, -0.06));
    // neck + head forward
    x.beginPath();
    x.moveTo(6, -1); x.quadraticCurveTo(12, -6, 16, -5);
    x.quadraticCurveTo(18.5, -4.5, 17.5, -2.5);
    x.quadraticCurveTo(13, -2, 8, 2.5); x.closePath();
    x.fillStyle = hide; x.fill(); outline(x, 1.3);
    // legs (suggested)
    x.strokeStyle = U.shade(hide, -0.25); x.lineWidth = 2.0;
    [[3, 6], [-7, 6], [5, -4], [-9, -4]].forEach(p => {
      x.beginPath(); x.moveTo(p[0], 1.5); x.lineTo(p[0] + 1, 6.5 * Math.sign(p[1])); x.stroke();
    });
    // mane + tail
    x.strokeStyle = '#2c1c10'; x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(8, -3); x.lineTo(11, -6); x.stroke();
    x.beginPath(); x.moveTo(-13, -1); x.quadraticCurveTo(-18, 1, -15, 6); x.stroke();
  }

  // ----- bakers per role --------------------------------------------------
  function bakeInfantry(def, pal, rng) {
    const dim = def.scale * 30;
    const o = newCanvas(dim, dim), x = o.x, cx = dim / 2, cy = dim / 2;
    x.translate(cx, cy);
    const heavy = def.role === 'melee' && def.defense > 0.38;
    body(x, pal, { scale: def.scale, armour: heavy, crest: heavy ? 'transverse' : (def.faction.startsWith('rome') ? 'longitudinal' : null), crestColor: pal.tunic });
    sword(x, pal, def.scale);
    shield(x, pal, def.faction.startsWith('rome') || def.faction === 'carthage' ? 'scutum' : 'round', def.scale);
    return finalize(o, cx, cy);
  }
  function bakeSpear(def, pal) {
    const dim = def.scale * 30, ext = 22;
    const o = newCanvas(dim + ext, dim), x = o.x, cx = dim / 2, cy = dim / 2;
    x.translate(cx, cy);
    spearProp(x, pal, 16, def.scale);
    body(x, pal, { scale: def.scale, armour: true, crest: def.faction.startsWith('rome') ? 'longitudinal' : null, crestColor: pal.tunic });
    shield(x, pal, def.faction === 'carthage' || def.faction.startsWith('rome') ? 'scutum' : 'round', def.scale);
    return finalize(o, cx, cy);
  }
  function bakeArcher(def, pal) {
    const dim = def.scale * 30;
    const o = newCanvas(dim + 10, dim), x = o.x, cx = dim / 2, cy = dim / 2;
    x.translate(cx, cy);
    body(x, pal, { scale: def.scale, helmet: def.faction.startsWith('rome') });
    bowProp(x, pal, def.scale);
    // quiver
    x.save(); x.scale(def.scale, def.scale);
    x.strokeStyle = '#5a3a1e'; x.lineWidth = 1.4;
    x.beginPath(); x.moveTo(-3, 2); x.lineTo(-6, -3); x.stroke();
    x.restore();
    return finalize(o, cx, cy);
  }
  function bakeSupport(def, pal) {
    const dim = def.scale * 32 + (def.standard ? 16 : 0);
    const o = newCanvas(dim, dim), x = o.x, cx = dim / 2, cy = def.standard ? dim * 0.62 : dim / 2;
    x.translate(cx, cy);
    if (def.standard) {
      // the Eagle standard rising above
      x.strokeStyle = '#6e4a26'; x.lineWidth = 2.0;
      x.beginPath(); x.moveTo(2, -2); x.lineTo(2, -dim * 0.5); x.stroke();
      // wreaths
      x.strokeStyle = pal.trim; x.lineWidth = 1.2;
      for (let i = 1; i <= 3; i++) { x.beginPath(); x.arc(2, -dim * 0.5 + i * 5, 2.4, 0, U.TAU); x.stroke(); }
      // eagle
      const ey = -dim * 0.5;
      x.fillStyle = pal.trim;
      x.beginPath();
      x.moveTo(2, ey - 4); x.quadraticCurveTo(-3, ey - 2, -1, ey + 2);
      x.lineTo(2, ey); x.lineTo(5, ey + 2); x.quadraticCurveTo(7, ey - 2, 2, ey - 4); x.closePath();
      x.fill(); outline(x, 0.8);
      // vexillum cloth
      roundRect(x, 2, ey + 6, 9, 7, 1); x.fillStyle = pal.tunic; x.fill(); outline(x, 1);
    }
    body(x, pal, { scale: def.scale, armour: def.standard, helmet: true });
    if (def.aura && def.aura.type === 'heal') {
      // medic staff + sash
      x.save(); x.scale(def.scale, def.scale);
      x.strokeStyle = '#caa15a'; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(4, 4); x.lineTo(9, -6); x.stroke();
      x.strokeStyle = '#e8e0c8'; x.lineWidth = 1.6;
      x.beginPath(); x.moveTo(-4, -4); x.lineTo(3, 5); x.stroke();
      x.restore();
    } else if (!def.standard) {
      sword(x, pal, def.scale);
      shield(x, pal, 'round', def.scale);
    }
    return finalize(o, cx, cy);
  }
  function bakeCavalry(def, pal, rng) {
    pal = Object.assign({}, pal); pal._huejit = rng.gauss() * 0.05;
    const dim = 52;
    const o = newCanvas(dim, dim), x = o.x, cx = dim * 0.42, cy = dim / 2;
    x.translate(cx, cy);
    horse(x, pal);
    // rider sits a touch back and up
    x.save(); x.translate(-1, -5);
    body(x, pal, { scale: 0.85, armour: !def.javelins, helmet: true, crest: def.faction.startsWith('rome') ? 'longitudinal' : null, crestColor: pal.tunic });
    if (def.javelins) spearProp(x, pal, 12, 0.8);
    else { sword(x, pal, 0.85); shield(x, pal, 'round', 0.8); }
    x.restore();
    return finalize(o, cx, cy);
  }
  function bakeElephant(def, pal) {
    const dim = 74;
    const o = newCanvas(dim, dim), x = o.x, cx = dim / 2, cy = dim / 2;
    x.translate(cx, cy);
    const hide = '#7a7066';
    // shadowy bulk
    ellipse(x, -3, 0, 22, 16, hide);
    ellipse(x, -14, 0, 11, 13, U.shade(hide, -0.05));   // rump
    // head + trunk
    x.beginPath();
    x.moveTo(15, -8); x.quadraticCurveTo(26, -6, 24, 2);
    x.quadraticCurveTo(30, 6, 26, 13); x.quadraticCurveTo(20, 9, 18, 6);
    x.quadraticCurveTo(14, 7, 12, 2); x.closePath();
    x.fillStyle = U.shade(hide, 0.04); x.fill(); outline(x, 1.6);
    // ear
    ellipse(x, 12, -6, 7, 8, U.shade(hide, -0.08));
    // tusks
    x.strokeStyle = '#e7ddc4'; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(20, 4); x.quadraticCurveTo(27, 8, 30, 6); x.stroke();
    // eye
    ellipse(x, 17, -4, 0.9, 0.9, '#1a120a', false);
    // legs
    x.fillStyle = U.shade(hide, -0.1);
    [[6, 11], [-12, 11], [9, -10], [-10, -10]].forEach(p => { roundRect(x, p[0] - 3, p[1] > 0 ? 8 : -16, 6, 9, 2); x.fill(); outline(x, 1); });
    // howdah (fighting tower) on the back
    roundRect(x, -10, -20, 16, 12, 2); x.fillStyle = '#6e4a26'; x.fill(); outline(x, 1.6);
    x.fillStyle = pal.tunic;
    for (let i = 0; i < 3; i++) { roundRect(x, -9 + i * 5, -19, 3, 5, 0.6); x.fill(); }
    // tiny crew + spears
    x.strokeStyle = INK; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(-4, -19); x.lineTo(2, -27); x.stroke();
    ellipse(x, -2, -21, 2, 2, pal.skin);
    return finalize(o, cx, cy);
  }

  function finalize(o, pivotX, pivotY) {
    return { canvas: o.c, pivotX: pivotX, pivotY: pivotY, w: o.w, h: o.h };
  }

  // ----- public cache -----------------------------------------------------
  const cache = {};   // type -> [variant0, variant1, variant2]
  function build(type) {
    if (cache[type]) return cache[type];
    const def = GI.UNITS[type];
    const basePal = GI.paletteOf(type);
    const variants = [];
    for (let v = 0; v < 3; v++) {
      const rng = U.makeRNG(0x9e3779b1 ^ (type.length * 2654435761) ^ (v * 40503));
      const pal = jitter(basePal, rng);
      let sprite;
      if (def.role === 'cavalry') sprite = bakeCavalry(def, pal, rng);
      else if (def.role === 'beast') sprite = bakeElephant(def, pal);
      else if (def.role === 'support') sprite = bakeSupport(def, pal);
      else if (def.role === 'ranged') sprite = bakeArcher(def, pal);
      else if (def.spear) sprite = bakeSpear(def, pal);
      else sprite = bakeInfantry(def, pal, rng);
      variants.push(sprite);
    }
    cache[type] = variants;
    return variants;
  }
  function buildAll() { for (const k in GI.UNITS) build(k); }

  // Draw one soldier (called from the renderer). Expects world transform set
  // by the camera; we add the per-soldier translate/rotate here.
  function drawSoldier(ctx, s, alpha) {
    const variants = cache[s.type] || build(s.type);
    const spr = variants[s.variant];
    const a = alpha == null ? 1 : alpha;
    ctx.save();
    ctx.translate(s.x, s.y);
    // soft contact shadow (not rotated)
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(1.5, s.r * 0.5 + 1.5, s.r * 1.05, s.r * 0.5, 0, 0, U.TAU);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.rotate(s.facing);
    // draw a touch larger than the collision radius so shields visually overlap
    // and the ranks read as a packed mass of men
    const k = (s.spriteScale || 1) * 1.22 / SS;
    ctx.scale(k, k);
    ctx.drawImage(spr.canvas, -spr.pivotX * SS, -spr.pivotY * SS);
    ctx.restore();
    // wound tint + attack flash are cheap overlays handled by renderer
  }

  GI.sprites = { build, buildAll, drawSoldier, getCache: (t) => cache[t] || build(t) };
})(window.GI = window.GI || {});
