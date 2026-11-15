import {uid} from './domain.js';
import {pixelDistance, segmentMetres, formatLength} from './ruler-model.js';

export function createRuler({getProject, getDrawing, canLeave, commit, renderAll, setMode, resetCard, notify, isNavigating = () => false}) {
  const stage = document.getElementById('drawingStage');
  const button = document.createElement('button');
  button.className = 'btn btn-secondary'; button.id = 'rulerTool';
  document.querySelector('.quick-field-bar').append(button);
  const layer = document.createElement('div'); layer.className = 'ruler-layer'; stage.append(layer);
  const hint = document.createElement('div'); hint.className = 'ruler-hint'; hint.setAttribute('role','status');
  document.querySelector('.quick-field-bar').after(hint);
  const dialog = document.createElement('dialog'); dialog.className = 'ruler-dialog'; document.body.append(dialog);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let picking = null, first = null, owner = '', working = false, visible = true;
  function cancel() { picking = null; first = null; render(); }
  function render() {
    const d = getDrawing(), key = getProject()?.id + '/' + d?.id;
    if (owner !== key) { picking = null; first = null; owner = key; visible = true; }
    button.disabled = !d || working;
    button.textContent = picking ? 'Отменить линейку' : 'Линейка';
    button.setAttribute('aria-pressed', String(Boolean(picking)));
    hint.hidden = !picking;
    hint.textContent = `${picking === 'calibrate' ? 'Масштаб' : 'Замер'}: ${first ? 'укажите вторую точку' : 'укажите первую точку'}. План можно двигать и увеличивать.`;
    stage.classList.toggle('ruler-picking', Boolean(picking));
    layer.replaceChildren();
    if (!d) return;
    const segments = visible ? (d.ruler?.segments ?? []).filter(s=>!s.removed) : [];
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox',`0 0 ${d.width} ${d.height}`); svg.setAttribute('preserveAspectRatio','none');
    const draw = (a,b) => {const line=document.createElementNS(ns,'line');line.setAttribute('x1',a.x*d.width);line.setAttribute('y1',a.y*d.height);line.setAttribute('x2',b.x*d.width);line.setAttribute('y2',b.y*d.height);svg.append(line);};
    layer.append(svg);
    for (const s of segments) {
      draw(s.a,s.b);
      const label = document.createElement('span'); label.className='ruler-label';
      label.style.left=(s.a.x+s.b.x)*50+'%'; label.style.top=(s.a.y+s.b.y)*50+'%';
      label.textContent=s.label+' · '+formatLength(segmentMetres(d,s)); layer.append(label);
    }
    if (first) {const dot=document.createElement('span');dot.className='ruler-dot';dot.style.left=first.x*100+'%';dot.style.top=first.y*100+'%';layer.append(dot);}
  }
  function shell(title, body) {
    dialog.innerHTML=`<div class="dialog-head"><h2>${title}</h2><button type="button" class="icon-btn" data-close aria-label="Закрыть линейку">×</button></div><div class="dialog-body">${body}<p data-error role="status"></p></div>`;
    dialog.querySelector('[data-close]').onclick=()=>{if(!working)dialog.close();};
    dialog.showModal();
  }
  async function save(change) {
    if (working) return false;
    working=true; dialog.querySelector('.dialog-body').inert=true;
    try {
      const next=structuredClone(getProject()), d=next.drawings.find(x=>x.id===getDrawing().id);
      change(d); await commit(next); dialog.close(); renderAll(); return true;
    } catch(error) {dialog.querySelector('[data-error]').textContent=error.message;return false;}
    finally {working=false;dialog.querySelector('.dialog-body').inert=false;render();}
  }
  function start(kind) {dialog.close();resetCard();setMode('select');picking=kind;first=null;visible=true;render();}
  async function open() {
    if (!await canLeave() || !getDrawing()) return;
    setMode('select');resetCard();
    const d=getDrawing(), r=d.ruler;
    shell('Линейка по чертежу',`<p>${esc(d.name)}</p><p>${r ? 'Опорное расстояние: '+formatLength(r.calibration.metres) : 'Сначала задайте известное расстояние между двумя точками.'}</p><div class="ruler-actions"><button class="btn btn-secondary" data-calibrate>${r?'Изменить масштаб':'Задать масштаб'}</button><button class="btn btn-primary" data-measure ${!r||r.segments.length>=1000?'disabled':''}>Измерить отрезок</button></div><p class="ruler-note">Длины рассчитываются по изображению. Используйте плоский чертёж без перспективных искажений. Изменение масштаба пересчитает все сохранённые замеры этого чертежа.</p>${r?`<label class="ruler-toggle"><input type="checkbox" data-visible ${visible?'checked':''}> Показывать замеры на плане</label>`:''}<div class="ruler-list">${(r?.segments??[]).map(s=>`<div><strong>${esc(s.label)}</strong><span>${formatLength(segmentMetres(d,s))}</span></div>`).join('')||'<p>Сохранённых замеров пока нет.</p>'}</div>`);
    dialog.querySelector('[data-calibrate]').onclick=()=>start('calibrate');
    dialog.querySelector('[data-measure]').onclick=()=>start('measure');
    const toggle=dialog.querySelector('[data-visible]');if(toggle)toggle.onchange=()=>{visible=toggle.checked;render();};
    const list=dialog.querySelector('.ruler-list'), rows=r?.segments??[];
    const row=(s,restore=false)=>`<div class="ruler-row"><div><strong>${esc(s.label)}</strong><span>${formatLength(segmentMetres(d,s))}</span></div><button class="btn btn-ghost" data-segment="${esc(s.id)}" aria-label="${restore?'Восстановить':'Убрать'} замер ${esc(s.label)}">${restore?'Восстановить':'Убрать'}</button></div>`;
    list.innerHTML=rows.filter(s=>!s.removed).map(s=>row(s)).join('')||'<p>Сохранённых замеров пока нет.</p>';
    if(rows.some(s=>s.removed))list.innerHTML+=`<details><summary>Убранные замеры (${rows.filter(s=>s.removed).length})</summary>${rows.filter(s=>s.removed).map(s=>row(s,true)).join('')}</details>`;
    for(const b of list.querySelectorAll('[data-segment]'))b.onclick=async()=>{if(await save(d=>{const s=d.ruler.segments.find(s=>s.id===b.dataset.segment);s.removed=!s.removed;}))await open();};
  }
  function finish(a,b,kind) {
    const d=getDrawing();
    if (kind==='calibrate') {
      shell('Известное расстояние',`<form><label>Расстояние в метрах<input name="metres" inputmode="decimal" placeholder="Например: 6,0" required autocomplete="off"></label><p>Введите фактическую длину выбранного отрезка. Все ранее сохранённые замеры этого чертежа будут пересчитаны.</p><button class="btn btn-primary">Сохранить масштаб</button></form>`);
      dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const metres=Number(e.target.elements.metres.value.trim().replace(',','.'));if(!Number.isFinite(metres)||metres<=0||metres>100000){dialog.querySelector('[data-error]').textContent='Введите расстояние больше 0 и не более 100 000 м.';return;}if(await save(d=>{d.ruler={calibration:{a,b,metres},segments:d.ruler?.segments??[]};}))notify('Масштаб сохранён. Откройте «Линейку» для замера.');};
    } else {
      const length=segmentMetres(d,{a,b});
      shell('Сохранить замер',`<p class="ruler-result">${formatLength(length)}</p><form><label>Название замера<input name="label" maxlength="200" required value="Замер ${(d.ruler?.segments.length??0)+1}"></label><button class="btn btn-primary">Сохранить замер</button></form><p class="ruler-note">Расчёт по масштабу чертежа. Объём дефекта не меняется.</p>`);
      dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const label=e.target.elements.label.value.trim();if(!label)return;if(await save(d=>d.ruler.segments.push({id:uid(),label,a,b})))notify('Замер сохранён на чертеже.');};
    }
  }
  button.onclick=()=>{if(picking)cancel();else void open();};
  stage.addEventListener('click', e=>{
    if(!picking || working || isNavigating())return;
    e.stopImmediatePropagation();e.preventDefault();
    const rect=stage.getBoundingClientRect(),p={x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};
    if(!first){first=p;render();return;}
    if(pixelDistance(getDrawing(),first,p)<1){notify('Точки слишком близко. Укажите другой конец отрезка.');return;}
    const a=first,kind=picking;cancel();finish(a,p,kind);
  },true);
  dialog.addEventListener('cancel',e=>{if(working)e.preventDefault();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&picking)cancel();});
  return {render,cancel,get busy(){return working||dialog.open;}};
}
