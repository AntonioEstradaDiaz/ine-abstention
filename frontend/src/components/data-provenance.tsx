"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Copy, Download, Fingerprint } from "lucide-react";
import { api } from "@/lib/api";
import {
  CARTOGRAPHY_LABEL,
  manifestFileName,
  provenanceDate,
  provenanceManifest,
  provenanceRows,
} from "@/lib/provenance";
import type { Cartography, Forecast } from "@/lib/types";
import { Status } from "./shared";

function saveJson(name: string, content: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Provenance of the data in use: one row per election plus the INEGI cartography (punto 4).
export function DataProvenance({
  forecast,
  preview,
}: {
  forecast?: Forecast;
  preview: boolean;
}) {
  // Same query key as the dashboard: shares its cache, no extra request.
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: ({ signal }) => api.sources(signal),
  });
  const cartography = useQuery({
    queryKey: ["cartography-provenance"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/geo/provenance.json", { signal });
      if (!response.ok) throw new Error(`Cartografía ${response.status}`);
      return (await response.json()) as Cartography;
    },
    staleTime: Infinity,
    retry: false,
  });
  const [copied, setCopied] = useState("");
  const items = sources.data?.items ?? [];
  const rows = provenanceRows(items, cartography.data);
  const license = items.find((s) => s.license_notes)?.license_notes;
  const commit = forecast?.provenance?.source_commit;

  const copy = async (label: string, hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(`Huella de ${label} copiada.`);
    } catch {
      setCopied("No se pudo copiar; la huella completa está en el manifiesto.");
    }
  };
  const download = () =>
    saveJson(
      manifestFileName(items),
      provenanceManifest({
        sources: items,
        cartography: cartography.data,
        forecast,
        preview,
        generatedAt: new Date().toISOString(),
      }),
    );

  return (
    <section
      className="section-card data-provenance"
      aria-labelledby="provenance-title"
    >
      <header className="section-card-heading">
        <Fingerprint className="section-card-icon" aria-hidden="true" />
        <div>
          <h2 id="provenance-title">Versión de los datos</h2>
          <p>
            Procedencia de cada elección: archivo del INE, fecha de consulta,
            validación y huella para verificarlo
          </p>
        </div>
        <div className="section-card-actions">
          <button
            type="button"
            className="data-download-trigger"
            onClick={download}
            disabled={!items.length}
          >
            <Download size={16} />
            Descargar manifiesto
          </button>
        </div>
      </header>
      <p className="data-provenance-origin">
        {preview ? (
          <>
            <strong>Copia fija incluida en la demo</strong> · empaquetada el{" "}
            {provenanceDate(forecast?.created_at)}
            {typeof commit === "string" && commit
              ? ` · commit ${commit.slice(0, 7)}`
              : ""}
          </>
        ) : (
          <>
            <strong>Datos servidos por la API del proyecto</strong>
          </>
        )}
      </p>
      <Status
        loading={sources.isPending}
        error={sources.error}
        empty={sources.isSuccess && !items.length}
        retry={() => void sources.refetch()}
      />
      {sources.isSuccess && items.length > 0 && (
        <>
          <div
            className="section-table-scroll data-provenance-scroll"
            role="region"
            aria-label="Tabla de procedencia de los datos"
            tabIndex={0}
          >
            <table className="section-table compact data-provenance-table">
              <caption className="sr-only">
                Procedencia de los datos por elección y cartografía
              </caption>
              <thead>
                <tr>
                  <th scope="col">Elección</th>
                  <th scope="col">Conjunto de datos</th>
                  <th scope="col">Archivo en el sitio del INE</th>
                  <th scope="col">Consultado</th>
                  <th scope="col">Validación</th>
                  <th scope="col">Procesamiento</th>
                  <th scope="col">Huella SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{r.election}</th>
                    <td>
                      <span className="data-provenance-dataset">
                        {r.dataset}
                      </span>
                      <small>
                        {r.institution}
                        {r.link && (
                          <>
                            {" · "}
                            <a
                              href={r.link}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Página oficial del ${r.institution} (${r.dataset})`}
                            >
                              Página oficial
                              <ArrowUpRight size={12} aria-hidden="true" />
                            </a>
                          </>
                        )}
                      </small>
                    </td>
                    <td>{r.published}</td>
                    <td>{r.retrieved}</td>
                    <td>{r.validation}</td>
                    <td>{r.pipeline}</td>
                    <td>
                      <span className="data-provenance-hash">
                        <code aria-hidden="true">{r.shortHash}</code>
                        {r.hash && (
                          <>
                            <span className="sr-only">{r.hash}</span>
                            <button
                              type="button"
                              aria-label={`Copiar huella SHA-256 de ${r.election === CARTOGRAPHY_LABEL ? "la cartografía" : r.election}`}
                              onClick={() =>
                                void copy(
                                  r.election === CARTOGRAPHY_LABEL
                                    ? "la cartografía"
                                    : r.election,
                                  r.hash!,
                                )
                              }
                            >
                              <Copy size={13} aria-hidden="true" />
                            </button>
                          </>
                        )}
                        {!r.hash && (
                          <span className="sr-only">{r.shortHash}</span>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="data-provenance-copied" aria-live="polite">
            {copied}
          </p>
          <p className="section-card-note">
            La fecha del archivo es la que reporta el servidor del INE; no es la
            fecha oficial de publicación. «Validado» significa que el archivo
            pasó las comprobaciones del procesamiento (claves, conteos y
            fechas).
            {license && <> {license}</>}
          </p>
        </>
      )}
    </section>
  );
}
