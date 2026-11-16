// Read-only queue inventory. Does not start workers or send reward requests.
const path=require('path');
const {createRewardOutbox}=require('../src/reward-outbox');
const projects=process.argv.slice(2);
const roots=projects.length?projects:['/opt/word500','/opt/pixeletters','/opt/spellingbee','/opt/wordle','/opt/searchle','/opt/rectangled','/opt/betwixt','/opt/figural','/opt/unwordle','/opt/triangled','/opt/sproutle','/opt/wikisearchle','/opt/wikirectangled','/opt/colour500'];
const games=roots.map(root=>({project:path.resolve(root),...createRewardOutbox({directory:path.join(root,'data','reward-outbox'),send:()=>{throw Error('Read-only inventory');}}).summary()}));
console.log(JSON.stringify({readOnly:true,games,note:'IDs created by game-shared are stable per invocation. Caller-owned action IDs are required to deduplicate separate invocations of the same game action. Existing ambiguous completion claims require ledger review.'},null,2));
