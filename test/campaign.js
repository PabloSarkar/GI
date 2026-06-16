const fs = require('fs');
global.window = global;
global.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => {} }), width:0, height:0 }) };
const load = f => eval(fs.readFileSync(f, 'utf8'));
['js/utils.js','js/units.js','js/levels.js','js/effects.js','js/soldier.js','js/battle.js'].forEach(load);
const GI = global.GI;
const noop = new Proxy({}, { get: () => () => {} });
const SEEDS=[3,17,91,404,777,2026,8888,123,55,9];

// mimic game.autoArray within a budget
function autoArmy(budget){
  const z=GI.DEPLOY_ZONE; const out=[]; let spent=0; let lineX=z.x1-70;
  const lines=[['velites',2,14],['hastati',3,14],['principes',3,12],['triarii',2,10],['sagittarii',2,12]];
  const place=(type,x,y,d,f)=>{ const def=GI.UNITS[type]; const c=d*f*def.cost; if(spent+c>budget) return 0; out.push({t:type,x,y,c:d,r:f}); spent+=c; return def.radius*2.2+3; };
  for(const [t,d,f] of lines){ const sp=place(t,lineX,0,d,f); if(sp) lineX-=(d*sp+30); }
  place('equites',z.x1-95,-210,2,4); place('equites',z.x1-95,210,2,4);
  let gx=lineX-20; while(gx>z.x0+50){ const sp=place('principes',gx,0,2,10); if(!sp)break; gx-=(2*sp+28); }
  return {blocks:out, spent};
}
function run(level, player, seed){
  const b=new GI.Battle(noop,null); b.reset(seed);
  for(const e of level.enemy) b.addRegiment(e.type,1,e.x,e.y,e.cols,e.rows);
  for(const p of player) b.addRegiment(p.t,0,p.x,p.y,p.c,p.r);
  b.begin(); let t=0; while(!b.over&&t<60*150){b.step(1/60);t++;}
  return b.result==='win';
}
console.log('level                         budget  enemy(n/value)  autoArmy(spent)  winRate');
for(const lv of GI.LEVELS){
  const ev=GI.enemyValue(lv);
  const army=autoArmy(lv.budget);
  let w=0; for(const s of SEEDS) if(run(lv,army.blocks,s)) w++;
  console.log(`${lv.name.padEnd(30)} ${String(lv.budget).padEnd(7)} ${String(ev.count+'/'+ev.value).padEnd(15)} ${String(army.spent).padEnd(16)} ${w}/${SEEDS.length}`);
}
