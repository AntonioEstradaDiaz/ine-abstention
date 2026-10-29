/** Server-only shared token. Must never be exposed to the browser or NEXT_PUBLIC_. */
export function backendInternalHeaders(): Record<string, string> {
  const token = process.env.BACKEND_API_TOKEN;
  return token ? { "X-Pulso-Internal-Token": token } : {};
}
