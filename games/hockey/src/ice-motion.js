// Directional ice locomotion. Pure deterministic controller; no animation or RNG dependencies.
// +x/+z world plane, radians, metres, seconds. Body facing is independent of travel.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v, target, delta) => v + clamp(target-v,-delta,delta);
export function iceMotion(p, intent, dt, cfg, factors, carrying) {
  const mag = Math.min(1, Math.hypot(intent.mx || 0,intent.mz || 0));
  const speed = Math.hypot(p.vx,p.vz);
  const oldHeading = speed > .05 ? Math.atan2(p.vz,p.vx) : p.yaw;
  const heading = mag > .07 ? Math.atan2(intent.mz,intent.mx) : oldHeading;
  const error = wrap(heading-oldHeading);
  const explicitFacing = Number.isFinite(intent.faceYaw);
  const backward = explicitFacing && Math.cos(wrap(heading-intent.faceYaw)) < -.55;
  const max = cfg.max*factors.top*(carrying?cfg.carryFactor:1)*(backward?.67:1);
  const falling = p.down>0 || p.one?.name==='hFall';
  const shooting = p.one && ['hShoot','hSlap'].includes(p.one.name);
  const reversing = mag>.15 && speed>1.1 && Math.abs(error)>Math.PI*.63;
  let nextSpeed = speed, travel = oldHeading, state='glide';
  if(falling) { nextSpeed=Math.max(0,speed-5*dt); state='glide'; }
  else if(reversing || p.one?.name==='hBrake' || intent.brake) {
    nextSpeed=Math.max(0,speed-cfg.brake*dt); state='stop';
  } else if(mag<=.07) {
    nextSpeed=Math.max(0,speed-cfg.glide*dt); state=nextSpeed>.12?'glide':'ready';
  } else {
    const edgeRate=Math.min(cfg.turnRate*factors.turn, cfg.lateral*factors.edges/Math.max(speed,.7));
    travel=speed<.12?heading:oldHeading+clamp(error,-edgeRate*dt,edgeRate*dt);
    const alignment=Math.max(.2,Math.cos(wrap(heading-travel)));
    const target=max*mag*alignment;
    nextSpeed=approach(speed,target,(target>=speed?cfg.accel*factors.accel*(shooting?.3:1):cfg.brake*.55)*dt);
    state=backward?'backward':speed>1.5&&Math.abs(error)>.28?'turn':speed<1.5?'accelerate':nextSpeed<.12?'ready':'stride';
  }
  const desiredFace=explicitFacing?intent.faceYaw:mag>.07&&!reversing?heading:p.yaw;
  const yaw=p.yaw+clamp(wrap(desiredFace-p.yaw),-cfg.turnRate*factors.turn*dt,cfg.turnRate*factors.turn*dt);
  const turnSign=Math.abs(error)>.04?Math.sign(error):(p.turnSign||1);
  return {vx:Math.cos(travel)*nextSpeed,vz:Math.sin(travel)*nextSpeed,yaw, state,turnSign};
}
export function locomotionAction(state, sign) {
  switch(state){case 'ready':return 'hReady';case 'backward':return 'hBack';case 'turn':return sign<0?'hTurnL':'hTurnR';case 'stop':return sign<0?'hStopL':'hStopR';case 'accelerate':case 'stride':return 'hSkate';default:return 'hGlide';}
}
