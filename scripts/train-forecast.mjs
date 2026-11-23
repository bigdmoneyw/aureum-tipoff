import fs from 'node:fs';
import {buildForecast,etDay} from './forecast-core.mjs';
import {regularSeasonOnly} from './forecast-integrity.mjs';
const now=new Date(),day=etDay(now),year=+day.slice(0,4),month=+day.slice(5,7),season=month>=10?year+1:year;
const archive=regularSeasonOnly(JSON.parse(fs.readFileSync('data/completed-games-'+season+'.json','utf8')));
if(archive.format!=='aureum-completed-games-v1'||archive.season!==season||archive.count!==archive.games.length)throw Error('Invalid source archive');
const data=buildForecast(archive,now);
fs.writeFileSync('data/forecast-'+season+'.json',JSON.stringify(data,null,2)+'\n');
console.log('FORECAST_VALIDATION '+JSON.stringify({season,archiveGames:data.archiveGames,weights:data.weights,backtest:data.backtest}));
