'use strict';
const crypto=require('node:crypto');
// A scoped Subtextle service can hand off its previously persisted decision
// after rollover. Browser claims retain the current-period requirement.
function isOwnedSoloCompletion({authorized,gameId,userId,kind,period,decision,now=Date.now()}){
 if(!authorized||gameId!=='searchle-sp'||!decision||decision.version!==1||decision.kind!==kind||decision.userId!==userId||decision.period!==period||
  !['daily','weekly'].includes(kind)||!['en','pt-br'].includes(decision.language)||typeof decision.gameId!=='string'||!decision.gameId||decision.gameId.length>160||
  !Number.isSafeInteger(decision.acceptedAt)||decision.acceptedAt<0||decision.acceptedAt>now+30000||!/^\d{4}-\d{2}-\d{2}$/.test(period)||
  !Number.isFinite(Date.parse(period+'T12:00:00Z'))||new Date(period+'T12:00:00Z').toISOString().slice(0,10)!==period)return false;
 const edmontonDate=time=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
 if(period>edmontonDate(now)||period>edmontonDate(decision.acceptedAt)||(kind==='weekly'&&new Date(period+'T12:00:00Z').getUTCDay()!==1))return false;
 const id=crypto.createHash('sha256').update(JSON.stringify([userId,kind,period,decision.language])).digest('hex');
 return decision.id===id;
}
module.exports={isOwnedSoloCompletion};
