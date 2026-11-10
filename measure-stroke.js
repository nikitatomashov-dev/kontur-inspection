// Coordinates relative to the chord keep shared endpoints attached when moved.
export function strokeProfile(points){
  const a=points[0],b=points.at(-1),dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy);
  if(L<1)throw new Error('Нарисуйте отдельный отрезок или дугу с разными концами.');
  return points.map(p=>({u:((p.x-a.x)*dx+(p.y-a.y)*dy)/(L*L),v:((p.y-a.y)*dx-(p.x-a.x)*dy)/(L*L)}));
}
export function recognizeStroke(profile,mode='auto'){
  const middle=profile.filter(p=>p.u>.15&&p.u<.85);
  const peak=middle.reduce((best,p)=>Math.abs(p.v)>Math.abs(best)?p.v:best,0);
  const bulge=Math.max(-1,Math.min(1,peak));
  if(mode==='line')return {shape:'line'};
  if(mode==='free')return {shape:'free'};
  if(mode==='arc'){
    if(Math.abs(bulge)<.025)throw new Error('Недостаточно изгиба для дуги. Нарисуйте её более выраженно.');
    return {shape:'arc',bulge};
  }
  const max=Math.max(...profile.map(p=>Math.abs(p.v)));
  if(max<.045)return {shape:'line'};
  // Accept only a consistent circular bend; preserve complex strokes as drawn.
  const r=(.25+bulge*bulge)/(2*Math.abs(bulge||.001));
  const center=bulge-Math.sign(bulge)*r;
  const error=Math.sqrt(profile.reduce((sum,p)=>sum+(Math.hypot(p.u-.5,p.v-center)-r)**2,0)/profile.length);
  const oneSide=profile.filter(p=>p.v*bulge<-.002).length/profile.length<.1;
  const forward=profile.every((p,i)=>!i||p.u>=profile[i-1].u-.08);
  return Math.abs(bulge)>=.06&&Math.abs(bulge)<=.55&&error<.035&&oneSide&&forward?{shape:'arc',bulge}:{shape:'free'};
}
export function nearestEndpoint(nodes,p,radius){
  let best=null,distance=radius;for(const n of nodes){const d=Math.hypot(n.x-p.x,n.y-p.y);if(d<distance){best=n;distance=d;}}return best;
}
export function strokePath(a,b,e){
  const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),start=`M${a.x} ${a.y}`;
  if(e.shape==='arc'){
    const q=e.bulge,r=L*(.25+q*q)/(2*Math.abs(q));
    return `${start} A${r} ${r} 0 ${Math.abs(q)>.5?1:0} ${q>0?0:1} ${b.x} ${b.y}`;
  }
  if(e.shape==='free')return start+e.stroke.slice(1,-1).map(p=>` L${a.x+p.u*dx-p.v*dy} ${a.y+p.u*dy+p.v*dx}`).join('')+` L${b.x} ${b.y}`;
  return `${start} L${b.x} ${b.y}`;
}
export function addStroke(sketch,points,{radius=35,mode='auto',id}){
  const next=structuredClone(sketch);
  let a=nearestEndpoint(next.nodes,points[0],radius),b=nearestEndpoint(next.nodes,points.at(-1),radius);
  if(a&&b&&a.id===b.id)throw new Error('Концы совпали. Рисуйте контур несколькими отдельными штрихами.');
  a??={id:id(),...points[0]};b??={id:id(),...points.at(-1)};
  const anchored=[a,...points.slice(1,-1),b],stroke=strokeProfile(anchored),shape=recognizeStroke(stroke,mode);
  if(!next.nodes.some(n=>n.id===a.id))next.nodes.push(a);
  if(!next.nodes.some(n=>n.id===b.id))next.nodes.push(b);
  const edge={id:id(),a:a.id,b:b.id,kind:'wall',stroke,...shape};next.edges.push(edge);
  return {next,edge};
}
