import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CARTOGRAPHY_LABEL,
  NOT_APPLICABLE,
  NOT_AVAILABLE,
  latestRetrieved,
  manifestFileName,
  provenanceDate,
  provenanceManifest,
  provenanceRows,
  shortHash,
  validationLabel,
} from "../src/lib/provenance.ts";

const snapshot = JSON.parse(
  await readFile(
    new URL("../src/lib/preview-data.json", import.meta.url),
    "utf8",
  ),
);
const cartography = JSON.parse(
  await readFile(
    new URL("../public/geo/provenance.json", import.meta.url),
    "utf8",
  ),
);
const sources = snapshot.sources.items;
const forecast = snapshot.predictions.forecast;
const bare = {
  id: 2015,
  year: 2015,
  institution: "INE",
  dataset_name: "CCPC 2015",
  source_url: "https://ine.mx/2015.zip",
  landing_url: "",
};

test("hashes are shortened to 12 characters, or marked as unavailable", () => {
  assert.equal(shortHash("e626e9528a91206c23fc8f96987e1a29"), "e626e9528a91…");
  assert.equal(shortHash(undefined), NOT_AVAILABLE);
  assert.equal(shortHash(""), NOT_AVAILABLE);
});

test("dates read in UTC and invalid ones are unavailable", () => {
  assert.equal(
    provenanceDate("2026-10-22T01:48:59.931533+00:00"),
    "22 oct 2026",
  );
  assert.equal(provenanceDate("2022-04-18T23:59:00Z"), "18 abr 2022");
  assert.equal(provenanceDate(null), NOT_AVAILABLE);
  assert.equal(provenanceDate("no es fecha"), NOT_AVAILABLE);
});

test("latest retrieval ignores missing and invalid dates", () => {
  assert.equal(latestRetrieved(sources), "2026-10-22T01:49:07.271195+00:00");
  assert.equal(latestRetrieved([bare]), undefined);
  assert.equal(
    latestRetrieved([
      { ...bare, retrieved_at: "x" },
      { ...bare, retrieved_at: "2026-01-02T00:00:00Z" },
    ]),
    "2026-01-02T00:00:00Z",
  );
});

test("only the processing status 'validated' reads as validated", () => {
  assert.equal(validationLabel("validated"), "Validado");
  assert.equal(validationLabel("needs_review"), "Con observaciones");
  assert.equal(validationLabel(null), NOT_AVAILABLE);
});

test("demo copy rows: six elections by year plus the INEGI cartography", () => {
  const rows = provenanceRows([...sources].reverse(), cartography);
  assert.deepEqual(
    rows.map((r) => r.election),
    ["2009", "2012", "2015", "2018", "2021", "2024", CARTOGRAPHY_LABEL],
  );
  const last = rows[5];
  assert.equal(last.published, "13 ago 2025");
  assert.equal(last.retrieved, "22 oct 2026");
  assert.equal(last.validation, "Validado");
  assert.equal(last.pipeline, "ccpc-v1");
  assert.equal(last.hash?.length, 64);
  assert.match(last.shortHash, /^[0-9a-f]{12}…$/);
  const inegi = rows[6];
  assert.equal(inegi.institution, "INEGI");
  assert.equal(inegi.validation, NOT_APPLICABLE);
  assert.equal(inegi.hash, cartography.stored_sha256);
});

test("missing provenance shows 'No disponible' without dropping the row", () => {
  const [row, inegi] = provenanceRows([bare], null);
  assert.equal(row.election, "2015");
  assert.equal(row.published, NOT_AVAILABLE);
  assert.equal(row.retrieved, NOT_AVAILABLE);
  assert.equal(row.validation, NOT_AVAILABLE);
  assert.equal(row.pipeline, NOT_AVAILABLE);
  assert.equal(row.hash, undefined);
  assert.equal(row.shortHash, NOT_AVAILABLE);
  assert.equal(row.link, "https://ine.mx/2015.zip");
  assert.equal(inegi.retrieved, NOT_AVAILABLE);
  assert.equal(inegi.shortHash, NOT_AVAILABLE);
});

test("the manifest carries full hashes and uses null for missing values", () => {
  const manifest = provenanceManifest({
    sources,
    cartography,
    forecast,
    preview: true,
    generatedAt: "2026-10-30T12:00:00.000Z",
  });
  assert.equal(manifest.proyecto, "Atlas De La Participación");
  assert.equal(manifest.modo, "Copia fija de la demo");
  assert.equal(manifest.copia?.id, forecast.id);
  assert.equal(manifest.copia?.commit, forecast.provenance.source_commit);
  assert.equal(manifest.prediccion?.generada, forecast.created_at);
  assert.equal(manifest.fuentes.length, 6);
  for (const f of manifest.fuentes)
    assert.match(f.sha256 ?? "", /^[0-9a-f]{64}$/);
  assert.equal(manifest.cartografia?.sha256, cartography.stored_sha256);

  const api = provenanceManifest({
    sources: [bare],
    preview: false,
    generatedAt: "2026-10-30T12:00:00.000Z",
  });
  assert.equal(api.modo, "API del proyecto");
  assert.equal(api.copia, null);
  assert.equal(api.prediccion, null);
  assert.equal(api.cartografia, null);
  assert.equal(api.fuentes[0].sha256, null);
  assert.equal(api.fuentes[0].archivo_ine_fecha, null);
});

test("the file name names the processing version and the latest retrieval day", () => {
  assert.equal(
    manifestFileName(sources),
    "atlas-participacion-procedencia-ccpc-v1-2026-10-22.json",
  );
  assert.equal(
    manifestFileName([
      { ...bare, pipeline_version: "ccpc-v1" },
      { ...bare, pipeline_version: "ccpc-v2" },
    ]),
    "atlas-participacion-procedencia-varias-versiones-sin-fecha.json",
  );
  assert.equal(
    manifestFileName([bare]),
    "atlas-participacion-procedencia-sin-version-sin-fecha.json",
  );
});
