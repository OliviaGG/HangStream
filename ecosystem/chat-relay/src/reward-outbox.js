const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function stableCompletionEvent(kind, game, userId, period) {
  return 'sp-' + kind + ':' + crypto.createHash('sha256').update(JSON.stringify([game,String(userId),period])).digest('hex');
}

function createRewardOutbox({ directory, send, now = Date.now }) {
  const pending = new Set(), inflight = new Map(), completionIndex = new Map();
  let timer = null, pumping = false;
  function index(record) {
    const c=record.completion;
    if(!c)return;
    const key=JSON.stringify([c.gameId,String(c.userId),c.kind]);
    if(!completionIndex.has(key))completionIndex.set(key,new Set());
    completionIndex.get(key).add(c.period);
  }
  function completedPeriods(gameId,userId,kind) {
    return [...(completionIndex.get(JSON.stringify([gameId,String(userId),kind]))||[])];
  }
  function file(eventId) {
    return path.join(directory, crypto.createHash('sha256').update(eventId).digest('hex') + '.json');
  }
  function read(eventId) {
    try { return JSON.parse(fs.readFileSync(file(eventId),'utf8')); }
    catch (error) { if(error.code === 'ENOENT') return null; throw error; }
  }
  function write(record) {
    fs.mkdirSync(directory,{recursive:true});
    const target=file(record.payload.eventId),tmp=target+'.tmp';
    const fd=fs.openSync(tmp,'w',0o600);
    try { fs.writeFileSync(fd,JSON.stringify(record));fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp,target);
    let dirFd;
    try { dirFd=fs.openSync(directory,'r');fs.fsyncSync(dirFd); }
    catch(error) { if(process.platform!=='win32') throw error; }
    finally { if(dirFd!=null)fs.closeSync(dirFd); }
    if(record.state==='pending')pending.add(record.payload.eventId);
    else pending.delete(record.payload.eventId);
    index(record);
  }
  if(fs.existsSync(directory)) {
    for(const name of fs.readdirSync(directory)) {
      if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
      const record=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
      if(!record.payload?.eventId || file(record.payload.eventId)!==path.join(directory,name))throw Error('Invalid reward outbox record');
      if(record.state==='pending')pending.add(record.payload.eventId);
      index(record);
    }
  }
  function reserve(payload, completion) {
    const old=read(payload.eventId);
    if(old) {
      if(JSON.stringify(old.payload)!==JSON.stringify(payload))throw Error('Outbox event ID reused with different data');
      return old;
    }
    const record={version:1,payload,completion,state:'pending',attempts:0,nextAttemptAt:0,createdAt:now(),updatedAt:now(),result:null,error:null};
    // The validated completion and its immutable delivery request are one fsynced record.
    write(record);
    return record;
  }
  async function attempt(eventId) {
    const record=read(eventId);
    if(!record || record.state!=='pending')return record;
    record.attempts++;record.updatedAt=now();
    record.nextAttemptAt=now()+Math.min(300000,1000*2**Math.min(record.attempts,8));
    write(record);
    try {
      const result=await send(record.payload,record.attempts);
      if(!result?.ok || result.rewardEventId!==eventId) {
        const error=Error('Reward endpoint did not confirm the durable event protocol');error.check=true;throw error;
      }
      record.state='delivered';record.result=result;record.error=null;
    } catch(error) {
      record.state=error.check?'check':error.permanent?'rejected':'pending';
      record.error=String(error.message||error).slice(0,300);
    }
    record.updatedAt=now();write(record);return record;
  }
  function deliver(eventId) {
    if(inflight.has(eventId))return inflight.get(eventId);
    const task=attempt(eventId).finally(()=>inflight.delete(eventId));
    inflight.set(eventId,task);return task;
  }
  async function pump() {
    if(pumping)return; pumping=true;
    try {
      const due=[...pending].filter(id=>(read(id)?.nextAttemptAt||0)<=now()).slice(0,8);
      await Promise.allSettled(due.map(deliver));
    } finally { pumping=false; }
  }
  function start() { if(timer)return;timer=setInterval(()=>pump().catch(error=>console.error('[RewardOutbox]',error.message)),5000);timer.unref?.(); }
  function stop() { if(timer)clearInterval(timer);timer=null; }
  function summary() {
    const counts={pending:0,delivered:0,rejected:0,check:0};const attention=[];
    if(fs.existsSync(directory))for(const name of fs.readdirSync(directory)) {
      if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
      const r=JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));counts[r.state]=(counts[r.state]||0)+1;
      if(r.state!=='delivered')attention.push({eventId:r.payload.eventId,game:r.payload.game,state:r.state,attempts:r.attempts,createdAt:r.createdAt,error:r.error});
    }
    attention.sort((a,b)=>a.createdAt-b.createdAt);
    return {ok:true,counts,attention:attention.slice(0,100)};
  }
  return { reserve,read,deliver,pump,start,stop,summary,completedPeriods };
}

function createRewardTransport({ baseUrl, apiSecret, request = fetch }) {
  async function call(url, body) {
    const response=await request(baseUrl+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-api-key':apiSecret},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok || result.ok!==true) {
      const error=Error(result.message||'Reward service HTTP '+response.status);
      error.permanent=response.status>=400&&response.status<500&&response.status!==429
        && !(url==='/api/reward/protocol' && response.status===404);throw error;
    }
    return result;
  }
  return async (payload, attempt) => {
    // A rollback to an endpoint which ignores IDs must not enable blind retries.
    const protocol=await call('/api/reward/protocol');
    if(protocol.durableEvents!==true) { const error=Error('Durable reward protocol unavailable');error.check=true;throw error; }
    if(attempt>1) {
      const status=await call('/api/reward/status/'+encodeURIComponent(payload.game)+'/'+encodeURIComponent(payload.eventId));
      if(status.found)return status.result;
    }
    return call('/api/reward',payload);
  };
}

module.exports = { createRewardOutbox,createRewardTransport,stableCompletionEvent };
