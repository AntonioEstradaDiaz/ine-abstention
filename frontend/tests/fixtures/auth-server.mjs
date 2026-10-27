// Test-only Auth protocol fixture. Never imported by the application or deployed.
import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const key = "sb_publishable_ci_fixture";
const secret = randomBytes(32);
const sessions = new Map();
// Test-only PostgREST stand-in. Production uses the real table and RLS policies.
const scenarios = [];
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "browser-test@example.invalid",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
};
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function session() {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: user.id,
    aud: user.aud,
    role: user.role,
    email: user.email,
    iat: now,
    exp: now + 3600,
    session_id: randomUUID(),
  };
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}`;
  const access = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  const result = {
    access_token: access,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: claims.exp,
    refresh_token: randomUUID(),
    user,
  };
  sessions.set(access, result);
  return result;
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store");
  const send = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(200, {});
  const url = new URL(req.url, "http://127.0.0.1:54321");
  if (url.pathname === "/health") return send(200, { fixture: "test-auth" });
  if (req.headers.apikey !== key)
    return send(401, { msg: "Invalid fixture key" });
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  const active = sessions.get(token);
  if (url.pathname === "/rest/v1/pulso_scenarios") {
    if (!active) return send(401, { message: "Invalid test session" });
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const item = JSON.parse(raw);
      if (item.user_id !== active.user.id)
        return send(403, { message: "Owner mismatch" });
      const record = {
        ...item,
        id: randomUUID(),
        created_at: new Date().toISOString(),
      };
      scenarios.unshift(record);
      return send(201, record);
    }
    if (req.method === "GET") {
      const code = url.searchParams.get("state_code")?.replace(/^eq\./, "");
      return send(
        200,
        scenarios
          .filter(
            (r) =>
              r.user_id === active.user.id && (!code || r.state_code === code),
          )
          .slice(0, 20),
      );
    }
  }
  if (url.pathname === "/auth/v1/user" && req.method === "GET") {
    return active && active.expires_at > Date.now() / 1000
      ? send(200, user)
      : send(401, { code: "bad_jwt", msg: "Invalid test session" });
  }
  if (url.pathname === "/auth/v1/logout" && req.method === "POST") {
    sessions.delete(token);
    return send(200, {});
  }
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(400, { msg: "Invalid JSON" });
    }
    if (
      url.searchParams.get("grant_type") === "password" &&
      body.email === user.email &&
      body.password === "Browser-test-only-123!"
    ) {
      return send(200, session());
    }
    if (url.searchParams.get("grant_type") === "refresh_token") {
      const previous = [...sessions.values()].find(
        (s) => s.refresh_token === body.refresh_token,
      );
      if (previous) {
        sessions.delete(previous.access_token);
        return send(200, session());
      }
    }
    return send(400, {
      code: "invalid_credentials",
      msg: "Invalid test credentials",
    });
  }
  return send(404, { msg: "Unsupported Auth fixture operation" });
});
server.listen(54321, "127.0.0.1", () =>
  console.log("Test Auth fixture listening on 127.0.0.1:54321"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
