'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const core = require('../public/js/junkdrawer-core');
if (!isMainThread) {
  try { parentPort.postMessage({ result: core.replay(workerData.mode, workerData.seed, workerData.day, workerData.transcript, workerData.level) }); }
  catch { parentPort.postMessage({ invalid: true }); }
} else {
  function createReplayValidator({ maxActive = 2, maxQueued = 8, timeoutMs = 15000 } = {}) {
    const queue = []; let active = 0;
    const unavailable = () => Object.assign(Error('Replay capacity unavailable'), { retryable: true });
    function pump() {
      while (active < maxActive && queue.length) {
        const job=queue.shift(); active++;
        let worker, timer, settled=false;
        function finish(error,result) {
          if(settled)return;settled=true;clearTimeout(timer);
          // Keep the slot until termination completes; timeouts cannot create
          // an unbounded number of lingering simulation workers.
          Promise.resolve(worker?.terminate()).finally(()=>{
            active--;if(error)job.reject(error);else job.resolve(result);pump();
          });
        }
        try {
          worker=new Worker(__filename,{workerData:job.data,resourceLimits:{maxOldGenerationSizeMb:96}});
          timer=setTimeout(()=>finish(unavailable()),timeoutMs);
          worker.once('message',message=>message.invalid?finish(Object.assign(Error('Invalid replay'),{invalid:true})):finish(null,message.result));
          worker.once('error',()=>finish(unavailable()));
          worker.once('exit',()=>{if(!settled)finish(unavailable());});
        } catch { finish(unavailable()); }
      }
    }
    return function verify(mode,seed,day,transcript,level=1) {
      try { core.validate(transcript); } catch { return Promise.reject(Object.assign(Error('Invalid transcript'),{invalid:true})); }
      if(active>=maxActive && queue.length>=maxQueued)return Promise.reject(unavailable());
      // Clone immediately: callers cannot alter the queued authoritative input.
      const data={mode,seed,day,level,transcript:JSON.parse(JSON.stringify(transcript))};
      return new Promise((resolve,reject)=>{queue.push({data,resolve,reject});pump();});
    };
  }
  module.exports={createReplayValidator};
}
