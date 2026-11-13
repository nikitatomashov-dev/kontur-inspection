import { validateCalibration } from './calibration-model.js';
export function measurementValue(text) {
  const value=String(text ?? '').trim().replace(',', '.');
  if(!value)return null;
  if(!/^\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>1e9)throw new Error('Введите положительное число (можно с десятичной запятой).');
  return Number(value);
}
export function validateStrengthPoints(points, drawings, structures) {
  if(points===undefined)return [];
  if(!Array.isArray(points)||points.length>10000)return ['Некорректный список точек прочности (не более 10 000).'];
  const errors=[],ids=new Set(),numbers=new Set();
  const text=(v,n)=>typeof v==='string'&&v.length<=n;
  const value=v=>Number.isFinite(v)&&v>0&&v<=1e9;
  for(const p of points){
    if(!p||typeof p!=='object'){errors.push('Некорректная точка прочности.');continue;}
    errors.push(...validateCalibration(p.calibration));
    if(p.photos!==undefined){
      if(!Array.isArray(p.photos)||p.photos.length>12)errors.push('До 12 фото на точку прочности.');
      else{const photoIds=new Set();for(const photo of p.photos){
        if(!photo||!text(photo.id,100)||!photo.id||photoIds.has(photo.id)||!text(photo.name,500)||!text(photo.caption,2000)||![photo.width,photo.height].every(v=>Number.isInteger(v)&&v>0&&v<=1600)||typeof photo.imageData!=='string'||!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.imageData))errors.push('Некорректная фотография точки прочности.');
        if(photo)photoIds.add(photo.id);
      }}
    }
    if(p.construction!==undefined&&!text(p.construction,200))errors.push('Некорректная марка конструкции.');
    if(!text(p.id,100)||!p.id||ids.has(p.id)||!Number.isSafeInteger(p.number)||p.number<1||p.number>99999999||numbers.has(p.number))errors.push('Повторяющийся или некорректный номер/ID точки прочности.');
    ids.add(p.id);numbers.add(p.number);
    if(!drawings.some(d=>d.id===p.drawingId)||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))errors.push('Некорректное положение точки прочности.');
    if(!structures.includes(p.structure)||!text(p.location,500)||!text(p.note,10000))errors.push('Некорректная конструкция или описание точки прочности.');
    if(!p.pullOff||!['МПа','кН'].includes(p.pullOff.unit)||(p.pullOff.value!==null&&!value(p.pullOff.value)))errors.push('Некорректное значение отрыва со скалыванием.');
    if(!p.ultrasound||!['м/с','мкс','МПа'].includes(p.ultrasound.unit)||!Array.isArray(p.ultrasound.values)||p.ultrasound.values.length>100||!p.ultrasound.values.every(value))errors.push('Некорректные значения ультразвукового исследования (до 100).');
  }
  return errors.slice(0,40);
}
