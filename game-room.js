/* Aureum Tipoff Game Room: current rosters, game conditions, and transparent model. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('forecastResult'))return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=x=>({GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN'})[String(x||'').toUpperCase()]||String(x||'').toUpperCase();
const teams={
 ATL:[1,1610612737,'Atlanta Hawks'],BOS:[2,1610612738,'Boston Celtics'],BKN:[17,1610612751,'Brooklyn Nets'],CHA:[30,1610612766,'Charlotte Hornets'],CHI:[4,1610612741,'Chicago Bulls'],CLE:[5,1610612739,'Cleveland Cavaliers'],DAL:[6,1610612742,'Dallas Mavericks'],DEN:[7,1610612743,'Denver Nuggets'],DET:[8,1610612765,'Detroit Pistons'],GSW:[9,1610612744,'Golden State Warriors'],HOU:[10,1610612745,'Houston Rockets'],IND:[11,1610612754,'Indiana Pacers'],LAC:[12,1610612746,'LA Clippers'],LAL:[13,1610612747,'Los Angeles Lakers'],MEM:[29,1610612763,'Memphis Grizzlies'],MIA:[14,1610612748,'Miami Heat'],MIL:[15,1610612749,'Milwaukee Bucks'],MIN:[16,1610612750,'Minnesota Timberwolves'],NOP:[3,1610612740,'New Orleans Pelicans'],NYK:[18,1610612752,'New York Knicks'],OKC:[25,1610612760,'Oklahoma City Thunder'],ORL:[19,1610612753,'Orlando Magic'],PHI:[20,1610612755,'Philadelphia 76ers'],PHX:[21,1610612756,'Phoenix Suns'],POR:[22,1610612757,'Portland Trail Blazers'],SAC:[23,1610612758,'Sacramento Kings'],SAS:[24,1610612759,'San Antonio Spurs'],TOR:[28,1610612761,'Toronto Raptors'],UTA:[26,1610612762,'Utah Jazz'],WAS:[27,1610612764,'Washington Wizards']
};
const name=c=>teams[c]?.[2]||c;
const logo=c=>'https://cdn.nba.com/logos/nba/'+teams[c]?.[1]+'/global/L/logo.svg';
const api='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/';
const isLocal=['localhost','127.0.0.1'].includes(location.hostname);
const dayET=d=>{const a=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d||new Date());const p=k=>a.find(x=>x.type===k).value;return p('year')+'-'+p('month')+'-'+p('day');};
const dayValue=x=>Date.parse(x+'T00:00:00Z')/86400000;
const today=()=>dayET(new Date());
const season=()=>{const d=today();return +d.slice(5,7)>=10?+d.slice(0,4)+1:+d.slice(0,4)};
const time=x=>Number.isFinite(Date.parse(x))?new Date(x).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':'Unknown';
const ageHours=x=>(Date.now()-Date.parse(x))/3600000;
const fresh=(x,limit)=>Number.isFinite(ageHours(x))&&ageHours(x)>=-0.08&&ageHours(x)<=limit;
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const sig=z=>1/(1+Math.exp(-clamp(z,-30,30)));
let model=null,rosters=null,fixtures=[],rosterCache=new Map(),requestId=0,fixtureRequest=0,lastModelFetch=0;
let activePair='',rosterIssue='',rosterLoading=false;
const state=()=>({a:$('gameAway').value,b:$('gameHome').value,venue:+$('forecastVenue').value,date:$('forecastDate').value});
async function json(url){
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('HTTP '+r.status);
 return r.json();
}
async function snapshot(file){
 const local='data/'+file, raw='https://raw.githubusercontent.com/bigdmoneyw/aureum-tipoff/main/data/'+file;
 if(isLocal)return json(local);
 return json(raw).catch(()=>json(local));
}
function validModel(d){
 const advanced=d?.format==='aureum-forecast-v2'&&d.version==='aureum-conditions-v2';
 if((!advanced&&!(d?.format==='aureum-forecast-v1'&&d.version==='aureum-elo-rest-form-v1'))||d.season!==season()||!Array.isArray(d.weights)||d.weights.length!==(advanced?7:4)||!d.weights.every(Number.isFinite)||!d.backtest||d.backtest.games<25||!Number.isFinite(d.backtest.brier))throw Error('Invalid forecast snapshot');
 for(const states of [d.state,d.todayState||d.state])for(const code of Object.keys(teams)){
  const s=states?.[code];
  if(!s||!Number.isFinite(s.rating)||!Number.isInteger(s.games)||!Array.isArray(s.results)||s.results.length>10||!s.results.every(n=>n===0||n===1))throw Error('Invalid team model state '+code);
  if(advanced&&['margins','dates','opponents'].some(k=>!Array.isArray(s[k])||s[k].length>10))throw Error('Invalid extended team history');
 }
 return d;
}
async function loadData(force=false){
 if(!force&&Date.now()-lastModelFetch<120000)return;
 lastModelFetch=Date.now();
 try{model=validModel(await snapshot('forecast-v2-'+season()+'.json'));}catch(e){try{model=validModel(await snapshot('forecast-'+season()+'.json'));}catch(e){if(!model)model=null;}}
 try{const r=await snapshot('rosters-'+season()+'.json');if(r.format!=='aureum-rosters-v1'||r.season!==season()||r.teams.length!==30)throw Error('Invalid roster snapshot');rosters=r;}catch(e){}
 render();
}
const formatRest=(n,known)=>!known?'Unknown (neutral 1-day input)':n===0?'Back-to-back':n===3?'3+ full days':n+' full day'+(n===1?'':'s');
function context(code,date){
 const sourceState=date===model.todayDate&&model.todayState?model.todayState:model.state;
 const t=sourceState[code],recentGames=t.results.length,recentWins=t.results.reduce((a,b)=>a+b,0),known=!!t.lastDate;
 return {rating:t.rating,form:(recentWins+2)/(recentGames+4),recentWins,recentGames,rest:known?clamp(dayValue(date)-dayValue(t.lastDate)-1,0,3):1,restKnown:known,games:t.games,lastDate:t.lastDate,margin:(t.margins||[]).reduce((s,x)=>s+x,0)/((t.margins||[]).length+4),load:(t.dates||[]).filter(d=>dayValue(date)-dayValue(d)>=1&&dayValue(date)-dayValue(d)<=7).length,opponent:(t.opponents||[]).reduce((s,x)=>s+x-1500,0)/((t.opponents||[]).length+4)};
}
const factorRows=[
 ['pace','Game speed','Slower game','Faster game','A faster game gives both teams more chances to score. Which team benefits depends on how well they play at that speed.'],
 ['travel','Travel and fatigue','Long or difficult travel','Easy travel','Travel can reduce recovery time and energy before a game.'],
 ['rotation','Lineup familiarity','Unfamiliar lineup','Familiar lineup','Players who have played together know each other’s positioning and tendencies.'],
 ['bench','Bench depth','Limited substitutes','Strong substitutes','Reliable substitutes help maintain performance when starters rest.'],
 ['fit','Playing-style matchup','Difficult matchup','Favorable matchup','One team’s style can exploit another team’s weaknesses.'],
 ['shooting','Outside shooting matchup','Poor shooting opportunities','Good shooting opportunities','Open long-range shots can reward a good shooting team.'],
 ['rim','Scoring near the basket','Difficult inside scoring','Easy inside scoring','Getting close to the basket can create high-quality scoring chances.'],
 ['pressure','Handling defensive pressure','Struggles against pressure','Handles pressure well','Pressure can force mistakes and take away scoring chances.'],
 ['rebounding','Second chances','Weak rebounding matchup','Strong rebounding matchup','Recovering missed shots creates extra opportunities to score.'],
 ['transition','Fast breaks','Vulnerable to fast breaks','Strong fast-break matchup','Scoring before opponents organize their defense can create easy baskets.'],
 ['fouls','Foul trouble risk','Higher foul risk','Lower foul risk','Fouls can give opponents free throws and force important players to sit.'],
 ['coaching','Tactical preparation','Unfavorable preparation','Favorable preparation','A well-matched game plan can help players exploit weaknesses.'],
 ['motivation','Competitive circumstances','Unfavorable circumstances','Favorable circumstances','Urgency and focus may affect effort, but neither is a measured guarantee.'],
 ['altitude','Arena conditions','Unfamiliar conditions','Familiar conditions','Unfamiliar altitude or surroundings may affect comfort and recovery.'],
 ['ballmovement','Passing and teamwork','Disrupted ball movement','Effective ball movement','Good passing can create easier shots and reduce wasted possessions.'],
 ['defense','Defensive matchup','Poor defensive fit','Strong defensive fit','A team that matches up well defensively may limit its opponent’s scoring chances.']
];
const shifts=[['0','No added effect'],['-50','Large disadvantage'],['-25','Moderate disadvantage'],['-10','Small disadvantage'],['10','Small advantage'],['25','Moderate advantage'],['50','Large advantage']];
const options=list=>list.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join('');
function makeFactors(){
 $('forecastFactors').innerHTML=factorRows.map(([key,label,low,high,why])=>'<div class="forecast-factor"><div><label>'+esc(label)+'<select id="factor-'+key+'-condition">'+options([['normal','Normal / no assumption'],['aLow','Team A: '+low],['aHigh','Team A: '+high],['bLow','Team B: '+low],['bHigh','Team B: '+high]])+'</select></label><p>'+esc(why)+'</p></div><label>How much does it favor Team A?<select id="factor-'+key+'-shift">'+options(shifts)+'</select><span class="small">Illustrative, not a measured effect.</span></label></div>').join('');
}
function sourceRoster(code){
 if(rosterCache.has(code)&&fresh(rosterCache.get(code).retrievedAt,8))return rosterCache.get(code);
 const t=rosters?.teams.find(x=>x.code===code);return t?{...t,mode:'snapshot',injurySourceTimestamp:rosters.injurySourceTimestamp}:null;
}
function savedPlayers(){
 const all={A:{},B:{}};
 for(const side of ['A','B'])for(let i=1;i<=3;i++){
  const select=$('player'+side+i+'Name');if(!select?.value)continue;
  all[side][i]={id:select.value,status:$('player'+side+i+'Status').value,shift:$('player'+side+i+'Shift').value};
 }
 return all;
}
const statusOptions=[['reported','Show report only'],['available','Plays normally'],['limited','Plays fewer minutes'],['out','Does not play']];
function drawPlayers(preserve=true){
 const st=state(),old=preserve?savedPlayers():{A:{},B:{}};
 $('forecastPlayers').innerHTML=['A','B'].map(side=>{
  const c=side==='A'?st.a:st.b,t=sourceRoster(c);
  const valid=t&&fresh(t.retrievedAt,8);
  const roster=valid?t.players:[],reportCount=roster.filter(p=>p.report).length;
  const info=valid?(t.mode==='live'?'Live roster retrieved ':'Roster snapshot retrieved ')+time(t.retrievedAt)+' · '+roster.length+' players · '+(t.injuryFeedAvailable?reportCount+' reported entries':'injury feed unavailable'):'Current roster unavailable or older than 8 hours. No player names substituted.';
  return '<div class="forecast-player-team"><div class="forecast-player-head"><img src="'+logo(c)+'" alt=""><div><h4>'+esc(name(c))+'</h4><p>'+esc(info)+'</p></div></div>'+Array.from({length:3},(_,j)=>{
   const i=j+1,prefix='player'+side+i;
   return '<article class="forecast-player-card"><label>Player '+i+'<select id="'+prefix+'Name" class="forecast-player-choice" '+(!valid?'disabled':'')+'><option value="">Select a roster player (optional)</option>'+options(roster.map(p=>[p.id,p.name+(p.position?' · '+p.position:'')+(p.report?.status?' · '+p.report.status:'')]))+'</select></label><p class="forecast-report" id="'+prefix+'Report">Select a player to view the dated report, if available.</p><div class="forecast-two"><label>Availability assumption<select id="'+prefix+'Status">'+options(statusOptions)+'</select></label><label>Assumed strength impact<select id="'+prefix+'Shift">'+options([['auto','Estimate from past playing time'],...shifts])+'</select></label></div></article>';
  }).join('')+'</div>';
 }).join('');
 for(const side of ['A','B'])for(let i=1;i<=3;i++){
  const p=old[side][i],id='player'+side+i;
  if(p&&Array.from($(id+'Name').options).some(x=>x.value===p.id)){$(id+'Name').value=p.id;$(id+'Status').value=p.status;$(id+'Shift').value=p.shift;}
 }
 $('forecastRosterStatus').textContent=rosterLoading?'Retrieving current roster and injury reports for both teams…':rosterIssue||'ESPN roster membership and injury reports are refreshed independently. No listed report is not proof a player is available.';
 render();
}
async function loadSelectedRoster(force=false,keep=true){
 const {a,b}=state(),my=++requestId,pair=a+'|'+b;
 const preserve=keep&&pair===activePair;activePair=pair;
 rosterIssue='';rosterLoading=true;drawPlayers(preserve);
 if(!teams[a]||!teams[b]||a===b){rosterLoading=false;drawPlayers(preserve);return;}
 if(isLocal){rosterLoading=false;drawPlayers(preserve);return;}
 try{
  const injury=await json(api+'injuries').catch(()=>null);
  if(my!==requestId)return;
  const reports=Array.isArray(injury?.injuries)?new Map(injury.injuries.map(x=>[String(x.id),x.injuries||[]])):null;
  const all=await Promise.allSettled([a,b].map(async c=>{
   const old=rosterCache.get(c);if(!force&&old&&fresh(old.retrievedAt,0.08))return old;
   const d=await json(api+'teams/'+teams[c][0]+'/roster');
   if(norm(d.team?.abbreviation)!==c||+d.season?.year!==season())throw Error('Roster identity or season mismatch');
   const seen=new Set(),playerRows=(d.athletes||[]).flatMap(x=>Array.isArray(x.items)?x.items:[x]);
   const players=playerRows.filter(x=>/^\d+$/.test(String(x.id||''))&&x.fullName&&!seen.has(String(x.id))&&seen.add(String(x.id))).map(x=>{
    const report=(reports?.get(String(teams[c][0]))||[]).find(r=>String(r.athlete?.id||'')===String(x.id)||r.athlete?.displayName===x.fullName);
    return {id:String(x.id),name:x.fullName,position:x.position?.abbreviation||'',report:report?{status:report.status||'Unspecified',date:report.date||null}:null};
   }).sort((x,y)=>x.name.localeCompare(y.name));
   if(players.length<8||players.length>35)throw Error('Invalid roster size');
   return {code:c,players,mode:'live',retrievedAt:new Date().toISOString(),injuryFeedAvailable:!!reports,injurySourceTimestamp:injury?.timestamp||null};
  }));
  if(my!==requestId)return;
  for(const item of all)if(item.status==='fulfilled')rosterCache.set(item.value.code,item.value);
  const x=sourceRoster(a),y=sourceRoster(b);
  if(x&&y&&x.players.some(p=>y.players.some(q=>p.id===q.id))){
   rosterCache.delete(a);rosterCache.delete(b);
   rosterIssue='Conflicting roster ownership (possible trade/update). Showing last verified non-conflicting snapshot if fresh; refresh again later.';
  }else if(all.some(x=>x.status==='rejected'))rosterIssue='A live roster request failed. Fresh checked snapshots are shown when available; stale rosters are withheld.';
  else if(!reports)rosterIssue='Live roster retrieved; the injury report is unavailable. Availability is not inferred.';
 }catch(e){if(my===requestId)rosterIssue='Live source unavailable; using a fresh verified snapshot when present.';}
 finally{if(my===requestId){rosterLoading=false;drawPlayers(true);}}
}
function readPlayerEffects(side,code){
 let sum=0;const used=new Set(),warnings=[],reasons=[];
 const fetchedRoster=sourceRoster(code),roster=fetchedRoster&&fresh(fetchedRoster.retrievedAt,8)?fetchedRoster:null;
 for(let i=1;i<=3;i++){
  const prefix='player'+side+i,s=$(prefix+'Name');
  if(!s)continue;
  const status=$(prefix+'Status').value,shift=$(prefix+'Shift'),p=roster?.players.find(x=>x.id===s.value),out=$(prefix+'Report');
  shift.disabled=!p||status==='reported';
  if(!p){out.textContent='Select a current roster player. No adjustment is applied.';continue;}
  const report=p.report,profile=model?.playerProfiles?.[p.id],validProfile=profile&&profile.team===code&&profile.sample>=3;
  out.textContent=(report?'Provider report: '+report.status+' · '+time(report.date)+'.':roster.injuryFeedAvailable?'No matching dated report; availability unknown.':'Injury feed unavailable.')+(validProfile?' Recent role: '+profile.averageMinutes.toFixed(1)+' minutes and '+profile.averagePoints.toFixed(1)+' points per appearance ('+profile.sample+' appearances).':' Not enough recent appearances for a current-team estimate.');
  if(used.has(p.id)){warnings.push(p.name+' appears twice; counted once.');continue;}
  used.add(p.id);
  if(status==='reported'||status==='available'&&!Number(shift.value))continue;
  let effect=0,why='';
  if(shift.value==='auto'){
   if(validProfile&&model?.playerModel?.enabled&&(status==='out'||status==='limited')){
    // Convert the fitted conditional logit coefficient to rating-equivalent units.
    const absentFraction=status==='out'?1:.5;
    effect=-model.playerModel.beta*profile.averageMinutes/48*absentFraction/Math.max(.01,model.weights[1])*100;
    why=p.name+' usually plays about '+profile.averageMinutes.toFixed(0)+' minutes. '+(status==='out'?'Missing all of them':'Assuming half those minutes are lost')+' removes part of the usual rotation; the model uses a fitted historical playing-time relationship. This is conditional, not a proven individual injury effect.';
   }else{why='There is no qualified automatic estimate for this selection. Choose an illustrative disadvantage manually if appropriate.';}
  }else{
   const raw=Number(shift.value)||0;
   effect=status==='out'||status==='limited'?Math.min(0,raw):raw;
   if(effect!==raw)warnings.push('An unavailable or limited player cannot receive a positive impact.');
   why=p.name+(status==='out'?' is assumed not to play.':status==='limited'?' is assumed to play fewer minutes.':' is assumed to play normally.')+' Your selected advantage or disadvantage is an illustration, not an observed injury effect.';
  }
  sum+=effect;reasons.push({label:p.name+' · '+name(code),shift:effect,why});
 }
 return {sum,warnings,reasons};
}
function drawTeamHeads(){
 const {a,b}=state();
 $('forecastTeamPair').innerHTML=[['A',a],['B',b]].map(([label,c])=>'<article class="forecast-franchise"><img src="'+logo(c)+'" alt="'+esc(name(c))+' logo"><div><span class="eyebrow">TEAM '+label+'</span><h4>'+esc(name(c))+'</h4></div></article>').join('');
}
function render(){
 const {a,b,venue,date}=state();
 const root=$('forecastResult');
 if(!teams[a]||!teams[b]||!date||date<today()||a===b){root.innerHTML='<div class="empty">Choose two different teams and today or a future game date. Completed games belong in Past Games.</div>';return;}
 if(!model){root.innerHTML='<div class="empty">No verified forecast model is available yet. No probability is substituted.</div>';return;}
 const r=model.backtest;
 $('forecastValidation').innerHTML='<strong>Retrospective validation · '+r.games+' later games held out</strong> · '+(100*r.accuracy).toFixed(1)+'% correct winners · Brier '+r.brier.toFixed(3)+' (home-rate baseline '+r.baselineBrier.toFixed(3)+') · Training: '+r.trainingGames+' earlier games · Test: '+esc(r.testFrom)+' to '+esc(r.testThrough)+'.<p>Model: '+esc(model.version)+' · Snapshot '+esc(time(model.retrievedAt))+' · Final results through '+esc(model.throughDate)+'. A small retrospective evaluation is not prospective calibration, player-impact validation, or a guarantee. Lower Brier score is better. Model trained on home-designated matchups; neutral venue is an extrapolation.</p>';
 if(!fresh(model.retrievedAt,8)||!fresh(model.sourceArchiveCollectedAt,8)){
  root.innerHTML='<div class="empty">Forecast data is older than eight hours or has an invalid timestamp. The probability is withheld until a fresh model/source is available.</div>';return;
 }
 if(model.throughDate>=date&&!(model.todayState&&model.todayDate===date)){
  root.innerHTML='<div class="empty">The model snapshot lacks a valid pre-date state for this selection. A pregame estimate is withheld to avoid looking ahead.</div>';return;
 }
 const l=context(a,date),rr=context(b,date);
 if(l.games<3||rr.games<3){root.innerHTML='<div class="empty">Insufficient current-season games for both franchises.</div>';return;}
 const pA=readPlayerEffects('A',a),pB=readPlayerEffects('B',b);
 const manual=[];
 for(const [key,label] of factorRows){
  const choice=$('factor-'+key+'-condition').value,ctrl=$('factor-'+key+'-shift');
  ctrl.disabled=choice==='normal';
  if(choice==='normal')continue;
  manual.push({label,shift:Number(ctrl.value)||0});
 }
 const restA=$('forecastRestA').value,restB=$('forecastRestB').value,formA=$('forecastFormA').value,formB=$('forecastFormB').value;
 $('forecastRestNote').textContent=a+': '+formatRest(l.rest,l.restKnown)+' · '+b+': '+formatRest(rr.rest,rr.restKnown)+' from latest known completed dates. Future intervening games are not assumed.';
 $('forecastFormNote').textContent=a+': '+l.recentWins+' wins in '+l.recentGames+' recent games · '+b+': '+rr.recentWins+' in '+rr.recentGames+'. Auto uses real results and modest smoothing.';
 const w=model.weights;
 const baseParts=[['Home court',w[0]*venue],['Current learned team strength',w[1]*(l.rating-rr.rating)/100],['Recent form',w[2]*(l.form-rr.form)],['Rest difference',w[3]*(l.rest-rr.rest)/3]];
 const baseLogit=baseParts.reduce((sum,x)=>sum+x[1],0);
 const proposedFormA=formA==='auto'?l.form:(+formA+2)/14,proposedFormB=formB==='auto'?rr.form:(+formB+2)/14;
 const proposedRestA=restA==='auto'?l.rest:+restA,proposedRestB=restB==='auto'?rr.rest:+restB;
 // An assumption about rating strength is hypothetical, not learned player value.
 const custom=Number($('forecastCustomShift')?.value)||0;
 const rawShift=manual.reduce((s,x)=>s+x.shift,0)+pA.sum-pB.sum+clamp(custom,-100,100);
 const shift=clamp(rawShift,-150,150),scenarioDiff=(l.rating-rr.rating+shift)/100;
 const scenarioParts=[w[0]*venue,w[1]*scenarioDiff,w[2]*(proposedFormA-proposedFormB),w[3]*(proposedRestA-proposedRestB)/3];
 const adjustedLogit=scenarioParts.reduce((s,x)=>s+x,0),base=sig(baseLogit),adjusted=sig(adjustedLogit);
 const fictional=shift!==0||restA!=='auto'||restB!=='auto'||formA!=='auto'||formB!=='auto';
 const pct=p=>(p*100).toFixed(1)+'%';
 const line=(p,cls)=>'<div class="forecast-prob '+cls+'"><div><span>'+esc(name(a))+'</span><strong>'+pct(p)+'</strong></div><div class="forecast-prob-track"><span style="width:'+clamp(100*p,0,100).toFixed(2)+'%"></span></div><div><span>'+esc(name(b))+'</span><strong>'+pct(1-p)+'</strong></div></div>';
 const contribution=(label,x)=>'<div class="forecast-contribution"><span>'+esc(label)+'</span><strong>'+((x>=0?'+':'')+x.toFixed(3))+'</strong></div>';
 const warnings=[...pA.warnings,...pB.warnings,...(Math.abs(rawShift)>150?['Combined subjective rating adjustment is capped at 150 points in either direction.']:[])];
 root.innerHTML='<div class="forecast-result-card"><span class="eyebrow">Source-based statistical baseline</span><h4>Estimated win probabilities</h4>'+line(base,'baseline')+'<p>Conditional on the selected venue and only the historical rating, recent form and rest features. The model has no fitted player availability effect.</p><div class="forecast-breakdown">'+baseParts.map(x=>contribution(x[0],x[1])).join('')+'</div><p class="small">Contributions are log-odds for Team A, not percentage-point changes. Positive increases the model estimate for A; negative decreases it. Rest coefficients may be unstable in the small training sample.</p><div class="forecast-scenario"><span class="eyebrow">Optional hypothetical scenario · not validated</span><h4>'+ (fictional?'With your numerical assumptions':'No numerical assumptions applied')+'</h4>'+line(adjusted,'scenario')+'<p>Net assumed Team A rating change relative to Team B: <strong>'+ (shift>=0?'+':'')+shift+' rating points.</strong> Subjective inputs are applied only here; labels and notes alone do not alter the baseline. '+(fictional?'This is a sensitivity estimate, not a verified player-adjusted forecast.':'Use the controls to explore how assumptions would change the estimate.')+'</p>'+warnings.map(x=>'<p class="forecast-warning">'+esc(x)+'</p>').join('')+'</div></div>';
}
function resetAssumptions(){
 for(const id of ['forecastRestA','forecastRestB','forecastFormA','forecastFormB'])$(id).value='auto';
 for(const [k] of factorRows){$('factor-'+k+'-condition').value='normal';$('factor-'+k+'-shift').value='0';}
 for(const side of ['A','B'])for(let i=1;i<=3;i++){const p='player'+side+i;if($(p+'Name')){$(p+'Name').value='';$(p+'Status').value='reported';$(p+'Shift').value='auto';}}
 $('forecastNotes').value='';if($('forecastCustomShift'))$('forecastCustomShift').value='0';render();
}
async function loadFixtures(){
 const date=$('forecastDate').value,seq=++fixtureRequest;
 $('forecastFixture').innerHTML='<option value="">Custom matchup</option>';
 fixtures=[];$('forecastFixtureNote').textContent='Checking sourced upcoming games for '+date+'…';
 if(!date||date<today())return;
 try{
  const d=isLocal?await snapshot('scoreboards/'+date+'.json'):await json(api+'scoreboard?dates='+date.replaceAll('-','')).catch(()=>snapshot('scoreboards/'+date+'.json'));
  if(seq!==fixtureRequest)return;
  if(!Array.isArray(d.events))throw Error('Invalid scoreboard');
  fixtures=d.events.filter(e=>e.status?.type?.state==='pre'&&e.status?.type?.completed!==true&&new Date(e.date)>new Date()&&dayET(new Date(e.date))===date).map(e=>{
   const c=e.competitions?.[0],away=norm(c?.competitors?.find(x=>x.homeAway==='away')?.team?.abbreviation),home=norm(c?.competitors?.find(x=>x.homeAway==='home')?.team?.abbreviation);
   return {id:String(e.id),home,away,tipoff:e.date,neutral:c?.neutralSite===true};
  }).filter(g=>teams[g.home]&&teams[g.away]&&g.home!==g.away);
  $('forecastFixture').innerHTML='<option value="">Custom matchup</option>'+options(fixtures.map(g=>[g.id,name(g.away)+' at '+name(g.home)+' · '+time(g.tipoff)]));
  $('forecastFixtureNote').textContent=fixtures.length+' upcoming games · verified provider schedule for '+date+'. Pick a fixture or use any custom pairing. Current rosters are not guaranteed lineups.';
 }catch(e){if(seq===fixtureRequest)$('forecastFixtureNote').textContent='Upcoming schedule unavailable for this date. Custom pairing remains available; it is not a verified scheduled game.';}
}
function syncPair(clearFixture=true){
 if(clearFixture)$('forecastFixture').value='';
 drawTeamHeads();resetAssumptions();loadSelectedRoster(true,false);
}
function init(){
 const date=$('forecastDate');
 date.value=today();date.min=today();
 for(const side of ['A','B'])$('forecastForm'+side).innerHTML='<option value="auto">Auto · completed games</option>'+options(Array.from({length:11},(_,i)=>[i,i+' of 10 (assumed)']));
 makeFactors();
 drawTeamHeads();
 $('forecastFixture').addEventListener('change',()=>{
  const game=fixtures.find(x=>x.id===$('forecastFixture').value);if(!game)return;
  $('gameAway').value=game.away;$('gameHome').value=game.home;$('forecastVenue').value=game.neutral?'0':'-1';
  // Other page modules refresh their displayed comparison on change.
  $('gameAway').dispatchEvent(new Event('change'));$('gameHome').dispatchEvent(new Event('change'));
  $('forecastFixture').value=game.id;
  $('forecastVenue').value=game.neutral?'0':'-1';render();
 });
 ['gameAway','gameHome'].forEach(id=>$(id).addEventListener('change',()=>syncPair()));
 $('gameSwap').addEventListener('click',()=>{
  const a=$('gameAway').value;$('gameAway').value=$('gameHome').value;$('gameHome').value=a;
  $('forecastVenue').value=String(-Number($('forecastVenue').value));
  $('gameAway').dispatchEvent(new Event('change'));$('gameHome').dispatchEvent(new Event('change'));
 });
 date.addEventListener('change',()=>{loadFixtures();render();});
 $('forecastReset').addEventListener('click',resetAssumptions);
 $('forecastRefreshRoster').addEventListener('click',async()=>{await loadData(true);await loadSelectedRoster(true);});
 $('gameroom').addEventListener('change',e=>{
  if(e.target.id.startsWith('forecast')||e.target.id.startsWith('factor-')||e.target.id.startsWith('player'))render();
 });
 loadData(true).then(()=>loadSelectedRoster(true,false));loadFixtures();
 // Only while Game Room is open; direct refresh includes current trade and injury changes.
 const refresh=()=>{if(location.hash==='#gameroom'&&document.visibilityState==='visible'){loadData(true).then(()=>loadSelectedRoster(true,true));}};
 setInterval(refresh,300000);
 window.addEventListener('hashchange',()=>{if(location.hash==='#gameroom'){loadData().then(()=>loadSelectedRoster(false,true));loadFixtures();}});
 document.addEventListener('visibilitychange',refresh);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
