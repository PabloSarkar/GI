const fs = require('fs');
global.window = global;
global.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }), width:0, height:0 }) };
const load = f => eval(fs.readFileSync(f, 'utf8'));
['js/utils.js','js/units.js','js/effects.js','js/soldier.js','js/battle.js'].forEach(load);
const GI = global.GI;
const noop = new Proxy({}, { get: () => () => {} });
const SEEDS = [1,7,42,1234,98765,555,31337,2026];

function once(pl, en, seed){
  const b = new GI.Battle(noop, null); b.reset(seed);
  for (const e of en) b.addRegiment(e.t,1,e.x,e.y,e.c,e.r);
  for (const p of pl) b.addRegiment(p.t,0,p.x,p.y,p.c,p.r);
  b.begin();
  let t=0; while(!b.over && t<60*150){ b.step(1/60); t++; }
  return { win: b.result==='win', surv: b.living(0), start: b.startCount[0], foe: b.living(1), t:t/60 };
}
function run(pl, en, label){
  let wins=0, surv=0, foe=0, tt=0;
  for (const s of SEEDS){ const r=once(pl,en,s); if(r.win)wins++; surv+=r.surv; foe+=r.foe; tt+=r.t; }
  const n=SEEDS.length;
  console.log(`${label.padEnd(42)} win ${wins}/${n}  avg surv ${(surv/n).toFixed(0)}/${pl.reduce((a,x)=>a+x.c*x.r,0)}  foe left ${(foe/n).toFixed(0)}  (${(tt/n).toFixed(0)}s)`);
}
const cost = b=>b.reduce((s,x)=>s+x.c*x.r*GI.UNITS[x.t].cost,0);

console.log('=== fair fights: Rome should win equal-cost reliably ===');
run([{t:'hastati',x:-300,y:0,c:8,r:5}], [{t:'gaul_warrior',x:300,y:0,c:8,r:5}], 'block 40 Hastati vs 40 Gauls');
run([{t:'hastati',x:-300,y:0,c:13,r:3}], [{t:'gaul_warrior',x:300,y:0,c:8,r:5}], 'wide 39 Hastati vs 40 Gauls');

console.log('\n=== campaign: a sensible plan should usually win ===');
const L1=[{t:'gaul_warrior',x:360,y:-40,c:8,r:4},{t:'gaul_warrior',x:470,y:130,c:6,r:3}];
run([{t:'hastati',x:-300,y:0,c:12,r:4}], L1, `L1 hastati 12x4 (enemy ${cost(L1)}d, budget 560)`);
const L4=[{t:'berserker',x:330,y:-90,c:6,r:3},{t:'berserker',x:330,y:90,c:6,r:3},{t:'berserker',x:470,y:0,c:5,r:3}];
run([{t:'principes',x:-280,y:0,c:11,r:4},{t:'medicus',x:-370,y:0,c:4,r:1},{t:'triarii',x:-340,y:0,c:8,r:1}], L4, `L4 vs berserkers (budget 1150)`);
const L6=[{t:'cart_spear',x:360,y:-110,c:10,r:3},{t:'cart_spear',x:360,y:110,c:10,r:3},{t:'gaul_archer',x:560,y:0,c:8,r:2}];
run([{t:'hastati',x:-260,y:0,c:14,r:3},{t:'equites',x:-340,y:-220,c:5,r:2},{t:'equites',x:-340,y:220,c:5,r:2},{t:'sagittarii',x:-400,y:0,c:10,r:2}], L6, `L6 vs phalanx (budget 1550)`);
const L7=[{t:'elephant',x:430,y:-150,c:1,r:1},{t:'elephant',x:430,y:0,c:1,r:1},{t:'elephant',x:430,y:150,c:1,r:1},{t:'cart_spear',x:320,y:0,c:9,r:3}];
run([{t:'sagittarii',x:-400,y:0,c:12,r:2},{t:'triarii',x:-300,y:-120,c:6,r:2},{t:'triarii',x:-300,y:120,c:6,r:2},{t:'hastati',x:-260,y:0,c:10,r:2}], L7, `L7 vs elephants (budget 1850)`);

console.log('\n=== unit identity (should be lopsided) ===');
run([{t:'triarii',x:-300,y:0,c:8,r:2}], [{t:'equites',x:300,y:0,c:6,r:2}], 'Triarii beat charging Equites');
run([{t:'equites',x:-300,y:-100,c:6,r:2}], [{t:'gaul_archer',x:300,y:0,c:8,r:3}], 'Equites ride down archers');
run([{t:'sagittarii',x:-300,y:0,c:10,r:3}], [{t:'sagittarii',x:300,y:0,c:10,r:3}], 'mirror (should be ~50/50)');
