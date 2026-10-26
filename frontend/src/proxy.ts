import { appUrl } from "@/lib/supabase/redirect";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authConfigured } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const privateRoute =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/api/backend") ||
    request.nextUrl.pathname.startsWith("/api/assistant");
  if (!authConfigured()) {
    if (!privateRoute) return response;
    return request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json(
          { detail: "Autenticación pendiente de configurar." },
          { status: 503 },
        )
      : NextResponse.redirect(appUrl(request, "/login"));
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          for (const { name, value } of items) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of items)
            response.cookies.set(name, value, {
              ...options,
              ...(request.cookies.get("pulso-remember")?.value === "0" && value
                ? { maxAge: undefined, expires: undefined }
                : {}),
            });
        },
      },
    },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user && privateRoute) {
    const denied = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json(
          { detail: "Inicia sesión para continuar." },
          { status: 401 },
        )
      : NextResponse.redirect(appUrl(request, "/login"));
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
    return denied;
  }
  return response;
}
export const config = {
  matcher: [
    "/",
    "/login",
    "/registro",
    "/recuperar",
    "/reset-password",
    "/api/backend/:path*",
    "/api/assistant/:path*",
  ],
};
