const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_SIDE = 2600;
const MAX_PIXELS = 8_000_000;
let libraryPromise;

async function loadLibrary() {
  libraryPromise ??= import('./vendor/pdfjs/pdf.min.mjs').then((library) => {
    library.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return library;
  }).catch((error) => {
    libraryPromise = undefined;
    throw new Error('Не удалось загрузить модуль PDF. Проверьте установку локальной библиотеки PDF.js и перезапустите приложение.', { cause: error });
  });
  return libraryPromise;
}

function readableError(error) {
  if (error?.name === 'PasswordException') {
    return new Error('PDF защищён паролем. Сохраните копию без пароля и загрузите её.', { cause: error });
  }
  if (error?.name === 'InvalidPDFException') {
    return new Error('Не удалось прочитать PDF: файл повреждён или имеет неподдерживаемый формат.', { cause: error });
  }
  if (error?.name === 'MissingPDFException') {
    return new Error('Файл PDF недоступен. Выберите его повторно.', { cause: error });
  }
  return error instanceof Error ? error : new Error('Не удалось открыть PDF.');
}

/** Opens a local file; no document content is sent to a server. Call destroy after import. */
export async function inspectPdf(file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Выберите файл PDF.');
  if (file.size > MAX_FILE_BYTES) throw new Error('PDF слишком большой. Максимальный размер — 50 МБ.');
  if (!file.size) throw new Error('Файл PDF пуст.');
  const pdfjs = await loadLibrary();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const assetBase = new URL('./vendor/pdfjs/', import.meta.url).href;
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    enableXfa: false,
    cMapUrl: `${assetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetBase}standard_fonts/`,
    wasmUrl: `${assetBase}wasm/`,
    useWorkerFetch: true,
    canvasMaxAreaInBytes: MAX_PIXELS * 4,
  });
  let pdf;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => {});
    throw readableError(error);
  }
  let destroyed = false;
  let rendering = false;
  return {
    pageCount: pdf.numPages,
    async renderPage(pageNumber) {
      if (destroyed) throw new Error('PDF уже закрыт. Загрузите файл повторно.');
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new Error(`Укажите номер страницы от 1 до ${pdf.numPages}.`);
      }
      if (rendering) throw new Error('Дождитесь загрузки текущей страницы.');
      rendering = true;
      let page;
      let canvas;
      try {
        page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(MAX_SIDE / Math.max(base.width, base.height), Math.sqrt(MAX_PIXELS / (base.width * base.height)), 3);
        const viewport = page.getViewport({ scale });
        canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Браузер не поддерживает преобразование PDF в изображение.');
        await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
        return { imageData: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
      } catch (error) {
        throw readableError(error);
      } finally {
        page?.cleanup();
        if (canvas) { canvas.width = 0; canvas.height = 0; }
        rendering = false;
      }
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      await loadingTask.destroy();
    },
  };
}
