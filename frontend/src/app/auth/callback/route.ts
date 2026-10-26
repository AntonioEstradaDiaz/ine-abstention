import { appUrl } from "@/lib/supabase/redirect";
import { NextRequest, NextResponse } from "next/server";
import { authServer } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next =
    request.nextUrl.searchParams.get("next") === "/reset-password"
      ? "/reset-password"
      : "/";
  const supabase = await authServer();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(appUrl(request, next));
  }
  return NextResponse.redirect(appUrl(request, "/login?error=confirmation"));
}
