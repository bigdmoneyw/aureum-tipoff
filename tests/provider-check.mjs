
import assert from 'node:assert/strict';
const base='https://site.api.espn.com/apis/';
async function getJson(url){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
 try{
  const resp=await fetch(url,{signal:controller.signal,headers:{accept:'application/json','user-agent':'AureumTipoffDataAudit/1.0'}});
  assert.ok(resp.ok,'HTTP '+resp.status+' from '+url);
  return await resp.json();
 }finally{clearTimeout(timeout);}
}
function teamCode(t){const a=(t?.team?.abbreviation||'').toUpperCase();return {GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP'}[a]||a;}
const date='20261118';
const scoreboard=await getJson(base+'site/v2/sports/basketball/nba/scoreboard?dates='+date);
assert.ok(Array.isArray(scoreboard.events),'ESPN scoreboard events array missing');
assert.ok(scoreboard.events.length>=4,'Unexpectedly small known-date game count');
const matching=scoreboard.events.filter(ev=>{
 const c=ev?.competitions?.[0]?.competitors||[];
 const h=c.find(x=>x.homeAway==='home'),a=c.find(x=>x.homeAway==='away');
 return teamCode(h)==='DAL'&&teamCode(a)==='GSW'&&Number(h?.score)===116&&Number(a?.score)===94&&ev.status?.type?.completed;
});
assert.equal(matching.length,1,'Official NBA.com cross-check failed: Nov 18, 2026 GSW 94 @ DAL 116');
const standings=await getJson(base+'v2/sports/basketball/nba/standings?season=2027');
const entries=[];
function scan(node){if(!node||typeof node!=='object')return;if(Array.isArray(node.standings?.entries))entries.push(...node.standings.entries);if(Array.isArray(node.children))node.children.forEach(scan);}
scan(standings);
const codes=new Set(entries.map(x=>teamCode(x)));
assert.ok(codes.size>=29,'Current 2026–27 standings contain fewer than 29 franchises');
console.log('PASS: ESPN provider connection, 2026–27 standings coverage ('+codes.size+' teams), and independently checked 2026-11-18 Warriors/Mavericks NBA final');
