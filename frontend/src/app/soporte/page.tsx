import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";
import { publicContact } from "@/lib/public-contact";

export const metadata: Metadata = { title: "Soporte | Pulso electoral", description: "Ayuda y contacto para el prototipo Pulso electoral." };
export default function SoportePage() {
  const email = publicContact();
  return <LegalLayout title="Ayuda y soporte" subtitle="Soluciones de acceso, contacto y limitaciones del prototipo.">
    <h2>Problemas para iniciar sesión</h2>
    <ol>
      <li>Verifica que ingresaste el correo con el que te registraste.</li>
      <li>Comprueba la bandeja de entrada y spam si falta confirmar tu cuenta.</li>
      <li>Usa <Link href="/recuperar">recuperar contraseña</Link> para solicitar un enlace nuevo.</li>
      <li>Si el enlace expiró, solicita otro y no compartas contraseñas o tokens.</li>
    </ol>
    <h2>Datos y predicciones</h2>
    <p>Las estimaciones son experimentales y los escenarios son hipotéticos, no causales. Las vistas municipales, distritales y seccionales requieren datos homogéneos antes de activarse.</p>
    <h2>Contacto de soporte</h2>
    {email ? <p>Escribe a <a href={`mailto:${email}`}>{email}</a>. Indica pantalla, fecha, acción y error; nunca envíes contraseñas.</p> :
      <p className="legal-warning"><strong>Correo de soporte por definir.</strong> El operador debe configurar <code>SUPPORT_CONTACT_EMAIL</code> y verificar su recepción antes de publicar el servicio.</p>}
    <h2>Accesibilidad</h2>
    <p>Para reportar barreras, anota sección, dispositivo, navegador y tecnología de asistencia. Sigue pendiente una auditoría completa con personas usuarias.</p>
    <p>Consulta también <Link href="/privacidad">privacidad</Link> y <Link href="/terminos">términos de uso</Link>.</p>
  </LegalLayout>;
}
