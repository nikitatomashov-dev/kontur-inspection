import {buildDocx,zip} from './docx-export.js';
import {sketchSvg} from './measure-model.js';
import {drawDefectZone,drawDefectMarker} from './appearance.js';
import {pendingWork} from './field-model.js';
import {listStructures} from './domain.js';
import {pullStrength} from './calibration-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function strengthReport(project){
  const rows=[...(project.strengthPoints??[])].sort((a,b)=>a.structure.localeCompare(b.structure)||a.number-b.number).map(p=>{const d=project.drawings.find(d=>d.id===p.drawingId),r=pullStrength(p);return `<tr><td>П${p.number}</td><td>${esc(d?.floor||'Не указан')}<br>${esc(d?.name)}</td><td>${esc(listStructures().find(s=>s.id===p.structure)?.label)}<br>${esc(p.construction)}<br>${esc(p.location)}</td><td>${esc(p.calibration?.series)}</td><td>${p.pullOff.value??'Нет'} ${esc(p.pullOff.unit)}</td><td>${p.ultrasound.values.join('; ')} ${esc(p.ultrasound.unit)}</td><td>${r.value==null?esc(r.error):r.value.toFixed(3)+' МПа'}</td><td>${esc(p.note)}</td></tr>`;});
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Прочности</title><style>body{font:14px Arial;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:8px}th{background:#eee}@page{size:A4 landscape}</style><h1>${esc(project.name)} — прочности</h1><p>Исходные показания сохранены отдельно от расчётной прочности. Категория и класс автоматически не назначаются.</p><table><tr><th>Точка</th><th>Этаж / чертёж</th><th>Конструкция</th><th>Серия</th><th>Исходный отрыв</th><th>Исходный УЗ</th><th>Расчёт отрыва</th><th>Примечание</th></tr>${rows.join('')}</table><h2>Фотографии исследований</h2>${(project.strengthPoints??[]).map(p=>`<section><h3>Точка П${p.number}</h3>${(p.photos??[]).map(photo=>`<figure><img style="max-width:600px;max-height:500px" src="${esc(photo.imageData)}" alt="${esc(photo.name)}"><figcaption>${esc(photo.caption)}</figcaption></figure>`).join('')}</section>`).join('')}</html>`;
}
export async function exportBundle(source,download){
  const p=structuredClone(source),files=[['Объект.kontur.json',JSON.stringify(p)],['Прочности.html',strengthReport(p)],['Проверить.txt',pendingWork(p).map(i=>i.label+': '+i.missing.join(', ')).join('\n')||'Пропусков по проверяемым полям нет.']];
  files.push(['Ведомость дефектов.docx',new Uint8Array(await (await buildDocx(p)).arrayBuffer())]);
  for(const [index,d] of p.drawings.entries()){
    const image=new Image();image.src=d.imageData;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=d.width;canvas.height=d.height+80;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(image,0,0,d.width,d.height);
    for(const defect of p.defects)for(const pos of defect.placements.filter(x=>x.drawingId===d.id)){
      if(pos.zone){const z=pos.zone;drawDefectZone(c,{x:z.x*d.width,y:z.y*d.height,width:z.width*d.width,height:z.height*d.height},defect.number);}
      drawDefectMarker(c,pos.x*d.width,pos.y*d.height,Math.max(16,d.width/65),defect.number);
    }
    c.fillStyle='#17342f';c.font='20px Arial';c.fillText(d.name+(d.floor?' · Этаж: '+d.floor:''),20,d.height+40,d.width-40);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Не удалось сформировать карту.');files.push([`Карты/Чертёж-${index+1}.png`,new Uint8Array(await blob.arrayBuffer())]);canvas.width=1;canvas.height=1;
  }
  for(const [index,s] of (p.measureSketches??[]).entries())files.push([`Обмеры/Эскиз-${index+1}.svg`,sketchSvg(s,{projectName:p.name})]);
  const archive=zip(files);download(new Blob([archive],{type:'application/zip'}),'Контур — комплект объекта.zip','application/zip');
}
