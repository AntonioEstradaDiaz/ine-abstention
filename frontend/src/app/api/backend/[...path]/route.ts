import { NextRequest, NextResponse } from "next/server";
import { previewResponse } from "@/lib/preview";
import { authServer } from "@/lib/supabase/server";
import type { Simulation } from "@/lib/types";

export const dynamic = "force-dynamic";
const readPaths = new Set([
  "simulations",
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
  if (resource === "simulations") {
    return simulations(req, body);
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

async function simulations(req: NextRequest, body?: string) {
  const supabase = await authServer();
  const user = supabase && (await supabase.auth.getUser()).data.user;
  if (!supabase || !user)
    return NextResponse.json(
      { detail: "Inicia sesión para continuar." },
      { status: 401 },
    );
  const failure = () =>
    NextResponse.json(
      {
        detail:
          "No se pudo acceder al historial de escenarios. Vuelve a intentar.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  try {
    if (req.method === "GET") {
      const code = req.nextUrl.searchParams.get("state_code");
      if (code && !/^\d{2}$/.test(code))
        return NextResponse.json(
          { detail: "Entidad inválida." },
          { status: 422 },
        );
      let query = supabase
        .from("pulso_scenarios")
        .select("id,created_at,result,name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (code) query = query.eq("state_code", code);
      const { data, error } = await query;
      return error
        ? failure()
        : NextResponse.json(
            { items: data },
            {
              headers: { "Cache-Control": "no-store" },
            },
          );
    }
    // Only server-calculated results are saved; client-supplied result objects are ignored.
    const input = JSON.parse(body ?? "null");
    const calculated =
      process.env.PULSO_PREVIEW === "1"
        ? previewResponse("simulations", req.nextUrl.searchParams, body)
        : await fetch(
            new URL(
              "/api/v1/simulations",
              process.env.BACKEND_URL || "http://127.0.0.1:8001",
            ),
            {
              method: "POST",
              body,
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              signal: AbortSignal.timeout(30_000),
            },
          );
    if (!calculated.ok)
      return new NextResponse(await calculated.text(), {
        status: calculated.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    const value = (await calculated.json()) as Simulation;
    value.result.assumptions = { ...value.result.assumptions, persisted: true };
    const state = value.result.states[0];
    const { data, error } = await supabase
      .from("pulso_scenarios")
      .insert({
        user_id: user.id,
        state_code: state.state_code,
        name:
          typeof input?.name === "string"
            ? input.name.slice(0, 160) || "Escenario"
            : "Escenario",
        result: value.result,
      })
      .select("id,created_at,result")
      .single();
    return error
      ? failure()
      : NextResponse.json(data, {
          status: 201,
          headers: { "Cache-Control": "no-store" },
        });
  } catch {
    return failure();
  }
}
export { proxy as GET, proxy as POST };
