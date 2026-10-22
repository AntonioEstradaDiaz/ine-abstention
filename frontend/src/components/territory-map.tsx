"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { LocateFixed, MapPin, RotateCcw, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { pct, riskColors, riskLabels } from "@/lib/utils";
import { createMapSelection } from "@/lib/map-selection-layer";
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
  if (!threeD) {
    map.fitBounds(MEXICO_BOUNDS, {
      padding: { top: 40, bottom: 82, left: 35, right: 35 },
      pitch: 0,
      bearing: 0,
      duration,
    });
    return;
  }
  const camera = map.cameraForBounds(MEXICO_BOUNDS, {
    padding: { top: 35, bottom: 90, left: 30, right: 30 },
    bearing: -12,
  });
  if (!camera) return;
  map.easeTo({
    ...camera,
    zoom: camera.zoom ?? map.getZoom(),
    pitch: 42,
    bearing: -12,
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
  onFilter,
}: {
  rows: MapDatum[];
  selected: string;
  onSelect: (code: string) => void;
  filter: Risk | "all";
  historical: boolean;
  onFilter: (risk: Risk | "all") => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelect);
  const calloutRef = useRef<HTMLDivElement>(null);
  const selectionLayer = useRef<ReturnType<typeof createMapSelection> | null>(
    null,
  );
  const [expanded, setExpanded] = useState(false);
  const selectedRow = rows.find((r) => r.state_code === selected);
  const titleCase = (name: string) =>
    name
      .toLocaleLowerCase("es-MX")
      .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
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
    if (!expanded) return;
    const original = document.body.style.overflow;
    const panel = container.current?.closest<HTMLElement>(
      ".electoral-map-panel",
    );
    const role = panel?.getAttribute("role");
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    panel?.setAttribute("role", "dialog");
    panel?.setAttribute("aria-modal", "true");
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        container.current
          ?.querySelector<HTMLButtonElement>(".maplibregl-ctrl-shrink")
          ?.click();
      if (event.key === "Tab" && panel) {
        const controls = [
          ...panel.querySelectorAll<HTMLElement>(
            "button:not(:disabled), select:not(:disabled), a[href], [tabindex='0']",
          ),
        ].filter((el) => el.getClientRects().length > 0);
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", keys);
      if (role) panel?.setAttribute("role", role);
      else panel?.removeAttribute("role");
      panel?.removeAttribute("aria-modal");
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [expanded]);
  useEffect(() => {
    if (!container.current || !geo.data) return;
    const mapPanel = container.current.closest(".electoral-map-panel");
    let cancelled = false;
    let instance: MapLibreMap | undefined;
    const resize = new ResizeObserver(() => instance?.resize());
    resize.observe(container.current);
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
                color: "#FFF4DF",
                intensity: 0.72,
                position: [1.5, 210, 32],
              },
              sources: {},
              layers: [
                {
                  id: "ocean",
                  type: "background",
                  paint: {
                    "background-color": "#0D1D30",
                    "background-opacity": 0,
                  },
                },
              ],
            },
            center: [-102, 24],
            zoom: 3.5,
            attributionControl: false,
            pitch: modeRef.current ? 42 : 0,
            bearing: modeRef.current ? -12 : 0,
            maxPitch: 65,
            dragRotate: true,
            pitchWithRotate: true,
            touchPitch: true,
            locale: {
              "NavigationControl.ZoomIn": "Acercar",
              "NavigationControl.ZoomOut": "Alejar",
              "NavigationControl.ResetBearing": "Orientar al norte",
              "FullscreenControl.Enter": "Ampliar mapa",
              "FullscreenControl.Exit": "Reducir mapa",
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
          const full = new maplibre.FullscreenControl({
            container:
              container.current.closest<HTMLElement>(".electoral-map-panel") ??
              container.current,
            pseudo: true,
          });
          full.on("fullscreenstart", () => {
            setExpanded(true);
            requestAnimationFrame(() => {
              if (!cancelled && instance)
                frameMexico(instance, modeRef.current, 0);
            });
          });
          full.on("fullscreenend", () => {
            setExpanded(false);
            requestAnimationFrame(() => {
              if (!cancelled && instance)
                frameMexico(instance, modeRef.current, 0);
            });
          });
          instance.addControl(full, "top-right");
          frameMexico(instance, modeRef.current, 0);
          instance.on("movestart", () => {
            if (!cancelled) setMoving(true);
          });
          instance.on("moveend", () => {
            if (!cancelled) setMoving(false);
          });
          instance.on("resize", () => {
            if (!cancelled && instance)
              frameMexico(instance, modeRef.current, 0);
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
            selectionLayer.current = createMapSelection((x, y, visible) => {
              const callout = calloutRef.current;
              const element = container.current;
              if (!callout || !element) return;
              callout.style.left = `${x}px`;
              callout.style.top = `${y}px`;
              callout.dataset.visible = String(visible);
              callout.dataset.align =
                x < 130
                  ? "left"
                  : x > element.clientWidth - 130
                    ? "right"
                    : "center";
              callout.dataset.below = String(y < 175);
              callout.setAttribute("aria-hidden", String(!visible));
            });
            instance.addLayer(selectionLayer.current.layer);
            instance.on(
              "click",
              ["states-fill", "states-extrusion"],
              (event) => {
                const code = event.features?.[0]?.properties?.cvegeo;
                if (typeof code === "string") selectRef.current(code);
              },
            );
            instance.on(
              "mousemove",
              ["states-fill", "states-extrusion"],
              () => {
                if (instance) instance.getCanvas().style.cursor = "pointer";
              },
            );
            instance.on(
              "mouseleave",
              ["states-fill", "states-extrusion"],
              () => {
                if (instance) instance.getCanvas().style.cursor = "";
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
      resize.disconnect();
      instance?.remove();
      mapPanel?.classList.remove("maplibregl-pseudo-fullscreen");
      selectionLayer.current = null;
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
            ? v != null && v >= 0.65
              ? "#c00063"
              : riskColors[row.risk]
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
    const selectedFeature = geo.data.features.find(
      (f) => String(f.properties?.cvegeo) === selected,
    );
    const row = rows.find((r) => r.state_code === selected);
    const hidden = !historical && filter !== "all" && row?.risk !== filter;
    const altitude =
      threeD && row?.value != null
        ? Math.max(0, Math.min(1, row.value)) * 300_000
        : 0;
    selectionLayer.current?.update(
      hidden ? undefined : selectedFeature,
      altitude,
    );
    map.triggerRepaint();
  }, [loaded, geo.data, rows, selected, filter, historical, threeD]);
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
      threeD ? 0.04 : 0.9,
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
        aria-label="Mapa interactivo de los 32 estados. También puedes seleccionar un territorio desde Filtros."
      />
      {(!ready || geo.isError || mapError) && (
        <div className="map-status" role="status">
          <MapPin size={24} />
          <span>
            {geo.isError || mapError
              ? "Mapa no disponible. Usa Filtros para seleccionar un estado."
              : "Cargando cartografía oficial…"}
          </span>
          {geo.isError && (
            <Button variant="outline" onClick={() => void geo.refetch()}>
              Reintentar mapa
            </Button>
          )}
        </div>
      )}
      {selectedRow && (
        <div
          ref={calloutRef}
          className="map-selected-marker"
          data-visible="false"
          role="status"
          aria-label="Estado seleccionado en el mapa"
        >
          <div className="map-selection-card">
            <strong>{titleCase(selectedRow.name)}</strong>
            {selectedRow.risk && (
              <div className={`map-selection-risk ${selectedRow.risk}`}>
                <span /> Riesgo{" "}
                {riskLabels[selectedRow.risk].toLocaleLowerCase("es-MX")}
              </div>
            )}
            <p>
              Abstención: <b>{pct(selectedRow.value)}</b>
            </p>
            <small>
              {historical
                ? "Datos históricos observados"
                : "Estimación 2027 · experimental"}
            </small>
          </div>
          <span className="map-selection-stem" />
        </div>
      )}
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
      </div>
      <Button
        variant="outline"
        className="map-restore"
        aria-label="Ver todo México"
        disabled={!loaded}
        onClick={() => {
          if (mapRef.current)
            frameMexico(mapRef.current, threeD, motionDuration());
        }}
      >
        <LocateFixed size={18} /> Restablecer vista
      </Button>
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
        </>
      )}
      <div className="compact-map-legend" aria-label="Leyenda del mapa">
        {historical ? (
          <>
            <strong>Abstención</strong>
            <span>Menor</span>
            <span className="gradient-legend" />
            <span>Mayor</span>
          </>
        ) : (
          <>
            <strong>Nivel de riesgo:</strong>
            {(["low", "medium", "high"] as Risk[]).map((r) => (
              <button
                key={r}
                aria-pressed={filter === r}
                onClick={() => onFilter(filter === r ? "all" : r)}
              >
                <i style={{ background: riskColors[r] }} />
                {riskLabels[r]}
              </button>
            ))}
            <span title="Referencia visual: abstención estimada desde 65%. El modelo conserva sus tres categorías originales.">
              <i style={{ background: "#c00063" }} />
              Crítico ≥65%
            </span>
          </>
        )}
      </div>
      {threeD && (
        <div className="compact-height-key">
          Altura: abstención (%) · escala exagerada
        </div>
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
