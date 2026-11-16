'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
function edmontonDate(value=Date.now()){const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
function createDailyRoundStore({file,getCurrentDate=()=>edmontonDate()}={}){
 let dates=[];
 if(fs.existsSync(file)){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(saved.version!==1||!Array.isArray(saved.consumedDates)||saved.consumedDates.length>32||saved.consumedDates.some(date=>!validDate(date)))throw Error('Daily round consumption invalid');dates=[...new Set(saved.consumedDates)].sort();}
 function persist(next){
  fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp-'+crypto.randomUUID();let fd;
  try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({version:1,consumedDates:next}));fs.fsyncSync(fd);fs.closeSync(fd);fd=null;fs.renameSync(temp,file);
   if(process.platform!=='win32'){const directory=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(directory);}finally{fs.closeSync(directory);}}
  }finally{if(fd!==null&&fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
  dates=next;
 }
 function consume(date){if(!validDate(date)||date!==getCurrentDate())throw Error('Stale daily round period');if(dates.includes(date))return false;persist([...dates,date].sort().slice(-14));return true;}
 function reset(date=getCurrentDate()){if(!validDate(date))throw Error('Invalid daily reset period');persist(dates.filter(value=>value!==date));}
 function migrateLegacy({played,date,startedAt}={}){
  const period=validDate(date)?date:(typeof startedAt==='string'||typeof startedAt==='number')?edmontonDate(startedAt):null;
  if(played===true&&period===getCurrentDate()&&!dates.includes(period))consume(period);
  return dates.includes(getCurrentDate());
 }
 return {has:date=>validDate(date)&&dates.includes(date),consume,reset,migrateLegacy,currentDate:getCurrentDate,lastDate:()=>dates.at(-1)||null,summary:()=>({retainedPeriods:dates.length,currentConsumed:dates.includes(getCurrentDate())})};
}
module.exports={createDailyRoundStore,validDate,edmontonDate};
