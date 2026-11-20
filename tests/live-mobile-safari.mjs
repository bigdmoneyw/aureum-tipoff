import {webkit,devices} from 'playwright';
import assert from 'node:assert/strict';

const errors=[],broken=[];
const browser=await webkit.launch({headless:true});
const page=await browser.newPage({...devices['iPhone 13'],reducedMotion:'reduce'});
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().startsWith('https://aureumtipoff.com/')&&r.status()>=400)broken.push(r.status()+' '+r.url());});
const base='https://aureumtipoff.com/';
const viewportTest=async route=>{
 await page.evaluate(r=>location.hash=r,route);
 await page.locator('#'+route+'.active').waitFor({timeout:20000});
 const sizes=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
 assert.ok(sizes.scroll<=sizes.viewport+2&&sizes.body<=sizes.viewport+2,'iOS horizontal overflow on '+route+': '+JSON.stringify(sizes));
 console.log('PASS Safari iPhone '+route+' layout ('+sizes.viewport+'px)');
};
try {
 const resp=await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(resp.status(),200,'Live HTTPS home must respond 200');
 await page.locator('#home.active').waitFor({timeout:20000});
 assert.match(await page.title(),/Aureum Tipoff/);
 assert.equal(await page.locator('#mobileMenuToggle').isVisible(),true);
 assert.equal(await page.locator('#home .founder-portrait').count(),0);
 await viewportTest('home');
 await page.locator('#mobileMenuToggle').click();
 assert.equal(await page.locator('#mobileMenuToggle').getAttribute('aria-expanded'),'true');
 await page.locator('#siteNavigation [data-page="about"]').click();
 await page.locator('#about.active').waitFor({timeout:20000});
 assert.equal(await page.locator('#siteNavigation').isVisible(),false);
 const portrait=page.locator('#about .founder-portrait img');
 await portrait.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('#about .founder-portrait img')?.naturalWidth>0,null,{timeout:20000});
 await viewportTest('about');
 await viewportTest('teams');
 await page.locator('#teamDetails .team-metric').first().waitFor({timeout:30000});
 assert.equal(await page.locator('#teamDetails .team-metric').count(),30);
 await page.locator('#teamDetails .team-metric .metric-info summary').first().click();
 assert.ok(await page.locator('#teamDetails .team-metric details[open]').count()>0);
 await viewportTest('library');
 await page.locator('#glossaryGrid .learn-metric').first().waitFor({timeout:20000});
 assert.equal(await page.locator('#glossaryGrid .learn-metric').count(),30);
 await page.locator('#glossaryGrid .learn-metric .metric-info summary').first().click();
 assert.ok(await page.locator('#glossaryGrid .learn-metric details[open]').count()>0);
 await viewportTest('gameroom');
 await viewportTest('matchups');
 assert.deepEqual(errors,[],'Uncaught Safari JavaScript exceptions');
 assert.deepEqual(broken,[],'Production asset failures');
 console.log('PASS: production HTTPS, iPhone Safari menu, founder, all 30 Teams and Learn metrics, icon taps, and mobile layouts');
} catch(e) {
 console.error('MOBILE_SAFARI_FAILURE '+(e.stack||e));
 console.error('MOBILE_SAFARI_JS_ERRORS '+JSON.stringify(errors));
 console.error('MOBILE_SAFARI_FAILED_ASSETS '+JSON.stringify(broken));
 process.exitCode=1;
} finally {await browser.close();}
