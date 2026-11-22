/* Aureum Tipoff / Insights: verified, game-specific, non-predictive measurements */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
if(!$('insightsGameSelect'))return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teams={
 ATL:['Atlanta Hawks',1610612737],BOS:['Boston Celtics',1610612738],BKN:['Brooklyn Nets',1610612751],
 CHA:['Charlotte Hornets',1610612766],CHI:['Chicago Bulls',1610612741],CLE:['Cleveland Cavaliers',1610612739],
 DAL:['Dallas Mavericks',1610612742],DEN:['Denver Nuggets',1610612743],DET:['Detroit Pistons',1610612765],
 GSW:['Golden State Warriors',1610612744],HOU:['Houston Rockets',1610612745],IND:['Indiana Pacers',1610612754],
 LAC:['LA Clippers',1610612746],LAL:['Los Angeles Lakers',1610612747],MEM:['Memphis Grizzlies',1610612763],
 MIA:['Miami Heat',1610612748],MIL:['Milwaukee Bucks',1610612749],MIN:['Minnesota Timberwolves',1610612750],
 NOP:['New Orleans Pelicans',1610612740],NYK:['New York Knicks',1610612752],OKC:['Oklahoma City Thunder',1610612760],
 ORL:['Orlando Magic',1610612753],PHI:['Philadelphia 76ers',1610612755],PHX:['Phoenix Suns',1610612756],
 POR:['Portland Trail Blazers',1610612757],SAC:['Sacramento Kings',1610612758],SAS:['San Antonio Spurs',1610612759],
 TOR:['Toronto Raptors',1610612761],UTA:['Utah Jazz',1610612762],WAS:['Washington Wizards',1610612764]
};
const name=c=>teams[c]?.[0]||c;
const logo=c=>'https://cdn.nba.com/logos/nba/'+teams[c]?.[1]+'/global/L/logo.svg';
const dateET=x=>new Date(x).toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',year:'numeric'});
const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date());
const yr=+parts.find(x=>x.type==='year').value,month=+parts.find(x=>x.type==='month').value,season=month>=10?yr+1:yr;
let data=null,view=null;
const gameInput=$('insightsGameSelect'),categoryInput=$('insightsCategory'),teamInput=$('insightsTeamFilter'),queryInput=$('insightsSearch');
const counts=$('insightsCount'),cards=$('insightsMetricGrid'),sourceNote=$('insightsSourceNote');
const srcText=m=>esc(m.source||'Validated source');
const teamIdentity=(code)=>code==='BOTH'?'BOTH TEAMS':name(code);
const bestPick=g=>{
 const candidates=g.metrics.filter(m=>Number.isFinite(m.value)&&m.id!=='scoringGap'&&!['wonWithLowerEfg','wonWithFewerBaskets','wonDespiteReboundDeficit'].includes(m.id));
 const priority={oneMinuteBurst:50,largestUnansweredRun:49,winnerRecoveredDeficit:45,scoringDrought:42,scoringVelocity:40,scorelessWorkhorse:35,topScorerLoad:32,threePointScoringShare:30,turnoverBurden:25,offBoardsPerMiss:28,threePointSwing:22};
 const arr=candidates.sort((a,b)=>(b.seasonPercentile||0)-(a.seasonPercentile||0)||(priority[b.id]||0)-(priority[a.id]||0));
 const used=new Set(),out=[];
 for(const m of arr){if(used.has(m.id)||used.has(m.category)&&out.length>=2)continue;used.add(m.id);used.add(m.category);out.push(m);if(out.length===4)break;}
 return out;
};
function filters(){
 const g=view;if(!g)return;
 const q=queryInput.value.toLowerCase().trim(),category=categoryInput.value,team=teamInput.value;
 const metrics=g.metrics.filter(m=>(category==='all'||m.category===category)&&(team==='all'||m.team===team||m.team==='BOTH')&&(!q||[m.title,m.explain,m.formula,m.category,m.team].join(' ').toLowerCase().includes(q)));
 counts.textContent=metrics.length+' sourced measurements shown · '+g.metrics.length+' available for this game';
 if(!metrics.length){cards.innerHTML='<p class="insights-no-results">No matching verified measurements for this combination. Try another category or team.</p>';return;}
 const grouped=new Map();
 for(const m of metrics){const k=m.category;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(m);}
 cards.innerHTML=[...grouped.entries()].map(([category,items])=>'<div class="insights-metric-group"><div class="insights-group-heading"><h4>'+esc(category)+'</h4><span>'+items.length+' measures</span></div><div class="insights-card-grid">'+items.map(m=>
  '<article class="insights-metric-card" data-stat="'+esc(m.id)+'" data-team="'+esc(m.team)+'">'+
   '<div class="insights-card-top"><span class="insights-team-chip">'+esc(teamIdentity(m.team))+'</span>'+
   (m.seasonPercentile>=95?'<span class="insights-percentile">Upper '+Math.max(1,100-m.seasonPercentile+1)+'% of records</span>':'')+'</div>'+
   '<strong class="insights-number">'+esc(m.display)+'</strong><h5>'+esc(m.title)+'</h5><p>'+esc(m.explain)+'</p>'+
   '<details class="insights-method"><summary>How it is measured</summary><p><b>Formula:</b> '+esc(m.formula)+'</p><p><b>Source:</b> '+srcText(m)+'</p></details>'+
  '</article>').join('')+'</div></div>'
 ).join('');
}
function render(){
 const g=data?.games.find(x=>String(x.id)===gameInput.value);
 if(!g)return;
 view=g;
 const chip=(c,score,side)=>'<div class="insights-final-team '+side+'"><img src="'+logo(c)+'" alt="'+esc(name(c))+' logo" loading="lazy"><div><span>'+esc(name(c))+'</span><strong>'+score+'</strong></div></div>';
 $('insightsSummary').innerHTML='<div class="insights-scoreline"><span class="insights-final-date">'+esc(dateET(g.date))+' · FINAL</span><div class="insights-final-matchup">'+chip(g.away,g.as,'away')+'<span class="insights-final-divider">—</span>'+chip(g.home,g.hs,'home')+'</div><div class="insights-final-source"><span>'+g.metrics.length+' recorded measurements</span><span>·</span><span>'+(g.playByPlayVerified?'Verified play-by-play timeline ('+g.playEventCount+' events)':'Event-timeline metrics withheld: a complete scoring timeline could not be verified')+'</span></div></div>';
 const oldTeam=teamInput.value;
 teamInput.innerHTML='<option value="all">Both teams</option><option value="'+g.away+'">'+esc(name(g.away))+'</option><option value="'+g.home+'">'+esc(name(g.home))+'</option>';
 if([...teamInput.options].some(x=>x.value===oldTeam))teamInput.value=oldTeam;
 const special=bestPick(g);
 $('insightsSpotlights').innerHTML=special.length?special.map((m,i)=>'<article class="insights-feature"><span class="insights-feature-kicker">'+(i===0?'FEATURED FINDING':'DISCOVERY '+(i+1))+' · '+esc(m.category)+'</span><strong>'+esc(m.display)+'</strong><h4>'+esc(m.title)+'</h4><p>'+esc(m.explain)+'</p><span class="insights-feature-team">'+esc(teamIdentity(m.team))+(m.seasonPercentile>=95?' · upper '+Math.max(1,100-m.seasonPercentile+1)+'% of available records':'')+'</span></article>').join(''):'<p class="insights-no-results">Not enough verified observations for standout selection.</p>';
 const src='<a href="'+esc(g.boxscoreUrl)+'" target="_blank" rel="noopener noreferrer">ESPN box score for this game</a>';
 sourceNote.innerHTML='<strong>Evidence for this game:</strong> '+src+'. Derived measurements come from checked team and player box scores.'+(g.playByPlayVerified?' Timeline values come from scoring plays matched to this final result.':' Timeline-based discoveries are not shown until complete, reconciled play-by-play data is available.')+' Percentiles compare values with the current stored season sample and will change as new games are added. None of these figures establishes what caused a win.';
 filters();
}
function init(){
 $('insightsDataStatus').textContent='Loading sourced game statistics…';
 const base='data/game-insights-'+season+'.json';
 fetch(base+'?fresh='+Date.now(),{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();}).then(d=>{
  if(d?.format!=='aureum-game-insights-v1'||d.season!==season||!Array.isArray(d.games)||d.games.length<1||d.games.some(g=>!g.id||!Array.isArray(g.metrics)||g.metrics.length===0||!Number.isInteger(g.hs)||!Number.isInteger(g.as)))throw Error('Unverified Insights snapshot');
  data=d;
  d.games.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  const verified=d.games.filter(g=>g.playByPlayVerified).length;
  $('insightsDataStatus').textContent=d.games.length+' completed games · '+verified+' with reconciled play-by-play · Last refreshed '+new Date(d.retrievedAt).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
  gameInput.innerHTML=d.games.map(g=>'<option value="'+esc(g.id)+'">'+esc(dateET(g.date))+' · '+esc(g.away)+' '+g.as+' at '+esc(g.home)+' '+g.hs+'</option>').join('');
  gameInput.value=d.games[0].id;
  render();
 }).catch(()=>{
  $('insightsDataStatus').textContent='Insights data is temporarily unavailable.';
  gameInput.innerHTML='<option value="">Verified game data unavailable</option>';
  cards.innerHTML='<p class="insights-no-results">Game-specific measurements could not be loaded. No substitute figures are shown.</p>';
  $('insightsSpotlights').innerHTML='';
  sourceNote.textContent='The source snapshot has not been verified for this session.';
 });
 gameInput.addEventListener('change',render);
 for(const el of [categoryInput,teamInput,queryInput])el.addEventListener(el===queryInput?'input':'change',filters);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
