"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, ArrowUpRight, Info, RotateCcw, X } from "lucide-react";
import type { Source, Risk } from "@/lib/types";
import { riskLabels } from "@/lib/utils";
import { Button } from "./ui/button";

export function Status({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: Error | null;
  empty?: boolean;
  retry?: () => void;
}) {
  if (error)
    return (
      <div className="status-box error" role="alert">
        <AlertCircle size={22} />
        <div>
          <strong>No pudimos cargar estos datos</strong>
          <p>{error.message}</p>
        </div>
        {retry && (
          <Button variant="outline" size="sm" onClick={retry}>
            <RotateCcw size={14} />
            Reintentar
          </Button>
        )}
      </div>
    );
  if (loading)
    return (
      <div className="status-box" role="status">
        <span className="loading-dot" />
        Consultando datos del backend…
      </div>
    );
  if (empty)
    return <div className="status-box">No hay datos para esta selección.</div>;
  return null;
}
export function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span className={`risk-badge risk-${risk}`}>
      <span />
      {riskLabels[risk]}
    </span>
  );
}
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="note">
      <Info size={15} strokeWidth={1.5} />
      <p>{children}</p>
    </div>
  );
}
export function SourceLink({
  id,
  sources,
  label = "Ver fuente INE",
}: {
  id: string | number | undefined;
  sources?: Source[];
  label?: string;
}) {
  const source = sources?.find((s) => String(s.id) === String(id));
  if (!source)
    return (
      <span className="muted small">
        Fuente INE · {id ? `registro ${id}` : "consultando referencia"}
      </span>
    );
  return (
    <a
      className="text-link"
      href={source.landing_url || source.source_url}
      target="_blank"
      rel="noreferrer"
    >
      {label}
      <ArrowUpRight size={13} />
    </a>
  );
}
export function Methodology({ sources }: { sources?: Source[] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="sm" aria-label="Metodología y fuentes">
          <Info size={16} />
          Metodología y fuentes
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>Datos abiertos, supuestos visibles</Dialog.Title>
          <Dialog.Description>
            Alcance del prototipo y procedencia de la información.
          </Dialog.Description>
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="dialog-close"
              aria-label="Cerrar metodología"
            >
              <X size={20} />
            </Button>
          </Dialog.Close>
          <div className="dialog-scroll">
            <h3>Participación y abstención</h3>
            <p>
              Tasas sobre SV + NV: personas con participación conocida. NS (sin
              especificar) se excluye del denominador y se muestra por separado.
              El dato nacional suma los conteos; las medias estatales dan el
              mismo peso a cada estado.
            </p>
            <h3>Predicción y semáforo</h3>
            <p>
              Estimación experimental para las elecciones intermedias de 2027.
              El baseline seleccionado repite la abstención de la última
              elección del mismo tipo (2021). El semáforo usa terciles
              históricos de 2009, 2015 y 2021: no es un estándar oficial del
              INE.
            </p>
            <p>
              Las bandas se basan en errores temporales empíricos de un solo
              bloque electoral. El cuantil de referencia es 90%; no equivale a
              una cobertura futura garantizada del 90%. La categoría puede
              cambiar dentro de la banda. No se ha verificado la fecha original
              de publicación de todas las variables.
            </p>
            <h3>Escenarios</h3>
            <p>
              El cambio en participación se traslada aritméticamente a la
              abstención, limitado al rango de 0 a 100%. No estima efectos
              causales, probabilidades ni impactos de una intervención. La banda
              conserva los supuestos del escenario base.
            </p>
            <h3>Cartografía de referencia</h3>
            <p>
              Polígonos oficiales del servicio del Catálogo Único de Claves de
              Áreas Geoestadísticas del INEGI. Unión por clave estatal de dos
              dígitos. No son límites electorales homologados ni cartografía
              histórica de cada elección.
            </p>
            <p>
              <a
                className="text-link"
                href="https://www.inegi.org.mx/servicios/catalogoUnico.html"
                target="_blank"
                rel="noreferrer"
              >
                Servicio oficial INEGI
                <ArrowUpRight size={13} />
              </a>{" "}
              ·{" "}
              <a
                className="text-link"
                href="/geo/provenance.json"
                target="_blank"
                rel="noreferrer"
              >
                Manifiesto de descarga
              </a>
            </p>
            <h3>Fuentes electorales</h3>
            {sources?.length ? (
              <ul className="source-list">
                {sources.map((s) => (
                  <li key={s.id}>
                    <span>
                      {s.year} · {s.institution}
                    </span>
                    <a
                      href={s.landing_url || s.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {s.dataset_name}
                      <ArrowUpRight size={13} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Las referencias se muestran al conectar con el backend.</p>
            )}
            <Note>
              Prototipo analítico. Sin aval del INE y sin validación para uso
              operativo.
            </Note>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
