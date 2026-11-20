/* Parse individual NBA ESPN boxscores. Never substitute season averages. */
export const aliases={GS:'GSW',SA:'SAS',NY:'NYK',NO:'NOP',UTAH:'UTA',WSH:'WAS',PHO:'PHX',BRK:'BKN'};
export const normalize=c=>aliases[String(c||'').toUpperCase()]||String(c||'').toUpperCase();
export const keys=[
'wins','losses','winPct','pointsPerGame','oppPointsPerGame','marginPerGame',
'fieldGoalPct','twoPointPct','threePointPct','freeThrowPct','effectiveFgPct','threePointRate','freeThrowRate',
'fgMadePerGame','fgAttemptedPerGame','twoMadePerGame','twoTriedPerGame',
'threeMadePerGame','threeTriedPerGame','ftMadePerGame','ftTriedPerGame',
'reboundsPerGame','offReboundsPerGame','defReboundsPerGame',
'assistsPerGame','turnoversPerGame','assistTurnoverRatio','stealsPerGame','blocksPerGame','foulsPerGame'
];
if(keys.length!==30||new Set(keys).size!==30)throw Error('Expected 30 distinct metric keys');
function fail(msg){throw Error('Game boxscore: '+msg)}
function integer(input,name,max=350){
 const n=Number(input);
 if(input===undefined||input===null||String(input).trim()===''||!Number.isInteger(n)||n<0||n>max)fail('invalid '+name+': '+String(input));
 return n;
}
function pair(stats,name){
 const text=stats.get(name)?.displayValue;
 const match=/^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(text||'');
 if(!match)fail('missing made-attempted stat '+name);
 const makes=integer(match[1],name+' made'),attempts=integer(match[2],name+' attempted');
 if(makes>attempts)fail('makes > attempts for '+name);
 return [makes,attempts];
}
function single(stats,name){
 const x=stats.get(name)?.displayValue;
 return integer(x,name);
}
function percent(top,den){return den?100*top/den:null}
function round(n){return n===null?null:Math.round(n*10000)/10000}
function sourceTeam(raw,code,points,against){
 if(!raw||normalize(raw.team?.abbreviation)!==code)fail('boxscore team mismatch for '+code);
 const s=new Map((raw.statistics||[]).map(x=>[x.name,x]));
 const [fgm,fga]=pair(s,'fieldGoalsMade-fieldGoalsAttempted');
 const [tpm,tpa]=pair(s,'threePointFieldGoalsMade-threePointFieldGoalsAttempted');
 const [ftm,fta]=pair(s,'freeThrowsMade-freeThrowsAttempted');
 const tm=fgm-tpm,ta=fga-tpa;
 if(tm<0||ta<0||tm>ta||tpm>fgm||tpa>fga)fail('invalid 2/3 shot partition '+code);
 const reb=single(s,'totalRebounds'),oreb=single(s,'offensiveRebounds'),dreb=single(s,'defensiveRebounds');
 const ass=single(s,'assists'),turn=single(s,'totalTurnovers');
 const steal=single(s,'steals'),block=single(s,'blocks'),fouls=single(s,'fouls');
 if(reb!==oreb+dreb)fail('rebound subtotal discrepancy '+code);
 if(2*fgm+tpm+ftm!==points)fail('score mismatch '+code+': '+(2*fgm+tpm+ftm)+' != '+points);
 const won=points>against?1:0;
 const vals={
 wins:won,losses:1-won,winPct:won*100,
 pointsPerGame:points,oppPointsPerGame:against,marginPerGame:points-against,
 fieldGoalPct:percent(fgm,fga),twoPointPct:percent(tm,ta),
 threePointPct:percent(tpm,tpa),freeThrowPct:percent(ftm,fta),
 effectiveFgPct:percent(fgm+0.5*tpm,fga),
 threePointRate:percent(tpa,fga),freeThrowRate:percent(fta,fga),
 fgMadePerGame:fgm,fgAttemptedPerGame:fga,
 twoMadePerGame:tm,twoTriedPerGame:ta,
 threeMadePerGame:tpm,threeTriedPerGame:tpa,
 ftMadePerGame:ftm,ftTriedPerGame:fta,
 reboundsPerGame:reb,offReboundsPerGame:oreb,defReboundsPerGame:dreb,
 assistsPerGame:ass,turnoversPerGame:turn,assistTurnoverRatio:turn?ass/turn:null,
 stealsPerGame:steal,blocksPerGame:block,foulsPerGame:fouls
 };
 const ordered={};
 for(const k of keys){
  if(!(k in vals))fail('missing metric '+k);
  const n=round(vals[k]);
  if(n!==null&&(!Number.isFinite(n)||(n<0&&k!=='marginPerGame')))fail('invalid computed '+k);
  if(/Pct$/.test(k)&&n!==null&&n>100)fail('rate exceeds 100 '+k);
  ordered[k]=n;
 }
 return {code,score:points,values:ordered};
}
export function extractGame(game,summary){
 if(!/^\d+$/.test(String(game?.id||'')))fail('invalid event id');
 const h=normalize(game.home),a=normalize(game.away);
 if(!h||!a||h===a)fail('invalid teams');
 const hs=integer(game.hs,'home score',250),as=integer(game.as,'away score',250);
 if(hs===as)fail('completed game is tied');
 const teams=summary?.boxscore?.teams;
 const competition=summary?.header?.competitions?.[0];
 if(!Array.isArray(teams)||teams.length!==2||!competition)fail('missing game summary');
 const rivals=competition.competitors||[];
 const home=rivals.find(x=>x.homeAway==='home'),away=rivals.find(x=>x.homeAway==='away');
 if(normalize(home?.team?.abbreviation)!==h||normalize(away?.team?.abbreviation)!==a||integer(home.score,'header home score',250)!==hs||integer(away.score,'header away score',250)!==as)fail('independent boxscore header does not match archived final result '+game.id);
 const found=c=>teams.find(t=>normalize(t?.team?.abbreviation)===c);
 const result={
  id:String(game.id),date:game.date,home:h,away:a,hs,as,
  boxscoreUrl:'https://www.espn.com/nba/boxscore/_/gameId/'+String(game.id),
  homeStats:sourceTeam(found(h),h,hs,as),
  awayStats:sourceTeam(found(a),a,as,hs)
 };
 if(Object.keys(result.homeStats.values).length!==30||Object.keys(result.awayStats.values).length!==30)fail('not 30 measures per team');
 return result;
}
