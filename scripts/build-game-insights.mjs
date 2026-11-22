import fs from 'node:fs';

const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const season=+today.slice(0,4)+(+today.slice(5,7)>=10?1:0);
const path='data/game-insights-'+season+'.json';
const boxes=JSON.parse(fs.readFileSync('data/game-boxscores-'+season+'.json','utf8'));
const players=JSON.parse(fs.readFileSync('data/player-history-'+season+'.json','utf8'));
const roster=JSON.parse(fs.readFileSync('data/rosters-'+season+'.json','utf8'));
if(boxes.format!=='aureum-game-boxscores-v1'||boxes.games.length!==boxes.availableGameCount)throw Error('Invalid box score source');
if(players.format!=='aureum-player-history-v1')throw Error('Invalid player participation source');
const old=fs.existsSync(path)?JSON.parse(fs.readFileSync(path)):null;
const oldById=new Map((old?.games||[]).map(x=>[x.id,x]));
const playerById=new Map(players.games.map(x=>[x.id,x]));
const playerNames=new Map(roster.teams.flatMap(x=>x.players.map(p=>[p.id,p.name])));
const esAPI='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=';
const r=(n,d=1)=>Math.round(n*10**d)/10**d;
const safeDiv=(a,b,m=1)=>b>0?r(a/b*m,2):null;
function calc(game,summary,previous){
 const pv=playerById.get(game.id);
 const metrics=[];
 const push=(category,id,team,value,unit,title,explain,formula,source,display=null)=>{
  if(!Number.isFinite(value))return;
  metrics.push({category,id,team,value:r(value,3),display:display??(r(value,2)+(unit?' '+unit:'')),title,explain,formula,source});
 };
 const home=game.homeStats.values,away=game.awayStats.values;
 const names={home:game.home,away:game.away};
 const winner=game.hs>game.as?game.home:game.away;
 const heads=[[game.home,home,away,game.hs,game.as],[game.away,away,home,game.as,game.hs]];
 for(const [code,a,b,score,opp] of heads){
  const pts3=3*a.threeMadePerGame,pts2=2*a.twoMadePerGame,ptsFT=a.ftMadePerGame;
  const misses=a.fgAttemptedPerGame-a.fgMadePerGame;
  const possessions=a.fgAttemptedPerGame-a.offReboundsPerGame+a.turnoversPerGame+.44*a.ftTriedPerGame;
  push('Shot DNA','threePointScoringShare',code,safeDiv(pts3,score,100),'%','Three-point scoring dependence','Share of points earned from three-pointers. This is not simply the share of shots attempted.','3 × made three-pointers ÷ team points × 100','Validated game box score');
  push('Shot DNA','freeThrowScoringShare',code,safeDiv(ptsFT,score,100),'%','Points from the free-throw line','Share of the team’s points that came from free throws.','Made free throws ÷ team points × 100','Validated game box score');
  push('Shot DNA','twoPointScoringShare',code,safeDiv(pts2,score,100),'%','Inside-the-arc point share','Scoring from two-point shots, whether inside or outside the paint. Not a paint-only statistic.','2 × made two-pointers ÷ team points × 100','Validated game box score');
  push('Shot DNA','pointsPerAttempt',code,safeDiv(score,a.fgAttemptedPerGame,1),'pts/FGA','Points produced per field-goal try','Total points relative to how many field goals were attempted. Includes free-throw points; not shot efficiency alone.','Team points ÷ field-goal attempts','Validated game box score');
  push('Shot DNA','threeToFreeThrow',code,safeDiv(pts3,Math.max(1,ptsFT),1),'×','Three-point vs. free-throw scoring','How much three-point scoring contributed compared with free throws. If no free throws were made, the denominator is one for display only.','Three-point points ÷ max(1, made free throws)','Validated game box score');
  push('Possession Oddities','offBoardsPerMiss',code,safeDiv(a.offReboundsPerGame,misses,100),'per 100','Offensive boards per 100 missed shots','A rough second-chance indicator. This is NOT official offensive-rebound percentage.','Offensive rebounds ÷ missed team field goals × 100','Validated game box score');
  push('Possession Oddities','turnoverBurden',code,safeDiv(a.turnoversPerGame,possessions,100),'per 100','Turnover burden per 100 estimated possessions','How often opportunities ended in a turnover, using a standard estimated-possession formula.','Turnovers ÷ (FGA − OREB + TO + 0.44 × FTA) × 100','Validated game box score · possession estimate');
  push('Possession Oddities','offensiveEfficiencyProxy',code,safeDiv(score,possessions,100),'pts/100','Points per 100 estimated possessions','An approximation of offensive efficiency based on box-score possessions, not an official possession count.','Points ÷ (FGA − OREB + TO + 0.44 × FTA) × 100','Validated game box score · possession estimate');
  push('Possession Oddities','recoveryMinusMistakes',code,a.offReboundsPerGame+a.stealsPerGame-a.turnoversPerGame,'events','Recoveries minus mistakes','Offensive rebounds plus recorded steals, minus turnovers. These are event counts, NOT exact extra possessions.','Offensive rebounds + steals − turnovers','Validated game box score');
  push('Possession Oddities','turnoverSwing',code,b.turnoversPerGame-a.turnoversPerGame,'turnovers','Turnover swing','How many more turnovers the opponent committed than this team.','Opponent turnovers − own turnovers','Validated game box score');
  push('Possession Oddities','freeThrowSwing',code,a.ftMadePerGame-b.ftMadePerGame,'points','Free-throw scoring advantage','The point difference earned from made free throws alone.','Own free throws made − opponent free throws made','Validated game box score');
  push('Possession Oddities','threePointSwing',code,3*(a.threeMadePerGame-b.threeMadePerGame),'points','Three-pointer point advantage','The scoring gap created by made threes, ignoring two-pointers and free throws.','3 × (own three-pointers made − opponent three-pointers made)','Validated game box score');
  push('Possession Oddities','extraShotAttempts',code,a.fgAttemptedPerGame-b.fgAttemptedPerGame,'attempts','Extra shot attempts','How many more or fewer field-goal attempts the team got. Not all attempts were equally valuable.','Own FGA − opponent FGA','Validated game box score');
  push('Shot DNA','assistedBasketFraction',code,safeDiv(a.assistsPerGame,a.fgMadePerGame,100),'%','Assisted-basket share','Approximately how often a made basket was recorded with an assist.','Recorded assists ÷ made field goals × 100','Validated game box score');
  if(code===winner){
   push('Statistical Paradoxes','wonWithLowerEfg',code,a.effectiveFgPct<b.effectiveFgPct?1:0,'','Won despite worse shot efficiency','Whether the winning team had lower effective field-goal percentage than the loser.','1 if winner eFG% is lower; otherwise 0','Validated game box score',a.effectiveFgPct<b.effectiveFgPct?'Yes — shooting upset':'No');
   push('Statistical Paradoxes','wonWithFewerBaskets',code,a.fgMadePerGame<b.fgMadePerGame?1:0,'','Won despite fewer made baskets','Whether the winning team made fewer field goals than the loser.','1 if winner FGM is lower; otherwise 0','Validated game box score',a.fgMadePerGame<b.fgMadePerGame?'Yes':'No');
   push('Statistical Paradoxes','wonDespiteReboundDeficit',code,a.reboundsPerGame<b.reboundsPerGame?1:0,'','Won despite being outrebounded','Whether the winning team grabbed fewer total rebounds.','1 if winner rebounds are lower; otherwise 0','Validated game box score',a.reboundsPerGame<b.reboundsPerGame?'Yes':'No');
  }
  const rows=pv?.players?.[code]?.filter(x=>x.played&&Number.isFinite(x.min)&&Number.isFinite(x.pts))||[];
  if(rows.length>=6){
   const byScore=[...rows].sort((x,y)=>y.pts-x.pts);
   const top=byScore[0],two=byScore.slice(0,2),three=byScore.slice(0,3);
   const pName=id=>playerNames.get(String(id))||null;
   const who=id=>pName(id)?pName(id)+' · ':'Player ID '+id+' · ';
   push('Player Extremes','topScorerLoad',code,safeDiv(top.pts,score,100),'%','Single-player scoring load',who(top.id)+'provided this share of the team’s points.','Team top scorer points ÷ team points × 100','Verified individual player box score');
   push('Player Extremes','topTwoLoad',code,safeDiv(two.reduce((n,x)=>n+x.pts,0),score,100),'%','Two-player scoring takeover',two.map(x=>pName(x.id)||'Player ID '+x.id).join(' + ')+': combined share of team points.','Two highest individual point totals ÷ team points × 100','Verified individual player box score');
   push('Player Extremes','topThreeLoad',code,safeDiv(three.reduce((n,x)=>n+x.pts,0),score,100),'%','Three-player scoring concentration','The combined percentage of points produced by the top three scorers.','Three highest scoring totals ÷ team points × 100','Verified individual player box score');
   const pace=[...rows].filter(x=>x.min>=10).sort((x,y)=>y.pts/y.min-x.pts/x.min);
   if(pace.length)push('Player Extremes','scoringVelocity',code,safeDiv(pace[0].pts,pace[0].min,1),'pts/min','Most points per minute',who(pace[0].id)+pace[0].pts+' points in '+pace[0].min+' minutes; requires at least 10 played minutes.','Points ÷ minutes for highest-rate player with ≥10 min','Verified individual player box score');
   const silent=[...rows].filter(x=>x.pts===0).sort((x,y)=>y.min-x.min)[0];
   if(silent&&silent.min>=5)push('Player Extremes','scorelessWorkhorse',code,silent.min,'minutes','Most minutes without scoring',who(silent.id)+'spent '+silent.min+' minutes playing without scoring. This does not measure defense or all-around impact.','Longest minutes among players with 0 points','Verified individual player box score');
   push('Player Extremes','doubleDigitDepth',code,rows.filter(x=>x.pts>=10).length,'players','Number of double-digit scorers','How many teammates scored at least 10 points.','Count of players with points ≥10','Verified individual player box score');
   push('Player Extremes','twentyPointDepth',code,rows.filter(x=>x.pts>=20).length,'players','Number of 20-point scorers','How many teammates reached 20 points.','Count of players with points ≥20','Verified individual player box score');
   const outside=[...rows].sort((x,y)=>y.min-x.min).slice(5);
   push('Player Extremes','outsideTopFiveMinutes',code,safeDiv(outside.reduce((n,x)=>n+x.pts,0),score,100),'%','Scoring beyond the five busiest players','Points scored by players outside the five highest-minute players. This does NOT claim that they were officially bench players.','Points by players ranked sixth or lower in minutes ÷ team points × 100','Verified individual player box score');
  }
 }
 const total=game.hs+game.as;
 push('Statistical Paradoxes','combinedThreePointShare','BOTH',safeDiv(3*(home.threeMadePerGame+away.threeMadePerGame),total,100),'%','Gamewide three-point dependency','Share of every point scored in this game that came from made three-pointers.','Both teams’ made threes × 3 ÷ combined points × 100','Validated game box score');
 push('Statistical Paradoxes','scoringGap','BOTH',Math.abs(game.hs-game.as),'points','Winning margin','The number of points separating the two teams at the final buzzer.','Absolute difference between final scores','Validated game box score');
 const pbp=derivePbp(game,summary);
 for(const x of pbp?.metrics||[])metrics.push(x);
 return {id:game.id,date:game.date,home:game.home,away:game.away,hs:game.hs,as:game.as,boxscoreUrl:game.boxscoreUrl,metrics,playByPlayVerified:!!pbp,playEventCount:pbp?.events||0};
}
function secLeft(p){let x=p.clock?.displayValue||p.clock?.value||p.clock||p.clockDisplayValue;
 if(typeof x==='number')return x;
 if(typeof x!=='string')return null;
 if(/^\d+(?:\.\d+)?$/.test(x))return Number(x);
 let m=x.match(/^(\d{1,2}):(\d{2})(?:\.\d+)?$/);if(m)return +m[1]*60+(+m[2]);
 m=x.match(/^PT(\d+)M(\d+(?:\.\d+)?)S$/);if(m)return +m[1]*60+(+m[2]);
 return null;
}
function derivePbp(g,d){
 const comp=d?.header?.competitions?.[0],home=comp?.competitors?.find(x=>x.homeAway==='home'),away=comp?.competitors?.find(x=>x.homeAway==='away');
 if(home?.team?.abbreviation&&home.team.abbreviation!==g.home&&!(g.home==='GSW'&&home.team.abbreviation==='GS')&&!(g.home==='NYK'&&home.team.abbreviation==='NY'))return null;
 const all=Array.isArray(d?.plays)?d.plays:Array.isArray(d?.plays?.plays)?d.plays.plays:Array.isArray(d?.playByPlay?.plays)?d.playByPlay.plays:[];
 const events=all.map((p,i)=>{
  const period=Number(p.period?.number??p.period),left=secLeft(p),h=Number(p.homeScore),a=Number(p.awayScore);
  if(!Number.isInteger(period)||period<1||period>8||left===null||left<0||left>(period<=4?720:300)+1||!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0)return null;
  return {index:i,period,clock:left,at:period<=4?(period-1)*720+(720-left):2880+(period-5)*300+(300-left),h,a};
 }).filter(Boolean).sort((a,b)=>a.at-b.at||a.index-b.index);
 if(g.id===boxes.games[0].id)console.log('PBP_NORMALIZED '+JSON.stringify({id:g.id,validEvents:events.length,first:events[0],last:events.at(-1),expected:[g.hs,g.as]}));
 if(events.length<100)return null;
 const result=events.at(-1);
 if(result.h!==g.hs||result.a!==g.as)return null;
 const good=[],counts=[0,0],quarter=[[0,0],[0,0],[0,0],[0,0]],scorers=[[],[]];let h=0,a=0,run=[-1,0],bestRun=[0,0],biggestLead=[0,0],changes=0,ties=0,priorNonTie=0,seenNonTie=0;
 for(const e of events){
  const dh=e.h-h,da=e.a-a;
  if(dh<0||da<0||dh>4||da>4||dh&&da)return null;
  h=e.h;a=e.a;
  const side=dh?0:da?1:-1,p=dh||da,lead=h-a;
  biggestLead[0]=Math.max(biggestLead[0],lead);biggestLead[1]=Math.max(biggestLead[1],-lead);
  if(side>=0){
   if(run[0]===side)run[1]+=p;else run=[side,p];
   bestRun[side]=Math.max(bestRun[side],run[1]);
   scorers[side].push({at:e.at,p});
   if(e.period<=4)quarter[e.period-1][side]+=p;
   if(lead===0)ties++;
   const sign=Math.sign(lead);
   if(sign&&seenNonTie&&sign!==priorNonTie)changes++;
   if(sign){priorNonTie=sign;seenNonTie++;}
  }
  good.push({...e,dh,da});
 }
 if(h!==g.hs||a!==g.as||scorers[0].length<20||scorers[1].length<20)return null;
 const metrics=[];
 const push=(id,team,val,unit,title,explain,formula,display=null)=>{if(!Number.isFinite(val))return;metrics.push({category:'Momentum Timeline',id,team,value:r(val,2),display:display??r(val,1)+' '+unit,title,explain,formula,source:'Verified ESPN play-by-play; score timeline reconciled to final result'});};
 const windowMax=arr=>{let best=0,l=0,active=0;for(let i=0;i<arr.length;i++){active+=arr[i].p;while(arr[i].at-arr[l].at>60){active-=arr[l++].p;}best=Math.max(best,active);}return best;};
 const gameDuration=2880+Math.max(0,events.at(-1).period-4)*300;
 const drought=arr=>{let previous=0,best=0;for(const e of arr){best=Math.max(best,e.at-previous);previous=e.at;}return Math.max(best,gameDuration-previous);};
 const winner=g.hs>g.as?0:1,maximumDeficit=Math.max(0,...good.map(e=>winner===0?e.a-e.h:e.h-e.a));
 const late3=good.filter(e=>e.period===4&&e.clock<=180);
 push('largestUnansweredRun',g.home,bestRun[0],'points','Largest unanswered burst','Most consecutive points without the opponent scoring.','Maximum uninterrupted team scoring run');
 push('largestUnansweredRun',g.away,bestRun[1],'points','Largest unanswered burst','Most consecutive points without the opponent scoring.','Maximum uninterrupted team scoring run');
 push('oneMinuteBurst',g.home,windowMax(scorers[0]),'points','Best 60-second scoring burst','Most points a team scored within any 60 seconds of game clock.','Maximum team points in rolling 60 game-clock seconds');
 push('oneMinuteBurst',g.away,windowMax(scorers[1]),'points','Best 60-second scoring burst','Most points a team scored within any 60 seconds of game clock.','Maximum team points in rolling 60 game-clock seconds');
 push('leadChanges','BOTH',changes,'changes','Lead exchanges','Times the lead changed directly or after a tie. Ties are not counted as lead changes.','Count of changes in nonzero lead sign after scoring plays');
 push('timesTied','BOTH',ties,'ties','Scoreboard ties','Scoring plays that brought the teams level, excluding the initial 0–0.','Count of scoring plays with equal final displayed score');
 push('maxLead',g.home,biggestLead[0],'points','Largest lead','Biggest advantage this team held during the game.','Maximum own score minus opponent score');
 push('maxLead',g.away,biggestLead[1],'points','Largest lead','Biggest advantage this team held during the game.','Maximum own score minus opponent score');
 push('winnerRecoveredDeficit',winner===0?g.home:g.away,maximumDeficit,'points','Biggest deficit overcome by winner','Largest hole the eventual winner climbed out of during the game.','Maximum opponent lead before final winner');
 push('scoringDrought',g.home,drought(scorers[0]),'sec','Longest scoring drought','Longest stretch without scoring measured on game clock, not wall-clock broadcast time.','Largest game-clock gap between scoring events, including start/end');
 push('scoringDrought',g.away,drought(scorers[1]),'sec','Longest scoring drought','Longest stretch without scoring measured on game clock, not wall-clock broadcast time.','Largest game-clock gap between scoring events, including start/end');
 push('finalThreeMinutes',g.home,late3.reduce((n,x)=>n+x.dh,0),'points','Final three-minute output','Points scored in the last 3:00 of regulation, not including overtime.','Q4 points from 3:00 remaining to 0:00');
 push('finalThreeMinutes',g.away,late3.reduce((n,x)=>n+x.da,0),'points','Final three-minute output','Points scored in the last 3:00 of regulation, not including overtime.','Q4 points from 3:00 remaining to 0:00');
 const quarters=quarter.map(x=>x[0]-x[1]);
 push('quarterSwing','BOTH',Math.max(...quarters)-Math.min(...quarters),'points','Quarter-to-quarter seesaw','Difference between the most home-favorable and most away-favorable regulation quarter.','Maximum Q1–Q4 home margin minus minimum Q1–Q4 home margin');
 push('thirdQuarterShift','BOTH',quarters[2]-quarters[1],'points','Halftime adjustment swing','Change in home-team point differential from second quarter to third quarter. This measures a score change, not coaching causation.','Q3 home margin − Q2 home margin');
 return {events:events.length,metrics};
}
async function summary(id){for(let i=0;i<2;i++){try{const r=await fetch(esAPI+id,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){if(i===1)return null;}}}
const games=[],unavailable=[],pending=boxes.games.filter(g=>!oldById.has(g.id)||!oldById.get(g.id).playByPlayVerified);
const newById=new Map();
for(let i=0;i<pending.length;i+=12){
 const batch=await Promise.all(pending.slice(i,i+12).map(async g=>[g,await summary(g.id)]));
 for(const [g,d] of batch){
  if(i===0&&g===batch[0][0]){
   const plays=Array.isArray(d?.plays)?d.plays:Array.isArray(d?.plays?.plays)?d.plays.plays:[];
   console.log('INSIGHTS_PBP_PROBE '+JSON.stringify({keys:Object.keys(d||{}),game:g.id,plays:plays.length,sample:plays[5]||plays[0],last:plays.at(-1),header:d?.header?.competitions?.[0]?.competitors?.map(x=>({abbr:x.team?.abbreviation,score:x.score}))}).slice(0,4500));
  }
  const record=calc(g,d);newById.set(g.id,record);if(!record.playByPlayVerified)unavailable.push(g.id);
 }
}
for(const g of boxes.games)games.push(newById.get(g.id)||oldById.get(g.id)||calc(g,null));
const allValues=new Map();
for(const g of games)for(const m of g.metrics){if(m.id==='wonWithLowerEfg'||m.id==='wonWithFewerBaskets'||m.id==='wonDespiteReboundDeficit')continue;const xs=allValues.get(m.id)||[];xs.push(m.value);allValues.set(m.id,xs);}
for(const values of allValues.values())values.sort((a,b)=>a-b);
for(const g of games)for(const m of g.metrics){const vals=allValues.get(m.id);if(!vals||vals.length<20)continue;let lower=0,equal=0;for(const n of vals){if(n<m.value)lower++;else if(n===m.value)equal++;else break;}m.seasonPercentile=Math.round(100*(lower+equal/2)/vals.length);}
const d={format:'aureum-game-insights-v1',season,retrievedAt:new Date().toISOString(),source:{boxscore:'Verified ESPN completed-game box scores',players:'ESPN completed-game player points and minutes',playByPlay:'ESPN game play-by-play, used only when clock and cumulative scores reconcile with the final'},completedGames:boxes.games.length,withVerifiedPlayByPlay:games.filter(g=>g.playByPlayVerified).length,unavailableGameIds:unavailable.slice(0,100),games};
fs.writeFileSync(path,JSON.stringify(d)+'\n');
console.log('INSIGHTS_AUDIT '+JSON.stringify({season,games:games.length,playByPlay:d.withVerifiedPlayByPlay,averageMetrics:r(games.reduce((n,g)=>n+g.metrics.length,0)/games.length),examples:games.slice(0,2).map(g=>({id:g.id,metrics:g.metrics.length,pbp:g.playByPlayVerified,events:g.playEventCount}))}));
