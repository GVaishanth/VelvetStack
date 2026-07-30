const cards=[...document.querySelectorAll('.game-card')];cards.forEach((card,i)=>{card.style.setProperty('--i',i);card.addEventListener('mousemove',e=>{const r=card.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;card.style.transform=`translateY(-7px) rotateY(${x*4}deg) rotateX(${y*-4}deg)`});card.addEventListener('mouseleave',()=>card.style.transform='')});
const deck=document.querySelector('.hero-deck');if(deck){window.addEventListener('pointermove',e=>{const x=(e.clientX/innerWidth-.5)*10,y=(e.clientY/innerHeight-.5)*6;deck.style.marginLeft=`${x}px`;deck.style.marginTop=`${y}px`})}

// Ambient light follows the pointer, giving the home room quiet depth without moving UI controls.
(function velvetAmbientMotion(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let queued=false, x=0, y=0;
  const paint=()=>{queued=false;document.body.style.setProperty('--motion-x',`${x*7}%`);document.body.style.setProperty('--motion-y',`${y*5}%`)};
  addEventListener('pointermove',e=>{x=e.clientX/innerWidth-.5;y=e.clientY/innerHeight-.5;if(!queued){queued=true;requestAnimationFrame(paint)}},{passive:true});
})();

(function librarySettings(){
  const modal=document.querySelector('#librarySettingsModal'),open=document.querySelector('#librarySettings'),close=document.querySelector('#closeLibrarySettings'),toggle=document.querySelector('#ambientToggle');
  if(!modal||!open||!close||!toggle)return;
  const enabled=localStorage.getItem('velvet-stack-ambient')!=='off';
  toggle.checked=enabled;document.body.classList.toggle('no-ambient',!enabled);
  open.onclick=()=>modal.classList.remove('hidden');close.onclick=()=>modal.classList.add('hidden');
  toggle.onchange=()=>{const on=toggle.checked;localStorage.setItem('velvet-stack-ambient',on?'on':'off');document.body.classList.toggle('no-ambient',!on)};
})();

// Decorative card meteors: lightweight physical-card drift with chip bursts on contact.
(function velvetCardMeteors(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer=document.querySelector('.ambient-cards');
  if(!layer) return;
  layer.querySelectorAll('i').forEach(x=>x.remove());
  const suits=['♠','♥','♦','♣'], ranks=['A','K','Q','J','10','9','8','7','6','5','4','3','2'];
  const unoFaces=['+2','+4','↻','⊘','WILD','0','1','2','3','4','5','6','7','8','9'], isUno=document.body.classList.contains('uno');
  // The revealed loading cards become this page's meteor cards.
  const faces=window.__velvetAmbientFaces || (window.__velvetAmbientFaces=Array.from({length:5},(_,i)=>{
    const uno=isUno;
    return uno ? {uno:true,label:unoFaces[Math.floor(Math.random()*unoFaces.length)]} : {rank:ranks[Math.floor(Math.random()*ranks.length)],suit:suits[Math.floor(Math.random()*suits.length)]};
  }));
  // Match the loading row exactly, then fling the revealed cards outward into the room.
  const dealWidth=76, dealStep=59, startX=innerWidth/2-(dealWidth+(faces.length-1)*dealStep)/2, startY=innerHeight/2-28;
  const cards=faces.map((face,index)=>{
    const el=document.createElement('div'),uno=!!face.uno,suit=face.suit||'';
    el.className='ambient-card'+((suit==='♥'||suit==='♦')?' red':'')+(uno?' uno':'');
    el.innerHTML=uno ? `<span>${face.label}</span>` : `<b class="ac-rank">${face.rank}</b><b class="ac-suit">${suit}</b><b class="ac-center">${suit}</b>`;
    layer.append(el);
    const launch=[[-.82,.06],[-.28,-.74],[0,.86],[.28,-.74],[.82,.06]][index]||[0,.15];return {el,x:startX+index*dealStep,y:startY,vx:launch[0],vy:launch[1],rot:(index-(faces.length-1)/2)*3,vr:(Math.random()-.5)*.08,lastHit:0};
  });
  const burst=(x,y)=>{for(let n=0;n<6;n++){const chip=document.createElement('i');chip.className='ambient-chip';chip.style.left=x+'px';chip.style.top=y+'px';chip.style.setProperty('--chip-x',(Math.random()*90-45)+'px');chip.style.setProperty('--chip-y',(Math.random()*90-45)+'px');document.body.append(chip);setTimeout(()=>chip.remove(),750)}};
  let last=performance.now(), launchedAt=0;
  const tick=now=>{const step=Math.min(2.2,(now-last)/16.7);last=now;
    if(!document.body.classList.contains('no-ambient')){
      cards.forEach(c=>{c.x+=c.vx*step;c.y+=c.vy*step;c.rot+=c.vr*step;if(c.x<-90||c.x>innerWidth+20)c.vx*=-1;if(c.y<-120||c.y>innerHeight+20)c.vy*=-1;c.el.style.transform=`translate3d(${c.x}px,${c.y}px,0) rotate(${c.rot}deg)`});
      for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++){const A=cards[a],B=cards[b];const hit=A.x < B.x+74 && A.x+74 > B.x && A.y < B.y+106 && A.y+106 > B.y;if(launchedAt&&now-launchedAt>3000&&hit&&now-A.lastHit>700){A.lastHit=B.lastHit=now;const overlapX=Math.min(A.x+74,B.x+74)-Math.max(A.x,B.x),overlapY=Math.min(A.y+106,B.y+106)-Math.max(A.y,B.y);const edgeX=(Math.max(A.x,B.x)+Math.min(A.x+74,B.x+74))/2,edgeY=(Math.max(A.y,B.y)+Math.min(A.y+106,B.y+106))/2;if(overlapX<overlapY){const dir=(A.x+37)<(B.x+37)?-1:1,push=overlapX/2+3;A.x+=dir*push;B.x-=dir*push;A.vx=dir*Math.min(.34,Math.max(.18,Math.abs(A.vx)*1.08));B.vx=-dir*Math.min(.34,Math.max(.18,Math.abs(B.vx)*1.08))}else{const dir=(A.y+53)<(B.y+53)?-1:1,push=overlapY/2+3;A.y+=dir*push;B.y-=dir*push;A.vy=dir*Math.min(.34,Math.max(.18,Math.abs(A.vy)*1.08));B.vy=-dir*Math.min(.34,Math.max(.18,Math.abs(B.vy)*1.08))}A.vr*=-1.08;B.vr*=-1.08;burst(edgeX,edgeY)}}
    } requestAnimationFrame(tick)};
  // Keep the revealed loading cards in focus, then release this same set into the background.
  setTimeout(()=>{launchedAt=performance.now();requestAnimationFrame(tick)},2050);
})();

// Brief deal-in: the exact cards revealed here become the ambient meteor deck.
(function velvetDealIn(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { document.body.classList.remove('velvet-loading'); return; }
  const faces=window.__velvetAmbientFaces;if(!faces){document.body.classList.remove('velvet-loading');return;}
  const overlay=document.createElement('div');overlay.className='deal-loader';
  const title=document.createElement('div');title.className='deal-loader-title';title.textContent='VELVET STACK';overlay.append(title);
  const row=document.createElement('div');row.className='deal-loader-row';
  faces.forEach((face,i)=>{const c=document.createElement('div'),s=face.suit||'';c.className='deal-loader-card '+((s==='♥'||s==='♦')?'red':'')+(face.uno?' uno':'');c.style.setProperty('--deal-delay',i*.18+'s');c.innerHTML=face.uno?`<b>${face.label}</b>`:`<b>${face.rank}</b><span>${s}</span><em>${s}</em>`;row.append(c)});overlay.append(row);document.body.append(overlay);
  setTimeout(()=>{overlay.classList.add('exit');setTimeout(()=>{overlay.remove();document.body.classList.remove('velvet-loading')},1050)},1850);
})();
