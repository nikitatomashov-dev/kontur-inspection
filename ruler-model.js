// All geometry is relative to the original drawing, never to the viewport.
const point = p => p && [p.x, p.y].every(v => Number.isFinite(v) && v >= 0 && v <= 1);
export function pixelDistance(drawing, a, b) {
  if (!point(a) || !point(b)) return NaN;
  return Math.hypot((b.x-a.x)*drawing.width, (b.y-a.y)*drawing.height);
}
export function segmentMetres(drawing, segment) {
  const calibration = drawing.ruler?.calibration;
  if (!calibration) return null;
  const reference = pixelDistance(drawing, calibration.a, calibration.b);
  if (!(reference >= 1) || !(calibration.metres > 0)) return null;
  return pixelDistance(drawing, segment.a, segment.b) / reference * calibration.metres;
}
export function formatLength(value) {
  return Number.isFinite(value) ? value.toLocaleString('ru-RU', {minimumFractionDigits: 3, maximumFractionDigits: 3}) + ' м' : 'Нет масштаба';
}
export function validateRuler(drawing) {
  const r = drawing.ruler;
  if (r === undefined) return [];
  const invalid = () => ['Некорректный масштаб или замеры чертежа.'];
  if (!r || !r.calibration || !Array.isArray(r.segments) || r.segments.length > 1000) return invalid();
  const c = r.calibration;
  if (!Number.isFinite(c.metres) || c.metres <= 0 || c.metres > 100000 || !(pixelDistance(drawing, c.a, c.b) >= 1)) return invalid();
  const ids = new Set();
  for (const s of r.segments) {
    if (!s || typeof s.id !== 'string' || !s.id.trim() || s.id.length > 100 || ids.has(s.id) || typeof s.label !== 'string' || !s.label.trim() || s.label.length > 200 || (s.removed !== undefined && typeof s.removed !== 'boolean') || !(pixelDistance(drawing, s.a, s.b) >= 1)) return invalid();
    ids.add(s.id);
  }
  return [];
}
export function rulerReport(project) {
  return ['ЗАМЕРЫ ПО ЧЕРТЕЖАМ', 'Расчёт по заданному масштабу; не заменяет измерений на объекте. При изменении масштаба все длины пересчитываются.', ...project.drawings.filter(d => d.ruler).map(d => `${d.name}${d.floor ? ' · '+d.floor : ''}\nОпорный отрезок: ${formatLength(d.ruler.calibration.metres)}\n${d.ruler.segments.filter(s=>!s.removed).map(s => `${s.label}: ${formatLength(segmentMetres(d,s))}`).join('\n') || 'Сохранённых замеров нет.'}`)].join('\n\n');
}
