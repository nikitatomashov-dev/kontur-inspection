import {pendingWork,constructionCards,searchProject} from './field-model.js';
import {listSnapshots,loadSnapshot} from './storage.js';

export function createFieldHub({getProject,canLeave,openDefect,openStrength,openMeasure,openTask,download,notify,report,restore}) {
  const dialog=document.createElement('dialog');dialog.className='field-hub';document.body.append(dialog);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let tab='pending';
  let searchOwner=null,search={query:'',kind:'',drawingId:''},limit=50;
  const searchButton=document.createElement('button');searchButton.className='btn btn-secondary';searchButton.textContent='Поиск по объекту';
  document.querySelector('.topbar-actions').prepend(searchButton);
  searchButton.addEventListener('click',async()=>{if(await canLeave())await show('search');});
  function drawSearch(){
    const rows=searchProject(getProject(),search),target=dialog.querySelector('[data-results]');
    dialog.querySelector('[data-search-count]').textContent=`Найдено: ${rows.length}`;
    target.innerHTML=rows.slice(0,limit).map(r=>`<button class="draft-queue-item search-result" data-open="${r.kind}" data-id="${esc(r.id)}" data-placement="${esc(r.placementId??'')}"><strong>${esc(r.label)}</strong><span>${esc(r.location||'Без привязки к чертежу')}</span><span>${esc(r.description.slice(0,320))}</span></button>`).join('')||'<p>Ничего не найдено. Измените запрос или фильтры.</p>';
    if(rows.length>limit)target.innerHTML+='<button class="btn btn-secondary" data-more>Показать ещё 50</button>';
  }
  dialog.addEventListener('input',e=>{if(!e.target.dataset.search)return;search[e.target.dataset.search]=e.target.value;limit=50;drawSearch();});
  async function show(next='pending'){
    tab=next;const p=getProject(),items=pendingWork(p);
    dialog.innerHTML=`<div class="dialog-head"><h2>Работа по объекту</h2><button class="icon-btn" data-close aria-label="Закрыть">×</button></div><div class="dialog-body"><nav class="field-tabs"><button class="btn btn-secondary" data-tab="pending">Проверка (${items.length})</button><button class="btn btn-secondary" data-tab="cards">Конструкции</button><button class="btn btn-secondary" data-tab="backups">Копии</button><button class="btn btn-secondary" data-tab="report">Отчёт</button></nav><div id="fieldHubBody"></div></div>`;
    const body=dialog.querySelector('#fieldHubBody');
    const searchTab=document.createElement('button');searchTab.className='btn btn-secondary';searchTab.dataset.tab='search';searchTab.textContent='Поиск';dialog.querySelector('.field-tabs').prepend(searchTab);
    for(const b of dialog.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
    if(tab==='search'){
      if(searchOwner!==p.id){searchOwner=p.id;search={query:'',kind:'',drawingId:''};}
      if(search.drawingId&&!p.drawings.some(d=>d.id===search.drawingId))search.drawingId='';
      body.innerHTML=`<div class="object-search"><label>Найти запись<input type="search" data-search="query" placeholder="Трещина, Ст-1, этаж 2, №12 или П3" autocomplete="off" value="${esc(search.query)}"></label><div class="search-filters"><label>Раздел<select data-search="kind"><option value="">Все записи</option><option value="defect">Дефекты</option><option value="strength">Прочности</option><option value="measure">Обмеры</option></select></label><label>Чертёж<select data-search="drawingId"><option value="">Все чертежи</option>${p.drawings.map(d=>`<option value="${esc(d.id)}">${esc(d.name)}${d.floor?' · этаж '+esc(d.floor):''}</option>`).join('')}</select></label></div><p data-search-count role="status" aria-live="polite"></p><div data-results></div></div>`;
      body.querySelector('[data-search="kind"]').value=search.kind;body.querySelector('[data-search="drawingId"]').value=search.drawingId;drawSearch();
    }
    const recordLink=(kind,r)=>`<button class="btn btn-secondary" data-open="${kind}" data-id="${esc(r.id)}">${kind==='defect'?'Дефект № ':'Точка П'}${r.number}</button>`;
    if(tab==='pending')body.innerHTML='<p>Проверьте перед уходом с объекта. Это список полноты данных, а не оценка технического состояния. Не каждое исследование требует обоих методов.</p>'+ (items.map(i=>`<button class="draft-queue-item" data-open="${i.kind}" data-id="${esc(i.id)}"><strong>${esc(i.label)}</strong><br>Проверить: ${i.missing.join(', ')}</button>`).join('')||'<p>Пропусков по проверяемым полям нет.</p>');
    if(tab==='cards')body.innerHTML='<p>Укажите одинаковую «Марку конструкции» в дефекте и точке прочности. Записи связываются по чертежу, типу и марке; этажи не объединяются автоматически.</p>'+ (constructionCards(p).map(c=>`<article class="construction-card"><h3>${esc(c.label)} · ${esc(c.code)}</h3><p>${esc(c.drawing?.name)} · Этаж: ${esc(c.drawing?.floor||'не указан')}</p>${c.defects.map(r=>recordLink('defect',r)).join(' ')} ${c.strengths.map(r=>recordLink('strength',r)).join(' ')} ${c.sketches.map(s=>`<button class="btn btn-secondary" data-open="measure" data-id="${esc(s.id)}">${esc(s.name)}</button><p>Размеры: ${s.dimensions.map(d=>esc(d.value+' '+d.unit)).join('; ')||'не заданы'}</p>`).join('')}<div class="table-photos">${[...c.defects,...c.strengths].flatMap(r=>(r.photos??[]).map(photo=>`<figure><img style="max-width:120px" src="${esc(photo.imageData)}" alt="${esc(photo.caption||photo.name)}"><figcaption>${esc(photo.caption)}</figcaption></figure>`)).join('')}</div><p>${[...c.defects,...c.strengths].map(r=>esc(r.note)).filter(Boolean).join('<br>')}</p></article>`).join('')||'<p>Марки конструкций пока не заданы.</p>');
    if(tab==='backups'){
      body.innerHTML='<p>Автоматические копии предыдущих версий: до 3 на объект, не чаще одного раза в 5 минут. Они находятся в этом же браузере. Скачанная копия защищает и от очистки браузера.</p><button class="btn btn-primary" data-download>Скачать текущий проект</button>';
      for(const s of await listSnapshots(p.id)){const row=document.createElement('div');row.className='construction-card';row.innerHTML=`<p>${esc(new Date(s.time).toLocaleString('ru-RU'))}</p><button class="btn btn-secondary" data-snapshot="${esc(s.key)}">Скачать копию</button> <button class="btn btn-secondary" data-restore="${esc(s.key)}">Открыть как отдельный объект</button>`;body.append(row);}
    }
    if(tab==='report')body.innerHTML=`<p>В комплект войдут Word-ведомость дефектов с фотографиями, карты всех чертежей, ведомость прочностей, обмерные SVG и резервная копия проекта.</p><p>Записей для проверки: ${items.length}. Экспорт не присваивает категории и не заменяет заключение инженера.</p><button class="btn btn-primary" data-report>Скачать комплект ZIP</button>`;
    if(!dialog.open)dialog.showModal();
    if(tab==='search')body.querySelector('input').focus();
  }
  dialog.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
    if(b.hasAttribute('data-close'))dialog.close();
    if(b.dataset.tab)await show(b.dataset.tab);
    if(b.hasAttribute('data-more')){limit+=50;drawSearch();}
    if(b.dataset.open){dialog.close();if(b.dataset.open==='task')await openTask(b.dataset.id);else if(b.dataset.open==='defect')await openDefect(b.dataset.id,b.dataset.placement||undefined);else if(b.dataset.open==='measure')await openMeasure(b.dataset.id);else await openStrength(b.dataset.id);}
    if(b.hasAttribute('data-download'))download(JSON.stringify(getProject()),'Объект.kontur.json','application/json');
    if(b.dataset.snapshot){const p=await loadSnapshot(b.dataset.snapshot);if(!p)throw new Error('Копия уже заменена новой.');download(JSON.stringify(p),'Резервная копия.kontur.json','application/json');}
    if(b.dataset.restore){const p=await loadSnapshot(b.dataset.restore);if(!p)throw new Error('Копия уже заменена новой.');dialog.close();await restore(p);}
    if(b.hasAttribute('data-report')){b.disabled=true;b.textContent='Собираем комплект…';try{await report();}finally{b.disabled=false;b.textContent='Скачать комплект ZIP';}}
  }catch(error){notify(error.message,true);}});
  return {async open(){if(await canLeave())await show();}};
}
