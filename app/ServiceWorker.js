let CACHE = 'app-cache-v-6';
let FILES = [
  './',
  './assets/fonts/Qahiri-Regular.otf',
  './assets/images/app-icon.svg',
  './assets/images/clear.svg',
  './assets/images/open.svg',
  './assets/images/remove-dots.svg',
  './assets/images/small-dots.svg',
  './assets/images/save.svg',
  './HarfBuzz.js',
  './app.webmanifest',
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
  let request = e.request;
  if (request.url.startsWith("https://www.google"))
    return;
  e.respondWith(
    get(request, 400)
    .then(response => {
      return caches.open(CACHE).then(cache => {
        return cache.put(request, response.clone()).then(() => {
          return response;
        });
      });
    })
    .catch(() => {
      return caches.open(CACHE).then(cache => {
        return caches.match(request).then(match => {
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
