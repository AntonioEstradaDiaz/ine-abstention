import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

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
