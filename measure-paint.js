export function brushPath(points){return points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ') + (points.length===1?` L${points[0].x} ${points[0].y}`:'');}
// Clip every segment against a circular eraser, including long sparse segments.
export function eraseBrushes(brushes,center,radius,uid){
 const result=[];
 for(const brush of brushes){
  const r=radius+brush.width/2,inside=p=>Math.hypot(p.x-center.x,p.y-center.y)<r;
  if(brush.points.length===1){if(!inside(brush.points[0]))result.push(brush);continue;}
  const parts=[];let current=[],changed=false;
  const flush=()=>{if(current.length>1)parts.push(current);current=[];};
  for(let i=1;i<brush.points.length;i++){
   const a=brush.points[i-1],b=brush.points[i],dx=b.x-a.x,dy=b.y-a.y,A=dx*dx+dy*dy,ox=a.x-center.x,oy=a.y-center.y;
   if(A<1e-16)continue;
   const B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-r*r,D=B*B-4*A*C,cuts=[0,1];
   if(D>0)for(const t of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])if(t>0&&t<1)cuts.push(t);
   cuts.sort((x,y)=>x-y);const at=t=>({x:a.x+t*dx,y:a.y+t*dy});
   for(let k=1;k<cuts.length;k++){
    const lo=cuts[k-1],hi=cuts[k];if(inside(at((lo+hi)/2))){changed=true;flush();continue;}
    const p=at(lo),q=at(hi);if(current.length&&Math.hypot(current.at(-1).x-p.x,current.at(-1).y-p.y)>1e-5)flush();if(!current.length)current.push(p);current.push(q);
   }
  }
  flush();if(!changed){result.push(brush);continue;}
  parts.forEach((points,i)=>result.push({...brush,id:i?uid():brush.id,points}));
 }
 return result;
}
