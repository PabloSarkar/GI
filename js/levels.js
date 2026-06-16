/* ==========================================================================
   GLADIVS IMPERIVM  —  levels.js
   The campaign. Each scenario pre-places a visible enemy army and hands the
   player a budget of denarii; like Winter Falling, the fight is a puzzle you
   solve by composition and positioning, and you may retry freely.

   Geometry note: armies face along X (you on the left, foe on the right), so a
   battle LINE runs along Y. Formations are written e(type, x, y, ranks, files):
     ranks = depth toward the enemy (small),  files = frontage across (large).
   Difficulty ramps as new threats appear: tribal charges, fearless berserkers,
   the spear-wall, light cavalry that won't stand, and finally the elephants.
   ========================================================================== */
(function (GI) {
  'use strict';

  // e(type, x, y, ranks(depth,X), files(frontage,Y))
  const e = (type, x, y, ranks, files) => ({ type, x, y, cols: ranks, rows: files });

  const LEVELS = [
    {
      id: 1, name: 'I. First Blood',
      place: 'Frontier of Latium', year: 'A.U.C. 365',
      brief: 'A Gallic war-band has crossed the river to raid. Form a line and throw them back. Pick a unit, then DRAG on the field to array a block of men; press ENGAGE when your line is set.',
      hint: 'Hastati are your bread and butter. Draw a wide, deep line of them and the loose tribal charge will break on your shields.',
      budget: 620,
      enemy: [ e('gaul_warrior', 350, -30, 3, 10), e('gaul_warrior', 460, 70, 3, 6) ]
    },
    {
      id: 2, name: 'II. The River Ford',
      place: 'Crossing of the Anio', year: 'A.U.C. 367',
      brief: 'They have brought hunters this time, loosing arrows from behind their warriors. Close the distance before your front rank is whittled away.',
      hint: 'Massed shields shrug off arrows. Or answer fire with your own Sagittarii — kept safe behind the line.',
      budget: 820,
      enemy: [ e('gaul_warrior', 340, 0, 3, 12), e('gaul_archer', 530, -170, 2, 7), e('gaul_archer', 530, 170, 2, 7) ]
    },
    {
      id: 3, name: 'III. Hill of Crows',
      place: 'Etruscan Highlands', year: 'A.U.C. 372',
      brief: 'A chieftain has rallied the clans. His presence makes them bold — they will not break easily while he lives.',
      hint: 'Cut the head from the body. Equites can sweep a flank and ride the chieftain down before the lines even meet.',
      budget: 1120,
      enemy: [ e('gaul_warrior', 330, 0, 3, 14), e('chieftain', 455, 0, 1, 1),
               e('gaul_archer', 560, -190, 2, 6), e('gaul_archer', 560, 190, 2, 6) ]
    },
    {
      id: 4, name: 'IV. The Dark Forest',
      place: 'Beyond the Rhenus', year: 'A.U.C. 390',
      brief: 'Germanic berserkers. They feel neither fear nor pain — routing them is impossible. Every one must be cut down where he stands.',
      hint: 'You cannot break what has no fear. Soak the frenzy with deep ranks of Principes and a Medicus behind to mend the line as it grinds them out.',
      budget: 1250,
      enemy: [ e('berserker', 330, -130, 3, 6), e('berserker', 330, 130, 3, 6), e('berserker', 460, 0, 3, 6) ]
    },
    {
      id: 5, name: 'V. Ambush at the Pass',
      place: 'The Alpine Defiles', year: 'A.U.C. 401',
      brief: 'Tribesmen hold the pass, screened by light horse that dart in and away. If your line chases shadows it will be cut apart.',
      hint: 'Hold formation — do not let cavalry bait your men out. Triarii on the wings; spears make a charge regret itself.',
      budget: 1450,
      enemy: [ e('gaul_warrior', 330, 0, 3, 14), e('chieftain', 450, 0, 1, 1),
               e('numidian', 540, -240, 2, 5), e('numidian', 540, 240, 2, 5) ]
    },
    {
      id: 6, name: 'VI. The Spear Wall',
      place: 'Sicilian Plains', year: 'A.U.C. 490',
      brief: 'Carthage fields her Libyan phalanx — a disciplined hedge of spears that will gut any frontal assault.',
      hint: 'Never charge a braced spear head-on. Pin it with infantry, then roll a flank with cavalry and rake it with arrows from the side.',
      budget: 1750,
      enemy: [ e('cart_spear', 360, 0, 4, 16), e('gaul_archer', 560, -120, 2, 6), e('gaul_archer', 560, 120, 2, 6) ]
    },
    {
      id: 7, name: 'VII. The Elephants of Carthage',
      place: 'Bagradas Valley', year: 'A.U.C. 499',
      brief: 'War elephants. They will trample any rank in their path and break the nerve of brave men — but a wounded beast is a peril to its own side.',
      hint: 'Do not pack a dense block in front of a charging elephant. Wound them with javelins and arrows — panic one and it will rampage back through Carthage.',
      budget: 1650,
      enemy: [ e('elephant', 430, -170, 1, 1), e('elephant', 430, 0, 1, 1), e('elephant', 430, 170, 1, 1),
               e('cart_spear', 320, 0, 3, 14) ]
    },
    {
      id: 8, name: 'VIII. The Combined Host',
      place: 'Iberian Coast', year: 'A.U.C. 539',
      brief: 'A full Carthaginian army bars the road: phalanx in the centre, horse on a wing, berserkers on the other, hunters behind. No single trick will serve.',
      hint: 'Anchor the centre, win one flank first, then fold the line in on itself. Combined arms beats a one-note army.',
      budget: 2300,
      enemy: [ e('cart_spear', 340, 0, 4, 16), e('numidian', 560, -250, 2, 7),
               e('berserker', 540, 250, 3, 6), e('gaul_archer', 660, 0, 2, 10) ]
    },
    {
      id: 9, name: 'IX. Sands of Numidia',
      place: 'The African Interior', year: 'A.U.C. 545',
      brief: 'Endless light horse on open ground. They swarm, sting with javelins, and never close. Your foot soldiers cannot catch the wind.',
      hint: 'Bring your own horse to run them down and a screen of archers to punish them when they wheel. Keep your blocks tight or be swarmed.',
      budget: 2500,
      enemy: [ e('numidian', 430, -260, 2, 7), e('numidian', 430, -90, 2, 7),
               e('numidian', 430, 90, 2, 7), e('numidian', 430, 260, 2, 7),
               e('cart_spear', 300, 0, 3, 12) ]
    },
    {
      id: 10, name: 'X. The Field of Zama',
      place: 'Plains of Zama', year: 'A.U.C. 552',
      brief: 'The final reckoning. Elephants to the front, the phalanx behind, cavalry on both wings, a warlord to steel them all. Win here and the war is yours. Rome endures.',
      hint: 'Everything you have learned: lanes to let the elephants pass and panic, spears for the wings, a hammer of cavalry, and the Eagle to keep your line unbroken.',
      budget: 3400,
      enemy: [
        e('elephant', 440, -300, 1, 1), e('elephant', 440, -100, 1, 1),
        e('elephant', 440, 100, 1, 1), e('elephant', 440, 300, 1, 1),
        e('cart_spear', 300, -130, 4, 11), e('cart_spear', 300, 130, 4, 11),
        e('numidian', 640, -340, 2, 6), e('numidian', 640, 340, 2, 6),
        e('berserker', 560, 0, 3, 8), e('chieftain', 480, 0, 1, 1),
        e('gaul_archer', 720, 0, 2, 10)
      ]
    }
  ];

  // Player deployment zone (left third). Enemy fills the right.
  const DEPLOY_ZONE = { x0: -880, y0: -460, x1: -210, y1: 460 };

  function enemyValue(level) {
    let v = 0, n = 0;
    for (const b of level.enemy) {
      const c = (b.cols * b.rows);
      v += c * (GI.UNITS[b.type].cost || 10); n += c;
    }
    return { value: v, count: n };
  }
  function enemyRoster(level) {
    const m = new Map();
    for (const b of level.enemy) m.set(b.type, (m.get(b.type) || 0) + b.cols * b.rows);
    return [...m.entries()].map(([type, n]) => ({ type, n }));
  }

  GI.LEVELS = LEVELS;
  GI.DEPLOY_ZONE = DEPLOY_ZONE;
  GI.enemyValue = enemyValue;
  GI.enemyRoster = enemyRoster;
})(window.GI = window.GI || {});
