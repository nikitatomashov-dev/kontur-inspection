const clamp = value => Math.max(0, Math.min(1, value));

/** Rectangle corners in drawing-relative coordinates. Null means zero/invalid size. */
export function normalizeZone(start, end) {
  if (!start || !end || ![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null;
  const x1 = clamp(start.x), y1 = clamp(start.y), x2 = clamp(end.x), y2 = clamp(end.y);
  const width = Math.abs(x2 - x1), height = Math.abs(y2 - y1);
  if (width <= 1e-9 || height <= 1e-9) return null;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width, height };
}

/** Keep the opposite corner fixed. Passing the original zone permits corner crossing. */
export function resizeZone(zone, corner, point) {
  if (!zone || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(zone[key])) || zone.width <= 0 || zone.height <= 0) return null;
  const opposite = {
    nw: { x: zone.x + zone.width, y: zone.y + zone.height },
    ne: { x: zone.x, y: zone.y + zone.height },
    sw: { x: zone.x + zone.width, y: zone.y },
    se: { x: zone.x, y: zone.y },
  }[corner];
  return opposite ? normalizeZone(opposite, point) : null;
}
