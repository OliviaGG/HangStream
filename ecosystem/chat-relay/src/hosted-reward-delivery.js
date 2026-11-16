'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {createRewardOutbox,createRewardTransport}=require('./reward-outbox');
const MODELS={
 junkdrawer:{table:'junkdrawer_scores',upsert:'upsertJunkdrawerScore'},
 cloudquarry:{table:'cloudquarry_scores',upsert:'upsertCloudQuarryScore'},
 synapse:{table:'synapse_scores',upsert:'upsertSynapseScore'}
};
function hostedEventId(game,userId,period){return 'hosted-daily:'+crypto.createHash('sha256').update(JSON.stringify([game,String(userId),period])).digest('hex');}
function createHostedRewardDelivery({directory,db,baseUrl,apiSecret,request,send,now}){
 const box=createRewardOutbox({directory,send:send||createRewardTransport({baseUrl,apiSecret,request}),...(now?{now}:{})});
 const reconcile=new Set();let timer=null,pumping=false;
 function synchronize(record){
  const model=MODELS[record.payload.game],score=record.completion?.score;
  if(!model||!score)return;
  const xp=record.state==='delivered'?record.payload.xp:0;
  db[model.upsert]({...score,xpAwarded:xp});
  // Score upserts intentionally preserve the first reward column. Correct it
  // only from this durable claim's terminal delivery state, never a client flag.
  if(record.state==='delivered'){
   db.setHostedDailyXp(record.payload.game, String(score.userId), score.day, xp);
  }
 }
 function prepare({game,userId,period,xp,score,alreadyCompleted,durationSeconds}){
  if(!Object.hasOwn(MODELS,game))throw Error('Unsupported hosted daily game');
  const eventId=hostedEventId(game,userId,period),old=box.read(eventId);
  if(old){synchronize(old);return{eventId,fresh:false,record:old};}
  // A historical score may already have been paid; no automatic backfill.
  if(alreadyCompleted)return null;
  const payload=JSON.parse(JSON.stringify({platform:'discord',userId:String(userId),username:String(userId),xp,
   game,event:'win',eventId,rewardPeriod:period,...(durationSeconds!=null?{durationSeconds}:{})}));
  const record=box.reserve(payload,{gameId:game,userId:String(userId),period,kind:'hosted-daily',score:JSON.parse(JSON.stringify(score))});
  reconcile.add(eventId);synchronize(record);return{eventId,fresh:true,record};
 }
 async function deliver(claim){
  if(!claim)return{xpAwarded:0,rewardPending:false};
  const record=await box.deliver(claim.eventId);synchronize(record);
  if(record.state!=='pending')reconcile.delete(claim.eventId);
  return{xpAwarded:claim.fresh&&record.state==='delivered'?record.payload.xp:0,
   rewardPending:record.state!=='delivered',rewardEventId:claim.eventId};
 }
 async function pump(){
  if(pumping)return;pumping=true;
  try{
   await box.pump();
   for(const eventId of reconcile){const record=box.read(eventId);if(record.state!=='pending'){synchronize(record);reconcile.delete(eventId);}}
  }finally{pumping=false;}
 }
 function start(){
  if(timer)return;
  if(fs.existsSync(directory))for(const name of fs.readdirSync(directory)){
   if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
   const record=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));synchronize(record);
   if(record.state==='pending')reconcile.add(record.payload.eventId);
  }
  timer=setInterval(()=>pump().catch(error=>console.error('[HostedRewards]',error.message)),5000);timer.unref?.();
  console.log('[HostedRewards] Durable daily delivery enabled');
 }
 function stop(){if(timer)clearInterval(timer);timer=null;}
 return{prepare,deliver,pump,start,stop,summary:box.summary,read:box.read};
}
module.exports={createHostedRewardDelivery,hostedEventId};
