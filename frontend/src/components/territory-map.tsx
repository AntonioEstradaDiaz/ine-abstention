"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { Expand, MapPin } from "lucide-react";
import { Button } from "./ui/button";
import { pct, riskColors } from "@/lib/utils";
import type { Risk } from "@/lib/types";

export interface MapDatum {
  state_code: string;
  name: string;
  value: number | null;
  risk?: Risk;
}
export function TerritoryMap({
  rows,
  selected,
  onSelect,
  filter,
  historical,
}: {
  rows: MapDatum[];
  selected: string;
  onSelect: (code: string) => void;
  filter: Risk | "all";
  historical: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelect);
  const rowsRef = useRef(rows);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const geo = useQuery({
    queryKey: ["inegi-geometry"],
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const r = await fetch("/geo/estados.geojson", { signal });
      if (!r.ok) throw new Error("Cartografía no disponible");
      return (await r.json()) as FeatureCollection;
    },
  });
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  useEffect(() => {
    if (!container.current || !geo.data) return;
    let cancelled = false;
    let instance: MapLibreMap | undefined;
    setLoaded(false);
    setReady(false);
    setMapError(false);
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled || !container.current) return;
        try {
          maplibre.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
          instance = new maplibre.Map({
            container: container.current,
            style: {
              version: 8,
              sources: {},
              layers: [
                {
                  id: "ocean",
                  type: "background",
                  paint: { "background-color": "#101b2b" },
                },
              ],
            },
            center: [-102, 24],
            zoom: 3.5,
            attributionControl: false,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            locale: {
              "NavigationControl.ZoomIn": "Acercar",
              "NavigationControl.ZoomOut": "Alejar",
            },
          });
          mapRef.current = instance;
          instance.addControl(
            new maplibre.NavigationControl({ showCompass: false }),
            "bottom-left",
          );
          instance.fitBounds(
            [
              [-118.5, 14],
              [-86, 33],
            ],
            { padding: 35, duration: 0 },
          );
          instance.on("load", () => {
            if (!instance || cancelled) return;
            instance.addSource("states", {
              type: "geojson",
              data: geo.data!,
              promoteId: "cvegeo",
            });
            instance.addLayer({
              id: "states-fill",
              type: "fill",
              source: "states",
              paint: {
                "fill-color": [
                  "coalesce",
                  ["feature-state", "color"],
                  "#29384B",
                ],
                "fill-opacity": [
                  "case",
                  ["boolean", ["feature-state", "dim"], false],
                  0.18,
                  0.78,
                ],
              },
            });
            instance.addLayer({
              id: "states-border",
              type: "line",
              source: "states",
              paint: { "line-color": "#0B1220", "line-width": 1 },
            });
            instance.addLayer({
              id: "selected-border",
              type: "line",
              source: "states",
              filter: ["==", ["get", "cvegeo"], ""],
              paint: { "line-color": "#F1F5F9", "line-width": 2.5 },
            });
            instance.on("click", "states-fill", (event) => {
              const code = event.features?.[0]?.properties?.cvegeo;
              if (typeof code === "string") selectRef.current(code);
            });
            const popup = new maplibre.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 12,
            });
            instance.on("mousemove", "states-fill", (event) => {
              if (!instance) return;
              instance.getCanvas().style.cursor = "pointer";
              const p = event.features?.[0]?.properties;
              const row = rowsRef.current.find(
                (r) => r.state_code === p?.cvegeo,
              );
              const content = document.createElement("div");
              content.textContent = `${row?.name || p?.nomgeo || "Estado"} · ${pct(row?.value)}`;
              popup
                .setLngLat(event.lngLat)
                .setDOMContent(content)
                .addTo(instance);
            });
            instance.on("mouseleave", "states-fill", () => {
              if (instance) instance.getCanvas().style.cursor = "";
              popup.remove();
            });
            setLoaded(true);
          });
          instance.on("idle", () => {
            if (
              !cancelled &&
              instance?.getLayer("states-fill") &&
              instance.isSourceLoaded("states") &&
              instance.queryRenderedFeatures({ layers: ["states-fill"] })
                .length > 0
            )
              setReady(true);
          });
          instance.on("error", (event) => {
            console.error("Cartografía:", event.error);
            setMapError(true);
          });
        } catch {
          setMapError(true);
        }
      })
      .catch(() => setMapError(true));
    return () => {
      cancelled = true;
      instance?.remove();
      mapRef.current = null;
    };
  }, [geo.data]);
  useEffect(() => {
    const map = mapRef.current;
    if (!loaded || !map || !geo.data) return;
    // Styling changes update only 32 feature states, never resend the 28 MB polygons.
    for (const feature of geo.data.features) {
      const id = String(feature.properties?.cvegeo);
      const row = rows.find((r) => r.state_code === id);
      const v = row?.value;
      const color =
        historical && v != null
          ? `hsl(269, 36%, ${27 + v * 38}%)`
          : row?.risk
            ? riskColors[row.risk]
            : "#29384B";
      map.setFeatureState(
        { source: "states", id },
        { color, dim: !historical && filter !== "all" && row?.risk !== filter },
      );
    }
    map.setFilter("selected-border", ["==", ["get", "cvegeo"], selected]);
  }, [loaded, geo.data, rows, selected, filter, historical]);
  return (
    <div className="map-wrap" data-map-ready={ready && !mapError}>
      <div
        ref={container}
        className="territory-map"
        role="region"
        aria-label="Mapa interactivo de los 32 estados. También puedes seleccionar un territorio en la lista."
      />
      {(!ready || geo.isError || mapError) && (
        <div className="map-status" role="status">
          <MapPin size={24} />
          <span>
            {geo.isError || mapError
              ? "Mapa no disponible. Usa la lista de estados para explorar los datos."
              : "Cargando cartografía oficial…"}
          </span>
          {geo.isError && (
            <Button variant="outline" onClick={() => void geo.refetch()}>
              Reintentar mapa
            </Button>
          )}
        </div>
      )}
      <div className="map-watermark">
        MÉXICO<span>32 entidades federativas</span>
      </div>
      <Button
        variant="outline"
        size="icon"
        className="map-reset"
        aria-label="Ver todo México"
        onClick={() =>
          mapRef.current?.fitBounds(
            [
              [-118.5, 14],
              [-86, 33],
            ],
            {
              padding: 35,
              duration: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? 0
                : 300,
            },
          )
        }
      >
        <Expand size={16} />
      </Button>
      <div className="map-attribution">
        <a
          href="https://www.inegi.org.mx/servicios/catalogoUnico.html"
          target="_blank"
          rel="noreferrer"
        >
          Geografía: INEGI
        </a>{" "}
        · Límites geoestadísticos de referencia
      </div>
    </div>
  );
}
