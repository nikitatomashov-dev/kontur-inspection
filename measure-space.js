// World coordinates and a viewport camera; no enormous DOM canvas is allocated.
export const WORLD_LIMIT=1e9;
export const MIN_SCALE=1e-7,MAX_SCALE=6;
export function fitCamera(bounds,width,height){
  const scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,(width-60)/bounds.width,(height-60)/bounds.height));
  return {scale,x:bounds.x+bounds.width/2-width/(2*scale),y:bounds.y+bounds.height/2-height/(2*scale)};
}
export function zoomCamera(camera,factor,anchor){
  const scale=Math.max(MIN_SCALE,Math.min(MAX_SCALE,camera.scale*factor));
  return {scale,x:camera.x+anchor.x/camera.scale-anchor.x/scale,y:camera.y+anchor.y/camera.scale-anchor.y/scale};
}
export function contentBounds(sketch){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const add=(x,y,pad=10)=>{minX=Math.min(minX,x-pad);minY=Math.min(minY,y-pad);maxX=Math.max(maxX,x+pad);maxY=Math.max(maxY,y+pad);};
  for(const b of sketch.brushes??[])for(const p of b.points)add(p.x,p.y,b.width/2+10);
  const nodes=new Map(sketch.nodes.map(n=>[n.id,n]));
  for(const n of sketch.nodes)add(n.x,n.y);
  for(const e of sketch.edges){const a=nodes.get(e.a),b=nodes.get(e.b),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
    if(e.kind==='door'){add(a.x+dy,a.y-dx);add(b.x+dy,b.y-dx);}
    if(e.shape==='free')for(const p of e.stroke)add(a.x+p.u*dx-p.v*dy,a.y+p.u*dy+p.v*dx);
    if(e.shape==='arc'){
      const q=e.bulge,r=L*(.25+q*q)/(2*Math.abs(q)),h=L*q-Math.sign(q)*r;
      const cx=(a.x+b.x)/2-dy/L*h,cy=(a.y+b.y)/2+dx/L*h;
      const start=Math.atan2(a.y-cy,a.x-cx),sweep=-4*Math.atan(2*q),tau=2*Math.PI;
      for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]){const distance=((sweep>0?angle-start:start-angle)%tau+tau)%tau;if(distance<=Math.abs(sweep)+1e-9)add(cx+r*Math.cos(angle),cy+r*Math.sin(angle));}
    }
  }
  for(const d of sketch.dimensions){const a=nodes.get(d.a),b=nodes.get(d.b),L=Math.hypot(b.x-a.x,b.y-a.y),nx=-(b.y-a.y)/L,ny=(b.x-a.x)/L;
    for(const n of [a,b])add(n.x+nx*d.offset,n.y+ny*d.offset);
    const x=(a.x+b.x)/2+nx*d.offset,y=(a.y+b.y)/2+ny*d.offset,w=(String(d.value).length+d.unit.length+1)*5+10;add(x-w,y-15);add(x+w,y+15);
  }
  for(const l of sketch.labels){const lines=l.text.split('\n');add(l.x,l.y-22);add(l.x+Math.max(...lines.map(s=>s.length))*20,l.y+lines.length*24);}
  if(!Number.isFinite(minX))return {x:0,y:0,width:1000,height:700};
  return {x:minX-20,y:minY-20,width:Math.max(100,maxX-minX+40),height:Math.max(100,maxY-minY+40)};
}
