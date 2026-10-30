"use client";
import { Map, PersonStanding, Route, Milestone, FileText, ClipboardList } from "lucide-react";
import { Notifications, type Notice } from "./notifications";
import { ElectoralKpis } from "./electoral-kpis";
import { DashboardSelect } from "./ui/dashboard-select";
import type { Prediction } from "@/lib/types";
const imgBell = "/design-top/7872e.svg";
const imgCalendarDays = "/design-top/b20a3.svg";
const imgNotificacionNueva = "/design-top/4054b.svg";
const imgSearch = "/design-top/9128a.svg";
const imgSlidersHorizontal = "/design-top/d692b.svg";
type View =
  | "map"
  | "trends"
  | "ml"
  | "predictions"
  | "scenarios"
  | "laboratory"
  | "reports"
  | "data";
export interface PageHeading {
  lead: string;
  highlight: string;
  subtitle: string;
}
interface Props {
  states?: Prediction[];
  selected?: string;
  view: View;
  heading?: PageHeading;
  // Replaces the search tools beside the title; null leaves the space empty.
  aside?: React.ReactNode;
  notices?: Notice[];
  search: string;
  year: number;
  elections: Array<{ id: number; year: number }>;
  filtersOpen: boolean;
  onNavigate: (view: View) => void;
  onSearch: (value: string) => void;
  onYear: (value: number) => void;
  onFilters: () => void;
  onSearchSubmit: () => void;
}
export function DesignTop({
  states,
  selected,
  view,
  heading,
  aside,
  notices,
  search,
  year,
  elections,
  filtersOpen,
  onNavigate,
  onSearch,
  onYear,
  onFilters,
  onSearchSubmit,
}: Props) {
  return (
    <div className="design-top">
      <div
        className="bg-white content-stretch flex h-[68px] items-center justify-between overflow-clip px-[40px] relative shrink-0 w-full"
        data-node-id="10:12475"
        data-name="Navegación principal"
      >
        <div
          className="content-stretch flex flex-col items-start overflow-clip relative shrink-0 w-[185px]"
          data-node-id="10:12476"
          data-name="Instituto Nacional Electoral"
        >
          <img
            src="/brand/ine-institucional.png"
            alt="INE · Instituto Nacional Electoral"
            className="ine-brand-logo"
            width={960}
            height={296}
          />
        </div>
        <nav
          aria-label="Secciones principales"
          className="content-stretch flex gap-[17px] items-center overflow-clip relative shrink-0"
          data-node-id="10:12481"
          data-name="Secciones"
        >
          <button
            type="button"
            aria-label="Mapa de riesgo"
            aria-current={view === "map" ? "page" : undefined}
            onClick={() => onNavigate("map")}
            className="bg-[#fce7f2] border-[#e5007e] border-b-3 border-solid content-stretch flex gap-[13px] h-[41px] items-center overflow-clip px-[26px] relative rounded-[9px] shrink-0"
            data-node-id="10:12482"
            data-name="Sección"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13385"
              data-name="map"
            >
              <Map className="nav-section-icon" aria-hidden="true" />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#e5007e] text-[12px] whitespace-nowrap"
              data-node-id="10:12484"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              Mapa
            </p>
          </button>
          <button
            type="button"
            aria-label="Análisis IA"
            aria-current={
              view === "ml" || view === "laboratory" ? "page" : undefined
            }
            onClick={() => onNavigate("ml")}
            className="bg-white border-0 border-solid border-white content-stretch flex gap-[13px] h-[41px] items-center overflow-clip px-[13px] relative rounded-[9px] shrink-0"
            data-node-id="10:12485"
            data-name="Sección"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13388"
              data-name="person-standing"
            >
              <PersonStanding className="nav-section-icon" aria-hidden="true" />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#101016] text-[12px] whitespace-nowrap"
              data-node-id="10:12487"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              Análisis
            </p>
          </button>
          <button
            type="button"
            aria-label="Predicciones"
            aria-current={view === "predictions" ? "page" : undefined}
            onClick={() => onNavigate("predictions")}
            className="bg-white border-0 border-solid border-white content-stretch flex gap-[13px] h-[41px] items-center overflow-clip px-[13px] relative rounded-[9px] shrink-0"
            data-node-id="10:12488"
            data-name="Sección"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13391"
              data-name="route"
            >
              <Route className="nav-section-icon" aria-hidden="true" />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#101016] text-[12px] whitespace-nowrap"
              data-node-id="10:12490"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              Predicciones
            </p>
          </button>
          <button
            type="button"
            aria-label="Escenarios"
            aria-current={view === "scenarios" ? "page" : undefined}
            onClick={() => onNavigate("scenarios")}
            className="bg-white border-0 border-solid border-white content-stretch flex gap-[13px] h-[41px] items-center overflow-clip px-[13px] relative rounded-[9px] shrink-0"
            data-node-id="10:12491"
            data-name="Sección"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13394"
              data-name="milestone"
            >
              <Milestone className="nav-section-icon" aria-hidden="true" />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#101016] text-[12px] whitespace-nowrap"
              data-node-id="10:12493"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              Escenarios
            </p>
          </button>
          <button
            type="button"
            aria-label="Reportes"
            aria-current={view === "reports" ? "page" : undefined}
            onClick={() => onNavigate("reports")}
            className="bg-white border-0 border-solid border-white content-stretch flex gap-[13px] h-[41px] items-center overflow-clip px-[13px] relative rounded-[9px] shrink-0"
            data-node-id="10:12494"
            data-name="Sección"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13397"
              data-name="file-text"
            >
              <FileText className="nav-section-icon" aria-hidden="true" />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#101016] text-[12px] whitespace-nowrap"
              data-node-id="10:12496"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              Reportes
            </p>
          </button>
          <button
            type="button"
            aria-label="Datos"
            aria-current={view === "data" ? "page" : undefined}
            onClick={() => onNavigate("data")}
            className="bg-white border-0 border-solid border-white content-stretch flex gap-[13px] h-[41px] items-center overflow-clip px-[13px] relative rounded-[9px] shrink-0"
            data-node-id="10:12497"
            data-name="Sección"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13400"
              data-name="clipboard-list"
            >
              <ClipboardList className="nav-section-icon" aria-hidden="true" />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#101016] text-[12px] whitespace-nowrap"
              data-node-id="10:12499"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              Datos
            </p>
          </button>
        </nav>
        <div
          className="content-stretch flex gap-[20px] items-center overflow-clip relative shrink-0"
          data-node-id="10:12500"
          data-name="Proceso y perfil"
        >
          <div
            className="border border-[#e8ecf1] border-solid content-stretch flex gap-[12px] h-[41px] items-center overflow-clip px-[14px] relative rounded-[9px] shrink-0 w-[235px]"
            data-node-id="10:12501"
            data-name="Selector de proceso electoral"
          >
            <div
              className="relative shrink-0 size-[18px]"
              data-node-id="10:13403"
              data-name="calendar-days"
            >
              <img
                alt=""
                className="absolute block inset-0 max-w-none size-full"
                src={imgCalendarDays}
              />
            </div>
            <p
              className="[word-break:break-word] font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#0d172f] text-[12px] whitespace-nowrap"
              data-node-id="10:12503"
              style={{ fontVariationSettings: '"wdth" 100' }}
            >
              <DashboardSelect
                aria-label="Proceso electoral de referencia"
                value={year}
                onChange={(e) => onYear(Number(e.target.value))}
              >
                {elections.map((e) => (
                  <option key={e.id} value={e.year}>
                    Proceso Electoral {e.year}
                  </option>
                ))}
              </DashboardSelect>
            </p>
          </div>
          <Notifications
            notices={notices ?? []}
            bellIcon={imgBell}
            dotIcon={imgNotificacionNueva}
            onOpenView={(next) => onNavigate(next as View)}
          />
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="auth-logout"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M9 5H5v14h4M13 7l5 5-5 5M9 12h10" />
              </svg>
            </button>
          </form>
        </div>
      </div>
      <nav className="mobile-section-nav" aria-label="Navegación de secciones">
        <DashboardSelect
          aria-label="Sección de la aplicación"
          value={view}
          onChange={(event) => onNavigate(event.target.value as View)}
        >
          <option value="map">Mapa de riesgo</option>
          <option value="trends">Tendencias</option>
          <option value="ml">Análisis IA</option>
          <option value="laboratory">Laboratorio de modelos</option>
          <option value="predictions">Predicciones</option>
          <option value="scenarios">Escenarios</option>
          <option value="reports">Reportes</option>
          <option value="data">Datos</option>
        </DashboardSelect>
      </nav>
      <div
        className="content-stretch flex flex-col gap-[13px] items-start overflow-clip pb-[27px] pt-[23px] px-[40px] relative shrink-0 w-full"
        data-node-id="10:12511"
        data-name="Panel electoral"
        hidden={!heading}
      >
        <div
          className="content-stretch flex flex-col gap-[15px] h-[182px] items-start relative shrink-0 w-full"
          data-node-id="10:12512"
          data-name="Resumen electoral"
        >
          <div
            className="content-stretch flex h-[57px] items-center justify-between px-[8px] relative shrink-0 w-full"
            data-node-id="10:12513"
            data-name="Encabezado y búsqueda"
          >
            <div
              className="[word-break:break-word] content-stretch flex flex-col items-start overflow-clip relative shrink-0 w-[850px]"
              data-node-id="10:12514"
              data-name="Título del panel"
            >
              <p
                className="font-['Roboto:Bold'] font-bold leading-[0] relative shrink-0 text-[#0d172f] text-[34px] w-full"
                data-node-id="10:12515"
                style={{ fontVariationSettings: '"wdth" 100' }}
              >
                <span className="leading-[normal]">{`${heading?.lead} `}</span>
                <span className="leading-[normal] text-[#e5007e]">
                  {heading?.highlight}
                </span>
              </p>
              <p
                className="font-['Roboto:Regular'] font-normal leading-[normal] relative shrink-0 text-[#596d8d] text-[16px] w-full"
                data-node-id="10:12516"
                style={{ fontVariationSettings: '"wdth" 100' }}
              >
                {heading?.subtitle}
              </p>
            </div>
            {aside !== undefined ? (
              aside
            ) : (
              <div
                className="content-stretch flex gap-[18px] items-center overflow-clip relative shrink-0"
                data-node-id="10:12517"
                data-name="Herramientas de búsqueda"
              >
                <div
                  className="bg-white border border-[#dce2eb] border-solid content-stretch flex gap-[15px] h-[42px] items-center overflow-clip px-[15px] relative rounded-[9px] shrink-0 w-[364px]"
                  data-node-id="10:12518"
                  data-name="Buscar territorio"
                >
                  <div
                    className="relative shrink-0 size-[19px]"
                    data-node-id="10:13412"
                    data-name="search"
                  >
                    <img
                      alt=""
                      className="absolute block inset-0 max-w-none size-full"
                      src={imgSearch}
                    />
                  </div>
                  <input
                    aria-label="Buscar territorio"
                    className="min-w-0 flex-1 bg-transparent font-['Roboto:Regular'] text-[12px] text-[#0d172f] outline-none placeholder:text-[#596d8d]"
                    onChange={(event) => onSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && search.trim())
                        onSearchSubmit();
                    }}
                    placeholder="Buscar estado, municipio o sección..."
                    value={search}
                  />
                </div>
                <button
                  className="bg-white border border-[#dce2eb] border-solid content-stretch flex gap-[10px] h-[42px] items-center justify-center overflow-clip relative rounded-[9px] shrink-0 w-[108px] cursor-pointer hover:bg-[#fdf0f7]"
                  data-node-id="10:12521"
                  data-name="Filtros"
                  onClick={onFilters}
                  aria-expanded={filtersOpen}
                  aria-controls="dashboard-filters"
                >
                  <div
                    className="relative shrink-0 size-[21px]"
                    data-node-id="10:13415"
                    data-name="sliders-horizontal"
                  >
                    <img
                      alt=""
                      className="absolute block inset-0 max-w-none size-full"
                      src={imgSlidersHorizontal}
                    />
                  </div>
                  <p
                    className="[word-break:break-word] font-['Roboto:Bold'] font-bold leading-[normal] relative shrink-0 text-[#0d172f] text-[13px] whitespace-nowrap"
                    data-node-id="10:12523"
                    style={{ fontVariationSettings: '"wdth" 100' }}
                  >
                    Filtros
                  </p>
                </button>
              </div>
            )}
          </div>
          {view === "map" && (
            <ElectoralKpis states={states} selected={selected} />
          )}
        </div>
      </div>
    </div>
  );
}
