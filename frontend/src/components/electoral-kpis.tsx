"use client";
import { useId } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
const metrics = [
  {
    title: "Participación estimada",
    value: "58.3%",
    reference: "8.5% esperado",
    change: "-2.1 pp",
    down: true,
    icon: "9c63f.svg",
    chart: "line",
  },
  {
    title: "Zonas en riesgo de abstención",
    value: "428",
    reference: "7.1% del total",
    change: "+2.3%",
    icon: "b08fb.svg",
    chart: "bars",
  },
  {
    title: "Municipios prioritarios",
    value: "1,254",
    reference: "5.8% del total",
    change: "+12.6%",
    icon: "d19fd.svg",
    chart: "dots",
  },
  {
    title: "Población potencialmente abstencionista",
    value: "18.6 M",
    reference: "4.9% del padrón",
    change: "+6.1%",
    icon: "9c63f.svg",
    chart: "line",
  },
];
export function ElectoralKpis() {
  const id = useId().replace(/:/g, "");
  return (
    <div className="reference-kpis" data-name="Indicadores clave">
      {metrics.map((metric, index) => (
        <article
          className="reference-kpi"
          data-name="Indicador electoral"
          key={metric.title}
          aria-label={metric.title}
        >
          <div
            className={`reference-kpi-icon reference-kpi-icon-${metric.chart}`}
          >
            <img src={`/design-top/${metric.icon}`} alt="" />
            {metric.chart === "bars" && (
              <span className="reference-kpi-alert" aria-hidden="true">
                !
              </span>
            )}
          </div>
          <div className="reference-kpi-body">
            <p className="reference-kpi-title">{metric.title}</p>
            <div className="reference-kpi-details">
              <div className="reference-kpi-value">
                <strong>{metric.value}</strong>
                <span>{metric.reference}</span>
              </div>
              <div className="reference-kpi-change">
                <div>
                  {metric.down ? <ArrowDown /> : <ArrowUp />}
                  <strong>{metric.change}</strong>
                </div>
                <span>vs. 2021</span>
              </div>
              <div className="reference-kpi-chart" aria-hidden="true">
                {metric.chart === "line" ? (
                  <svg viewBox="0 0 110 62" preserveAspectRatio="none">
                    <defs>
                      <linearGradient
                        id={`${id}-${index}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor="#ed008c"
                          stopOpacity=".28"
                        />
                        <stop
                          offset="100%"
                          stopColor="#ed008c"
                          stopOpacity=".02"
                        />
                      </linearGradient>
                    </defs>
                    <path
                      d="M2 50 C18 44 22 19 44 27 S62 41 80 25 S98 15 106 10 L106 60 L2 60Z"
                      fill={`url(#${id}-${index})`}
                    />
                    <path
                      d="M2 50 C18 44 22 19 44 27 S62 41 80 25 S98 15 106 10"
                      fill="none"
                      stroke="#ed008c"
                      strokeWidth="1.8"
                    />
                    <circle
                      cx="106"
                      cy="10"
                      r="4.5"
                      fill="#ed008c"
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  </svg>
                ) : metric.chart === "bars" ? (
                  <svg viewBox="0 0 104 62" preserveAspectRatio="none">
                    {[18, 26, 32, 37, 48, 58].map((h, i) => (
                      <rect
                        key={h}
                        x={i * 18}
                        y={62 - h}
                        width="14"
                        height={h}
                        rx="2.5"
                        fill={
                          i === 5
                            ? "#df007b"
                            : [
                                "#ffd8ed",
                                "#ffc3e2",
                                "#ffacd7",
                                "#ff8dc9",
                                "#fa66b6",
                              ][i]
                        }
                      />
                    ))}
                  </svg>
                ) : (
                  <svg viewBox="0 0 104 66">
                    {Array.from({ length: 40 }, (_, i) => (
                      <circle
                        key={i}
                        cx={6 + (i % 8) * 13}
                        cy={6 + Math.floor(i / 8) * 13}
                        r="4.7"
                        fill={
                          i < 6
                            ? "#df007b"
                            : i < 13
                              ? "#ef55aa"
                              : i < 20
                                ? "#f7a6d1"
                                : "#e7e8ec"
                        }
                      />
                    ))}
                  </svg>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
