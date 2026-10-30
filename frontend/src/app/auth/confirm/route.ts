import { appUrl } from "@/lib/supabase/redirect";
import { NextRequest, NextResponse } from "next/server";
import { authServer } from "@/lib/supabase/server";
import { confirmRedirectPath, linkKind } from "@/lib/auth-flow";

// Opening an email link (GET) never verifies it: mail scanners such as Outlook Safe Links
// prefetch links and would spend the one-time token. The /confirmar page posts it back here.
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const kind = linkKind(type);
  if (!token_hash || !kind)
    return NextResponse.redirect(appUrl(request, confirmRedirectPath(kind, false)));
  const page = appUrl(request, "/confirmar");
  page.search = new URLSearchParams({ token_hash, type: type! }).toString();
  return NextResponse.redirect(page);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      // Same check as /api/backend: host and protocol must match.
      const parsed = new URL(origin);
      if (
        parsed.host !== request.headers.get("host") ||
        parsed.protocol !== request.nextUrl.protocol
      )
        return new NextResponse(null, { status: 403 });
    } catch {
      return new NextResponse(null, { status: 403 });
    }
  }
  const form = await request.formData().catch(() => null);
  const token_hash = form?.get("token_hash");
  const type = form?.get("type");
  const kind = linkKind(typeof type === "string" ? type : null);
  const supabase = await authServer();
  let verified = false;
  if (kind && typeof token_hash === "string" && token_hash && supabase) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type: kind === "recovery" ? "recovery" : "email",
    });
    verified = !error;
  }
  // 303: the browser must follow with GET, not repeat the POST.
  return NextResponse.redirect(appUrl(request, confirmRedirectPath(kind, verified)), 303);
}
