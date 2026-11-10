// Touch navigation is separate from zone editing; two fingers always navigate.
export function attachTouchMap({ viewport, stage, getMode, getScale, setScale, cancelZone }) {
  const points = new Map();
  let pan = null, pinch = null, navigating = false, suppressUntil = 0;
  const stop = event => { event.preventDefault(); event.stopPropagation(); };
  const pair = () => {
    const [a, b] = [...points.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const capture = id => { try { viewport.setPointerCapture(id); } catch { /* Pointer already ended. */ } };
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size >= 2) {
      stop(event); cancelZone(); navigating = true; pan = null;
      if (points.size === 2) pinch = pair();
      for (const id of points.keys()) capture(id);
    } else {
      navigating = false; pinch = null;
      // Let the zone editor receive single-finger drawing and corner resizing.
      pan = getMode() === 'zone' || event.target.closest('.zone-handle') ? null : {
        id: event.pointerId, x: event.clientX, y: event.clientY,
        left: viewport.scrollLeft, top: viewport.scrollTop, moved: false
      };
    }
  }, { capture: true });
  viewport.addEventListener('pointermove', event => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size >= 2 && pinch) {
      stop(event);
      const next = pair(), before = stage.getBoundingClientRect();
      if (before.width && before.height && pinch.distance > 0) {
        const x = (pinch.x - before.left) / before.width, y = (pinch.y - before.top) / before.height;
        setScale(Math.max(.03, Math.min(6, getScale() * next.distance / pinch.distance)));
        const after = stage.getBoundingClientRect();
        viewport.scrollLeft += after.left + x * after.width - next.x;
        viewport.scrollTop += after.top + y * after.height - next.y;
      }
      pinch = next;
    } else if (navigating) stop(event);
    else if (pan?.id === event.pointerId) {
      const dx = event.clientX - pan.x, dy = event.clientY - pan.y;
      if (pan.moved || Math.hypot(dx, dy) > 8) {
        stop(event); pan.moved = true; capture(event.pointerId);
        viewport.scrollLeft = pan.left - dx; viewport.scrollTop = pan.top - dy;
      }
    }
  }, { capture: true, passive: false });
  const end = event => {
    if (!points.has(event.pointerId)) return;
    if (navigating || pan?.moved) { stop(event); suppressUntil = Date.now() + 500; }
    points.delete(event.pointerId);
    if (points.size < 2) pinch = null;
    else pinch = pair();
    if (!points.size) { pan = null; navigating = false; }
  };
  viewport.addEventListener('pointerup', end, { capture: true });
  viewport.addEventListener('pointercancel', end, { capture: true });
  viewport.addEventListener('click', event => { if (Date.now() < suppressUntil) stop(event); }, { capture: true });
}
