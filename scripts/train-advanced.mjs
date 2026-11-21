import fs from 'node:fs';
import {etDay} from './forecast-core.mjs';
import {buildAdvanced,predict,context,features} from './forecast-advanced.mjs';
const now=new Date(),day=etDay(now),season=+day.slice(0,4)+(+day.slice(5,7)>=10?1:0);
const read=p=>{try{return JSON.parse(fs.readFileSync(p));}catch(e){return null;}};
const current=read('data/completed-games-'+season+'.json');
if(current?.format!=='aureum-completed-games-v1'||current.count!==current.games.length)throw Error('Current archive invalid');
const history=[season-2,season-1].map(s=>read('data/forecast-history-'+s+'.json')).filter(Boolean);
const players=read('data/player-history-'+season+'.json');
const model=buildAdvanced(history,current,players,now);
fs.writeFileSync('data/forecast-v2-'+season+'.json',JSON.stringify(model,null,2)+'\n');
console.log('ADVANCED_VALIDATION '+JSON.stringify({history:model.historicalGameCount,current:model.archiveGames,weights:model.weights,selection:model.selection,backtest:model.backtest,playerCoverage:model.playerCoverage,playerModel:model.playerModel,profiles:Object.keys(model.playerProfiles).length}));
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
const file='data/scoreboards/'+day+'.json',board=read(file);
if(board&&Math.abs(now-Date.parse(board.retrievedAt))<=3*3600000){
 for(const e of board.events||[]){
  if(seen.has(String(e.id))||e.status?.type?.state!=='pre'||Date.parse(e.date)<=now.getTime())continue;
  const h=e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='home')?.team?.abbreviation,a=e.competitions?.[0]?.competitors?.find(x=>x.homeAway==='away')?.team?.abbreviation;
  const s=model.todayState;if(!s[h]||!s[a]||s[h].games<3||s[a].games<3)continue;
  const x=features(context(s[h],day),context(s[a],day));
  ledger.records.push({id:String(e.id),home:h,away:a,tipoff:e.date,recordedAt:now.toISOString(),model:model.version,homeProbability:predict(model.weights,x),featureValues:x,coefficients:model.weights});
 }
}
const settled=ledger.records.filter(r=>r.result);
ledger.evaluation={settled:settled.length,recorded:ledger.records.length,brier:settled.length?settled.reduce((s,r)=>s+(r.homeProbability-Number(r.result.homeWon))**2,0)/settled.length:null,accuracy:settled.length?settled.filter(r=>(r.homeProbability>=.5)===r.result.homeWon).length/settled.length:null};
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log('PROSPECTIVE_LEDGER '+JSON.stringify(ledger.evaluation));
