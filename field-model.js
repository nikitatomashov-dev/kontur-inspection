import {createFieldDefect, listStructures} from './domain.js';

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
