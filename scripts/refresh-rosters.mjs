import fs from 'node:fs';
import {etDay} from './forecast-core.mjs';
const now=new Date(),d=etDay(now),year=+d.slice(0,4),month=+d.slice(5,7),season=month>=10?year+1:year;
const standings=JSON.parse(fs.readFileSync('data/standings-'+season+'.json','utf8'));
const base='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const norm=c=>({GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN'})[String(c||'').toUpperCase()]||String(c||'').toUpperCase();
async function get(endpoint){
 for(let n=0;n<2;n++){
  try{const r=await fetch(base+endpoint,{signal:AbortSignal.timeout(15000),headers:{accept:'application/json'}});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}
  catch(e){if(n===1)throw e;}
 }
}
const injuries=await get('injuries').catch(e=>{console.warn('Injury source unavailable:',e.message);return null});
const injuryTeams=Array.isArray(injuries?.injuries)?new Map(injuries.injuries.map(x=>[String(x.id),x.injuries||[]])):null;
const teams=[],errors=[];
for(let i=0;i<standings.records.length;i+=6){
 const batch=await Promise.allSettled(standings.records.slice(i,i+6).map(async r=>{
  if(!/^\d+$/.test(r.espnId))throw Error('Missing ESPN ID: '+r.code);
  const data=await get('teams/'+r.espnId+'/roster');
  if(norm(data.team?.abbreviation)!==r.code||String(data.team?.id)!==r.espnId||Number(data.season?.year)!==season)throw Error('Incorrect roster identity or season '+r.code);
  const flat=(data.athletes||[]).flatMap(a=>Array.isArray(a.items)?a.items:[a]);
  const seen=new Set();
  const roster=flat.filter(a=>/^\d+$/.test(String(a.id||''))&&a.fullName&&!seen.has(a.id)&&seen.add(a.id)).map(a=>{
   const availableReports=injuryTeams?.get(r.espnId)||[];
   const report=availableReports.find(x=>String(x.athlete?.id||'')===String(a.id)||x.athlete?.displayName===a.fullName);
   return {id:String(a.id),name:a.fullName,position:a.position?.abbreviation||'',jersey:a.jersey||'',report:report?{status:String(report.status||'Status unspecified'),date:report.date||null,comment:String(report.shortComment||'')}:null};
  }).sort((a,b)=>a.name.localeCompare(b.name));
  if(roster.length<8||roster.length>35)throw Error('Suspicious roster size '+r.code+' '+roster.length);
  return {code:r.code,espnId:r.espnId,name:data.team.displayName,retrievedAt:new Date().toISOString(),providerTimestamp:data.timestamp||null,injuryFeedAvailable:!!injuryTeams,players:roster};
 }));
 for(const b of batch)b.status==='fulfilled'?teams.push(b.value):errors.push(String(b.reason));
}
if(teams.length!==30)throw Error('Incomplete current roster refresh: '+teams.length+'/30; '+errors.join('; '));
const owners=new Map();
for(const t of teams)for(const p of t.players){if(owners.has(p.id))throw Error('Conflicting roster ownership for '+p.id+': '+owners.get(p.id)+' and '+t.code);owners.set(p.id,t.code);}
const snapshot={format:'aureum-rosters-v1',season,retrievedAt:new Date().toISOString(),source:'ESPN NBA team rosters and dated injury report',injuryFeedAvailable:!!injuryTeams,injurySourceTimestamp:injuries?.timestamp||null,teams};
fs.writeFileSync('data/rosters-'+season+'.json',JSON.stringify(snapshot,null,2)+'\n');
console.log('ROSTER_AUDIT '+JSON.stringify({teams:teams.length,players:owners.size,reports:teams.flatMap(t=>t.players).filter(p=>p.report).length,injuryFeedAvailable:!!injuryTeams,season}));
