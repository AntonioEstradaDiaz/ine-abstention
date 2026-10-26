import "@fontsource/nunito/400.css";
import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./dashboard-refresh.css";
import "./design-top.css";
import "./territory-metrics.css";
import "./lower-dashboard.css";
import "./map-refresh.css";
import "./select-menu.css";
import "./reference-kpis.css";
import "./section-pages.css";
import "./analysis-view.css";
import "./auth.css";

export const metadata: Metadata = {
  title: "Pulso electoral · Participación territorial",
  description:
    "Explora la participación histórica, el riesgo de abstención y escenarios territoriales con datos oficiales del INE.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
