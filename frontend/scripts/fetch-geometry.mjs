// Official contextual geography; electoral observations remain in the backend.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const source = "https://gaia.inegi.org.mx/wscatgeo/v2/geo/mgee/";
const response = await fetch(source, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`INEGI returned HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const geo = JSON.parse(bytes.toString("utf8"));
const codes = geo.features.map((f) => f.properties.cvegeo).sort();
if (
  geo.type !== "FeatureCollection" ||
  codes.length !== 32 ||
  codes.some((c, i) => c !== String(i + 1).padStart(2, "0"))
)
  throw new Error("Unexpected state coverage");
if (
  geo.features.some(
    (f) => !["Polygon", "MultiPolygon"].includes(f.geometry?.type),
  )
)
  throw new Error("Missing polygon geometry");
const directory = new URL("../public/geo/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("estados.geojson", directory), bytes);
await writeFile(
  new URL("provenance.json", directory),
  JSON.stringify(
    {
      source_url: source,
      documentation_url:
        "https://www.inegi.org.mx/servicios/catalogoUnico.html",
      retrieved_at: new Date().toISOString(),
      stored_sha256: createHash("sha256").update(bytes).digest("hex"),
      byte_size: bytes.length,
      features: codes.length,
      state_codes: codes,
      transformation:
        "None; response saved without geometry simplification. Join on properties.cvegeo.",
      scope:
        "Current INEGI geo-statistical reference; not homologated electoral boundaries or historical election geography. Retrieval date does not imply service edition.",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Validated and saved ${codes.length} official state polygons (${bytes.length} bytes).`,
);
