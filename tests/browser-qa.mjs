
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=process.cwd();
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
 const requestPath=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+requestPath.replace(/\/$/,'/index.html'));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,buffer)=>{
  if(err){res.writeHead(404);res.end('Not found');return;}
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});
  res.end(buffer);
 });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url='http://127.0.0.1:'+server.address().port+'/';
let browser;
const errors=[],checks=[];
const check=async (title,fn)=>{await fn();checks.push('PASS '+title);};
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(url)&&r.status()>=400)errors.push('Local asset '+r.status()+' '+r.url());});
 await check('home mission image and founder About relocation',async()=>{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#home.active');
  assert.equal(await page.locator('#home .founder-portrait').count(),0,'Founder must not appear on Home');
  assert.equal(await page.locator('#home .btn-about').count(),1,'Home must link to About');
  await page.locator('#home .mission-visual img').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#home .mission-visual img')?.naturalWidth>0,null,{timeout:15000});
  await page.locator('#home .btn-about').click();
  await page.waitForSelector('#about.active');
  assert.equal(await page.locator('#about .founder-story').count(),1);
  await page.locator('#about .founder-portrait img').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#about .founder-portrait img')?.naturalWidth>0,null,{timeout:15000});
 });
 await check('mission tabs update content',async()=>{
  await page.evaluate(()=>location.hash='home');
  await page.waitForSelector('#home.active');
  await page.locator('[data-mission="evidence"]').click();
  assert.match(await page.locator('#missionPanel').innerText(),/source behind/i);
 });
 await check('30 teams and search filtering',async()=>{
  await page.locator('.nav [data-page="teams"]').click();
  await page.waitForSelector('#teams.active');
  await page.locator('#teamSearch').fill('Warriors');
  assert.equal(await page.locator('#teamGrid button.team').count(),1);
  assert.match(await page.locator('#teamGrid button.team').innerText(),/Golden State Warriors/);
 });
 await check('teams have logo image URLs',async()=>{
  const src=await page.locator('#teamGrid button.team img').first().getAttribute('src');
  assert.match(src,/cdn\.nba\.com\/logos\/nba\/1610612744\/global\/L\/logo\.svg/);
 });
 await check('scout shows sourced season record',async()=>{
  await page.evaluate(()=>location.hash='scout');
  await page.waitForSelector('#scout.active');
  await page.waitForFunction(()=>/Current record|Live records could not be retrieved/.test(document.querySelector('#scoutReadout')?.textContent||''),null,{timeout:20000});
  const txt=await page.locator('#scoutReadout').innerText();
  assert.match(txt,/Current record/,'Current standings did not reach scouting page: '+txt);
 });
 await check('comparison provides sourced records',async()=>{
  await page.evaluate(()=>location.hash='compare');
  await page.waitForSelector('#compare.active');
  await page.waitForFunction(()=>document.querySelector('#compareData')?.textContent?.includes('win rate'),null,{timeout:20000});
 });
 await check('date-labelled results feed works',async()=>{
  await page.evaluate(()=>location.hash='live');
  await page.waitForSelector('#live.active');
  await page.waitForFunction(()=>document.getElementById('liveFeedStatus')?.textContent?.includes('games validated'),null,{timeout:25000});
  assert.ok(await page.locator('#liveResults .result-card').count()>=1,'No dated games shown');
 });
 await check('History removed from navigation and no history page',async()=>{
  assert.equal(await page.locator('.nav [data-page="archive"]').count(),0);
  assert.equal(await page.locator('#archive').count(),0);
 });
 await check('Teams page shows 30 sourced statistics and working info icons',async()=>{
  await page.evaluate(()=>location.hash='teams');
  await page.waitForSelector('#teams.active');
  await page.waitForSelector('#teamDetails .team-metric',{timeout:20000});
  assert.equal(await page.locator('#teamDetails .team-metric').count(),30);
  assert.equal(await page.locator('#teamDetails .team-metric .metric-info summary').count(),30);
  assert.equal(await page.locator('#teamDetails .spotlight-metric').count(),4);
  const before=await page.locator('#teamDetails h2').innerText();
  await page.locator('#teamSearch').fill('Celtics');
  await page.locator('#teamGrid button[data-team="BOS"]').click();
  assert.match(await page.locator('#teamDetails h2').innerText(),/Boston Celtics/);
  await page.locator('#teamDetails .team-metric .metric-info summary').first().click();
  assert.equal(await page.locator('#teamDetails details[open]').count(),1);
  assert.ok((await page.locator('#teamDetails details[open] .metric-info-pop').innerText()).length>8);
 });
 await check('Learn has all 30 plain-language definitions without team values',async()=>{
  await page.evaluate(()=>location.hash='library');
  await page.waitForSelector('#library.active');
  await page.waitForSelector('#glossaryGrid .learn-metric',{timeout:20000});
  assert.equal(await page.locator('#glossaryGrid .learn-metric').count(),30);
  assert.equal(await page.locator('#glossaryGrid .learn-metric .metric-info summary').count(),30);
  assert.equal(await page.locator('#glossaryGrid .team-metric-value').count(),0);
  assert.equal(await page.locator('#glossaryGrid .learn-measure').count(),30);
  await page.locator('#glossaryGrid .metric-info summary').first().click();
  assert.equal(await page.locator('#glossaryGrid details[open]').count(),1);
  await page.locator('#glossarySearch').fill('rebound');
  assert.ok(await page.locator('#glossaryGrid .learn-metric').count()>0);
 });
 await check('Scenarios show completed games not hypothetical future probabilities',async()=>{
  await page.evaluate(()=>location.hash='matchups');
  await page.waitForSelector('#matchups.active');
  await page.waitForSelector('#pastGameSelect option',{state:'attached',timeout:20000});
  assert.ok(await page.locator('#pastGameSelect option').count()>0);
  assert.equal(await page.locator('#pastGameReport .past-facts article').count(),4);
 });
 await check('Game Room has NBA Cup and playoffs and verified team comparisons',async()=>{
  await page.evaluate(()=>location.hash='gameroom');
  await page.waitForSelector('#gameroom.active');
  assert.equal(await page.locator('#competitionDesk .competition-card').count(),2);
  await page.waitForSelector('#gameRoomContext .game-context-metric',{timeout:20000});
  assert.equal(await page.locator('#gameRoomContext .game-context-metric').count(),4);
 });
 await check('hypothetical scenarios save and restore locally',async()=>{
  await page.evaluate(()=>location.hash='insights');
  await page.waitForSelector('#insights.active');
  await page.locator('#studioSave').click();
  await page.waitForSelector('#studioSaved [data-restore-scenario]');
  assert.match(await page.locator('#studioStatus').innerText(),/Saved/);
 });
 await check('mobile layout has no horizontal content overflow',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>location.hash='home');
  await page.waitForSelector('#home.active');
  const o=await page.evaluate(()=>({body:document.body.scrollWidth,view:window.innerWidth}));
  assert.ok(o.body<=o.view+6,'Mobile overflow: '+JSON.stringify(o));
 });
 await check('phone menu opens, navigates to About, then closes',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>location.hash='home');
  await page.waitForSelector('#home.active');
  assert.equal(await page.locator('#mobileMenuToggle').isVisible(),true);
  assert.equal(await page.locator('#siteNavigation').isVisible(),false);
  await page.locator('#mobileMenuToggle').click();
  assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#siteNavigation [data-page="about"]').isVisible(),true);
  await page.locator('#siteNavigation [data-page="about"]').click();
  await page.waitForSelector('#about.active');
  assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#siteNavigation').isVisible(),false);
 });
 await check('major pages fit 320px, 360px, 390px, 430px and 768px screens',async()=>{
  const sizes=[320,360,390,430,768],routes=['home','about','teams','library','gameroom','matchups'];
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of sizes){
   await page.setViewportSize({width,height:812});
   for(const id of routes){
    await page.evaluate(id=>location.hash=id,id);
    await page.waitForSelector('#'+id+'.active');
    const data=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,root:document.documentElement.scrollWidth,body:document.body.scrollWidth,page:document.querySelector('.page.active')?.scrollWidth}));
    assert.ok(data.root<=data.viewport+2,'Horizontal overflow at '+width+'px / '+id+': '+JSON.stringify(data));
    assert.ok(data.body<=data.viewport+2,'Body overflow at '+width+'px / '+id+': '+JSON.stringify(data));
   }
  }
 });
 assert.deepEqual(errors,[],'Uncaught browser errors or missing local files');
 console.log(checks.join('\n'));
 console.log('PASS browser QA: '+checks.length+' checks, no uncaught errors');
}catch(err){console.error('BROWSER QA FAILED:',err.stack||err);console.error('page errors:',errors);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
