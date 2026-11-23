import fs from 'node:fs';
import {etDay} from './forecast-core.mjs';
import {buildAdvanced,predict,context,features} from './forecast-advanced.mjs';
import {regularSeasonOnly,isCupChampionship} from './forecast-integrity.mjs';
import {validateLedger,selectPregameState,settleExisting,evaluation,appendFirstForecast} from './forecast-ledger-core.mjs';
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
if(history.length!==2||history.some(h=>h.games.length!==1230))throw Error('Complete 2025 and 2026 season training archives required; no weak fallback published');
const players=read('data/player-history-'+season+'.json');
const priorPlayers=read('data/player-history-'+(season-1)+'.json');
const model=buildAdvanced(history,current,players,now,priorPlayers);
fs.writeFileSync('data/forecast-v2-'+season+'.json',JSON.stringify(model,null,2)+'\n');
console.log('ADVANCED_VALIDATION '+JSON.stringify({history:model.historicalGameCount,current:model.archiveGames,weights:model.weights,selection:model.selection,backtest:model.backtest,playerCoverage:model.playerCoverage,historicalPlayerCoverage:model.historicalPlayerCoverage,playerModel:model.playerModel,profiles:Object.keys(model.playerProfiles).length}));
// Preserve the FIRST timestamped baseline estimate before a scheduled game begins.
// Never backfill a prediction for an already-started game.
const ledgerPath='data/forecast-ledger-'+season+'.json';
const ledger=validateLedger(read(ledgerPath)||{format:'aureum-forecast-ledger-v1',season,records:[]},season);
// Existing probabilities, coefficients and timestamps are immutable. Settlement adds
// only observed finals, and an inconsistent reschedule stays unresolved.
settleExisting(ledger,current.games,now);
const seen=new Set(ledger.records.map(r=>String(r.id)));
const addDay=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
const boards=[day,addDay(day,1),addDay(day,2)]
 .map(d=>read('data/scoreboards/'+d+'.json'))
 .filter(board=>board&&Number.isFinite(Date.parse(board.retrievedAt))&&Date.parse(board.retrievedAt)<=now.getTime()+60000&&now-Date.parse(board.retrievedAt)<=3*3600000);
const upcoming=boards.flatMap(board=>(board.events||[]).map(e=>({e,board})))
 .filter(({e})=>e.status?.type?.state==='pre'&&Number.isFinite(Date.parse(e.date))&&Date.parse(e.date)>now.getTime())
 .sort((a,b)=>Date.parse(a.e.date)-Date.parse(b.e.date));
const coveredDates=new Set(boards.map(b=>b.requestedDate));
const sourceTime=Date.parse(current.retrievedAt);
const currentFresh=Number.isFinite(sourceTime)&&sourceTime<=now.getTime()+60000&&now-sourceTime<=8*3600000;
let added=0,unknownSchedule=0;
if(currentFresh)for(const {e,board} of upcoming){
 const tipoff=Date.parse(e.date);
 if(seen.has(String(e.id))||tipoff-now.getTime()>48*3600000||isCupChampionship(e,season))continue;
 const competitors=e.competitions?.[0]?.competitors||[];
 const h=competitors.find(x=>x.homeAway==='home')?.team?.abbreviation,a=competitors.find(x=>x.homeAway==='away')?.team?.abbreviation;
 if(!h||!a||h===a)continue;
 // If either team has another future game before this fixture, we cannot know
 // the true rest, rating or recent form yet. Do not lock a misleading forecast.
 const pendingBefore=upcoming.some(({e:other})=>{
  if(String(e.id)===String(other.id)||Date.parse(other.date)>=tipoff)return false;
  const sides=other.competitions?.[0]?.competitors||[];
  return sides.some(c=>[h,a].includes(c.team?.abbreviation));
 });
 if(pendingBefore){unknownSchedule++;continue;}
 const contextDate=etDay(e.date);
 // Do not infer missing intervening fixtures from absent schedule snapshots.
 let coverageComplete=true;
 for(let n=0;addDay(day,n)<=contextDate;n++)if(!coveredDates.has(addDay(day,n)))coverageComplete=false;
 if(!coverageComplete){unknownSchedule++;continue;}
 const {state,mode}=selectPregameState(model,e.date);
 if(!state[h]||!state[a]||state[h].games<3||state[a].games<3)continue;
 const venue=e.competitions?.[0]?.neutralSite===true?0:1;
 const x=features(context(state[h],contextDate),context(state[a],contextDate));
 const record={id:String(e.id),home:h,away:a,tipoff:e.date,recordedAt:now.toISOString(),model:model.version,homeProbability:predict(model.weights,x,venue),featureValues:x,coefficients:model.weights,venue,contextDate,snapshotMode:mode,sourceScoreboardAt:board.retrievedAt,modelArchiveAt:current.retrievedAt,modelStateThrough:model.throughDate,modelTrainingThrough:model.backtest.trainingThrough};
 if(appendFirstForecast(ledger,record,now)){seen.add(record.id);added++;}
}
ledger.evaluation=evaluation(ledger);
ledger.evaluation.newlyLocked=added;
ledger.evaluation.skippedPendingGames=unknownSchedule;
ledger.evaluation.sourceArchiveFresh=currentFresh;
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log('PROSPECTIVE_LEDGER '+JSON.stringify(ledger.evaluation));
