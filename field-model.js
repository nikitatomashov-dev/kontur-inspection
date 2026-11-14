import {createFieldDefect, listStructures} from './domain.js';

const searchText=value=>String(value??'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/[‐‑–—]/g,'-');
export function searchProject(project,{query='',kind='',drawingId=''}={}) {
  const structures=new Map(listStructures().map(s=>[s.id,s.label]));
  const drawings=new Map(project.drawings.map(d=>[d.id,d]));
  const tokens=searchText(query).trim().split(/\s+/).filter(Boolean);
  const number=searchText(query).trim().match(/^(?:(?:№|#)\s*|([пp])\s*)?(\d+)$/);
  const results=[];
  function add(record,type,placements){
    if(kind&&kind!==type)return;
    const places=drawingId?placements.filter(p=>p.drawingId===drawingId):placements;
    if(drawingId&&!places.length)return;
    const label=type==='defect'?`Дефект № ${record.number}`:type==='strength'?`Точка П${record.number}`:record.name;
    const locations=[...new Set(places.map(p=>{const d=drawings.get(p.drawingId);return [d?.name,d?.floor?`Этаж ${d.floor}`:'',p.location].filter(Boolean).join(' · ');} ))];
    if(type==='measure'&&record.floor)locations.push(`Этаж ${record.floor}`);
    const description=[record.title,structures.get(record.structure),record.construction,record.location,record.cause,record.note,...(record.photos??[]).map(p=>p.caption),...(record.labels??[]).map(l=>l.text)].filter(Boolean).join(' · ');
    const haystack=searchText([label,description,...locations].join(' '));
    if(number){if(type==='measure'||record.number!==Number(number[2])||(number[1]&&type!=='strength'))return;}
    else if(!tokens.every(t=>haystack.includes(t)))return;
    results.push({id:record.id,kind:type,label,description,location:locations.join('; '),placementId:places[0]?.id});
  }
  for(const d of project.defects)add(d,'defect',d.placements);
  for(const p of project.strengthPoints??[])add(p,'strength',[{drawingId:p.drawingId}]);
  for(const s of project.measureSketches??[])add(s,'measure',s.drawingId?[{drawingId:s.drawingId}]:[]);
  return results;
}

export function repeatDefect(project, source, drawingId, point, zone=null) {
  const record=createFieldDefect(project,drawingId,source.structure,point,zone);
  for(const key of ['material','templateId','title','cause','unit']) record[key]=source[key];
  // Measurements, photos and assessment belong to the new location and require review.
  return record;
}
export function pendingWork(project) {
  const items=[];
  for(const d of project.defects){
    const missing=[];
    if(d.workflow==='draft')missing.push('черновик');
    if(!d.title?.trim())missing.push('описание');
    if(!d.photos?.length)missing.push('фото');
    if(d.quantity==null)missing.push('объём');
    if(d.category==='not_assessed')missing.push('категория');
    if(!d.cause?.trim())missing.push('вероятная причина');
    if(missing.length)items.push({kind:'defect',id:d.id,label:`Дефект № ${d.number}`,missing});
  }
  for(const p of project.strengthPoints??[]){
    const missing=[];
    if(p.pullOff.value==null)missing.push('отрыв');
    if(!p.ultrasound.values.length)missing.push('значения УЗ');
    if(!project.drawings.find(d=>d.id===p.drawingId)?.floor?.trim())missing.push('этаж');
    if(missing.length)items.push({kind:'strength',id:p.id,label:`Точка П${p.number}`,missing});
  }
  return items;
}
export function constructionCards(project) {
  const cards=new Map();
  function add(record,drawingId,kind){
    if(!record.construction?.trim())return;
    const code=record.construction.trim(),key=JSON.stringify([drawingId,record.structure,code.toLocaleLowerCase('ru')]);
    if(!cards.has(key))cards.set(key,{key,code,drawingId,structure:record.structure,defects:[],strengths:[],sketches:[]});
    const c=cards.get(key);if(!c[kind].some(r=>r.id===record.id))c[kind].push(record);
  }
  for(const d of project.defects)for(const p of d.placements)add(d,p.drawingId,'defects');
  for(const p of project.strengthPoints??[])add(p,p.drawingId,'strengths');
  for(const s of project.measureSketches??[])if(s.drawingId)add(s,s.drawingId,'sketches');
  return [...cards.values()].map(c=>({...c,label:listStructures().find(s=>s.id===c.structure)?.label??c.structure,drawing:project.drawings.find(d=>d.id===c.drawingId)}));
}
