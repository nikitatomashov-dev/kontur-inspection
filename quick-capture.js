import { createFieldDefect, listStructures } from './domain.js';

export function createQuickCapture({getProject,getDrawingId,isBusy,setBusy,commit,isPersistent,canLeave,resetCard,setMode,renderAll,openDefect,notify}) {
  const $=id=>document.getElementById(id);
  let active=false;
  for(const structure of listStructures()) $('quickStructure').add(new Option(structure.label,structure.id));
  const pending=()=>getProject()?.defects.filter(d=>d.workflow==='draft')??[];
  function render(){
    $('quickToggle').textContent=active?'Готово':'Начать';
    $('quickToggle').setAttribute('aria-pressed',String(active));
    $('quickToggle').disabled=isBusy() || !getDrawingId();
    $('quickStructure').disabled=isBusy();
    $('draftQueue').textContent=`Черновики: ${pending().length}`;
    $('quickStructure').closest('.quick-field-bar').classList.toggle('capturing',active);
    if(active) $('modeHint').textContent='Быстрое нанесение: каждая точка или зона сохраняется отдельно. Карточку заполните позже.';
  }
  function stop(){if(active)$('quickStatus').textContent='Серия завершена. Записи доступны в списке черновиков.';active=false;render();}
  $('quickToggle').addEventListener('click',async()=>{
    if(isBusy())return;
    if(active){stop();setMode('select');return;}
    if(!$('quickStructure').value){$('quickStatus').textContent='Сначала выберите тип конструкции.';$('quickStructure').focus();return;}
    if(!await canLeave())return;
    resetCard();active=true;setMode('add');render();
    $('quickStatus').textContent='Ставьте отметки подряд. Для прямоугольников выберите «Зона».';
  });
  $('quickStructure').addEventListener('change',()=>{
    if(!$('quickStructure').value){stop();setMode('select');}
    $('quickStatus').textContent='Новые отметки получат выбранный тип конструкции.';
  });
  async function place(point,zone){
    if(isBusy()){notify('Предыдущая отметка ещё сохраняется. Повторите касание.');return;}
    setBusy(true);render();
    try {
      const record=createFieldDefect(getProject(),getDrawingId(),$('quickStructure').value,point,zone);
      const next=structuredClone(getProject());next.defects.push(record);
      await commit(next);renderAll();
      if(isPersistent()) $('quickStatus').textContent=`№ ${record.number} сохранён на устройстве. Можно наносить следующий.`;
      else {stop();setMode('select');$('quickStatus').textContent=`№ ${record.number} только в памяти. Скачайте проект до закрытия.`;}
    } catch(error){stop();setMode('select');$('quickStatus').textContent=error.message;notify(error.message,true);}
    finally{setBusy(false);render();}
  }
  $('draftQueue').addEventListener('click',()=>{
    const list=$('draftQueueList');list.replaceChildren();
    for(const record of pending().sort((a,b)=>a.number-b.number)){
      const button=document.createElement('button');button.type='button';button.className='draft-queue-item';
      const drawing=getProject().drawings.find(d=>d.id===record.placements[0].drawingId);
      button.textContent=`№ ${record.number} · ${listStructures().find(s=>s.id===record.structure)?.label} · ${drawing?.name??''}${record.title?' — '+record.title:''}`;
      button.addEventListener('click',async()=>{$('draftQueueDialog').close();await openDefect(record.id);});list.append(button);
    }
    if(!list.children.length)list.textContent='Незаполненных черновиков нет.';
    $('draftQueueDialog').showModal();
  });
  $('closeDraftQueue').addEventListener('click',()=>$('draftQueueDialog').close());
  return {render,stop,place,get active(){return active;}};
}
