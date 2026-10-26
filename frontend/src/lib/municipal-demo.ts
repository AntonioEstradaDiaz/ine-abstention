import stateCatalog from "./analysis-states.json";

// Illustrative municipal sample shared by Análisis and Datos; not official INE figures.
export type AnalysisData = {
  rates: number[];
  count: number | null;
  names: string[];
  values: number[];
  changes: number[];
};
export const municipalDemo: Record<string, AnalysisData> = {
  ...Object.fromEntries(
    stateCatalog.map((state) => [
      state.name,
      { rates: state.rates, count: null, names: [], values: [], changes: [] },
    ]),
  ),
  Guerrero: {
    rates: [58.4, 54, 60.8],
    count: 85,
    names: ["Chilpancingo", "Iguala", "Taxco", "Acapulco", "Chilapa"],
    values: [65.2, 63.1, 61.4, 58.6, 56.8],
    changes: [3.1, 2.8, 1.9, 1.9, 0.6],
  },
  Morelos: {
    rates: [62.5, 57.8, 64.1],
    count: 36,
    names: ["Cuernavaca", "Jiutepec", "Cuautla", "Temixco", "Yautepec"],
    values: [67.2, 65.1, 63.8, 61.4, 59.6],
    changes: [2.8, 2.5, 1.6, 1.4, 0.8],
  },
  "Baja California": {
    rates: [52.7, 48.2, 55.1],
    count: 7,
    names: ["Mexicali", "Ensenada", "Tecate", "Tijuana", "Playas de Rosarito"],
    values: [59.5, 57.8, 55.2, 52.4, 50.6],
    changes: [3.2, 2.1, 1.8, 2.5, 0.9],
  },
};
