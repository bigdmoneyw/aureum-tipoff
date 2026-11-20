
import fs from 'node:fs';
import path from 'node:path';
const root='data';
const source='ESPN NBA scoreboard and standings (third-party; not NBA official)';
const now=new Date();
const etParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
const part=k=>etParts.find(p=>p.type===k).value;
const today=part('year')+'-'+part('month')+'-'+part('day');
const endSeason=Number(part('month'))>=10?Number(part('year'))+1:Number(part('year'));
const aliases={GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN'};
const norm=c=>aliases[String(c||'').toUpperCase()]||String(c||'').toUpperCase();
const codes=new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '));
function dateET(d){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const get=k=>parts.find(p=>p.type===k).value;return get('year')+'-'+get('month')+'-'+get('day');}
async function get(url){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),15000);
 try{const res=await fetch(url,{signal:c.signal,headers:{accept:'application/json'}});if(!res.ok)throw Error('Source HTTP '+res.status+': '+url);return await res.json();}finally{clearTimeout(timer);}
}
function standings(data,season){
 const list=[];const visited=new Set();
 function walk(x){if(!x||typeof x!=='object'||visited.has(x))return;visited.add(x);if(Array.isArray(x.standings?.entries))list.push(...x.standings.entries);if(Array.isArray(x.children))x.children.forEach(walk);}
 walk(data);const records=[];
 for(const row of list){
  const code=norm(row.team?.abbreviation),stats=row.stats||[];
  const pick=k=>Number(stats.find(s=>String(s.name||s.type||'').toLowerCase()===k)?.value);
  const wins=pick('wins'),losses=pick('losses');
  if(!codes.has(code)||!Number.isInteger(wins)||!Number.isInteger(losses)||wins<0||losses<0||wins+losses>100)continue;
  if(!records.some(x=>x.code===code))records.push({code,wins,losses});
 }
 if(records.length<29)throw Error('Incomplete '+season+' standings: '+records.length+' teams');
 records.sort((a,b)=>a.code.localeCompare(b.code));
 return {format:'aureum-standings-v1',source,season,sourceUrl:'https://www.espn.com/nba/standings',retrievedAt:now.toISOString(),records};
}
function scoreboard(data,date){
 if(!Array.isArray(data.events))throw Error('Scoreboard is missing events');
 const events=[],seen=new Set();
 for(const e of data.events){
  if(!e?.id||seen.has(String(e.id)))continue;
  const rivals=e.competitions?.[0]?.competitors||[];
  const h=rivals.find(x=>x.homeAway==='home'),a=rivals.find(x=>x.homeAway==='away');
  const home=norm(h?.team?.abbreviation),away=norm(a?.team?.abbreviation),when=new Date(e.date);
  if(!codes.has(home)||!codes.has(away)||home===away||!Number.isFinite(when.getTime())||dateET(when)!==date)continue;
  const state=e.status?.type?.state||'pre',done=!!e.status?.type?.completed;
  const hs=Number(h.score),as=Number(a.score);
  if((done||state==='in')&&(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0||hs>250||as>250))continue;
  events.push({id:String(e.id),date:e.date,status:{type:{completed:done,state,shortDetail:e.status?.type?.shortDetail||e.status?.type?.detail||e.status?.type?.description||'Scheduled'}},competitions:[{competitors:[{homeAway:'home',team:{abbreviation:home},score:done||state==='in'?String(hs):''},{homeAway:'away',team:{abbreviation:away},score:done||state==='in'?String(as):''}]}]});
  seen.add(String(e.id));
 }
 if(data.events.length&&!events.length)throw Error('Invalid date/team scoreboard records for '+date);
 return {format:'aureum-scoreboard-v1',source,requestedDate:date,retrievedAt:now.toISOString(),events};
}
function write(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');console.log('Wrote '+file);}
const base='https://site.api.espn.com/apis/';
for(const season of [endSeason,endSeason-1,endSeason-2]){
 const raw=await get(base+'v2/sports/basketball/nba/standings?season='+season);
 const x=standings(raw,season);write(root+'/standings-'+season+'.json',x);
}
let totalGames=0;
for(let delta=-4;delta<=4;delta++){
 const d=new Date(Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day'))+delta,17));
 const date=dateET(d),compact=date.replaceAll('-','');
 const raw=await get(base+'site/v2/sports/basketball/nba/scoreboard?dates='+compact);
 const x=scoreboard(raw,date);totalGames+=x.events.length;write(root+'/scoreboards/'+date+'.json',x);
}
write(root+'/status.json',{format:'aureum-data-status-v1',source,retrievedAt:now.toISOString(),season:endSeason,dates:[-4,-3,-2,-1,0,1,2,3,4].map(n=>dateET(new Date(Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day'))+n,17)))),gameCount:totalGames});
console.log('PASS validated snapshots for 3 seasons and 9 dates ('+totalGames+' game rows)');
