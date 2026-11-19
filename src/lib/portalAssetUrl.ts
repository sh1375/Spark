const publicBucketPath = '/storage/v1/object/public/portal-assets/';

export function portalAssetUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith(publicBucketPath)) {
      return url.pathname;
    }
  } catch {
    // Relative paths already use the installation's own origin.
  }
  return value;
}
