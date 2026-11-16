'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const meta=require('../public/js/junkdrawer-meta');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function createProfileActions({directory,db}){
 let recoveryBlocked=false;
 const eventId=(userId,kind,key)=>'junkdrawer-profile:'+hash([String(userId),kind,key]);
 const file=id=>path.join(directory,hash(id)+'.json');
 function validate(record,name){
  const {recordHash,...payload}=record;
  if(hash(payload)!==recordHash||record.eventId!==eventId(record.userId,record.kind,record.key)||path.basename(file(record.eventId))!==name||
     !['run','clean'].includes(record.kind)||!Number.isSafeInteger(record.oldRevision)||record.oldRevision<0||record.profile?._revision!==record.oldRevision+1)
   throw Error('Invalid profile recovery input');
  return record;
 }
 function write(record){
  fs.mkdirSync(directory,{recursive:true});const target=file(record.eventId),temporary=target+'.tmp';
  const fd=fs.openSync(temporary,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temporary,target);
  if(process.platform!=='win32'){const dir=fs.openSync(directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 }
 function commit(record){
  const result=db.commitJunkdrawerProfileRecord(record);
  // The receipt/profile DB snapshot is durable before removing this recovery
  // input. Failure to remove it is harmless: recovery checks the receipt.
  try{fs.unlinkSync(file(record.eventId));}catch(error){if(error.code!=='ENOENT')console.error('[JunkDrawerProfile] Journal cleanup deferred');}
  return result;
 }
 function apply(userId,kind,key,transform){
  if(recoveryBlocked)throw Object.assign(Error('Profile recovery requires review'),{retryable:true});
  userId=String(userId);const id=eventId(userId,kind,key),target=file(id);
  if(fs.existsSync(target)){
   let record;
   try{record=validate(JSON.parse(fs.readFileSync(target,'utf8')),path.basename(target));}
   catch{recoveryBlocked=true;throw Object.assign(Error('Profile recovery requires review'),{retryable:true});}
   if(record.eventId!==id||record.userId!==userId||record.kind!==kind||record.key!==key)throw Error('Profile journal mismatch');
   return commit(record);
  }
  const prior=db.getJunkdrawerProfileReceipt(id);
  if(prior)return {fresh:false,profile:meta.readProfile(db.getJunkdrawerProfile(userId)),outcome:JSON.parse(prior.outcome)};
  // Finish any earlier accepted action before calculating this account's next
  // revision. A failed SQL apply must not let a different action overtake it.
  if(fs.existsSync(directory)){
   let pending;
   try{pending=fs.readdirSync(directory).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>
    validate(JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')),name)).filter(record=>record.userId===userId).sort((a,b)=>a.oldRevision-b.oldRevision);}
   catch{recoveryBlocked=true;throw Object.assign(Error('Profile recovery requires review'),{retryable:true});}
   for(const record of pending)commit(record);
  }
  const current=meta.readProfile(db.getJunkdrawerProfile(userId)),{profile,outcome}=transform(current);
  if(current._revision>=Number.MAX_SAFE_INTEGER)throw Error('Profile revision limit');
  profile._revision=current._revision+1;
  const record={eventId:id,userId,kind,key,oldRevision:current._revision,profile,outcome};
  record.recordHash=hash(record);write(record);return commit(record);
 }
 function recover(){
  if(!fs.existsSync(directory))return {pending:0,recovered:0};
  let records;
  try { records=fs.readdirSync(directory).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)).map(name=>{
   return validate(JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')),name);
  }).sort((a,b)=>a.userId.localeCompare(b.userId)||a.oldRevision-b.oldRevision); }
  catch { recoveryBlocked=true;console.error('[JunkDrawerProfile] Invalid recovery input; profile writes paused');return {pending:1,recovered:0,needsReview:true}; }
  let recovered=0;
  try{for(const record of records){commit(record);recovered++;}}
  catch{recoveryBlocked=true;console.error('[JunkDrawerProfile] Recovery incomplete; profile writes paused');return {pending:records.length-recovered,recovered,needsReview:true};}
  recoveryBlocked=false;
  return {pending:0,recovered};
 }
 return {get:userId=>meta.readProfile(db.getJunkdrawerProfile(String(userId))),
  earn:(userId,token,run,result)=>apply(userId,'run',token,profile=>meta.earn(profile,run,result)),
  clean:(userId,spotId)=>apply(userId,'clean',spotId,profile=>meta.clean(profile,spotId)),recover,writable:()=>!recoveryBlocked};
}
module.exports={createProfileActions};
