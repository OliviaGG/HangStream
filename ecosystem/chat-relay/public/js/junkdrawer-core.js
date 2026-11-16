/* JunkDrawer v3 authoritative simulation. Shape/material/merge rules are
 * extracted from the canonical game; rendering and profile ownership stay
 * in its page. Bundled Matter.js remains MIT licensed, version 0.19.0. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./junkdrawer-matter'),require('./junkdrawer-meta'));
  else root.JunkDrawerCore=factory(root.Matter,root.JunkDrawerMeta);
})(typeof globalThis!=='undefined'?globalThis:this,function(Matter,Meta){
'use strict';
const VERSION='v3', STEP_MS=1000/60, MAX_TICKS=108000, MAX_EVENTS=24000;
const W=640,H=900,FLOOR_Y=878,WALL_PAD=10,DANGER_Y=158,HOLD_Y=92;
const PHYS={restitution:0.08,friction:0.5,frictionStatic:0.8,frictionAir:0.012,density:0.0022};
const {Engine,Bodies,Body,Composite,Events,Vertices,Common}=Matter;
const DROP_WEIGHTS=[30,25,20,15,10],TV_MERGE_BONUS=500;
const SPIN_MS=8000,SPIN_TURNS=2;
const TIER_WEIGHT=[1.30,1.25,0.65,0.75,1.15,1.00,1.15,4.50,1.10,0.75,0.80,1.20,0.90,1.10];
function fnv1a(str){let h=0x811c9dc5;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const TIERS = [
{name:'Ring',score:2,bb:{x0:-20,y0:-26,x1:20,y1:27},build:(x,y)=>[
    Bodies.circle(x, y+7, 19, PHYS),
    Bodies.circle(x, y-16, 9, PHYS),
  ]},
{name:'Key',score:3,bb:{x0:-52,y0:-21,x1:44,y1:25},build:(x,y)=>[
    Bodies.circle(x-31, y, 20, PHYS),
    Bodies.rectangle(x+14, y, 52, 16, { ...PHYS, chamfer:{radius:5} }),
    Bodies.rectangle(x+36, y+14, 10, 16, { ...PHYS, chamfer:{radius:2} }),
    Bodies.rectangle(x+20, y+15, 10, 18, { ...PHYS, chamfer:{radius:2} }),
  ]},
{name:'Pencil',score:5,bb:{x0:-40,y0:-9,x1:37,y1:9},build:(x,y)=>[
    Bodies.rectangle(x-2, y, 66, 15, { ...PHYS, chamfer:{radius:6} }),
  ]},
{name:'Sunglasses',score:12,bb:{x0:-62,y0:-22,x1:62,y1:33},build:(x,y)=>[
    Bodies.circle(x-33, y+4, 28, PHYS),
    Bodies.circle(x+33, y+4, 28, PHYS),
    Bodies.rectangle(x, y-6, 26, 10, { ...PHYS, chamfer:{radius:3} }),
    Bodies.rectangle(x, y-16, 122, 10, { ...PHYS, chamfer:{radius:4} }),
  ]},
{name:'Coke Can',score:18,bb:{x0:-27,y0:-52,x1:27,y1:52},build:(x,y)=>[
    Bodies.rectangle(x, y, 50, 100, { ...PHYS, chamfer:{radius:16} }),
  ]},
{name:'Wallet',score:22,bb:{x0:-55,y0:-51,x1:55,y1:41},build:(x,y)=>[
    Bodies.rectangle(x, y, 108, 80, { ...PHYS, chamfer:{radius:14} }),
    Bodies.circle(x, y-41, 9, PHYS),
  ]},
{name:'Phone',score:26,bb:{x0:-43,y0:-77,x1:43,y1:77},build:(x,y)=>[
    Bodies.rectangle(x, y, 84, 152, { ...PHYS, chamfer:{radius:16} }),
  ]},
{name:'Dumbbell',score:31,bb:{x0:-74,y0:-28,x1:74,y1:28},build:(x,y)=>[
    Bodies.circle(x-46, y, 26, PHYS),
    Bodies.circle(x+46, y, 26, PHYS),
    Bodies.rectangle(x, y, 70, 18, { ...PHYS, chamfer:{radius:4} }),
  ]},
{name:'Deodorant',score:33,bb:{x0:-27,y0:-45,x1:27,y1:47},build:(x,y)=>[
    Bodies.rectangle(x, y+14, 52, 64, { ...PHYS, chamfer:{radius:10} }),
    Bodies.rectangle(x, y-31, 42, 26, { ...PHYS, chamfer:{radius:8} }),
  ]},
{name:'Sneaker',score:36,bb:{x0:-96,y0:-56,x1:96,y1:60},build:(x,y)=>{
    const upper = [[-90,29],[-90,-34],[-20,-34],[95,12],[95,29]]
      .map(p => ({ x:x+p[0], y:y+p[1] }));
    return [
      Bodies.rectangle(x, y+44, 190, 30, { ...PHYS, chamfer:{radius:12} }),
      Bodies.fromVertices(x + Vertices.centre(upper).x - x, y + Vertices.centre(upper).y - y, [upper], PHYS),
      Bodies.rectangle(x-58, y-42, 54, 24, { ...PHYS, chamfer:{radius:8} }),
    ];
  }},
{name:'Headphones',score:48,bb:{x0:-104,y0:-86,x1:104,y1:84},build:(x,y)=>[
    Bodies.circle(x-62, y+42, 40, PHYS),
    Bodies.circle(x+62, y+42, 40, PHYS),
    Bodies.rectangle(x-64, y-34, 16, 66, { ...PHYS, chamfer:{radius:6} }),
    Bodies.rectangle(x+64, y-34, 16, 66, { ...PHYS, chamfer:{radius:6} }),
    Bodies.rectangle(x, y-72, 116, 16, { ...PHYS, chamfer:{radius:7} }),
  ]},
{name:'Laptop',score:62,bb:{x0:-125,y0:-78,x1:125,y1:88},build:(x,y)=>[
    Bodies.rectangle(x, y-12, 232, 130, { ...PHYS, chamfer:{radius:10} }),
    Bodies.rectangle(x, y+72, 248, 30, { ...PHYS, chamfer:{radius:10} }),
  ]},
{name:'Backpack',score:80,bb:{x0:-116,y0:-149,x1:116,y1:147},build:(x,y)=>[
    Bodies.rectangle(x, y+10, 230, 270, { ...PHYS, chamfer:{radius:40} }),
    Bodies.rectangle(x, y-135, 80, 24, { ...PHYS, chamfer:{radius:10} }),
  ]},
{name:'Big TV',score:200,bb:{x0:-166,y0:-131,x1:166,y1:118},build:(x,y)=>[
    Bodies.rectangle(x, y-30, 330, 200, { ...PHYS, chamfer:{radius:12} }),
    Bodies.rectangle(x, y+76, 40, 26, PHYS),
    Bodies.rectangle(x, y+98, 150, 18, { ...PHYS, chamfer:{radius:8} }),
  ]}
];
const ITEM_SCALE = 1.40;   // global base size (1.19 → 1.40 for ~5-7 min games; sim-tuned 2026-07-12)
// per-tier EXTRA size on top of ITEM_SCALE. number = uniform; {sx,sy} = per-axis
// (pencil is stretched length-only). Physics hull + art scale together.
const TIER_SIZE = [
  1,               // 0 ring
  1,               // 1 key
  { sx: 1.85, sy: 1 }, // 2 pencil — double the length, same thickness
  1.10,            // 3 sunglasses — 10% larger
  1,               // 4 coke
  1,               // 5 wallet
  1,               // 6 phone
  1.30,            // 7 dumbbell — ~40% larger than the rest
  2.0,             // 8 deodorant (pill bottle) — 2× larger, size-matched here
  1,               // 9 sneaker
  1,               // 10 headphones
  1,               // 11 laptop
  1,               // 12 backpack
  1,               // 13 Big TV
];
function tierScale(tier) {
  const s = TIER_SIZE[tier];
  if (s == null) return { sx: 1, sy: 1 };
  return (typeof s === 'number') ? { sx: s, sy: s } : { sx: s.sx || 1, sy: s.sy || 1 };
}

// probe bodies: centre of mass offset (compound bodies rotate about it)
TIERS.forEach((t, ti) => {
  const parts = t.build(0, 0);
  const probe = parts.length > 1 ? Body.create({ parts }) : parts[0];
  t.com = { x: probe.position.x, y: probe.position.y };
  const { sx, sy } = tierScale(ti);
  t.halfW = Math.max(Math.abs(t.bb.x0), Math.abs(t.bb.x1)) * ITEM_SCALE * sx;
  t.maxY = t.bb.y1 * ITEM_SCALE * sy;
  // reach = farthest bbox corner from the COM (the rotation pivot). Since
  // the held item spins, clamping the drop position by reach keeps it
  // inside the walls at ANY angle. Uses the widest per-axis scale.
  const cx0 = t.bb.x0 - t.com.x, cx1 = t.bb.x1 - t.com.x;
  const cy0 = t.bb.y0 - t.com.y, cy1 = t.bb.y1 - t.com.y;
  t.reach = Math.max(
    Math.hypot(cx0 * sx, cy0 * sy), Math.hypot(cx1 * sx, cy0 * sy),
    Math.hypot(cx1 * sx, cy1 * sy), Math.hypot(cx0 * sx, cy1 * sy)) * ITEM_SCALE;
});


const MAX_TIER=TIERS.length-1,COKE_TIER=TIERS.findIndex(t=>t.name==='Coke Can'),EXPLODE_FORCE=1300;
function create(mode,seed,day,level=1){
  if(!['daily','endless','level'].includes(mode)||typeof seed!=='string'||typeof day!=='string')throw Error('Bad run');
  // Matter allocates global IDs/RNG even for render colors. Keep them per
  // simulation, including subsequent merge bodies, without changing another
  // game instance or the page's local level/gift world.
  let nextId=0,matterSeed=0;
  function isolated(fn){const oldId=Common._nextId,oldSeed=Common._seed;Common._nextId=nextId;Common._seed=matterSeed;
    try{return fn();}finally{nextId=Common._nextId;matterSeed=Common._seed;Common._nextId=oldId;Common._seed=oldSeed;}}
  let engine,score=0,merges=0,biggestTier=0,tick=0,gameOver=false,canDrop=true,holdX=W/2,holdAngle=0;
  let currentTier=0,nextTier=0,holdStartTick=0,readyTick=0,overflowMs=0,combo=0,lastMergeAt=0,shake=0,maxCombo=0,tvBuilt=0,levelCleared=false;
  const discovered=new Set([0]),mergeQueue=[],explodeQueue=[],effects=[];
  const runDay=day,dropRng=mulberry32(fnv1a(seed)),mergeRng=mulberry32(fnv1a('junkdrawer-merge:'+seed));
  const now=()=>tick*STEP_MS,clockMs=now;
  const sfx={big(){},merge(){}},refreshChain=()=>{},refreshHUD=()=>{},floatText=()=>{};
  const goal=Meta.LEVELS[Math.min(Math.max(1,level),Meta.LEVELS.length)-1].goal;
  function checkLevelGoal(created){
    if(mode!=='level'||levelCleared)return;
    levelCleared=(goal.type==='create'&&created!=null&&created>=goal.tier)||
      (goal.type==='score'&&score>=goal.n)||(goal.type==='merges'&&merges>=goal.n)||(goal.type==='combo'&&combo>=goal.n);
  }
  function burst(x,y,tier,count){effects.push({x,y,tier,count});}
  function randDropTier(){let roll=dropRng()*100;for(let i=0;i<DROP_WEIGHTS.length;i++){roll-=DROP_WEIGHTS[i];if(roll<=0)return i;}return 0;}
function makeItem(tier, x, y) {
  const t = TIERS[tier];
  const parts = t.build(x, y);
  const b = parts.length > 1 ? Body.create({ parts, ...PHYS }) : parts[0];
  // scale about the centre of mass — matches the renderer, which scales
  // the sprite about t.com (per-axis so the pencil can stretch length-only)
  const { sx, sy } = tierScale(tier);
  Body.scale(b, ITEM_SCALE * sx, ITEM_SCALE * sy);
  // per-tier weight: recompute mass from the shared base density × multiplier
  Body.setDensity(b, PHYS.density * (TIER_WEIGHT[tier] || 1));
  b.plugin = { tier, born: now(), spawnT: 0, merged: false };
  return b;
}

const DAILY_BIG_TIERS = [5, 9, 10];   // wallet, sneaker, headphones (avoid coke/dumbbell/pill)
const DAILY_BIG_COUNT = 3;            // feature pieces resting on the floor
const DAILY_SMALL_COLS = 4;
const DAILY_SMALL_ROW_H = 90;
const DAILY_SMALL_ROWS = [            // small clutter piled above the base
  { p: 1.00, maxTier: 5 },           // ring..wallet (COKE_TIER is skipped below — cans explode)
  { p: 1.00, maxTier: 3 },
  { p: 1.00, maxTier: 3 },
  { p: 0.90, maxTier: 2 },
];
function fillDailyDrawer() {
  const rng = mulberry32(fnv1a('junkdrawer-fill:' + runDay));
  const now = clockMs();
  const addFill = (tier, x, y) => {
    const r = TIERS[tier].reach;
    const cx = Math.max(WALL_PAD + r + 2, Math.min(W - WALL_PAD - r - 2, x));
    const b = makeItem(tier, cx, y);
    b.plugin.born = now;
    b.plugin.fill = true;
    Composite.add(engine.world, b);
  };
  // 1) big feature pieces resting on the floor, evenly spread (no two the
  //    same in a row so they read as varied junk)
  const slotW = (W - WALL_PAD * 2) / DAILY_BIG_COUNT;
  let prevBig = -1;
  for (let i = 0; i < DAILY_BIG_COUNT; i++) {
    let pool = DAILY_BIG_TIERS.filter(t => t !== prevBig);
    const tier = pool[Math.floor(rng() * pool.length)];
    prevBig = tier;
    const x = WALL_PAD + slotW * (i + 0.5) + (rng() - 0.5) * 16;
    addFill(tier, x, FLOOR_Y - TIERS[tier].maxY - 4);   // rest bottom on floor
  }
  // 2) small clutter piled above the big base
  const cellW = (W - WALL_PAD * 2) / DAILY_SMALL_COLS;
  const baseTop = FLOOR_Y - 176;      // above the tallest big piece
  const grid = [];
  DAILY_SMALL_ROWS.forEach((rowDef, row) => {
    grid[row] = [];
    const cy = baseTop - DAILY_SMALL_ROW_H * row - DAILY_SMALL_ROW_H / 2;
    for (let col = 0; col < DAILY_SMALL_COLS; col++) {
      if (rng() > rowDef.p) { grid[row][col] = -1; continue; }
      const banned = new Set([grid[row][col - 1], (grid[row - 1] || [])[col]]);
      let choices = [];
      // never seed coke cans into the pile (they explode) — index-safe skip
      for (let t = 0; t <= rowDef.maxTier; t++) if (!banned.has(t) && t !== COKE_TIER) choices.push(t);
      if (!choices.length) for (let t = 0; t <= rowDef.maxTier; t++) if (t !== COKE_TIER) choices.push(t);
      const tier = choices[Math.floor(rng() * choices.length)];
      grid[row][col] = tier;
      const x = WALL_PAD + cellW * (col + 0.5) + (rng() - 0.5) * (cellW * 0.10);
      addFill(tier, x, cy);
    }
  });
}

function processMerges() {
  while (mergeQueue.length) {
    const [a, b] = mergeQueue.shift();
    const tier = a.plugin.tier;
    const mx = (a.position.x + b.position.x) / 2;
    const my = (a.position.y + b.position.y) / 2;
    Composite.remove(engine.world, a);
    Composite.remove(engine.world, b);
    merges++;
    const time = clockMs();
    combo = (time - lastMergeAt < 1600) ? combo + 1 : 1;
    lastMergeAt = time;
    maxCombo = Math.max(maxCombo, combo);
    const mult = 1 + Math.max(0, combo - 1) * 0.25;

    if (tier === MAX_TIER) {
      // two Big TVs cancel out in glory
      const gained = Math.round(TV_MERGE_BONUS * mult);
      score += gained;
      burst(mx, my, MAX_TIER, 70);
      floatText(mx, my - 40, '+' + gained + '  TV OVERLOAD!', '#fde68a', 30);
      shake = Math.min(18, shake + 14);
      sfx.big();
      checkLevelGoal(null);
    } else {
      const newTier = tier + 1;
      const t = TIERS[newTier];
      // spawn so the new item's design centre sits at the merge midpoint,
      // clamped inside the walls
      const sx = Math.max(WALL_PAD + t.halfW, Math.min(W - WALL_PAD - t.halfW, mx));
      const nb = makeItem(newTier, sx, my);
      Body.setVelocity(nb, {
        x: (a.velocity.x + b.velocity.x) / 2,
        y: Math.min(0, (a.velocity.y + b.velocity.y) / 2),
      });
      Body.setAngularVelocity(nb, (mergeRng() - 0.5) * 0.08);
      nb.plugin.spawnT = 1; // pop-in animation
      Composite.add(engine.world, nb);
      // the merged item is bigger than the pair it replaces — shove any
      // overlapped neighbours radially out of the way instead of letting
      // the new item sit on top of them
      for (const o of Composite.allBodies(engine.world)) {
        if (o.isStatic || o === nb || !o.plugin || o.plugin.merged) continue;
        const dx = o.position.x - mx, dy = o.position.y - my;
        const dist = Math.hypot(dx, dy) || 1;
        const reach = t.halfW + TIERS[o.plugin.tier].halfW;
        if (dist < reach) {
          const push = (1 - dist / reach) * 10;   // deeper overlap = harder shove
          Body.setVelocity(o, {
            x: o.velocity.x + (dx / dist) * push,
            y: o.velocity.y + (dy / dist) * push,
          });
        }
      }
      const gained = Math.round(t.score * mult);
      score += gained;
      discovered.add(newTier);
      if (newTier === MAX_TIER) tvBuilt++;
      checkLevelGoal(newTier);
      if (newTier > biggestTier) biggestTier = newTier;
      burst(mx, my, newTier, 14 + newTier * 3);
      floatText(mx, my - t.halfW - 10,
        '+' + gained + (combo > 1 ? '  x' + combo : ''), combo > 1 ? '#fde68a' : '#ffffff',
        20 + Math.min(12, newTier * 1.5));
      shake = Math.min(14, shake + (newTier >= 6 ? 8 : newTier >= 3 ? 4 : 1.5));
      if (newTier === MAX_TIER) { sfx.big(); shake = 16; } else { sfx.merge(newTier); }
      refreshChain();
    }
    refreshHUD();
  }
}

function processExplosions() {
  while (explodeQueue.length) {
    const b = explodeQueue.shift();
    if (b.plugin.merged) continue;
    const x = b.position.x, y = b.position.y;
    Composite.remove(engine.world, b);
    burst(x, y, COKE_TIER, 46);                 // fizzy spray
    floatText(x, y - 44, 'FIZZ!', '#f87171', 24);
    shake = Math.min(18, shake + 11);
    sfx.big();
    // radial shove — the burst scatters nearby items
    for (const o of Composite.allBodies(engine.world)) {
      if (o.isStatic || !o.plugin || o === b) continue;
      const dx = o.position.x - x, dy = o.position.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < 170) {
        const f = (1 - d / 170) * 15;
        Body.setVelocity(o, { x: o.velocity.x + (dx / d) * f, y: o.velocity.y + (dy / d) * f - 2 });
      }
    }
  }
}


  function clampHold(x){const t=TIERS[currentTier];return Math.max(WALL_PAD+t.reach+2,Math.min(W-WALL_PAD-t.reach-2,x));}
  function dropCurrent(){
    if(gameOver||!canDrop)return;
    const b=makeItem(currentTier,holdX,HOLD_Y);Body.setAngle(b,holdAngle);Composite.add(engine.world,b);
    effects.push({drop:true});canDrop=false;currentTier=nextTier;nextTier=randDropTier();readyTick=tick+Math.ceil(480/STEP_MS);
  }
  isolated(()=>{
    engine=Engine.create({positionIterations:12,velocityIterations:10,enableSleeping:false});engine.gravity.y=1.25;
    const WALL_T=120;
    Composite.add(engine.world,[
      Bodies.rectangle(W/2,FLOOR_Y+WALL_T/2,W*2,WALL_T,{isStatic:true,label:'floor'}),
      Bodies.rectangle(WALL_PAD-WALL_T/2,H/2,WALL_T,H*3,{isStatic:true,label:'wall'}),
      Bodies.rectangle(W-WALL_PAD+WALL_T/2,H/2,WALL_T,H*3,{isStatic:true,label:'wall'})]);
    currentTier=randDropTier();nextTier=randDropTier();if(mode==='daily')fillDailyDrawer();
    Events.on(engine, 'collisionStart', (ev) => {
  for (const pair of ev.pairs) {
    const a = pair.bodyA.parent || pair.bodyA;   // compound parts report the part; merge on the root
    const b = pair.bodyB.parent || pair.bodyB;
    if (a === b) continue;
    if (!a.plugin || !b.plugin) continue;
    if (a.plugin.merged || b.plugin.merged) continue;
    // coke can bursts from a hard-enough IMPACT (force = hitter momentum),
    // takes priority over merging. A heavy dumbbell pops it; light drops don't.
    if (COKE_TIER >= 0) {
      // only a real item hitting the can counts — NOT the static floor/walls
      // (whose plugin is Matter's default {} and whose mass is Infinity).
      const relSpeed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
      if (a.plugin.tier === COKE_TIER && !a.plugin.exploding && !b.isStatic && b.mass * relSpeed > EXPLODE_FORCE) { a.plugin.exploding = true; explodeQueue.push(a); }
      if (b.plugin.tier === COKE_TIER && !b.plugin.exploding && !a.isStatic && a.mass * relSpeed > EXPLODE_FORCE) { b.plugin.exploding = true; explodeQueue.push(b); }
    }
    if (a.plugin.tier !== b.plugin.tier) continue;
    // daily starting-pile items don't merge with EACH OTHER (or the dense
    // pile would cascade itself away). They still merge with anything the
    // player drops — that's how you dig the drawer out.
    if (a.plugin.fill && b.plugin.fill) continue;
    a.plugin.merged = b.plugin.merged = true;
    mergeQueue.push([a, b]);
  }
});


  });
  function step(actions=[]){
    if(gameOver)throw Error('Run ended');
    effects.length=0;
    return isolated(()=>{
      if(!canDrop&&tick>=readyTick){canDrop=true;holdX=clampHold(holdX);holdStartTick=tick;}
      const elapsed=(tick-holdStartTick)*STEP_MS;
      holdAngle=elapsed>=SPIN_MS?0:elapsed/SPIN_MS*SPIN_TURNS*Math.PI*2;
      for(const action of actions){
        if(action[0]==='a'){holdX=clampHold(action[1]);}
        else if(action[0]==='d'){if(!canDrop)throw Error('Drop cooling down');holdX=clampHold(action[1]);dropCurrent();}
        else throw Error('Bad action');
      }
      if(canDrop&&elapsed>=SPIN_MS){holdAngle=0;dropCurrent();}
      Engine.update(engine,STEP_MS);processMerges();processExplosions();tick++;
      const above=Composite.allBodies(engine.world).some(b=>!b.isStatic&&b.plugin&&now()-b.plugin.born>=700&&b.bounds.min.y<DANGER_Y);
      overflowMs=above?overflowMs+STEP_MS:Math.max(0,overflowMs-STEP_MS*2);
      gameOver=levelCleared||overflowMs>1400||tick===MAX_TICKS;
      return snapshot();
    });
  }
  function snapshot(){return {tick,score,merges,biggest:biggestTier,currentTier,nextTier,holdX,holdAngle,canDrop,gameOver,overflowMs,discovered:[...discovered]};}
  function result(){return {...snapshot(),elapsedMs:tick*STEP_MS,tvBuilt,maxCombo,levelCleared};}
  return {engine,step,snapshot,result,effects};
}
function validate(t){
  if(!t||t.version!==VERSION||!Number.isInteger(t.ticks)||t.ticks<1||t.ticks>MAX_TICKS||!Array.isArray(t.events)||t.events.length>MAX_EVENTS)throw Error('Invalid transcript');
  let previous=-1,count=0;
  for(const e of t.events){
    if(!Array.isArray(e)||e.length!==3||!Number.isInteger(e[0])||e[0]<0||e[0]>=t.ticks||e[0]<previous||!['a','d'].includes(e[1])||!Number.isInteger(e[2])||e[2]<0||e[2]>W)throw Error('Invalid input');
    count=e[0]===previous?count+1:1;if(count>4)throw Error('Too many inputs');previous=e[0];
  }
}
function replay(mode,seed,day,t,level=1){
  validate(t);const game=create(mode,seed,day,level);let index=0;
  for(let tick=0;tick<t.ticks;tick++){
    const actions=[];while(index<t.events.length&&t.events[index][0]===tick){actions.push(t.events[index++].slice(1));}
    game.step(actions);if(game.snapshot().gameOver&&tick+1!==t.ticks)throw Error('Run already ended');
  }
  return game.result();
}
return {VERSION,STEP_MS,MAX_TICKS,MAX_EVENTS,MAX_TIER,create,validate,replay};
});
