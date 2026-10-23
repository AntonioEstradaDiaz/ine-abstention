import type { LucideIcon } from "lucide-react";

// Card shell shared by the redesigned sections: map-style icon, title and subtitle.
export function SectionCard({
  id,
  icon: Icon,
  title,
  subtitle,
  actions,
  className = "",
  children,
  ...rest
}: {
  id: string;
  icon: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "title" | "id">) {
  return (
    <section
      className={`section-card ${className}`}
      aria-labelledby={id}
      {...rest}
    >
      <header className="section-card-heading">
        <Icon className="section-card-icon" aria-hidden="true" />
        <div>
          <h2 id={id}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="section-card-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
