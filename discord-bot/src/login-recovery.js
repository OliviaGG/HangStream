'use strict';
function transient(error) {
 const code=String(error?.code||error?.cause?.code||'').toUpperCase(),message=String(error?.message||'').toLowerCase();
 if (/TOKEN_INVALID|TOKENINVALID|DISALLOWEDINTENTS/.test(code)||['4004','4013','4014'].includes(code)||/invalid token|disallowed intents/.test(message))return false;
 return /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|UND_ERR_)/.test(code)||error?.name==='AbortError'||error?.name==='TimeoutError'||error?.status===429||error?.status>=500;
}
function createLoginRecovery({login,onFatal,onRetry=()=>{},now=Date.now,schedule=setTimeout,cancel=clearTimeout}) {
 let stopped=false,timer=null,inflight=null,failures=0,retryAt=0;
 function attempt() {
  if(stopped)return Promise.resolve();if(inflight)return inflight;
  inflight=Promise.resolve().then(login).then(()=>{failures=0;retryAt=0;},error=>{
   if(!transient(error))throw error;
   if(stopped)return;
   failures++;const delay=Math.min(300000,5000*2**Math.min(failures-1,6));retryAt=now()+delay;onRetry();
   timer=schedule(()=>{timer=null;attempt().catch(onFatal);},delay);timer.unref?.();
  }).finally(()=>{inflight=null;});return inflight;
 }
 return {start:attempt,stop(){stopped=true;if(timer)cancel(timer);timer=null;},summary(){return {failures,retryAt,waiting:!!timer}}};
}
module.exports={transient,createLoginRecovery};
