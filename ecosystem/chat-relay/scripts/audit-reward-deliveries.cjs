// Read-only inventory. Historical rows can represent paid wins or consumed losses;
// absence of a new outbox record never authorizes a retroactive award.
const fs=require('fs'),path=require('path');
const {createRewardOutbox,stableCompletionEvent}=require('../src/reward-outbox');
const root=path.join(__dirname,'..','data');
const box=createRewardOutbox({directory:path.join(root,'sp-reward-outbox'),send:()=>{throw Error('Read-only audit');}});
const file=path.join(root,'sp-daily-completions.json');
const completions=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
const legacy={};let withoutDelivery=0;
for(const [key,users] of Object.entries(completions)) {
 const kind=key.endsWith('-weekly')?'weekly':'daily';
 const rawGame=key.replace(/-weekly$/,'');const game=rawGame==='sproutle-sp'?'erectangled-sp':rawGame;
 for(const [userId,periods] of Object.entries(users))for(const period of periods) {
  if(!box.read(stableCompletionEvent(kind,game,userId,period))) {legacy[key]=(legacy[key]||0)+1;withoutDelivery++;}
 }
}
console.log(JSON.stringify({outbox:box.summary(),historicalCompletionRowsWithoutDelivery:withoutDelivery,byGame:legacy,
  note:'Historical rows include paid wins and consumed losses. Check canonical completions and ledger evidence before any manual reconciliation.'},null,2));
