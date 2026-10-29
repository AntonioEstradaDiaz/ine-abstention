import Link from "next/link";
import type { ReactNode } from "react";

export function LegalLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <div className="legal-shell">
    <a className="skip-link" href="#contenido">Ir al contenido</a>
    <header className="legal-header">
      <Link className="legal-brand" href="/" aria-label="Pulso electoral, ir al panel">PULSO <span>electoral</span></Link>
      <nav aria-label="Información y acceso">
        <Link href="/login">Iniciar sesión</Link><Link href="/privacidad">Privacidad</Link><Link href="/soporte">Soporte</Link>
      </nav>
    </header>
    <main id="contenido" tabIndex={-1} className="legal-main">
      <div className="legal-intro"><p className="legal-eyebrow">Información del proyecto · prototipo experimental</p>
        <h1>{title}</h1><p>{subtitle}</p></div>
      <article className="legal-copy">{children}</article>
    </main>
    <footer className="legal-footer">
      <span>Proyecto independiente, no es un servicio oficial del INE.</span>
      <nav aria-label="Documentos del proyecto">
        <Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos de uso</Link><Link href="/soporte">Soporte</Link>
      </nav>
    </footer>
  </div>;
}
