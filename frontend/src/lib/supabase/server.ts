import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfigured } from "./config";
export async function authServer() {
  if (!authConfigured()) return null;
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          try {
            for (const { name, value, options } of items)
              store.set(name, value, {
                ...options,
                ...(store.get("pulso-remember")?.value === "0" && value
                  ? { maxAge: undefined, expires: undefined }
                  : {}),
              });
          } catch {
            /* Server Component: refreshed cookies are written by proxy. */
          }
        },
      },
    },
  );
}
