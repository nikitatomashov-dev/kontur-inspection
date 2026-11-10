import { listStructures } from './domain.js';
import { calibrationRows, fitCalibration } from './calibration-model.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=3)=>Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:d}):'—';
const SOURCE='https://protect.gost.ru/gost/details/b35d37a7-786d-4823-9cf0-31ce02074740';
function chart(result) {
  const points=result.pairs;if(!points.length)return '<p class="text-muted">Добавьте полные парные измерения в «Прочностях»: отрыв и не менее двух показаний УЗК на одном участке.</p>';
  const xs=points.map(p=>p.speed.value),ys=points.map(p=>p.strength.value);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const dx=Math.max(maxX-minX,100),dy=Math.max(maxY-minY,5);
  const x0=minX-.1*dx,x1=maxX+.1*dx,y0=Math.max(0,minY-.15*dy),y1=maxY+.15*dy;
  const X=x=>70+620*(x-x0)/(x1-x0),Y=y=>305-250*(y-y0)/(y1-y0);
  const ticks=Array.from({length:5},(_,i)=>i/4);
  const grid=ticks.map(t=>{const x=x0+t*(x1-x0),y=y0+t*(y1-y0);return `<path d="M${X(x)} 55V305 M70 ${Y(y)}H690" stroke="#e2e9e8"/><text x="${X(x)}" y="326" text-anchor="middle">${fmt(x,0)}</text><text x="60" y="${Y(y)+4}" text-anchor="end">${fmt(y,1)}</text>`;}).join('');
  const line=result.fit?`<path d="M${X(minX)} ${Y(result.fit.a*minX+result.fit.b)} L${X(maxX)} ${Y(result.fit.a*maxX+result.fit.b)}" stroke="#218477" stroke-width="3"/>`:'';
  return `<svg class="calibration-chart" viewBox="0 0 740 370" role="img" aria-label="График скорости ультразвука и прочности по отрыву"><text x="70" y="28">R, МПа</text>${grid}<path d="M70 55V305H690" fill="none" stroke="#647a7a"/>${line}${points.map(p=>`<g><circle cx="${X(p.speed.value)}" cy="${Y(p.strength.value)}" r="5" fill="#355ca5"><title>П${p.point.number}: V = ${fmt(p.speed.value)} м/с; R = ${fmt(p.strength.value)} МПа</title></circle><text x="${X(p.speed.value)+7}" y="${Y(p.strength.value)-7}">П${p.point.number}</text></g>`).join('')}<text x="690" y="358" text-anchor="end">V, м/с</text></svg>`;
}
export function createCalibrationWorkspace({getProject,commit,askText,openPoint,notify}) {
  const $=id=>document.getElementById(id);
  let projectId=null,structure='wall',series='',working=false;
  $('calibrationView').innerHTML=`<div class="register-heading"><div><div class="eyebrow">ЛАБОРАТОРНЫЕ РАБОТЫ</div><h2>Градуировка</h2><p class="text-muted">Отрыв → прочность → зависимость от скорости УЗК. Все чертежи объекта.</p></div></div>
    <div class="strength-toolbar"><label>Конструкция <select id="calibrationStructure" aria-label="Конструкция для градуировки">${listStructures({engineering:false}).map(s=>`<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}</select></label><label>Серия <select id="calibrationSeries" aria-label="Серия градуировки"></select></label></div>
    <p class="field-note">Серия задаётся в карточке точки. Один тип конструкции сам по себе не подтверждает однородность бетона и условий испытаний. Для пары с отрывом используйте поверхностное УЗК.</p>
    <div id="calibrationResult"></div>
    <details class="calibration-reference"><summary>Методика и условия применения</summary>
    <p>Отрыв: R = m₁ · m₂ · P, приложение В ГОСТ 22690-2015. P = P₀ · γ; γ = h² / (h − Δh)² по 7.6.3. m₂ выбирается по анкеру и бетону; m₁ = 1 при заполнителе менее 50 мм. Нестандартная схема, другие заполнители и коэффициенты ГОСТ 31914 требуют отдельного расчёта. Для лёгкого бетона область — 5–40 МПа. Результаты более 70 МПа здесь не включаются до проверки средней прочности и коэффициентов.</p>
    <p>УЗК: R = a · V + b, ГОСТ 17624-2021, 6.2 и приложение Б. На участке усредняются скорости. Для времени в мкс каждая скорость вычисляется как 1000 · L / t при базе L в мм. Показания прибора в МПа не смешиваются со скоростью. Данные отрыва, введённые в МПа, принимаются как уже рассчитанная прочность участка.</p>
    <p>Проверяются: не менее 12 пар, r ≥ 0,7, S / Rср ≤ 15%, диапазон по 6.1.7 и отклонения ≤ 2S. r вычисляется между расчётной и измеренной прочностью по исправленной формуле Б.8 (поправка 2025 г.). Исходные данные сохраняются; исключение требует указания причины, после него расчёт повторяется. При отрицательных температурах исключение допустимо только при нарушении процедуры с повторным испытанием того же участка (6.2.4).</p>
    <p>Численные проверки не подтверждают условия измерений: состав и возраст бетона, прибор и базу, акустический контакт, температуру, расположение относительно арматуры и пригодность участков проверяет инженер. Применение — только внутри диапазона Vmin–Vmax принятой зависимости. Смешанные условия разделяйте на серии. Для промежуточного и проектного возраста нужна периодическая корректировка по Б.4. Класс бетона здесь не назначается.</p>
    <p><a href="https://protect.gost.ru/gost/details/c6823d7d-4d1f-41e8-a297-d302da437530" target="_blank" rel="noopener noreferrer">ГОСТ 22690-2015</a> · <a href="${SOURCE}" target="_blank" rel="noopener noreferrer">ГОСТ 17624-2021 и поправки</a></p></details>`;
  function render() {
    const project=getProject();if(projectId!==project.id){projectId=project.id;structure='wall';series='';}
    $('calibrationStructure').value=structure;
    const seriesList=[...new Set((project.strengthPoints??[]).filter(p=>p.structure===structure).map(p=>p.calibration?.series?.trim()??''))].sort((a,b)=>a.localeCompare(b,'ru'));
    if(!seriesList.length)seriesList.push('');if(!seriesList.includes(series))series=seriesList[0];
    $('calibrationSeries').innerHTML=seriesList.map(s=>`<option value="${esc(s)}">${esc(s||'Серия не задана')}</option>`).join('');$('calibrationSeries').value=series;
    const rows=calibrationRows(project,structure,series),result=fitCalibration(rows),f=result.fit;
    const residuals=new Map((f?.residuals??[]).map(r=>[r.id,r]));
    $('calibrationResult').innerHTML=`<div class="calibration-summary"><strong>${f?`R = ${fmt(f.a,8)} · V ${f.b<0?'−':'+'} ${fmt(Math.abs(f.b),5)}`:'Зависимость пока не построена'}</strong><p>Полных пар: ${result.n} из ${rows.length}${f?` · r = ${fmt(f.r)} · S = ${fmt(f.S)} МПа · S/Rср = ${fmt(100*f.relativeS,2)}% · V: ${fmt(f.minV,1)}–${fmt(f.maxV,1)} м/с`:''}</p><p class="${result.issues.length?'calibration-warning':''}">${result.issues.length?'Предварительный расчёт — численные проверки не пройдены.':'Численные проверки выполнены. Применимость зависит от условий испытаний (см. методику).'}</p>${result.issues.length?`<ul>${result.issues.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:''}</div>
      <div class="calibration-plot">${chart(result)}</div>
      <h3>Исходные пары и расчёт отрыва</h3><div class="table-wrap"><table class="strength-table calibration-table"><thead><tr><th>Точка / этаж / чертёж</th><th>Отрыв</th><th>R, МПа</th><th>Vср, м/с</th><th>R по прямой / отклонение, МПа</th><th>Участие в расчёте</th></tr></thead><tbody>${rows.map(row=>{
        const p=row.point,r=residuals.get(p.id),s=row.strength;
        return `<tr><td><button class="btn btn-ghost" data-calibration-open="${esc(p.id)}">П${p.number}</button><br>${esc(row.drawing?.floor||'Этаж не указан')}<br>${esc(row.drawing?.name)}<br>${esc(p.location)}</td><td>${fmt(p.pullOff.value)} ${esc(p.pullOff.unit)}${s.m2?`<br><small>m₁ = 1; m₂ = ${fmt(s.m2)}; γ = ${fmt(s.gamma,5)}</small>`:''}</td><td>${fmt(s.value)}<br><small>${esc(s.source)}</small></td><td>${fmt(row.speed.value,1)}<br><small>Измерений: ${p.ultrasound.values.length}</small></td><td>${r?`${fmt(r.predicted)} / ${fmt(r.residual)}`:'—'}</td><td>${esc(row.error||'Включено')}${r&&f.outliers.some(o=>o.id===p.id)?'<br><strong>Отклонение > 2S</strong>':''}<br><button class="btn btn-ghost" data-calibration-exclude="${esc(p.id)}" ${working?'disabled':''}>${p.calibration?.excludeReason?'Вернуть в расчёт':'Исключить с причиной'}</button></td></tr>`;
      }).join('')||'<tr><td colspan="6">Точек этого типа пока нет. Добавьте их в «Прочностях».</td></tr>'}</tbody></table></div>`;
  }
  $('calibrationStructure').addEventListener('change',()=>{structure=$('calibrationStructure').value;series='';render();});
  $('calibrationSeries').addEventListener('change',()=>{series=$('calibrationSeries').value;render();});
  $('calibrationResult').addEventListener('click',async e=>{
    try{
      if(working)return;const open=e.target.closest('[data-calibration-open]');if(open){await openPoint(open.dataset.calibrationOpen);return;}
      const button=e.target.closest('[data-calibration-exclude]');if(!button)return;
      const id=button.dataset.calibrationExclude,point=getProject().strengthPoints.find(p=>p.id===id);
      const reason=point.calibration?.excludeReason?'':await askText('Причина исключения П'+point.number);if(reason===null)return;
      const next=structuredClone(getProject()),updated=next.strengthPoints.find(p=>p.id===id);updated.calibration={...updated.calibration,excludeReason:reason};
      working=true;render();try{await commit(next);}finally{working=false;render();}
    }catch(error){notify(error.message,true);}
  });
  return {render,get busy(){return working;}};
}
