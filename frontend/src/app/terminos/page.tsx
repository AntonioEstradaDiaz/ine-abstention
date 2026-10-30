import type { Metadata } from "next";
import { FileCheck2, FileText, LockKeyhole, ShieldAlert } from "lucide-react";
import { LegalLayout, LegalNotice, LegalSection } from "@/components/legal-layout";

export const metadata: Metadata = {
  title: "Términos | Atlas De La Participación",
  description: "Condiciones informativas de la demostración Atlas De La Participación.",
};

export default function TerminosPage() {
  return (
    <LegalLayout
      page="terms"
      title="Términos de uso de la demostración"
      subtitle="Información clara sobre los alcances, responsabilidades y límites del prototipo."
    >
      <LegalNotice>
        Estos términos son un borrador de demostración y no constituyen
        un documento contractual definitivo.
      </LegalNotice>

      <LegalSection id="alcance" title="Alcance del proyecto" icon={<FileText size={21} />}>
        <p>
          Atlas De La Participación es un prototipo independiente de análisis territorial,
          no una plataforma oficial del INE. Sus resultados no están preparados
          para fundamentar decisiones electorales operativas.
        </p>
      </LegalSection>

      <LegalSection id="predicciones" title="Predicciones y escenarios" icon={<ShieldAlert size={21} />}>
        <p>
          Los pronósticos incluyen incertidumbre y requieren validación externa.
          Los escenarios muestran cambios hipotéticos, no efectos causales
          de programas, políticas o campañas.
        </p>
      </LegalSection>

      <LegalSection id="seguridad" title="Uso responsable de tu cuenta" icon={<LockKeyhole size={21} />}>
        <p>
          Mantén seguras las credenciales y no compartas contraseñas ni tokens.
          Evita ingresar datos personales o información confidencial
          en las consultas al asistente de IA.
        </p>
      </LegalSection>

      <LegalSection id="derechos" title="Licencias y atribuciones" icon={<FileCheck2 size={21} />}>
        <p>
          Los datos públicos y recursos de terceros conservan sus condiciones
          respectivas. La licencia de distribución del código de este proyecto
          continúa pendiente de la decisión de sus titulares.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
