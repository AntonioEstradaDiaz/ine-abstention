import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIRM_PAGE_COPY,
  EXPIRED_CONFIRMATION_NOTICE,
  EXPIRED_RECOVERY_NOTICE,
  RESEND_COOLDOWN_MS,
  RESEND_NEEDS_EMAIL,
  confirmRedirectPath,
  emailRedirect,
  linkKind,
  loginErrorNotice,
  recoverNotice,
  registerNotice,
  resendLabel,
  resendNotice,
  resendStartsCooldown,
  resendWaitSeconds,
} from "../src/lib/auth-flow.ts";

test("an unconfirmed account explains why and offers to resend", () => {
  const notice = loginErrorNotice({ code: "email_not_confirmed", status: 400 });
  assert.equal(notice.error, true);
  assert.equal(notice.canResend, true);
  assert.match(notice.text, /^Confirma tu correo antes de iniciar sesión\./);
});

test("other login errors never offer a resend", () => {
  for (const error of [{ code: "invalid_credentials", status: 400 }, { status: 429 }, {}, null]) {
    assert.notEqual(loginErrorNotice(error).canResend, true);
  }
  assert.match(loginErrorNotice({ status: 429 }).text, /Demasiados intentos/);
  assert.match(loginErrorNotice({ code: "invalid_credentials", status: 400 }).text, /Revisa tu correo y contraseña/);
});

test("registering gives the same neutral message and allows a resend", () => {
  const notice = registerNotice(null);
  assert.equal(notice.error, false);
  assert.equal(notice.canResend, true);
  assert.match(notice.text, /Revisa también la carpeta de spam/);
  assert.match(registerNotice({ status: 429 }).text, /límite de registros/);
});

test("a resend answer never reveals whether the account exists", () => {
  const sent = resendNotice(null);
  assert.equal(sent.error, false);
  assert.match(sent.text, /^Si la cuenta existe y falta confirmarla, te enviamos un nuevo enlace\./);
  // Supabase may answer with an error for unknown or already confirmed accounts: same text.
  for (const status of [400, 404, 422]) assert.deepEqual(resendNotice({ status }), sent);
});

test("a resend is honest about rate limits and lost connections", () => {
  const limited = resendNotice({ status: 429 });
  assert.equal(limited.error, true);
  assert.match(limited.text, /Espera un momento antes de pedir otro enlace/);
  const offline = resendNotice({ name: "AuthRetryableFetchError" });
  assert.equal(offline.error, true);
  assert.match(offline.text, /No fue posible conectar/);
});

test("recovery stays neutral", () => {
  assert.match(recoverNotice(null).text, /^Si existe una cuenta con ese correo, recibirás un enlace/);
  assert.equal(recoverNotice(null).error, false);
  assert.match(recoverNotice({ status: 429 }).text, /Espera un momento/);
});

test("the resend button waits 60 seconds", () => {
  assert.equal(RESEND_COOLDOWN_MS, 60_000);
  const now = 1_000_000;
  assert.equal(resendWaitSeconds(now + RESEND_COOLDOWN_MS, now), 60);
  assert.equal(resendWaitSeconds(now + 1_200, now), 2);
  assert.equal(resendWaitSeconds(now - 5, now), 0);
  assert.equal(resendLabel(0), "Reenviar confirmación");
  assert.equal(resendLabel(12), "Reenviar en 12 s");
});

test("email links are classified by type; anything else is invalid", () => {
  assert.equal(linkKind("email"), "confirmation");
  assert.equal(linkKind("signup"), "confirmation");
  assert.equal(linkKind("recovery"), "recovery");
  for (const type of [null, "", "magiclink", "invite", "RECOVERY"]) assert.equal(linkKind(type), null);
});

test("each link outcome goes to a fixed screen", () => {
  assert.equal(confirmRedirectPath("confirmation", true), "/");
  assert.equal(confirmRedirectPath("recovery", true), "/reset-password");
  assert.equal(confirmRedirectPath("confirmation", false), "/login?error=confirmation");
  assert.equal(confirmRedirectPath("recovery", false), "/recuperar?error=expired");
  assert.equal(confirmRedirectPath(null, false), "/login?error=confirmation");
});

test("expired links and the confirmation page speak plain Spanish", () => {
  assert.match(EXPIRED_CONFIRMATION_NOTICE, /no es válido o ya expiró/);
  assert.match(EXPIRED_RECOVERY_NOTICE, /venció o ya se usó/);
  assert.equal(CONFIRM_PAGE_COPY.confirmation.title, "Confirma tu cuenta de Atlas");
  assert.ok(CONFIRM_PAGE_COPY.recovery.action.length > 0);
});

test("a resend without an email asks for it", () => {
  assert.equal(RESEND_NEEDS_EMAIL.error, true);
  assert.match(RESEND_NEEDS_EMAIL.text, /^Escribe tu correo/);
});

test("emails redirect to /auth/callback, so default Supabase templates keep working", () => {
  // New templates build their own /auth/confirm link from {{ .SiteURL }} and ignore this value;
  // the default ones ({{ .ConfirmationURL }}, PKCE) need /auth/callback (design §3, §12).
  assert.equal(emailRedirect("https://atlas.example", "confirmation"), "https://atlas.example/auth/callback");
  assert.equal(
    emailRedirect("https://atlas.example", "recovery"),
    "https://atlas.example/auth/callback?next=/reset-password",
  );
});

test("the resend wait starts only when the server answered", () => {
  assert.equal(resendStartsCooldown(null), true);
  assert.equal(resendStartsCooldown({ status: 400 }), true);
  assert.equal(resendStartsCooldown({ status: 429 }), true);
  // A lost connection must not lock the button for a minute.
  assert.equal(resendStartsCooldown({ name: "AuthRetryableFetchError" }), false);
  assert.equal(resendStartsCooldown({ status: 0 }), false);
});
