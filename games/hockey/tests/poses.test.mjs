import { HOCKEY, poseAt } from '../src/poses.js';
import { gripErrors, STICK_SPEC } from '../../shared/stick/rigid-stick.js';
let n=0,fall=0,fb=0,max=0;
for(const [name,a] of Object.entries(HOCKEY))for(let i=0;i<a.frames;i++){
 const {pose,stick:s,g}=poseAt(name,a.dur*(a.loop?i/a.frames:a.frames===1?0:i/(a.frames-1)));
 const L=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 if(Math.abs(L(s.T,s.H)-STICK_SPEC.shaft)>1e-8||Math.abs(L(s.H,s.E)-STICK_SPEC.blade)>1e-8)throw Error(name+' rigid length');
 if(Math.min(s.H[1],s.E[1],s.T[1])<g-.005)throw Error(name+' ice penetration');
 const err=Math.max(0,...Object.values(gripErrors(pose,s)));if(err>.03)throw Error(name+' disconnected grip '+err);
 max=Math.max(max,err);n++;if(s.fallback)fb++;if(s.mode==='released')fall++;
}
console.log('PASS '+n+' frames, max grip '+max.toFixed(4)+' m; fallback '+fb+'; released '+fall);
