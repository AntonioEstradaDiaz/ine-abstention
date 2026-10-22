import { NextRequest, NextResponse } from "next/server";
import { previewResponse } from "@/lib/preview";

export const dynamic = "force-dynamic";
const readPaths = new Set([
  "ml/laboratory",
  "elections",
  "predictions",
  "statistics/territories",
  "statistics/summary",
  "participation/history",
  "data-sources",
  "models/metrics",
  "risk/summary",
  "risk/calibration",
  "health/ready",
]);
async function proxy(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const resource = path.join("/");
  if (
    !(req.method === "GET"
      ? readPaths.has(resource)
      : req.method === "POST" && resource === "simulations")
  ) {
    return NextResponse.json(
      { detail: "Recurso no disponible." },
      { status: 404 },
    );
  }
  let body: string | undefined;
  if (req.method === "POST") {
    if (!req.headers.get("content-type")?.startsWith("application/json"))
      return NextResponse.json(
        { detail: "Se requiere application/json." },
        { status: 415 },
      );
    const origin = req.headers.get("origin");
    if (origin) {
      try {
        const parsedOrigin = new URL(origin);
        if (
          parsedOrigin.host !== req.headers.get("host") ||
          parsedOrigin.protocol !== req.nextUrl.protocol
        )
          return NextResponse.json(
            { detail: "Origen no permitido." },
            { status: 403 },
          );
      } catch {
        return NextResponse.json(
          { detail: "Origen no permitido." },
          { status: 403 },
        );
      }
    }
    if (Number(req.headers.get("content-length")) > 16_384)
      return new NextResponse(null, { status: 413 });
    body = await req.text();
    if (Buffer.byteLength(body) > 16_384)
      return new NextResponse(null, { status: 413 });
    try {
      JSON.parse(body);
    } catch {
      return NextResponse.json({ detail: "JSON inválido." }, { status: 400 });
    }
  }
  if (process.env.PULSO_PREVIEW === "1") {
    return previewResponse(resource, req.nextUrl.searchParams, body);
  }
  try {
    const base = process.env.BACKEND_URL || "http://127.0.0.1:8001";
    const target = new URL(`/api/v1/${resource}`, base);
    target.search = req.nextUrl.search;
    const response = await fetch(target, {
      method: req.method,
      body,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        detail:
          "Backend sin conexión. Comprueba que la API esté disponible y vuelve a intentar.",
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
