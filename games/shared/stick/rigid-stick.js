// Rigid stick and IK attachment; body-space metres, +x forward +y up +z right.
import { fk } from '../../hockey/vendor/stack/skeleton.js';
import { solveArms, gripPoint } from '../rig/ik.js';
export const STICK_SPEC=Object.freeze({shaft:1.52,blade:.30,top:.06,bottom:.36,lie:40*Math.PI/180,puckRadius:.0381,halfBlade:.006});
const S=STICK_SPEC,D=Math.PI/180,sub=(a,b)=>a.map((x,i)=>x-b[i]),add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,s)=>a.map(x=>x*s),len=a=>Math.hypot(...a),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=a=>mul(a,1/(len(a)||1));
export function solveStick(pose,heel,g,opts={}){
 const J=fk(pose),goalie=!!opts.goalie,topSide=goalie?'R':opts.handed==='L'?'R':'L',other=topSide==='L'?'R':'L',old=gripPoint(J,topSide),low=gripPoint(J,other),theta=S.lie;
 let best=null;
 function attempt(H,U,V){
  const T=add(H,mul(U,S.shaft)),E=add(H,mul(V,S.blade));
  if(Math.min(H[1],E[1],T[1])<g-.004)return;
  const targets={[topSide]:add(T,mul(U,-(goalie?S.bottom:S.top)))};
  if(!goalie)targets[other]=add(T,mul(U,-S.bottom));
  const r=solveArms(pose,targets,{stay:.003,iters:16}),error=Math.max(...Object.values(r.residual)),score=error+len(sub(H,heel))*.025+len(sub(targets[topSide],old))*.008;
  if(!best||score<best.score)best={score,error,pose:r.pose,T,H,E,targets,mode:'held'};
 }
 function grounded(H){
  const base=Math.atan2(H[2]-J.pelvis.p[2],H[0]-J.pelvis.p[0]);
  for(const yaw of [0,20,-20,40,-40,65,-65,90,-90]){
   const a=base+yaw*D,V=[Math.cos(a),0,Math.sin(a)],side=[-V[2],0,V[0]];
   for(const roll of [0,20,-20,40,-40,60,-60,75,-75]){
    const U=add(mul(V,-Math.sin(theta)),add([0,Math.cos(theta)*Math.cos(roll*D),0],mul(side,Math.cos(theta)*Math.sin(roll*D))));
    attempt(H,U,V);if(best?.error<.009)return;
   }
  }
 }
 if(opts.drop){const H=[.85,g+.035,.35],U=[-1,0,0],V=[Math.sin(theta),0,Math.cos(theta)];return {pose,T:add(H,mul(U,S.shaft)),H,E:add(H,mul(V,S.blade)),targets:{},error:0,mode:'released',fallback:false};}
 if(heel[1]-g<=.085)grounded(heel);
 else{
  const primary=unit(sub(old,heel)),second=unit(sub(old,low));
  for(const d of [primary,second,...[.25,-.25,.5,-.5,.75,-.75].flatMap(k=>[unit(add(primary,[0,k,0])),unit(add(primary,[k,0,0])),unit(add(primary,[0,0,k]))])]){
   const H=add(old,mul(d,-(S.shaft-(goalie?S.bottom:S.top))));
   const out=unit([H[0]-J.pelvis.p[0],0,H[2]-J.pelvis.p[2]]);
   let perp=unit(sub(out,mul(d,dot(out,d))));if(len(perp)<.5)perp=unit(sub([0,1,0],mul(d,d[1])));
   attempt(H,d,add(mul(d,-Math.sin(theta)),mul(perp,Math.cos(theta))));
   if(best?.error<.009)break;
  }
 }
 let fallback=false;
 if(!best||best.error>.03){fallback=true;best=null;for(const H of [[.85,g+.035,.25],[.65,g+.035,.4],[.55,g+.035,.2],[.35,g+.035,.5]]){grounded(H);if(best?.error<=.03)break;}}
 if(!best||best.error>.03)throw Error('unreachable hockey stick grip: '+(best?.error??'no candidate'));
 return {...best,fallback};
}
export function stickContact(r){const d=unit(sub(r.E,r.H));let n=unit([d[2],0,-d[0]]);if(n[0]<0)n=mul(n,-1);return add(add(r.H,mul(sub(r.E,r.H),.55)),mul(n,S.puckRadius+S.halfBlade));}
export function gripErrors(pose,stick){const J=fk(pose);return Object.fromEntries(Object.entries(stick.targets).map(([side,target])=>[side,len(sub(gripPoint(J,side),target))]));}
