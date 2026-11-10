import { validateSketches } from './measure-model.js';
import { validateStrengthPoints } from './strength-model.js';
import { ENGINEERING_SYSTEMS, APPENDIX_TEMPLATES, NETWORK_TEMPLATES } from './reference-catalog.js';
/**
 * Starting reference catalog for field notes. These suggestions are editable;
 * they do not diagnose causes or assign technical-condition categories.
 */
export const CATEGORIES = Object.freeze([
  { id: 'not_assessed', label: 'Не определена', color: '#718096' },
  { id: 'normal', label: 'Нормативное', color: '#369c73' },
  { id: 'serviceable', label: 'Работоспособное', color: '#2b84c7' },
  { id: 'limited', label: 'Ограниченно работоспособное', color: '#df9a29' },
  { id: 'emergency', label: 'Аварийное', color: '#db5353' },
]);

export const MATERIALS = Object.freeze([
  { id: 'reinforced_concrete', label: 'Железобетон' },
  { id: 'concrete', label: 'Бетон' },
  { id: 'masonry', label: 'Кирпичная / каменная кладка' },
  { id: 'steel', label: 'Сталь' },
  { id: 'timber', label: 'Древесина' },
  { id: 'roofing', label: 'Кровельное покрытие' },
  { id: 'cast_iron', label: 'Чугун' },
  { id: 'polymer', label: 'Полимер / металлополимер' },
  { id: 'copper', label: 'Медь' },
  { id: 'aluminium', label: 'Алюминий' },
  { id: 'optical_fibre', label: 'Оптоволокно' },
  { id: 'other', label: 'Другой / не установлен' },
]);

export const STRUCTURE_GROUPS = Object.freeze([
  { id: 'foundation', label: 'Фундаментные конструкции' },
  { id: 'vertical', label: 'Вертикальные конструкции' },
  { id: 'horizontal', label: 'Горизонтальные конструкции' },
  { id: 'stairs', label: 'Лестницы' },
  ...ENGINEERING_SYSTEMS.map(({ id, label }) => ({ id, label: `Инженерные системы · ${label}` })),
].map(Object.freeze));

export const REGISTER_COLUMNS = Object.freeze([
  '№', 'Элемент / участок', 'Фотоснимок (эскиз) дефекта, повреждения',
  'Категория', 'Описание дефекта, повреждения',
  'Причины возникновения дефекта/повреждения', 'Объем на все здание',
]);

const STRUCTURES = [
  { id: 'wall', label: 'Стена', group: 'vertical', materials: ['masonry', 'reinforced_concrete', 'concrete', 'timber'] },
  { id: 'column', label: 'Колонна / стойка', group: 'vertical', materials: ['reinforced_concrete', 'concrete', 'steel', 'timber', 'masonry'] },
  { id: 'beam', label: 'Балка / ригель', group: 'horizontal', materials: ['reinforced_concrete', 'steel', 'timber'] },
  { id: 'slab', label: 'Плита / перекрытие', group: 'horizontal', materials: ['reinforced_concrete', 'timber', 'steel'] },
  { id: 'foundation', label: 'Фундамент', group: 'foundation', materials: ['reinforced_concrete', 'concrete', 'masonry'] },
  { id: 'roof', label: 'Покрытие / кровля', group: 'horizontal', materials: ['roofing', 'reinforced_concrete', 'steel', 'timber'] },
  { id: 'stairs', label: 'Лестница', group: 'stairs', materials: ['reinforced_concrete', 'concrete', 'steel', 'timber'] },
  ...ENGINEERING_SYSTEMS,
];

const TEMPLATES = [
  { id: 'concrete_crack', title: 'Трещина в бетоне', materials: ['reinforced_concrete', 'concrete'], unit: 'м', causes: ['Температурно-усадочные деформации', 'Неравномерные деформации основания', 'Силовое воздействие — требует проверки'] },
  { id: 'concrete_spall', title: 'Скол / разрушение бетона', materials: ['reinforced_concrete', 'concrete'], unit: 'м²', causes: ['Механическое воздействие', 'Замораживание и оттаивание увлажнённого бетона', 'Воздействие агрессивной среды'] },
  { id: 'rebar_exposure', title: 'Оголение арматуры', materials: ['reinforced_concrete'], unit: 'м²', causes: ['Недостаточный защитный слой', 'Разрушение защитного слоя', 'Механическое повреждение'] },
  { id: 'rebar_corrosion', title: 'Следы коррозии арматуры', materials: ['reinforced_concrete'], unit: 'м²', causes: ['Длительное увлажнение', 'Недостаточная защитная способность бетона', 'Воздействие агрессивной среды'] },
  { id: 'masonry_crack', title: 'Трещина в кладке', materials: ['masonry'], unit: 'м', causes: ['Неравномерные деформации основания', 'Температурные деформации', 'Силовое воздействие — требует проверки'] },
  { id: 'masonry_erosion', title: 'Разрушение кирпича / камня и швов', materials: ['masonry'], unit: 'м²', causes: ['Замораживание и оттаивание увлажнённой кладки', 'Выветривание раствора', 'Воздействие агрессивной среды'] },
  { id: 'masonry_salts', title: 'Высолы на поверхности кладки', materials: ['masonry'], unit: 'м²', causes: ['Перенос растворимых солей влагой', 'Нарушение гидроизоляции', 'Увлажнение атмосферными осадками'] },
  { id: 'steel_corrosion', title: 'Коррозия стального элемента', materials: ['steel'], unit: 'м²', causes: ['Повреждение защитного покрытия', 'Длительное увлажнение', 'Воздействие агрессивной среды'] },
  { id: 'steel_deformation', title: 'Местная деформация элемента', materials: ['steel'], unit: 'шт.', causes: ['Механическое воздействие', 'Силовое воздействие — требует проверки', 'Дефект изготовления или монтажа'] },
  { id: 'steel_joint', title: 'Повреждение соединения', materials: ['steel'], unit: 'шт.', causes: ['Коррозия деталей соединения', 'Дефект монтажа', 'Повторные нагрузки — требует проверки'] },
  { id: 'timber_crack', title: 'Трещина в деревянном элементе', materials: ['timber'], unit: 'м', causes: ['Усушка древесины', 'Силовое воздействие — требует проверки', 'Неравномерное увлажнение'] },
  { id: 'timber_decay', title: 'Признаки биологического поражения древесины', materials: ['timber'], unit: 'м²', causes: ['Длительное увлажнение', 'Недостаточная вентиляция', 'Повреждение биологическими агентами — требует уточнения'] },
  { id: 'roof_leak', title: 'Протечка / следы протечки', materials: ['roofing'], unit: 'м²', causes: ['Нарушение герметичности покрытия', 'Повреждение примыканий', 'Нарушение работы водоотвода'] },
  { id: 'roof_damage', title: 'Повреждение кровельного покрытия', materials: ['roofing'], unit: 'м²', causes: ['Механическое воздействие', 'Старение материала', 'Дефект устройства покрытия'] },
  { id: 'moisture', title: 'Увлажнение / следы замачивания', materials: ['reinforced_concrete', 'concrete', 'masonry', 'timber'], unit: 'м²', causes: ['Протечка инженерных коммуникаций', 'Нарушение гидроизоляции', 'Конденсация влаги — требует проверки'] },
  { id: 'deflection', title: 'Видимый прогиб / деформация', structures: ['beam', 'slab', 'roof', 'stairs'], materials: ['reinforced_concrete', 'steel', 'timber'], unit: 'шт.', causes: ['Силовое воздействие — требует проверки', 'Снижение жёсткости элемента — требует проверки', 'Длительные деформации материала'] },
];

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_PHOTOS_PER_DEFECT = 12;
export const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 2048;
export const MAX_PLACEMENTS_PER_DEFECT = 1000;

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function listStructures({ engineering = true } = {}) {
  return STRUCTURES.filter(item => engineering || !item.engineering).map(({ id, label }) => ({ id, label }));
}

export function getStructureGroup(structure) {
  const groupId = STRUCTURES.find(item => item.id === structure)?.group;
  const group = STRUCTURE_GROUPS.find(item => item.id === groupId);
  if (!group) throw new RangeError(`Неизвестный тип конструкции: ${structure}`);
  return { ...group };
}

/** Group for display only: keep marker numbers, record contents and input order intact. */
export function groupDefects(defects) {
  const groups = STRUCTURE_GROUPS.map(group => ({ ...group, defects: [] }));
  const byId = new Map(groups.map(group => [group.id, group]));
  for (const defect of defects) byId.get(getStructureGroup(defect.structure).id).defects.push(defect);
  return groups.filter(group => group.defects.length).map(group => ({ ...group, defects: group.defects.sort((a, b) => a.number - b.number) }));
}

export function getMaterials(structure) {
  const accepted = STRUCTURES.find(item => item.id === structure)?.materials ?? [];
  return [...new Set([...accepted, ...(STRUCTURES.some(item=>item.id===structure)?['other']:[])])].map(id => ({ ...MATERIALS.find(item => item.id === id) }));
}

export function defectDescription(defect) {
  return [defect.workflow === 'draft' ? 'Черновик — требуется заполнение' : '', defect.title].filter(Boolean).join('. ');
}

export function createFieldDefect(project, drawingId, structure, point, zone = null) {
  if(!project.drawings.some(d=>d.id===drawingId) || !STRUCTURES.some(s=>s.id===structure)) throw new Error('Выберите чертёж и тип конструкции.');
  const now=new Date().toISOString();
  return {id:uid(),number:nextDefectNumber(project),workflow:'draft',structure,material:'other',templateId:'',title:'',category:'not_assessed',cause:'',quantity:null,unit:'м²',note:'',photos:[],createdAt:now,updatedAt:now,placements:[{id:uid(),drawingId,x:point.x,y:point.y,zone,location:''}]};
}

export function getDefectTemplates(structure, material) {
  if (!getMaterials(structure).some(item => item.id === material)) return [];
  const engineering = ENGINEERING_SYSTEMS.some(item => item.id === structure);
  return [...APPENDIX_TEMPLATES, ...NETWORK_TEMPLATES, ...TEMPLATES]
    .filter(item => item.materials.includes(material) && (item.structures ? item.structures.includes(structure) : !engineering))
    .map(({ id, title, causes, unit, reference }) => ({ id, title, causes: [...causes], unit, ...(reference ? { reference: { ...reference } } : {}) }));
}

export function getCategory(id) {
  return { ...(CATEGORIES.find(item => item.id === id) ?? CATEGORIES[0]) };
}

export function createProject(name = 'Новый объект') {
  const now = new Date().toISOString();
  return { schemaVersion: 3, id: uid(), name, createdAt: now, updatedAt: now, drawings: [], defects: [] };
}

/** Read placements in current records and older backups without changing either. */
export function getPlacements(defect) {
  if (Array.isArray(defect?.placements)) return defect.placements;
  if (!defect || typeof defect.drawingId !== 'string') return [];
  return [{ id: `placement-${defect.id}`, drawingId: defect.drawingId, x: defect.x, y: defect.y, zone: defect.zone ?? null, location: defect.location ?? '' }];
}

/** Preserve shared records and map coordinates while upgrading old single-mark backups. */
export function upgradeProject(project) {
  const result = validateProject(project);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  const upgraded = structuredClone(project);
  upgraded.defects = upgraded.defects.map(defect => {
    const { drawingId, x, y, zone, location, ...shared } = defect;
    const placements = project.schemaVersion === 3 ? defect.placements : getPlacements({ id: defect.id, drawingId, x, y, zone, location });
    return { ...shared, photos: defect.photos ?? [], placements };
  });
  upgraded.schemaVersion = 3;
  return upgraded;
}

export function nextDefectNumber(project) {
  return project.defects.reduce((max, defect) => Math.max(max, defect.number), 0) + 1;
}

const structureLabel = id => STRUCTURES.find(item => item.id === id)?.label ?? id;
const materialLabel = id => MATERIALS.find(item => item.id === id)?.label ?? id;

/** One register cell lists every distinct drawing/location; quantity stays shared. */
export function getDefectElementText(project, defect) {
  const drawings = new Map(project.drawings.map(drawing => [drawing.id, drawing]));
  const locations = getPlacements(defect).map(placement => [drawings.get(placement.drawingId)?.name, placement.location].filter(Boolean).join(' — '));
  return [structureLabel(defect.structure), ...new Set(locations.filter(Boolean)), materialLabel(defect.material)].filter(Boolean).join('\n');
}

/** All cells are quoted; neutralize spreadsheet formulas, including leading whitespace. */
export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\u0000-\u001f\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildCsv(project) {
  const rows = [REGISTER_COLUMNS];
  for (const group of groupDefects(project.defects)) {
    rows.push([group.label, ...Array(REGISTER_COLUMNS.length - 1).fill('')]);
    for (const defect of group.defects) {
      const element = getDefectElementText(project, defect);
      const photos = (defect.photos ?? []).map(photo => `${photo.name}${photo.caption ? ` — ${photo.caption}` : ''}`).join('\n');
      const description = [defectDescription(defect), defect.note].filter(Boolean).join('\n');
      const quantity = defect.quantity == null ? '' : [String(defect.quantity).replace('.', ','), defect.unit].filter(Boolean).join(' ');
      rows.push([defect.number, element, photos, getCategory(defect.category).label, description, defect.cause, quantity]);
    }
  }
  return `\uFEFF${rows.map(row => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

/** Validate imported records before replacing any local project. Never repairs silently. */
export function validateProject(project) {
  const errors = [];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const str = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
  const date = value => str(value, 40, true) && Number.isFinite(Date.parse(value));
  const issue = message => { if (errors.length < 40) errors.push(message); };
  if (!object(project)) return { valid: false, errors: ['Файл должен содержать объект проекта.'] };
  if (![1, 2, 3].includes(project.schemaVersion)) issue('Неподдерживаемая версия проекта. Поддерживаются schemaVersion: 1, 2 и 3.');
  if (!str(project.id, 100, true)) issue('Некорректный идентификатор проекта.');
  if (!str(project.name, 200, true)) issue('Название объекта должно содержать от 1 до 200 символов.');
  if (!date(project.createdAt) || !date(project.updatedAt)) issue('Некорректная дата создания или изменения проекта.');
  if (!Array.isArray(project.drawings) || project.drawings.length > 100) issue('Список чертежей отсутствует или содержит более 100 записей.');
  if (!Array.isArray(project.defects) || project.defects.length > 10000) issue('Список дефектов отсутствует или содержит более 10 000 записей.');
  if (!Array.isArray(project.drawings) || !Array.isArray(project.defects)) return { valid: false, errors };

  const drawingIds = new Set();
  let totalImageCharacters = 0;
  for (const [index, drawing] of project.drawings.entries()) {
    const prefix = `Чертёж ${index + 1}: `;
    if (!object(drawing)) { issue(`${prefix}некорректная запись.`); continue; }
    if (!str(drawing.id, 100, true) || drawingIds.has(drawing.id)) issue(`${prefix}некорректный или повторяющийся идентификатор.`);
    drawingIds.add(drawing.id);
    if (!str(drawing.name, 200, true)) issue(`${prefix}название должно содержать от 1 до 200 символов.`);
    if (drawing.floor !== undefined && !str(drawing.floor, 200)) issue(`${prefix}этаж должен быть текстом до 200 символов.`);
    if (!['plan', 'section', 'facade'].includes(drawing.type)) issue(`${prefix}неизвестный тип чертежа.`);
    if (!str(drawing.sourceName, 500)) issue(`${prefix}некорректное имя исходного файла.`);
    if (!Number.isInteger(drawing.width) || !Number.isInteger(drawing.height) || drawing.width < 1 || drawing.height < 1 || drawing.width > 20000 || drawing.height > 20000) issue(`${prefix}некорректные размеры изображения.`);
    if (typeof drawing.imageData !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(drawing.imageData)) issue(`${prefix}изображение должно быть PNG, JPEG или WebP в формате data URL.`);
    else totalImageCharacters += drawing.imageData.length;
  }
  const defectIds = new Set();
  const numbers = new Set();
  const photoIds = new Set();
  const placementIds = new Set();
  const validateGeometry = (placement, prefix, requireZone = false) => {
    if (!drawingIds.has(placement.drawingId)) issue(`${prefix}ссылка на отсутствующий чертёж.`);
    if (!Number.isFinite(placement.x) || !Number.isFinite(placement.y) || placement.x < 0 || placement.x > 1 || placement.y < 0 || placement.y > 1) issue(`${prefix}координаты должны быть числами от 0 до 1.`);
    if (requireZone && placement.zone === undefined) issue(`${prefix}для точечной отметки зона должна быть null.`);
    if (placement.zone !== undefined && placement.zone !== null) {
      const zone = placement.zone;
      if (!object(zone) || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(zone[key])) || zone.x < 0 || zone.y < 0 || zone.width <= 0 || zone.height <= 0 || zone.x + zone.width > 1 + 1e-9 || zone.y + zone.height > 1 + 1e-9) issue(`${prefix}зона должна иметь положительный размер и находиться внутри чертежа.`);
    }
    if (!str(placement.location, 500)) issue(`${prefix}расположение должно быть строкой до 500 символов.`);
  };
  for (const [index, defect] of project.defects.entries()) {
    const prefix = `Дефект ${index + 1}: `;
    if (!object(defect)) { issue(`${prefix}некорректная запись.`); continue; }
    if (!str(defect.id, 100, true) || defectIds.has(defect.id)) issue(`${prefix}некорректный или повторяющийся идентификатор.`);
    defectIds.add(defect.id);
    if (!Number.isSafeInteger(defect.number) || defect.number < 1 || defect.number > 99999999 || numbers.has(defect.number)) issue(`${prefix}номер должен быть уникальным положительным целым числом.`);
    numbers.add(defect.number);
    if (project.schemaVersion === 3) {
      if (!Array.isArray(defect.placements) || defect.placements.length < 1 || defect.placements.length > MAX_PLACEMENTS_PER_DEFECT) issue(`${prefix}должно быть от 1 до ${MAX_PLACEMENTS_PER_DEFECT} мест нанесения.`);
      if (Array.isArray(defect.placements)) for (const [placementIndex, placement] of defect.placements.entries()) {
        const placementPrefix = `${prefix}место ${placementIndex + 1}: `;
        if (!object(placement)) { issue(`${placementPrefix}некорректная запись.`); continue; }
        if (!str(placement.id, 200, true) || placementIds.has(placement.id)) issue(`${placementPrefix}некорректный или повторяющийся идентификатор места.`);
        placementIds.add(placement.id);
        validateGeometry(placement, placementPrefix, true);
      }
    } else {
      if (defect.placements !== undefined) issue(`${prefix}список мест нанесения поддерживается только в версии проекта 3.`);
      validateGeometry(defect, prefix);
    }
    if (defect.photos !== undefined) {
      if (!Array.isArray(defect.photos) || defect.photos.length > MAX_PHOTOS_PER_DEFECT) issue(`${prefix}допускается не более ${MAX_PHOTOS_PER_DEFECT} фотографий.`);
      if (Array.isArray(defect.photos)) {
        for (const [photoIndex, photo] of defect.photos.entries()) {
          const photoPrefix = `${prefix}фото ${photoIndex + 1}: `;
          if (!object(photo)) { issue(`${photoPrefix}некорректная запись.`); continue; }
          if (!str(photo.id, 100, true) || photoIds.has(photo.id)) issue(`${photoPrefix}некорректный или повторяющийся идентификатор.`);
          photoIds.add(photo.id);
          if (!str(photo.name, 500, true) || !str(photo.caption, 2000)) issue(`${photoPrefix}некорректное имя или подпись.`);
          if (!Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1 || photo.width > MAX_PHOTO_SIDE || photo.height > MAX_PHOTO_SIDE) issue(`${photoPrefix}размер должен быть от 1 до ${MAX_PHOTO_SIDE} пикселей.`);
          if (typeof photo.imageData !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.imageData)) issue(`${photoPrefix}изображение должно быть PNG, JPEG или WebP в формате data URL.`);
          else totalImageCharacters += photo.imageData.length;
        }
      }
    }
    if (!STRUCTURES.some(item => item.id === defect.structure)) issue(`${prefix}неизвестный тип конструкции.`);
    if (!getMaterials(defect.structure).some(item => item.id === defect.material)) issue(`${prefix}материал не соответствует типу конструкции.`);
    if (!str(defect.templateId, 100)) issue(`${prefix}некорректный идентификатор шаблона.`);
    if (defect.workflow !== undefined && !['draft','complete'].includes(defect.workflow)) issue(`${prefix}неизвестный статус заполнения.`);
    if (!str(defect.title, 500, defect.workflow !== 'draft')) issue(`${prefix}заполненная карточка должна иметь описание до 500 символов.`);
    if (!CATEGORIES.some(item => item.id === defect.category)) issue(`${prefix}неизвестная категория технического состояния.`);
    if (!str(defect.cause, 2000) || !str(defect.note, 10000)) issue(`${prefix}некорректный текст причины или примечания.`);
    if (defect.quantity !== null && (!Number.isFinite(defect.quantity) || defect.quantity < 0 || defect.quantity > 1e12)) issue(`${prefix}объём должен быть пустым или неотрицательным числом не более 10¹².`);
    if (!str(defect.unit, 30)) issue(`${prefix}единица измерения должна быть строкой до 30 символов.`);
    if (!date(defect.createdAt) || !date(defect.updatedAt)) issue(`${prefix}некорректная дата создания или изменения.`);
  }
  for(const message of validateStrengthPoints(project.strengthPoints, project.drawings, STRUCTURES.map(s=>s.id)))issue(message);
  if (totalImageCharacters > MAX_BACKUP_BYTES) issue('Чертежи и фотографии проекта превышают допустимый объём резервной копии (50 МБ).');
  for(const message of validateSketches(project.measureSketches))issue(message);
  return { valid: errors.length === 0, errors };
}
