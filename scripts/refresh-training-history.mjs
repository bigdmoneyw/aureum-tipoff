import fs from 'node:fs';
import {etDay} from './forecast-core.mjs';
const now=new Date(),d=etDay(now),season=+d.slice(0,4)+(+d.slice(5,7)>=10?1:0);
const api='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const norm=c=>({GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN'})[c]||c;
const codes=new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '));
async function get(p){for(let i=0;i<2;i++){try{const r=await fetch(api+p,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){if(i===1)throw e;}}}
try {
for(const y of [season-2,season-1]){
 const file='data/forecast-history-'+y+'.json';
 if(fs.existsSync(file)){const old=JSON.parse(fs.readFileSync(file));if(old.games?.length>=1200)continue;}
 const games=new Map();
 // Date windows smaller than a full month avoid provider event limits.
 const days=[];for(let t=Date.UTC(y-1,9,1);t<=Date.UTC(y,3,30);t+=864e5)days.push(new Date(t).toISOString().slice(0,10).replaceAll('-',''));
 for(let i=0;i<days.length;i+=10){
  const batch=await Promise.all(days.slice(i,i+10).map(day=>get('scoreboard?dates='+day)));
  for(const raw of batch){
   if(!Array.isArray(raw.events))throw Error('No events');
   for(const e of raw.events){
   if((e.season?.year!==undefined&&+e.season.year!==y)||(e.season?.type!==undefined&&+e.season.type!==2)||!e.status?.type?.completed)continue;
   const c=e.competitions?.[0],h=c?.competitors?.find(x=>x.homeAway==='home'),a=c?.competitors?.find(x=>x.homeAway==='away');
   const home=norm(h?.team?.abbreviation),away=norm(a?.team?.abbreviation),hs=+h?.score,as=+a?.score;
   if(!codes.has(home)||!codes.has(away)||home===away||!Number.isInteger(hs)||!Number.isInteger(as)||hs===as||Math.min(hs,as)<0||!Number.isFinite(Date.parse(e.date)))continue;
   games.set(String(e.id),{id:String(e.id),date:e.date,home,away,hs,as,neutral:c.neutralSite===true,season:y});
  }
  }
 }
 if(games.size<1200||games.size>1250)throw Error('Unexpected regular season coverage '+y+' '+games.size);
 const rows=[...games.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
 fs.writeFileSync(file,JSON.stringify({format:'aureum-forecast-history-v1',season:y,source:'ESPN completed regular season scoreboards',retrievedAt:now.toISOString(),games:rows})+'\n');
 console.log('HISTORICAL_GAMES '+y+' '+rows.length);
}
} catch(error){console.warn('Historical season archive unavailable: '+error.message);}
const archive=JSON.parse(fs.readFileSync('data/completed-games-'+season+'.json'));
const file='data/player-history-'+season+'.json';
let old=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
const byId=new Map((old?.games||[]).map(g=>[g.id,g]));
const pending=archive.games.filter(g=>!byId.has(g.id));
function parse(g,d){
 const groups=d.boxscore?.players;if(!Array.isArray(groups)||groups.length!==2)throw Error('Missing players');
 const sides={};
 for(const group of groups){
  const code=norm(group.team?.abbreviation),table=group.statistics?.find(x=>x.labels?.includes('MIN')&&x.labels?.includes('PTS'));
  if(![g.home,g.away].includes(code)||!table)throw Error('Missing player stat labels');
  const mi=table.labels.indexOf('MIN'),pi=table.labels.indexOf('PTS'),players=[];
  for(const x of table.athletes||[]){
   const id=String(x.athlete?.id||'');if(!/^\d+$/.test(id))continue;
   const played=!x.didNotPlay&&!x.inactive&&x.stats?.length>pi;
   const min=played?Number(String(x.stats[mi]).split(':')[0]):0,pts=played?Number(x.stats[pi]):0;
   if(!Number.isFinite(min)||!Number.isFinite(pts)||min<0||min>65||pts<0||pts>100)continue;
   players.push({id,min,pts,played:!!played});
  }
  const total=players.reduce((s,x)=>s+x.pts,0),minutes=players.reduce((s,x)=>s+x.min,0);
  if(players.length<8||total!==(code===g.home?g.hs:g.as)||minutes<225||minutes>330)throw Error('Invalid player totals '+code+' '+total+' '+minutes);
  sides[code]=players;
 }
 return {id:g.id,date:g.date,home:g.home,away:g.away,players:sides};
}
let errors=[];
for(let i=0;i<pending.length;i+=8){
 const batch=await Promise.allSettled(pending.slice(i,i+8).map(async g=>parse(g,await get('summary?event='+g.id))));
 for(const r of batch)r.status==='fulfilled'?byId.set(r.value.id,r.value):errors.push(String(r.reason));
}
const games=archive.games.map(g=>byId.get(g.id)).filter(Boolean);
fs.writeFileSync(file,JSON.stringify({format:'aureum-player-history-v1',season,retrievedAt:now.toISOString(),source:'ESPN completed-game individual player box scores; realized participation, not pregame injury reports',games})+'\n');
console.log('PLAYER_HISTORY '+JSON.stringify({games:games.length,archive:archive.count,errors:errors.slice(0,8)}));
