(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.JunkDrawerMeta=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PROFILE_VERSION='v1';
const LEVELS = [   // goals calibrated to ITEM_SCALE 1.40 (~5-7 min runs; sim-tuned 2026-07-12).
                   // Create-goals stop at sneaker — with bigger items, headphones+
                   // become once-in-many-runs discoveries, not progression gates.
  { goal: { type: 'create', tier: 3 },  reward: 100 },  // sunglasses
  { goal: { type: 'score', n: 800 },    reward: 150 },
  { goal: { type: 'create', tier: 5 },  reward: 200 },  // wallet
  { goal: { type: 'merges', n: 20 },    reward: 250 },
  { goal: { type: 'create', tier: 6 },  reward: 300 },  // phone
  { goal: { type: 'score', n: 2500 },   reward: 350 },
  { goal: { type: 'create', tier: 9 },  reward: 450 },  // sneaker
  { goal: { type: 'combo', n: 4 },      reward: 500 },
  { goal: { type: 'score', n: 4500 },   reward: 600 },
  { goal: { type: 'merges', n: 150 },   reward: 700 },
  { goal: { type: 'score', n: 6000 },   reward: 850 },
  { goal: { type: 'score', n: 8000 },   reward: 1500 }, // elite final run
];
const ROOM_SPOTS = [
  { id: 'sofa',       name: 'Sofa',       emoji: '🛋️', cost: 100 },
  { id: 'lamp',       name: 'Lamp',       emoji: '💡', cost: 150 },
  { id: 'rug',        name: 'Rug',        emoji: '🧶', cost: 200 },
  { id: 'shelf',      name: 'Bookshelf',  emoji: '📚', cost: 250 },
  { id: 'plant',      name: 'Plant',      emoji: '🪴', cost: 300 },
  { id: 'table',      name: 'Table',      emoji: '🪑', cost: 400 },
  { id: 'window',     name: 'Window',     emoji: '🪟', cost: 500 },
  { id: 'painting',   name: 'Painting',   emoji: '🖼️', cost: 650 },
  { id: 'clock',      name: 'Clock',      emoji: '🕰️', cost: 800 },
  { id: 'chandelier', name: 'Chandelier', emoji: '🕯️', cost: 1000 },
];
const RUN_COIN_DIVISOR = 12, RUN_COIN_CAP = 400;  // 20→12 with 1.40 sizes: shorter runs, same coins/min
const DAILY_BONUS = 250, DAILY_STREAK_STEP = 25, DAILY_STREAK_CAP = 250;
const DISCOVERY_BONUS = 30;


function freshProfile(){return {coins:0,level:1,cleaned:[],found:[0],streak:0,lastDaily:'',stats:{games:0,merges:0,best:0,tv:0},_revision:0};}
function readProfile(value){
  const p=Object.assign(freshProfile(),value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):{});
  for(const field of ['coins','level','streak','_revision'])if(!Number.isSafeInteger(p[field])||p[field]<0)p[field]=field==='level'?1:0;
  if(p.level<1)p.level=1;
  if(!Array.isArray(p.cleaned))p.cleaned=[];if(!Array.isArray(p.found))p.found=[0];
  p.stats=Object.assign(freshProfile().stats,p.stats&&typeof p.stats==='object'?p.stats:{});
  for(const field of ['games','merges','best','tv'])if(!Number.isSafeInteger(p.stats[field])||p.stats[field]<0)p.stats[field]=0;
  if(typeof p.lastDaily!=='string')p.lastDaily='';return p;
}
function add(a,b){const n=a+b;if(!Number.isSafeInteger(n)||n<0)throw Error('Profile integer limit');return n;}
function previousDay(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);}
function earn(value,run,result){
  const profile=readProfile(value),found=new Set(profile.found);
  let coinsEarned=Math.min(RUN_COIN_CAP,Math.floor(result.score/RUN_COIN_DIVISOR)),levelAdvanced=false;
  for(const tier of result.discovered)if(!found.has(tier)){found.add(tier);coinsEarned+=DISCOVERY_BONUS;}
  profile.found=[...found].sort((a,b)=>a-b);
  if(run.mode==='daily'&&result.score>0&&profile.lastDaily!==run.day){
    profile.streak=profile.lastDaily===previousDay(run.day)?add(profile.streak,1):1;
    profile.lastDaily=run.day;coinsEarned+=DAILY_BONUS+Math.min(DAILY_STREAK_CAP,DAILY_STREAK_STEP*(profile.streak-1));
  }
  if(run.mode==='level'&&result.levelCleared&&profile.level===run.level){
    const index=Math.min(profile.level,LEVELS.length)-1;coinsEarned+=LEVELS[index].reward;
    if(profile.level<=LEVELS.length){profile.level=add(profile.level,1);levelAdvanced=true;}
  }
  profile.coins=add(profile.coins,coinsEarned);profile.stats.games=add(profile.stats.games,1);
  profile.stats.merges=add(profile.stats.merges,result.merges);profile.stats.best=Math.max(profile.stats.best,result.score);
  profile.stats.tv=add(profile.stats.tv,result.tvBuilt);
  return {profile,outcome:{coinsEarned,levelAdvanced,levelCleared:!!result.levelCleared}};
}
function clean(value,spotId){
  const profile=readProfile(value),spot=ROOM_SPOTS.find(s=>s.id===spotId);
  if(!spot)throw Object.assign(Error('Unknown house spot'),{code:'bad-spot'});
  if(profile.cleaned.includes(spotId))return {profile,outcome:{coinsSpent:0,alreadyCleaned:true}};
  if(profile.coins<spot.cost)throw Object.assign(Error('Insufficient Junk Coins'),{code:'insufficient-coins'});
  profile.coins-=spot.cost;profile.cleaned.push(spotId);return {profile,outcome:{coinsSpent:spot.cost,alreadyCleaned:false}};
}
return {PROFILE_VERSION,LEVELS,ROOM_SPOTS,freshProfile,readProfile,earn,clean};
});
