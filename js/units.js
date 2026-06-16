/* ==========================================================================
   GLADIVS IMPERIVM  —  units.js
   Roster definitions. Stats are tuned for a watchable, puzzle-solvable fight:
   disciplined Roman lines win a fair grind, barbarians rely on numbers and a
   fierce charge, spears shatter horse, missiles soften, and the elephants are
   a terror that can turn on their own. Damage model:

       applied = attack * (1 - targetDefense)   per attack tick

   Distances are world units (battlefield ~1800 wide). Soldier radius ~7.
   ========================================================================== */
(function (GI) {
  'use strict';

  // Faction colour palettes used by the procedural sprite painter.
  const PALETTE = {
    rome:     { tunic: '#9e2b22', cloth: '#caa15a', metal: '#b98f4e', shield: '#8f2018', trim: '#e7c558', skin: '#c89b6e' },
    romeBlue: { tunic: '#2f5d6e', cloth: '#caa15a', metal: '#b98f4e', shield: '#27506b', trim: '#d9c07a', skin: '#c89b6e' },
    gaul:     { tunic: '#3f6b6f', cloth: '#7b8a3c', metal: '#8a8f96', shield: '#6d5530', trim: '#cdb98a', skin: '#caa074' },
    german:   { tunic: '#5a4632', cloth: '#736253', metal: '#7f8489', shield: '#4a3a28', trim: '#b9a07a', skin: '#cba679' },
    carthage: { tunic: '#5b3a78', cloth: '#e6e2d4', metal: '#c2a14e', shield: '#48305f', trim: '#e8d27a', skin: '#b98a5f' },
    beast:    { tunic: '#7d7468', cloth: '#5e564c', metal: '#9a9088', shield: '#6a625a', trim: '#cbbfa6', skin: '#8a8076' }
  };

  const UNITS = {
    /* ---- ROME (player roster) ----------------------------------------- */
    velites: {
      key: 'velites', name: 'Velites', faction: 'rome', role: 'ranged',
      cost: 9, hp: 44, attack: 11, defense: 0.10, reach: 11, speed: 58, mass: 0.9,
      radius: 6.5, morale: 70, resolve: 0.9, cohesion: 0.5, attackRate: 1.0,
      range: 200, projType: 'javelin', ammo: 4, projDmg: 24, projSpeed: 420,
      kite: true, palette: 'rome', scale: 0.92,
      desc: 'Light skirmishers. Hurl javelins, then fall back. Cheap, but they fold in a melee.'
    },
    hastati: {
      key: 'hastati', name: 'Hastati', faction: 'rome', role: 'melee',
      cost: 12, hp: 82, attack: 16, defense: 0.32, reach: 12, speed: 46, mass: 1.1,
      radius: 7, morale: 100, resolve: 1.4, cohesion: 1.0, attackRate: 0.9,
      pilum: true, palette: 'rome', scale: 1.0,
      desc: 'The young front rank. Gladius and scutum, drilled to hold. The backbone of the line.'
    },
    principes: {
      key: 'principes', name: 'Principes', faction: 'rome', role: 'melee',
      cost: 18, hp: 118, attack: 20, defense: 0.44, reach: 12, speed: 42, mass: 1.25,
      radius: 7.2, morale: 124, resolve: 1.7, cohesion: 1.15, attackRate: 0.85,
      pilum: true, palette: 'rome', scale: 1.05,
      desc: 'Seasoned heavy infantry in mail. They hit harder and hold longer — the line that wins fights.'
    },
    triarii: {
      key: 'triarii', name: 'Triarii', faction: 'rome', role: 'melee',
      cost: 24, hp: 148, attack: 18, defense: 0.50, reach: 22, speed: 34, mass: 1.5,
      radius: 7.5, morale: 160, resolve: 2.1, cohesion: 1.45, attackRate: 0.95,
      spear: true, antiCav: 2.6, palette: 'rome', scale: 1.08,
      desc: 'Veteran spearmen. A wall of points that shatters any charge. "It has come to the triarii."'
    },
    sagittarii: {
      key: 'sagittarii', name: 'Sagittarii', faction: 'romeBlue', role: 'ranged',
      cost: 14, hp: 46, attack: 9, defense: 0.10, reach: 11, speed: 50, mass: 0.85,
      radius: 6.5, morale: 64, resolve: 0.9, cohesion: 0.6, attackRate: 0.8,
      range: 330, projType: 'arrow', ammo: Infinity, projDmg: 17, projSpeed: 520,
      palette: 'romeBlue', scale: 0.95,
      desc: 'Auxiliary archers. Long reach, endless arrows, helpless if caught. Keep them screened.'
    },
    equites: {
      key: 'equites', name: 'Equites', faction: 'rome', role: 'cavalry',
      cost: 28, hp: 135, attack: 19, defense: 0.38, reach: 16, speed: 120, mass: 2.6,
      radius: 10, morale: 132, resolve: 1.5, cohesion: 0.8, attackRate: 0.9,
      charge: 80, mounted: true, palette: 'rome', scale: 1.0,
      desc: 'Roman horse. A thunderous charge that breaks flanks and runs down fleeing men. Blunted by spears.'
    },
    medicus: {
      key: 'medicus', name: 'Medicus', faction: 'romeBlue', role: 'support',
      cost: 22, hp: 60, attack: 6, defense: 0.2, reach: 11, speed: 48, mass: 0.9,
      radius: 6.8, morale: 90, resolve: 1.2, cohesion: 0.7, attackRate: 1.2,
      aura: { type: 'heal', radius: 100, power: 11 }, palette: 'romeBlue', scale: 0.95,
      desc: 'Field surgeons. Mend nearby soldiers over time. Place them behind the line — the heart of "pull and heal".'
    },
    aquilifer: {
      key: 'aquilifer', name: 'Aquilifer', faction: 'rome', role: 'support',
      cost: 26, hp: 100, attack: 12, defense: 0.4, reach: 12, speed: 44, mass: 1.2,
      radius: 7.2, morale: 240, resolve: 3.0, cohesion: 1.2, attackRate: 1.0,
      aura: { type: 'morale', radius: 140, power: 18 }, standard: true,
      palette: 'rome', scale: 1.06,
      desc: 'Bearer of the Eagle. Steadies every legionary near it; men die before they let the standard fall.'
    },

    /* ---- GAULS / GERMANS (enemy) -------------------------------------- */
    gaul_warrior: {
      key: 'gaul_warrior', name: 'Gallic Warrior', faction: 'gaul', role: 'melee',
      cost: 11, hp: 78, attack: 15, defense: 0.16, reach: 13, speed: 50, mass: 1.1,
      radius: 7, morale: 74, resolve: 0.8, cohesion: 0.7, attackRate: 0.95,
      charge: 26, palette: 'gaul', scale: 1.02,
      desc: 'Fierce tribal swordsmen who fight as individuals — terrifying on the charge, brittle once stalled.'
    },
    gaul_archer: {
      key: 'gaul_archer', name: 'Gallic Hunter', faction: 'gaul', role: 'ranged',
      cost: 12, hp: 44, attack: 8, defense: 0.08, reach: 11, speed: 52, mass: 0.85,
      radius: 6.5, morale: 56, resolve: 0.7, cohesion: 0.5, attackRate: 1.0,
      range: 300, projType: 'arrow', ammo: Infinity, projDmg: 14, projSpeed: 500,
      palette: 'gaul', scale: 0.95, desc: 'Tribal bowmen. They sting from afar but cannot stand a charge.'
    },
    berserker: {
      key: 'berserker', name: 'Germanic Berserker', faction: 'german', role: 'melee',
      cost: 16, hp: 96, attack: 26, defense: 0.06, reach: 13, speed: 64, mass: 1.05,
      radius: 7, morale: 240, resolve: 3.0, cohesion: 0.3, attackRate: 0.7,
      charge: 34, frenzy: true, palette: 'german', scale: 1.04,
      desc: 'Bare-chested madmen who feel no fear and few wounds. They never break — they must be killed.'
    },
    chieftain: {
      key: 'chieftain', name: 'Tribal Chieftain', faction: 'gaul', role: 'support',
      cost: 30, hp: 185, attack: 26, defense: 0.3, reach: 14, speed: 50, mass: 1.4,
      radius: 8, morale: 240, resolve: 3.0, cohesion: 0.8, attackRate: 0.85,
      charge: 24, aura: { type: 'morale', radius: 150, power: 16 }, palette: 'gaul', scale: 1.12,
      desc: 'A towering warlord whose presence drives the tribe into a fury. Cut him down and the clans waver.'
    },

    /* ---- CARTHAGE (enemy) --------------------------------------------- */
    cart_spear: {
      key: 'cart_spear', name: 'Libyan Spearman', faction: 'carthage', role: 'melee',
      cost: 15, hp: 108, attack: 15, defense: 0.42, reach: 22, speed: 36, mass: 1.45,
      radius: 7.4, morale: 124, resolve: 1.6, cohesion: 1.5, attackRate: 1.0,
      spear: true, antiCav: 2.3, palette: 'carthage', scale: 1.05,
      desc: 'Disciplined African phalanx — a hedge of spears that grinds forward. Murderous head-on; turn its flank.'
    },
    numidian: {
      key: 'numidian', name: 'Numidian Horse', faction: 'carthage', role: 'cavalry',
      cost: 22, hp: 88, attack: 13, defense: 0.16, reach: 14, speed: 138, mass: 2.0,
      radius: 9.5, morale: 92, resolve: 1.0, cohesion: 0.4, attackRate: 0.9,
      charge: 28, mounted: true, javelins: true, range: 150, projType: 'javelin',
      projDmg: 18, projSpeed: 400, ammo: 6, palette: 'carthage', scale: 0.98,
      desc: 'Swift light horse that swarm, harass with javelins, and run rings around heavy foot.'
    },
    elephant: {
      key: 'elephant', name: 'War Elephant', faction: 'beast', role: 'beast',
      cost: 60, hp: 900, attack: 48, defense: 0.55, reach: 26, speed: 56, mass: 9,
      radius: 22, morale: 220, resolve: 3.0, cohesion: 0, attackRate: 1.0,
      charge: 170, trample: 1, panic: true, palette: 'beast', scale: 1.0,
      desc: 'A living battering ram that tramples ranks flat — but a wounded beast panics and rampages through its own side.'
    }
  };

  function paletteOf(type) { return PALETTE[UNITS[type].palette] || PALETTE.rome; }
  const ROSTER = ['velites', 'hastati', 'principes', 'triarii', 'sagittarii', 'equites', 'medicus', 'aquilifer'];

  GI.UNITS = UNITS;
  GI.PALETTE = PALETTE;
  GI.ROSTER = ROSTER;
  GI.paletteOf = paletteOf;
})(window.GI = window.GI || {});
