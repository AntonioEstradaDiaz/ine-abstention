import type { NextRequest } from "next/server";
// Destinations are always fixed application paths, never user-supplied URLs.
export function appUrl(request: NextRequest, path: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const base = configured
    ? new URL(configured)
    : new URL(request.nextUrl.origin);
  if (!configured) {
    const host = request.headers.get("host");
    if (host && /^[a-zA-Z0-9.\-]+(:[0-9]+)?$/.test(host)) base.host = host;
  }
  return new URL(path, base.origin);
}
