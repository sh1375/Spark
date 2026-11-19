// PWA install/update bootstrap kept as an external same-origin script so CSP
// can enforce script-src 'self' without unsafe-inline.
window.deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.deferredInstallPrompt = event;
  window.dispatchEvent(new Event('pwa-installable'));
});
window.addEventListener('appinstalled', () => {
  window.deferredInstallPrompt = null;
  window.dispatchEvent(new Event('pwa-installed'));
});

if (
  'serviceWorker' in navigator &&
  !window.location.hostname.includes('stackblitz') &&
  !window.location.hostname.includes('webcontainer') &&
  !window.location.hostname.includes('localhost') &&
  !window.location.hostname.includes('127.0.0.1') &&
  window.location.hostname !== ''
) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/pwa-sw.js', { scope: '/', updateViaCache: 'none' });
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new Event('sw-updated'));
          }
        });
      });
    } catch (error) {
      if (!window.location.hostname.includes('localhost')) {
        console.error('SW registration failed:', error);
      }
    }
  });
}
