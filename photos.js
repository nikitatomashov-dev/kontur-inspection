import { uid } from './domain.js';

export const MAX_PHOTO_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 100_000_000;
const MAX_SIDE = 1600;
const DATA_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Reject unsupported content before decoding it. Names and MIME alone are insufficient. */
export async function validatePhotoFile(file) {
  if (!file || typeof file.slice !== 'function' || !Number.isFinite(file.size)) {
    throw new Error('Выберите файл фотографии.');
  }
  if (file.size === 0) throw new Error('Файл фотографии пуст.');
  if (file.size > MAX_PHOTO_FILE_BYTES) throw new Error('Фотография слишком большая. Максимальный размер файла — 20 МБ.');
  if (/\.(heic|heif)$/i.test(file.name ?? '') || /^image\/hei[cf]/i.test(file.type ?? '')) {
    throw new Error('Формат HEIC/HEIF пока не поддерживается. Сохраните фотографию как JPG или PNG и добавьте её повторно.');
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return 'image/webp';
  throw new Error('Не удалось распознать фотографию. Поддерживаются JPG, PNG и WebP; файл может быть повреждён.');
}

export function photoDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Не удалось определить размеры фотографии.');
  }
  if (width * height > MAX_PIXELS) throw new Error('Изображение слишком большое. Уменьшите его до 100 мегапикселей.');
  const ratio = Math.min(1, MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

/** Decode and re-encode entirely on the device. Browser decoding applies EXIF orientation. */
export async function preparePhoto(file) {
  const mediaType = await validatePhotoFile(file);
  const url = URL.createObjectURL(file.type === mediaType ? file : new Blob([file], { type: mediaType }));
  let canvas;
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    try { await image.decode(); }
    catch (error) { throw new Error(`Не удалось открыть фотографию «${file.name || 'без имени'}». Файл повреждён или не поддерживается браузером.`, { cause: error }); }
    const dimensions = photoDimensions(image.naturalWidth, image.naturalHeight);
    canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Браузер не поддерживает обработку фотографий.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.84);
    if (!imageData.startsWith('data:image/jpeg;base64,')) throw new Error('Не удалось сохранить фотографию. Повторите загрузку.');
    return { id: uid(), name: (file.name || 'Фото дефекта').slice(0, 200), imageData, ...dimensions, caption: '' };
  } finally {
    URL.revokeObjectURL(url);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** Run after schema validation and before replacing a project with an imported backup. */
export async function verifyPhotoImages(photos = []) {
  for (const photo of photos) {
    try {
      if (!DATA_IMAGE.test(photo?.imageData ?? '')) throw new Error('Недопустимый формат изображения.');
      const image = new Image();
      image.src = photo.imageData;
      await image.decode();
      if (image.naturalWidth !== photo.width || image.naturalHeight !== photo.height) throw new Error('Размеры изображения не совпадают.');
    } catch (error) {
      throw new Error(`Повреждена фотография «${photo?.name || 'без имени'}». Текущий объект не заменён.`, { cause: error });
    }
  }
}
