import {zoomCamera} from './measure-space.js';
export function attachMeasureNavigation({viewport,getCamera,setCamera,getMode,cancelDrawing}){
  const touches=new Map();let pan=null,pinch=null,navigating=false,suppress=0;
  const stop=e=>{e.preventDefault();e.stopPropagation();};
  const center=()=>{const [a,b]=[...touches.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
  const local=p=>{const r=viewport.getBoundingClientRect();return {x:p.x-r.left,y:p.y-r.top};};
  viewport.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch')return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size>=2){stop(e);cancelDrawing();navigating=true;pan=null;pinch=center();for(const id of touches.keys())viewport.setPointerCapture(id);}
    else {navigating=false;pan=getMode()==='pan'?{id:e.pointerId,x:e.clientX,y:e.clientY,camera:getCamera()}:null;}
  },{capture:true});
  viewport.addEventListener('pointermove',e=>{
    if(!touches.has(e.pointerId))return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size>=2&&pinch){stop(e);const next=center(),cam=zoomCamera(getCamera(),pinch.d?next.d/pinch.d:1,local(pinch));cam.x-=(next.x-pinch.x)/cam.scale;cam.y-=(next.y-pinch.y)/cam.scale;setCamera(cam);pinch=next;}
    else if(navigating)stop(e);
    else if(pan?.id===e.pointerId){const dx=e.clientX-pan.x,dy=e.clientY-pan.y;if(pan.moved||Math.hypot(dx,dy)>5){stop(e);pan.moved=true;viewport.setPointerCapture(e.pointerId);setCamera({...pan.camera,x:pan.camera.x-dx/pan.camera.scale,y:pan.camera.y-dy/pan.camera.scale});}}
  },{capture:true,passive:false});
  const end=e=>{if(!touches.has(e.pointerId))return;if(navigating||pan?.moved){stop(e);suppress=Date.now()+500;}touches.delete(e.pointerId);pinch=touches.size>=2?center():null;if(!touches.size){pan=null;navigating=false;}};
  viewport.addEventListener('pointerup',end,{capture:true});viewport.addEventListener('pointercancel',end,{capture:true});
  viewport.addEventListener('click',e=>{if(Date.now()<suppress)stop(e);},{capture:true});
  viewport.addEventListener('wheel',e=>{stop(e);cancelDrawing();setCamera(zoomCamera(getCamera(),Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.003),local({x:e.clientX,y:e.clientY})));},{passive:false});
}
