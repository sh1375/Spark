import './lib/browserCryptoCompat';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { detectMobileNavigation } from './app/layout/hooks/useMobileNavigation';
import { LoadErrorBoundary } from './components/ui/LoadErrorBoundary';
import './index.css';
import './responsive.css';
import './meeting-mobile-fixes.css';
import './spark-loader.css';
import './corporate-theme.css';
// Load the shared auth foundation up front so the public login page has the
// same cascade before the first login and after a logout. AuthenticatedApp also
// references this stylesheet, but Vite de-duplicates the module; the important
// part is that its position in the entry cascade is stable.
import './auth-modern.css';
// Public login styles are critical above-the-fold assets. Keep them in the
// entry CSS so the browser can discover them immediately while PublicAuthRoot
// itself remains lazy-loaded.
import './auth-login-v2.css';
import './auth-login-motion.css';
import './auth-placeholder-theme.css';

// Apply the persisted/system theme before React mounts so the branded loading
// screen never flashes in the wrong color scheme while ThemeProvider is lazy-loaded.
try {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
  document.documentElement.classList.toggle('dark', shouldUseDark);
} catch {
  // Storage can be unavailable in hardened/private browser contexts. In that
  // case the application safely falls back to the light loader until mounted.
}

const syncNavigationTypography = () => {
  document.documentElement.dataset.sparkNavigation = detectMobileNavigation() ? 'mobile' : 'web';
};
syncNavigationTypography();
window.addEventListener('resize', syncNavigationTypography);
window.addEventListener('orientationchange', syncNavigationTypography);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoadErrorBoundary><App /></LoadErrorBoundary>
  </StrictMode>
);
