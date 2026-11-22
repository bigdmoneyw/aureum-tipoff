
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const js=readFileSync('site-repair.js','utf8');
const css=readFileSync('site-repair.css','utf8');
const body=html.slice(html.indexOf('<body'));
const assets=[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
 .map(x=>x[1].split('?')[0]).filter(x=>!x.startsWith('#')&&!/^https?:/.test(x)&&!x.startsWith('data:'));
for(const a of assets) assert.ok(existsSync(a),'Missing local asset '+a);
assert.ok(assets.includes('founder-portrait.webp'),'Founder picture must be present');
assert.ok(assets.includes('court-story.svg'),'Mission picture must be present');
assert.ok(assets.includes('basketball-study.svg'),'About graphic must be present');
assert.ok(assets.includes('site-repair.css'));
assert.ok(assets.includes('site-repair.js'));
assert.ok(assets.includes('team-experience.js'));
assert.ok(!body.includes('id="archive"')&&!body.includes('data-page="archive"'),'History is removed');

const pageIds=[...body.matchAll(/<section[^>]*class="page"[^>]*id="([^"]+)"/g)].map(x=>x[1]);
assert.equal(new Set(pageIds).size,pageIds.length,'Page IDs must not repeat');
for(const target of [...body.matchAll(/data-(?:page|go)="([^"]+)"/g)].map(x=>x[1]))
 assert.ok(pageIds.includes(target),'Broken route: '+target);
for(const key of ['live','intelligence','insights','scout','gameroom','compare','model','about','teams','matchups','library'])
 assert.ok(pageIds.includes(key),'Page missing '+key);
for(const id of ['liveResults','scoreboardDate','scoreboardRefresh','scoutReadout','compareData','insightsGameSelect','insightsSummary','insightsSpotlights','insightsMetricGrid','insightsSourceNote','teamDetails','pastGameSelect','gameRoomContext','competitionDesk','glossaryGrid'])
 assert.ok(html.includes('id="'+id+'"'),'UI target missing '+id);
assert.ok(!html.includes('src="assets/'),'No stale assets prefix');
assert.ok(!html.includes('src="live-data.js"'),'No missing compiled modules');

new vm.Script(js,{filename:'site-repair.js'});
new vm.Script(readFileSync('team-experience.js','utf8'),{filename:'team-experience.js'});
new vm.Script(readFileSync('game-room.js','utf8'),{filename:'game-room.js'});
new vm.Script(readFileSync('insights-explorer.js','utf8'),{filename:'insights-explorer.js'});
const roster=JSON.parse(readFileSync('data/rosters-2027.json','utf8'));
assert.equal(roster.teams.length,30,'Thirty current roster snapshots');
const rosterIds=roster.teams.flatMap(team=>team.players.map(player=>player.id));
assert.equal(rosterIds.length,new Set(rosterIds).size,'Player membership must not conflict between teams');
for(const team of roster.teams)assert.ok(team.players.length>=8&&team.players.length<=35);
const model=JSON.parse(readFileSync('data/forecast-2027.json','utf8'));
assert.equal(model.format,'aureum-forecast-v1');
assert.equal(model.weights.length,4);
assert.ok(model.weights.every(Number.isFinite));
assert.equal(Object.keys(model.state).length,30);
assert.ok(model.backtest.trainingThrough<model.backtest.testFrom,'No date overlap between training and holdout');
assert.ok(model.backtest.games>=25&&model.backtest.brier>=0&&model.backtest.brier<=1);
for(const id of ['forecastDate','forecastFixture','forecastVenue','forecastFactors','forecastPlayers','forecastRefreshRoster','forecastCustomShift','forecastReset','forecastValidation'])
 assert.ok(html.includes('id="'+id+'"'),'Game Room control missing '+id);
const advanced=JSON.parse(readFileSync('data/forecast-v2-2027.json','utf8'));
assert.equal(advanced.format,'aureum-forecast-v2');
assert.equal(advanced.weights.length,7);
assert.ok(advanced.weights.every(Number.isFinite));
assert.ok(advanced.backtest.trainingThrough<advanced.backtest.testFrom);
assert.ok(advanced.historicalGameCount>=2400,'Two historical seasons collected');
assert.ok(advanced.backtest.games>=150);
assert.ok(advanced.backtest.brier>=0&&advanced.backtest.brier<=1);
for(const n of [7,30,60]){
 const h=advanced.horizonModels?.[n];assert.ok(h&&h.trainingGames>=1000&&h.weights.length===7&&h.weights.every(Number.isFinite),'Missing trained horizon '+n);
 assert.equal(h.weights[3],0,'Unknown future rest is not a learned horizon input');
 assert.equal(h.weights[5],0,'Unknown future schedule load is not a horizon input');
}
assert.ok(advanced.playerCoverage>=200&&Object.keys(advanced.playerProfiles).length>=300);
const ledger=JSON.parse(readFileSync('data/forecast-ledger-2027.json','utf8'));
assert.equal(new Set(ledger.records.map(r=>r.id)).size,ledger.records.length);
for(const r of ledger.records){assert.ok(Date.parse(r.recordedAt)<Date.parse(r.tipoff),'Predictions recorded before tipoff');assert.ok(r.homeProbability>=0&&r.homeProbability<=1);}
const catalog=JSON.parse(readFileSync('data/metric-catalog.json','utf8'));
assert.equal(catalog.metrics.length,30,'Exactly 30 team statistics');
assert.equal(new Set(catalog.metrics.map(x=>x.key)).size,30);
for(const row of catalog.metrics)assert.ok(row.label&&row.brief&&row.explanation,'All 30 metrics must have brief and full explanations');
for(const row of catalog.metrics){assert.ok(row.whyItMatters&&row.whyItMatters.length>55,'Missing why-it-matters explanation: '+row.key);assert.ok(row.explanation.trim().split(/\s+/).length>=44,'Definition too short: '+row.key);}
const source=readFileSync('team-experience.js','utf8');
assert.ok(source.includes('class="learn-explanation"')&&source.includes('class="learn-why"'),'Learn must render substantial explanations');
assert.ok(!source.slice(source.indexOf('function showLearn(){'),source.indexOf('function renderGameRoomContext()')).includes('details('),'Learn should not render Teams tooltip icons');
const sourced=JSON.parse(readFileSync('data/teams-2027.json','utf8'));
assert.equal(sourced.teamCount,30);
assert.equal(sourced.metricCount,30);
assert.equal(sourced.records.length,30);
for(const team of sourced.records)for(const m of catalog.metrics)assert.ok(Number.isFinite(team.values[m.key]),team.code+' missing '+m.key);
const completedGameArchive=JSON.parse(readFileSync('data/completed-games-2027.json','utf8'));
const boxes=JSON.parse(readFileSync('data/game-boxscores-2027.json','utf8'));
assert.equal(boxes.format,'aureum-game-boxscores-v1');
assert.equal(boxes.availableGameCount,boxes.games.length);
assert.equal(boxes.completedGameCount,completedGameArchive.count);
assert.ok(boxes.availableGameCount>100,'Expected an audited season-wide archive');
const scoreLookup=new Map(completedGameArchive.games.map(g=>[g.id,g]));
for(const game of boxes.games){
 const original=scoreLookup.get(game.id);
 assert.ok(original&&game.hs===original.hs&&game.as===original.as,'Archived scores must match '+game.id);
 assert.equal(Object.keys(game.homeStats.values).length,30);
 assert.equal(Object.keys(game.awayStats.values).length,30);
 for(const m of catalog.metrics){
  assert.ok(game.homeStats.values[m.key]===null||Number.isFinite(game.homeStats.values[m.key]),game.id+' home '+m.key);
  assert.ok(game.awayStats.values[m.key]===null||Number.isFinite(game.awayStats.values[m.key]),game.id+' away '+m.key);
 }
 assert.equal(game.homeStats.values.pointsPerGame,game.hs);
 assert.equal(game.awayStats.values.pointsPerGame,game.as);
}
assert.ok(body.includes('Past Games'),'Completed-game navigation is labeled Past Games');
const insights=JSON.parse(readFileSync('data/game-insights-2027.json','utf8'));
assert.equal(insights.format,'aureum-game-insights-v1');
assert.equal(insights.games.length,boxes.games.length,'Insights covers every sourced completed game');
const boxById=new Map(boxes.games.map(x=>[x.id,x]));
for(const record of insights.games){
 const game=boxById.get(record.id);
 assert.ok(game&&record.hs===game.hs&&record.as===game.as,'Insights game identity/score mismatch '+record.id);
 assert.ok(record.metrics.length>=24,'Missing measurable discoveries '+record.id);
 for(const m of record.metrics){
  assert.ok(Number.isFinite(m.value)&&m.title&&m.explain&&m.formula&&m.source&&m.category&&m.team&&m.display,'Untraceable Insight '+record.id+' / '+m.id);
  assert.ok(m.team==='BOTH'||m.team===game.home||m.team===game.away,'Wrong team for Insight '+m.id);
 }
 if(record.playByPlayVerified)assert.ok(record.playEventCount>=100,'Verified timeline needs sufficient events');
}
assert.equal(insights.withVerifiedPlayByPlay,insights.games.filter(g=>g.playByPlayVerified).length);

const idPairs=[...js.matchAll(/([A-Z]{3}):161061\d{4}/g)];
assert.equal(idPairs.length,30,'Expected 30 NBA team logo ids');
assert.equal(new Set(idPairs.map(x=>x[1])).size,30,'Team logo ids must be unique');
assert.ok(css.includes('@media(max-width:760px)'),'Responsive styling required');
assert.ok(js.includes('No unsupported percentages are reported'),'No fake prediction percentage should be displayed');

function sourceFunction(from,to,context){
 const start=js.indexOf('function '+from+'('),end=js.indexOf('function '+to+'(',start);
 assert.ok(start>=0&&end>start,'Cannot find '+from);
 return vm.runInNewContext('('+js.slice(start,end).trim()+')',context);
}
const nbaIds=Object.fromEntries(idPairs.map(x=>[x[1],true]));
const norm=x=>({GS:'GSW',NY:'NYK',SA:'SAS',NO:'NOP'})[String(x).toUpperCase()]||String(x).toUpperCase();
const parseStanding=sourceFunction('entriesFromStandings','getStandings',{norm,nbaIds,Number,Object,Array,Set});
const standings=parseStanding({children:[{standings:{entries:[
 {team:{abbreviation:'GS'},stats:[{name:'wins',value:9},{name:'losses',value:7}]},
 {team:{abbreviation:'BOS'},stats:[{name:'wins',value:12},{name:'losses',value:3}]},
 {team:{abbreviation:'XYZ'},stats:[{name:'wins',value:99},{name:'losses',value:0}]}
]}}]});
assert.equal(standings.GSW.w,9);
assert.equal(standings.BOS.l,3);
assert.equal(standings.XYZ,undefined);

const targetDate='2026-11-19';
const scoreboard=sourceFunction('normalizeScoreboard','gameCard',{norm,nbaIds,Date,Set,Number,Error,etDate:()=>targetDate,statusText:()=> 'Final'});
const valid={id:'s1',date:'2026-11-19T23:00:00Z',status:{type:{completed:true,state:'post'}},competitions:[{competitors:[
 {homeAway:'home',team:{abbreviation:'BOS'},score:'102'},
 {homeAway:'away',team:{abbreviation:'GS'},score:'101'}
]}]};
const games=scoreboard({events:[valid,valid]},targetDate);
assert.equal(games.length,1,'Duplicate games should be removed');
assert.equal(games[0].away,'GSW');
assert.equal(games[0].hScore,102);
const wrong={...valid,id:'s2',competitions:[{competitors:[
 {homeAway:'home',team:{abbreviation:'BOS'},score:'-100'},
 {homeAway:'away',team:{abbreviation:'GS'},score:'103'}
]}]};
const valid2={...valid,id:'s3'};
const gamesFiltered=scoreboard({events:[wrong,valid2]},targetDate);
assert.equal(gamesFiltered.length,1,'Invalid completed scores should be dropped');

console.log('PASS: routes, image assets, JavaScript, 30 team logos, standings validation and scoreboard integrity fixtures');
