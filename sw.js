const CACHE = 'kontur-app-v27';
const CORE = ['./home-sync.js','./field-model.js','./field-hub.js','./report-bundle.js','./measure-edit.js','./','./index.html','./styles.css','./app.js','./measure.js','./measure-paint.js','./measure-space.js','./measure-navigation.js','./measure-stroke.js','./measure-model.js','./measure-export.js','./quick-capture.js','./mobile-map.js','./touch-map.js','./domain.js','./reference-catalog.js','./strength.js','./strength-model.js','./calibration.js','./calibration-model.js','./appearance.js','./docx-export.js','./geometry.js','./zone-editor.js','./photos.js','./storage.js','./pdf-import.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('./vendor/pdf-assets.json');
    if(!response.ok) throw new Error('PDF assets are missing');
    const pdfAssets = await response.json();
    await cache.addAll([...CORE, './vendor/pdf-assets.json', ...pdfAssets]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kontur-app-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if(response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if(cached) return cached;
    if(event.request.mode === 'navigate') return caches.match('./index.html');
    return new Response('Ресурс ещё не сохранён для работы офлайн.', {status:503});
  }));
});




