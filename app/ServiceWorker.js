let CACHE = 'app-cache-v-5';
let FILES = [
  './',
  './assets/fonts/Qahiri-Regular.otf',
  './assets/images/app-icon.svg',
  './assets/images/clear.svg',
  './assets/images/export.svg',
  './assets/images/open.svg',
  './assets/images/remove-dots.svg',
  './assets/images/round-dots.svg',
  './assets/images/save.svg',
  './HarfBuzz.js',
  './Manifest.json',
  './OpenType.js',
  './TextView.js',
  './hb.js',
  './hb.wasm',
  './index.css',
  './index.js',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then((keys) => {
    return Promise.all(keys.map(k => { if (k !== CACHE) caches.delete(k) }));
  }));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    get(e.request, 400)
    .then(response => {
      return caches.open(CACHE).then(cache => {
        return cache.put(e.request, response.clone()).then(() => {
          return response;
        });
      });
    })
    .catch(() => {
      return caches.open(CACHE).then(cache => {
        return caches.match(e.request).then(match => {
          return match || Promise.reject('no-match');
        });
      });
    })
  );
});

function get(request, timeout) {
  return new Promise(function (fulfill, reject) {
    var timeoutId = setTimeout(reject, timeout);
    fetch(request).then(response => {
      clearTimeout(timeoutId);
      fulfill(response);
    }, reject);
  });
}
