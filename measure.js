import {brushPath,eraseBrushes} from './measure-paint.js';
import {addStroke,recognizeStroke,nearestEndpoint} from './measure-stroke.js';
import {uid,MAX_BACKUP_BYTES} from './domain.js';
import {createSketch,validateSketches,snappedPoint,removeSketchElement,measuredValue,sketchSvg} from './measure-model.js';
import {exportSketch} from './measure-export.js';
import {attachMeasureNavigation} from './measure-navigation.js';
import {fitCamera,zoomCamera,contentBounds} from './measure-space.js';

export function createMeasureWorkspace({getProject,commit,notify,confirmAction}){
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let owner=null,sketch=null,selected=null,tool='brush',chain=null,first=null,dimensionStart=null,scale=1,cameraX=0,cameraY=0,history=[],future=[],saving=false,queued=false,drag=null,full=true,editAction=null;
  const mobile=matchMedia('(max-width:700px)');
  const modes=[['brush','Кисть'],['eraser','Ластик'],['select','Выбор'],['draw','От руки'],['wall','Контур'],['partition','Перегородка'],['dimension','Размер'],['label','Подпись'],['pan','Сдвиг']];
  $('measureView').innerHTML=`<div class="measure-heading"><button class="btn btn-secondary" id="measureFullscreen">← Разделы</button><div><h2>Обмеры</h2><span>Без границ листа · не в масштабе</span></div><button class="btn btn-primary" id="measureNew">+ Эскиз</button></div>
    <div class="measure-sheet-row"><select id="measureSheets" aria-label="Обмерный эскиз"></select><button class="btn btn-secondary" id="measureRename">Название / этаж</button><button class="btn btn-ghost" id="measureDeleteSheet">Удалить эскиз</button><span id="measureFloor"></span></div>
    <div class="measure-tools" role="group" aria-label="Инструменты обмеров">${modes.map(([id,name])=>`<button type="button" class="tool-button ${['draw','wall','partition','dimension'].includes(id)?'paint-advanced':''}" data-measure-mode="${id}" aria-pressed="false">${name}</button>`).join('')}<button type="button" class="tool-button" id="measureMoreTools" aria-expanded="false">Ещё…</button></div>
    <div id="measurePaintOptions" class="measure-paint-options"><label id="measureColorLabel">Цвет <input type="color" id="measureColor" value="#245b54"></label><label id="measureBrushLabel">Кисть <input type="range" id="measureBrushWidth" min="1" max="30" value="4" aria-label="Толщина кисти"><output id="measureBrushOutput">4</output></label><label id="measureEraserLabel">Ластик <input type="range" id="measureEraserWidth" min="10" max="100" value="32" aria-label="Размер ластика"><output id="measureEraserOutput">32</output></label></div><div class="measure-draw-options hidden" id="measureDrawOptions"><label for="measureRecognition">После штриха</label><select id="measureRecognition"><option value="auto">Авто: прямая / дуга</option><option value="line">Выпрямить</option><option value="arc">Сделать дугой</option><option value="free">Оставить как нарисовано</option></select></div><details class="measure-extra"><summary>Сетка и построение</summary><div class="measure-options"><label><input type="checkbox" id="measureGrid" checked> Сетка</label><label><input type="checkbox" id="measureOrtho" checked> Прямые углы</label><button class="btn btn-secondary" id="measureFinish">Закончить линию</button></div></details><div class="measure-options"><button class="icon-btn" id="measureUndo" aria-label="Отменить действие">↶</button><button class="icon-btn" id="measureRedo" aria-label="Повторить действие">↷</button><button class="icon-btn" id="measureZoomOut" aria-label="Уменьшить эскиз">−</button><button class="icon-btn" id="measureZoomIn" aria-label="Увеличить эскиз">+</button><button class="btn btn-secondary" id="measureFit">Вписать</button></div>
    <p id="measureHint" role="status"></p><div id="measureViewport"><div id="measureStage"></div><div id="measureEmpty"><h3>Зарисуйте план помещения или этажа</h3><p>Создайте эскиз, отметьте углы, затем нанесите измеренные размеры.</p><button class="btn btn-primary" id="measureNewEmpty">Создать эскиз</button></div></div>
    <div class="measure-selection"><span id="measureSelection">Ничего не выбрано</span><button class="btn btn-secondary" id="measureEdit">Изменить</button><button class="btn btn-secondary" id="measureRemove">Удалить элемент</button></div>
    <div class="measure-footer"><span id="measureStatus" role="status"></span><button class="btn btn-secondary" id="measureSvg">SVG</button><button class="btn btn-secondary" id="measurePng">PNG</button><button class="btn btn-secondary" id="measurePdf">Скачать PDF</button></div>`;
  const dialog=document.createElement('dialog');dialog.id='measureDialog';dialog.innerHTML='<form id="measureEditForm"><div class="dialog-head"><h2 id="measureDialogTitle"></h2><button type="button" class="icon-btn" id="measureDialogClose" aria-label="Закрыть">×</button></div><div class="dialog-body" id="measureFields"></div><p class="form-error" id="measureError" role="alert"></p><div class="dialog-actions"><button type="submit" class="btn btn-primary" id="measureDialogSave">Сохранить</button></div></form>';document.body.append(dialog);
  const on=(id,event,fn)=>$(id).addEventListener(event,async e=>{try{await fn(e);}catch(error){notify(error.message,true);}});
  function sync(){document.body.classList.toggle('mobile-measure-full',mobile.matches&&full&&!$('measureView').classList.contains('hidden'));$('measureFullscreen').textContent=full?'← Разделы':'На весь экран';}
  function hint(){
    $('measureHint').textContent=!sketch?'Создайте первый эскиз.':({brush:'Рисуйте свободно пальцем. Цвет и толщина — выше. Два пальца перемещают поле.',eraser:'Проведите по кисти: ластик стирает части штрихов. Чертёжные линии удаляются через «Выбор».',draw:'Ведите пальцем. Концы притягиваются к существующим углам. Два пальца — перемещение. Сложный штрих останется свободным.',select:'Выберите элемент. Угол или подпись можно перетащить. Два пальца — масштаб и перемещение.',wall:chain?'Укажите следующий угол. Касание первого угла замкнёт контур.':'Касайтесь плана, чтобы начертить контур помещения.',partition:chain?'Укажите конец перегородки.':'Укажите начало и конец перегородки.',dimension:dimensionStart?'Выберите второй угол для размерной линии.':'Выберите два угла, затем введите измеренное расстояние.',label:'Нажмите в месте подписи помещения.',pan:'Перемещайте план пальцем или мышью. Два пальца меняют масштаб.'})[tool];
  }
  const getCamera=()=>({x:cameraX,y:cameraY,scale});
  function setCamera(c){cameraX=c.x;cameraY=c.y;scale=c.scale;scaleStage();}
  function view(){const v=$('measureViewport');return {x:cameraX,y:cameraY,width:Math.max(1,v.clientWidth)/scale,height:Math.max(1,v.clientHeight)/scale};}
  function scaleStage(){const v=$('measureViewport'),stage=$('measureStage');stage.style.setProperty('--measure-scale',scale);stage.style.width=v.clientWidth+'px';stage.style.height=v.clientHeight+'px';if(sketch)stage.innerHTML=sketchSvg(sketch,{editing:true,view:view(),grid:$('measureGrid').checked&&scale>.12,selected,chain:dimensionStart??chain});previewStroke();}
  function fit(){if(!sketch||$('measureView').classList.contains('hidden'))return;const v=$('measureViewport');setCamera(fitCamera(contentBounds(sketch),v.clientWidth,v.clientHeight));}
  function canvas(){
    $('measureStage').classList.toggle('hidden',!sketch);$('measureEmpty').classList.toggle('hidden',!!sketch);
    
    for(const b of $('measureView').querySelectorAll('[data-measure-mode]')){b.disabled=!sketch;b.setAttribute('aria-pressed',String(b.dataset.measureMode===tool));}
    for(const id of ['measureRename','measureDeleteSheet','measureSvg','measurePng','measurePdf','measureFit','measureZoomIn','measureZoomOut'])$(id).disabled=!sketch||saving;
    $('measureUndo').disabled=!history.length;$('measureRedo').disabled=!future.length;
    $('measureFinish').disabled=!chain&&!dimensionStart;
    $('measureGrid').disabled=['draw','brush','eraser'].includes(tool);$('measureOrtho').disabled=$('measureGrid').disabled;
    $('measureEdit').disabled=!selected||!['labels','dimensions','edges'].includes(selected.kind);
    $('measureRemove').disabled=!selected;
    $('measureSelection').textContent=selected?({brushes:'Штрих кисти',nodes:'Угол: перетащите для изменения',edges:'Стена / перегородка',dimensions:'Измеренный размер',labels:'Подпись помещения'})[selected.kind]:'Ничего не выбрано';
    $('measurePaintOptions').classList.toggle('hidden',!['brush','eraser'].includes(tool));$('measureColorLabel').classList.toggle('hidden',tool!=='brush');$('measureBrushLabel').classList.toggle('hidden',tool!=='brush');$('measureEraserLabel').classList.toggle('hidden',tool!=='eraser');$('measureView').classList.toggle('painting',['brush','eraser'].includes(tool));
    $('measureDrawOptions').classList.toggle('hidden',tool!=='draw');hint();scaleStage();previewStroke();
  }
  function refreshSheets(){
    $('measureSheets').replaceChildren();for(const s of getProject().measureSketches??[])$('measureSheets').add(new Option(s.name+(s.floor?' · '+s.floor:''),s.id));
    $('measureSheets').value=sketch?.id??'';$('measureSheets').disabled=saving||!sketch;
    $('measureFloor').textContent=sketch?`Этаж: ${sketch.floor||'не указан'}`:'';
  }
  function resetInteraction(){cancelDrag();chain=null;first=null;dimensionStart=null;selected=null;}
  function render(){
    if(owner!==getProject().id){resetInteraction();owner=getProject().id;sketch=structuredClone(getProject().measureSketches?.[0]??null);history=[];future=[];resetInteraction();$('measureStatus').textContent='Изменения сохраняются на устройстве.';}
    sync();refreshSheets();canvas();
  }
  async function persist(){
    queued=true;if(saving)return;saving=true;$('measureStatus').textContent='Сохраняем…';
    try{do{queued=false;const next=structuredClone(getProject());const index=(next.measureSketches??[]).findIndex(s=>s.id===sketch.id);if(index<0)throw new Error('Эскиз не найден в объекте.');next.measureSketches[index]=structuredClone(sketch);const saved=await commit(next);$('measureStatus').textContent=saved?'Сохранено на устройстве':'Только в памяти. Скачайте проект до закрытия.';}while(queued);}
    catch(error){$('measureStatus').textContent='Ошибка сохранения: '+error.message;notify(error.message,true);}
    finally{saving=false;refreshSheets();canvas();}
  }
  function apply(next){const errors=validateSketches([next]);if(errors.length)throw new Error(errors.join(' '));const projectNext={...getProject(),measureSketches:(getProject().measureSketches??[]).map(s=>s.id===next.id?next:s)};if(new Blob([JSON.stringify(projectNext)]).size>MAX_BACKUP_BYTES)throw new Error('Объект превышает 50 МБ. Сохраните копию и создайте следующий объект.');if(JSON.stringify(next)===JSON.stringify(sketch)){canvas();return;}history.push(structuredClone(sketch));if(history.length>80)history.shift();future=[];sketch=next;canvas();void persist();}
  function edit(title,fields,action){$('measureDialogTitle').textContent=title;$('measureFields').innerHTML=fields;$('measureError').textContent='';editAction=action;dialog.showModal();}
  const field=(id,label,value='',extra='')=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(value)}" ${extra}></div>`;
  function editSheet(isNew){if(saving)return;edit(isNew?'Новый обмерный эскиз':'Название и этаж',field('measureName','Название',isNew?'Обмерный эскиз':sketch.name,'required maxlength="200"')+field('measureLevel','Этаж',isNew?'':sketch.floor,'maxlength="200"'),async()=>{
    const name=$('measureName').value.trim(),floor=$('measureLevel').value.trim();if(!name)throw new Error('Укажите название.');
    if(isNew){const next=structuredClone(getProject());if((next.measureSketches?.length??0)>=100)throw new Error('Допускается не более 100 эскизов.');const s=createSketch(uid(),name,floor);next.measureSketches=[...(next.measureSketches??[]),s];saving=true;try{const saved=await commit(next);sketch=s;history=[];future=[];resetInteraction();$('measureStatus').textContent=saved?'Эскиз сохранён':'Только в памяти — скачайте проект.';}finally{saving=false;}render();requestAnimationFrame(fit);}
    else apply({...sketch,name,floor});
  });}
  function editDimension(a,b,existing){if(a===b)return;edit('Измеренный размер',field('measureDistance','Расстояние',existing?.value??'','required inputmode="decimal"')+`<div class="field"><label for="measureUnit">Единица</label><select id="measureUnit">${['мм','см','м'].map(u=>`<option${u===(existing?.unit??'мм')?' selected':''}>${u}</option>`).join('')}</select></div><div class="field"><label for="measureSide">Сторона размерной линии</label><select id="measureSide"><option value="42">Первая</option><option value="-42"${existing?.offset===-42?' selected':''}>Противоположная</option></select></div><p class="field-note">Введённый размер не перестраивает стены. Это подпись фактического замера.</p>`,()=>{
    const d={id:existing?.id??uid(),a,b,value:measuredValue($('measureDistance').value),unit:$('measureUnit').value,offset:Number($('measureSide').value)};
    const next=structuredClone(sketch);next.dimensions=next.dimensions.filter(x=>x.id!==d.id);next.dimensions.push(d);dimensionStart=null;selected={kind:'dimensions',id:d.id};apply(next);
  });}
  function editLabel(point,existing){edit('Подпись помещения',`<div class="field"><label for="measureText">Название, номер, высота или примечание</label><textarea id="measureText" maxlength="1000" rows="4" required>${esc(existing?.text??'')}</textarea></div>`,()=>{
    const text=$('measureText').value.trim();if(!text)throw new Error('Введите подпись.');const l={id:existing?.id??uid(),x:point.x,y:point.y,text},next=structuredClone(sketch);next.labels=next.labels.filter(x=>x.id!==l.id);next.labels.push(l);selected={kind:'labels',id:l.id};apply(next);
  });}
  function point(event){const r=$('measureStage').getBoundingClientRect();return {x:cameraX+(event.clientX-r.left)/scale,y:cameraY+(event.clientY-r.top)/scale};}
  function nearest(p){return nearestEndpoint(sketch.nodes,p,22/scale);}
  function clickCanvas(event){
    if(!sketch||drag||Date.now()<suppressClick)return;
    const target=event.target.closest('[data-kind]'),p=point(event);

    if(tool==='select'){selected=target?{kind:target.dataset.kind,id:target.dataset.id}:null;canvas();return;}
    if(['pan','draw','brush','eraser'].includes(tool))return;
    if(tool==='label'){editLabel(p);return;}
    if(tool==='dimension'){
      const n=target?.dataset.kind==='nodes'?sketch.nodes.find(n=>n.id===target.dataset.id):nearest(p);
      if(!n){notify('Для размера выберите существующий угол.');return;}
      if(!dimensionStart){dimensionStart=n.id;canvas();}else if(n.id!==dimensionStart)editDimension(dimensionStart,n.id);return;
    }
    const next=structuredClone(sketch),origin=sketch.nodes.find(n=>n.id===chain);
    const hit=target?.dataset.kind==='nodes'?sketch.nodes.find(n=>n.id===target.dataset.id):null;
    const snapped=hit??snappedPoint(p,origin,$('measureGrid').checked,$('measureOrtho').checked);
    let n=hit??nearest(snapped);if(!n){n={id:uid(),...snapped};next.nodes.push(n);}
    if(chain&&n.id!==chain){if(!next.edges.some(e=>(e.a===chain&&e.b===n.id)||(e.b===chain&&e.a===n.id)))next.edges.push({id:uid(),a:chain,b:n.id,kind:tool});
      if(tool==='partition'||n.id===first){chain=null;first=null;}else chain=n.id;
    }else if(!chain){chain=n.id;first=n.id;}
    selected=null;apply(next);
  }
  function previewStroke(){
    const svg=$('measureStage').querySelector('svg');if(!svg)return;svg.querySelector('[data-preview]')?.remove();if(!drag?.stroke)return;
    const points=drag.stroke,near=drag.brush?null:nearest(points.at(-1));
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('data-preview','');g.setAttribute('pointer-events','none');
    if(drag.brush){g.innerHTML=`<path d="${brushPath(points)}" fill="none" stroke="${drag.color}" stroke-width="${drag.width}" stroke-linecap="round" stroke-linejoin="round"/>`;svg.append(g);return;}
    g.innerHTML=`<polyline points="${points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="#de7c30" stroke-width="3" vector-effect="non-scaling-stroke"/>${near?`<circle cx="${near.x}" cy="${near.y}" r="${12/scale}" fill="none" stroke="#de7c30" stroke-width="3" vector-effect="non-scaling-stroke"/>`:''}`;svg.append(g);
  }
  function editEdge(){const e=sketch.edges.find(e=>e.id===selected.id);edit('Форма линии',`<div class="field"><label for="measureShape">Преобразовать</label><select id="measureShape"><option value="line">Прямая</option>${e.stroke?'<option value="auto">Определить автоматически</option><option value="arc">Дуга</option><option value="free">Исходный штрих</option>':''}</select></div><p>Связи с соседними линиями сохраняются. Размер между концами дуги обозначает хорду.</p>`,()=>{const next=structuredClone(sketch),edge=next.edges.find(x=>x.id===e.id);delete edge.bulge;Object.assign(edge,recognizeStroke(edge.stroke??[], $('measureShape').value));apply(next);});$('measureShape').value=e.shape??'line';}
  function eraseAt(p){const r=Number($('measureEraserWidth').value)/(2*scale),a=drag.last,n=Math.max(1,Math.ceil(Math.hypot(p.x-a.x,p.y-a.y)/(r*.5)));for(let i=1;i<=n;i++)sketch.brushes=eraseBrushes(sketch.brushes??[],{x:a.x+(p.x-a.x)*i/n,y:a.y+(p.y-a.y)*i/n},r,uid);drag.last=p;canvas();const svg=$('measureStage').querySelector('svg'),ring=document.createElementNS('http://www.w3.org/2000/svg','circle');for(const [k,v]of Object.entries({cx:p.x,cy:p.y,r,fill:'#ffffff55',stroke:'#de7c30','stroke-width':1/scale,'pointer-events':'none'}))ring.setAttribute(k,v);svg.append(ring);}
  for(const name of ['Brush','Eraser'])on('measure'+name+'Width','input',()=>{$('measure'+name+'Output').textContent=$('measure'+name+'Width').value;});
  let edgeFrame=null;
  function startEdgePan(){if(edgeFrame!==null)return;edgeFrame=requestAnimationFrame(edgePan);}
  function edgePan(){edgeFrame=null;if(!drag?.stroke||!drag.cursor)return;const r=$('measureStage').getBoundingClientRect(),p=drag.cursor;
    const speed=(v,min,max)=>v<min+35?-Math.min(8,(min+35-v)/4):v>max-35?Math.min(8,(v-max+35)/4):0;
    const dx=speed(p.clientX,r.left,r.right),dy=speed(p.clientY,r.top,r.bottom);if(!dx&&!dy)return;
    cameraX+=dx/scale;cameraY+=dy/scale;drag.stroke.push(snappedPoint(point(p),null,false,false));if(drag.stroke.length>1500)drag.stroke=drag.stroke.filter((_,i)=>i%2===0);scaleStage();startEdgePan();
  }
  let suppressClick=0;
  function cancelDrag(){if(!drag)return;const old=drag;drag=null;if(old.before)sketch=old.before;try{$('measureStage').releasePointerCapture(old.pointer);}catch{}canvas();}
  $('measureStage').addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary||!sketch)return;
    const element=event.target.closest('[data-kind]');
    if(tool==='eraser'){drag={pointer:event.pointerId,before:structuredClone(sketch),eraser:true,last:point(event)};selected=null;eraseAt(drag.last);}
    else if(tool==='brush'){drag={pointer:event.pointerId,stroke:[point(event)],brush:true,color:$('measureColor').value,width:Number($('measureBrushWidth').value)/scale};selected=null;previewStroke();}
    else if(tool==='draw'){const p=snappedPoint(point(event),null,false,false);drag={pointer:event.pointerId,stroke:[p]};selected=null;previewStroke();}
    else if(tool==='pan'&&event.pointerType==='mouse'){drag={pointer:event.pointerId,pan:true,x:event.clientX,y:event.clientY,left:cameraX,top:cameraY};}
    else if(tool==='select'&&['nodes','labels'].includes(element?.dataset.kind)){selected={kind:element.dataset.kind,id:element.dataset.id};drag={pointer:event.pointerId,before:structuredClone(sketch),kind:selected.kind,id:selected.id,start:point(event)};}
    if(drag){event.preventDefault();$('measureStage').setPointerCapture(event.pointerId);}
  });
  $('measureStage').addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();
    if(drag.eraser){eraseAt(point(event));return;}
    if(drag.stroke){drag.cursor={clientX:event.clientX,clientY:event.clientY};startEdgePan();const p=snappedPoint(point(event),null,false,false);const last=drag.stroke.at(-1);if(Math.hypot(p.x-last.x,p.y-last.y)*scale>2){drag.stroke.push(p);if(drag.stroke.length>1500)drag.stroke=drag.stroke.filter((_,i)=>i%2===0);previewStroke();}return;}
    if(drag.pan){setCamera({x:drag.left-(event.clientX-drag.x)/scale,y:drag.top-(event.clientY-drag.y)/scale,scale});drag.moved=true;return;}
    const p=point(event);if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)*scale<5)return;
    drag.moved=true;const original=drag.before[drag.kind].find(n=>n.id===drag.id),n=sketch[drag.kind].find(n=>n.id===drag.id);
    Object.assign(n,snappedPoint({x:original.x+p.x-drag.start.x,y:original.y+p.y-drag.start.y},null,$('measureGrid').checked,false));canvas();
  });
  $('measureStage').addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;const done=drag;drag=null;suppressClick=Date.now()+300;
    try{$('measureStage').releasePointerCapture(event.pointerId);}catch{}
    if(done.brush){try{done.stroke.push(snappedPoint(point(event),null,false,false));const next=structuredClone(sketch);next.brushes=[...(next.brushes??[]),{id:uid(),color:done.color,width:done.width,points:done.stroke}];apply(next);}catch(error){canvas();notify(error.message,true);}return;}
    if(done.stroke){try{const end=snappedPoint(point(event),null,false,false);done.stroke.push(end);const length=done.stroke.reduce((v,p,i)=>v+(i?Math.hypot(p.x-done.stroke[i-1].x,p.y-done.stroke[i-1].y):0),0);if(length*scale>=12){const result=addStroke(sketch,done.stroke,{radius:22/scale,mode:$('measureRecognition').value,id:uid});selected={kind:'edges',id:result.edge.id};apply(result.next);}else canvas();}catch(error){canvas();notify(error.message,true);}return;}
    if(done.before){const next=sketch;sketch=done.before;try{apply(next);}catch(error){canvas();notify(error.message,true);}}else canvas();
  });
  $('measureStage').addEventListener('pointercancel',cancelDrag);
  $('measureStage').addEventListener('lostpointercapture',()=>{if(drag)cancelDrag();});
  attachMeasureNavigation({viewport:$('measureViewport'),getMode:()=>tool,getCamera,setCamera,cancelDrawing:cancelDrag});
  new ResizeObserver(()=>{if(!$('measureView').classList.contains('hidden'))scaleStage();}).observe($('measureViewport'));
  on('measureStage','click',clickCanvas);
  on('measureStage','keydown',e=>{if(e.key==='Enter'||e.key===' '){const t=e.target.closest('[data-kind]');if(t){e.preventDefault();selected={kind:t.dataset.kind,id:t.dataset.id};canvas();}}});
  on('measureView','click',e=>{const b=e.target.closest('[data-measure-mode]');if(b){resetInteraction();tool=b.dataset.measureMode;canvas();}});
  on('measureMoreTools','click',()=>{const open=$('measureView').classList.toggle('more-tools');$('measureMoreTools').setAttribute('aria-expanded',String(open));$('measureMoreTools').textContent=open?'Свернуть':'Ещё…';});
  for(const id of ['measureNew','measureNewEmpty'])on(id,'click',()=>editSheet(true));
  on('measureRename','click',()=>editSheet(false));
  on('measureDialogClose','click',()=>dialog.close());
  on('measureEditForm','submit',async e=>{e.preventDefault();$('measureDialogSave').disabled=true;try{await editAction();dialog.close();refreshSheets();canvas();}catch(error){$('measureError').textContent=error.message;}finally{$('measureDialogSave').disabled=false;}});
  on('measureSheets','change',()=>{if(saving){$('measureSheets').value=sketch.id;return;}resetInteraction();sketch=structuredClone(getProject().measureSketches.find(s=>s.id===$('measureSheets').value));history=[];future=[];render();fit();});
  on('measureDeleteSheet','click',async()=>{if(saving||!sketch||!await confirmAction(`Удалить эскиз «${sketch.name}»? Его можно восстановить из скачанной копии проекта.`,'Удалить эскиз'))return;const next=structuredClone(getProject());next.measureSketches=next.measureSketches.filter(s=>s.id!==sketch.id);saving=true;try{const ok=await commit(next);sketch=structuredClone(next.measureSketches[0]??null);history=[];future=[];resetInteraction();$('measureStatus').textContent=ok?'Эскиз удалён':'Изменение только в памяти — скачайте проект.';}finally{saving=false;}render();fit();});
  on('measureRemove','click',()=>{if(selected){const next=removeSketchElement(sketch,selected.kind,selected.id);selected=null;apply(next);}});
  on('measureEdit','click',()=>{if(selected?.kind==='edges'){editEdge();return;}if(selected?.kind==='dimensions'){const d=sketch.dimensions.find(d=>d.id===selected.id);editDimension(d.a,d.b,d);}if(selected?.kind==='labels'){const l=sketch.labels.find(l=>l.id===selected.id);editLabel(l,l);}});
  on('measureUndo','click',()=>{if(!history.length)return;resetInteraction();future.push(structuredClone(sketch));sketch=history.pop();canvas();void persist();});
  on('measureRedo','click',()=>{if(!future.length)return;resetInteraction();history.push(structuredClone(sketch));sketch=future.pop();canvas();void persist();});
  on('measureFinish','click',()=>{chain=null;first=null;dimensionStart=null;canvas();});
  on('measureGrid','change',canvas);on('measureOrtho','change',hint);on('measureFit','click',fit);
  on('measureZoomIn','click',()=>{setCamera(zoomCamera(getCamera(),1.25,{x:$('measureViewport').clientWidth/2,y:$('measureViewport').clientHeight/2}));});on('measureZoomOut','click',()=>{setCamera(zoomCamera(getCamera(),.8,{x:$('measureViewport').clientWidth/2,y:$('measureViewport').clientHeight/2}));});
  on('measureFullscreen','click',()=>{full=!full;sync();requestAnimationFrame(fit);if(!full)window.scrollTo({top:0});});
  on('measureSvg','click',()=>{if(!sketch)return;const url=URL.createObjectURL(new Blob([sketchSvg(sketch,{projectName:getProject().name})],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='Обмерный план.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});
  for(const format of ['png','pdf'])on(format==='png'?'measurePng':'measurePdf','click',async()=>{
    if(!sketch)return;const blob=await exportSketch(sketchSvg(sketch,{projectName:getProject().name}),format),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`${sketch.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')} — обмерный эскиз.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  mobile.addEventListener('change',sync);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&!$('measureView').classList.contains('hidden')){resetInteraction();canvas();}});
  return {render,fit,sync,enter(){full=true;render();requestAnimationFrame(fit);},get busy(){return saving||!!drag;}};
}
