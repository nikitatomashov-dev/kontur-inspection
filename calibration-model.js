// ГОСТ 22690-2015, В.1, table В.1 and 7.6.3–7.6.5;
// ГОСТ 17624-2021, 6.2 and appendix Б (Б.8 corrected in 2025).
export const ANCHORS = [
  {id:'I-14-35',label:'I · Ø14 · h35 мм',h:35,min:45,max:75,heavy:2.4,light:null},
  {id:'I-14-48',label:'I · Ø14 · h48 мм',h:48,min:10,max:50,heavy:1.1,light:1.2},
  {id:'II-16-35',label:'II · Ø16 · h35 мм',h:35,min:40,max:75,heavy:1.7,light:null},
  {id:'II-24-48',label:'II · Ø24 · h48 мм',h:48,min:5,max:75,heavy:.9,light:1},
  {id:'III-28-35',label:'III · Ø28 · h35 мм',h:35,min:10,max:50,heavy:1.5,light:null},
];
const positive = v => Number.isFinite(v) && v > 0;
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
export function validateCalibration(c) {
  if(c===undefined)return [];
  if(!c||typeof c!=='object'||Array.isArray(c))return ['Некорректные параметры градуировки.'];
  const errors=[];
  for(const key of ['series','excludeReason'])if(c[key]!==undefined&&(typeof c[key]!=='string'||c[key].length>500))errors.push('Некорректная серия или причина исключения.');
  if(c.anchorId!==undefined&&c.anchorId!==''&&!ANCHORS.some(a=>a.id===c.anchorId))errors.push('Неизвестный анкер.');
  if(c.concrete!==undefined&&!['','heavy','light'].includes(c.concrete))errors.push('Неизвестный вид бетона.');
  if(c.standard!==undefined&&typeof c.standard!=='boolean')errors.push('Некорректное подтверждение схемы испытания.');
  for(const key of ['aggregateMm','slipMm','baseMm'])if(c[key]!==undefined&&c[key]!==null&&(!Number.isFinite(c[key])||c[key]<0||c[key]>10000))errors.push('Некорректные размеры для градуировки.');
  return errors;
}
export function pullStrength(point) {
  const p=point.pullOff,c=point.calibration??{};
  if(!positive(p?.value))return {value:null,error:'Нет результата отрыва'};
  if(p.unit==='МПа')return {value:p.value,source:'Введено в МПа'};
  if(p.unit!=='кН')return {value:null,error:'Неизвестная единица отрыва'};
  const anchor=ANCHORS.find(a=>a.id===c.anchorId),m2=anchor?.[c.concrete];
  if(!anchor||!positive(m2))return {value:null,error:'Выберите анкер и допустимый вид бетона'};
  if(!positive(c.aggregateMm)||c.aggregateMm>=50)return {value:null,error:'Для m₁ = 1 нужна крупность заполнителя менее 50 мм'};
  if(!Number.isFinite(c.slipMm)||c.slipMm<0)return {value:null,error:'Укажите проскальзывание Δh (0, если отсутствует)'};
  if(!c.standard)return {value:null,error:'Подтвердите стандартную схему и пригодность вырыва'};
  if(c.slipMm>0.1*anchor.h)return {value:null,error:'Δh > 10% глубины — результат не учитывается (7.6.5)'};
  const gamma=(anchor.h/(anchor.h-c.slipMm))**2;
  const value=m2*p.value*gamma;
  let error=null;
  if(c.slipMm>.05*anchor.h||gamma>1.1)error='Только ориентировочная оценка: проскальзывание (7.6.4)';
  else if(value<anchor.min||value>anchor.max||(c.concrete==='light'&&(value<5||value>40)))error='Результат вне диапазона таблицы В.1';
  else if(c.concrete==='heavy'&&value>70)error='Свыше 70 МПа: требуется проверка средней прочности и коэффициентов по ГОСТ 31914';
  return {value,error,m1:1,m2,gamma,source:'Расчёт по В.1 и 7.6.3'};
}
export function ultrasoundSpeed(point) {
  const u=point.ultrasound,base=point.calibration?.baseMm;
  if(!u?.values?.length||!u.values.every(positive))return {value:null,error:'Нет корректных измерений УЗК'};
  if(u.unit==='МПа')return {value:null,error:'Для R(V) нужны скорость м/с или время мкс с базой, а не показания МПа'};
  if(u.unit!=='м/с'&&u.unit!=='мкс')return {value:null,error:'Неизвестная единица УЗК'};
  if(base!==undefined&&base!==null&&(!positive(base)||base<120))return {value:null,error:'База поверхностного УЗК должна быть ≥ 120 мм'};
  if(u.unit==='мкс'&&(!positive(base)||base<120))return {value:null,error:'Для поверхностного УЗК в мкс укажите базу ≥ 120 мм'};
  const value=mean(u.values.map(v=>u.unit==='м/с'?v:1000*base/v));
  return {value,error:u.values.length<2?'Нужно не менее двух измерений УЗК на участке (6.2.3)':null};
}
export function calibrationRows(project,structure,series='') {
  const drawings=new Map(project.drawings.map(d=>[d.id,d]));
  return (project.strengthPoints??[]).filter(p=>p.structure===structure&&(p.calibration?.series?.trim()??'')===series).sort((a,b)=>a.number-b.number).map(point=>{
    const strength=pullStrength(point),speed=ultrasoundSpeed(point);
    return {point,drawing:drawings.get(point.drawingId),strength,speed,error:point.calibration?.excludeReason?`Исключено: ${point.calibration.excludeReason}`:[strength.error,speed.error].filter(Boolean).join('; ')};
  });
}
export function fitCalibration(rows) {
  const pairs=rows.filter(row=>!row.error&&positive(row.speed.value)&&positive(row.strength.value));
  const n=pairs.length,issues=[];
  if(n<3)return {n,pairs,issues:['Для расчёта прямой и остаточного отклонения нужны хотя бы 3 полные пары. Для применения — не менее 12.'],fit:null};
  const x= pairs.map(p=>p.speed.value),y=pairs.map(p=>p.strength.value),mx=mean(x),my=mean(y);
  const sxx=x.reduce((s,v)=>s+(v-mx)**2,0),syy=y.reduce((s,v)=>s+(v-my)**2,0);
  if(sxx<=Number.EPSILON*Math.max(1,mx*mx)*n||syy<=Number.EPSILON*Math.max(1,my*my)*n)return {n,pairs,issues:['Недостаточный разброс скорости или прочности: зависимость не определяется.'],fit:null};
  const sxy=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0),a=sxy/sxx,b=my-a*mx;
  const residuals=pairs.map((p,i)=>({id:p.point.id,number:p.point.number,predicted:a*x[i]+b,residual:a*x[i]+b-y[i]}));
  const S=Math.sqrt(residuals.reduce((s,p)=>s+p.residual**2,0)/(n-2));
  // Corrected Б.8 correlates predicted and measured strengths (not V and R).
  const r=Math.min(1,Math.abs(sxy/Math.sqrt(sxx*syy)));
  const outliers=residuals.filter(p=>Math.abs(p.residual)>2*S+1e-9*Math.max(1,my));
  const spread=my<=20?.5:my<=50?.4:my<=80?.3:.2;
  if(n<12)issues.push(`Пар: ${n}; требуется не менее 12 (6.2.2).`);
  if(a<=0)issues.push('Неположительный наклон R(V): проверьте исходные данные и условия испытаний.');
  if(r<.7)issues.push('Коэффициент корреляции r < 0,7.');
  if(S/my>.15)issues.push('Остаточное отклонение превышает 15% средней прочности.');
  if(y.some(v=>v<my*(1-spread)-1e-9||v>my*(1+spread)+1e-9))issues.push('Диапазон исходных прочностей не соответствует 6.1.7.');
  if(outliers.length)issues.push(`Отклонение более 2S: ${outliers.map(p=>'П'+p.number).join(', ')}. Проверьте результаты по Б.2; автоматического удаления нет.`);
  return {n,pairs,issues,fit:{a,b,S,r,relativeS:S/my,meanR:my,minV:Math.min(...x),maxV:Math.max(...x),residuals,outliers}};
}
