
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html=readFileSync('index.html','utf8');
const js=readFileSync('site-repair.js','utf8');
const css=readFileSync('site-repair.css','utf8');
const body=html.slice(html.indexOf('<body'));
const assets=[...html.matchAll(/(?:src|href)="([^"]+)"/g)]
 .map(x=>x[1]).filter(x=>!x.startsWith('#')&&!/^https?:/.test(x)&&!x.startsWith('data:'));
for(const a of assets) assert.ok(existsSync(a),'Missing local asset '+a);
assert.ok(assets.includes('founder-portrait.webp'),'Founder picture must be present');
assert.ok(assets.includes('court-story.svg'),'Mission picture must be present');
assert.ok(assets.includes('basketball-study.svg'),'About graphic must be present');
assert.ok(assets.includes('site-repair.css'));
assert.ok(assets.includes('site-repair.js'));

const pageIds=[...body.matchAll(/<section[^>]*class="page"[^>]*id="([^"]+)"/g)].map(x=>x[1]);
assert.equal(new Set(pageIds).size,pageIds.length,'Page IDs must not repeat');
for(const target of [...body.matchAll(/data-(?:page|go)="([^"]+)"/g)].map(x=>x[1]))
 assert.ok(pageIds.includes(target),'Broken route: '+target);
for(const key of ['live','intelligence','archive','insights','scout','gameroom','compare','model','about','teams','matchups','library'])
 assert.ok(pageIds.includes(key),'Page missing '+key);
for(const id of ['liveResults','scoreboardDate','scoreboardRefresh','scoutReadout','compareData','studioSave','studioSaved','archiveResults','archiveMetric','glossaryGrid'])
 assert.ok(html.includes('id="'+id+'"'),'UI target missing '+id);
assert.ok(!html.includes('src="assets/'),'No stale assets prefix');
assert.ok(!html.includes('src="live-data.js"'),'No missing compiled modules');

new vm.Script(js,{filename:'site-repair.js'});
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
