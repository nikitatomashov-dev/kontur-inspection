import { REGISTER_COLUMNS, groupDefects, getCategory, getDefectElementText, defectDescription } from './domain.js';

const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const encoder = new TextEncoder();
const tableWidth = 15398;
const referenceWidths = [704, 1490, 4596, 2475, 2093, 2238, 1816];
const widths = referenceWidths.map(value => Math.round(value / 15412 * tableWidth));
widths[widths.length - 1] += tableWidth - widths.reduce((sum, value) => sum + value, 0);

// XML 1.0 permits tabs/newlines and Unicode text, but not controls or lone surrogates.
const xml = value => [...String(value ?? '')].filter(char => {
  const point = char.codePointAt(0);
  return point === 9 || point === 10 || point === 13 || point >= 32 && point <= 0xD7FF || point >= 0xE000 && point <= 0xFFFD || point >= 0x10000 && point <= 0x10FFFF;
}).join('').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));

function paragraph(text, { bold = false, align = 'left', size = 20, keepNext = false, style = '' } = {}) {
  const parts = String(text ?? '').split(/\r\n|\r|\n/);
  const runs = parts.map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`).join('');
  return `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}<w:jc w:val="${align}"/><w:spacing w:before="0" w:after="60" w:line="240" w:lineRule="auto"/>${keepNext ? '<w:keepNext/>' : ''}</w:pPr>${runs}</w:p>`;
}

function cell(content, index, { span = 1, shade = '', align = 'top' } = {}) {
  const width = span === 7 ? tableWidth : widths[index];
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${shade ? `<w:shd w:val="clear" w:fill="${shade}"/>` : ''}<w:vAlign w:val="${align}"/></w:tcPr>${content || paragraph('')}</w:tc>`;
}

function row(cells, { header = false, keepTogether = true } = {}) {
  return `<w:tr><w:trPr>${header ? '<w:tblHeader/>' : ''}${keepTogether ? '<w:cantSplit/>' : ''}</w:trPr>${cells.join('')}</w:tr>`;
}

function decodeImage(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl ?? '');
  if (!match) throw new Error('Не удалось добавить фотографию в Word: ожидается JPG, PNG или WebP.');
  const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
  const signature = match[1] === 'png' ? [137, 80, 78, 71, 13, 10, 26, 10] : match[1] === 'jpeg' ? [255, 216, 255] : [82, 73, 70, 70];
  if (!signature.every((value, index) => bytes[index] === value) || match[1] === 'webp' && String.fromCharCode(...bytes.slice(8, 12)) !== 'WEBP') throw new Error('Формат фотографии не соответствует содержимому файла.');
  return { bytes, extension: match[1] === 'jpeg' ? 'jpg' : match[1], mime: `image/${match[1]}` };
}

async function wordImage(photo) {
  const image = decodeImage(photo.imageData);
  if (image.extension !== 'webp') return image;
  // Word support for WebP varies; embed a locally decoded PNG instead.
  if (typeof createImageBitmap !== 'function') throw new Error('Браузер не может преобразовать WebP для Word. Добавьте фотографию в JPG или PNG.');
  const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.mime }));
  try {
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(bitmap.width, bitmap.height) : document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось преобразовать фотографию для Word.');
    context.drawImage(bitmap, 0, 0);
    const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Не удалось преобразовать фотографию для Word.');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), extension: 'png', mime: 'image/png' };
  } finally { bitmap.close(); }
}

function imageParagraph(photo, relationship, index) {
  if (!Number.isFinite(photo.width) || !Number.isFinite(photo.height) || photo.width <= 0 || photo.height <= 0) throw new Error('Некорректные размеры фотографии.');
  // 1 twip = 635 EMU. Leave the cell margins, and bound tall photographs to 55 mm.
  const maxWidth = (widths[2] - 180) * 635, maxHeight = 55 * 36000;
  const factor = Math.min(maxWidth / photo.width, maxHeight / photo.height, 9525);
  const cx = Math.round(photo.width * factor), cy = Math.round(photo.height * factor);
  const label = xml(photo.caption || photo.name || `Фото ${index}`);
  return `<w:p><w:pPr><w:jc w:val="center"/><w:keepNext/><w:spacing w:before="40" w:after="40"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${index}" name="Фото ${index}" descr="${label}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Фото ${index}" descr="${label}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationship}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? 0xEDB88320 ^ value >>> 1 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Store-only ZIP uses standard Office Open Packaging Conventions without a CDN/library.
function zip(files) {
  if (files.length > 65535) throw new Error('Слишком много фотографий для одного документа Word. Разделите ведомость фильтрами.');
  const content = [], directory = [];
  let offset = 0, directorySize = 0;
  for (const [path, source] of files) {
    const name = encoder.encode(path), bytes = typeof source === 'string' ? encoder.encode(source) : source;
    if (bytes.length > 0xFFFFFFFF || offset + bytes.length + 30 + name.length > 0xFFFFFFFF) throw new Error('Документ Word превышает допустимый размер.');
    const crc = crc32(bytes);
    const local = new Uint8Array(30), localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true); localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x800, true); localView.setUint16(12, 33, true);
    localView.setUint32(14, crc, true); localView.setUint32(18, bytes.length, true); localView.setUint32(22, bytes.length, true); localView.setUint16(26, name.length, true);
    const central = new Uint8Array(46), centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014B50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x800, true); centralView.setUint16(14, 33, true);
    centralView.setUint32(16, crc, true); centralView.setUint32(20, bytes.length, true); centralView.setUint32(24, bytes.length, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true);
    content.push(local, name, bytes); directory.push(central, name);
    offset += local.length + name.length + bytes.length; directorySize += central.length + name.length;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054B50, true); view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
  view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
  return new Blob([...content, ...directory, end], { type: MIME });
}

/** A real, editable Word table; one row per defect, all its placements and embedded photos. */
export async function buildDocx(project, defects = project.defects) {
  const snapshot = structuredClone({ project, defects });
  project = snapshot.project; defects = snapshot.defects;
  const media = [], imageRelationships = [], imageTypes = new Map();
  const rows = [
    row(REGISTER_COLUMNS.map((label, index) => cell(paragraph(label, { bold: true, align: 'center', keepNext: true }), index, { shade: 'EEF2F0', align: 'center' })), { header: true }),
    row(REGISTER_COLUMNS.map((_, index) => cell(paragraph(index + 1, { align: 'center', size: 18, keepNext: true }), index, { align: 'center' })), { header: true }),
  ];
  for (const group of groupDefects(defects)) {
    rows.push(row([cell(paragraph(group.label, { bold: true, align: 'center', keepNext: true }), 0, { span: 7, shade: 'F2F5F3' })]));
    for (const defect of group.defects) {
      let photographs = '';
      for (const [index, photo] of (defect.photos ?? []).entries()) {
        const image = await wordImage(photo), imageNumber = media.length + 1;
        const filename = `image${imageNumber}.${image.extension}`, relationship = `rIdImage${imageNumber}`;
        media.push([`word/media/${filename}`, image.bytes]); imageTypes.set(image.extension, image.mime);
        imageRelationships.push(`<Relationship Id="${relationship}" Type="${REL}/image" Target="media/${filename}"/>`);
        photographs += imageParagraph(photo, relationship, imageNumber) + paragraph(photo.caption || `Фото ${index + 1}`, { align: 'center', size: 18 });
      }
      const quantity = defect.quantity == null ? 'Не измерен' : `${String(defect.quantity).replace('.', ',')} ${defect.unit || ''}`.trim();
      rows.push(row([
        cell(paragraph(defect.number, { align: 'center' }), 0),
        cell(paragraph(getDefectElementText(project, defect)), 1),
        cell(photographs || paragraph('Нет фото', { align: 'center' }), 2),
        cell(paragraph(getCategory(defect.category).label, { align: 'center' }), 3),
        cell(paragraph([defectDescription(defect), defect.note].filter(Boolean).join('\n')), 4),
        cell(paragraph(defect.cause || 'Не указана'), 5),
        cell(paragraph(quantity, { align: 'center' }), 6),
      ], { keepTogether: (defect.photos?.length ?? 0) <= 2 && getDefectElementText(project, defect).length < 600 && [defect.title, defect.note, defect.cause].join('').length < 1500 }));
    }
  }
  if (!defects.length) rows.push(row([cell(paragraph('Дефекты не выбраны', { align: 'center' }), 0, { span: 7 })]));
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="808080"/>`).join('');
  const table = `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(width => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>`;
  const document = `${XML}<w:document xmlns:w="${NS}" xmlns:r="${REL}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraph('Ведомость дефектов и повреждений', { bold: true, size: 28, keepNext: true, style: 'Title' })}${paragraph(project.name, { size: 22, keepNext: true })}${table}<w:p/><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `${XML}<w:styles xmlns:w="${NS}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:color w:val="000000"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="000000"/><w:sz w:val="28"/></w:rPr></w:style></w:styles>`;
  const contentTypes = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...imageTypes].map(([extension, mime]) => `<Default Extension="${extension}" ContentType="${mime}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDocument" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', document], ['word/styles.xml', styles],
    ['word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${REL}/styles" Target="styles.xml"/>${imageRelationships.join('')}</Relationships>`],
    ...media,
  ]);
}
