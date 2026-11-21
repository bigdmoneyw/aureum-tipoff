
/* Aureum Tipoff: functional restoration. No estimated results or unverified forecasts. */
(function(){
'use strict';
var root=document, E=function(id){return root.getElementById(id);};
var teamsList=(typeof teams!=='undefined'&&Array.isArray(teams))?teams:[];
var teamIndex=Object.fromEntries(teamsList.map(function(t){return [t[0],t];}));
var nbaIds={ATL:1610612737,BOS:1610612738,BKN:1610612751,CHA:1610612766,CHI:1610612741,CLE:1610612739,DAL:1610612742,DEN:1610612743,DET:1610612765,GSW:1610612744,HOU:1610612745,IND:1610612754,LAC:1610612746,LAL:1610612747,MEM:1610612763,MIA:1610612748,MIL:1610612749,MIN:1610612750,NOP:1610612740,NYK:1610612752,OKC:1610612760,ORL:1610612753,PHI:1610612755,PHX:1610612756,POR:1610612757,SAC:1610612758,SAS:1610612759,TOR:1610612761,UTA:1610612762,WAS:1610612764};
var aliases={GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN'};
var norm=function(code){var x=String(code||'').toUpperCase();return aliases[x]||x;};
var name=function(code){return teamIndex[norm(code)]?teamIndex[norm(code)][1]:String(code||'Unknown');};
var logo=function(code){var id=nbaIds[norm(code)];return id?'https://cdn.nba.com/logos/nba/'+id+'/global/L/logo.svg':'';};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var em=function(html){return '<p class="repair-note">'+html+'</p>';};
var stamp=function(){return new Date().toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET';};
var etDate=function(d){var p=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d||new Date());var k=function(x){return p.find(function(y){return y.type===x;}).value;};return k('year')+'-'+k('month')+'-'+k('day');};
var sourceName='ESPN scoreboard and standings (independent third-party feed)';
var api='https://site.api.espn.com/apis/';
var standingsCache={};var fetchedStandings=null;var latestGames=[];
function fetchJson(url){
 var candidates=[],match;
 if((match=url.match(/\/standings\?season=(\d{4})/))){
  candidates.push('https://raw.githubusercontent.com/bigdmoneyw/aureum-tipoff/main/data/standings-'+match[1]+'.json');
  candidates.push('data/standings-'+match[1]+'.json');
 }
 if((match=url.match(/\/scoreboard\?dates=(\d{8})/))){
  var day=match[1].slice(0,4)+'-'+match[1].slice(4,6)+'-'+match[1].slice(6,8);
  candidates.push('https://raw.githubusercontent.com/bigdmoneyw/aureum-tipoff/main/data/scoreboards/'+day+'.json');
  candidates.push('data/scoreboards/'+day+'.json');
 }
 candidates.push(url);
 function attempt(i){
  if(i>=candidates.length)return Promise.reject(Error('Source and validated snapshots are unreachable'));
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},11000);
  return fetch(candidates[i],{signal:controller.signal,cache:'no-store'}).then(function(resp){if(!resp.ok)throw Error('HTTP '+resp.status);return resp.json();}).then(function(data){if(!data||typeof data!=='object')throw Error('Invalid JSON object');return data;}).catch(function(){return attempt(i+1);}).finally(function(){clearTimeout(timer);});
 }
 return attempt(0);
}
function entriesFromStandings(data){
 if(data&&data.format==='aureum-standings-v1'&&Array.isArray(data.records)){
  var out={};data.records.forEach(function(r){var code=norm(r.code),w=Number(r.wins),l=Number(r.losses);if(nbaIds[code]&&Number.isInteger(w)&&Number.isInteger(l)&&w>=0&&l>=0&&w+l<=100)out[code]={code:code,w:w,l:l,pct:w+l?w/(w+l):null};});return out;
 }
 var found=[],visited=new Set();
 function recur(x){if(!x||typeof x!=='object'||visited.has(x))return;visited.add(x);if(x.standings&&Array.isArray(x.standings.entries))found.push.apply(found,x.standings.entries);if(Array.isArray(x.children))x.children.forEach(recur);}
 recur(data);var records={};
 found.forEach(function(row){
 var c=norm(row.team&&row.team.abbreviation),stats=row.stats||[];
 var stat=function(keys){var o=stats.find(function(s){return keys.indexOf(String(s.name||s.type||'').toLowerCase())>=0;});return o?Number(o.value):NaN;};
 var w=stat(['wins']),l=stat(['losses']);
 if(!nbaIds[c]||!Number.isInteger(w)||!Number.isInteger(l)||w<0||l<0||w+l>100)return;
 records[c]={code:c,w:w,l:l,pct:w+l?w/(w+l):null};
 });
 return records;
}
function getStandings(year){
 if(!standingsCache[year])standingsCache[year]=fetchJson(api+'v2/sports/basketball/nba/standings?season='+year).then(function(d){if(d.format==='aureum-standings-v1'&&Number(d.season)!==year)throw Error('Snapshot season mismatch');var records=entriesFromStandings(d);if(Object.keys(records).length<29)throw Error('Standings returned fewer than 29 valid teams');return {records:records,year:year,obtained:d.retrievedAt?new Date(d.retrievedAt).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':stamp()};}).catch(function(err){delete standingsCache[year];throw err;});
 return standingsCache[year];
}
function seasonEnd(){var d=etDate().split('-'),y=Number(d[0]),m=Number(d[1]);return m>=10?y+1:y;}
function recordString(r){return r?(r.w+'–'+r.l):'Not available';}
function pctString(r){return r&&r.pct!=null?(100*r.pct).toFixed(1)+'%':'Not available';}
function image(c,klass){return '<img class="'+(klass||'team-logo-inline')+'" src="'+logo(c)+'" alt="'+esc(name(c))+' logo" loading="lazy" onerror="this.style.display=&quot;none&quot;">';}
function padSelectors(){
 ['studioAway','studioHome','scoutTeam','gameAway','gameHome'].forEach(function(id){
  var el=E(id);if(!el)return;var prev=el.value;el.innerHTML=teamsList.map(function(t){return '<option value="'+t[0]+'">'+esc(t[1])+'</option>';}).join('');el.value=prev&&teamIndex[prev]?prev:(id.toLowerCase().includes('home')?'BOS':'GSW');
 });
 ['studioHome','gameHome'].forEach(function(id){var el=E(id);if(el)el.value='BOS';});
}
function enhanceTeamGrid(){
 if(!E('teamGrid'))return;
 E('teamGrid').querySelectorAll('button[data-team]').forEach(function(node){
  var c=norm(node.dataset.team);if(!nbaIds[c]||node.querySelector('img'))return;
  var img=root.createElement('img');img.className='team-mark';img.src=logo(c);img.alt=name(c)+' logo';img.loading='lazy';img.onerror=function(){this.style.display='none';};
  node.insertBefore(img,node.firstChild);
 });
}
function teamMedia(){
 ['teamA','teamB','compareA','compareB','studioAway','studioHome','scoutTeam','gameAway','gameHome'].forEach(function(id){
 var el=E(id);if(!el)return;
 var holder=root.createElement('span');holder.className='team-picker-preview';holder.style.cssText='display:inline-flex;align-items:center;gap:9px;margin-top:9px;color:#cfdae3;font-size:.86rem;';
 el.insertAdjacentElement('afterend',holder);
 var update=function(){holder.innerHTML=image(el.value,'team-logo-inline')+' '+esc(name(el.value));};el.addEventListener('change',update);update();
 });
}
function mission(){
 var content={
 clarity:['Make the complex understandable.','A statistic matters only when you know what it measures, where it came from, and which questions it cannot answer.'],
 evidence:['Show the source behind the number.','Completed-game results, current standings, research archives, and hypothetical scenarios belong in separate, clearly labeled categories.'],
 honesty:['Protect the integrity of forecasts.','Predictions require timestamped pregame features and testing against results. We will not invent historical accuracy or treat estimated sliders as real player effects.']
 };
 root.querySelectorAll('[data-mission]').forEach(function(btn){
 btn.addEventListener('click',function(){
  root.querySelectorAll('[data-mission]').forEach(function(x){x.setAttribute('aria-pressed',String(x===btn));});
  var c=content[btn.dataset.mission];if(E('missionPanel')&&c)E('missionPanel').innerHTML='<h3>'+esc(c[0])+'</h3><p>'+esc(c[1])+'</p>';
 });
 });
}
function startMatchup(){
 var old=root.querySelector('#matchups .scenario-workbench');if(!old)return;
 var controls=old.querySelector('.cols');if(!controls)return;
 var p=root.createElement('div');p.className='panel verified-matchups';
 p.innerHTML='<div class="eyebrow">2026–27 / Sourced records</div><div class="cols" id="realMatchSelectors"></div><div aria-live="polite" id="verifiedMatchup">'+em('Loading sourced season records…')+'</div>';
 old.parentNode.insertBefore(p,old);var target=E('realMatchSelectors');
 Array.from(controls.children).forEach(function(node){target.appendChild(node);});old.hidden=true;old.style.display='none';
 ['teamA','teamB'].forEach(function(id){E(id).addEventListener('change',renderMatchup);});renderMatchup();
}
function renderMatchup(){
 var out=E('verifiedMatchup');if(!out)return;
 var a=norm(E('teamA').value),b=norm(E('teamB').value);
 if(a===b){out.innerHTML=em('Select two different teams.');return;}
 out.innerHTML=em('Retrieving current-season standings…');
 getStandings(seasonEnd()).then(function(s){
  if(a!==E('teamA').value||b!==E('teamB').value)return;
  var x=s.records[a],y=s.records[b];
  out.innerHTML='<div class="readout-pair"><div class="stat">'+image(a)+'<b>'+esc(name(a))+'</b><strong>'+esc(recordString(x))+'</strong><small>Wins–losses · '+esc(pctString(x))+' win rate</small></div><div class="stat">'+image(b)+'<b>'+esc(name(b))+'</b><strong>'+esc(recordString(y))+'</strong><small>Wins–losses · '+esc(pctString(y))+' win rate</small></div></div>'+em('Records describe games already played, not the probability of winning this matchup. The current release does not publish a validated outcome forecast.')+'<p class="data-sources">Source: '+esc(sourceName)+' · retrieved '+esc(s.obtained)+'.</p>';
 }).catch(function(e){out.innerHTML=em('Current standings are unavailable from the data source. No estimated numbers have been substituted. '+esc(e.message));});
}
var concepts=[
 ['Win percentage','Games won divided by games completed.','Wins / (Wins + losses)'],
 ['Point differential','Average points scored minus points conceded; describes scoring margin, not schedule strength.','Points per game − opponent points per game'],
 ['Offensive rating','Points scored per 100 offensive possessions, rather than per game.','100 × points / offensive possessions'],
 ['Defensive rating','Points allowed per 100 defensive possessions. Lower is better.','100 × opponent points / defensive possessions'],
 ['Net rating','Scoring efficiency advantage per 100 possessions.','Offensive rating − defensive rating'],
 ['Pace','Estimated possessions used per 48 minutes. High pace means more trips, not necessarily better offense.','Possessions per 48 minutes'],
 ['True shooting percentage','Scoring efficiency including two-pointers, three-pointers, and free throws.','PTS / (2 × (FGA + 0.44 × FTA))'],
 ['Effective field goal percentage','Field-goal accuracy adjusted because a three-pointer is worth more than a two.','(FGM + 0.5 × 3PM) / FGA'],
 ['Turnover rate','How often a possession ends with the offense losing the ball.','Turnovers / possessions'],
 ['Assist rate','Share of made field goals that were assisted; styles and scorekeeping affect comparisons.','Assisted makes / made field goals'],
 ['Rebound percentage','Share of available rebounds collected by a team.','Team rebounds / available rebounds'],
 ['Offensive rebound percentage','Percentage of available missed shots recovered on offense.','Offensive rebounds / available offensive rebounds'],
 ['Defensive rebound percentage','Share of opponent misses secured on defense.','Defensive rebounds / available defensive rebounds'],
 ['Free-throw rate','Frequency of free-throw attempts relative to field-goal attempts.','FTA / FGA'],
 ['Three-point attempt rate','Share of field-goal attempts taken from three-point range.','3PA / FGA'],
 ['Field-goal percentage','Share of all field-goal attempts made; does not reward the extra value of threes.','FGM / FGA'],
 ['Usage rate','Estimate of the share of team possessions consumed by a player while on court.','Player actions / team possessions while playing'],
 ['Plus/minus','Score differential while a player is on the court; heavily influenced by teammates and opponents.','Points for − points against while on court'],
 ['Elo rating','A relative team-strength index updated from game outcomes. It depends on its calibration and update rules.','Prior rating + K × (result − expected result)'],
 ['Brier score','Average squared error between predicted win probability and the final result; lower is better.','Mean((probability − outcome)²)'],
 ['Log loss','Penalty for probabilities that put too little weight on what actually happened; lower is better.','−Mean(y log p + (1−y) log(1−p))'],
 ['Calibration','Whether events assigned a given probability happen about that often over many cases.','Predicted frequency vs observed frequency'],
 ['Holdout testing','Evaluation on games not used for training or model selection.','Out-of-sample performance'],
 ['Data leakage','Using information that would not have existed at forecast time.','Prevent with chronological splits'],
 ['Strength of schedule','How difficult past opponents were; simple record comparisons can miss this.','Opponent-adjusted context'],
 ['Back-to-back','A team plays games on consecutive days; the effect must be measured, not assumed.','Schedule-derived rest context'],
 ['Home advantage','Observed statistical effect of playing at home, if estimated from games.','Requires historical estimation'],
 ['Injury availability','Reported player status at a specific timestamp; not equivalent to a measured point impact.','Timestamped official or attributed report'],
 ['Possessions','Estimated opportunities to score, adjusting for rebounds and turnovers.','FGA − ORB + TOV + 0.44 × FTA'],
 ['Clutch performance','Performance during a defined late-game, close-score interval; small samples are noisy.','Requires explicit time/score definition']
];
function glossaryRender(){
 var el=E('glossaryGrid');if(!el)return;var q=(E('glossarySearch').value||'').toLowerCase().trim();
 var selected=concepts.filter(function(c){return c.join(' ').toLowerCase().includes(q);});
 el.innerHTML=selected.map(function(c){return '<article class="glossary-item"><h3>'+esc(c[0])+'</h3><p>'+esc(c[1])+'</p><span class="glossary-formula">'+esc(c[2])+'</span></article>';}).join('')||em('No matching term. Try another search.');
}
function setupGlossary(){if(E('glossarySearch')){E('glossarySearch').addEventListener('input',glossaryRender);glossaryRender();}}
function setupAtlas(){
 var p=E('factorAtlas');if(!p)return;
 var categories=[
 ['Scoring & shooting',['Points per game','Paint attempts','Rim accuracy','Midrange frequency','Three-point frequency','Free-throw rate','True shooting','Effective field goal percentage']],
 ['Possessions & tempo',['Pace','Possession estimate','Turnover rate','Live-ball turnovers','Offensive boards','Defensive boards','Transition chances','Second-chance scoring']],
 ['Defense & matchup',['Defensive rating','Opponent effective FG%','Rim protection','Steal rate','Opponent three-point volume','Defensive rebound rate','Opponent turnover rate','Foul frequency']],
 ['Team context',['Win percentage','Point differential','Net rating','Opponent strength','Home/away split','Rest days','Back-to-back','Travel context']],
 ['Players & lineups',['Reported availability','Starting lineup','Rotation continuity','Minutes workload','Usage rate','On/off differential','Lineup plus/minus','Sample size']],
 ['Model reliability',['Train/test cutoff','Baseline comparison','Calibration','Brier score','Log loss','Confidence interval','Missingness','Timestamp integrity']]
 ];
 p.innerHTML='<div class="research-banner"><strong>48 analytical factors explained, not 48 fabricated measurements.</strong> Categories describe potential research inputs. Only data explicitly sourced elsewhere on this site is reported as a measured value.</div><div class="factor-explorer-grid">'+categories.map(function(group){return '<article class="factor-tile"><h3>'+esc(group[0])+'</h3><p>'+group[1].map(function(t){return '<span style="display:block;padding:5px 0;border-bottom:1px solid #32445b">'+esc(t)+'</span>';}).join('')+'</p></article>';}).join('')+'</div>';
}
function updateScout(){
 var code=norm(E('scoutTeam').value),heading=E('scoutTitle'),readout=E('scoutReadout');
 if(!readout)return;heading.textContent=name(code);E('scoutSubtitle').textContent='A franchise profile grounded in sourced 2026–27 records.';E('scoutMonogram').innerHTML=image(code,'scout-logo');
 readout.innerHTML=em('Retrieving current standings…');
 getStandings(seasonEnd()).then(function(s){if(code!==E('scoutTeam').value)return;var r=s.records[code];
 readout.innerHTML='<div class="readout-pair"><div class="stat"><small>Current record</small><strong>'+esc(recordString(r))+'</strong><small>Completed games</small></div><div class="stat"><small>Winning percentage</small><strong>'+esc(pctString(r))+'</strong><small>Wins / completed games</small></div></div>'+em('These figures provide current-season context, not an opponent-adjusted rating or a trained forecast.')+'<p class="data-sources">Season: 2026–27 · '+esc(sourceName)+' · '+esc(s.obtained)+'.</p>';
 }).catch(function(e){readout.innerHTML=em('Live records could not be retrieved. No fabricated statistics are shown. '+esc(e.message));});
}
function setupScouting(){
 var select=E('scoutTeam');if(!select)return;
 select.addEventListener('change',updateScout);
 root.addEventListener('click',function(e){var b=e.target.closest('[data-team]');if(b&&teamIndex[b.dataset.team]){select.value=b.dataset.team;updateScout();}});
 window.addEventListener('aureum:select-team',function(e){if(e.detail&&e.detail.team&&teamIndex[e.detail.team]){select.value=e.detail.team;updateScout();}});
 E('scoutCompare').addEventListener('click',function(){E('compareA').value=select.value;E('compareA').dispatchEvent(new Event('change'));location.hash='compare';});
 E('scoutGame').addEventListener('click',function(){E('gameAway').value=select.value;E('gameAway').dispatchEvent(new Event('change'));location.hash='gameroom';});
 updateScout();
}
function statusText(c){var state=c.status&&c.status.type||{},s=state.shortDetail||state.detail||state.description||'';return String(s||'Scheduled');}
function normalizeScoreboard(data,day){
 if(!data||!Array.isArray(data.events))throw Error('Scoreboard format is not recognized');
 if(data.requestedDate&&data.requestedDate!==day)throw Error('Dated snapshot does not match requested date');
 var seen=new Set(),arr=[];
 data.events.forEach(function(ev){
  if(!ev||!ev.id||seen.has(String(ev.id))||!Array.isArray(ev.competitions)||!ev.competitions.length)return;
  var c=ev.competitions[0],home=c.competitors&&c.competitors.find(function(x){return x.homeAway==='home';}),away=c.competitors&&c.competitors.find(function(x){return x.homeAway==='away';});
  if(!home||!away)return;
  var h=norm(home.team&&home.team.abbreviation),a=norm(away.team&&away.team.abbreviation),date=new Date(ev.date);
  if(!nbaIds[h]||!nbaIds[a]||h===a||Number.isNaN(date.getTime())||etDate(date)!==day)return;
  var st=ev.status&&ev.status.type||{},completed=!!st.completed,phase=st.state||'pre';
  var hs=Number(home.score),as=Number(away.score);
  if((completed||phase==='in')&&(!Number.isInteger(hs)||!Number.isInteger(as)||hs<0||as<0||hs>250||as>250))return;
  seen.add(String(ev.id));arr.push({id:String(ev.id),home:h,away:a,hScore:completed||phase==='in'?hs:null,aScore:completed||phase==='in'?as:null,state:completed?'final':phase==='in'?'live':'scheduled',date:date,status:statusText(ev)});
 });
 if(data.events.length&&arr.length===0)throw Error('Scoreboard returned games but none passed the date/team validation');
 return arr.sort(function(a,b){return a.date-b.date;});
}
function gameCard(g){
 var completed=g.state==='final',active=g.state==='live',score=function(c){return c==null?'—':c;};
 var status=completed?'Final':active?'In progress':'Scheduled';
 return '<article class="result-card"><span class="live-state">'+status+'</span><div class="result-match"><div class="result-team">'+image(g.away,'team-logo')+'<b>'+esc(name(g.away))+'</b><strong class="result-points">'+score(g.aScore)+'</strong></div><div class="result-separator">–</div><div class="result-team">'+image(g.home,'team-logo')+'<b>'+esc(name(g.home))+'</b><strong class="result-points">'+score(g.hScore)+'</strong></div></div><div class="result-meta">'+esc(g.status)+'<span class="game-time">'+esc(g.date.toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}))+'</span></div></article>';
}
function renderGames(games,day,meta){
 latestGames=games;var collectionTime=meta&&meta.retrievedAt?new Date(meta.retrievedAt).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':stamp();var html=games.length?'<div class="live-grid">'+games.map(gameCard).join('')+'</div>':em('No NBA games were returned for this date. No games have been invented.');
 html+='<p class="data-sources">Source: '+esc(sourceName)+'. Date: '+esc(day)+'. Snapshot collected '+esc(collectionTime)+'. Published snapshot scores are periodically refreshed, not real-time. Games are shown only when the source marks a game in progress or complete.</p>';
 ['liveResults','gameForecastList'].forEach(function(id){if(E(id))E(id).innerHTML=html;});
 if(E('liveFeedStatus'))E('liveFeedStatus').textContent=games.length+' games validated · source snapshot '+collectionTime;
 if(E('homeDataStatus'))E('homeDataStatus').textContent='Sourced NBA scoreboard snapshot · '+games.length+' games on '+day+' · '+collectionTime;
}
function loadGames(){
 var input=E('scoreboardDate');if(!input)return;
 var day=input.value||etDate();var area=E('liveResults');
 if(area)area.innerHTML=em('Retrieving dated scoreboard from ESPN…');
 if(E('gameForecastList'))E('gameForecastList').innerHTML=em('Retrieving sourced results and schedules…');
 var btn=E('scoreboardRefresh');if(btn)btn.disabled=true;
 fetchJson(api+'site/v2/sports/basketball/nba/scoreboard?dates='+day.replace(/-/g,'')).then(function(data){
  if(input.value!==day)return;var games=normalizeScoreboard(data,day);renderGames(games,day,data);
 }).catch(function(err){
  var warning=em('The results feed could not be verified for '+esc(day)+'. Scores and schedules are unavailable rather than estimated. '+esc(err.message))+'<p class="data-sources">Check <a href="https://www.nba.com/games" target="_blank" rel="noopener noreferrer">NBA.com games</a> for official results.</p>';
  ['liveResults','gameForecastList'].forEach(function(id){if(E(id))E(id).innerHTML=warning;});
  if(E('liveFeedStatus'))E('liveFeedStatus').textContent='Feed unavailable / not verified';
  if(E('homeDataStatus'))E('homeDataStatus').textContent='Live data unavailable; no results have been invented';
 }).finally(function(){if(btn)btn.disabled=false;});
}
function setupGames(){
 if(!E('scoreboardDate'))return;E('scoreboardDate').value=etDate();
 E('scoreboardDate').addEventListener('change',loadGames);
 E('scoreboardRefresh').addEventListener('click',loadGames);
 loadGames();setInterval(function(){if(document.visibilityState==='visible'&&E('scoreboardDate').value===etDate()&&['#live','#gameroom'].includes(location.hash))loadGames();},90000);
}
function studioState(){
 var ids=['studioAway','studioHome','studioAwayStrength','studioHomeStrength','studioAwayRest','studioHomeRest','studioAwayAbsence','studioHomeAbsence','studioHomeCourt'];return Object.fromEntries(ids.map(function(k){return [k,E(k).value];}));
}
function studioUpdate(){
 if(!E('studioAway'))return;var s=studioState(),A=+s.studioAwayStrength,B=+s.studioHomeStrength,rest=(+s.studioAwayRest-+s.studioHomeRest)*1.5,avail=(+s.studioHomeAbsence-+s.studioAwayAbsence)*7,home=+s.studioHomeCourt;
 var sum=(A-B)+rest+avail-home;
 E('studioAwayStrengthValue').textContent=A;E('studioHomeStrengthValue').textContent=B;E('studioHomeCourtValue').textContent=home;
 E('studioAwayName').textContent=name(s.studioAway);E('studioHomeName').textContent=name(s.studioHome);
 if(s.studioAway===s.studioHome){E('studioAwayPct').textContent='—';E('studioHomePct').textContent='—';E('studioHeadline').textContent='Choose two different teams';E('studioExplanation').textContent='A team cannot play itself.';return;}
 E('studioAwayPct').textContent=sum>1?'Higher':'Lower';E('studioHomePct').textContent=sum< -1?'Higher':'Lower';if(Math.abs(sum)<=1){E('studioAwayPct').textContent='Even';E('studioHomePct').textContent='Even';}E('studioBar').style.width='50%';
 E('studioHeadline').textContent=Math.abs(sum)<=1?'Assumptions are balanced':('Manual inputs favor '+name(sum>0?s.studioAway:s.studioHome));
 E('studioExplanation').textContent='This is a directional comparison of user-entered assumptions, not a win probability, an NBA statistic, or a calibrated game model. No unsupported percentages are reported.';
 E('studioFactors').innerHTML='<div class="factor-line">Manually entered relative strengths: '+A+' vs '+B+'</div><div class="factor-line">Rest setting difference: '+esc(s.studioAwayRest)+' vs '+esc(s.studioHomeRest)+' days</div><div class="factor-line">Hypothetical availability settings: '+esc(s.studioAwayAbsence)+' vs '+esc(s.studioHomeAbsence)+'</div><div class="factor-line">User-selected home adjustment: '+home+' scenario points (not measured)</div>';
}
var storageKey='aureumTipoffScenariosV2';var memoryScenarios=[];
function readSaved(){try{var x=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(x)?x.slice(0,20):[];}catch(e){return memoryScenarios;}}
function saveSaved(x){memoryScenarios=x;try{localStorage.setItem(storageKey,JSON.stringify(x));}catch(e){}}
function savedRender(){
 var el=E('studioSaved');if(!el)return;var data=readSaved();
 el.innerHTML=data.length?data.map(function(s,i){return '<div class="saved-scenario"><strong>'+esc(name(s.studioAway))+' at '+esc(name(s.studioHome))+'</strong><p class="repair-note">Saved educational scenario · '+esc(s.savedAt||'')+'</p><button class="btn secondary" type="button" data-restore-scenario="'+i+'">Load scenario</button></div>';}).join(''):em('No scenarios saved yet.');
 el.querySelectorAll('[data-restore-scenario]').forEach(function(button){button.addEventListener('click',function(){var x=readSaved()[Number(button.dataset.restoreScenario)];if(!x)return;Object.keys(x).forEach(function(k){if(E(k)&&k.startsWith('studio'))E(k).value=x[k];});studioUpdate();E('studioStatus').textContent='Your saved scenario has been loaded.';});});
}
function setupStudio(){
 if(!E('studioAway'))return;
 ['studioAway','studioHome','studioAwayStrength','studioHomeStrength','studioAwayRest','studioHomeRest','studioAwayAbsence','studioHomeAbsence','studioHomeCourt'].forEach(function(k){E(k).addEventListener('input',studioUpdate);});
 E('studioSave').addEventListener('click',function(){var s=studioState();if(s.studioAway===s.studioHome){E('studioStatus').textContent='Choose two different teams first.';return;}s.savedAt=stamp();saveSaved([s].concat(readSaved()).slice(0,20));E('studioStatus').textContent='Saved in this browser.';savedRender();});
 E('studioReset').addEventListener('click',function(){E('studioAway').value='GSW';E('studioHome').value='BOS';E('studioAwayStrength').value=70;E('studioHomeStrength').value=70;E('studioAwayRest').value=1;E('studioHomeRest').value=1;E('studioAwayAbsence').value=0;E('studioHomeAbsence').value=0;E('studioHomeCourt').value=3;studioUpdate();E('studioStatus').textContent='Defaults restored.';});
 E('studioClear').addEventListener('click',function(){saveSaved([]);savedRender();E('studioStatus').textContent='Saved scenarios cleared from this browser.';});
 E('studioShare').addEventListener('click',function(){var s=studioState(),txt='Aureum Tipoff hypothetical research scenario: '+name(s.studioAway)+' at '+name(s.studioHome)+'. Manual team strengths '+s.studioAwayStrength+'/'+s.studioHomeStrength+', rest '+s.studioAwayRest+'/'+s.studioHomeRest+', illustrative availability '+s.studioAwayAbsence+'/'+s.studioHomeAbsence+', hypothetical home adjustment '+s.studioHomeCourt+'. This is not a real NBA forecast.';
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){E('studioStatus').textContent='Scenario summary copied.';},function(){E('studioStatus').textContent=txt;});else E('studioStatus').textContent=txt;});
 studioUpdate();savedRender();
}
var archiveSelected='GSW';
function archiveStats(records,code,metric){var r=records[code];if(!r)return null;if(metric==='wins')return r.w;if(metric==='losses')return r.l;return r.pct==null?null:r.pct*100;}
function archiveFormat(n,metric){return n==null?'—':metric==='winpct'?n.toFixed(1)+'%':String(Math.round(n));}
function renderArchive(){
 if(!E('archiveResults'))return;
 var y=E('archiveSeason').value,metric=E('archiveMetric').value,q=E('archiveSearch').value.toLowerCase().trim();
 E('archiveSummary').textContent='Retrieving source data; historical seasons are not inferred…';
 E('archiveResults').innerHTML=em('Loading source-derived standings…');
 var years=y==='delta'?[2025,2026]:[y==='2024-25'?2025:2026];
 Promise.all(years.map(getStandings)).then(function(data){
  if(E('archiveSeason').value!==y||E('archiveMetric').value!==metric||E('archiveSearch').value.toLowerCase().trim()!==q)return;
  var a=data[0].records,b=data[1]&&data[1].records;
  var rows=teamsList.filter(function(t){return t[1].toLowerCase().includes(q)||t[0].toLowerCase().includes(q);}).map(function(t){
   var v=y==='delta'?(archiveStats(b,t[0],metric)==null||archiveStats(a,t[0],metric)==null?null:archiveStats(b,t[0],metric)-archiveStats(a,t[0],metric)):archiveStats(a,t[0],metric);
   return {code:t[0],v:v};
  }).sort(function(x,z){return (z.v==null?-Infinity:z.v)-(x.v==null?-Infinity:x.v);});
  E('archiveResults').innerHTML='<div class="archive-rows">'+rows.map(function(r){return '<button type="button" class="archive-row" data-archive-team="'+r.code+'"><span class="archive-team">'+image(r.code,'team-logo-inline')+esc(name(r.code))+'</span><span class="archive-value">'+(r.v==null?'—':(y==='delta'&&r.v>0?'+':'')+archiveFormat(r.v,metric))+'</span></button>';}).join('')+'</div>';
  E('archiveSummary').textContent=rows.filter(function(r){return r.v!=null;}).length+' of '+rows.length+' team records available · '+(y==='delta'?'2024–25 to 2025–26':y);
  E('archiveResults').querySelectorAll('[data-archive-team]').forEach(function(button){button.addEventListener('click',function(){archiveSelected=button.dataset.archiveTeam;archiveDetail(data,y,metric);});});
  archiveDetail(data,y,metric);
 }).catch(function(err){E('archiveResults').innerHTML=em('Historical source data is unavailable. No past seasons have been simulated. '+esc(err.message));E('archiveSummary').textContent='Historical source not verified';if(E('archiveDetail'))E('archiveDetail').innerHTML='';});
}
function archiveDetail(data,y,metric){
 var e=E('archiveDetail');if(!e)return;var previous=data.find(function(x){return x.year===2025;}),recent=data.find(function(x){return x.year===2026;});
 var r=y==='delta'?[previous&&previous.records[archiveSelected],recent&&recent.records[archiveSelected]]:[data[0]&&data[0].records[archiveSelected]];
 e.innerHTML='<h3>'+image(archiveSelected)+esc(name(archiveSelected))+'</h3><div class="readout-pair">'+r.map(function(x,i){return '<div class="stat"><small>'+(y==='delta'?(i===0?'2024–25':'2025–26'):y)+'</small><strong>'+esc(recordString(x))+'</strong><small>'+esc(pctString(x))+' winning percentage</small></div>';}).join('')+'</div>'+em('Source: ESPN archived regular-season standings. A season record alone cannot establish individual-game prediction accuracy. Historical advanced efficiency data has not been independently imported into this release.');
}
function setupArchive(){
 if(!E('archiveMetric'))return;
 E('archiveMetric').innerHTML='<option value="winpct">Win percentage</option><option value="wins">Wins</option><option value="losses">Losses</option>';
 ['archiveMetric','archiveSeason'].forEach(function(id){E(id).addEventListener('change',renderArchive);});
 E('archiveSearch').addEventListener('input',renderArchive);renderArchive();
}
function patchLanguage(){

 var gameTop=root.querySelector('#gameroom .game-schedule .section-top h3');if(gameTop)gameTop.textContent='Dated NBA scoreboard · results and schedule';
 var gameDesc=root.querySelector('#gameroom .game-schedule .section-top p');if(gameDesc)gameDesc.textContent='Provider-sourced game status and scores are displayed with a date, collection timestamp, and source attribution. This is a scoreboard, not an archive of Aureum pregame forecasts.';
 var guide=root.querySelector('#model .model-guide-links');if(guide)guide.setAttribute('aria-label','Explore research pages');
 var homeLabel=root.querySelector('#home .hub-path[data-go="intelligence"] .hub-path-note');if(homeLabel)homeLabel.textContent='Explore explained basketball factors; measurements appear only with a verified source.';
 var modelInfo=root.querySelector('#model .model-guide-links [data-go="live"]');if(modelInfo)modelInfo.textContent='View the dated results desk ↗';
 var arcIntro=root.querySelector('#archive .archive-lede p');if(arcIntro)arcIntro.textContent='Review sourced completed-season win–loss records and changes in winning percentage. Historical advanced statistics are not yet available as a verified dataset.';
 var archiveNote=root.querySelector('#archive .archive-provenance');if(archiveNote)archiveNote.innerHTML='<b>Archive source and limitations</b><p>Team season records are fetched from dated ESPN historical standings. Historical advanced efficiency or injury statistics are not substituted or invented.</p>';
 var oldAbout=root.querySelector('#about .about-visual-story img');if(oldAbout)oldAbout.src='basketball-study.svg';
 var homeRibbon=root.querySelector('#home .archive-home-ribbon p');if(homeRibbon)homeRibbon.textContent='Compare completed-season franchise win–loss records for 2024–25 and 2025–26 when the historical standings feed is available. The archive does not invent advanced statistics or claim game-level forecasting accuracy.';
 var hc=root.querySelector('#insights label[for="studioHomeCourt"]');if(hc)hc.firstChild.textContent='User-defined home-court scenario adjustment ';
 var dataIntro=root.querySelector('#live .section-intro');if(dataIntro)dataIntro.textContent='Explore timestamped NBA game-result snapshots and schedules. Data is collected periodically from ESPN, validated for format and game date, and never represented as instantaneous when it is not.';var stampEl=E('homeDataStatus');if(stampEl)stampEl.textContent='Checking source availability…';
}
function accessibility(){
 root.querySelectorAll('button:not([type])').forEach(function(b){b.setAttribute('type','button');});
 root.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener('click',function(){var id=a.getAttribute('href').slice(1);if(E(id)&&E(id).classList.contains('page'))location.hash=id;});});
 var nav=root.querySelector('.nav');if(nav)nav.classList.add('mobile-nav');
}
function init(){
 patchLanguage();padSelectors();mission();startMatchup();setupGlossary();setupAtlas();setupScouting();setupStudio();setupArchive();setupGames();teamMedia();accessibility();
 enhanceTeamGrid();if(E('teamGrid'))new MutationObserver(enhanceTeamGrid).observe(E('teamGrid'),{childList:true});
 if(E('year'))E('year').textContent=new Date().getFullYear();
}
if(root.readyState==='loading')root.addEventListener('DOMContentLoaded',init);else init();
})();
