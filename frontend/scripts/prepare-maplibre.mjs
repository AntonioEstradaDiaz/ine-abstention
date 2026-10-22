// MapLibre 6 uses module workers with a sibling shared module. Serve both locally.
import { copyFile, mkdir } from "node:fs/promises";
const destination = new URL("../public/vendor/maplibre/", import.meta.url);
const source = new URL("../node_modules/maplibre-gl/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(new URL(`dist/${name}`, source), new URL(name, destination));
}
await copyFile(
  new URL("LICENSE.txt", source),
  new URL("LICENSE.txt", destination),
);
console.log("MapLibre worker and shared module prepared locally.");
