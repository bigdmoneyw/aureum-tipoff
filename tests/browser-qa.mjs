
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
 await check('Compare mirrors Teams with 30 sourced season metrics for each franchise',async()=>{
  await page.evaluate(()=>location.hash='compare');
  await page.waitForSelector('#compare.active');
  await page.waitForSelector('#compareData .compare-metric',{timeout:20000});
  assert.equal(await page.locator('#compareData .compare-franchise-card').count(),2);
  assert.equal(await page.locator('#compareData .compare-franchise-card .team-profile-logo').count(),2);
  assert.equal(await page.locator('#compareData .compare-metric').count(),30);
  assert.equal(await page.locator('#compareData .compare-value-first').count(),30);
  assert.equal(await page.locator('#compareData .compare-value-second').count(),30);
  assert.equal(await page.locator('#compareData .compare-metric .metric-info-trigger').count(),30);
  assert.equal(await page.locator('#compareData .compare-spotlight').count(),4);
  const snapshot=JSON.parse(fs.readFileSync('data/teams-2027.json','utf8'));
  const record=code=>snapshot.records.find(r=>r.code===code);
  const wins=await page.locator('#compareData .compare-metric[data-stat="wins"] .team-metric-value').allInnerTexts();
  assert.deepEqual(wins,[String(record('GSW').values.wins),String(record('BOS').values.wins)],'Compare must show the exact same season wins as Teams');
  const hover=page.locator('#compareData .compare-metric[data-stat="wins"] .metric-info-trigger');
  const tooltip=page.locator('#compareData .compare-metric[data-stat="wins"] .metric-info-pop');
  assert.equal(await tooltip.isVisible(),false);
  await hover.hover();
  assert.equal(await tooltip.isVisible(),true,'Compare tooltips must appear on hover, no click');
  await page.mouse.move(0,0);
  assert.equal(await tooltip.isVisible(),false);
  await page.locator('#compareB').selectOption('NYK');
  assert.match(await page.locator('#compareData .compare-franchise-second h2').innerText(),/New York Knicks/);
  const selectedWins=await page.locator('#compareData .compare-metric[data-stat="wins"] .team-metric-value').allInnerTexts();
  assert.deepEqual(selectedWins,[String(record('GSW').values.wins),String(record('NYK').values.wins)]);
  await page.locator('#compareSwap').click();
  assert.equal(await page.locator('#compareA').inputValue(),'NYK');
  assert.equal(await page.locator('#compareB').inputValue(),'GSW');
  const swapped=await page.locator('#compareData .compare-metric[data-stat="wins"] .team-metric-value').allInnerTexts();
  assert.deepEqual(swapped,[String(record('NYK').values.wins),String(record('GSW').values.wins)]);
  await page.locator('#compareB').selectOption('NYK');
  assert.ok((await page.locator('#compareData .empty').innerText()).includes('different teams'),'Same-team comparison should not fabricate head-to-head values');
  await page.locator('#compareB').selectOption('BOS');
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
 await check('Teams shows all 30 info icons on hover without clicking',async()=>{
  await page.evaluate(()=>location.hash='teams');
  await page.waitForSelector('#teams.active');
  await page.waitForSelector('#teamDetails .team-metric',{timeout:20000});
  assert.equal(await page.locator('#teamDetails .team-metric').count(),30);
  assert.equal(await page.locator('#teamDetails .team-metric .metric-info-trigger').count(),30);
  assert.equal(await page.locator('#teamDetails .spotlight-metric').count(),4);
  await page.locator('#teamSearch').fill('Celtics');
  await page.locator('#teamGrid button[data-team="BOS"]').click();
  assert.match(await page.locator('#teamDetails h2').innerText(),/Boston Celtics/);
  const trigger=page.locator('#teamDetails .team-metric .metric-info-trigger').first();
  const pop=page.locator('#teamDetails .team-metric .metric-info-pop').first();
  assert.equal(await pop.isVisible(),false,'Tooltip must start hidden');
  await trigger.hover();
  const info=await trigger.evaluate(node=>{
   const wrap=node.closest('.metric-info'),pop=wrap.querySelector('.metric-info-pop'),style=getComputedStyle(pop);
   return {hoverButton:node.matches(':hover'),hoverWrapper:wrap.matches(':hover'),focused:wrap.matches(':focus-within'),opacity:style.opacity,visibility:style.visibility,display:style.display,rect:{top:pop.getBoundingClientRect().top,left:pop.getBoundingClientRect().left,width:pop.getBoundingClientRect().width},viewport:window.innerWidth,css:document.styleSheets.length};
  });console.log('TOOLTIP_HOVER_DIAGNOSTIC '+JSON.stringify(info));
  assert.equal(await pop.isVisible(),true,'Hover alone must reveal the Teams tooltip');
  assert.ok((await pop.innerText()).length>8,'Tooltip should contain concise definition');
  assert.equal(await trigger.getAttribute('aria-expanded'),'false','Hover does not require a click');
  await page.mouse.move(1,1);
  assert.equal(await pop.isVisible(),false,'Tooltip should disappear on mouse leave');
  await trigger.focus();
  assert.equal(await pop.isVisible(),true,'Keyboard focus also reveals tooltip');
  await trigger.blur();
 });
 await check('Learn has 30 substantial visible explanations but no i icons',async()=>{
  await page.evaluate(()=>location.hash='library');
  await page.waitForSelector('#library.active');
  await page.waitForSelector('#glossaryGrid .learn-metric',{timeout:20000});
  assert.equal(await page.locator('#glossaryGrid .learn-metric').count(),30);
  assert.equal(await page.locator('#glossaryGrid .metric-info').count(),0,'No i controls belong in Learn');
  assert.equal(await page.locator('#glossaryGrid .learn-metric .eyebrow').count(),0,'No 01/30 counters should appear on Learn');
  assert.equal(await page.locator('#glossaryGrid .team-metric-value').count(),0,'Learn must not contain current team values');
  assert.equal(await page.locator('#glossaryGrid .learn-measure').count(),30);
  assert.equal(await page.locator('#glossaryGrid .learn-explanation').count(),30);
  assert.equal(await page.locator('#glossaryGrid .learn-why').count(),30);
  const paragraphs=await page.locator('#glossaryGrid .learn-explanation').allInnerTexts();
  assert.ok(paragraphs.every(p=>p.trim().split(/\s+/).length>=44),'Every Learn definition should have meaningful explanatory detail');
  await page.locator('#glossarySearch').fill('rebound');
  assert.ok(await page.locator('#glossaryGrid .learn-metric').count()>0);
 });
 await check('Past Games displays 30 real boxscore metrics for EACH of two teams',async()=>{
  await page.evaluate(()=>location.hash='matchups');
  await page.waitForSelector('#matchups.active');
  assert.match(await page.locator('.nav [data-page="matchups"]').innerText(),/Past Games/);
  await page.waitForSelector('#pastGameSelect option',{state:'attached',timeout:20000});
  assert.ok(await page.locator('#pastGameSelect option').count()>=100,'Expected season-long completed game archive');
  await page.waitForSelector('#pastGameReport .past-stat-row',{timeout:25000});
  assert.equal(await page.locator('#pastGameReport .past-stat-row').count(),30);
  assert.equal(await page.locator('#pastGameReport .past-stat-away').count(),30);
  assert.equal(await page.locator('#pastGameReport .past-stat-home').count(),30);
  assert.equal(await page.locator('#pastGameReport .metric-info-trigger').count(),30);
  assert.ok((await page.locator('#pastGameCoverage').innerText()).includes('verified two-team box scores'));
  const hover=page.locator('#pastGameReport .metric-info-trigger').first(),tooltip=page.locator('#pastGameReport .metric-info-pop').first();
  assert.equal(await tooltip.isVisible(),false);
  await hover.hover();assert.equal(await tooltip.isVisible(),true,'Past Games i should explain statistic on hover');
  assert.equal(await hover.evaluate(x=>getComputedStyle(x).cursor),'pointer','No question-mark cursor');
  await page.mouse.move(0,0);
  const nums=await page.locator('#pastGameReport .past-stat-row[data-stat="pointsPerGame"] .past-stat-figure').allInnerTexts();
  assert.equal(nums.length,2);
  assert.ok(nums.every(x=>/^\d+\.0$/.test(x)||/^\d+$/.test(x)),'Real game scores expected: '+nums);
  const options=await page.locator('#pastGameSelect option').all();
  if(options.length>2){
   const oldA=await page.locator('#pastGameReport .past-game-date').innerText();
   await page.locator('#pastGameSelect').selectOption({index:options.length-1});
   assert.equal(await page.locator('#pastGameReport .past-stat-row').count(),30);
   assert.notEqual(await page.locator('#pastGameReport .past-game-date').innerText(),oldA);
  }
 });
 await check('Game Room current roster, conditions, baseline, separate user assumptions and all 30 reference metrics',async()=>{
  await page.evaluate(()=>location.hash='gameroom');
  await page.waitForSelector('#gameroom.active');
  assert.equal(await page.locator('#competitionDesk .competition-card').count(),2);
  await page.waitForSelector('#gameRoomContext .game-context-metric',{timeout:20000});
  assert.equal(await page.locator('#gameRoomContext .game-context-metric').count(),30);
  await page.locator('#forecastResult .forecast-prob.baseline strong').first().waitFor({timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#playerA1Name')?.options.length>8,null,{timeout:30000});
  assert.ok(await page.locator('#playerB1Name option').count()>8);
  assert.equal(await page.locator('#forecastFactors .forecast-factor').count(),16);
  assert.equal(await page.locator('#forecastResult .forecast-reason-list').first().locator('.forecast-reason').count(),7);
  assert.ok((await page.locator('#forecastResult .forecast-reason').first().innerText()).includes('percentage points'));
  const read=()=>page.locator('#forecastResult .forecast-prob.baseline strong').first().innerText();
  const adjusted=()=>page.locator('#forecastResult .forecast-prob.scenario strong').first().innerText();
  const base=await read();assert.match(base,/^\d+\.\d%$/);assert.equal(await adjusted(),base);
  const measured=await page.evaluate(()=>['forecastRestA','forecastRestB','forecastFormA','forecastFormB'].map(id=>{const el=document.getElementById(id);return {id,value:el.value,label:el.selectedOptions[0].textContent}}));
  assert.ok(measured.every(x=>x.value==='auto'&&!/auto|waiting/i.test(x.label)),JSON.stringify(measured));
  assert.ok(measured.slice(0,2).every(x=>/Back-to-back|full day/.test(x.label)));
  assert.ok(measured.slice(2).every(x=>/^\d+ wins in \d+ games$/.test(x.label)));
  assert.ok((await page.locator('#forecastRestNote').innerText()).includes('based on completed games'));
  assert.ok((await page.locator('#forecastFormNote').innerText()).includes('recent games'));
  assert.ok(!(await page.locator('#gameroom .eyebrow').allInnerTexts()).some(x=>/^\d{2}\s*\//.test(x)));
  await page.locator('#forecastRestA').selectOption('0');
  assert.equal(await read(),base,'Measured override cannot change baseline');
  await page.locator('#forecastReset').click();
  assert.equal(await page.locator('#forecastRestA').inputValue(),'auto');
  assert.equal(await page.locator('#forecastRestA option:checked').innerText(),measured[0].label);

  await page.locator('#playerA1Name').selectOption({index:1});
  await page.locator('#playerA1Status').selectOption('out');
  await page.locator('#playerA1Shift').selectOption('-25');
  assert.equal(await read(),base,'User injury assumption must not change source-based baseline');
  assert.notEqual(await adjusted(),base,'Separate scenario should react to player adjustment');
  assert.match(await page.locator('#forecastResult .forecast-scenario').innerText(),/assumed not to play/);
  await page.locator('#forecastReset').click();
  assert.equal(await adjusted(),base);
  assert.equal(await page.locator('#forecastFactors input[type=radio]').count(),96);
  await page.locator('#factor-travel-A-low').check();
  assert.ok(parseFloat(await adjusted())<parseFloat(base),'Team A disadvantage lowers A estimate');
  await page.locator('#factor-travel-B-low').check();
  assert.equal(await adjusted(),base,'Equal team assumptions cancel');
  await page.locator('#factor-travel-A-neutral').check();
  assert.ok(parseFloat(await adjusted())>parseFloat(base),'Team B disadvantage raises A estimate');
  assert.equal(await read(),base,'Mirrored inputs do not change baseline');
  await page.locator('#forecastReset').click();
  await page.locator('#forecastCustomShift').fill('25');
  await page.locator('#forecastCustomShift').dispatchEvent('change');
  assert.notEqual(await adjusted(),base);
  await page.locator('#forecastReset').click();
  const oldA=await page.locator('#gameAway').inputValue(),oldB=await page.locator('#gameHome').inputValue();
  await page.locator('#gameSwap').click();
  assert.equal(await page.locator('#gameAway').inputValue(),oldB);
  assert.equal(await page.locator('#gameHome').inputValue(),oldA);
  assert.equal(await page.locator('#gameRoomContext .game-context-metric').count(),30);
  await page.locator('#gameAway').selectOption(oldA);await page.locator('#gameHome').selectOption(oldB);
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
  const sizes=[320,360,390,430,768],routes=['home','about','teams','compare','library','gameroom','matchups'];
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of sizes){
   await page.setViewportSize({width,height:812});
   for(const id of routes){
    await page.evaluate(id=>location.hash=id,id);
    await page.waitForSelector('#'+id+'.active');
    const data=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,root:document.documentElement.scrollWidth,body:document.body.scrollWidth,page:document.querySelector('.page.active')?.scrollWidth}));
    if(data.root>data.viewport+2){
     const offenders=await page.evaluate(()=>Array.from(document.querySelectorAll('.page.active *')).filter(el=>{const r=el.getBoundingClientRect(),st=getComputedStyle(el);return st.display!=='none'&&st.visibility!=='hidden'&&(r.right>window.innerWidth+5||r.left< -5)&&r.width>0;}).slice(0,18).map(el=>({tag:el.tagName,id:el.id,cls:String(el.className).slice(0,85),right:Math.round(el.getBoundingClientRect().right),left:Math.round(el.getBoundingClientRect().left),width:Math.round(el.getBoundingClientRect().width),scrollWidth:el.scrollWidth})));
     console.log('MOBILE_OVERFLOW_DIAGNOSTIC '+width+'/'+id+' '+JSON.stringify(offenders));
    }
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
