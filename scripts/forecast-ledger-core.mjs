/* Conservative, reproducible pre-tipoff forecast bookkeeping. */
import {etDay} from './forecast-core.mjs';
const num=Number.isFinite;
const identity=g=>String(g?.id||'');
export function validateLedger(ledger,season){
 if(!ledger||ledger.format!=='aureum-forecast-ledger-v1'||ledger.season!==season||!Array.isArray(ledger.records))throw Error('Forecast ledger identity invalid');
 const seen=new Set();
 for(const r of ledger.records){
  const id=identity(r);
  if(!/^\d+$/.test(id)||seen.has(id)||!num(Date.parse(r.recordedAt))||!num(Date.parse(r.tipoff))||Date.parse(r.recordedAt)>=Date.parse(r.tipoff)||!num(r.homeProbability)||r.homeProbability<0||r.homeProbability>1||r.home===r.away)throw Error('Invalid or duplicate locked forecast '+id);
  seen.add(id);
 }
 return ledger;
}
export function selectPregameState(model,eventDate){
 const d=etDay(eventDate),today=model.todayDate;
 if(d<today)throw Error('Cannot predict an earlier date using current model state');
 if(d===today)return {state:model.todayState||model.state,mode:'pre-date'};
 return {state:model.state,mode:'latest-completed'};
}
export function settleExisting(ledger,completed,now){
 const results=new Map(completed.map(g=>[identity(g),g]));
 for(const record of ledger.records){
  const g=results.get(identity(record));
  if(!g||record.result)continue;
  if(g.home!==record.home||g.away!==record.away)throw Error('Ledger game team mismatch '+record.id);
  if(Math.abs(Date.parse(g.date)-Date.parse(record.tipoff))>36e5){record.resultWarning='Scheduled tipoff changed by more than an hour; result withheld pending timing review';continue;}
  if(!Number.isInteger(g.hs)||!Number.isInteger(g.as)||g.hs===g.as)throw Error('Invalid final for ledger '+record.id);
  record.result={homeWon:g.hs>g.as,homeScore:g.hs,awayScore:g.as,recordedAt:now.toISOString()};
 }
}
export function evaluation(ledger){
 const settled=ledger.records.filter(x=>x.result);
 const n=settled.length;
 const brier=n?settled.reduce((s,r)=>s+(r.homeProbability-Number(r.result.homeWon))**2,0)/n:null;
 const logLoss=n?settled.reduce((s,r)=>s-(r.result.homeWon?Math.log(Math.max(1e-12,r.homeProbability)):Math.log(Math.max(1e-12,1-r.homeProbability))),0)/n:null;
 return {settled:n,recorded:ledger.records.length,brier,logLoss,accuracy:n?settled.filter(r=>(r.homeProbability>=.5)===r.result.homeWon).length/n:null,baselineBrier:n?settled.reduce((s,r)=>s+(.5-Number(r.result.homeWon))**2,0)/n:null,sampleStatus:n<100?'insufficient-for-reliability-claims':'ongoing-prospective-monitoring',timingWarnings:ledger.records.filter(x=>x.resultWarning).length};
}
export function appendFirstForecast(ledger,record,now){
 if(ledger.records.some(x=>identity(x)===identity(record)))return false;
 if(!/^\d+$/.test(identity(record))||!Number.isFinite(Date.parse(record.tipoff))||Date.parse(record.tipoff)<=now.getTime()||!num(record.homeProbability)||record.homeProbability<0||record.homeProbability>1||record.home===record.away)throw Error('Refusing invalid pregame estimate');
 if(!num(Date.parse(record.recordedAt))||Date.parse(record.recordedAt)>=Date.parse(record.tipoff))throw Error('Forecast must precede tipoff');
 ledger.records.push(record);
 return true;
}
