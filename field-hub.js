import {pendingWork,constructionCards} from './field-model.js';
import {listSnapshots,loadSnapshot} from './storage.js';

export function createFieldHub({getProject,canLeave,openDefect,openStrength,openMeasure,download,notify,report,restore}) {
  const dialog=document.createElement('dialog');dialog.className='field-hub';document.body.append(dialog);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let tab='pending';
  async function show(next='pending'){
    tab=next;const p=getProject(),items=pendingWork(p);
    dialog.innerHTML=`<div class="dialog-head"><h2>Работа по объекту</h2><button class="icon-btn" data-close aria-label="Закрыть">×</button></div><div class="dialog-body"><nav class="field-tabs"><button class="btn btn-secondary" data-tab="pending">Проверка (${items.length})</button><button class="btn btn-secondary" data-tab="cards">Конструкции</button><button class="btn btn-secondary" data-tab="backups">Копии</button><button class="btn btn-secondary" data-tab="report">Отчёт</button></nav><div id="fieldHubBody"></div></div>`;
    const body=dialog.querySelector('#fieldHubBody');
    const recordLink=(kind,r)=>`<button class="btn btn-secondary" data-open="${kind}" data-id="${esc(r.id)}">${kind==='defect'?'Дефект № ':'Точка П'}${r.number}</button>`;
    if(tab==='pending')body.innerHTML='<p>Проверьте перед уходом с объекта. Это список полноты данных, а не оценка технического состояния. Не каждое исследование требует обоих методов.</p>'+ (items.map(i=>`<button class="draft-queue-item" data-open="${i.kind}" data-id="${esc(i.id)}"><strong>${i.label}</strong><br>Проверить: ${i.missing.join(', ')}</button>`).join('')||'<p>Пропусков по проверяемым полям нет.</p>');
    if(tab==='cards')body.innerHTML='<p>Укажите одинаковую «Марку конструкции» в дефекте и точке прочности. Записи связываются по чертежу, типу и марке; этажи не объединяются автоматически.</p>'+ (constructionCards(p).map(c=>`<article class="construction-card"><h3>${esc(c.label)} · ${esc(c.code)}</h3><p>${esc(c.drawing?.name)} · Этаж: ${esc(c.drawing?.floor||'не указан')}</p>${c.defects.map(r=>recordLink('defect',r)).join(' ')} ${c.strengths.map(r=>recordLink('strength',r)).join(' ')} ${c.sketches.map(s=>`<button class="btn btn-secondary" data-open="measure" data-id="${esc(s.id)}">${esc(s.name)}</button><p>Размеры: ${s.dimensions.map(d=>esc(d.value+' '+d.unit)).join('; ')||'не заданы'}</p>`).join('')}<div class="table-photos">${[...c.defects,...c.strengths].flatMap(r=>(r.photos??[]).map(photo=>`<figure><img style="max-width:120px" src="${esc(photo.imageData)}" alt="${esc(photo.caption||photo.name)}"><figcaption>${esc(photo.caption)}</figcaption></figure>`)).join('')}</div><p>${[...c.defects,...c.strengths].map(r=>esc(r.note)).filter(Boolean).join('<br>')}</p></article>`).join('')||'<p>Марки конструкций пока не заданы.</p>');
    if(tab==='backups'){
      body.innerHTML='<p>Автоматические копии предыдущих версий: до 3 на объект, не чаще одного раза в 5 минут. Они находятся в этом же браузере. Скачанная копия защищает и от очистки браузера.</p><button class="btn btn-primary" data-download>Скачать текущий проект</button>';
      for(const s of await listSnapshots(p.id)){const row=document.createElement('div');row.className='construction-card';row.innerHTML=`<p>${esc(new Date(s.time).toLocaleString('ru-RU'))}</p><button class="btn btn-secondary" data-snapshot="${esc(s.key)}">Скачать копию</button> <button class="btn btn-secondary" data-restore="${esc(s.key)}">Открыть как отдельный объект</button>`;body.append(row);}
    }
    if(tab==='report')body.innerHTML=`<p>В комплект войдут Word-ведомость дефектов с фотографиями, карты всех чертежей, ведомость прочностей, обмерные SVG и резервная копия проекта.</p><p>Записей для проверки: ${items.length}. Экспорт не присваивает категории и не заменяет заключение инженера.</p><button class="btn btn-primary" data-report>Скачать комплект ZIP</button>`;
    if(!dialog.open)dialog.showModal();
  }
  dialog.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
    if(b.hasAttribute('data-close'))dialog.close();
    if(b.dataset.tab)await show(b.dataset.tab);
    if(b.dataset.open){dialog.close();if(b.dataset.open==='defect')await openDefect(b.dataset.id);else if(b.dataset.open==='measure')await openMeasure(b.dataset.id);else await openStrength(b.dataset.id);}
    if(b.hasAttribute('data-download'))download(JSON.stringify(getProject()),'Объект.kontur.json','application/json');
    if(b.dataset.snapshot){const p=await loadSnapshot(b.dataset.snapshot);if(!p)throw new Error('Копия уже заменена новой.');download(JSON.stringify(p),'Резервная копия.kontur.json','application/json');}
    if(b.dataset.restore){const p=await loadSnapshot(b.dataset.restore);if(!p)throw new Error('Копия уже заменена новой.');dialog.close();await restore(p);}
    if(b.hasAttribute('data-report')){b.disabled=true;b.textContent='Собираем комплект…';try{await report();}finally{b.disabled=false;b.textContent='Скачать комплект ZIP';}}
  }catch(error){notify(error.message,true);}});
  return {async open(){if(await canLeave())await show();}};
}
