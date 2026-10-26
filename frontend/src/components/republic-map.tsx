"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection, Position } from "geojson";
import { geometryQuery } from "@/lib/geometry";
import type { Risk } from "@/lib/types";
import { riskColors } from "@/lib/utils";

type Ring = Array<[number, number]>;
interface Shape {
  code: string;
  name: string;
  rings: Ring[];
  box: [number, number, number, number];
}
// Same equirectangular look as the 3D map at Mexico's latitude.
const SCALE_X = Math.cos((23.5 * Math.PI) / 180);
const cache = new WeakMap<FeatureCollection, Shape[]>();

function simplify(ring: Ring, tolerance: number): Ring {
  const out: Ring = [ring[0]];
  for (let i = 1; i < ring.length - 1; i++) {
    const [x, y] = ring[i];
    const [px, py] = out[out.length - 1];
    if (Math.abs(x - px) + Math.abs(y - py) >= tolerance) out.push(ring[i]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}

// Projects INEGI polygons once and keeps a light copy for SVG drawing.
function shapes(geo: FeatureCollection): Shape[] {
  const known = cache.get(geo);
  if (known) return known;
  const result = geo.features.flatMap((feature) => {
    const g = feature.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) return [];
    const polygons: Position[][][] =
      g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const box: Shape["box"] = [Infinity, Infinity, -Infinity, -Infinity];
    const rings = polygons.flatMap((polygon) =>
      polygon.map((ring) => {
        const projected = ring.map(
          ([lon, lat]) => [lon * SCALE_X, -lat] as [number, number],
        );
        for (const [x, y] of projected) {
          box[0] = Math.min(box[0], x);
          box[1] = Math.min(box[1], y);
          box[2] = Math.max(box[2], x);
          box[3] = Math.max(box[3], y);
        }
        return simplify(projected, 0.004);
      }),
    );
    return [
      {
        code: String(feature.properties?.cvegeo ?? ""),
        name: String(feature.properties?.nomgeo ?? ""),
        rings,
        box,
      },
    ];
  });
  cache.set(geo, result);
  return result;
}

const toPath = (rings: Ring[], tolerance: number) =>
  rings
    .map((ring) => simplify(ring, tolerance))
    .filter((ring) => ring.length > 3)
    .map(
      (ring) =>
        `M${ring.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join("L")}Z`,
    )
    .join("");

export function RepublicMap({
  risks,
  selected,
  focus = false,
  label,
  className = "",
}: {
  risks: Record<string, Risk | undefined>;
  selected?: string;
  focus?: boolean;
  label: string;
  className?: string;
}) {
  const geo = useQuery(geometryQuery);
  const drawing = useMemo(() => {
    if (!geo.data) return null;
    const all = shapes(geo.data);
    const target = focus ? all.find((s) => s.code === selected) : undefined;
    const box = target
      ? target.box
      : all.reduce<Shape["box"]>(
          (b, s) => [
            Math.min(b[0], s.box[0]),
            Math.min(b[1], s.box[1]),
            Math.max(b[2], s.box[2]),
            Math.max(b[3], s.box[3]),
          ],
          [Infinity, Infinity, -Infinity, -Infinity],
        );
    const pad =
      Math.max(box[2] - box[0], box[3] - box[1]) * (target ? 0.22 : 0.06);
    const view = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad];
    const tolerance = (view[2] - view[0]) / 520;
    const visible = all.filter(
      (s) =>
        s.box[2] >= view[0] &&
        s.box[0] <= view[2] &&
        s.box[3] >= view[1] &&
        s.box[1] <= view[3],
    );
    return {
      viewBox: `${view[0]} ${view[1]} ${view[2] - view[0]} ${view[3] - view[1]}`,
      states: visible.map((s) => ({
        code: s.code,
        name: s.name,
        d: toPath(s.rings, tolerance),
      })),
    };
  }, [geo.data, selected, focus]);
  return (
    <figure
      className={`republic-map ${className}`}
      data-focus={focus ? "true" : "false"}
    >
      {drawing ? (
        <svg viewBox={drawing.viewBox} role="img" aria-label={label}>
          <g className="republic-map-states">
            {drawing.states.map((s) => {
              const risk = risks[s.code];
              const dim = focus && s.code !== selected;
              return (
                <path
                  key={s.code}
                  d={s.d}
                  fill={dim ? "#dfe8f0" : risk ? riskColors[risk] : "#29384B"}
                  data-selected={s.code === selected ? "true" : undefined}
                >
                  <title>{s.name}</title>
                </path>
              );
            })}
            {drawing.states
              .filter((s) => s.code === selected)
              .map((s) => (
                <path
                  key="selected"
                  className="republic-map-selected"
                  d={s.d}
                />
              ))}
          </g>
        </svg>
      ) : (
        <div className="republic-map-loading" role="status">
          {geo.isError
            ? "Cartografía no disponible"
            : "Cargando cartografía oficial…"}
        </div>
      )}
      <figcaption>Geografía: INEGI · límites de referencia</figcaption>
    </figure>
  );
}
