import fs from 'node:fs';
import {etDay} from './forecast-core.mjs';
import {buildAdvanced,predict,context,features} from './forecast-advanced.mjs';
import {regularSeasonOnly} from './forecast-integrity.mjs';
const now=new Date(),day=etDay(now),season=+day.slice(0,4)+(+day.slice(5,7)>=10?1:0);
const read=p=>{try{return JSON.parse(fs.readFileSync(p));}catch(e){return null;}};
const originalCurrent=read('data/completed-games-'+season+'.json');
const current=regularSeasonOnly(originalCurrent);
if(current?.format!=='aureum-completed-games-v1'||current.count!==current.games.length)throw Error('Current archive invalid');
const history=[season-2,season-1].map(y=>{
 const path='data/forecast-history-'+y+'.json',source=read(path);
 if(!source)return null;
 const clean=regularSeasonOnly(source,{complete:true});
 if(clean.games.length!==source.games.length)fs.writeFileSync(path,JSON.stringify(clean)+'\n');
 return clean;
}).filter(Boolean);
const players=read('data/player-history-'+season+'.json');
const priorPlayers=read('data/player-history-'+(season-1)+'.json');
const model=buildAdvanced(history,current,players,now,priorPlayers);
fs.writeFileSync('data/forecast-v2-'+season+'.json',JSON.stringify(model,null,2)+'\n');
console.log('ADVANCED_VALIDATION '+JSON.stringify({history:model.historicalGameCount,current:model.archiveGames,weights:model.weights,selection:model.selection,backtest:model.backtest,playerCoverage:model.playerCoverage,historicalPlayerCoverage:model.historicalPlayerCoverage,playerModel:model.playerModel,profiles:Object.keys(model.playerProfiles).length}));
// Preserve the FIRST timestamped baseline estimate before a scheduled game begins.
// Never backfill a prediction for an already-started game.
const ledgerPath='data/forecast-ledger-'+season+'.json';
const ledger=read(ledgerPath)||{format:'aureum-forecast-ledger-v1',season,records:[]};
const seen=new Set(ledger.records.map(r=>r.id));
const results=new Map(current.games.map(g=>[g.id,g]));
for(const record of ledger.records){
 const g=results.get(record.id);
 if(g&&record.home===g.home&&record.away===g.away&&!record.result)record.result={homeWon:g.hs>g.as,homeScore:g.hs,awayScore:g.as,recordedAt:now.toISOString()};
}
// Record the first available pregame forecast for upcoming fixtures over the next
// two calendar days. The write-once ledger is not retrospectively overwritten.
const addDay=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
for(const boardDay of [day,addDay(day,1),addDay(day,2)]){
 const board=read('data/scoreboards/'+boardDay+'.json');
 if(!board||!Number.isFinite(Date.parse(board.retrievedAt))||Math.abs(now-Date.parse(board.retrievedAt))>3*3600000)continue;
 for(const e of board.events||[]){
  const tipoff=Date.parse(e.date);
  if(seen.has(String(e.id))||e.status?.type?.state!=='pre'||!Number.isFinite(tipoff)||tipoff<=now.getTime()||tipoff-now.getTime()>48*3600000)continue;
  const competitors=e.competitions?.[0]?.competitors||[];
  const h=competitors.find(x=>x.homeAway==='home')?.team?.abbreviation,a=competitors.find(x=>x.homeAway==='away')?.team?.abbreviation;
  const state=model.todayState||model.state;
  if(!state[h]||!state[a]||state[h].games<3||state[a].games<3)continue;
  const contextDate=etDay(e.date),venue=e.competitions?.[0]?.neutralSite===true?0:1;
  const x=features(context(state[h],contextDate),context(state[a],contextDate));
  ledger.records.push({id:String(e.id),home:h,away:a,tipoff:e.date,recordedAt:now.toISOString(),model:model.version,homeProbability:predict(model.weights,x,venue),featureValues:x,coefficients:model.weights,venue,contextDate,sourceScoreboardAt:board.retrievedAt,modelTrainingThrough:model.backtest.trainingThrough});
  seen.add(String(e.id));
 }
}
const settled=ledger.records.filter(r=>r.result);
ledger.evaluation={settled:settled.length,recorded:ledger.records.length,brier:settled.length?settled.reduce((s,r)=>s+(r.homeProbability-Number(r.result.homeWon))**2,0)/settled.length:null,accuracy:settled.length?settled.filter(r=>(r.homeProbability>=.5)===r.result.homeWon).length/settled.length:null};
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log('PROSPECTIVE_LEDGER '+JSON.stringify(ledger.evaluation));
