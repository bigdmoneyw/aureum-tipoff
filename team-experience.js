
/* Aureum Tipoff: sourced NBA season metrics and competition experience.
   No fictional statistics or predictive percentages are produced here. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v===null||v===undefined?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const codes={ATL:1610612737,BOS:1610612738,BKN:1610612751,CHA:1610612766,CHI:1610612741,CLE:1610612739,DAL:1610612742,DEN:1610612743,DET:1610612765,GSW:1610612744,HOU:1610612745,IND:1610612754,LAC:1610612746,LAL:1610612747,MEM:1610612763,MIA:1610612748,MIL:1610612749,MIN:1610612750,NOP:1610612740,NYK:1610612752,OKC:1610612760,ORL:1610612753,PHI:1610612755,PHX:1610612756,POR:1610612757,SAC:1610612758,SAS:1610612759,TOR:1610612761,UTA:1610612762,WAS:1610612764};
const shortNames={ATL:'Atlanta Hawks',BOS:'Boston Celtics',BKN:'Brooklyn Nets',CHA:'Charlotte Hornets',CHI:'Chicago Bulls',CLE:'Cleveland Cavaliers',DAL:'Dallas Mavericks',DEN:'Denver Nuggets',DET:'Detroit Pistons',GSW:'Golden State Warriors',HOU:'Houston Rockets',IND:'Indiana Pacers',LAC:'LA Clippers',LAL:'Los Angeles Lakers',MEM:'Memphis Grizzlies',MIA:'Miami Heat',MIL:'Milwaukee Bucks',MIN:'Minnesota Timberwolves',NOP:'New Orleans Pelicans',NYK:'New York Knicks',OKC:'Oklahoma City Thunder',ORL:'Orlando Magic',PHI:'Philadelphia 76ers',PHX:'Phoenix Suns',POR:'Portland Trail Blazers',SAC:'Sacramento Kings',SAS:'San Antonio Spurs',TOR:'Toronto Raptors',UTA:'Utah Jazz',WAS:'Washington Wizards'};
const logo=c=>'https://cdn.nba.com/logos/nba/'+codes[c]+'/global/L/logo.svg';
const categories=[
 {title:'01 · Results & scoring',keys:['wins','losses','winPct','pointsPerGame','oppPointsPerGame','marginPerGame']},
 {title:'02 · Shooting efficiency',keys:['fieldGoalPct','twoPointPct','threePointPct','freeThrowPct','effectiveFgPct','threePointRate','freeThrowRate']},
 {title:'03 · Shooting volume',keys:['fgMadePerGame','fgAttemptedPerGame','twoMadePerGame','twoTriedPerGame','threeMadePerGame','threeTriedPerGame','ftMadePerGame','ftTriedPerGame']},
 {title:'04 · Possessions & defense',keys:['reboundsPerGame','offReboundsPerGame','defReboundsPerGame','assistsPerGame','turnoversPerGame','assistTurnoverRatio','stealsPerGame','blocksPerGame','foulsPerGame']}
];
let catalog=[],stats=null,selected='GSW';
const seasonEnd=(()=>{const x=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric'}).formatToParts(new Date());const y=Number(x.find(a=>a.type==='year').value),m=Number(x.find(a=>a.type==='month').value);return m>=10?y+1:y;})();
const isPercent=k=>['winPct','fieldGoalPct','twoPointPct','threePointPct','freeThrowPct','effectiveFgPct','threePointRate','freeThrowRate'].includes(k);
const formatted=(k,n)=>n===null||n===undefined||!Number.isFinite(n)?'Not reported':k==='wins'||k==='losses'?String(n):isPercent(k)?n.toFixed(1)+'%':k==='marginPerGame'?(n>=0?'+':'')+n.toFixed(1):n.toFixed(1);
const formattedTime=iso=>{try{return new Date(iso).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET';}catch(e){return 'Timestamp unavailable';}};
const metric=k=>catalog.find(x=>x.key===k);
const details=(k,scope='stat',overriddenBrief='')=>{const m=metric(k);if(!m)return '';const id='metric-help-'+scope+'-'+k;return '<span class="metric-info"><button type="button" class="metric-info-trigger" aria-label="Explain '+esc(m.label)+'" aria-describedby="'+id+'" aria-expanded="false">i</button><span class="metric-info-pop" id="'+id+'" role="tooltip">'+esc(overriddenBrief||m.brief)+'</span></span>';};
function getJSON(path){
 return fetch(path,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();});
}
function getSnapshot(path){
 return getJSON('data/'+path).catch(()=>getJSON('https://raw.githubusercontent.com/bigdmoneyw/aureum-tipoff/main/data/'+path));
}
function seasonCheck(data){
 if(data.format!=='aureum-team-statistics-v1'||Number(data.season)!==seasonEnd||data.metricCount!==30||data.teamCount!==30||!Array.isArray(data.records)||data.records.length!==30)throw Error('Unexpected statistics format or season');
 const ks=new Set(catalog.map(m=>m.key));
 for(const r of data.records){
  if(!codes[r.code]||!r.values||!ks.size)throw Error('Team or metrics missing');
  for(const k of ks)if(!(k in r.values)||r.values[k]!==null&&!Number.isFinite(r.values[k]))throw Error('Invalid '+r.code+' '+k);
 }
 return data;
}
function sourceNote(row){
 const lag=row.standingsGamesPlayed-row.statGamesPlayed;
 return '<p class="team-source-note">Source: <a href="https://www.espn.com/nba/standings" target="_blank" rel="noopener noreferrer">ESPN standings</a> and <a href="'+esc(row.sourceUrl||'https://www.espn.com/nba/stats')+'" target="_blank" rel="noopener noreferrer">ESPN team season statistics</a>. Snapshot: '+esc(formattedTime(stats.retrievedAt))+'. Standings: '+row.standingsGamesPlayed+' games; team-stat averages: '+row.statGamesPlayed+' games.'+(lag?'<strong> Data coverage differs by '+Math.abs(lag)+' game'+(Math.abs(lag)===1?'':'s')+'; sources may update at different times.</strong>':'')+' Statistics describe completed 2026–27 regular-season performance, not a guaranteed game forecast.</p>';
}
function tile(key,row){
 const m=metric(key);if(!m)return '';
 return '<article class="team-metric"><div class="team-metric-label"><span>'+esc(m.label)+'</span>'+details(key)+'</div><strong class="team-metric-value">'+esc(formatted(key,row.values[key]))+'</strong></article>';
}
function leagueMedian(k){
 const values=stats.records.map(r=>r.values[k]).filter(Number.isFinite).sort((a,b)=>a-b);
 if(!values.length)return null;
 return values.length%2?values[(values.length-1)/2]:(values[values.length/2-1]+values[values.length/2])/2;
}
function spotlight(k,row){
 const m=metric(k);
 const list=stats.records.map(r=>r.values[k]).filter(Number.isFinite);
 if(!m||list.length<25)return '';
 const min=Math.min(...list),max=Math.max(...list),v=row.values[k],median=leagueMedian(k);
 const position=max===min?50:Math.max(4,Math.min(96,(v-min)/(max-min)*100));
 return '<article class="spotlight-metric"><div class="spotlight-heading"><span>'+esc(m.label)+'</span>'+details(k)+'</div><strong>'+esc(formatted(k,v))+'</strong><div class="spotlight-bar" role="img" aria-label="'+esc(m.label)+': '+esc(formatted(k,v))+'. League range '+esc(formatted(k,min))+' to '+esc(formatted(k,max))+'"><span style="left:'+position.toFixed(1)+'%"></span></div><div class="spotlight-range"><small>League low '+esc(formatted(k,min))+'</small><small>League high '+esc(formatted(k,max))+'</small></div><p>League median: '+esc(formatted(k,median))+'</p></article>';
}

function bindTeamTooltipInteractions(el){
 if(el.dataset.tooltipsBound)return;
 el.dataset.tooltipsBound='true';
 const close=()=>el.querySelectorAll('.metric-info.is-open').forEach(x=>{x.classList.remove('is-open');const b=x.querySelector('.metric-info-trigger');if(b)b.setAttribute('aria-expanded','false');});
 el.addEventListener('click',event=>{
  const button=event.target.closest('.metric-info-trigger');
  if(!button||!el.contains(button))return;
  const wrapper=button.closest('.metric-info'),open=wrapper.classList.contains('is-open');
  close();
  if(!open){wrapper.classList.add('is-open');button.setAttribute('aria-expanded','true');}
 });
 document.addEventListener('pointerdown',event=>{
  if(!el.contains(event.target)||!event.target.closest('.metric-info'))close();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){close();if(document.activeElement?.classList.contains('metric-info-trigger'))document.activeElement.blur();}});
 window.addEventListener('hashchange',close);
}

function renderTeams(){
 const el=$('teamDetails');if(!el)return;
 if(!stats||!catalog.length){el.innerHTML='<div class="empty">Waiting for source-verified current-season team statistics. Numbers are not guessed.</div>';return;}
 const row=stats.records.find(r=>r.code===selected);if(!row){el.innerHTML='<div class="empty">No source record found for this team.</div>';return;}
 const first='<div class="team-profile-head"><img class="team-profile-logo" src="'+logo(selected)+'" alt="'+esc(shortNames[selected])+' logo" loading="lazy"><div class="team-profile-intro"><span class="eyebrow">2026–27 / NBA franchise profile</span><h2>'+esc(shortNames[selected])+'</h2><p><span class="team-profile-count">30 verified metrics</span> A clearer look at this team. Hover over <span class="info-symbol">i</span> for a quick definition (or tap on mobile).</p><div class="team-profile-actions"><button class="btn secondary team-profile-link" type="button" data-go="library">Understand the statistics ↗</button><button class="btn secondary team-profile-link" type="button" data-go="compare">Compare teams ↗</button></div></div></div>';
 const header='<div class="spotlight-intro"><div><span class="eyebrow">The quick read</span><h3>Four numbers. A bigger picture.</h3><p>Compared with the current 30-team league range. Higher is not always better.</p></div><span class="spotlight-note">League comparison · not predictive importance</span></div>';
 const section='<section class="team-spotlight">'+header+'<div class="spotlight-grid">'+['winPct','pointsPerGame','threePointPct','turnoversPerGame'].map(k=>spotlight(k,row)).join('')+'</div></section>';
 el.innerHTML=first+section+'<div class="metric-collection-heading"><div><span class="eyebrow">Deep dive / 30 statistics</span><h3>Explore every number.</h3></div><p>Hover over each <span class="info-symbol">i</span> to see a definition. Tap on phones.</p></div>'+categories.map(c=>'<section class="metric-section" aria-label="'+esc(c.title)+'"><h3>'+esc(c.title)+'</h3><div class="team-metrics-grid">'+c.keys.map(k=>tile(k,row)).join('')+'</div></section>').join('')+sourceNote(row);
 bindTeamTooltipInteractions(el);
 el.querySelectorAll('.team-profile-link').forEach(b=>b.addEventListener('click',()=>{location.hash=b.dataset.go;}));
}
function activateTeam(code,scroll){
 if(!codes[code])return;selected=code;
 document.querySelectorAll('#teamGrid [data-team]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.team===code)));
 renderTeams();
 if(scroll&&$('teamDetails')){$('teamDetails').scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
}
const learnMeasures={
 wins:'Count of victories',losses:'Count of defeats',winPct:'Wins ÷ games × 100',
 pointsPerGame:'Points ÷ games',oppPointsPerGame:'Opponent points ÷ games',marginPerGame:'(Points for − against) ÷ games',
 fieldGoalPct:'Made shots ÷ attempted shots × 100',twoPointPct:'Made 2s ÷ attempted 2s × 100',threePointPct:'Made 3s ÷ attempted 3s × 100',freeThrowPct:'Made free throws ÷ attempted × 100',
 effectiveFgPct:'(Made shots + 0.5 × made 3s) ÷ attempts × 100',threePointRate:'3-point attempts ÷ all shot attempts × 100',freeThrowRate:'Free-throw attempts ÷ shot attempts × 100',
 fgMadePerGame:'Made shots ÷ games',fgAttemptedPerGame:'Shot attempts ÷ games',threeMadePerGame:'Made 3s ÷ games',threeTriedPerGame:'3-point attempts ÷ games',ftMadePerGame:'Made free throws ÷ games',ftTriedPerGame:'Free-throw attempts ÷ games',
 reboundsPerGame:'Rebounds ÷ games',offReboundsPerGame:'Offensive rebounds ÷ games',defReboundsPerGame:'Defensive rebounds ÷ games',
 assistsPerGame:'Assists ÷ games',turnoversPerGame:'Turnovers ÷ games',assistTurnoverRatio:'Assists ÷ turnovers',stealsPerGame:'Steals ÷ games',blocksPerGame:'Blocks ÷ games',foulsPerGame:'Fouls ÷ games',
 twoMadePerGame:'Made 2s ÷ games',twoTriedPerGame:'2-point attempts ÷ games'
};
function showLearn(){
 const grid=$('glossaryGrid');if(!grid||!catalog.length)return;
 const q=($('glossarySearch')?.value||'').toLowerCase().trim();
 const matches=catalog.filter(m=>(m.label+' '+m.brief+' '+m.explanation+' '+(m.whyItMatters||'')+' '+(learnMeasures[m.key]||'')).toLowerCase().includes(q));
 grid.innerHTML=matches.map(m=>'<article class="learn-metric"><h3>'+esc(m.label)+'</h3><p class="learn-explanation">'+esc(m.explanation)+'</p><div class="learn-why"><span class="learn-why-label">Why it matters</span><p>'+esc(m.whyItMatters||m.brief)+'</p></div><p class="learn-measure"><span>How it is measured</span>'+esc(learnMeasures[m.key]||'Measured from game totals')+'</p></article>').join('')||'<div class="empty">No matching statistic. Try another term.</div>';
 if($('glossaryCount'))$('glossaryCount').textContent=matches.length===catalog.length?'Basketball statistics explained · definitions only, no live figures':matches.length+' matching basketball statistics';
}
function renderGameRoomContext(){
 const el=$('gameRoomContext');if(!el)return;
 if(!stats||!catalog.length){el.innerHTML='<div class="empty">Source-verified team statistics are unavailable; no invented values are displayed.</div>';return;}
 const a=$('gameAway')?.value||'GSW',b=$('gameHome')?.value||'BOS';
 if(a===b){el.innerHTML='<div class="empty">Choose two different franchises below.</div>';return;}
 const left=stats.records.find(r=>r.code===a),right=stats.records.find(r=>r.code===b);
 if(!left||!right)return;
 const chosen=['winPct','pointsPerGame','threePointPct','turnoversPerGame'];
 el.innerHTML='<div class="game-context-names"><span><img src="'+logo(a)+'" alt="" loading="lazy">'+esc(shortNames[a])+'</span><span><img src="'+logo(b)+'" alt="" loading="lazy">'+esc(shortNames[b])+'</span></div><div class="game-context-grid">'+chosen.map(k=>{const m=metric(k);return '<div class="game-context-metric"><strong>'+esc(m.label)+'</strong><small>'+esc(m.brief)+'</small><div class="game-context-values"><span>'+esc(formatted(k,left.values[k]))+'</span><span>'+esc(formatted(k,right.values[k]))+'</span></div></div>';}).join('')+'</div><p class="data-sources">Source: ESPN regular-season snapshots · '+esc(formattedTime(stats.retrievedAt))+'. These four comparisons are descriptive, <strong>not a scientifically ranked list of predictive importance</strong>. A custom influential-statistic selector will follow only after backtesting.</p>';
}
function etDate(){
 const o=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const f=k=>o.find(x=>x.type===k).value;return f('year')+'-'+f('month')+'-'+f('day');
}
function stage(date,steps,end){
 if(date>end)return 'Completed · see official results';
 for(const [last,label] of steps)if(date<=last)return label;
 return 'Upcoming';
}
function renderCompetitions(){
 const el=$('competitionDesk');if(!el)return;const date=etDate();const current=seasonEnd===2027;
 const cup=current?stage(date,[['2026-10-29','Group play begins Oct 30'],['2026-11-27','Group play'],['2026-12-03','Knockout rounds begin Dec 4'],['2026-12-05','Quarterfinals'],['2026-12-07','Semifinals begin Dec 8'],['2026-12-09','Semifinals'],['2026-12-10','Championship Dec 11'],['2026-12-11','Championship day']],'2026-12-11'):'Check current NBA Cup schedule';
 const playoffs=current?stage(date,[['2027-04-11','Regular season · playoffs not started'],['2027-04-12','Play-in begins Apr 13'],['2027-04-16','Play-in tournament'],['2027-04-16','Playoffs begin Apr 17'],['2027-06-30','Playoff period · verify live bracket']],'2027-06-30'):'Check current playoffs schedule';
 el.innerHTML='<article class="competition-card"><span class="eyebrow">Emirates NBA Cup 2026</span><h4>'+esc(cup)+'</h4><p>Group play: Oct 30–Nov 27. Quarterfinals: Dec 4–5. Semifinals: Dec 8–9. Final: Dec 11. Cup games count toward the regular season except the final.</p><a href="https://www.nba.com/nba-cup/2026" target="_blank" rel="noopener noreferrer">Official Cup schedule, standings and results ↗</a></article>'+
 '<article class="competition-card"><span class="eyebrow">NBA postseason 2027</span><h4>'+esc(playoffs)+'</h4><p>Regular season ends Apr 11, 2027. Play-in: Apr 13–16. NBA playoffs begin Apr 17. Current brackets and series results require an official source.</p><a href="https://www.nba.com/playoffs" target="_blank" rel="noopener noreferrer">Official playoff bracket and results ↗</a></article>';
}

const pastMeaning={
 wins:'1 if this team won this game; otherwise 0.',
 losses:'1 if this team lost this game; otherwise 0.',
 winPct:'100% for a win; 0% for a loss in this one game.',
 pointsPerGame:'Total points this team scored in this game.',
 oppPointsPerGame:'Points the opponent scored in this game.',
 marginPerGame:'This team’s points minus its opponent’s points.',
 fieldGoalPct:'Made 2- and 3-point shots divided by attempts.',
 twoPointPct:'Made 2-point shots divided by 2-point attempts.',
 threePointPct:'Made 3-point shots divided by 3-point attempts.',
 freeThrowPct:'Made free throws divided by attempts.',
 effectiveFgPct:'Shot accuracy adjusted for the extra value of made 3s.',
 threePointRate:'3-point attempts as a share of all field-goal attempts.',
 freeThrowRate:'Free-throw attempts divided by field-goal attempts.',
 assistTurnoverRatio:'Assists divided by total turnovers in this game.'
};
const pastTooltip=(k)=>pastMeaning[k]||metric(k)?.brief||'Verified individual-game statistic.';
const pastNumber=(k,val)=>val===null||val===undefined?'N/A':formatted(k,val);
function pastStatRow(k,g){
 const m=metric(k);if(!m)return '';
 const av=g.awayStats.values[k],hv=g.homeStats.values[k];
 return '<article class="past-stat-row" data-stat="'+esc(k)+'"><strong class="past-stat-figure past-stat-away">'+esc(pastNumber(k,av))+'</strong>'+
  '<div class="past-stat-term"><span>'+esc(m.label)+'</span>'+details(k,'past',pastTooltip(k))+'</div>'+
  '<strong class="past-stat-figure past-stat-home">'+esc(pastNumber(k,hv))+'</strong></article>';
}
function renderPastGame(g,full){
 const winner=g.hs>g.as?g.home:g.away;
 const summary='<div class="past-game-date">'+esc(new Date(g.date).toLocaleDateString('en-US',{timeZone:'America/New_York',weekday:'long',month:'long',day:'numeric',year:'numeric'}))+'</div>'+
 '<div class="past-result"><div><img src="'+logo(g.away)+'" alt="" loading="lazy"><span>'+esc(shortNames[g.away])+'</span><strong>'+g.as+'</strong></div><span class="past-versus">FINAL</span><div><img src="'+logo(g.home)+'" alt="" loading="lazy"><span>'+esc(shortNames[g.home])+'</span><strong>'+g.hs+'</strong></div></div>';
 if(!full){
  return summary+'<div class="past-stats-awaiting"><h3>Game statistics not yet verified</h3><p>The final result is sourced, but this game’s 30-stat box score is not yet available in the verified archive. Season averages are not substituted.</p></div>';
 }
 if(full.home!==g.home||full.away!==g.away||full.hs!==g.hs||full.as!==g.as)return summary+'<div class="past-stats-awaiting">Box-score validation failed for this game. Its statistics are withheld.</div>';
 const comparison='<section class="past-stats-grid" aria-label="Thirty individual-game statistics for both teams">'+
  '<div class="past-stat-intro"><div><span class="eyebrow">Head-to-head / game box score</span><h3>30 numbers. Both sides.</h3></div><p>These are values from this <strong>single completed game</strong>, not season averages. “Per game” means the total in this one game; a win/loss counts as 1 or 0. Hover over <span class="info-symbol">i</span> to learn what each stat means.</p></div>'+
  '<div class="past-stat-team-head"><span><img src="'+logo(g.away)+'" alt="" loading="lazy">'+esc(shortNames[g.away])+'</span><span>Statistic</span><span><img src="'+logo(g.home)+'" alt="" loading="lazy">'+esc(shortNames[g.home])+'</span></div>'+
  categories.map(c=>'<div class="past-stat-category"><h4>'+esc(c.title)+'</h4><div class="past-stat-rows">'+c.keys.map(k=>pastStatRow(k,full)).join('')+'</div></div>').join('')+
  '<p class="data-sources">Source: <a target="_blank" rel="noopener noreferrer" href="'+esc(full.boxscoreUrl)+'">ESPN game box score ↗</a>. Each team’s shooting totals were cross-checked against the published final score. “N/A” means a calculation is undefined or unavailable—not zero. Values such as shooting accuracy are measured after the game and must not be interpreted as a pregame prediction.</p></section>';
 return summary+comparison;
}
async function loadPastGames(){
 const select=$('pastGameSelect'),body=$('pastGameReport'),coverage=$('pastGameCoverage');
 if(!select||!body)return;
 try{
  const [list,boxscores]=await Promise.all([
   getSnapshot('completed-games-'+seasonEnd+'.json'),
   getSnapshot('game-boxscores-'+seasonEnd+'.json').catch(()=>null)
  ]);
  if(list.format!=='aureum-completed-games-v1'||list.season!==seasonEnd||!Array.isArray(list.games)||list.count!==list.games.length)throw Error('Completed scores failed validation');
  const games=list.games.filter(g=>codes[g.home]&&codes[g.away]&&g.home!==g.away&&Number.isInteger(g.hs)&&Number.isInteger(g.as)&&g.hs!==g.as);
  if(!games.length)throw Error('No validated completed games were found');
  const verified=boxscores?.format==='aureum-game-boxscores-v1'&&boxscores.season===seasonEnd&&boxscores.metricCount===30&&Array.isArray(boxscores.games);
  const byId=new Map((verified?boxscores.games:[]).filter(g=>g.homeStats?.values&&g.awayStats?.values&&catalog.every(m=>m.key in g.homeStats.values&&m.key in g.awayStats.values)).map(g=>[g.id,g]));
  games.sort((a,b)=>new Date(b.date)-new Date(a.date));
  select.innerHTML=games.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.away)+' at '+esc(g.home)+' · '+esc(new Date(g.date).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'}))+(byId.has(g.id)?'':' · box score pending')+'</option>').join('');
  const current=games.find(g=>byId.has(g.id));if(current)select.value=current.id;
  const draw=()=>{
   const g=games.find(x=>x.id===select.value);if(!g)return;
   body.innerHTML=renderPastGame(g,byId.get(g.id));
  };
  select.addEventListener('change',draw);
  bindTeamTooltipInteractions(body);
  draw();
  if(coverage)coverage.textContent=byId.size+' verified two-team box scores / '+games.length+' completed games';
 }catch(e){
  body.innerHTML='<div class="empty">Unable to validate the completed-game archive: '+esc(e.message)+'. No figures have been invented.</div>';
  if(coverage)coverage.textContent='Game box scores are not available';
 }
}

async function init(){
 const grid=$('teamGrid');
 if(grid){
  grid.addEventListener('click',e=>{const button=e.target.closest('button[data-team]');if(button)activateTeam(button.dataset.team,true);});
 }
 window.addEventListener('aureum:select-team',e=>{if(e.detail?.team)activateTeam(e.detail.team,true);});
 $('glossarySearch')?.addEventListener('input',showLearn);
 ['gameAway','gameHome'].forEach(id=>$(id)?.addEventListener('change',renderGameRoomContext));
 renderCompetitions();
 try{
  const raw=await getSnapshot('metric-catalog.json');
  if(!Array.isArray(raw.metrics)||raw.metrics.length!==30||new Set(raw.metrics.map(x=>x.key)).size!==30)throw Error('30-metric glossary not verified');
  catalog=raw.metrics;
  showLearn();
  loadPastGames();
  const current=await getSnapshot('teams-'+seasonEnd+'.json');
  stats=seasonCheck(current);
  activateTeam(selected,false);
  renderGameRoomContext();
  const help=$('teamSearch');
  if(help)help.setAttribute('aria-label','Find one of 30 NBA teams; choose a result to reveal 30 current statistics');
 }catch(e){
  if($('teamDetails'))$('teamDetails').innerHTML='<div class="empty">Unable to verify current-season team statistics: '+esc(e.message)+'. No numbers have been substituted.</div>';
  showLearn();renderGameRoomContext();
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
