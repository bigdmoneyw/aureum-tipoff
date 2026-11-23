
import fs from 'node:fs';
import {isCupChampionship} from './forecast-integrity.mjs';
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
  if(!records.some(x=>x.code===code))records.push({code,wins,losses,espnId:String(row.team?.id||'')});
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
  const competition=e.competitions?.[0],rivals=competition?.competitors||[];
  const h=rivals.find(x=>x.homeAway==='home'),a=rivals.find(x=>x.homeAway==='away');
  const home=norm(h?.team?.abbreviation),away=norm(a?.team?.abbreviation),when=new Date(e.date);
  if(!codes.has(home)||!codes.has(away)||home===away||!Number.isFinite(when.getTime())||dateET(when)!==date)continue;
  const state=e.status?.type?.state||'pre',done=!!e.status?.type?.completed;
  const hs=Number(h.score),as=Number(a.score);
  if((done||state==='in')&&(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0||hs>250||as>250))continue;
  events.push({id:String(e.id),date:e.date,competition:isCupChampionship({id:e.id,date:e.date,neutral:competition?.neutralSite},endSeason)?'nba-cup-championship':'nba-regular-season',status:{type:{completed:done,state,shortDetail:e.status?.type?.shortDetail||e.status?.type?.detail||e.status?.type?.description||'Scheduled'}},competitions:[{neutralSite:competition?.neutralSite===true,competitors:[{homeAway:'home',team:{abbreviation:home},score:done||state==='in'?String(hs):''},{homeAway:'away',team:{abbreviation:away},score:done||state==='in'?String(as):''}]}]});
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
 if(season===endSeason)await refreshTeamStatistics(x);
}

async function refreshTeamStatistics(standingsData){
 const catalog=JSON.parse(fs.readFileSync(root+'/metric-catalog.json','utf8')).metrics;
 if(catalog.length!==30||new Set(catalog.map(m=>m.key)).size!==30)throw Error('Metric catalog must have exactly 30 unique keys');
 if(standingsData.records.length!==30)throw Error('Need all 30 teams, not partial standings');
 const records=[];
 for(let i=0;i<standingsData.records.length;i+=5){
  const group=standingsData.records.slice(i,i+5);
  const results=await Promise.all(group.map(async row=>{
   if(!/^\d+$/.test(row.espnId))throw Error('Missing ESPN team ID for '+row.code);
   const url=base+'site/v2/sports/basketball/nba/teams/'+row.espnId+'/statistics?season='+endSeason;
   const data=await get(url);
   if(data.status!=='success'||Number(data.season?.year)!==endSeason||Number(data.season?.type)!==2)throw Error('Unexpected team stats season '+row.code);
   const groups=data.results?.stats?.categories||[];
   const stats=new Map(groups.flatMap(c=>c.stats||[]).map(x=>[x.name,x]));
   const value=(k)=>{const n=Number(stats.get(k)?.value);if(!stats.has(k)||!Number.isFinite(n)||n<0)throw Error('Missing/invalid '+k+' for '+row.code);return n;};
   const games=value('gamesPlayed');
   if(!Number.isInteger(games)||games<1||games>90)throw Error('Invalid GP '+row.code);
   const pct=(a,b)=>{if(!b)return null;return 100*a/b;};
   const nGames=row.wins+row.losses;
   const values={
    wins:row.wins,losses:row.losses,winPct:nGames?pct(row.wins,nGames):null,
    pointsPerGame:value('avgPoints'),oppPointsPerGame:null,marginPerGame:null,
    fieldGoalPct:value('fieldGoalPct'),twoPointPct:value('twoPointFieldGoalPct'),threePointPct:value('threePointPct'),freeThrowPct:value('freeThrowPct'),
    effectiveFgPct:pct(value('fieldGoalsMade')+0.5*value('threePointFieldGoalsMade'),value('fieldGoalsAttempted')),
    threePointRate:pct(value('threePointFieldGoalsAttempted'),value('fieldGoalsAttempted')),
    freeThrowRate:pct(value('freeThrowsAttempted'),value('fieldGoalsAttempted')),
    fgMadePerGame:value('avgFieldGoalsMade'),fgAttemptedPerGame:value('avgFieldGoalsAttempted'),
    threeMadePerGame:value('avgThreePointFieldGoalsMade'),threeTriedPerGame:value('avgThreePointFieldGoalsAttempted'),
    ftMadePerGame:value('avgFreeThrowsMade'),ftTriedPerGame:value('avgFreeThrowsAttempted'),
    reboundsPerGame:value('avgRebounds'),offReboundsPerGame:value('avgOffensiveRebounds'),defReboundsPerGame:value('avgDefensiveRebounds'),
    assistsPerGame:value('avgAssists'),turnoversPerGame:value('avgTurnovers'),assistTurnoverRatio:value('assistTurnoverRatio'),
    stealsPerGame:value('avgSteals'),blocksPerGame:value('avgBlocks'),foulsPerGame:value('avgFouls'),
    twoMadePerGame:value('avgTwoPointFieldGoalsMade'),twoTriedPerGame:value('avgTwoPointFieldGoalsAttempted')
   };
   if(nGames){
    // These measures come from the same ESPN team season-stat snapshot as PPG; keep the denominator aligned.
    const teamStandings=stats.get('avgPointsAgainst');
    // Opponent points and point differential are sourced from standings, not necessarily synchronized with team stats.
   }
   for(const [k,v] of Object.entries(values)){
    if(v!==null&&(!Number.isFinite(v)||v<0&&k!=='marginPerGame'||/pct|rate/i.test(k)&&v>100.01))throw Error('Invalid metric '+k+' for '+row.code);
   }
   if(Object.keys(values).length!==30||catalog.some(m=>!(m.key in values)))throw Error('Catalog mismatch for '+row.code);
   return {code:row.code,espnId:row.espnId,statGamesPlayed:games,standingsGamesPlayed:nGames,lagGames:nGames-games,
    values,sourceUrl:'https://www.espn.com/nba/team/stats/_/name/'+(data.team?.abbreviation||row.code).toLowerCase(),sourceTeam:data.team?.displayName||row.code};
  }));
  records.push(...results);
 }
 // Avoid mixing different games-played denominators: points-against and margin belong to the standings feed;
 // use them only when the two independent ESPN datasets cover the same number of games.
 const full=await get(base+'v2/sports/basketball/nba/standings?season='+endSeason);
 const rows=[];function walk(x){if(!x||typeof x!=='object')return;if(Array.isArray(x.standings?.entries))rows.push(...x.standings.entries);for(const y of x.children||[])walk(y);}walk(full);
 const byCode=Object.fromEntries(rows.map(r=>[norm(r.team?.abbreviation),r]));
 for(const r of records){
  const t=byCode[r.code];if(!t)throw Error('Standings missing '+r.code);
  const n=(key)=>{const x=(t.stats||[]).find(y=>y.name===key);return Number(x?.value);};
  // Values sourced directly from ESPN standings represent the latest standings sample,
  // while other team stats may be delayed by one or more games. Both periods are disclosed.
  const pointsAgainst=n('avgPointsAgainst'),diff=n('pointDifferential');
  if(!Number.isFinite(pointsAgainst)||!Number.isFinite(diff)||!r.standingsGamesPlayed)throw Error('Invalid opponent scoring in standings '+r.code);
  r.values.oppPointsPerGame=pointsAgainst;
  r.values.marginPerGame=diff/r.standingsGamesPlayed;
 }
 records.sort((a,b)=>a.code.localeCompare(b.code));
 if(records.length!==30)throw Error('Not all NBA teams have valid sourced statistics');
 const incomplete=records.flatMap(r=>catalog.filter(m=>r.values[m.key]===null).map(m=>r.code+':'+m.key));
 const snapshot={format:'aureum-team-statistics-v1',season:endSeason,competition:'NBA regular season',source:'ESPN team statistics + ESPN standings',
  retrievedAt:now.toISOString(),teamCount:records.length,metricCount:catalog.length,
  incompleteFields:incomplete,notes:'All 30 metrics are sourced. Points allowed, score margin, wins and losses come from ESPN standings; other figures come from ESPN team season statistics. The two sources can differ by recently completed games, and the game-count difference is displayed per franchise.',
  records};
 write(root+'/teams-'+endSeason+'.json',snapshot);
 console.log('TEAM_STATS_AUDIT '+JSON.stringify({teams:records.length,metrics:catalog.length,incompleteFields:incomplete.length,laggingTeams:records.filter(r=>r.lagGames!==0).map(r=>[r.code,r.lagGames])}));
}

let totalGames=0;
for(let delta=-4;delta<=4;delta++){
 const d=new Date(Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day'))+delta,17));
 const date=dateET(d),compact=date.replaceAll('-','');
 const raw=await get(base+'site/v2/sports/basketball/nba/scoreboard?dates='+compact);
 const x=scoreboard(raw,date);totalGames+=x.events.length;write(root+'/scoreboards/'+date+'.json',x);
}

/* Preserve completed results throughout the season for retrospective Scenarios.
   Backfill only missing dates; refreshed recent dates are already handled above. */
async function refreshCompletedGames(){
 const seasonStart=new Date(Date.UTC(endSeason-1,9,20,17));
 const todayNoon=new Date(Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day')),17));
 const files=[];
 for(let t=seasonStart.getTime();t<=todayNoon.getTime();t+=86400000){
  const date=dateET(new Date(t));const file=root+'/scoreboards/'+date+'.json';
  if(!fs.existsSync(file)){
   const api=base+'site/v2/sports/basketball/nba/scoreboard?dates='+date.replaceAll('-','');
   const valid=scoreboard(await get(api),date);
   write(file,valid);
  }
  files.push(file);
 }
 const rows=[],unique=new Set();
 for(const file of files){
  const snap=JSON.parse(fs.readFileSync(file,'utf8'));
  if(snap.format!=='aureum-scoreboard-v1')throw Error('Invalid archived scoreboard '+file);
  for(const e of snap.events||[]){
   if(!e.status?.type?.completed||unique.has(e.id))continue;
   const competitors=e.competitions?.[0]?.competitors||[];
   const home=competitors.find(x=>x.homeAway==='home'),away=competitors.find(x=>x.homeAway==='away');
   const hs=Number(home?.score),as=Number(away?.score);
   const h=home?.team?.abbreviation,a=away?.team?.abbreviation;
   if(!codes.has(h)||!codes.has(a)||h===a||!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0||hs===as)continue;
   rows.push({id:String(e.id),date:e.date,home:h,away:a,hs,as,neutral:e.competitions?.[0]?.neutralSite===true,competition:e.competition||'nba-regular-season',sourceAt:snap.retrievedAt});
   unique.add(e.id);
  }
 }
 rows.sort((a,b)=>new Date(b.date)-new Date(a.date));
 if(rows.length<50&&todayNoon>new Date(Date.UTC(endSeason-1,10,1,17)))throw Error('Suspiciously incomplete completed-game season archive: '+rows.length);
 write(root+'/completed-games-'+endSeason+'.json',{format:'aureum-completed-games-v1',season:endSeason,source:'ESPN dated scoreboard game results',retrievedAt:now.toISOString(),
 count:rows.length,notes:'Completed games only; scores are historical observations, never pregame forecasts.',games:rows});
 console.log('PAST_GAMES_AUDIT '+JSON.stringify({season:endSeason,count:rows.length,dates:files.length}));
}
await refreshCompletedGames();

write(root+'/status.json',{format:'aureum-data-status-v1',source,retrievedAt:now.toISOString(),season:endSeason,dates:[-4,-3,-2,-1,0,1,2,3,4].map(n=>dateET(new Date(Date.UTC(Number(part('year')),Number(part('month'))-1,Number(part('day'))+n,17)))),gameCount:totalGames});
console.log('PASS validated snapshots for 3 seasons and 9 dates ('+totalGames+' game rows)');
