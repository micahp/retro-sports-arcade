import { HOCKEY, poseAt, stickContact } from '../src/poses.js';
import { createGame, bladeOf, stickWorld, step } from '../src/sim.js';
const ok=(v,m)=>{if(!v)throw Error(m);console.log('PASS '+m);};
for(const name of ['hShoot','hSlap','hPass']){const a=HOCKEY[name],r=poseAt(name,a.dur*a.release);ok(Math.abs(stickContact(r.stick)[1]-r.g)<.12,name+' contact at ice');}
for(const kind of ['wrist','slap','pass']){
 const S=createGame('regulation','rigid-test',{auto:false,penalties:false,engine:{motion:'edges'}});
 const p=S.user;p.act='hReady';p.ph=0;p.x=0;p.z=0;p.yaw=0;S.phase='play';
 const c=bladeOf(p),w=stickWorld(p);ok(Math.hypot(c.x-w.C.x,c.y-w.C.y,c.z-w.C.z)<1e-10,'physics and stickWorld share contact');
 Object.assign(S.puck,{owner:p,x:c.x,z:c.z,y:0,lock:0});
 for(const q of S.skaters)if(q!==p){q.script=()=>({mx:0,mz:0});q.x=-20;q.z=q.id*.7;}
 for(let i=0;i<100;i++)step(S,{active:true,x:0,z:0,shootUp:i===0&&kind!=='pass',held:kind==='slap'?.5:0,pass:i===0&&kind==='pass'});
 const rel=S.log.find(e=>e.type==='bladeRelease');ok(rel&&rel.gap<=.12,kind+' release is contact gated');
}
