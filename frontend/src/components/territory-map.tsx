"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { Expand, MapPin, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { pct, riskColors } from "@/lib/utils";
import type { Risk } from "@/lib/types";

export interface MapDatum {
  state_code: string;
  name: string;
  value: number | null;
  risk?: Risk;
}
const MEXICO_BOUNDS: [[number, number], [number, number]] = [
  [-118.5, 14],
  [-86, 33],
];
function frameMexico(map: MapLibreMap, threeD: boolean, duration: number) {
  map.fitBounds(MEXICO_BOUNDS, {
    padding: threeD ? { top: 60, bottom: 55, left: 30, right: 30 } : 35,
    pitch: threeD ? 52 : 0,
    bearing: threeD ? -18 : 0,
    duration,
  });
}
const motionDuration = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;

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
  const [threeD, setThreeD] = useState(true);
  const modeRef = useRef(true);
  const initialFrame = useRef(true);
  const [moving, setMoving] = useState(false);
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
    initialFrame.current = true;
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
              light: {
                anchor: "viewport",
                color: "#EDF0FF",
                intensity: 0.65,
                position: [1.5, 210, 38],
              },
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
            pitch: modeRef.current ? 52 : 0,
            bearing: modeRef.current ? -18 : 0,
            maxPitch: 65,
            dragRotate: true,
            pitchWithRotate: true,
            touchPitch: true,
            locale: {
              "NavigationControl.ZoomIn": "Acercar",
              "NavigationControl.ZoomOut": "Alejar",
              "NavigationControl.ResetBearing": "Orientar al norte",
            },
          });
          mapRef.current = instance;
          instance.addControl(
            new maplibre.NavigationControl({
              showCompass: true,
              visualizePitch: true,
            }),
            "bottom-left",
          );
          frameMexico(instance, modeRef.current, 0);
          instance.on("movestart", () => {
            if (!cancelled) setMoving(true);
          });
          instance.on("moveend", () => {
            if (!cancelled) setMoving(false);
          });
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
              id: "states-extrusion",
              type: "fill-extrusion",
              source: "states",
              layout: { visibility: modeRef.current ? "visible" : "none" },
              paint: {
                "fill-extrusion-color": [
                  "coalesce",
                  ["feature-state", "color"],
                  "#29384B",
                ],
                "fill-extrusion-height": [
                  "case",
                  ["boolean", ["feature-state", "dim"], false],
                  0,
                  ["coalesce", ["feature-state", "height"], 0],
                ],
                "fill-extrusion-base": 0,
                "fill-extrusion-opacity": 0.96,
                "fill-extrusion-vertical-gradient": true,
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
            instance.on(
              "click",
              ["states-fill", "states-extrusion"],
              (event) => {
                const code = event.features?.[0]?.properties?.cvegeo;
                if (typeof code === "string") selectRef.current(code);
              },
            );
            const popup = new maplibre.Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 12,
            });
            instance.on(
              "mousemove",
              ["states-fill", "states-extrusion"],
              (event) => {
                if (!instance) return;
                instance.getCanvas().style.cursor = "pointer";
                const p = event.features?.[0]?.properties;
                const row = rowsRef.current.find(
                  (r) => r.state_code === p?.cvegeo,
                );
                const content = document.createElement("div");
                content.textContent = `${row?.name || p?.nomgeo || "Estado"} · ${pct(row?.value)} de abstención`;
                popup
                  .setLngLat(event.lngLat)
                  .setDOMContent(content)
                  .addTo(instance);
              },
            );
            instance.on(
              "mouseleave",
              ["states-fill", "states-extrusion"],
              () => {
                if (instance) instance.getCanvas().style.cursor = "";
                popup.remove();
              },
            );
            setLoaded(true);
          });
          instance.on("idle", () => {
            if (
              !cancelled &&
              instance?.getLayer("states-fill") &&
              instance.isSourceLoaded("states") &&
              instance.queryRenderedFeatures({
                layers: [modeRef.current ? "states-extrusion" : "states-fill"],
              }).length > 0
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
        {
          color,
          height:
            v == null || !Number.isFinite(v)
              ? 0
              : Math.max(0, Math.min(1, v)) * 300_000,
          dim: !historical && filter !== "all" && row?.risk !== filter,
        },
      );
    }
    map.setFilter("selected-border", ["==", ["get", "cvegeo"], selected]);
  }, [loaded, geo.data, rows, selected, filter, historical]);
  useEffect(() => {
    const map = mapRef.current;
    modeRef.current = threeD;
    if (!loaded || !map) return;
    map.setLayoutProperty(
      "states-extrusion",
      "visibility",
      threeD ? "visible" : "none",
    );
    map.setPaintProperty("states-fill", "fill-opacity", [
      "case",
      ["boolean", ["feature-state", "dim"], false],
      0.12,
      threeD ? 0.2 : 0.78,
    ]);
    if (threeD) {
      map.keyboard.enableRotation();
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.touchPitch.enable();
    } else {
      map.keyboard.disableRotation();
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.touchPitch.disable();
    }
    map.resize();
    frameMexico(map, threeD, initialFrame.current ? 0 : motionDuration());
    initialFrame.current = false;
  }, [loaded, threeD]);
  return (
    <div
      className="map-wrap"
      data-map-ready={ready && !mapError}
      data-map-mode={threeD ? "3d" : "2d"}
      data-camera-moving={moving}
    >
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
      <div
        className="map-view-controls"
        role="group"
        aria-label="Vista del mapa"
      >
        <Button
          size="sm"
          variant="outline"
          aria-pressed={!threeD}
          onClick={() => setThreeD(false)}
          disabled={!loaded}
        >
          2D
        </Button>
        <Button
          size="sm"
          variant="outline"
          aria-pressed={threeD}
          onClick={() => setThreeD(true)}
          disabled={!loaded}
        >
          3D
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="map-reset"
          aria-label="Ver todo México"
          disabled={!loaded}
          onClick={() => {
            if (mapRef.current)
              frameMexico(mapRef.current, threeD, motionDuration());
          }}
        >
          <Expand size={16} />
        </Button>
      </div>
      {threeD && (
        <>
          <div
            className="map-orbit-controls"
            role="group"
            aria-label="Orientación del mapa 3D"
          >
            <Button
              variant="outline"
              size="icon"
              disabled={!loaded}
              aria-label="Girar mapa a la izquierda"
              onClick={() => {
                const map = mapRef.current;
                if (map)
                  map.easeTo({
                    bearing: map.getBearing() - 20,
                    duration: motionDuration(),
                  });
              }}
            >
              <RotateCcw size={15} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={!loaded}
              aria-label="Girar mapa a la derecha"
              onClick={() => {
                const map = mapRef.current;
                if (map)
                  map.easeTo({
                    bearing: map.getBearing() + 20,
                    duration: motionDuration(),
                  });
              }}
            >
              <RotateCw size={15} />
            </Button>
          </div>
          <div className="map-height-caption">
            Altura = abstención · Escala visual exagerada
          </div>
        </>
      )}
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
