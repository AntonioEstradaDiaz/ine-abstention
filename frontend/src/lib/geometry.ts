import type { FeatureCollection } from "geojson";

// One INEGI geometry query shared by the 3D map and every static map.
export const geometryQuery = {
  queryKey: ["inegi-geometry"],
  staleTime: Infinity,
  queryFn: async ({ signal }: { signal: AbortSignal }) => {
    const r = await fetch("/geo/estados.geojson", { signal });
    if (!r.ok) throw new Error("Cartografía no disponible");
    return (await r.json()) as FeatureCollection;
  },
};
