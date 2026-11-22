/* Season-separated training, historical-only choices, and current-season evaluation. */
import {etDay} from './forecast-core.mjs';
export const version='aureum-conditions-v2';
const codes='ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL PHI PHX POR SAC SAS TOR UTA WAS'.split(' ');
const dayNum=d=>Date.parse(d+'T00:00:00Z')/864e5;
const sig=z=>1/(1+Math.exp(-Math.max(-25,Math.min(25,z))));
const sum=a=>a.reduce((s,x)=>s+x,0);
const mean=a=>a.length?sum(a)/a.length:0;
const round=x=>Math.round(x*1e6)/1e6;
const blank=()=>Object.fromEntries(codes.map(c=>[c,{rating:1500,results:[],margins:[],opponents:[],dates:[],lastDate:null,games:0}]));
export const names=['Rating difference','Recent wins','Rest days','Recent scoring margin','Recent schedule load','Recent opponent strength'];
export function context(t,date){
 const rest=t.lastDate?Math.max(0,Math.min(3,dayNum(date)-dayNum(t.lastDate)-1)):1;
 return {rating:t.rating,form:(sum(t.results)+2)/(t.results.length+4),recentWins:sum(t.results),recentGames:t.results.length,rest,restKnown:!!t.lastDate,games:t.games,lastDate:t.lastDate,margin:sum(t.margins)/(t.margins.length+4),load:t.dates.filter(d=>dayNum(date)-dayNum(d)>=1&&dayNum(date)-dayNum(d)<=7).length,opponent:(sum(t.opponents.map(x=>x-1500))/(t.opponents.length+4))};
}
export function features(a,b){return [(a.rating-b.rating)/100,a.form-b.form,(a.rest-b.rest)/3,(a.margin-b.margin)/10,(a.load-b.load)/5,(a.opponent-b.opponent)/100];}
export function predict(w,x,venue=1){return sig(w[0]*venue+sum(x.map((v,i)=>v*w[i+1])));}
function fit(rows,lambda,wide=true){
 const w=Array(7).fill(0);
 for(let step=0;step<1200;step++){
  const g=Array(7).fill(0);
  for(const r of rows){const x=[r.venue,...r.x],e=predict(w,r.x,r.venue)-r.y;for(let j=0;j<7;j++)g[j]+=e*x[j];}
  for(let j=0;j<7;j++)w[j]-=.18*(g[j]/rows.length+(j?lambda*w[j]:0));
  // Preserve the meaning of stronger past results. A negative coefficient on a
  // collinear strength measure is not an interpretable independent effect.
  for(const j of [1,2,4])w[j]=Math.max(0,w[j]);
  if(!wide)for(const j of [4,5,6])w[j]=0;
 }
 return w;
}
function score(rows,w,base=.5){
 const probs=rows.map(r=>predict(w,r.x,r.venue));
 const brier=mean(rows.map((r,i)=>(probs[i]-r.y)**2));
 const logLoss=mean(rows.map((r,i)=>-Math.log(r.y?probs[i]:1-probs[i])));
 const calibration=[];
 for(let j=0;j<5;j++){const indices=probs.flatMap((p,i)=>p>=j/5&&(j===4?p<=1:p<(j+1)/5)?[i]:[]);if(indices.length)calibration.push({from:j/5,to:(j+1)/5,games:indices.length,meanPrediction:mean(indices.map(i=>probs[i])),observed:mean(indices.map(i=>rows[i].y))});}
 return {games:rows.length,accuracy:mean(rows.map((r,i)=>Number((probs[i]>=.5)===!!r.y))),brier,logLoss,homeRateBaseline:base,baselineBrier:mean(rows.map(r=>(base-r.y)**2)),baselineAccuracy:mean(rows.map(r=>Number((base>=.5)===!!r.y))),calibration};
}
function gameRows(list,state,season,opts={}){
 const byDay=new Map(),ids=new Set(),rows=[],playerState=opts.playerState||{},playerRows=[],snapshots=[],horizonRows={7:[],30:[],60:[]};
 for(const g of list){if(ids.has(g.id)||!state[g.home]||!state[g.away]||g.home===g.away||!Number.isInteger(g.hs)||!Number.isInteger(g.as)||g.hs===g.as||!Number.isFinite(Date.parse(g.date)))throw Error('Invalid game '+g.id);ids.add(g.id);const day=etDay(g.date);if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(g);}
 let todayState=null;
 for(const date of [...byDay.keys()].sort()){
  if(date===opts.today)todayState=JSON.parse(JSON.stringify(state));
  snapshots.push({date,state:JSON.parse(JSON.stringify(state))});
  const updates=[];
  for(const g of byDay.get(date)){
   const h=context(state[g.home],date),a=context(state[g.away],date),y=Number(g.hs>g.as),venue=g.neutral?0:1,x=features(h,a);
   for(const horizon of [7,30,60]){
    const cutoff=dayNum(date)-horizon;
    const snap=snapshots.findLast(z=>dayNum(z.date)<=cutoff);
    if(!snap)continue;
    const oldH=context(snap.state[g.home],snap.date),oldA=context(snap.state[g.away],snap.date);
    if(oldH.games<3||oldA.games<3)continue;
    const fx=features(oldH,oldA);fx[2]=0;fx[4]=0;
    horizonRows[horizon].push({date,season,id:g.id,x:fx,y,venue});
   }
   if(h.games>=3&&a.games>=3){
    const row={date,season,id:g.id,x,y,venue};rows.push(row);
    const box=opts.players?.get(g.id);
    if(box){
     const missed=c=>sum((box.players[c]||[]).filter(p=>!p.played&&playerState[p.id]?.team===c&&playerState[p.id].minutes.length>=3).map(p=>mean(playerState[p.id].minutes)))/48;
     playerRows.push({...row,missingMinutes:missed(g.away)-missed(g.home)});
    }
   }
   const delta=20*(y-1/(1+10**(-(h.rating-a.rating+55*venue)/400)));
   updates.push({g,y,delta,h:a.rating,a:h.rating});
  }
  for(const {g,y,delta,h,a} of updates){
   for(const [c,w,adj,margin,opp] of [[g.home,y,delta,g.hs-g.as,h],[g.away,1-y,-delta,g.as-g.hs,a]]){
    const t=state[c];t.rating+=adj;t.games++;t.lastDate=date;t.results.push(w);t.margins.push(margin);t.opponents.push(opp);t.dates.push(date);
    for(const k of ['results','margins','opponents','dates'])if(t[k].length>10)t[k].shift();
   }
   const box=opts.players?.get(g.id);
   if(box)for(const [team,players] of Object.entries(box.players))for(const p of players){
    if(!p.played||p.min<=0)continue;
    const prev=playerState[p.id]?.team===team?playerState[p.id]:{minutes:[],points:[],games:0};
    prev.team=team;prev.lastDate=date;prev.games++;prev.minutes.push(p.min);prev.points.push(p.pts);
    if(prev.minutes.length>10){prev.minutes.shift();prev.points.shift();}
    playerState[p.id]=prev;
   }
  }
 }
 return {rows,todayState:todayState||JSON.parse(JSON.stringify(state)),playerRows,playerState,horizonRows};
}
function newSeason(state){
 const next=blank();
 for(const c of codes)next[c].rating=1500+.65*(state[c].rating-1500);
 return next;
}
function playerFit(rows,w,priorRows=[]){
 const historical=priorRows.length>=500;
 if(rows.length<60)return {enabled:false,reason:'Insufficient historical individual player coverage.',games:rows.length};
 const dates=[...new Set(rows.map(r=>r.date))].sort(),cut=dates[Math.floor(dates.length*.65)];
 const train=historical?priorRows:rows.filter(r=>r.date<cut),test=historical?rows:rows.filter(r=>r.date>=cut);
 if(train.length<35||test.length<20)return {enabled:false,reason:'Insufficient chronological player holdout.',games:test.length};
 let beta=0;
 const logit=r=>Math.log(predict(w,r.x,r.venue)/(1-predict(w,r.x,r.venue)));
 for(let i=0;i<800;i++){
  const g=mean(train.map(r=>(sig(logit(r)+beta*r.missingMinutes)-r.y)*r.missingMinutes));
  beta=Math.max(0,Math.min(2,beta-.15*(g+.08*beta)));
 }
 const base=test.map(r=>predict(w,r.x,r.venue));
 const p=test.map((r,i)=>sig(Math.log(base[i]/(1-base[i]))+beta*r.missingMinutes));
 const brier=mean(test.map((r,i)=>(p[i]-r.y)**2)),baseBrier=mean(test.map((r,i)=>(base[i]-r.y)**2));
 // Even a better retrospective conditional score is not prospective injury validation.
 return {enabled:beta>.001&&brier<baseBrier,beta,trainingGames:train.length,games:test.length,trainingThrough:train.at(-1).date,testFrom:test[0].date,testThrough:test.at(-1).date,brier,baselineBrier:baseBrier,previousSeasonTraining:historical,method:'Retrospective conditional test using explicitly listed nonparticipants and prior played-game minutes. Realized participation was not known before tipoff. Not an individual causal impact or a prospective injury forecast.'};
}
export function buildAdvanced(history,current,playerHistory,now,previousPlayerHistory=null){
 let state=blank(),historical=[],priorPlayers=[],historicalHorizons={7:[],30:[],60:[]};
 const completeHistory=history.length===2&&history.every(h=>h.games.length>=1200);
 if(completeHistory)for(const h of history){const playerMap=previousPlayerHistory?.season===h.season?new Map(previousPlayerHistory.games.map(g=>[g.id,g])):null;const z=gameRows(h.games,state,h.season,{players:playerMap});historical.push(...z.rows);for(const n of [7,30,60])historicalHorizons[n].push(...z.horizonRows[n]);priorPlayers.push(...z.playerRows);state=newSeason(state);}
 const results=gameRows(current.games,state,current.season,{today:etDay(now),players:new Map((playerHistory?.games||[]).map(g=>[g.id,g]))});
 const currentDates=[...new Set(results.rows.map(r=>r.date))].sort(),cutCurrent=currentDates[Math.floor(currentDates.length*.7)];
 const training=completeHistory?historical:results.rows.filter(r=>r.date<cutCurrent);
 const holdout=completeHistory?results.rows:results.rows.filter(r=>r.date>=cutCurrent);
 const dates=[...new Set(training.map(r=>r.date))].sort(),cut=dates[Math.floor(dates.length*.75)];
 const learn=training.filter(r=>r.date<cut),valid=training.filter(r=>r.date>=cut);
 if(learn.length<40||valid.length<20||holdout.length<25)throw Error('Insufficient chronological sample');
 const candidates=[.008,.025,.075,.15].flatMap(l=>[false,true].map(wide=>{const w=fit(learn,l,wide);return {lambda:l,wide,brier:score(valid,w).brier};})).sort((a,b)=>a.brier-b.brier);
 const chosen=candidates[0],weights=fit(training,chosen.lambda,chosen.wide),simple=fit(training,.04,false);
 const base=mean(training.filter(r=>r.venue===1).map(r=>r.y)),test=score(holdout,weights,base),simpleTest=score(holdout,simple,base);
 // The player-model holdout must follow team coefficient training when history is unavailable.
 const eligiblePlayers=completeHistory?results.playerRows:results.playerRows.filter(r=>r.date>=cutCurrent);
 const playerModel=playerFit(eligiblePlayers,weights,priorPlayers);
 const horizonModels={};
 for(const n of [7,30,60]){
  const past=historicalHorizons[n],currentRows=results.horizonRows[n];
  const old=past.filter(r=>r.date<cut),validation=past.filter(r=>r.date>=cut);
  if(old.length<100||validation.length<25)continue;
  const chosenLambda=[.008,.025,.075,.15].map(lambda=>({lambda,brier:score(validation,fit(old,lambda,true)).brier})).sort((a,b)=>a.brier-b.brier)[0].lambda;
  const historicalWeights=fit(old,chosenLambda,true),fullWeights=fit(past,chosenLambda,true);
  const historicalTest=score(validation,historicalWeights,mean(old.map(r=>r.y)));
  const currentTest=currentRows.length?score(currentRows,fullWeights,mean(past.map(r=>r.y))):null;
  horizonModels[n]={days:n,weights:fullWeights,trainingGames:past.length,historicalValidationGames:validation.length,historicalValidationBrier:historicalTest.brier,currentSeasonTest:currentTest,method:'Features frozen using games strictly before the earlier date. Rest and schedule density omitted. Hyperparameters selected only on historical dates; historical validation not an independent test. Current-season evaluation is separate.'};
 }

 const playerProfiles=Object.fromEntries(Object.entries(results.playerState).filter(([id,p])=>p.minutes.length>=3).map(([id,p])=>[id,{team:p.team,lastDate:p.lastDate,games:p.games,averageMinutes:round(mean(p.minutes)),averagePoints:round(mean(p.points)),sample:p.minutes.length}]));
 return {format:'aureum-forecast-v2',version,season:current.season,retrievedAt:now.toISOString(),sourceArchiveCollectedAt:current.retrievedAt,weights,state,todayState:results.todayState,todayDate:etDay(now),throughDate:current.games.map(g=>etDay(g.date)).sort().at(-1),horizonModels,historicalGameCount:completeHistory?sum(history.map(h=>h.games.length)):0,archiveGames:current.games.length,featureNames:names,selection:{...chosen,validationGames:valid.length,validationFrom:cut,candidates},backtest:{trainingGames:training.length,trainingThrough:training.at(-1).date,testFrom:holdout[0].date,testThrough:holdout.at(-1).date,...test,simpleBrier:simpleTest.brier,simpleAccuracy:simpleTest.accuracy,method:completeHistory?'Historical-only model selection and training, tested on current-season games with features from earlier dates only.':'Current-season chronological training, internal date-blocked model selection, and later holdout. Earlier-season source archive unavailable.'},playerModel,playerProfiles,playerCoverage:playerHistory?.games?.length||0,historicalPlayerCoverage:previousPlayerHistory?.games?.length||0,limitations:'Current-season holdout is retrospective; player model uses realized participation and prior minutes as a conditional proxy, not verified impact or a causal effect.'};
}
