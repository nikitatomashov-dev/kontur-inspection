import { createMeasureWorkspace } from './measure.js';
import { createQuickCapture } from './quick-capture.js';
import { defectDescription } from './domain.js';
import { CATEGORIES, MATERIALS, MAX_BACKUP_BYTES, MAX_PHOTOS_PER_DEFECT, REGISTER_COLUMNS, listStructures, getStructureGroup, groupDefects, getMaterials, getDefectTemplates, getCategory, createProject, nextDefectNumber, uid, validateProject, upgradeProject, buildCsv, getPlacements, getDefectElementText, MAX_PLACEMENTS_PER_DEFECT } from './domain.js';
import { loadProject, storeProject, listProjects, deleteProject, restoreProject } from './storage.js';
import { preparePhoto, verifyPhotoImages } from './photos.js';
import { createZoneEditor } from './zone-editor.js';
import { getDefectAppearance, getAppearanceStyle, drawDefectZone, drawDefectMarker } from './appearance.js';
import { buildDocx } from './docx-export.js';
import { createStrengthWorkspace } from './strength.js';
import { createCalibrationWorkspace } from './calibration.js';
import { createMobileMap } from './mobile-map.js';
import { attachTouchMap } from './touch-map.js';

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const drawingTypes = {plan:'План этажа',section:'Разрез',facade:'Фасад'};
const icons = {
  zone:'<rect x="4" y="5" width="16" height="14" stroke-dasharray="3 2"/><path d="M2 2h4v4H2zm16 16h4v4h-4z"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v14H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  brand:'<path d="M4 20V4h16v9M4 12h8V4m0 8v8h4"/><circle cx="19" cy="18" r="4"/><path d="m17 18 1.5 1.5 2.5-3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',table:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/>',
  cursor:'<path d="m4 3 6 18 3-8 8-3L4 3Z"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  fit:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',check:'<path d="m5 12 4 4L19 6"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  folder:'<path d="M3 7V4h7l2 3h9v13H3V7Z"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01"/>',
  print:'<path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6v-7Zm11-3h1"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z"/>'
};
const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.map}</svg>`;
document.querySelectorAll('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });

const options = (items, selected) => items.map(item => `<option value="${escapeHtml(item.id)}"${item.id === selected ? ' selected' : ''}>${escapeHtml(item.label ?? item.title)}</option>`).join('');
let project, activeDrawingId, selectedId = null, draft = null, dirty = false, scale = 1, mode = 'select', activeTab = 'map';
let persistent = true, storageWriteBlocked = false, uploadFile = null, pdfSession = null, toastTimer, dragging = false, busy = false;
let photoBusy = false, zoneEditor, activePlacementId = null, addingPlacement = false;
let strengthWorkspace, calibrationWorkspace, measureWorkspace, mobileMap, quickCapture, lastSurveyTab = 'map';
const activePlacement = () => draft?.placements.find(p => p.id === activePlacementId);
const onDrawing = (defect, drawingId) => getPlacements(defect).some(p => p.drawingId === drawingId);
const activeDrawing = () => project?.drawings.find(item => item.id === activeDrawingId);
const notify = (message, error = false) => {
  if(error && $('mobileDefectDialog').open) mobileMap?.setError(message);
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.remove('hidden'); $('toast').classList.toggle('error', error);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), error ? 9000 : 4200);
};
function on(id, event, action) { $(id).addEventListener(event, async e => { try { await action(e); } catch (error) { console.error(error); notify(error.message || 'Не удалось выполнить действие.', true); } }); }
function setPersistence(saved) {
  persistent = saved; $('saveStatus').textContent = saved ? 'Сохранено на устройстве' : 'Не сохранено — скачайте проект';
  $('saveStatus').dataset.state = saved ? 'saved' : 'error';
  $('saveStatus').style.color = saved ? '' : '#b54737';
}
async function commit(next) {
  next.updatedAt = new Date().toISOString();
  const validation = validateProject(next);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  if (new Blob([JSON.stringify(next)]).size > MAX_BACKUP_BYTES) throw new Error('Объект превышает 50 МБ. Создайте отдельный проект для следующих чертежей.');
  try { if(storageWriteBlocked) throw new Error('Исходные данные защищены от перезаписи.'); await storeProject(next); setPersistence(true); }
  catch { setPersistence(false); notify('Не удалось сохранить на устройстве. Скачайте проект, прежде чем закрывать приложение.', true); }
  project = next;
}
function confirmAction(message, title = 'Подтвердите действие') {
  $('confirmTitle').textContent = title; $('confirmMessage').textContent = message; $('confirmDialog').showModal();
  return new Promise(resolve => {
    const finish = result => { $('confirmDialog').close(); $('confirmYes').onclick = null; $('confirmNo').onclick = null; $('confirmDialog').oncancel = null; resolve(result); };
    $('confirmYes').onclick = () => finish(true); $('confirmNo').onclick = () => finish(false); $('confirmDialog').oncancel = e => { e.preventDefault(); finish(false); };
  });
}
async function canLeave() {
  if(photoBusy || busy || strengthWorkspace?.busy || calibrationWorkspace?.busy || measureWorkspace?.busy) { notify('Дождитесь окончания обработки и сохранения.'); return false; }
  return (!dirty && !strengthWorkspace?.dirty) || await confirmAction('В карточке есть несохранённые изменения. Отменить их?', 'Карточка не сохранена');
}
function askText(title, value = '', {required = true} = {}) {
  $('textDialogTitle').textContent = title; $('textDialogLabel').textContent = title; $('textDialogInput').required = required; $('textDialogInput').value = value; $('textDialog').showModal(); $('textDialogInput').focus();
  return new Promise(resolve => {
    const finish = result => { $('textDialog').close(); $('textForm').onsubmit = null; $('textCancel').onclick = null; $('textDialog').oncancel = null; resolve(result); };
    $('textForm').onsubmit = e => { e.preventDefault(); const value = $('textDialogInput').value.trim(); if (value || !required) finish(value); };
    $('textCancel').onclick = () => finish(null); $('textDialog').oncancel = e => {e.preventDefault(); finish(null);};
  });
}
function resetCard() { zoneEditor?.cancel(); draft = null; selectedId = null; activePlacementId = null; addingPlacement = false; dirty = false; renderCard(); renderMarkers(); }
function setMode(nextMode) {
  if(nextMode==='select')quickCapture?.stop();
  if(mode !== nextMode) zoneEditor?.cancel();
  mode = nextMode;
  if(mode === 'select') addingPlacement = false;
  for(const [id,value] of [['addTool','add'],['zoneTool','zone'],['selectTool','select']]) { $(id).classList.toggle('active',mode===value); $(id).setAttribute('aria-pressed',String(mode===value)); }
  $('drawingStage').dataset.mode = mode;
  $('drawingStage').style.cursor = mode === 'select' ? 'grab' : 'crosshair';
  $('modeHint').textContent = addingPlacement ? `Ещё одно место дефекта № ${draft.number}: ${mode === 'zone' ? 'обведите зону' : 'укажите точку'}` : mode === 'zone' ? 'Обведите зону или укажите два противоположных угла' : mode === 'add' ? 'Нажмите на чертеже в месте дефекта' : 'Выберите отметку, чтобы открыть карточку';
  $('cancelPlacement').classList.toggle('hidden', !addingPlacement);
  quickCapture?.render();
  if(mode === 'select' && mobileMap?.mobile) $('modeHint').textContent = 'План — одним пальцем, масштаб — двумя. Нажмите отметку для правки.';
}
function renderSidebar() {
  $('renameProject').textContent = project.name;
  $('projectMeta').textContent = project.id === 'demo-project' ? 'Учебный пример · вымышленные данные' : `${project.drawings.length} черт. · ${project.defects.length} деф.`;
  $('drawingCount').textContent = String(project.drawings.length);
  $('drawingList').innerHTML = project.drawings.map(drawing => `<div class="drawing-item ${drawing.id === activeDrawingId ? 'active' : ''}"><button class="drawing-select" data-drawing="${escapeHtml(drawing.id)}"${drawing.id === activeDrawingId ? ' aria-current="true"' : ''}><span class="drawing-icon">${icon('map')}</span><span class="drawing-copy"><span class="drawing-name">${escapeHtml(drawing.name)}</span><span class="drawing-type">${drawingTypes[drawing.type]} · ${project.defects.filter(d => onDrawing(d, drawing.id)).length} деф.</span></span></button><div class="drawing-actions"><button class="icon-btn" data-rename-drawing="${escapeHtml(drawing.id)}" aria-label="Переименовать ${escapeHtml(drawing.name)}">${icon('edit')}</button><button class="icon-btn" data-delete-drawing="${escapeHtml(drawing.id)}" aria-label="Удалить ${escapeHtml(drawing.name)}">${icon('trash')}</button></div></div>`).join('');
  $('defectCount').textContent = String(project.defects.length);
}
function renderMap(fit = false) {
  const drawing = activeDrawing();
  $('drawingStage').classList.toggle('hidden', !drawing); $('canvasEmpty').classList.toggle('hidden', Boolean(drawing));
  ['addTool','zoneTool','selectTool','zoomIn','zoomOut','fitView','exportMap'].forEach(id => { $(id).disabled = !drawing; });
  $('drawingHeading').textContent = drawing ? `${drawing.name} / ${drawingTypes[drawing.type]}` : 'Чертёж не выбран';
  $('mapCount').textContent = drawing ? `Отметок: ${project.defects.flatMap(getPlacements).filter(p => p.drawingId === drawing.id).length}` : '';
  if (drawing) {
    if ($('planImage').getAttribute('src') !== drawing.imageData) $('planImage').src = drawing.imageData;
    $('planImage').dataset.drawing = drawing.id; $('planImage').alt = drawing.name;
    if (fit) requestAnimationFrame(fitDrawing); else applyScale();
  }
  renderMarkers();
}
function applyScale() {
  const drawing = activeDrawing(); if (!drawing) return;
  $('drawingStage').style.width = `${Math.round(drawing.width * scale)}px`; $('drawingStage').style.height = `${Math.round(drawing.height * scale)}px`;
  $('zoomLabel').textContent = `${Math.round(scale * 100)}%`;
}
function fitDrawing() {
  const drawing = activeDrawing(); if (!drawing || activeTab !== 'map') return;
  const viewport = $('viewport'), padding = getComputedStyle(viewport);
  const availableWidth = viewport.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) - 2;
  const availableHeight = viewport.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom) - 2;
  scale = Math.max(.03, Math.min(availableWidth / drawing.width, availableHeight / drawing.height, 1.5));
  applyScale(); $('viewport').scrollTo(0, 0);
}
function zoom(multiplier) {
  const viewport = $('viewport'); const oldScale = scale;
  scale = Math.max(.03, Math.min(6, scale * multiplier)); applyScale();
  viewport.scrollLeft = (viewport.scrollLeft + viewport.clientWidth / 2) * scale / oldScale - viewport.clientWidth / 2;
  viewport.scrollTop = (viewport.scrollTop + viewport.clientHeight / 2) * scale / oldScale - viewport.clientHeight / 2;
}
function renderMarkers() {
  const records = (project?.defects ?? []).map(record => record.id === draft?.id ? draft : record);
  if (draft && !selectedId) records.push(draft);
  const visible = records.filter(d => onDrawing(d, activeDrawingId));
  $('markers').innerHTML = visible.flatMap(defect => getPlacements(defect).filter(p => p.drawingId === activeDrawingId).map(placement => {
    const selected = !addingPlacement && defect.id === draft?.id && placement.id === activePlacementId;
    const appearance = getDefectAppearance(defect.number), style = getAppearanceStyle(defect.number);
    const attributes = `data-workflow="${defect.workflow==='draft'?'draft':'complete'}" data-defect="${escapeHtml(defect.id)}" data-placement="${escapeHtml(placement.id)}"`;
    if(placement.zone) {
      const z=placement.zone;
      const handles=selected ? ['nw','ne','sw','se'].map(corner=>`<button type="button" class="zone-handle" data-corner="${corner}" aria-label="Изменить ${ {nw:'верхний левый',ne:'верхний правый',sw:'нижний левый',se:'нижний правый'}[corner]} угол зоны" title="Потяните угол или используйте стрелки клавиатуры"></button>`).join('') : '';
      return `<div class="zone${selected?' selected':''}" ${attributes} style="left:${z.x*100}%;top:${z.y*100}%;width:${z.width*100}%;height:${z.height*100}%;--zone-color:${appearance.color};${style}"><button type="button" class="zone-hit" aria-label="Зона дефекта ${defect.number}: ${escapeHtml(defectDescription(defect)||'новая зона')}"><span class="zone-number">${defect.number}</span></button>${handles}</div>`;
    }
    return `<button class="marker${selected?' selected':''}" ${attributes} style="left:${placement.x*100}%;top:${placement.y*100}%;--marker-color:${appearance.color};${style}" title="№ ${defect.number} — ${escapeHtml(defect.title||'Новый дефект')}" aria-label="Дефект ${defect.number}: ${escapeHtml(defectDescription(defect)||'новая отметка')}"><span class="marker-number">${defect.number}</span></button>`;
  })).join('');
  $('defectLegend').innerHTML = visible.sort((a,b)=>a.number-b.number).map(d=>`<button class="defect-legend-item" type="button" data-legend-defect="${escapeHtml(d.id)}" title="${escapeHtml(d.title)}"><span class="appearance-swatch" style="${getAppearanceStyle(d.number)}"></span>№ ${d.number}${d.workflow==='draft'?' · черновик':''}</button>`).join('');
}
function captureDraftFields() {
  if(!draft) return;
  Object.assign(draft,{structure:$('structure').value,material:$('material').value,templateId:$('template').value,title:$('defectTitle').value.trim(),category:$('category').value,cause:$('cause').value.trim(),quantity:$('quantity').value===''?null:Number($('quantity').value),unit:$('unit').value.trim(),note:$('note').value.trim()});
  if(activePlacement()) activePlacement().location = $('location').value.trim();
}
function renderPlacements() {
  if(!draft)return;
  $('placementSelect').innerHTML = options(draft.placements.map((p,i)=>({id:p.id,label:`${i+1}. ${project.drawings.find(d=>d.id===p.drawingId)?.name} · ${p.zone?'Зона':'Точка'}${p.location?' · '+p.location:''}`})),activePlacementId);
  $('placementDrawing').innerHTML = options(project.drawings.map(d=>({id:d.id,label:d.name})),activeDrawingId);
  $('placementCount').textContent = String(draft.placements.length);
  $('removePlacement').disabled = draft.placements.length<=1;
  $('removePlacement').title = draft.placements.length<=1?'Последнюю отметку можно удалить вместе с дефектом':'Удалить выбранное место после сохранения карточки';
  $('addPlacementPoint').disabled = $('addPlacementZone').disabled = draft.placements.length>=MAX_PLACEMENTS_PER_DEFECT;
}
function markDirty() { dirty=true; $('formStatus').textContent='Есть несохранённые изменения.'; mobileMap?.refresh(); }
function updateDraftZone(zone) {
  const placement=activePlacement();
  if(!placement || !zone || busy)return;
  placement.zone=zone;placement.x=zone.x+zone.width/2;placement.y=zone.y+zone.height/2;
  markDirty();renderMarkers();
}
function renderPhotos() {
  const photos=draft?.photos ?? [];
  $('photoCount').textContent=`${photos.length} / ${MAX_PHOTOS_PER_DEFECT}`;
  $('photoEmpty').classList.toggle('hidden',photos.length>0);
  $('photoGrid').innerHTML=photos.map((photo,index)=>`<div class="photo-card"><button type="button" class="photo-preview" data-view-photo="${escapeHtml(photo.id)}" aria-label="Открыть фото ${index+1}"><img src="${escapeHtml(photo.imageData)}" alt="${escapeHtml(photo.caption||photo.name)}"></button><button type="button" class="photo-remove icon-btn" data-remove-photo="${escapeHtml(photo.id)}" aria-label="Убрать фото ${index+1}" title="Убрать фотографию из карточки">${icon('close')}</button><div class="photo-filename" title="${escapeHtml(photo.name)}">${escapeHtml(photo.name)}</div><input class="photo-caption" data-photo-caption="${escapeHtml(photo.id)}" value="${escapeHtml(photo.caption)}" maxlength="2000" aria-label="Подпись к фото ${index+1}" placeholder="Подпись к фотографии"></div>`).join('');
  $('addPhotos').disabled=photoBusy||photos.length>=MAX_PHOTOS_PER_DEFECT; $('takePhoto').disabled=$('addPhotos').disabled;
  $('saveDefect').disabled=photoBusy; $('deleteDefect').disabled=photoBusy;
  mobileMap?.setBusy(photoBusy || busy);
}
function showPhoto(photo, number) {
  if(!photo)return;
  $('viewerImage').src=photo.imageData;$('viewerImage').alt=photo.caption||photo.name;
  $('photoViewerTitle').textContent=`Дефект № ${number} · фотография`;
  $('viewerCaption').textContent=photo.caption||photo.name;$('photoViewer').showModal();
}
async function addPhotoFiles(files) {
  if(!draft||photoBusy||busy||!files.length)return;
  if((draft.photos?.length??0)+files.length>MAX_PHOTOS_PER_DEFECT)throw new Error(`В карточке может быть до ${MAX_PHOTOS_PER_DEFECT} фотографий.`);
  const ownerId=draft.id; photoBusy=true;renderPhotos();$('photoStatus').textContent='Обрабатываем фотографии…';
  try {
    const prepared=[];
    for(const file of files)prepared.push(await preparePhoto(file));
    if(draft?.id!==ownerId)return;
    const nextPhotos=[...(draft.photos??[]),...prepared];
    const candidate=structuredClone(project);const index=candidate.defects.findIndex(d=>d.id===ownerId);
    if(index>=0)candidate.defects[index].photos=nextPhotos;else candidate.defects.push({...draft,photos:nextPhotos});
    if(new Blob([JSON.stringify(candidate)]).size>MAX_BACKUP_BYTES)throw new Error('Фотографии превышают лимит проекта 50 МБ. Добавьте меньше снимков.');
    draft.photos=nextPhotos;markDirty();$('photoStatus').textContent='Фотографии добавлены. Сохраните карточку дефекта.';
  } catch(error) {$('photoStatus').textContent=error.message;throw error;}
  finally {photoBusy=false;renderPhotos();}
}
function fillDependencies(structure, material, templateId) {
  $('structureGroupHint').textContent = `Раздел ведомости: ${getStructureGroup(structure).label}`;
  $('material').innerHTML = options(getMaterials(structure), material);
  const templates = getDefectTemplates(structure, $('material').value);
  const reference = templates.filter(t => t.reference), general = templates.filter(t => !t.reference);
  $('template').innerHTML = '<option value="">Свой дефект / выбрать типовой</option>'
    + (reference.length ? `<optgroup label="ГОСТ 31937-2024 — справочные признаки">${options(reference, templateId)}</optgroup>` : '')
    + (general.length ? `<optgroup label="Общие формулировки">${options(general, templateId)}</optgroup>` : '');
  updateCauses();
}
function updateCauses() {
  const template = getDefectTemplates($('structure').value, $('material').value).find(item => item.id === $('template').value);
  $('causeSuggestions').innerHTML = (template?.causes ?? []).map(text => `<option value="${escapeHtml(text)}"></option>`).join('');
  const reference = template?.reference;
  $('templateReference').classList.toggle('hidden', !reference);
  $('templateReference').open = false;
  $('referenceSummary').textContent = reference?.kind === 'system' ? 'ГОСТ: пояснение к оценке системы' : 'ГОСТ: категория и условия оценки';
  $('referenceCategory').textContent = reference?.category ?? '';
  $('referenceConditions').textContent = reference?.conditions ?? '';
  $('referenceSource').textContent = reference?.source ?? '';
  $('referenceDefect').textContent = template?.title ?? '';
}
function renderCard() {
  mobileMap?.refresh();
  $('defectForm').classList.toggle('hidden', !draft); $('inspectorEmpty').classList.toggle('hidden', Boolean(draft)); $('closeInspector').classList.toggle('hidden', !draft);
  $('inspectorTitle').textContent = draft ? `Дефект № ${draft.number}` : 'Карточка дефекта';
  if (!draft) return;
  $('draftNotice').textContent=draft.workflow==='draft'?'Черновик: описание, фото и измерения можно заполнить позже. Обычное сохранение завершает карточку.':'';
  $('cardDrawing').textContent=`${activeDrawing()?.name ?? ''} · ${activePlacement()?.zone?'Зона':'Точечная отметка'} · всего мест: ${draft.placements.length}`;
  renderPlacements();
  renderPhotos();$('photoStatus').textContent='JPG, PNG, WebP · до 12 фото на дефект';
  const structural = listStructures({ engineering: false });
  const systems = listStructures().filter(item => !structural.some(s => s.id === item.id));
  $('structure').innerHTML = `<optgroup label="Строительные конструкции">${options(structural, draft.structure)}</optgroup><optgroup label="Инженерные системы · ГОСТ 31937-2024">${options(systems, draft.structure)}</optgroup>`;
  fillDependencies(draft.structure, draft.material, draft.templateId);
  $('category').innerHTML = options(CATEGORIES, draft.category);
  for (const [id, key] of Object.entries({defectTitle:'title',cause:'cause',quantity:'quantity',unit:'unit',note:'note'})) $(id).value = draft[key] ?? '';
  $('location').value=activePlacement()?.location ?? '';
  $('deleteDefect').classList.toggle('hidden', !selectedId);
  $('formStatus').textContent = selectedId ? 'Изменения попадут в ведомость после сохранения.' : 'Новая отметка. Заполните карточку и сохраните.';
}
function renderRegister() {
  $('registerColumnHeaders').innerHTML = REGISTER_COLUMNS.map(label => `<th scope="col">${escapeHtml(label)}</th>`).join('');
  const oldDrawing = $('filterDrawing').value, oldCategory = $('filterCategory').value;
  $('filterDrawing').innerHTML = '<option value="">Все чертежи</option>' + options(project.drawings.map(d => ({id:d.id,label:d.name})), oldDrawing);
  $('filterCategory').innerHTML = '<option value="">Все категории</option>' + options(CATEGORIES, oldCategory);
  $('registerSubtitle').textContent = `${project.name} · чертежей: ${project.drawings.length}`;
  const counts = [{label:'Всего дефектов',number:project.defects.length,color:'#136f63'}, ...['not_assessed','limited','emergency'].map(id => ({label:getCategory(id).label,number:project.defects.filter(d=>d.category===id).length,color:getCategory(id).color}))];
  $('stats').innerHTML = counts.map(item => `<div class="stat-card"><span class="stat-dot" style="background:${item.color}"></span><div class="stat-number">${item.number}</div><div class="stat-label">${item.label}</div></div>`).join('');
  renderRows();
}
function filteredDefects() {
  const search = $('searchDefects').value.toLocaleLowerCase('ru').trim();
  const drawingFilter = $('filterDrawing').value, categoryFilter = $('filterCategory').value;
  return project.defects.filter(d => (!drawingFilter || onDrawing(d,drawingFilter)) && (!categoryFilter || d.category === categoryFilter) && (!search || [d.title,d.cause,d.note,getDefectElementText(project,d),getStructureGroup(d.structure).label,String(d.number)].join(' ').toLocaleLowerCase('ru').includes(search)));
}
function renderRows() {
  const filtered=filteredDefects();
  $('filterCount').textContent = `${filtered.length} из ${project.defects.length}`;
  $('defectsTable').innerHTML = filtered.length ? groupDefects(filtered).map(group => `<tr class="register-section"><th colspan="7">${escapeHtml(group.label)}</th></tr>` + group.defects.map(d => {
    const locations = getPlacements(d).map(p => `<div class="register-location">${escapeHtml(project.drawings.find(item=>item.id===p.drawingId)?.name)}${p.location ? `<br>${escapeHtml(p.location)}` : ''}</div>`).join('');
    const photos=(d.photos??[]).map((photo,index)=>`<button class="table-photo" data-photo-owner="${escapeHtml(d.id)}" data-view-photo="${escapeHtml(photo.id)}" aria-label="Открыть фото ${index+1} дефекта ${d.number}"><img src="${escapeHtml(photo.imageData)}" alt="${escapeHtml(photo.caption||photo.name)}"><span>${escapeHtml(photo.caption||`Фото ${index+1}`)}</span></button>`).join('');
    return `<tr class="register-defect"><td><button class="location-link" data-open-defect="${escapeHtml(d.id)}" aria-label="Открыть дефект № ${d.number} на чертеже">${d.number}</button></td><td>${escapeHtml(listStructures().find(s => s.id === d.structure)?.label)}${locations}<div class="text-small text-muted">${escapeHtml(MATERIALS.find(m=>m.id===d.material)?.label)}</div></td><td><div class="table-photos">${photos||'<span class="text-muted">Нет фото</span>'}</div></td><td><span class="category-badge" data-category="${d.category}">${escapeHtml(getCategory(d.category).label)}</span></td><td>${escapeHtml(defectDescription(d))}${d.note ? '<div class="defect-note">'+escapeHtml(d.note)+'</div>' : ''}</td><td>${escapeHtml(d.cause) || '<span class="text-muted">Не указана</span>'}</td><td>${d.quantity === null ? '<span class="text-muted">Не измерен</span>' : `${d.quantity.toLocaleString('ru-RU')} ${escapeHtml(d.unit)}`}</td></tr>`;

  }).join('')).join('') : '<tr><td colspan="7"><div class="table-empty"><h3>Дефектов пока нет</h3><p>Добавьте отметки на чертёж или измените фильтры.</p></div></td></tr>';
}
function renderAll(fit = false) { quickCapture?.render(); renderSidebar(); renderMap(fit); renderRegister(); if(activeTab==='strength')strengthWorkspace.render(); if(activeTab==='calibration')calibrationWorkspace.render(); if(activeTab==='measure')measureWorkspace.render(); }
async function switchTab(tab) {
  if (tab !== activeTab && !await canLeave()) return false;
  if (tab !== activeTab) { resetCard(); strengthWorkspace?.reset(); }
  activeTab = tab;
  if(tab === 'map') mobileMap?.enter(); else mobileMap?.sync();
  const laboratory = tab === 'strength' || tab === 'calibration';
  if (!laboratory) lastSurveyTab = tab;
  $('surveySection').classList.toggle('active', !laboratory);
  $('surveySection').setAttribute('aria-pressed', String(!laboratory));
  $('laboratorySection').classList.toggle('active', laboratory);
  $('laboratorySection').setAttribute('aria-pressed', String(laboratory));
  $('mapTab').classList.toggle('hidden', laboratory);
  $('registerTab').classList.toggle('hidden', laboratory);
  $('measureTab').classList.toggle('hidden', laboratory);
  $('measureView').classList.toggle('hidden', tab !== 'measure');
  $('measureTab').classList.toggle('active', tab === 'measure');
  $('measureTab').setAttribute('aria-current',tab === 'measure'?'page':'false');
  $('strengthTab').classList.toggle('hidden', !laboratory);
  $('calibrationTab').classList.toggle('hidden', !laboratory);
  $('workspaceTabs').setAttribute('aria-label', laboratory ? 'Лабораторные работы — вкладки' : 'Обследовательские работы — вкладки');
  $('drawingSectionNote').textContent = laboratory ? 'Чертежи общие для объекта. Точки прочности имеют отдельную нумерацию.' : 'Все этажи этого объекта входят в одну ведомость.';
  $('mapView').classList.toggle('hidden', tab !== 'map'); $('registerView').classList.toggle('hidden', tab !== 'register');
  $('strengthView').classList.toggle('hidden', tab !== 'strength');
  $('calibrationView').classList.toggle('hidden', tab !== 'calibration');
  $('calibrationTab').classList.toggle('active', tab === 'calibration');$('calibrationTab').setAttribute('aria-current',tab==='calibration'?'page':'false');
  $('strengthTab').classList.toggle('active', tab === 'strength');$('strengthTab').setAttribute('aria-current',tab==='strength'?'page':'false');
  $('mapTab').classList.toggle('active', tab === 'map'); $('registerTab').classList.toggle('active', tab === 'register');
  $('mapTab').setAttribute('aria-current', tab === 'map' ? 'page' : 'false'); $('registerTab').setAttribute('aria-current', tab === 'register' ? 'page' : 'false');
  if (tab === 'map') requestAnimationFrame(fitDrawing); else if(tab==='strength')strengthWorkspace.enter();else if(tab==='calibration')calibrationWorkspace.render();else if(tab==='measure')measureWorkspace.enter();else renderRegister();
  strengthWorkspace?.syncMobile();
  measureWorkspace?.sync();
  return true;
}
async function openDefect(id, placementId) {
  if(busy||photoBusy)return;
  const previousDrawing = activeDrawingId, fromMap = activeTab === 'map';
  const preferredDrawing = activeTab === 'register' ? ($('filterDrawing').value || activeDrawingId) : activeDrawingId;
  if(id===draft?.id) {
    captureDraftFields(); zoneEditor?.cancel();
  } else {
    if(!await canLeave())return;
    const defect=project.defects.find(item=>item.id===id);if(!defect)return;
    dirty=false; if(activeTab !== 'map') await switchTab('map'); selectedId=id; draft=structuredClone(defect);
  }
  const placement=draft.placements.find(p=>p.id===placementId) ?? draft.placements.find(p=>p.drawingId===preferredDrawing) ?? draft.placements[0];
  activePlacementId=placement.id;activeDrawingId=placement.drawingId;setMode('select');renderAll(!fromMap || previousDrawing !== activeDrawingId);renderCard();
  mobileMap.open();
}
function download(data, name, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], {type}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const safeName = name => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0,100);
async function readImage(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) throw new Error('Выберите изображение JPG или PNG.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 100000000) throw new Error('Изображение слишком большое. Уменьшите его до 100 мегапикселей.');
    const ratio = Math.min(1, 3000 / Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(image.naturalWidth*ratio)); canvas.height = Math.max(1,Math.round(image.naturalHeight*ratio));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
    return {imageData:canvas.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', .92), width:canvas.width, height:canvas.height};
  } finally { URL.revokeObjectURL(url); }
}
async function chooseUpload() { if (await canLeave()) { $('drawingFile').value = ''; $('drawingFile').click(); } }
async function closeUpload() {
  if (busy) return;
  $('uploadDialog').close(); uploadFile = null;
  if (pdfSession) { await pdfSession.destroy(); pdfSession = null; }
}

on('measureTab','click',()=>switchTab('measure'));
on('mapTab','click',()=>switchTab('map')); on('registerTab','click',()=>switchTab('register'));on('strengthTab','click',()=>switchTab('strength'));
on('surveySection','click',()=>switchTab(lastSurveyTab));
on('calibrationTab','click',()=>switchTab('calibration'));
on('laboratorySection','click',()=>switchTab('strength'));
for (const id of ['uploadSide','uploadSidebar','uploadEmpty']) on(id,'click',chooseUpload);
on('addTool','click',async()=>{if (!await canLeave()) return; resetCard(); setMode('add');});
on('zoneTool','click',async()=>{if (!await canLeave()) return; resetCard(); setMode('zone');});
on('selectTool','click',async()=>{if (!await canLeave()) return; resetCard(); setMode('select');});
on('fitView','click',fitDrawing); on('zoomIn','click',()=>zoom(1.25)); on('zoomOut','click',()=>zoom(.8));
on('closeInspector','click',async()=>{if(mobileMap.mobile) mobileMap.close(); else if(await canLeave()) resetCard();});
function beginDefect(point,zone=null) {
  if(quickCapture?.active && !addingPlacement){void quickCapture.place(point,zone);return;}
  if(busy||photoBusy)return;
  const now=new Date().toISOString();
  const placement={id:uid(),drawingId:activeDrawingId,x:point.x,y:point.y,zone,location:''};
  if(addingPlacement && draft) {
    captureDraftFields();
    if(draft.placements.length>=MAX_PLACEMENTS_PER_DEFECT)throw new Error('Достигнут предел количества мест одного дефекта.');
    draft.placements.push(placement);
  } else {
    selectedId=null;draft={id:uid(),number:nextDefectNumber(project),placements:[placement],photos:[],structure:'wall',material:'masonry',templateId:'',title:'',category:'not_assessed',cause:'',quantity:null,unit:'м²',note:'',createdAt:now,updatedAt:now};
  }
  activePlacementId=placement.id;dirty=true;setMode('select');renderCard();renderMarkers();
  mobileMap.open();
  if(!mobileMap.mobile) $('defectTitle').focus({preventScroll:true});
}
mobileMap = createMobileMap({getDraft:()=>draft,isDirty:()=>dirty,capture:captureDraftFields,isMap:()=>activeTab==='map',fit:fitDrawing});
zoneEditor=createZoneEditor({stage:$('drawingStage'),getMode:()=>mode,getDraft:()=>busy||addingPlacement?null:activePlacement(),onCreate:zone=>beginDefect({x:zone.x+zone.width/2,y:zone.y+zone.height/2},zone),onResize:updateDraftZone,onHint:hint=>{$('modeHint').textContent=hint;}});
attachTouchMap({viewport:$('viewport'),stage:$('drawingStage'),getMode:()=>mode,getScale:()=>scale,setScale:value=>{scale=value;applyScale();},cancelZone:()=>zoneEditor.cancel()});
on('drawingStage','click',async event=>{
  if(event.target.closest('.marker,.zone-handle')||dragging||mode!=='add'||!activeDrawing())return;
  if(!addingPlacement&&!await canLeave())return;
  const rect=$('drawingStage').getBoundingClientRect();
  beginDefect({x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))});
});
on('markers','click',event=>{if(mode!=='select'||event.target.closest('.zone-handle'))return;const marker=event.target.closest('[data-defect]');if(marker&&(mobileMap.mobile||marker.dataset.defect!==draft?.id||marker.dataset.placement!==activePlacementId))return openDefect(marker.dataset.defect,marker.dataset.placement);});
on('defectLegend','click',event=>{const button=event.target.closest('[data-legend-defect]');if(button)return openDefect(button.dataset.legendDefect);});
on('placementSelect','change',()=>openDefect(draft.id,$('placementSelect').value));
for(const [id,nextMode] of [['addPlacementPoint','add'],['addPlacementZone','zone']])on(id,'click',()=>{
  if(!draft||busy||photoBusy)return;
  captureDraftFields();zoneEditor.cancel();
  activeDrawingId=$('placementDrawing').value;addingPlacement=true;setMode(nextMode);renderAll(true);
  if(mobileMap.mobile) { mobileMap.close(); mobileMap.enter(); requestAnimationFrame(fitDrawing); }
  else $('viewport').scrollIntoView({behavior:'smooth',block:'center'});
});
on('cancelPlacement','click',()=>{if(!draft)return;setMode('select');activeDrawingId=activePlacement().drawingId;renderAll(true);});
on('removePlacement','click',()=>{
  if(!draft||busy||photoBusy||draft.placements.length<=1)return;
  captureDraftFields();zoneEditor.cancel();draft.placements=draft.placements.filter(p=>p.id!==activePlacementId);
  activePlacementId=draft.placements[0].id;activeDrawingId=draft.placements[0].drawingId;setMode('select');dirty=true;renderAll(true);renderCard();
  $('formStatus').textContent='Место убрано. Сохраните карточку, чтобы применить изменение.';
});
let pan;
$('viewport').addEventListener('pointerdown',event=>{
  dragging=false;
  if(mode==='select' && event.pointerType==='mouse' && event.button===0 && !event.target.closest('.marker,button')) pan={x:event.clientX,y:event.clientY,left:$('viewport').scrollLeft,top:$('viewport').scrollTop,id:event.pointerId};
});
$('viewport').addEventListener('pointermove',event=>{if(!pan)return; const dx=event.clientX-pan.x,dy=event.clientY-pan.y; if(Math.abs(dx)+Math.abs(dy)>5){dragging=true; $('viewport').setPointerCapture(pan.id); $('viewport').scrollLeft=pan.left-dx;$('viewport').scrollTop=pan.top-dy;}});
const endPan=()=>{pan=null;setTimeout(()=>{dragging=false;},0);}; $('viewport').addEventListener('pointerup',endPan); $('viewport').addEventListener('pointercancel',endPan);
on('drawingList','click',async event=>{
  const select=event.target.closest('[data-drawing]'), remove=event.target.closest('[data-delete-drawing]'), rename=event.target.closest('[data-rename-drawing]');
  if(!select&&!remove&&!rename || !await canLeave())return;
  if(select){resetCard();strengthWorkspace.reset(); activeDrawingId=select.dataset.drawing; await switchTab(['strength','calibration'].includes(activeTab)?'strength':'map'); renderAll(true);}
  if(rename){const drawing=project.drawings.find(d=>d.id===rename.dataset.renameDrawing); const name=await askText('Название чертежа',drawing.name);if(name){const next=structuredClone(project);next.drawings.find(d=>d.id===drawing.id).name=name;await commit(next);renderAll();}}
  if(remove){const id=remove.dataset.deleteDrawing, drawing=project.drawings.find(d=>d.id===id),count=project.defects.flatMap(getPlacements).filter(p=>p.drawingId===id).length;
    if(!await confirmAction(`Удалить «${drawing.name}», отметки дефектов (${count}) и точки прочности (${(project.strengthPoints??[]).filter(p=>p.drawingId===id).length}) на нём? Дефекты с местами на других чертежах сохранятся. Отменить удаление можно из скачанной копии проекта.`,'Удалить чертёж?'))return;
    const next=structuredClone(project);next.drawings=next.drawings.filter(d=>d.id!==id);next.strengthPoints=(next.strengthPoints??[]).filter(p=>p.drawingId!==id);next.defects=next.defects.map(d=>({...d,placements:d.placements.filter(p=>p.drawingId!==id)})).filter(d=>d.placements.length);await commit(next);if(activeDrawingId===id)activeDrawingId=project.drawings[0]?.id;resetCard();strengthWorkspace.reset();renderAll(true);
  }
});
on('defectForm','input',markDirty);
on('category','change',()=>{if(draft){draft.category=$('category').value;markDirty();renderMarkers();}});
on('addPhotos','click',()=>{if(draft&&!photoBusy&&!busy){$('photoFiles').value='';$('photoFiles').click();}});
on('takePhoto','click',()=>{if(draft&&!photoBusy&&!busy){$('cameraFile').value='';$('cameraFile').click();}});
on('photoFiles','change',()=>addPhotoFiles([...$('photoFiles').files]));
on('cameraFile','change',()=>addPhotoFiles([...$('cameraFile').files]));
on('photoGrid','click',event=>{
  const remove=event.target.closest('[data-remove-photo]'),preview=event.target.closest('[data-view-photo]');if(!draft||photoBusy||busy)return;
  if(remove){draft.photos=draft.photos.filter(p=>p.id!==remove.dataset.removePhoto);markDirty();renderPhotos();}
  if(preview)showPhoto(draft.photos.find(p=>p.id===preview.dataset.viewPhoto),draft.number);
});
on('photoGrid','input',event=>{const input=event.target.closest('[data-photo-caption]');if(!input||!draft)return;const photo=draft.photos.find(p=>p.id===input.dataset.photoCaption);if(photo){photo.caption=input.value;markDirty();}});
on('closePhotoViewer','click',()=>$('photoViewer').close());
$('photoViewer').addEventListener('close',()=>$('viewerImage').removeAttribute('src'));
on('structure','change',()=>{fillDependencies($('structure').value,'','');$('defectTitle').value='';$('cause').value='';dirty=true;});
on('material','change',()=>{fillDependencies($('structure').value,$('material').value,'');$('defectTitle').value='';$('cause').value='';dirty=true;});
on('template','change',()=>{const template=getDefectTemplates($('structure').value,$('material').value).find(t=>t.id===$('template').value);if(template){$('defectTitle').value=template.title;$('unit').value=template.unit;$('cause').value='';}updateCauses();dirty=true;});
on('defectForm','submit',async event=>{
  event.preventDefault();if(!draft||busy||photoBusy)return;
  const title=$('defectTitle').value.trim();if(!title){$('defectTitle').setCustomValidity('Введите описание дефекта.');$('defectTitle').reportValidity();$('defectTitle').setCustomValidity('');return;}
  busy=true;$('saveDefect').disabled=true;mobileMap.setError('');mobileMap.setBusy(true);$('defectForm').inert=true;
  try {
    captureDraftFields();
    const record={...draft,title,workflow:'complete',updatedAt:new Date().toISOString()};
    if(record.quantity!==null&&!record.unit)throw new Error('Укажите единицу измерения для объёма.');
    const next=structuredClone(project);const index=next.defects.findIndex(d=>d.id===record.id);if(index>=0)next.defects[index]=record;else next.defects.push(record);
    await commit(next);selectedId=record.id;draft=structuredClone(record);dirty=false;setMode('select');activeDrawingId=activePlacement().drawingId;renderAll();renderCard();$('formStatus').textContent=persistent?'Сохранено. Ведомость обновлена.':'Сохранено только в памяти. Скачайте проект.';if(persistent)notify('Дефект сохранён. Ведомость обновлена.');
    if(persistent && mobileMap.mobile) mobileMap.close();
  } finally {busy=false;quickCapture?.render();$('saveDefect').disabled=false;mobileMap.setBusy(false);$('defectForm').inert=false;}
});
on('saveFieldDraft','click',async()=>{
  if(!draft||busy||photoBusy)return;
  busy=true;mobileMap.setBusy(true);$('defectForm').inert=true;
  try{
    captureDraftFields();const record={...draft,workflow:'draft',updatedAt:new Date().toISOString()};
    const next=structuredClone(project),index=next.defects.findIndex(d=>d.id===record.id);
    if(index<0)next.defects.push(record);else next.defects[index]=record;
    await commit(next);selectedId=record.id;draft=structuredClone(record);dirty=false;renderAll();renderCard();
    if(persistent){mobileMap.close();notify('Черновик сохранён. Его можно заполнить позже.');}
  }finally{busy=false;quickCapture?.render();mobileMap.setBusy(false);$('defectForm').inert=false;}
});
on('deleteDefect','click',async()=>{
  if(busy||photoBusy||!selectedId||!await confirmAction(`Удалить дефект № ${draft.number}, все его отметки (${draft.placements.length}) и строку ведомости?`,'Удалить дефект?'))return;
  const next=structuredClone(project);next.defects=next.defects.filter(d=>d.id!==selectedId);await commit(next);resetCard();renderAll();notify('Дефект удалён.');
});
on('drawingFile','change',async()=>{
  const file=$('drawingFile').files[0];if(!file)return;
  if(file.size>MAX_BACKUP_BYTES)throw new Error('Максимальный размер загружаемого файла — 50 МБ.');
  uploadFile=file;$('uploadFilename').textContent=file.name;$('drawingName').value=file.name.replace(/\.[^.]+$/,'').slice(0,200);$('drawingType').value='plan';$('uploadError').textContent='';$('confirmUpload').disabled=true;$('pdfPageField').classList.add('hidden');$('uploadDialog').showModal();
  try{
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      $('uploadFilename').textContent=`${file.name} · читаем PDF…`;
      const {inspectPdf}=await import('./pdf-import.js');const session=await inspectPdf(file);
      if(uploadFile!==file||!$('uploadDialog').open){await session.destroy();return;}
      pdfSession=session;$('pdfPageField').classList.remove('hidden');$('pdfPage').value='1';$('pdfPage').max=String(session.pageCount);$('pdfPageInfo').textContent=`Всего страниц: ${session.pageCount}`;
    }
    $('uploadFilename').textContent=file.name;$('confirmUpload').disabled=false;
  }catch(error){$('uploadError').textContent=error.message;}
});
on('cancelUpload','click',closeUpload);$('uploadDialog').addEventListener('cancel',e=>{e.preventDefault();closeUpload();});
on('uploadForm','submit',async event=>{
  event.preventDefault();if(!uploadFile||busy)return;busy=true;$('confirmUpload').disabled=true;$('cancelUpload').disabled=true;$('confirmUpload').textContent='Обрабатываем…';$('uploadError').textContent='';
  try{
    const raster=pdfSession?await pdfSession.renderPage(Number($('pdfPage').value)):await readImage(uploadFile);
    const drawing={id:uid(),name:$('drawingName').value.trim(),type:$('drawingType').value,sourceName:uploadFile.name+(pdfSession?` · стр. ${$('pdfPage').value}`:''),...raster};
    const next=structuredClone(project);next.drawings.push(drawing);await commit(next);resetCard();strengthWorkspace.reset();activeDrawingId=drawing.id;busy=false;await switchTab(activeTab==='strength'?'strength':'map');renderAll(true);await closeUpload();notify('Чертёж добавлен в объект.');
  }catch(error){$('uploadError').textContent=error.message;}finally{busy=false;$('confirmUpload').disabled=false;$('cancelUpload').disabled=false;$('confirmUpload').textContent='Добавить чертёж';}
});
on('renameProject','click',async()=>{if(busy||photoBusy||measureWorkspace?.busy)return;const name=await askText('Название объекта',project.name);if(name){await commit({...project,name});renderAll();}});
on('newProject','click',async()=>{
  if(!await canLeave())return;
  const name=await askText('Новый объект','Новый объект');if(!name)return;
  await activateObject(createProject(name));notify('Объект создан. Предыдущий доступен в списке «Мои объекты».');
});
async function activateObject(next) {
  busy=true;
  try {
    if (!storageWriteBlocked) await storeProject(project);
    await storeProject(next);
    project=next; storageWriteBlocked=false; setPersistence(true);
    dirty=false; resetCard(); strengthWorkspace.reset(); activeDrawingId=project.drawings[0]?.id;
    $('filterDrawing').value=''; $('filterCategory').value=''; $('searchDefects').value='';
    busy=false; await switchTab('map'); setMode('select'); renderAll(true);
  } catch(error) { notify('Не удалось переключить объект. Текущий объект остаётся открыт. '+error.message,true); throw error; }
  finally { busy=false; }
}
async function renderProjectLibrary() {
  const items=await listProjects(true), deleted=$('showDeletedProjects').checked;
  $('projectLibraryList').innerHTML=items.filter(item=>Boolean(item.deleted)===deleted).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(item=>`<div class="object-row"><button class="object-item" ${deleted?'disabled':`data-object-id="${escapeHtml(item.id)}"`} ${item.id===project.id?'aria-current="true"':''}><strong>${escapeHtml(item.name)}</strong><span>${item.drawings} черт. · ${item.defects} деф.${item.id===project.id?' · Текущий объект':''}</span></button><button class="btn btn-secondary object-action" data-${deleted?'restore':'delete'}-object="${escapeHtml(item.id)}" aria-label="${deleted?'Восстановить':'Удалить'} объект ${escapeHtml(item.name)}">${deleted?'Восстановить':'Удалить'}</button></div>`).join('') || `<p>${deleted?'Удалённых объектов нет.':'Сохранённых объектов пока нет.'}</p>`;
}
on('showDeletedProjects','change',renderProjectLibrary);
on('projectLibrary','click',async()=>{
  if(busy||photoBusy)return;
  await renderProjectLibrary();
  $('projectLibraryDialog').showModal();
});
on('closeProjectLibrary','click',()=>$('projectLibraryDialog').close());
on('projectLibraryList','click',async event=>{
  if(busy||photoBusy)return;
  const restore=event.target.closest('[data-restore-object]');
  if(restore){await restoreProject(restore.dataset.restoreObject);await renderProjectLibrary();notify('Объект восстановлен. Снимите отметку «Удалённые объекты», чтобы открыть его.');return;}
  const remove=event.target.closest('[data-delete-object]');
  if(remove){
    const id=remove.dataset.deleteObject, item=(await listProjects()).find(p=>p.id===id);if(!item)return;
    if(!await confirmAction(`Удалить объект «${item.name}» (${item.drawings} черт., ${item.defects} деф.)? Его можно будет восстановить из списка «Удалённые объекты».${id===project.id&&dirty?' Несохранённые изменения карточки не войдут в восстановленный объект.':''}`,'Удалить объект'))return;
    busy=true;
    try{
      if(id===project.id && !storageWriteBlocked)await storeProject(project);
      await deleteProject(id,createProject());
      if(id===project.id){
        project=upgradeProject(await loadProject());dirty=false;resetCard();strengthWorkspace.reset();activeDrawingId=project.drawings[0]?.id;storageWriteBlocked=false;setPersistence(true);
        $('filterDrawing').value='';$('filterCategory').value='';$('searchDefects').value='';
        busy=false;await switchTab('map');setMode('select');renderAll(true);
      }
      await renderProjectLibrary();notify('Объект перемещён в удалённые. Его можно восстановить.');
    }finally{busy=false;}
    return;
  }
  const button=event.target.closest('[data-object-id]');if(!button)return;
  if(button.dataset.objectId===project.id){$('projectLibraryDialog').close();return;}
  if(!await canLeave())return;
  const stored=await loadProject(button.dataset.objectId);if(!stored)throw new Error('Объект не найден.');
  await activateObject(upgradeProject(stored));$('projectLibraryDialog').close();notify('Объект открыт.');
});
on('exportProject','click',()=>{if(measureWorkspace?.busy){notify('Дождитесь сохранения эскиза.');return;}download(JSON.stringify(project),`${safeName(project.name)}.kontur.json`,'application/json');notify(dirty?'Скачаны сохранённые записи. Изменения открытой карточки ещё не сохранены.':'Проект скачан вместе с чертежами, дефектами, прочностями и обмерами.');});
on('importProject','click',async()=>{if(await canLeave()){$('projectFile').value='';$('projectFile').click();}});
on('projectFile','change',async()=>{
  const file=$('projectFile').files[0];if(!file)return;if(file.size>MAX_BACKUP_BYTES)throw new Error('Размер проекта превышает 50 МБ.');
  let data;try{data=JSON.parse(await file.text());}catch{throw new Error('Не удалось прочитать JSON. Выберите резервную копию проекта Контур.');}
  const validation=validateProject(data);if(!validation.valid)throw new Error(validation.errors.slice(0,3).join(' '));
  data=upgradeProject(data);
  for(const drawing of data.drawings){try{const image=new Image();image.src=drawing.imageData;await image.decode();if(image.naturalWidth!==drawing.width||image.naturalHeight!==drawing.height)throw new Error();}catch{throw new Error(`Повреждено изображение «${drawing.name}». Текущий объект сохранён.`);}}
  await verifyPhotoImages(data.defects.flatMap(d=>d.photos));
  if((await listProjects(true)).some(item=>item.id===data.id)){data.id=uid();data.name=`${data.name.slice(0,180)} (копия)`;}
  await activateObject(data);notify('Проект добавлен в «Мои объекты». Другие объекты сохранены.');
});
on('defectsTable','click',event=>{
  const photoButton=event.target.closest('[data-view-photo]');
  if(photoButton){const defect=project.defects.find(d=>d.id===photoButton.dataset.photoOwner);showPhoto(defect?.photos.find(p=>p.id===photoButton.dataset.viewPhoto),defect?.number);return;}
  const button=event.target.closest('[data-open-defect]');if(button)return openDefect(button.dataset.openDefect);
});
on('searchDefects','input',renderRows);on('filterDrawing','change',renderRows);on('filterCategory','change',renderRows);
on('exportWord','click',async()=>{
  if(busy)return;const defects=filteredDefects();if(!defects.length){notify('Нет дефектов для выгрузки. Измените фильтры.');return;}
  const button=$('exportWord');button.disabled=true;button.textContent='Готовим Word…';
  try{const blob=await buildDocx(project,defects);download(blob,`${safeName(project.name)} — ведомость.docx`);notify('Ведомость Word скачана с фотографиями.');}
  finally{button.disabled=false;button.innerHTML=icon('download')+'Скачать Word';}
});
on('exportCsv','click',()=>download(buildCsv(project),`${safeName(project.name)} — ведомость.csv`,'text/csv;charset=utf-8'));
on('printRegister','click',async()=>{await Promise.all([...$('defectsTable').querySelectorAll('img')].map(image=>image.decode()));window.print();});on('helpButton','click',()=>$('helpDialog').showModal());on('closeHelp','click',()=>$('helpDialog').close());
on('exportMap','click',async()=>{
  const drawing=activeDrawing();if(!drawing)return;
  const records=project.defects.filter(d=>onDrawing(d,drawing.id)).sort((a,b)=>a.number-b.number);
  const canvas=document.createElement('canvas');canvas.width=Math.max(drawing.width,900);
  const h=Math.round(drawing.height*canvas.width/drawing.width);canvas.height=h+100+Math.ceil(records.length/2)*44;
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);await $('planImage').decode();context.drawImage($('planImage'),0,0,canvas.width,h);
  for(const d of records)for(const p of getPlacements(d).filter(p=>p.drawingId===drawing.id)) {
    if(p.zone){const z=p.zone;drawDefectZone(context,{x:z.x*canvas.width,y:z.y*h,width:z.width*canvas.width,height:z.height*h},d.number);}
  }
  for(const d of records)for(const p of getPlacements(d).filter(p=>p.drawingId===drawing.id))drawDefectMarker(context,p.x*canvas.width,p.y*h,Math.max(16,canvas.width/65),d.number);
  context.textAlign='left';context.fillStyle='#17342f';context.font='bold 22px sans-serif';context.fillText(`${project.name} · ${drawing.name}`.slice(0,110),24,h+32);context.font='16px sans-serif';context.fillStyle='#55626b';context.fillText('Одинаковый номер — один дефект. Цвет и штриховка обозначают номер.',24,h+62);
  records.forEach((d,i)=>{const x=24+(i%2)*(canvas.width/2),y=h+100+Math.floor(i/2)*44;drawDefectZone(context,{x,y:y-16,width:30,height:25},d.number);context.fillStyle='#17342f';context.font='15px sans-serif';context.textAlign='left';context.fillText(`№ ${d.number} — ${d.title}`.slice(0,52),x+42,y+2,canvas.width/2-70);});
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Не удалось сформировать карту.');download(blob,`${safeName(drawing.name)} — карта дефектов.png`,'image/png');
});
window.addEventListener('beforeunload',e=>{if(dirty||strengthWorkspace?.dirty||strengthWorkspace?.busy||measureWorkspace?.busy||photoBusy||!persistent){e.preventDefault();e.returnValue='';}});
let resizeTimer, layoutWidth = innerWidth;
window.addEventListener('resize',()=>{
  // A phone keyboard changes height; keep the engineer's zoom and position.
  if(innerWidth === layoutWidth) return;
  layoutWidth = innerWidth;
  setMode(mode);
  clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(activeTab==='map')fitDrawing();if(activeTab==='strength')strengthWorkspace.fit();if(activeTab==='measure')measureWorkspace.fit();},180);
});

function demoProject() {
  const data=createProject('Учебный корпус · пример');data.id='demo-project';data.schemaVersion=2;
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1060;const c=canvas.getContext('2d');
  c.fillStyle='#fff';c.fillRect(0,0,1600,1060);c.strokeStyle='#566977';c.fillStyle='#566977';c.lineWidth=2;
  const line=(x1,y1,x2,y2)=>{c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();};
  const text=(s,x,y,size=20)=>{c.font=`${size}px Arial`;c.textAlign='center';c.fillText(s,x,y);};
  const xs=[180,550,920,1290],ys=[220,520,820];
  c.strokeStyle='#b4c4c9';c.setLineDash([12,7,2,7]);xs.forEach(x=>line(x,110,x,920));ys.forEach(y=>line(85,y,1410,y));c.setLineDash([]);
  c.strokeStyle='#79929b';xs.forEach((x,i)=>{c.beginPath();c.arc(x,940,23,0,Math.PI*2);c.stroke();text(String(i+1),x,948);});ys.forEach((y,i)=>{c.beginPath();c.arc(65,y,23,0,Math.PI*2);c.stroke();text(['В','Б','А'][i],65,y+7);});
  c.strokeStyle='#40535d';c.lineWidth=13;c.strokeRect(180,220,1110,600);line(550,220,550,820);line(920,220,920,820);line(180,520,1290,520);c.lineWidth=2;
  c.fillStyle='#fff';for(const x of [290,680,1050]){c.fillRect(x,208,140,25);c.fillRect(x,808,140,25);line(x,216,x+140,216);line(x,224,x+140,224);line(x,816,x+140,816);line(x,824,x+140,824);}
  for(const x of [420,790,1160]){c.fillRect(x,506,80,27);line(x,520,x,600);c.beginPath();c.arc(x,520,80,0,Math.PI/2);c.stroke();}
  c.fillStyle='#657b83';text('101',365,345,28);text('Кабинет',365,380,20);text('24,8 м²',365,410,18);text('102',735,345,28);text('Кабинет',735,380,20);text('25,1 м²',735,410,18);text('103',1105,345,28);text('Лаборатория',1105,380,20);text('25,1 м²',1105,410,18);
  text('104',365,660,28);text('Кабинет',365,695,20);text('24,8 м²',365,725,18);text('105',735,660,28);text('Холл',735,695,20);text('25,1 м²',735,725,18);text('106',1105,660,28);text('Лестничная клетка',1105,695,20);
  c.strokeStyle='#71858c';c.strokeRect(1000,735,210,65);for(let x=1015;x<1210;x+=20)line(x,735,x,800);line(1005,767,1200,767);
  c.strokeStyle='#8da0a6';line(180,145,1290,145);xs.forEach(x=>{line(x,130,x,175);line(x-7,152,x+7,138);});text('6 000',365,132,18);text('6 000',735,132,18);text('6 000',1105,132,18);line(1370,220,1370,820);ys.forEach(y=>{line(1355,y,1385,y);line(1363,y+7,1377,y-7);});text('4 800',1425,380,18);text('4 800',1425,680,18);
  c.fillStyle='#3b505a';text('ПЛАН ПЕРВОГО ЭТАЖА',795,70,27);c.fillStyle='#91a2a8';text('УЧЕБНЫЙ ЧЕРТЁЖ · ДАННЫЕ ВЫМЫШЛЕННЫЕ · НЕ ДЛЯ ИЗМЕРЕНИЙ',795,1020,16);
  const drawing={id:uid(),name:'План 1-го этажа',type:'plan',sourceName:'Учебный чертёж',imageData:canvas.toDataURL('image/png'),width:1600,height:1060};data.drawings.push(drawing);
  const base={drawingId:drawing.id,structure:'wall',material:'masonry',templateId:'',cause:'',quantity:null,unit:'м²',location:'',note:'Учебная запись. Не является результатом реального обследования.',createdAt:data.createdAt,updatedAt:data.createdAt};
  data.defects=[{...base,id:uid(),number:1,x:.344,y:.31,title:'Трещина в кладке',templateId:'masonry_crack',category:'limited',cause:'Неравномерные деформации основания — учебная гипотеза',quantity:1.2,unit:'м',location:'Ось 2, между Б–В'},{...base,id:uid(),number:2,x:.72,y:.774,title:'Высолы на поверхности кладки',templateId:'masonry_salts',category:'serviceable',quantity:.8,location:'Ось А, между 3–4'},{...base,id:uid(),number:3,x:.115,y:.61,title:'Увлажнение / следы замачивания',templateId:'moisture',category:'not_assessed',location:'Ось 1, между А–Б'}];return upgradeProject(data);
}
async function init() {
  try {
    const stored=await loadProject();
    if(stored){project=upgradeProject(stored);}
    else{project=upgradeProject(demoProject());await storeProject(project);}
    setPersistence(true);
  }catch(error){project=demoProject();storageWriteBlocked=true;setPersistence(false);notify('Хранилище недоступно или проект повреждён. Запись заблокирована до явного создания или открытия объекта; исходные данные не перезаписаны.',true);}
  activeDrawingId=project.drawings[0]?.id;renderAll(true);renderCard();setMode('select');
  if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{$('connectionStatus').textContent='Готово к работе офлайн';}).catch(()=>{$('connectionStatus').textContent='Без офлайн-кэша';});}
}
measureWorkspace=createMeasureWorkspace({getProject:()=>project,commit:async next=>{await commit(next);return persistent;},confirmAction,notify});
strengthWorkspace=createStrengthWorkspace({getProject:()=>project,getDrawingId:()=>activeDrawingId,setDrawingId:id=>{activeDrawingId=id;renderSidebar();},commit:async next=>{await commit(next);renderSidebar();return persistent;},canLeave,confirmAction,askText,upload:chooseUpload,notify});
calibrationWorkspace=createCalibrationWorkspace({getProject:()=>project,commit,askText,notify,openPoint:async id=>{if(await switchTab('strength'))await strengthWorkspace.open(id);}});
quickCapture=createQuickCapture({getProject:()=>project,getDrawingId:()=>activeDrawingId,isBusy:()=>busy||photoBusy,setBusy:value=>{busy=value;},commit,isPersistent:()=>persistent,canLeave,resetCard,setMode,renderAll,openDefect,notify});
init();
