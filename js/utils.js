/* ==========================================================================
   GLADIVS IMPERIVM  —  utils.js
   Math helpers, seeded RNG, spatial hash grid, colour utilities, camera.
   Everything hangs off the global `GI` namespace so the game can run from a
   bare file:// open with no build step or server.
   ========================================================================== */
(function (GI) {
  'use strict';

  const TAU = Math.PI * 2;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
  const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  // Shortest signed difference between two angles, result in (-PI, PI].
  const angleDiff = (a, b) => {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  };
  const approach = (a, b, step) => {
    if (a < b) return Math.min(a + step, b);
    if (a > b) return Math.max(a - step, b);
    return a;
  };

  /* --- Seeded PRNG (mulberry32). A battle is reseeded from the same seed on
     reset, so a given deployment yields a repeatable fight — the puzzle can be
     solved deliberately rather than by luck. ------------------------------- */
  function makeRNG(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (lo, hi) => lo + rng() * (hi - lo);
    rng.int = (lo, hi) => Math.floor(rng() * (hi - lo + 1)) + lo;
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.sign = () => (rng() < 0.5 ? -1 : 1);
    // Gaussian-ish via averaging — cheap, bounded, good enough for scatter.
    rng.gauss = () => (rng() + rng() + rng() - 1.5) * 0.8;
    return rng;
  }

  /* --- Spatial hash grid. Lets the simulation answer "who is near me?" in
     roughly O(1) so thousands of soldiers stay at 60fps. Rebuilt each tick. - */
  class SpatialGrid {
    constructor(cell) {
      this.cell = cell;
      this.map = new Map();
    }
    _key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
    clear() { this.map.clear(); }
    insert(obj) {
      const cx = Math.floor(obj.x / this.cell);
      const cy = Math.floor(obj.y / this.cell);
      const k = this._key(cx, cy);
      let bucket = this.map.get(k);
      if (!bucket) { bucket = []; this.map.set(k, bucket); }
      bucket.push(obj);
    }
    // Visit every object within `radius` of (x,y). Callback returns nothing.
    query(x, y, radius, cb) {
      const r = Math.ceil(radius / this.cell);
      const cx = Math.floor(x / this.cell);
      const cy = Math.floor(y / this.cell);
      for (let gx = cx - r; gx <= cx + r; gx++) {
        for (let gy = cy - r; gy <= cy + r; gy++) {
          const bucket = this.map.get(this._key(gx, gy));
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) cb(bucket[i]);
        }
      }
    }
  }

  /* --- Colour helpers for procedural shading of sprites. ------------------ */
  function shade(hex, amt) {
    // amt in [-1,1]; negative darkens, positive lightens.
    const c = parseInt(hex.slice(1), 16);
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (amt >= 0) {
      r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt;
    } else {
      const m = 1 + amt; r *= m; g *= m; b *= m;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function rgba(hex, a) {
    const c = parseInt(hex.slice(1), 16);
    return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  }

  /* --- Camera: pan + zoom over the battlefield, with smoothing & clamping. */
  class Camera {
    constructor(view) {
      this.view = view;           // { w, h } in CSS pixels
      this.x = 0; this.y = 0;     // world point at screen centre
      this.zoom = 1;
      this.tx = 0; this.ty = 0; this.tzoom = 1; // targets for smoothing
      this.bounds = { minX: -2000, minY: -1200, maxX: 2000, maxY: 1200 };
      this.shakeT = 0; this.shakeMag = 0;
    }
    set(x, y, zoom) { this.x = this.tx = x; this.y = this.ty = y; this.zoom = this.tzoom = zoom; }
    glideTo(x, y, zoom) { this.tx = x; this.ty = y; this.tzoom = zoom; }   // smooth (targets only)
    panBy(dx, dy) { this.tx -= dx / this.tzoom; this.ty -= dy / this.tzoom; }
    zoomAt(sx, sy, factor) {
      const before = this.screenToWorld(sx, sy);
      this.tzoom = clamp(this.tzoom * factor, 0.32, 2.4);
      // Recompute so the cursor stays over the same world point.
      const k = 1 / this.tzoom;
      this.tx = before.x - (sx - this.view.w / 2) * k;
      this.ty = before.y - (sy - this.view.h / 2) * k;
    }
    shake(mag, dur) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, dur); }
    update(dt) {
      const s = 1 - Math.pow(0.0008, dt);
      this.x = lerp(this.x, this.tx, s);
      this.y = lerp(this.y, this.ty, s);
      this.zoom = lerp(this.zoom, this.tzoom, s);
      this.tx = clamp(this.tx, this.bounds.minX, this.bounds.maxX);
      this.ty = clamp(this.ty, this.bounds.minY, this.bounds.maxY);
      if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeMag = 0; }
    }
    get shakeOffset() {
      if (this.shakeT <= 0) return { x: 0, y: 0 };
      const m = this.shakeMag * Math.min(1, this.shakeT * 4);
      return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
    }
    apply(ctx) {
      const so = this.shakeOffset;
      ctx.translate(this.view.w / 2 + so.x, this.view.h / 2 + so.y);
      ctx.scale(this.zoom, this.zoom);
      ctx.translate(-this.x, -this.y);
    }
    screenToWorld(sx, sy) {
      return {
        x: (sx - this.view.w / 2) / this.zoom + this.x,
        y: (sy - this.view.h / 2) / this.zoom + this.y
      };
    }
    worldToScreen(wx, wy) {
      return {
        x: (wx - this.x) * this.zoom + this.view.w / 2,
        y: (wy - this.y) * this.zoom + this.view.h / 2
      };
    }
  }

  GI.util = {
    TAU, clamp, lerp, dist, dist2, angleTo, angleDiff, approach,
    makeRNG, SpatialGrid, shade, rgba, Camera
  };
})(window.GI = window.GI || {});
