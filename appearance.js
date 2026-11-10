/** Visual identity belongs to the defect number, not to a particular placement or category. */
const COLORS = Object.freeze([
  '#1769aa', '#b64038', '#188269', '#8b4ba3', '#b56b16', '#157c91',
  '#a23672', '#4c7e22', '#6055b5', '#9c5331', '#28756b', '#5a677d',
]);
const PATTERNS = Object.freeze([
  { id: 'diagonal', label: 'Диагональная /' },
  { id: 'diagonal-reverse', label: 'Диагональная \\' },
  { id: 'cross', label: 'Перекрёстная' },
  { id: 'horizontal', label: 'Горизонтальная' },
  { id: 'vertical', label: 'Вертикальная' },
  { id: 'dots', label: 'Точки' },
].map(Object.freeze));

/** There are 72 combinations. The number remains the definitive identifier thereafter. */
export function getDefectAppearance(number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new RangeError('Номер дефекта должен быть положительным целым числом.');
  const index = (number - 1) % (COLORS.length * PATTERNS.length);
  // Shift the palette once per block so the six hatches do not repeat the same 12 pairs.
  const color = COLORS[(index + Math.floor(index / COLORS.length)) % COLORS.length];
  const pattern = PATTERNS[index % PATTERNS.length];
  return { color, pattern: pattern.id, label: pattern.label };
}

function patternImage(color, pattern) {
  const ink = `${color}70`;
  const diagonal = angle => `repeating-linear-gradient(${angle}deg,transparent 0 7px,${ink} 7px 8.5px)`;
  if (pattern === 'diagonal') return diagonal(135);
  if (pattern === 'diagonal-reverse') return diagonal(45);
  if (pattern === 'cross') return `${diagonal(135)},${diagonal(45)}`;
  if (pattern === 'horizontal') return `repeating-linear-gradient(0deg,transparent 0 10.5px,${ink} 10.5px 12px)`;
  if (pattern === 'vertical') return `repeating-linear-gradient(90deg,transparent 0 10.5px,${ink} 10.5px 12px)`;
  return `radial-gradient(circle,${ink} 1.5px,transparent 1.8px)`;
}

/** Safe inline custom properties; all values derive from the validated integer/catalog. */
export function getAppearanceStyle(number) {
  const { color, pattern } = getDefectAppearance(number);
  return `--defect-color:${color};--defect-pattern:${patternImage(color, pattern)};--defect-pattern-size:${pattern === 'dots' ? '12px 12px' : 'auto'};`;
}

function validBox(box) {
  return box && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(box[key])) && box.width > 0 && box.height > 0;
}

/** Draw inside an already-clipped shape. Coordinates and spacing are in output pixels. */
function hatch(ctx, box, appearance) {
  const { x, y, width, height } = box;
  const { color, pattern } = appearance;
  ctx.strokeStyle = `${color}70`;
  ctx.fillStyle = `${color}70`;
  ctx.lineWidth = 1.5;
  const step = 12;
  if (pattern === 'dots') {
    for (let px = 6; px < width; px += step) {
      for (let py = 6; py < height; py += step) {
        ctx.beginPath(); ctx.arc(x + px, y + py, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    return;
  }
  ctx.beginPath();
  if (pattern === 'diagonal' || pattern === 'cross') {
    for (let offset = 0; offset < width + height; offset += step) {
      ctx.moveTo(x + offset, y); ctx.lineTo(x + offset - height, y + height);
    }
  }
  if (pattern === 'diagonal-reverse' || pattern === 'cross') {
    for (let offset = -height; offset < width; offset += step) {
      ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + height, y + height);
    }
  }
  if (pattern === 'horizontal') {
    for (let py = 0.75; py < height; py += step) { ctx.moveTo(x, y + py); ctx.lineTo(x + width, y + py); }
  }
  if (pattern === 'vertical') {
    for (let px = 0.75; px < width; px += step) { ctx.moveTo(x + px, y); ctx.lineTo(x + px, y + height); }
  }
  ctx.stroke();
}

/** Paint a zone rectangle in pixels. Its number is drawn separately by drawDefectMarker. */
export function drawDefectZone(ctx, zonePixels, number) {
  const appearance = getDefectAppearance(number);
  if (!validBox(zonePixels)) throw new RangeError('Некорректные размеры зоны для экспорта.');
  const { x, y, width, height } = zonePixels;
  ctx.save();
  try {
    ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
    ctx.fillStyle = `${appearance.color}16`; ctx.fillRect(x, y, width, height);
    hatch(ctx, zonePixels, appearance);
  } finally { ctx.restore(); }
  ctx.save();
  try {
    ctx.strokeStyle = appearance.color; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  } finally { ctx.restore(); }
}

/** White center keeps the number legible over every hatch, including in grayscale output. */
export function drawDefectMarker(ctx, x, y, radius, number) {
  const appearance = getDefectAppearance(number);
  if (![x, y, radius].every(Number.isFinite) || radius <= 0) throw new RangeError('Некорректные размеры отметки для экспорта.');
  ctx.save();
  try {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    hatch(ctx, { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 }, appearance);
  } finally { ctx.restore(); }
  ctx.save();
  try {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = appearance.color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, radius * .64, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.fillStyle = appearance.color;
    ctx.font = `bold ${Math.max(7, radius * .95)}px Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y + .5, radius * 1.55);
  } finally { ctx.restore(); }
}
