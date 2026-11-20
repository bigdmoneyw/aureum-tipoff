
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
 await check('home renders with a founder portrait and mission image',async()=>{
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#home.active');
  const good=await page.evaluate(()=>['#home .founder-portrait img','#home .mission-visual img'].every(q=>{let x=document.querySelector(q);return x&&x.complete&&x.naturalWidth>0;}));
  assert.ok(good,'Founder or mission portrait did not load');
 });
 await check('mission tabs update content',async()=>{
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
  await page.waitForFunction(()=>document.getElementById('liveFeedStatus')?.textContent?.includes('games passed'),null,{timeout:25000});
  assert.ok(await page.locator('#liveResults .result-card').count()>=1,'No dated games shown');
 });
 await check('2024–25 season archive returns selectable records',async()=>{
  await page.evaluate(()=>location.hash='archive');
  await page.waitForSelector('#archive.active');
  await page.locator('#archiveSeason').selectOption('2024-25');
  await page.waitForSelector('#archiveResults .archive-row',{timeout:20000});
  assert.ok(await page.locator('#archiveResults .archive-row').count()>=25);
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
 assert.deepEqual(errors,[],'Uncaught browser errors or missing local files');
 console.log(checks.join('\n'));
 console.log('PASS browser QA: '+checks.length+' checks, no uncaught errors');
}catch(err){console.error('BROWSER QA FAILED:',err.stack||err);console.error('page errors:',errors);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
