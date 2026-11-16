/* Cloud Quarry daily simulation. Browser and server replay use these exact rules. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CloudQuarryCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const VERSION = 'v3', W = 720, LAYOUT_VERSION = 2, STEP_MS = 1000 / 60;
  const MAX_TICKS = 21600, MAX_EVENTS = 12000;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const lerp = (a,b,t) => a+(b-a)*t;
  function fnv1a(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const upgradeDefs = [
    { id:'impact', icon:'✹', name:'Impact', desc:'+1 damage per hit', base:110, growth:1.9, max:6 },
    { id:'ricochet', icon:'↗', name:'Ricochet', desc:'+2 block hits per ball', base:150, growth:1.92, max:5 },
    { id:'multishot', icon:'⋰', name:'Multishot', desc:'+1 ball per launch', base:320, growth:2.15, max:4 },
    { id:'rapid', icon:'»', name:'Rapid launch', desc:'Shorter firing cooldown', base:180, growth:1.95, max:5 },
    { id:'magnet', icon:'∪', name:'Shard magnet', desc:'Faster, richer recycling', base:130, growth:1.85, max:5 },
    { id:'overcharge', icon:'⚡', name:'Overcharge', desc:'Explosive shots more often', base:340, growth:2.05, max:4 },
  ];
  const freshUpgrades = () => Object.fromEntries(upgradeDefs.map(d => [d.id,0]));


  const STRATA = [
    { name:'Cloudglass', color:'#61d8f2' },
    { name:'Rainstone', color:'#56b8df' },
    { name:'Stormglass', color:'#6f92dc' },
    { name:'Aurora seam', color:'#9c78d7' },
    { name:'Star core', color:'#e7a84a' },
  ];

  const LAYOUTS = [
    { id:'terraces', name:'Sunstep Terraces' },
    { id:'hourglass', name:'Hourglass Hollow' },
    { id:'spires', name:'Twin Skyspires' },
    { id:'prism', name:'Prism Vault' },
    { id:'cascade', name:'Cloudfall Cascade' },
    { id:'crown', name:'Nimbus Crown' },
  ];

  function layoutForSeed(seed) {
    const value=String(seed);
    const openMatch=value.match(/^cloudquarry:open:v2:(\d+)$/);
    if(openMatch) return LAYOUTS[(Number(openMatch[1])+2)%LAYOUTS.length];
    const dailyMatch=value.match(/^cloudquarry:(\d{4}-\d{2}-\d{2})$/);
    if(dailyMatch) return LAYOUTS[Math.floor(Date.parse(`${dailyMatch[1]}T12:00:00Z`)/86400000)%LAYOUTS.length];
    return LAYOUTS[fnv1a(`${value}:layout:v${LAYOUT_VERSION}`) % LAYOUTS.length];
  }

  function layoutScore(layoutId, x, y, row) {
    if(layoutId==='terraces') {
      const widths=[.54,.72,.9,.98,.82,.64], band=Math.min(widths.length-1,Math.floor(y*widths.length));
      return widths[band]-Math.abs(x)+(row%4===0 ? .11 : 0);
    }
    if(layoutId==='hourglass') return .44+Math.abs(y-.5)*1.08-Math.abs(x);
    if(layoutId==='spires') {
      const towers=Math.max(.5-Math.abs(x-.52),.5-Math.abs(x+.52));
      const bridge=row%10>=7 ? .34-Math.abs(x) : -0.16;
      return Math.max(towers,bridge)+(y>.72?.1:0);
    }
    if(layoutId==='prism') return .28+(1-Math.abs(y*2-1))*.82-Math.abs(x);
    if(layoutId==='cascade') {
      const center=Math.sin(y*Math.PI*2.7)*.25, width=.7+Math.sin(y*Math.PI*5.2)*.11;
      return width-Math.abs(x-center);
    }
    const crownBand=.48-Math.abs(Math.abs(x)-(.48+.1*Math.sin(y*Math.PI*2)));
    const crownBridge=row%11>=8 ? .34-Math.abs(x) : -0.2;
    return Math.max(crownBand,crownBridge)+(y>.78?.12:0);
  }

  function makeFormation(seed, mode, targetCount) {
    const rng = mulberry32(fnv1a(seed));
    const layout=layoutForSeed(seed);
    const cols = 17, rows = mode === 'daily' ? 26 : 32;
    const gap = 3, bw = 35, bh = mode === 'daily' ? 18 : 15;
    const width = cols * bw + (cols - 1) * gap;
    const sx = (W - width) / 2, sy = mode === 'daily' ? 78 : 82;
    const candidates = [];
    for (let row=0; row<rows; row++) {
      for (let col=0; col<cols; col++) {
        const x=(col-(cols-1)/2)/((cols-1)/2), y=row/Math.max(1,rows-1);
        candidates.push({
          row, col, keep:layoutScore(layout.id,x,y,row)+rng()*.34, tint:rng(), hpRoll:rng(),
          vaultRoll:fnv1a(`${seed}:vault:${row}:${col}`)/4294967296,
        });
      }
    }
    candidates.sort((a,b) => b.keep - a.keep);
    const kept = candidates.slice(0,clamp(Math.floor(targetCount),1,candidates.length)).sort((a,b) => a.row-b.row || a.col-b.col);
    return kept.map((c,index) => {
      const depth = c.row / Math.max(1,rows-1);
      const layerCap = mode === 'daily' ? 18 : 24;
      const vault = c.vaultRoll>.96 && c.row>1;
      const baseLayers = 3 + Math.floor(depth*(layerCap-4)) + (c.hpRoll>.72 ? 1 : 0);
      const layers = clamp(baseLayers+(vault?4:0),3,layerCap);
      const hp = clamp(1 + Math.floor(depth*2.6),1,3);
      return {
        id:`${c.row}-${c.col}`, index, x:sx+c.col*(bw+gap), y:sy+c.row*(bh+gap), w:bw, h:bh,
        hp, maxHp:hp, layers, maxLayers:layers, stratum:Math.min(4,Math.floor(depth*5)), vault,
        hue:vault?42+c.tint*9:178+c.tint*54+depth*14, flash:0, dead:false,
      };
    });
  }

  function countStrata(blocks) {
    const counts=STRATA.map(()=>0);
    for(const b of blocks) counts[b.stratum]++;
    return counts;
  }


  function create(seed, effects = {}) {
    if (typeof seed !== 'string' || seed.length > 96) throw Error('Invalid seed');
    const rng = mulberry32(fnv1a(seed + ':shards:' + VERSION));
    const state = { mode:'daily', playing:true, paused:false, ended:false, cleared:false,
      tick:0, elapsedMs:0, blocks:makeFormation(seed,'daily',320), balls:[], shards:[], particles:[], floaters:[],
      credits:0, upgrades:freshUpgrades(), destroyed:0, total:320, shots:0, combo:0, maxCombo:0, comboUntil:0,
      aimX:W/2, aimY:250, pointerDown:false, nextFireAt:250 };
    const performance = { now:()=>state.tick*STEP_MS };
    const tone = (...args) => effects.tone?.(...args);
    const burst = (...args) => effects.burst?.(...args);
    const floater = (...args) => effects.floater?.(...args);
    const queueCampaignSave = () => {}, saveCampaign = () => {}, updateHud = () => {};
    function finishRun(cleared) { state.ended=true;state.playing=false;state.cleared=cleared; }
  function fire(now) {
    if(!state.playing || state.paused || state.ended || now<state.nextFireAt) return;
    const cooldown=Math.max(135,420-state.upgrades.rapid*52);
    state.nextFireAt=now+cooldown; state.shots++;
    let angle=Math.atan2(state.aimY-828,state.aimX-W/2);
    angle=clamp(angle,-Math.PI+.22,-.22);
    const count=1+state.upgrades.multishot, spread=.115;
    const chargedEvery=Math.max(7,12-state.upgrades.overcharge);
    const charged=state.upgrades.overcharge>0 && state.shots%chargedEvery===0;
    for(let i=0;i<count;i++) {
      const a=angle+(i-(count-1)/2)*spread;
      state.balls.push({ x:W/2,y:812,px:W/2,py:812,vx:Math.cos(a)*610,vy:Math.sin(a)*610,r:charged?10:7,damage:1+state.upgrades.impact,maxHits:4+state.upgrades.ricochet*2,hits:0,life:0,lastBlock:'',blockLock:0,charged });
    }
    tone(charged?320:210,.045,charged ? .045 : .022,charged?'sawtooth':'sine');
    updateHud();
  }

  function spawnShards(block) {
    const n=2+Math.min(3,Math.floor(block.maxLayers/5));
    const chainBonus=1+Math.min(.75,Math.max(0,state.combo-1)*.05);
    const value=Math.max(1,Math.round((1+Math.floor(block.maxLayers/6))*(block.vault?1.8:1)*chainBonus));
    for(let i=0;i<n;i++) state.shards.push({ x:block.x+block.w/2,y:block.y+block.h/2,vx:(rng()-.5)*150,vy:-50-rng()*130,age:0,value,hue:block.hue,collected:false });
  }
  function damageBlock(block,damage,ball,explosion=false) {
    if(block.dead) return;
    block.hp-=damage; block.flash=1;
    burst(ball.x,ball.y,`hsl(${block.hue} 88% 69%)`,explosion?10:5,explosion?190:110);
    if(block.hp>0) { tone(300+block.hp*32,.035,.012,'triangle'); queueCampaignSave(); return; }
    if(block.layers>1) {
      block.layers--; block.hp=block.maxHp; block.flash=1.35;
      if(block.layers<=3 || block.layers%5===0) floater(block.x+block.w/2,block.y,`${block.layers} shells`,'#dffcff');
      tone(380+Math.min(block.layers,16)*11,.045,.016,'triangle'); queueCampaignSave(); return;
    }
    block.layers=0;
    block.dead=true; state.destroyed++;
    if(state.mode==='campaign') state.destroyedIds.add(block.id);
    const now=performance.now(); state.combo=now<state.comboUntil?state.combo+1:1; state.comboUntil=now+900;
    state.maxCombo=Math.max(state.maxCombo,state.combo);
    spawnShards(block); floater(block.x+block.w/2,block.y,block.vault?`◆ VAULT ×${state.combo}`:`+${state.combo}`,block.vault?'#ffe07a':'#ffffff');
    tone(470+Math.min(state.combo,12)*24,.055,.022,'sine');
    if(state.combo>=4) tone(700+Math.min(state.combo,10)*18,.08,.012,'sine',.035);
    if(ball.charged && !explosion) explode(ball.x,ball.y,78+state.upgrades.overcharge*13,Math.max(1,Math.ceil(ball.damage*.65)),block.id);
    if(state.mode==='campaign') saveCampaign();
  }
  function explode(x,y,radius,damage,skipId) {
    burst(x,y,'#fff07a',26,260); tone(88,.18,.055,'sawtooth');
    for(const b of state.blocks) {
      if(b.dead||b.id===skipId) continue;
      const bx=b.x+b.w/2,by=b.y+b.h/2;
      if(Math.hypot(bx-x,by-y)<radius) damageBlock(b,damage,{x:bx,y:by,charged:false},true);
    }
  }

  function collideBallBlock(ball,b) {
    if(b.dead || (ball.lastBlock===b.id && ball.blockLock>0)) return false;
    const nx=clamp(ball.x,b.x,b.x+b.w), ny=clamp(ball.y,b.y,b.y+b.h);
    const dx=ball.x-nx,dy=ball.y-ny;
    if(dx*dx+dy*dy>ball.r*ball.r) return false;
    const wasLeft=ball.px < b.x-ball.r, wasRight=ball.px > b.x+b.w+ball.r;
    if(wasLeft||wasRight) ball.vx*=-1; else ball.vy*=-1;
    ball.x=ball.px; ball.y=ball.py; ball.hits++; ball.lastBlock=b.id; ball.blockLock=.055;
    damageBlock(b,ball.damage,ball);
    return true;
  }
  function updatePhysics(dt,now) {
    if(state.pointerDown) fire(now);
    for(let i=state.balls.length-1;i>=0;i--) {
      const b=state.balls[i]; b.life+=dt; b.blockLock=Math.max(0,b.blockLock-dt); b.px=b.x; b.py=b.y; b.x+=b.vx*dt; b.y+=b.vy*dt;
      if(b.x<b.r+4){b.x=b.r+4;b.vx=Math.abs(b.vx);} if(b.x>W-b.r-4){b.x=W-b.r-4;b.vx=-Math.abs(b.vx);}
      if(b.y<b.r+4){b.y=b.r+4;b.vy=Math.abs(b.vy);} if(b.y>836-b.r){b.y=836-b.r;b.vy=-Math.abs(b.vy);}
      for(const block of state.blocks) { if(collideBallBlock(b,block)) break; }
      if(b.hits>=b.maxHits||b.life>9) state.balls.splice(i,1);
    }
    state.blocks=state.blocks.filter(b=>!b.dead);
    const magnet=state.upgrades.magnet;
    for(let i=state.shards.length-1;i>=0;i--) {
      const s=state.shards[i]; s.age+=dt;
      if(s.age<Math.max(.18,.65-magnet*.085)) { s.vy+=260*dt;s.x+=s.vx*dt;s.y+=s.vy*dt; }
      else {
        const tx=650,ty=810, pull=clamp(dt*(3.2+magnet*.85),0,1); s.x=lerp(s.x,tx,pull);s.y=lerp(s.y,ty,pull);
        if(Math.hypot(s.x-tx,s.y-ty)<18) {
          const earned=Math.max(1,Math.round(s.value*(1+magnet*.18))); state.credits+=earned; state.shards.splice(i,1);
          if(rng()<.45) tone(540+earned*15,.035,.009,'sine'); saveCampaign();
        }
      }
    }
    for(let i=state.particles.length-1;i>=0;i--){const p=state.particles[i];p.life-=dt;p.vy+=95*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.life<=0)state.particles.splice(i,1);}
    for(let i=state.floaters.length-1;i>=0;i--){const f=state.floaters[i];f.life-=dt;f.y-=30*dt;if(f.life<=0)state.floaters.splice(i,1);}
    if(now>state.comboUntil) state.combo=0;
    if(!state.blocks.length) finishRun(true);
  }


    function step(actions = []) {
      if (state.ended || state.tick >= MAX_TICKS) return false;
      state.tick++; const now=state.tick*STEP_MS;
      for (const a of actions) {
        if (a[1]==='a') { state.aimX=a[2];state.aimY=a[3]; }
        else if (a[1]==='h') state.pointerDown=!!a[2];
        else if (a[1]==='f') fire(now);
        else if (a[1]==='u') {
          const d=upgradeDefs.find(d=>d.id===a[2]),level=state.upgrades[a[2]];
          if(d && level<d.max) { const cost=Math.round(d.base*Math.pow(d.growth,level));
            if(state.credits>=cost) { state.credits-=cost;state.upgrades[d.id]++; } }
        }
      }
      updatePhysics(1/60,now);state.elapsedMs=now;
      if(state.tick===MAX_TICKS && !state.ended) finishRun(false);
      return true;
    }
    function result() { return { version:VERSION, cleared:state.cleared, blocks:state.destroyed, shots:state.shots,
      maxCombo:state.maxCombo, ticks:state.tick, elapsedMs:state.elapsedMs }; }
    return { state, step, result };
  }
  function validate(transcript) {
    if(!transcript || transcript.version!==VERSION || !Number.isInteger(transcript.ticks) || transcript.ticks<1 || transcript.ticks>MAX_TICKS || !Array.isArray(transcript.events) || transcript.events.length>MAX_EVENTS) throw Error('Invalid transcript');
    let previous=0, perTick=0;
    for(const a of transcript.events) {
      if(!Array.isArray(a) || !Number.isInteger(a[0]) || a[0]<1 || a[0]>transcript.ticks || a[0]<previous) throw Error('Invalid input tick');
      perTick=a[0]===previous?perTick+1:1;previous=a[0];if(perTick>8)throw Error('Too many inputs');
      if(a[1]==='a') { if(a.length!==4 || !Number.isInteger(a[2]) || a[2]<35 || a[2]>685 || !Number.isInteger(a[3]) || a[3]<70 || a[3]>790)throw Error('Invalid aim'); }
      else if(a[1]==='h') { if(a.length!==3 || ![0,1].includes(a[2]))throw Error('Invalid hold'); }
      else if(a[1]==='f') { if(a.length!==2)throw Error('Invalid fire'); }
      else if(a[1]==='u') { if(a.length!==3 || !upgradeDefs.some(d=>d.id===a[2]))throw Error('Invalid upgrade'); }
      else throw Error('Invalid action');
    }
    return true;
  }
  function replay(seed, transcript) {
    validate(transcript);const run=create(seed);let index=0;
    while(run.state.tick<transcript.ticks && !run.state.ended) {
      const actions=[];while(index<transcript.events.length && transcript.events[index][0]===run.state.tick+1)actions.push(transcript.events[index++]);
      run.step(actions);
    }
    if(run.state.tick!==transcript.ticks || index!==transcript.events.length)throw Error('Inputs after run ended');
    return run.result();
  }
  return { VERSION,STEP_MS,MAX_TICKS,MAX_EVENTS,create,replay,validate,makeFormation,layoutForSeed,upgradeDefs };
});
