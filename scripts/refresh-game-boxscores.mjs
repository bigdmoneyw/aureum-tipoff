import fs from 'node:fs';
import path from 'node:path';
import {extractGame,keys} from './game-boxscore-core.mjs';

const now=new Date(),parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric'}).formatToParts(now);
const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value),season=month>=10?year+1:year;
const archivePath='data/completed-games-'+season+'.json',outputPath='data/game-boxscores-'+season+'.json';
if(!fs.existsSync(archivePath))throw Error('Completed-game archive unavailable: '+archivePath);
const archive=JSON.parse(fs.readFileSync(archivePath,'utf8'));
if(archive.format!=='aureum-completed-games-v1'||archive.season!==season||!Array.isArray(archive.games)||archive.games.length!==archive.count)throw Error('Completed-game archive failed validation');
const catalog=JSON.parse(fs.readFileSync('data/metric-catalog.json','utf8')).metrics;
if(catalog.length!==30||catalog.some(m=>!keys.includes(m.key)))throw Error('Mismatch with 30-metric Learn catalog');
let existing=null;
if(fs.existsSync(outputPath)){
 try{existing=JSON.parse(fs.readFileSync(outputPath,'utf8'));if(existing.format!=='aureum-game-boxscores-v1'||existing.season!==season||!Array.isArray(existing.games))existing=null;}catch(e){console.warn('Existing individual-game boxscore dataset invalid; rebuilding');}
}
const byId=new Map((existing?.games||[]).filter(x=>x.id&&x.homeStats&&x.awayStats&&keys.every(k=>k in x.homeStats.values&&k in x.awayStats.values)).map(x=>[x.id,x]));
const pending=archive.games.filter(x=>!byId.has(x.id));
const errors=[];
async function getSummary(id){
 const url='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+encodeURIComponent(id);
 for(let tries=0;tries<2;tries++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),14000);
  try{
   const r=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});
   if(!r.ok)throw Error('ESPN HTTP '+r.status);
   return await r.json();
  }catch(e){
   if(tries===1)throw e;
   await new Promise(resolve=>setTimeout(resolve,500));
  }finally{clearTimeout(timer);}
 }
}
for(let i=0;i<pending.length;i+=8){
 const batch=pending.slice(i,i+8);
 const results=await Promise.all(batch.map(async game=>{
  try{return {id:game.id,value:extractGame(game,await getSummary(game.id))};}
  catch(error){return {id:game.id,error:String(error?.message||error)};}
 }));
 for(const result of results){
  if(result.value)byId.set(result.id,result.value);
  else errors.push({id:result.id,reason:result.error});
 }
 if((i+batch.length)%40<8)console.log('BOXSCORE_BACKFILL_PROGRESS '+Math.min(pending.length,i+8)+'/'+pending.length+'; validated='+byId.size);
}
const games=archive.games.map(row=>byId.get(row.id)).filter(Boolean);
const missing=archive.games.filter(row=>!byId.has(row.id)).map(row=>row.id);
if(archive.games.length>50&&games.length<Math.floor(archive.games.length*.55))throw Error('Insufficient ESPN boxscore validation '+games.length+'/'+archive.games.length+'; refusing to publish questionable archive');
const file={format:'aureum-game-boxscores-v1',source:'ESPN NBA final game boxscores; verified against previously archived final scores',season,metricCount:30,
 retrievedAt:now.toISOString(),availableGameCount:games.length,completedGameCount:archive.games.length,
 missingGameIds:missing,
 notes:'Every displayed figure is derived from one completed game, not a season average. Per-game labels on Teams become single-game totals here. A win/loss is 1 or 0; win rate for one completed game is 100% or 0%. Ratios with zero denominator are shown as N/A. Individual games may be missing until their validated box scores are available.',
 games};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,JSON.stringify(file,null,2)+'\n');
console.log('GAME_BOXSCORE_AUDIT '+JSON.stringify({season,completed:archive.games.length,verified:games.length,newlyValidated:pending.length-errors.length,unavailable:missing.length,errors:errors.slice(0,18)}));
