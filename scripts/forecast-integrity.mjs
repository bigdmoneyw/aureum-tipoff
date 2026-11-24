/* Source-level boundary: NBA Cup championship is NOT an NBA regular-season result.
 * Retain it in public game archives, but exclude it from regular-season model fitting. */
const teams = new Set('ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' '));
export const knownCupFinals = Object.freeze({
  2025: {id:'401734908',eastDate:'2024-12-17'},
  2026: {id:'401809839',eastDate:'2025-12-16'},
  2027: {id:null,eastDate:'2026-12-11'}
});
export function easternDate(timestamp){
  const date=new Date(timestamp);
  if(!Number.isFinite(date.getTime()))throw Error('Invalid game timestamp');
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get=k=>parts.find(p=>p.type===k).value;
  return get('year')+'-'+get('month')+'-'+get('day');
}
export function isCupChampionship(game,season){
  if(game?.competition==='nba-cup-championship')return true;
  const known=knownCupFinals[Number(season)];
  if(known?.id&&String(game?.id)===known.id)return true;
  // For 2026–27, the announced Cup final is held on a specific evening
  // at a neutral venue. Do not exclude other games on that date.
  const neutral=game?.neutral===true||game?.neutralSite===true||game?.competitions?.[0]?.neutralSite===true;
  return !!(known&&neutral&&easternDate(game.date)===known.eastDate);
}
/** Only regular-season games may influence regular-season model fitting. */
export function isRegularSeasonGame(game,season){
 if(isCupChampionship(game,season))return false;
 const stage=game?.competition;
 if(stage&&stage!=='nba-regular-season')return false;
 const seasonType=game?.seasonType??game?.season?.type;
 if(seasonType!==undefined&&seasonType!==null&&Number(seasonType)!==2)return false;
 return true;
}
export function verifyArchive(archive,{complete=false}={}){
  if(!archive||!Number.isInteger(archive.season)||!Array.isArray(archive.games))throw Error('Missing season archive');
  const seen=new Set(),counts=Object.fromEntries([...teams].map(code=>[code,0]));
  for(const g of archive.games){
    if(!/^\d+$/.test(String(g.id))||seen.has(String(g.id))||!teams.has(g.home)||!teams.has(g.away)||g.home===g.away||!Number.isInteger(g.hs)||!Number.isInteger(g.as)||g.hs<0||g.as<0||g.hs===g.as||!Number.isFinite(Date.parse(g.date)))throw Error('Unusable game in season '+archive.season+': '+g.id);
    if(!isRegularSeasonGame(g,archive.season))throw Error('Non-regular-season game cannot enter the training archive: '+g.id);
    seen.add(String(g.id));counts[g.home]++;counts[g.away]++;
  }
  if(complete){
    if(archive.games.length!==1230)throw Error('Expected 1230 regular-season games in '+archive.season+'; found '+archive.games.length);
    for(const [code,count] of Object.entries(counts))if(count!==82)throw Error(code+' has '+count+' games in '+archive.season+' instead of 82');
  }
  return {games:archive.games.length,teamGames:counts};
}
export function regularSeasonOnly(archive,{complete=false}={}){
  if(!archive||!Array.isArray(archive.games))throw Error('Missing games to clean');
  const removedCup=archive.games.filter(g=>isCupChampionship(g,archive.season)).map(g=>String(g.id));
  const removedOther=archive.games.filter(g=>!isCupChampionship(g,archive.season)&&!isRegularSeasonGame(g,archive.season)).map(g=>String(g.id));
  const result={...archive,games:archive.games.filter(g=>isRegularSeasonGame(g,archive.season))};
  if('count' in result)result.count=result.games.length;
  if(removedCup.length)result.excludedCupFinalGameIds=[...new Set([...(archive.excludedCupFinalGameIds||[]),...removedCup])];
  if(removedOther.length)result.excludedOtherCompetitionGameIds=[...new Set([...(archive.excludedOtherCompetitionGameIds||[]),...removedOther])];
  verifyArchive(result,{complete});
  return result;
}
