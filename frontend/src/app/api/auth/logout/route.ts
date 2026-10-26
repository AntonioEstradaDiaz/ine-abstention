import { appUrl } from "@/lib/supabase/redirect";
import { NextRequest, NextResponse } from "next/server";
import { authServer } from "@/lib/supabase/server";
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== appUrl(request, "/").origin)
    return NextResponse.json(
      { detail: "Origen no permitido." },
      { status: 403 },
    );
  const supabase = await authServer();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error)
      return NextResponse.json(
        { detail: "No se pudo cerrar la sesión." },
        { status: 503 },
      );
  }
  return NextResponse.redirect(appUrl(request, "/login"), 303);
}
