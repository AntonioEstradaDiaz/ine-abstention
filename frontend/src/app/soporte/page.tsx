import type { Metadata } from "next";
import Link from "next/link";
import { Accessibility, CircleHelp, Headphones, KeyRound, Mail, TrendingUp } from "lucide-react";
import { LegalLayout, LegalNotice, LegalSection } from "@/components/legal-layout";
import { publicContact } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Soporte | Atlas De La Participación",
  description: "Centro de ayuda y contacto para el prototipo Atlas De La Participación.",
};

export default function SoportePage() {
  const email = publicContact();

  return (
    <LegalLayout
      page="support"
      title="Ayuda y soporte"
      subtitle="Encuentra respuestas rápidas y aprende a resolver problemas de acceso a Atlas De La Participación."
    >
      <LegalSection id="acceso" title="¿Tienes problemas para iniciar sesión?" icon={<KeyRound size={21} />}>
        <ol className="legal-steps">
          <li>Verifica que ingresaste el correo con el que creaste tu cuenta.</li>
          <li>Revisa tu bandeja de entrada y spam si falta confirmar el registro.</li>
          <li>Utiliza la opción <Link href="/recuperar">recuperar contraseña</Link> para solicitar un enlace nuevo.</li>
          <li>Si el enlace expiró, solicita otro. No compartas contraseñas ni enlaces de acceso.</li>
        </ol>
      </LegalSection>

      <LegalSection id="datos" title="Datos y predicciones" icon={<TrendingUp size={21} />}>
        <p>
          Las estimaciones electorales son experimentales y los escenarios son
          hipotéticos, no causales. Las vistas municipales, distritales y seccionales
          permanecerán deshabilitadas hasta contar con datos comparables verificados.
        </p>
      </LegalSection>

      <LegalSection id="contacto" title="Contacto de soporte" icon={<Headphones size={21} />}>
        {email ? (
          <p>
            Escríbenos a <a href={`mailto:${email}`}>{email}</a>.
            Indica la pantalla, fecha, acción realizada y error observado.
            No envíes contraseñas ni tokens.
          </p>
        ) : (
          <LegalNotice>
            El correo de soporte aún está pendiente. El operador debe configurar
            y verificar <code>SUPPORT_CONTACT_EMAIL</code> antes de publicar el sistema.
          </LegalNotice>
        )}
      </LegalSection>

      <LegalSection id="accesibilidad" title="Ayúdanos a mejorar la accesibilidad" icon={<Accessibility size={21} />}>
        <p>
          Para informar de una barrera de acceso, anota la sección, el dispositivo,
          el navegador y la tecnología de asistencia utilizada. Sigue pendiente
          una auditoría integral con personas usuarias.
        </p>
      </LegalSection>

      <LegalSection id="informacion" title="Más información" icon={<CircleHelp size={21} />}>
        <p>
          También puedes consultar el <Link href="/privacidad">aviso preliminar de privacidad</Link>
          {" "}y los <Link href="/terminos">términos de uso</Link> del prototipo.
        </p>
      </LegalSection>
      <div className="legal-update">
        <Mail size={17} aria-hidden="true" />
        <span>Centro de soporte de demostración · Contacto definitivo por confirmar.</span>
      </div>
    </LegalLayout>
  );
}
