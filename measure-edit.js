export function copyElement(sketch,selected,id,offset=40){
  const next=structuredClone(sketch),source=next[selected.kind]?.find(x=>x.id===selected.id);
  if(!source)throw new Error('Выберите элемент.');
  const copy=structuredClone(source);copy.id=id();
  if(['edges','dimensions'].includes(selected.kind)){
    for(const key of ['a','b']){const node=structuredClone(next.nodes.find(n=>n.id===source[key]));node.id=id();node.x+=offset;node.y+=offset;next.nodes.push(node);copy[key]=node.id;}
  }else if(selected.kind==='brushes')copy.points=copy.points.map(p=>({x:p.x+offset,y:p.y+offset}));
  else{copy.x+=offset;copy.y+=offset;}
  next[selected.kind].push(copy);return {next,selected:{kind:selected.kind,id:copy.id}};
}
