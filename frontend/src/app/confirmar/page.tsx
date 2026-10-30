import { redirect } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { CONFIRM_PAGE_COPY, confirmRedirectPath, linkKind } from "@/lib/auth-flow";

// Second step of an email link: a plain form, so it works without JavaScript and a mail
// scanner opening the link does not verify (and spend) the one-time token.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const kind = linkKind(type);
  if (!token_hash || !kind) redirect(confirmRedirectPath(kind, false));
  const copy = CONFIRM_PAGE_COPY[kind];
  return (
    <main className="auth-page auth-confirm">
      <section className="auth-card auth-card-single" aria-labelledby="confirm-title">
        <div className="auth-panel">
          <span className="auth-decor" aria-hidden="true" />
          <header>
            <span className="auth-eyebrow">Atlas</span>
            <h1 id="confirm-title">{copy.title}</h1>
            <p>{copy.text}</p>
          </header>
          <form method="post" action="/auth/confirm">
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <button className="auth-primary" type="submit">
              {copy.action}
              <ArrowRight aria-hidden="true" />
            </button>
          </form>
          <p className="auth-secure">
            <ShieldCheck aria-hidden="true" />
            Acceso seguro a tu información
          </p>
          <p className="auth-independent">Prototipo independiente · No es una plataforma oficial del INE</p>
        </div>
      </section>
    </main>
  );
}
