import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/legal-layout";
import { publicContact, publicController } from "@/lib/public-contact";

export const metadata: Metadata = { title: "Privacidad | Pulso electoral", description: "Información preliminar de privacidad de Pulso electoral." };
export default function PrivacidadPage() {
  const email = publicContact();
  const controller = publicController();
  return <LegalLayout title="Aviso de privacidad (borrador)" subtitle="Información para la demostración, pendiente de validación jurídica y publicación por el responsable de la plataforma.">
    <p className="legal-warning" role="status">Documento preliminar: NO es un aviso de privacidad definitivo. Antes de abrir el registro al público deben completarse el responsable, domicilio, plazos, transferencias y mecanismos de ejercicio de derechos.</p>
    <h2>Responsable</h2>
    <p>{controller ?? "Identidad del responsable legal pendiente de designar por el equipo receptor."} El proyecto es independiente y no representa al Instituto Nacional Electoral.</p>
    <h2>Datos y finalidades</h2>
    <p>El registro solicita nombre, apellidos y correo electrónico. Supabase Auth gestiona autenticación y recuperación de acceso. Según las funciones activas, se conservan preferencias de sesión e historial privado de escenarios; pueden generarse registros técnicos de operación.</p>
    <p>Se utilizan estos datos para gestionar el acceso y el funcionamiento del prototipo. La información electoral mostrada es estadística agregada; no se requiere información individual de electores.</p>
    <h2>Proveedores, protección y conservación</h2>
    <p>El administrador debe documentar los servicios realmente habilitados —autenticación, alojamiento y asistentes IA—, sus condiciones, ubicaciones, periodos de retención y transferencias. No incluyas datos personales ni secretos en preguntas al asistente.</p>
    <h2>Contacto para privacidad</h2>
    {email ? <p>Para consultas y solicitudes, escribe a <a href={`mailto:${email}`}>{email}</a>.</p> :
      <p><strong>Contacto pendiente de configurar.</strong> El equipo debe designar un correo real antes de cualquier lanzamiento público. Consulta la <Link href="/soporte">página de soporte</Link>.</p>}
    <h2>Estado</h2><p>Borrador de 28 de octubre de 2026. Pendiente de revisión jurídica, responsable, domicilio, procedimientos y aprobación.</p>
  </LegalLayout>;
}
