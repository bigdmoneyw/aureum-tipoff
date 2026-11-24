import assert from 'node:assert/strict';
import fs from 'node:fs';
import {knownCupFinals,isCupChampionship,regularSeasonOnly,verifyArchive,isRegularSeasonGame,competitionFromESPNEvent} from '../scripts/forecast-integrity.mjs';
import {buildAdvanced} from '../scripts/forecast-advanced.mjs';

const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
for(const season of [2025,2026]){
 const source=read('data/forecast-history-'+season+'.json');
 const original=source.games.length;
 const clean=regularSeasonOnly(source,{complete:true});
 assert.equal(clean.games.length,1230,'82 NBA regular-season games per team');
 assert.equal(verifyArchive(clean,{complete:true}).games,1230);
 assert.ok(!clean.games.some(g=>g.id===knownCupFinals[season].id));
 assert.ok(original===1230||original===1231,'Unexpected source season size '+season);
 if(original!==clean.games.length)assert.throws(()=>verifyArchive(source,{complete:true}),/championship|1230/, 'Raw championship cannot enter training');
 const [sample]=clean.games;
 assert.throws(()=>verifyArchive({...clean,games:[...clean.games,sample]},{complete:false}),/Unusable game/, 'Reject duplicate game IDs');
}
assert.ok(isCupChampionship({id:'401734908',date:'2024-12-18T01:30Z'},2025));
assert.ok(isCupChampionship({id:'preview',date:'2026-12-12T01:00Z',neutral:true},2027));
assert.ok(!isCupChampionship({id:'preview',date:'2026-12-12T01:00Z',neutral:false},2027));

const fakeGame={id:'999000001',date:'2027-05-06T23:00Z',home:'BOS',away:'NYK',hs:108,as:99};
assert.equal(competitionFromESPNEvent({...fakeGame,season:{type:2}},2027),'nba-regular-season');
assert.equal(competitionFromESPNEvent({...fakeGame,season:{type:1}},2027),'nba-preseason');
assert.equal(competitionFromESPNEvent({...fakeGame,season:{type:3}},2027),'nba-postseason');
assert.equal(competitionFromESPNEvent({...fakeGame,season:{type:4}},2027),'nba-other');
assert.equal(competitionFromESPNEvent({id:'888',date:'2026-12-12T01:00Z',season:{type:2},competitions:[{neutralSite:true}]},2027),'nba-cup-championship');
assert.equal(isRegularSeasonGame({...fakeGame,seasonType:3},2027),false);
assert.equal(isRegularSeasonGame({...fakeGame,competition:'nba-regular-season',seasonType:2},2027),true);
const mixed={format:'aureum-completed-games-v1',season:2027,count:3,games:[
 {...fakeGame,id:'999000002',competition:'nba-regular-season',seasonType:2},
 {...fakeGame,id:'999000003',competition:'nba-postseason',seasonType:3},
 {...fakeGame,id:'999000004',competition:'nba-preseason',seasonType:1}
]};
const filtered=regularSeasonOnly(mixed);
assert.equal(filtered.games.length,1);
assert.equal(filtered.count,1);
assert.deepEqual(filtered.excludedOtherCompetitionGameIds,['999000003','999000004']);
assert.throws(()=>verifyArchive(mixed),/Non-regular-season/);

const archives=[2025,2026].map(season=>regularSeasonOnly(read('data/forecast-history-'+season+'.json'),{complete:true}));
const current=regularSeasonOnly(read('data/completed-games-2027.json'));
const players=read('data/player-history-2027.json'),previous=read('data/player-history-2026.json');
const maxDate=Math.max(...current.games.map(g=>Date.parse(g.date)));
const model=buildAdvanced(archives,current,players,new Date(maxDate+86400000),previous);
assert.equal(model.version,'aureum-conditions-v2');
assert.equal(model.historicalGameCount,2460);
assert.ok(model.backtest.trainingThrough<model.backtest.testFrom,'No test dates used for training');
assert.equal(model.weights.length,7);
assert.ok(model.weights.every(Number.isFinite));
assert.ok(model.backtest.games>=100&&model.backtest.brier>0&&model.backtest.brier<1);
assert.ok(model.selection.validationFolds.length===2);
for(const fold of model.selection.validationFolds){
 assert.ok(fold.trainingGames>=100&&fold.validGames>=40);
 assert.ok(fold.validFrom<=fold.validThrough&&fold.validThrough<model.backtest.testFrom);
}
assert.ok(model.selection.temperature>=.8&&model.selection.temperature<=1.2);
assert.ok(model.backtest.accuracyInterval95.low<=model.backtest.accuracy);
assert.ok(model.backtest.accuracyInterval95.high>=model.backtest.accuracy);
assert.ok(model.backtest.pairedBrier.days>=8);
assert.ok(Number.isFinite(model.backtest.diagnostics.expectedCalibrationError));
assert.ok(model.backtest.diagnostics.expectedCalibrationError>=0&&model.backtest.diagnostics.expectedCalibrationError<=1);
assert.equal(model.backtest.diagnostics.monthly.reduce((n,row)=>n+row.games,0),model.backtest.games,'Every game included in monthly diagnostics');
assert.ok(model.backtest.diagnostics.highConfidence.games<=model.backtest.games);
for(const days of [7,30,60]){
 const h=model.horizonModels[days];
 assert.ok(h&&h.weights.length===7);
 assert.equal(h.weights[3],0,'Do not learn future rest that cannot be observed');
 assert.equal(h.weights[5],0,'Do not learn future schedule load that cannot be observed');
}
if(model.playerModel?.enabled)assert.ok(model.playerModel.brier<model.playerModel.baselineBrier);
console.log('FORECAST_STRENGTHENING_REPORT '+JSON.stringify({
 removedKnownCupFinals:2,regularSeasonGames:2460,forwardFolds:model.selection.validationFolds,
 chosen:{lambda:model.selection.lambda,wide:model.selection.wide,temperature:model.selection.temperature,validationBrier:model.selection.brier},
 currentHoldout:model.backtest,prospectiveRequired:true
}));
console.log('PASS: verified 82-game seasons, cup segregation, calibrated forward validation, holdout integrity and 7/30/60-day models');
