import assert from 'node:assert/strict';
import fs from 'node:fs';
import {regularSeasonOnly,verifyArchive} from '../scripts/forecast-integrity.mjs';
import {buildAdvanced,predict,features,context} from '../scripts/forecast-advanced.mjs';
import {validateLedger,selectPregameState,settleExisting,evaluation,appendFirstForecast} from '../scripts/forecast-ledger-core.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const archives=[2025,2026].map(y=>regularSeasonOnly(read('data/forecast-history-'+y+'.json'),{complete:true}));
assert.equal(archives.reduce((s,a)=>s+verifyArchive(a,{complete:true}).games,0),2460);
const current=regularSeasonOnly(read('data/completed-games-2027.json'));
const maxDate=Math.max(...current.games.map(g=>Date.parse(g.date)));
const now=new Date(maxDate+864e5);
const model=buildAdvanced(archives,current,read('data/player-history-2027.json'),now,read('data/player-history-2026.json'));
assert.equal(model.playerModel.enabled,false,'Postgame participation can never automatically adjust a pregame forecast');
assert.equal(model.version,'aureum-conditions-v2');
assert.equal(model.historicalGameCount,2460);
assert.ok(model.selection.validationFolds.every(f=>f.validThrough<model.backtest.testFrom));
assert.ok(model.backtest.pairedBrier?.interval95?.length===2);
assert.ok(model.weights.every(Number.isFinite));
assert.throws(()=>buildAdvanced([],{
 ...current,
 games:[...current.games,{...current.games[0],id:'999999991',date:new Date(now.getTime()+864e5).toISOString()}]
},null,now),/future-result leakage/,'No completed game from the future may enter model fitting');

const fromState={rating:1600,results:[1,0,1],margins:[12,-3,5],opponents:[1520,1495,1530],dates:['2026-11-20','2026-11-21'],lastDate:'2026-11-21',games:12};
const against={...fromState,rating:1500};
const x=features(context(fromState,'2026-11-23'),context(against,'2026-11-23'));
assert.ok(predict(model.weights,x)>predict(model.weights,features(context(against,'2026-11-23'),context(fromState,'2026-11-23'))),'Better strength should not lower estimated win chance');

const today='2026-11-22',future='2026-11-23';
const synthetic={todayDate:today,todayState:{BOS:{rating:1490}},state:{BOS:{rating:1600}}};
assert.equal(selectPregameState(synthetic,'2026-11-22T20:00Z').mode,'pre-date');
assert.equal(selectPregameState(synthetic,'2026-11-23T20:00Z').state.BOS.rating,1600,'Future games must use latest known completed games');
assert.throws(()=>selectPregameState(synthetic,'2026-11-21T20:00Z'),/earlier date/);
const trial={format:'aureum-forecast-ledger-v1',season:2027,records:[]};
const t=new Date('2026-11-22T18:00:00Z');
const example={id:'123456789',home:'BOS',away:'GSW',recordedAt:t.toISOString(),tipoff:'2026-11-23T01:00:00Z',homeProbability:0.6,coefficients:[.2,.5,.1,0,.2,0,.1]};
assert.equal(appendFirstForecast(trial,structuredClone(example),t),true);
assert.equal(appendFirstForecast(trial,{...example,homeProbability:.99},t),false);
assert.equal(trial.records[0].homeProbability,.6,'Locked probabilities must be immutable');
assert.equal(validateLedger(trial,2027).records.length,1);
assert.throws(()=>validateLedger({...trial,records:[...trial.records,...trial.records]},2027),/duplicate/);
assert.throws(()=>appendFirstForecast(trial,{...example,id:'999999992',recordedAt:'2026-11-24T00:00Z'},t),/before|precede/);
const delayed={id:example.id,home:'BOS',away:'GSW',date:'2026-11-23T04:00Z',hs:110,as:105};
settleExisting(trial,[delayed],new Date('2026-11-23T06:00Z'));
assert.ok(!trial.records[0].result,'Rescheduled game cannot silently settle at wrong tipoff');
assert.ok(trial.records[0].resultWarning);
settleExisting(trial,[{...delayed,date:example.tipoff}],new Date('2026-11-23T06:00Z'));
assert.equal(trial.records[0].result?.homeWon,true);
assert.equal(trial.records[0].homeProbability,.6,'Settling cannot rewrite a locked probability');
const metrics=evaluation(trial);
assert.equal(metrics.settled,1);
assert.equal(metrics.sampleStatus,'insufficient-for-reliability-claims');
assert.ok(metrics.brier>0&&Number.isFinite(metrics.logLoss));
const realLedger=read('data/forecast-ledger-2027.json');
assert.equal(validateLedger(realLedger,2027).records.length,realLedger.records.length);
console.log('FORECAST_AUDIT '+JSON.stringify({currentGames:current.games.length,historicalGames:model.historicalGameCount,heldOutGames:model.backtest.games,retrospectiveAccuracy:model.backtest.accuracy,retrospectiveBrier:model.backtest.brier,realProspectiveRecords:realLedger.records.length,realProspective:evaluation(realLedger)}));
console.log('PASS: future-result rejection, state freshness, conservative player impact, immutable ledger, schedule shifts and prospective evaluation');
