import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal-layout";
export const metadata: Metadata = { title: "Términos | Pulso electoral", description: "Condiciones informativas de la demostración Pulso electoral." };
export default function TerminosPage() {
  return <LegalLayout title="Términos de uso de la demostración" subtitle="Alcance y limitaciones del sistema, sujetos a aprobación de sus responsables.">
    <p className="legal-warning" role="status">Borrador de demostración: no constituye un documento contractual definitivo.</p>
    <h2>Alcance</h2><p>Pulso electoral es un prototipo independiente de análisis territorial. No es una plataforma oficial del INE ni está listo para decisiones electorales operativas.</p>
    <h2>Pronósticos y escenarios</h2><p>Las predicciones contienen incertidumbre y requieren validación externa. Los escenarios muestran cambios hipotéticos, no efectos causales de programas o políticas.</p>
    <h2>Seguridad</h2><p>No compartas contraseñas o tokens y evita ingresar información personal o confidencial en consultas de IA.</p>
    <h2>Derechos</h2><p>Los datos y recursos de terceros conservan sus condiciones. La licencia de distribución del código está pendiente de decisión de los titulares.</p>
  </LegalLayout>;
}
