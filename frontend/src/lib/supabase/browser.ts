import {
  createBrowserClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
export function authBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => parseCookieHeader(document.cookie),
        setAll: (items) => {
          const temporary = parseCookieHeader(document.cookie).some(
            (cookie) =>
              cookie.name === "pulso-remember" && cookie.value === "0",
          );
          for (const { name, value, options } of items)
            document.cookie = serializeCookieHeader(name, value, {
              ...options,
              ...(temporary && value
                ? { maxAge: undefined, expires: undefined }
                : {}),
            });
        },
      },
    },
  );
}
