import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Database, Mail, Server, ShieldCheck, UserRound } from "lucide-react";
import { LegalLayout, LegalNotice, LegalSection } from "@/components/legal-layout";
import { publicContact, publicController } from "@/lib/public-contact";

export const metadata: Metadata = {
  title: "Privacidad | Pulso electoral",
  description: "Información preliminar sobre la privacidad y los datos personales en Pulso electoral.",
};

export default function PrivacidadPage() {
  const email = publicContact();
  const controller = publicController();

  return (
    <LegalLayout
      page="privacy"
      title="Aviso de privacidad (borrador)"
      subtitle="Conoce cómo se utiliza la información al registrarte y explorar la plataforma."
    >
      <LegalNotice>
        Este aviso es preliminar y no sustituye al documento jurídico definitivo.
        Antes de abrir el registro al público se deben definir el responsable, su
        domicilio, plazos de conservación, transferencias y mecanismos para ejercer derechos.
      </LegalNotice>

      <LegalSection id="responsable" title="Responsable del tratamiento" icon={<UserRound size={21} />}>
        <p>
          {controller ?? "El responsable legal todavía debe ser designado por el equipo receptor."}
          {" "}Pulso electoral es un proyecto independiente y no representa al
          Instituto Nacional Electoral (INE).
        </p>
      </LegalSection>

      <LegalSection id="datos" title="Datos que utiliza la plataforma" icon={<Database size={21} />}>
        <p>
          Para crear una cuenta se solicitan nombre, apellidos y correo electrónico.
          La autenticación y recuperación de acceso se gestionan mediante Supabase Auth.
        </p>
        <p>
          Según las funciones activadas, también pueden guardarse preferencias
          de sesión, historiales privados de escenarios y registros técnicos
          necesarios para operar y mantener el servicio.
        </p>
      </LegalSection>

      <LegalSection id="finalidades" title="¿Para qué se utilizan?" icon={<ShieldCheck size={21} />}>
        <p>
          Para gestionar el acceso, proteger las sesiones y ofrecer las funciones
          del prototipo. La información electoral que se muestra es estadística
          agregada; no se requiere información individual de electores para consultar el dashboard.
        </p>
      </LegalSection>

      <LegalSection id="proveedores" title="Proveedores y conservación" icon={<Server size={21} />}>
        <p>
          El responsable deberá documentar los servicios realmente habilitados,
          incluidos autenticación, alojamiento y asistentes de inteligencia artificial,
          así como sus condiciones, ubicaciones, periodos de retención y transferencias.
        </p>
        <p>No incluyas datos personales ni información confidencial en preguntas al asistente de IA.</p>
      </LegalSection>

      <LegalSection id="contacto" title="Contacto de privacidad" icon={<Mail size={21} />}>
        {email ? (
          <p>
            Para consultas y solicitudes puedes escribir a{" "}
            <a href={`mailto:${email}`}>{email}</a>.
          </p>
        ) : (
          <p>
            <strong>Contacto pendiente de configurar.</strong> El equipo responsable debe
            designar y comprobar un correo antes del lanzamiento público.
            Consulta también la <Link href="/soporte">página de soporte</Link>.
          </p>
        )}
      </LegalSection>

      <div className="legal-update">
        <CalendarDays size={17} aria-hidden="true" />
        <span>Documento de trabajo · 28 de octubre de 2026 · Pendiente de revisión y aprobación.</span>
      </div>
    </LegalLayout>
  );
}
