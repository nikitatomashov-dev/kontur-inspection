import { normalizeZone, resizeZone } from './geometry.js';

/** Pointer/keyboard controller. Records and form fields remain owned by the app. */
export function createZoneEditor({ stage, getMode, getDraft, onCreate, onResize, onHint = () => {} }) {
  let pointer = null;
  let firstCorner = null;
  let preview = null;
  let suppressClickUntil = 0;

  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  const relativePoint = event => {
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const largeEnough = zone => {
    const rect = stage.getBoundingClientRect();
    return zone && zone.width * rect.width >= 4 && zone.height * rect.height >= 4;
  };
  function showPreview(zone) {
    if (!zone) return;
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'zone';
      preview.dataset.preview = '';
      preview.setAttribute('aria-hidden', 'true');
      preview.style.pointerEvents = 'none';
      stage.append(preview);
    }
    Object.assign(preview.style, { left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.width * 100}%`, height: `${zone.height * 100}%` });
  }
  function clearPreview() { preview?.remove(); preview = null; }
  function releasePointer() {
    const previous = pointer;
    pointer = null;
    stage.classList.remove('zone-drawing');
    if (previous) {
      try { if (stage.hasPointerCapture(previous.id)) stage.releasePointerCapture(previous.id); } catch { /* Pointer already cancelled by the browser. */ }
    }
    return previous;
  }
  function cancel() {
    const previous = releasePointer();
    firstCorner = null;
    clearPreview();
    if (previous?.kind === 'resize' && previous.changed && getDraft()?.id === previous.recordId) onResize({ ...previous.original });
  }
  function finishZone(zone) {
    if (!largeEnough(zone)) {
      onHint('Зона слишком мала. Укажите второй угол дальше от первого.');
      return false;
    }
    firstCorner = null;
    clearPreview();
    onCreate(zone);
    return true;
  }

  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer || event.isPrimary === false) return;
    const handle = event.target.closest?.('.zone-handle[data-corner]');
    const draft = getDraft();
    if (handle && draft?.zone && stage.contains(handle)) {
      stop(event);
      pointer = { kind: 'resize', id: event.pointerId, corner: handle.dataset.corner, original: { ...draft.zone }, recordId: draft.id, changed: false };
    } else if (getMode() === 'zone') {
      const point = relativePoint(event);
      if (!point) return;
      stop(event);
      pointer = { kind: 'create', id: event.pointerId, start: firstCorner ?? point, down: point, startX: event.clientX, startY: event.clientY, dragged: false, hadFirst: firstCorner !== null };
      showPreview(normalizeZone(pointer.start, point) ?? { ...point, width: 0, height: 0 });
    } else return;
    stage.classList.add('zone-drawing');
    try { stage.setPointerCapture(event.pointerId); } catch { /* A detached pointer cannot be captured. */ }
  }, true);

  stage.addEventListener('pointermove', event => {
    const point = relativePoint(event);
    if (!point) return;
    if (!pointer) {
      if (getMode() === 'zone' && firstCorner) showPreview(normalizeZone(firstCorner, point));
      return;
    }
    if (pointer.id !== event.pointerId) return;
    stop(event);
    if (pointer.kind === 'resize') {
      if (getDraft()?.id !== pointer.recordId) { releasePointer(); return; }
      const zone = resizeZone(pointer.original, pointer.corner, point);
      if (largeEnough(zone)) { pointer.changed = true; onResize(zone); }
    } else {
      if (getMode() !== 'zone') { cancel(); return; }
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) pointer.dragged = true;
      showPreview(normalizeZone(pointer.start, point));
    }
  }, true);

  stage.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    stop(event);
    const point = relativePoint(event);
    const previous = releasePointer();
    suppressClickUntil = Date.now() + 350;
    if (previous.kind === 'resize') {
      if (point && getDraft()?.id === previous.recordId) {
        const zone = resizeZone(previous.original, previous.corner, point);
        if (largeEnough(zone)) onResize(zone);
      }
      onHint('Размер зоны изменён. Сохраните карточку дефекта.');
      return;
    }
    if (getMode() !== 'zone' || !point) { firstCorner = null; clearPreview(); return; }
    if (previous.dragged || previous.hadFirst) {
      if (!finishZone(normalizeZone(previous.start, point))) {
        firstCorner = previous.start;
        showPreview({ ...firstCorner, width: 0, height: 0 });
      }
    } else {
      firstCorner = previous.down;
      showPreview({ ...firstCorner, width: 0, height: 0 });
      onHint('Первый угол выбран. Нажмите в противоположном углу зоны. Esc — отмена.');
    }
  }, true);

  stage.addEventListener('pointercancel', event => {
    if (pointer?.id === event.pointerId) { stop(event); cancel(); onHint('Построение зоны отменено. Можно начать заново.'); }
  }, true);
  stage.addEventListener('lostpointercapture', event => {
    if (pointer?.id === event.pointerId) cancel();
  });
  stage.addEventListener('click', event => {
    if (getMode() === 'zone' || event.target.closest?.('.zone-handle') || Date.now() < suppressClickUntil) stop(event);
  }, true);

  stage.addEventListener('keydown', event => {
    const handle = event.target.closest?.('.zone-handle[data-corner]');
    const draft = getDraft();
    if (!handle || !draft?.zone || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    stop(event);
    const corner = handle.dataset.corner;
    const zone = draft.zone;
    const point = { x: zone.x + (corner.includes('e') ? zone.width : 0), y: zone.y + (corner.includes('s') ? zone.height : 0) };
    const step = event.shiftKey ? .01 : .001;
    if (event.key === 'ArrowLeft') point.x -= step;
    if (event.key === 'ArrowRight') point.x += step;
    if (event.key === 'ArrowUp') point.y -= step;
    if (event.key === 'ArrowDown') point.y += step;
    const resized = resizeZone(zone, corner, point);
    if (largeEnough(resized)) {
      onResize(resized);
      // Rendering replaces handles; restore keyboard focus on the equivalent one.
      stage.querySelector(`.zone-handle[data-corner="${corner}"]`)?.focus({ preventScroll: true });
      onHint('Размер зоны изменён. Сохраните карточку дефекта.');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && (pointer || firstCorner)) { stop(event); cancel(); onHint('Построение зоны отменено. Укажите первый угол новой зоны.'); }
  });
  return { cancel };
}
