/* A small, chronological NBA logistic forecast. No final-game inputs are used before tipoff. */
export const version='aureum-elo-rest-form-v1';
export const featureNames=['ratingDifferencePer100','recentFormDifference','restDifference'];
const codes='ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' ');
export const etDay=date=>{const a=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(date));const p=k=>a.find(x=>x.type===k).value;return p('year')+'-'+p('month')+'-'+p('day');};
const dayNum=d=>Date.parse(d+'T00:00:00Z')/86400000;
const sig=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
export function emptyState(){return Object.fromEntries(codes.map(code=>[code,{rating:1500,results:[],lastDate:null,games:0}]));}
export function context(state,code,date){
 const x=state[code];if(!x)throw Error('Invalid team '+code);
 const n=x.results.length,won=x.results.reduce((s,y)=>s+y,0);
 return {rating:x.rating,form:(won+2)/(n+4),recentWins:won,recentGames:n,rest:x.lastDate===null?1:Math.max(0,Math.min(3,dayNum(date)-dayNum(x.lastDate)-1)),restKnown:x.lastDate!==null,games:x.games,lastDate:x.lastDate};
}
export function features(a,b){return [(a.rating-b.rating)/100,a.form-b.form,(a.rest-b.rest)/3];}
export function probability(weights,x,venue=1){return sig(weights[0]*venue+x.reduce((s,v,i)=>s+weights[i+1]*v,0));}
function fit(rows){
 let w=[0,0,0,0];const lr=.12,lambda=.04;
 for(let iter=0;iter<850;iter++){
  const g=[0,0,0,0];
  for(const r of rows){const v=[1,...r.x],e=probability(w,r.x)-r.y;for(let i=0;i<4;i++)g[i]+=e*v[i];}
  for(let i=0;i<4;i++)w[i]-=lr*(g[i]/rows.length+(i?lambda*w[i]:0));
 }
 return w;
}
function evaluate(rows,w,base){
 let brier=0,loss=0,correct=0,baseBrier=0,baseCorrect=0;
 for(const r of rows){const p=probability(w,r.x);brier+=(p-r.y)**2;loss-=r.y*Math.log(p)+(1-r.y)*Math.log(1-p);correct+=Number((p>=.5)===!!r.y);baseBrier+=(base-r.y)**2;baseCorrect+=Number((base>=.5)===!!r.y);}
 return {games:rows.length,accuracy:correct/rows.length,brier:brier/rows.length,logLoss:loss/rows.length,homeRateBaseline:base,baselineAccuracy:baseCorrect/rows.length,baselineBrier:baseBrier/rows.length};
}
export function buildForecast(archive,now){
 const state=emptyState(),days=new Map(),seen=new Set();
 for(const g of archive.games||[]){
  if(!/^\d+$/.test(String(g.id))||seen.has(g.id)||!state[g.home]||!state[g.away]||g.home===g.away||!Number.isFinite(Date.parse(g.date))||!Number.isInteger(g.hs)||!Number.isInteger(g.as)||Math.min(g.hs,g.as)<0||g.hs===g.as)throw Error('Invalid completed result '+g.id);
  if(Date.parse(g.date)>=now.getTime())throw Error('Future game in completed archive '+g.id);
  seen.add(g.id);const d=etDay(g.date);if(!days.has(d))days.set(d,[]);days.get(d).push(g);
 }
 const dates=[...days.keys()].sort();
 const rows=[];
 let priorDayState=null;
 const currentDay=etDay(now);
 // All games on a date use the pre-date state. No same-date outcome can leak into features.
 for(const d of dates){
  if(d===currentDay)priorDayState=JSON.parse(JSON.stringify(state));
  const games=days.get(d);const changes=[];
  for(const g of games){
   const h=context(state,g.home,d),a=context(state,g.away,d),y=g.hs>g.as?1:0;
   const x=features(h,a);
   if(h.games>=3&&a.games>=3)rows.push({date:d,x,y});
   const expected=1/(1+10**(-(h.rating-a.rating+55)/400));
   changes.push({g,y,delta:20*(y-expected)});
  }
  for(const {g,y,delta} of changes){
   for(const [c,w,adj] of [[g.home,y,delta],[g.away,1-y,-delta]]){
    const t=state[c];t.rating+=adj;t.games++;t.lastDate=d;t.results.push(w);if(t.results.length>10)t.results.shift();
   }
  }
 }
 if(rows.length<90)throw Error('Not enough chronological games to test this model');
 const usableDates=[...new Set(rows.map(r=>r.date))];const splitDate=usableDates[Math.floor(usableDates.length*.7)];
 const train=rows.filter(r=>r.date<splitDate),test=rows.filter(r=>r.date>=splitDate);
 if(train.length<45||test.length<25)throw Error('Insufficient chronological train/test sample');
 const weights=fit(train),base=train.reduce((s,r)=>s+r.y,0)/train.length;
 if(weights.some(x=>!Number.isFinite(x)))throw Error('Invalid fitted model');
 const report=evaluate(test,weights,base);
 return {format:'aureum-forecast-v1',version,season:archive.season,retrievedAt:now.toISOString(),sourceArchiveCollectedAt:archive.retrievedAt,source:'ESPN archived completed scores',features:featureNames,weights,state,
 backtest:{method:'Date-blocked chronological holdout; features use only outcomes on earlier dates. Coefficients fitted on early dates only. No injuries or subjective adjustments included.',trainingGames:train.length,trainingThrough:train.at(-1).date,testFrom:splitDate,testThrough:test.at(-1).date,...report},
 archiveGames:seen.size,throughDate:dates.at(-1),todayState:priorDayState||JSON.parse(JSON.stringify(state)),todayDate:currentDay,limitations:'Retrospective small-sample test, not prospectively locked forecasts or guaranteed future performance. Home-court neutral/swap extrapolation; player and qualitative assumptions not learned.'};
}
