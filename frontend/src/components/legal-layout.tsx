import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  FileText,
  Headphones,
  Home,
  Info,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

type LegalPage = "privacy" | "terms" | "support";

const navigation = [
  { href: "/privacidad", label: "Privacidad", page: "privacy" as const, icon: ShieldCheck },
  { href: "/terminos", label: "Términos", page: "terms" as const, icon: FileText },
  { href: "/soporte", label: "Soporte", page: "support" as const, icon: Headphones },
];

export function LegalLayout({
  title,
  subtitle,
  page,
  children,
}: {
  title: string;
  subtitle: string;
  page: LegalPage;
  children: ReactNode;
}) {
  const PageIcon =
    page === "privacy" ? ShieldCheck : page === "terms" ? FileText : Headphones;

  return (
    <div className="legal-shell">
      <a className="skip-link" href="#contenido">
        Ir al contenido
      </a>
      <header className="legal-header">
        <div className="legal-header-inner">
          <Link className="legal-brand" href="/" aria-label="Pulso electoral, ir al panel">
            <span className="legal-brand-symbol" aria-hidden="true">
              <Activity size={23} strokeWidth={2.5} />
            </span>
            <span className="legal-brand-name">
              PULSO <span>electoral</span>
            </span>
          </Link>
          <nav className="legal-top-nav" aria-label="Información y acceso">
            <Link className="legal-home-link" href="/login">
              <Home size={16} aria-hidden="true" />
              <span>Iniciar sesión</span>
            </Link>
            {navigation.map(({ href, label, page: itemPage }) => (
              <Link
                key={href}
                href={href}
                aria-current={page === itemPage ? "page" : undefined}
                className={`legal-nav-link${page === itemPage ? " is-active" : ""}`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main id="contenido" tabIndex={-1} className="legal-main">
        <section className="legal-hero" aria-labelledby="legal-title">
          <div className="legal-hero-copy">
            <span className="legal-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              Centro de información PULSO
            </span>
            <h1 id="legal-title">{title}</h1>
            <p className="legal-hero-subtitle">{subtitle}</p>
            <div className="legal-hero-meta">
              <span className="legal-status-pill">
                <span className="legal-status-dot" aria-hidden="true" />
                Documento en revisión
              </span>
              <span className="legal-hero-divider" aria-hidden="true" />
              <span className="legal-hero-meta-label">Prototipo experimental</span>
            </div>
          </div>
          <div className="legal-hero-illustration" aria-hidden="true">
            <div className="legal-orbit legal-orbit-outer" />
            <div className="legal-orbit legal-orbit-inner" />
            <div className="legal-hero-icon"><PageIcon size={54} strokeWidth={1.45} /></div>
          </div>
        </section>

        <div className="legal-content-grid">
          <article className="legal-copy" aria-label="Contenido informativo">
            {children}
          </article>
          <aside className="legal-sidebar" aria-label="Información complementaria">
            <div className="legal-sidebar-card legal-sidebar-note">
              <span className="legal-sidebar-icon" aria-hidden="true">
                <Info size={19} />
              </span>
              <h2>Acerca de PULSO</h2>
              <p>
                Plataforma independiente para explorar datos públicos de participación
                electoral y estimaciones experimentales. No es un servicio oficial del INE.
              </p>
              <span className="legal-sidebar-tag">
                <ShieldCheck size={14} aria-hidden="true" />
                En etapa de demostración
              </span>
            </div>
            <nav className="legal-sidebar-card" aria-label="Explorar información">
              <h2>También te puede interesar</h2>
              {navigation
                .filter(({ page: itemPage }) => itemPage !== page)
                .map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} className="legal-related-link">
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                    <ChevronRight size={17} aria-hidden="true" />
                  </Link>
                ))}
              <Link href="/login" className="legal-related-link">
                <Home size={18} aria-hidden="true" />
                <span>Volver al acceso</span>
                <ChevronRight size={17} aria-hidden="true" />
              </Link>
            </nav>
          </aside>
        </div>
      </main>

      <footer className="legal-footer">
        <div className="legal-footer-inner">
          <span>PULSO electoral · 2026 · Proyecto independiente del INE</span>
          <nav aria-label="Documentos del proyecto">
            {navigation.map(({ href, label }) => (
              <Link href={href} key={href}>
                {label} <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalNotice({ children }: { children: ReactNode }) {
  return (
    <div className="legal-warning" role="note" aria-label="Información importante">
      <span className="legal-warning-icon" aria-hidden="true">
        <Info size={20} />
      </span>
      <div className="legal-warning-text">
        <strong>Importante antes del lanzamiento</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function LegalSection({
  id,
  title,
  icon,
  description,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="legal-section" aria-labelledby={id}>
      <div className="legal-section-header">
        <span className="legal-section-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="legal-section-heading">
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="legal-section-body">{children}</div>
    </section>
  );
}
