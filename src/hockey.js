// Rink '95: deliberately small, deterministic-step arcade hockey prototype.
// Gameplay mechanics are independent of historical statistical forecasting.
const canvas=document.getElementById('rink'),ctx=canvas.getContext('2d');
const W=960,H=560,TOP=42,BOTTOM=518,LEFT=44,RIGHT=916,CY=280,GOAL=66;
const keys=new Set();let mode='menu',period=1,time=120,blue=0,red=0,players=[],puck,selected=0,notice='',noticeTimer=0,faceoffTimer=0,shotCooldown=0,goalDelay=0,acc=0,last=0;
const fixed=1/60,MAX_FRAME=.05;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const norm=(x,y)=>{let d=Math.hypot(x,y)||1;return{x:x/d,y:y/d}};
const rand=(a,b)=>a+Math.random()*(b-a);
function makePlayer(team,i,x,y,goalie=false){return{team,i,x,y,vx:0,vy:0,dir:team===0?0:Math.PI,goalie,r:goalie?17:15,stun:0,hold:0}}
function resetPositions(){
 players=[
 makePlayer(0,0,340,280),makePlayer(0,1,230,165),makePlayer(0,2,230,395),makePlayer(0,3,86,280,true),
 makePlayer(1,0,620,280),makePlayer(1,1,730,165),makePlayer(1,2,730,395),makePlayer(1,3,874,280,true)];
 selected=0;puck={x:480,y:280,vx:0,vy:0,owner:null,lastTeam:null,flight:0};
 faceoffTimer=1.15;goalDelay=0;shotCooldown=0;
}
function startGame(){blue=0;red=0;period=1;time=120;resetPositions();mode='playing';setOverlay(false);flash('CENTER ICE FACEOFF',1.3);updateHud()}
function flash(s,t=1){notice=s;noticeTimer=t;document.getElementById('status').textContent=s}
function setOverlay(show,title,text,button){const o=document.getElementById('overlay');o.classList.toggle('hidden',!show);if(show){document.getElementById('overlayTitle').textContent=title;document.getElementById('overlayText').textContent=text;document.getElementById('start').textContent=button}}
function updateHud(){document.getElementById('blueScore').textContent=blue;document.getElementById('redScore').textContent=red;document.getElementById('clock').textContent=Math.floor(time/60)+':'+String(Math.ceil(time%60)).padStart(2,'0');document.getElementById('period').textContent='PERIOD '+period+' / 3'}
function nearest(team,x,y,exclude=-1){let best=null,bd=Infinity;for(const p of players){if(p.team!==team||p.goalie||p.i===exclude)continue;const d=Math.hypot(p.x-x,p.y-y);if(d<bd){best=p;bd=d}}return best}
function playerControlled(){return players.find(p=>p.team===0&&p.i===selected)||players[0]}
function switchPlayer(){const p=puck.owner;if(p&&p.team===0){selected=p.i;return}let best=nearest(0,puck.x,puck.y);if(best)selected=best.i;flash('SWITCH PLAYER',.45)}
function shoot(p,pass=false){
 if(mode!=='playing'||faceoffTimer>0||goalDelay>0||!p||p.goalie||puck.owner!==p||shotCooldown>0)return;
 let tx,ty,speed;
 if(pass){const mates=players.filter(q=>q.team===p.team&&!q.goalie&&q!==p);mates.sort((a,b)=>dist(a,p)-dist(b,p));let target=mates.find(q=>q.team===p.team&&Math.abs(q.x-p.x)>55)||mates[0];if(!target)return;tx=target.x+target.vx*.16;ty=target.y+target.vy*.16;speed=410;flash('PASS',.4)}
 else{tx=p.team===0?RIGHT+10:LEFT-10;ty=CY+rand(-48,48);speed=600;flash('SHOT!',.5)}
 const v=norm(tx-p.x,ty-p.y);puck.owner=null;puck.x=p.x+v.x*22;puck.y=p.y+v.y*22;puck.vx=v.x*speed+p.vx*.25;puck.vy=v.y*speed+p.vy*.25;puck.flight=pass?.18:.32;puck.lastTeam=p.team;shotCooldown=pass?.2:.4;p.dir=Math.atan2(v.y,v.x)
}
function faceoff(){const b=players[0],r=players[4];const winner=Math.random()<.5?b:r;puck.owner=winner;puck.x=winner.x;puck.y=winner.y;faceoffTimer=0;flash(winner.team===0?'BLUE WINS FACEOFF':'RED WINS FACEOFF',1)}
function score(team){if(team===0)blue++;else red++;updateHud();flash(team===0?'BLUE SCORES!':'RED SCORES!',2);goalDelay=2;puck.owner=null;puck.vx=0;puck.vy=0}
function move(p,dx,dy,dt,max=235){const v=norm(dx,dy);const active=Math.hypot(dx,dy)>.03;const desiredX=active?v.x*max:0,desiredY=active?v.y*max:0;const response=active?9:7;p.vx+=(desiredX-p.vx)*Math.min(1,response*dt);p.vy+=(desiredY-p.vy)*Math.min(1,response*dt);p.x=clamp(p.x+p.vx*dt,LEFT+17,RIGHT-17);p.y=clamp(p.y+p.vy*dt,TOP+17,BOTTOM-17);if(Math.hypot(p.vx,p.vy)>12)p.dir=Math.atan2(p.vy,p.vx)}
function ai(p,dt){
 if(p.goalie){const tx=p.team===0?LEFT+43:RIGHT-43;const ty=clamp(puck.y,CY-57,CY+57);move(p,(tx-p.x)*.05,(ty-p.y)*.05,dt,160);return}
 const team=p.team,owner=puck.owner,attack=team===0?1:-1;
 let tx,ty;
 if(owner===p){tx=team===0?RIGHT-120:LEFT+120;ty=CY+(p.i===1?-75:p.i===2?75:0)*.5;
 if(Math.abs(p.x-(team===0?RIGHT:LEFT))<220&&Math.abs(p.y-CY)<155&&shotCooldown<=0&&Math.random()<dt*1.5)shoot(p,false)}
 else if(owner&&owner.team===team){tx=owner.x-attack*(p.i===1?70:125);ty=clamp(owner.y+(p.i===1?-105:105),TOP+50,BOTTOM-50)}
 else if(!owner||owner.team!==team){const chaser=nearest(team,puck.x,puck.y);if(chaser===p){tx=puck.x;ty=puck.y}else{tx=clamp(puck.x-attack*105,LEFT+45,RIGHT-45);ty=CY+(p.i===1?-105:p.i===2?105:0)}}
 else{tx=p.x;ty=p.y}
 const v=norm(tx-p.x,ty-p.y);move(p,(tx-p.x),ty-p.y,dt,owner===p?220:205);
}
function tryCheck(p){if(mode!=='playing'||faceoffTimer>0||goalDelay>0||shotCooldown>0)return;const target=players.filter(q=>q.team!==p.team&&!q.goalie&&dist(p,q)<49).sort((a,b)=>dist(a,p)-dist(b,p))[0];if(target&&puck.owner===target){puck.owner=null;puck.x=target.x;puck.y=target.y;puck.vx=p.vx*.65;puck.vy=p.vy*.65;target.stun=.35;shotCooldown=.25;flash('POKE CHECK!',.7)}}
function step(dt){
 if(mode!=='playing')return;
 if(noticeTimer>0){noticeTimer-=dt;if(noticeTimer<=0)document.getElementById('status').textContent='Skate · pass · shoot · switch'}
 if(goalDelay>0){goalDelay-=dt;if(goalDelay<=0){resetPositions();flash('CENTER ICE FACEOFF',1)}return}
 if(faceoffTimer>0){faceoffTimer-=dt;if(faceoffTimer<=0)faceoff();return}
 time=Math.max(0,time-dt);if(time<=0){if(period===3){mode='final';setOverlay(true,'FINAL HORN','BLUE '+blue+' — RED '+red+(blue===red?' · DRAW':' · '+(blue>red?'BLUE WINS':'RED WINS')),'PLAY AGAIN');updateHud();return}period++;time=120;resetPositions();flash('PERIOD '+period,1.5);updateHud();return}
 if(shotCooldown>0)shotCooldown-=dt;
 const user=playerControlled();let dx=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),dy=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
 for(const p of players){if(p.stun>0){p.stun-=dt;move(p,0,0,dt);continue}if(p===user)move(p,dx,dy,dt,puck.owner===p?230:250);else ai(p,dt)}
 // Separation keeps athletes from occupying the same point.
 for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++){let a=players[i],b=players[j],dd=dist(a,b),min=a.r+b.r-2;if(dd<min&&dd>.001){const n=norm(b.x-a.x,b.y-a.y),push=(min-dd)*.5;a.x=clamp(a.x-n.x*push,LEFT+17,RIGHT-17);a.y=clamp(a.y-n.y*push,TOP+17,BOTTOM-17);b.x=clamp(b.x+n.x*push,LEFT+17,RIGHT-17);b.y=clamp(b.y+n.y*push,TOP+17,BOTTOM-17)}}
 if(puck.owner){const p=puck.owner;puck.x=p.x+Math.cos(p.dir)*20;puck.y=p.y+Math.sin(p.dir)*20;puck.vx=p.vx;puck.vy=p.vy}
 else{
 puck.x+=puck.vx*dt;puck.y+=puck.vy*dt;puck.vx*=Math.pow(.991,dt*60);puck.vy*=Math.pow(.991,dt*60);puck.flight=Math.max(0,puck.flight-dt);
 if(puck.y<TOP+6||puck.y>BOTTOM-6){puck.y=clamp(puck.y,TOP+6,BOTTOM-6);puck.vy*=-.82}
 if(puck.x<LEFT||puck.x>RIGHT){if(Math.abs(puck.y-CY)<GOAL){score(puck.x>RIGHT?0:1);return}puck.x=clamp(puck.x,LEFT,RIGHT);puck.vx*=-.78}
 for(const p of players){if(dist(p,puck)>p.r+9)continue;
 if(p.goalie){const away=norm(puck.x-p.x,puck.y-p.y);puck.vx=away.x*260+(p.team===0?210:-210);puck.vy=away.y*250;puck.flight=.3;flash('SAVE!',.7);break}
 if(puck.flight<=0){puck.owner=p;puck.lastTeam=p.team;if(p.team===0)selected=p.i;break}
 }
 }
 if(puck.owner&&puck.owner.team===1&&Math.random()<dt*.12){const p=puck.owner;const mates=players.filter(q=>q.team===1&&!q.goalie&&q!==p);if(mates.length&&Math.random()<.55)shoot(p,true)}
 updateHud()
}
function rink(){
 ctx.fillStyle='#d4f2f5';ctx.fillRect(0,0,W,H);
 ctx.fillStyle='#b5e6ee';ctx.fillRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
 ctx.strokeStyle='#236e91';ctx.lineWidth=7;ctx.strokeRect(LEFT,TOP,RIGHT-LEFT,BOTTOM-TOP);
 ctx.strokeStyle='#d94955';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(W/2,TOP);ctx.lineTo(W/2,BOTTOM);ctx.stroke();
 for(const x of [310,650]){ctx.strokeStyle='#378ec4';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(x,TOP);ctx.lineTo(x,BOTTOM);ctx.stroke()}
 ctx.strokeStyle='#d94955';ctx.lineWidth=3;ctx.beginPath();ctx.arc(W/2,CY,70,0,Math.PI*2);ctx.stroke();
 for(const x of [180,780])for(const y of [150,410]){ctx.beginPath();ctx.arc(x,y,38,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d94955';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill()}
 ctx.fillStyle='#f8fbff';ctx.fillRect(LEFT-20,CY-GOAL,20,GOAL*2);ctx.fillRect(RIGHT,CY-GOAL,20,GOAL*2);
 ctx.strokeStyle='#d94955';ctx.lineWidth=5;ctx.strokeRect(LEFT-20,CY-GOAL,20,GOAL*2);ctx.strokeRect(RIGHT,CY-GOAL,20,GOAL*2);
 ctx.strokeStyle='#9fc9d5';ctx.lineWidth=1;for(let y=CY-GOAL+12;y<CY+GOAL;y+=12){ctx.beginPath();ctx.moveTo(LEFT-20,y);ctx.lineTo(LEFT,y);ctx.moveTo(RIGHT,y);ctx.lineTo(RIGHT+20,y);ctx.stroke()}
}
function render(){
 rink();
 for(const p of players){ctx.save();ctx.translate(p.x,p.y);
 ctx.fillStyle='#23435a33';ctx.beginPath();ctx.ellipse(3,8,p.r+3,p.r*.6,0,0,Math.PI*2);ctx.fill();
 if(p.team===0&&p.i===selected&&!p.goalie){ctx.strokeStyle='#ffda65';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,23,0,Math.PI*2);ctx.stroke()}
 ctx.rotate(p.dir);
 ctx.fillStyle=p.team===0?'#2468bd':'#d64d49';ctx.strokeStyle='#14283b';ctx.lineWidth=2;
 if(p.goalie){ctx.fillRect(-14,-15,28,30);ctx.strokeRect(-14,-15,28,30);ctx.fillStyle='#f7f5e7';ctx.fillRect(0,-9,9,18)}
 else{ctx.beginPath();ctx.ellipse(0,0,15,13,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#eaf6fc';ctx.fillRect(-3,-11,9,22);ctx.fillStyle='#182e45';ctx.fillRect(13,-4,17,3)}
 ctx.restore()}
 ctx.fillStyle='#0c1523';ctx.beginPath();ctx.arc(puck.x,puck.y,6,0,Math.PI*2);ctx.fill();
 if(puck.owner){ctx.strokeStyle='#fff9';ctx.lineWidth=2;ctx.beginPath();ctx.arc(puck.x,puck.y,8,0,Math.PI*2);ctx.stroke()}
 if(faceoffTimer>0||goalDelay>0){ctx.fillStyle='#0c233dbb';ctx.fillRect(320,238,320,70);ctx.fillStyle='#fff';ctx.font='bold 25px monospace';ctx.textAlign='center';ctx.fillText(goalDelay>0?'GOAL!':'FACEOFF',480,281)}
}
function loop(ts){if(!last)last=ts;const dt=Math.min(MAX_FRAME,(ts-last)/1000);last=ts;acc+=dt;while(acc>=fixed){step(fixed);acc-=fixed}render();requestAnimationFrame(loop)}
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','tab','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(e.repeat)return;keys.add(k);if(k==='tab')switchPlayer();if(k===' '){const p=playerControlled();if(puck.owner===p)shoot(p);else tryCheck(p)}if(k==='j')shoot(playerControlled(),true);if(k==='p'){if(mode==='playing'){mode='paused';setOverlay(true,'PAUSED','Press resume to return to the rink.','RESUME')}else if(mode==='paused'){mode='playing';setOverlay(false)}}});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
document.getElementById('start').addEventListener('click',()=>{if(mode==='paused'){mode='playing';setOverlay(false)}else startGame()});
for(const b of document.querySelectorAll('[data-key]')){const k=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(k);if(k==='tab')switchPlayer();if(k===' ') {const p=playerControlled();if(puck.owner===p)shoot(p);else tryCheck(p)}if(k==='j')shoot(playerControlled(),true)});for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>keys.delete(k))}
resetPositions();requestAnimationFrame(loop);
