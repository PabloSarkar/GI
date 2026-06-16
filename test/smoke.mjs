import { chromium } from 'playwright';
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
page.on('console', m => { if (m.type()==='error' && !/ERR_CERT|net::/.test(m.text())) errors.push('console.error: '+m.text()); });
page.on('pageerror', e => errors.push('pageerror: '+e.message));
await page.goto('file:///home/user/GI/index.html');
await page.waitForTimeout(1000);
await page.click('#btn-campaign'); await page.waitForTimeout(300);
await page.locator('.ls-card').first().click(); await page.waitForTimeout(500);
await page.click('#btn-auto'); await page.waitForTimeout(300);
await page.screenshot({ path: 'test/shot-deploy.png' });
await page.click('#btn-engage'); await page.waitForTimeout(100);
await page.evaluate(()=>window.GI._game.setSpeed(2));
await page.waitForTimeout(2600);
await page.screenshot({ path: 'test/shot-battle.png' });
// zoom in to showcase sprites
await page.evaluate(()=>{ const c=window.GI._game.cam; c.set(0,0,1.9); });
await page.waitForTimeout(900);
await page.screenshot({ path: 'test/shot-closeup.png' });
// run to conclusion
await page.evaluate(()=>window.GI._game.setSpeed(3));
await page.waitForTimeout(9000);
const st = await page.evaluate(()=>{ const g=window.GI._game,b=g.battle; return {phase:g.phase,over:b.over,result:b.result,rome:b.living(0),foe:b.living(1)}; });
console.log('final battle state:', JSON.stringify(st));
await browser.close();
console.log('ERRORS ('+errors.length+'):'); errors.forEach(e=>console.log('  '+e));
process.exit(errors.length?1:0);
