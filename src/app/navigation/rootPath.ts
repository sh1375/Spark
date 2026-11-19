function normalizePathname(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
}

export function isKnownSparkPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === '/'
    || path === '/admin'
    || path.startsWith('/admin/');
}
