// Account access copy and rules shared by the auth screens and /auth/confirm. Pure module: no
// Next.js or Supabase imports, so it runs under `node --test`. Messages never reveal whether an
// email address has an account.

/** Wait between confirmation resends; matches Supabase's minimum interval per user. */
export const RESEND_COOLDOWN_MS = 60_000;

export interface AuthNotice {
  text: string;
  error: boolean;
  /** Offer "Reenviar confirmación" next to this notice. */
  canResend?: boolean;
}

/** The fields this module reads from a Supabase AuthError (or a missing error). */
export type AuthErrorLike = { code?: string; status?: number; name?: string } | null | undefined;

const OFFLINE = "No fue posible conectar. Intenta nuevamente.";
const WAIT = "Espera un momento antes de pedir otro enlace.";
const RESEND_SENT =
  "Si la cuenta existe y falta confirmarla, te enviamos un nuevo enlace. Revisa también la carpeta de spam.";

// Supabase reports network failures without an HTTP status.
const answered = (error: AuthErrorLike) => typeof error?.status === "number" && error.status > 0;

export function loginErrorNotice(error: AuthErrorLike): AuthNotice {
  if (error?.code === "email_not_confirmed")
    return {
      text: "Confirma tu correo antes de iniciar sesión. Si no te llegó el enlace, puedes pedir otro.",
      error: true,
      canResend: true,
    };
  if (error?.status === 429) return { text: "Demasiados intentos. Espera unos minutos.", error: true };
  return { text: "No pudimos iniciar sesión. Revisa tu correo y contraseña.", error: true };
}

export function registerNotice(error: AuthErrorLike): AuthNotice {
  if (!error)
    return {
      text: "Si el correo permite el registro, recibirás un enlace para confirmar tu cuenta. Revisa también la carpeta de spam.",
      error: false,
      canResend: true,
    };
  if (error.status === 429)
    return { text: "Se alcanzó el límite de registros. Intenta más tarde.", error: true };
  return {
    text: "No se pudo crear la cuenta. Revisa los datos o contacta al administrador.",
    error: true,
  };
}

/** Same text whether or not the account exists; only rate limits and lost connections differ. */
export function resendNotice(error: AuthErrorLike): AuthNotice {
  if (error?.status === 429) return { text: WAIT, error: true };
  if (error && !answered(error)) return { text: OFFLINE, error: true };
  return { text: RESEND_SENT, error: false };
}

/** The 60 s wait starts only if the server answered (429 included); a lost connection can retry. */
export function resendStartsCooldown(error: AuthErrorLike): boolean {
  return !error || answered(error);
}

export const RESEND_NEEDS_EMAIL: AuthNotice = {
  text: "Escribe tu correo para que te enviemos un nuevo enlace.",
  error: true,
};

export function recoverNotice(error: AuthErrorLike): AuthNotice {
  if (!error)
    return {
      text: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.",
      error: false,
    };
  if (error.status === 429) return { text: WAIT, error: true };
  return { text: "No se pudo solicitar la recuperación. Intenta más tarde.", error: true };
}

export const EXPIRED_CONFIRMATION_NOTICE =
  "El enlace no es válido o ya expiró. Solicita uno nuevo o inicia sesión si ya confirmaste tu correo.";
export const EXPIRED_RECOVERY_NOTICE =
  "El enlace para restablecer tu contraseña venció o ya se usó. Pide uno nuevo.";

export const CONFIRM_PAGE_COPY = {
  confirmation: {
    title: "Confirma tu cuenta de Atlas",
    text: "Pulsa el botón para terminar de confirmar tu correo y entrar.",
    action: "Confirmar mi cuenta",
  },
  recovery: {
    title: "Restablece tu contraseña",
    text: "Pulsa el botón para continuar y elegir una contraseña nueva.",
    action: "Continuar",
  },
} as const;

/** Whole seconds left before another resend is allowed. */
export function resendWaitSeconds(availableAt: number, now: number): number {
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}

export function resendLabel(waitSeconds: number): string {
  return waitSeconds > 0 ? `Reenviar en ${waitSeconds} s` : "Reenviar confirmación";
}

export type LinkKind = "confirmation" | "recovery";

/**
 * `emailRedirectTo` / `redirectTo` for Supabase. Only the default templates ({{ .ConfirmationURL }},
 * PKCE) use it, and they need /auth/callback; Atlas templates link to /auth/confirm themselves.
 * Keeping it here makes deploy order and template changes independent.
 */
export function emailRedirect(origin: string, kind: LinkKind): string {
  return kind === "recovery"
    ? `${origin}/auth/callback?next=/reset-password`
    : `${origin}/auth/callback`;
}

/** Email link `type`: `email` (and legacy `signup`) confirm an account; `recovery` resets a password. */
export function linkKind(type: string | null | undefined): LinkKind | null {
  if (type === "email" || type === "signup") return "confirmation";
  if (type === "recovery") return "recovery";
  return null;
}

/** Fixed destination after verifying an email link; never a user-supplied URL. */
export function confirmRedirectPath(kind: LinkKind | null, verified: boolean): string {
  if (verified && kind) return kind === "recovery" ? "/reset-password" : "/";
  return kind === "recovery" ? "/recuperar?error=expired" : "/login?error=confirmation";
}
