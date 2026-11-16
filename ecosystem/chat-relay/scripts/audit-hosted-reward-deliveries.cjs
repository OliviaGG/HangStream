// Read-only hosted claim inventory; no DB mutation, worker startup or reward HTTP.
const path=require('path');
const {createRewardOutbox}=require('../src/reward-outbox');
const directory=path.join(__dirname,'..','data','hosted-reward-outbox');
const box=createRewardOutbox({directory,send:()=>{throw Error('Read-only audit');}});
console.log(JSON.stringify({readOnly:true,...box.summary(),note:'Only newly reserved JunkDrawer, CloudQuarry and Synapse daily claims use this queue. Historical score rows without claims must be reconciled against the economy ledger before any manual award.'},null,2));
