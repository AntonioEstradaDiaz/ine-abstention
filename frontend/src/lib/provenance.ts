// Data provenance shown in Gestión de Datos and in the downloadable manifest. Pure module: no
// React or network access, so it runs under `node --test`. Missing values never hide a row.
import type { Cartography, Forecast, Source } from "./types";

export const NOT_AVAILABLE = "No disponible";
export const NOT_APPLICABLE = "No aplica";
export const CARTOGRAPHY_LABEL = "Cartografía";

const present = (value?: string | null): value is string => !!value?.trim();

/** First characters of a SHA-256 followed by an ellipsis. */
export function shortHash(hash?: string | null, length = 12): string {
  return present(hash) ? `${hash.slice(0, length)}…` : NOT_AVAILABLE;
}

/** "22 oct 2026" in es-MX, read in UTC so the day does not shift. */
export function provenanceDate(iso?: string | null): string {
  if (!present(iso)) return NOT_AVAILABLE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return NOT_AVAILABLE;
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Most recent retrieval among the sources, as received. */
export function latestRetrieved(sources: Source[]): string | undefined {
  let latest: string | undefined;
  for (const s of sources) {
    const time = present(s.retrieved_at) ? Date.parse(s.retrieved_at) : NaN;
    if (!Number.isNaN(time) && (!latest || time > Date.parse(latest)))
      latest = s.retrieved_at;
  }
  return latest;
}

/** "Validado" only for the processing checks; anything else is flagged, never hidden. */
export function validationLabel(status?: string | null): string {
  if (!present(status)) return NOT_AVAILABLE;
  return status === "validated" ? "Validado" : "Con observaciones";
}

export interface ProvenanceRow {
  key: string;
  election: string;
  dataset: string;
  institution: string;
  link?: string;
  published: string;
  retrieved: string;
  validation: string;
  pipeline: string;
  hash?: string;
  shortHash: string;
}

/** One row per election (by year) plus the INEGI cartography row. */
export function provenanceRows(
  sources: Source[],
  cartography?: Cartography | null,
): ProvenanceRow[] {
  const rows: ProvenanceRow[] = [...sources]
    .sort((a, b) => a.year - b.year)
    .map((s) => ({
      key: String(s.id),
      election: String(s.year),
      dataset: s.dataset_name || NOT_AVAILABLE,
      institution: s.institution || NOT_AVAILABLE,
      link: s.landing_url || s.source_url || undefined,
      published: provenanceDate(s.published_at),
      retrieved: provenanceDate(s.retrieved_at),
      validation: validationLabel(s.validation_status),
      pipeline: present(s.pipeline_version)
        ? s.pipeline_version
        : NOT_AVAILABLE,
      hash: present(s.checksum) ? s.checksum : undefined,
      shortHash: shortHash(s.checksum),
    }));
  rows.push({
    key: "inegi",
    election: CARTOGRAPHY_LABEL,
    dataset: "Marco geoestadístico estatal",
    institution: "INEGI",
    link:
      cartography?.documentation_url || cartography?.source_url || undefined,
    published: NOT_AVAILABLE,
    retrieved: provenanceDate(cartography?.retrieved_at),
    validation: NOT_APPLICABLE,
    pipeline: NOT_APPLICABLE,
    hash: present(cartography?.stored_sha256)
      ? cartography.stored_sha256
      : undefined,
    shortHash: shortHash(cartography?.stored_sha256),
  });
  return rows;
}

export interface ManifestInput {
  sources: Source[];
  cartography?: Cartography | null;
  forecast?: Forecast;
  preview: boolean;
  generatedAt: string;
}

const orNull = <T>(value: T | null | undefined) => value ?? null;

/** Downloadable JSON: Spanish keys like the existing data export; missing values are null. */
export function provenanceManifest({
  sources,
  cartography,
  forecast,
  preview,
  generatedAt,
}: ManifestInput) {
  const commit = forecast?.provenance?.source_commit;
  return {
    proyecto: "Atlas De La Participación",
    generado: generatedAt,
    modo: preview ? "Copia fija de la demo" : "API del proyecto",
    copia:
      preview && forecast
        ? {
            id: forecast.id,
            empaquetada: forecast.created_at,
            commit: typeof commit === "string" ? commit : null,
          }
        : null,
    prediccion: forecast
      ? {
          id: forecast.id,
          generada: forecast.created_at,
          anio_objetivo: forecast.target_year,
        }
      : null,
    fuentes: [...sources]
      .sort((a, b) => a.year - b.year)
      .map((s) => ({
        anio: s.year,
        conjunto: s.dataset_name,
        institucion: s.institution,
        url_descarga: orNull(s.source_url),
        pagina_oficial: orNull(s.landing_url),
        tamano_bytes: orNull(s.byte_size),
        sha256: orNull(s.checksum),
        archivo_ine_fecha: orNull(s.published_at),
        consultado: orNull(s.retrieved_at),
        validacion: orNull(s.validation_status),
        version_procesamiento: orNull(s.pipeline_version),
        licencia: orNull(s.license_notes),
      })),
    cartografia: cartography
      ? {
          fuente: cartography.source_url,
          documentacion: orNull(cartography.documentation_url),
          consultado: orNull(cartography.retrieved_at),
          sha256: orNull(cartography.stored_sha256),
          tamano_bytes: orNull(cartography.byte_size),
        }
      : null,
  };
}

/** atlas-participacion-procedencia-<version>-<yyyy-mm-dd of latest retrieval>.json */
export function manifestFileName(sources: Source[]): string {
  const versions = [
    ...new Set(sources.map((s) => s.pipeline_version).filter(present)),
  ];
  const version =
    versions.length === 1
      ? versions[0]
      : versions.length
        ? "varias-versiones"
        : "sin-version";
  const latest = latestRetrieved(sources);
  const day = latest
    ? new Date(latest).toISOString().slice(0, 10)
    : "sin-fecha";
  return `atlas-participacion-procedencia-${version}-${day}.json`;
}
