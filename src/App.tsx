import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { PublicAuthBootstrapPromise } from './components/AuthPage';
import SparkLoader from './components/ui/SparkLoader';
import { isKnownSparkPath } from './app/navigation/rootPath';

const PublicAuthRoot = lazy(() => import('./PublicAuthRoot'));
const AuthenticatedRoot = lazy(() => import('./AuthenticatedRoot'));
const NotFoundPage = lazy(() => import('./features/not-found/pages/NotFoundPage'));

type RootAuthState = 'checking' | 'public' | 'authenticated';

function StandardApplication() {
  const [authState, setAuthState] = useState<RootAuthState>('checking');
  const publicAuthBootstrapRef = useRef<PublicAuthBootstrapPromise | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | null = null;

    // Keep the Supabase SDK out of the initial application entry. The branded
    // loader can paint first on slower mobile CPUs while the auth client loads
    // in parallel, after which the existing session flow continues unchanged.
    void import('./lib/supabase')
      .then(({ supabase }) => {
        if (!active) return;

        const showPublicAuth = () => {
          if (!active) return;

          if (!publicAuthBootstrapRef.current) {
            // Start the public configuration requests before AuthPage mounts.
            // PublicAuthRoot is also prefetched in parallel so neither request
            // waits for the lazy component waterfall seen in mobile Lighthouse.
            publicAuthBootstrapRef.current = Promise.all([
              supabase.rpc('get_public_auth_config'),
              supabase.rpc('get_public_login_methods'),
            ]);
            void import('./PublicAuthRoot').catch(() => { /* The rendered lazy route reports load failures. */ });
          }

          setAuthState('public');
        };

        const showAuthenticated = () => {
          publicAuthBootstrapRef.current = null;
          if (active) setAuthState('authenticated');
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!active) return;
          if (session) showAuthenticated();
          else showPublicAuth();
        });
        unsubscribe = () => subscription.unsubscribe();

        return supabase.auth.getSession()
          .then(({ data: { session } }) => {
            if (!active) return;
            if (session) showAuthenticated();
            else showPublicAuth();
          });
      })
      .catch(() => {
        if (active) setAuthState('public');
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  if (authState === 'checking') {
    return <SparkLoader message="در حال بررسی نشست..." />;
  }

  if (authState === 'public') {
    return (
      <Suspense fallback={<SparkLoader message="در حال بارگذاری صفحه ورود..." />}>
        <PublicAuthRoot
          onSessionEstablished={() => setAuthState('authenticated')}
          initialAuthBootstrap={publicAuthBootstrapRef.current}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<SparkLoader message="در حال بارگذاری سامانه..." />}>
      <AuthenticatedRoot />
    </Suspense>
  );
}

function RootApp() {
  if (!isKnownSparkPath(window.location.pathname)) {
    return (
      <Suspense fallback={<SparkLoader message="در حال بارگذاری صفحه..." />}>
        <NotFoundPage />
      </Suspense>
    );
  }

  return <StandardApplication />;
}

export default RootApp;
