import { appUrl } from "@/lib/supabase/redirect";
import { NextRequest, NextResponse } from "next/server";
import { authServer } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const supabase = await authServer();
  if (
    token_hash &&
    supabase &&
    (type === "signup" || type === "recovery" || type === "email")
  ) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error)
      return NextResponse.redirect(
        appUrl(request, type === "recovery" ? "/reset-password" : "/"),
      );
  }
  return NextResponse.redirect(appUrl(request, "/login?error=confirmation"));
}
