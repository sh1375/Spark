const STATIC_CACHE = 'spark-static-v12';
const RUNTIME_CACHE = 'spark-runtime-v12';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo_spark.png',
  '/logo-ui.webp',
  '/icons/icon-512x512.png',
  '/fonts/IRANSans-Web.woff2',
  '/fonts/IRANSans-Web-Medium.woff2',
  '/fonts/Awesome-Web.woff2',
  '/fonts/Mobmenu.woff2',
];

function isBasicOkResponse(response) {
  if (!response || !response.ok || response.type !== 'basic' || response.redirected) return false;
  const cacheControl = response.headers.get('cache-control') || '';
  return !/(?:^|,)\s*(?:private|no-store)\b/i.test(cacheControl);
}

function isImageResponse(response) {
  if (!isBasicOkResponse(response)) return false;
  const contentType = response.headers.get('content-type') || '';
  return contentType.toLowerCase().startsWith('image/');
}

function isManifestResponse(response) {
  if (!isBasicOkResponse(response)) return false;
  const contentType = response.headers.get('content-type') || '';
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('application/manifest+json') ||
    normalized.includes('application/json') ||
    normalized.includes('text/json')
  );
}

function isFontResponse(response) {
  if (!isBasicOkResponse(response)) return false;
  const contentType = response.headers.get('content-type') || '';
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('font/') ||
    normalized.includes('application/font') ||
    normalized.includes('application/x-font') ||
    normalized.includes('application/octet-stream')
  );
}

function isBundledAssetResponse(response) {
  if (!isBasicOkResponse(response)) return false;
  const contentType = response.headers.get('content-type') || '';
  return !contentType.toLowerCase().includes('text/html');
}

function isValidStaticResponse(url, response) {
  const pathname = url.pathname;

  if (pathname.startsWith('/icons/')) return isImageResponse(response);

  if (
    pathname === '/logo_spark.png' ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.svg')
  ) {
    return isImageResponse(response);
  }

  if (pathname === '/manifest.json') return isManifestResponse(response);

  if (
    pathname.startsWith('/fonts/') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.ttf') ||
    pathname.endsWith('.otf')
  ) {
    return isFontResponse(response);
  }

  if (pathname.startsWith('/assets/')) return isBundledAssetResponse(response);

  return isBasicOkResponse(response);
}

async function precacheAsset(cache, assetUrl) {
  try {
    const request = new Request(assetUrl, {
      cache: 'reload',
      credentials: 'same-origin',
    });

    const response = await fetch(request);
    const url = new URL(assetUrl, self.location.origin);

    if (!isValidStaticResponse(url, response)) {
      console.warn('[SW] precache skipped - invalid response:', {
        url: assetUrl,
        status: response.status,
        type: response.type,
        contentType: response.headers.get('content-type'),
      });
      return;
    }

    await cache.put(assetUrl, response);
  } catch (err) {
    console.warn('[SW] precache failed:', assetUrl, err);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.all(STATIC_ASSETS.map((assetUrl) => precacheAsset(cache, assetUrl))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const validCaches = [STATIC_CACHE, RUNTIME_CACHE, 'spark-notification-events-v1'];

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('spark-') && !validCaches.includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.headers.has('Authorization') || url.search) return;
  // Only application shell routes and declared static asset namespaces are cacheable.
  // Authenticated data and API responses must never enter Cache Storage.

  const sensitiveSegments = [
    'login', 'mfa', 'recovery', 'reset', 'security', 'session', 'challenge', 'token',
  ];
  const pathParts = url.pathname.split('/');
  if (pathParts.some((seg) => sensitiveSegments.includes(seg.toLowerCase()))) return;

  if (url.pathname === '/e2ee-worker.js') return;

  // Keep navigation network-first so a newly deployed index.html never points
  // at chunks from an older deployment. Cache remains the offline fallback.
  if (request.mode === 'navigate') {
    if (url.pathname !== '/' && url.pathname !== '/index.html' &&
        url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return;
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((response) => {
          if (isBasicOkResponse(response) &&
              (response.headers.get('content-type') || '').toLowerCase().includes('text/html')) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(STATIC_CACHE).then((cache) => cache.put('/index.html', copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          return cachedIndex || Response.error();
        })
    );
    return;
  }

  const isIconAsset = url.pathname.startsWith('/icons/');
  const isViteAsset = url.pathname.startsWith('/assets/');
  const isFontAsset = url.pathname.startsWith('/fonts/');
  const isManifest = url.pathname === '/manifest.json';
  const isLogo = url.pathname === '/logo_spark.png' || url.pathname === '/logo-ui.webp';

  // Vite production assets contain a content hash in their filename. Once a
  // chunk is cached, asking the network whether that exact hash changed can
  // never produce newer content. Pure cache-first removes those repeat requests.
  if (isViteAsset) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;

        try {
          const response = await fetch(request);
          if (isBundledAssetResponse(response)) {
            const copy = response.clone();
            event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)));
          }
          return response;
        } catch {
          return Response.error();
        }
      })
    );
    return;
  }

  const isStaticAsset =
    isIconAsset || isFontAsset || isManifest || isLogo;

  // Mutable static filenames use stale-while-revalidate: paint cached content
  // immediately and refresh it in the background for the next visit.
  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchAndUpdate = fetch(request)
          .then((response) => {
            if (!isValidStaticResponse(url, response)) return response;
            const copy = response.clone();
            return caches.open(STATIC_CACHE).then((cache) => {
              void cache.put(request, copy);
              return response;
            });
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(fetchAndUpdate);
          return cached;
        }

        return fetchAndUpdate.then((response) => response || Response.error());
      })
    );
    return;
  }

  // Everything outside the explicit static allowlist is network-only.
});
