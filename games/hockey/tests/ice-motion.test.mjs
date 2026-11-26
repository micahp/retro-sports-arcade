import { iceMotion, locomotionAction } from '../src/ice-motion.js';
import { createGame, step } from '../src/sim.js';
import { SKATE } from '../src/config.js';
const F={top:1,accel:1,edges:1,turn:1},dt=1/60;
const p={vx:0,vz:0,yaw:0,down:0}, go=(it,n)=>{for(let i=0;i<n;i++)Object.assign(p,iceMotion(p,it,dt,SKATE,F,false));};
function check(ok,msg){if(!ok)throw Error(msg);console.log('PASS '+msg);}
go({mx:1,mz:0},100);check(Math.abs(p.vx-SKATE.max)<.001,'accelerates to bounded max');
go({mx:0,mz:0},30);check(p.vx>8&&p.vx<9,'release coasts');
go({mx:-1,mz:0},20);check(p.vx>0&&p.state==='stop','reversal brakes before moving backward');
go({mx:-1,mz:0},90);check(p.vx<0,'reversal completes');
Object.assign(p,{vx:0,vz:0,yaw:0});go({mx:-1,mz:0,faceYaw:0},100);check(p.vx<-5&&Math.abs(p.yaw)<.001&&p.state==='backward','backward travel preserves facing');
Object.assign(p,{vx:8,vz:0,yaw:0});go({mx:0,mz:1},1);check(p.vx>7&&p.vz>0&&p.state==='turn','turn follows finite-radius arc');
check(locomotionAction('backward',1)==='hBack','backward action selection');
const S=createGame('regulation','edges-test',{auto:false,penalties:false,engine:{motion:'edges'}});
for(let i=0;i<180;i++)step(S,{active:false,x:0,z:0});
check(S.user.intent.mx===0&&S.user.intent.mz===0,'idle human remains human');
for(let i=0;i<120;i++)step(S,{active:true,x:1,z:0});
check(S.user.motionState!==undefined&&Number.isFinite(S.user.x),'runtime uses new movement');
