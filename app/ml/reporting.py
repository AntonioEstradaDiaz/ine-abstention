import csv
import json
import shutil
from pathlib import Path


def publish(report: dict, run_dir: Path, root: Path) -> None:
    (root / "docs/phase4_metrics.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    rows = []
    for name, model in report["models"].items():
        row = {"model_name": name}
        for phase in ("development", "holdout_2024"):
            for metric in ("mae_pp", "rmse_pp", "r_squared", "bias_pp", "weighted_mae_pp"):
                row[f"{phase}_{metric}"] = model[phase][metric]
        rows.append(row)
    with (root / "data/samples/ccpc_model_comparison.csv").open(
        "w", newline="", encoding="utf-8"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    shutil.copyfile(
        run_dir / "out_of_time_predictions.csv", root / "data/samples/ccpc_backtest_errors.csv"
    )
    lines = [
        "# Comparación temporal de modelos de abstención",
        "",
        f"Experimento: `{report['run_id']}`. Unidad territorial: entidad federativa.",
        f"Ejemplos supervisados: {report['supervised_rows']}; "
        f"excluidos: {report['excluded_rows']}.",
        "Los primeros procesos de cada tipo carecen de un antecedente comparable "
        "y no se inventan variables.",
        "",
        "## Cortes de validación",
        "",
        "| Entrenamiento: años objetivo | Prueba | Filas de entrenamiento | Filas de prueba |",
        "| --- | --- | ---: | ---: |",
    ]
    for fold in report["folds"]:
        lines.append(
            "| "
            + " | ".join(
                (
                    ", ".join(map(str, fold["train_target_years"])),
                    str(fold["test_year"]),
                    str(fold["train_rows"]),
                    str(fold["test_rows"]),
                )
            )
            + " |"
        )
    lines += [
        "",
        "## Comparación",
        "",
        "MAE y RMSE en puntos porcentuales. "
        "Cada estado tiene el mismo peso en la métrica principal.",
        "",
        "| Modelo | MAE desarrollo | MAE 2024 | RMSE 2024 | R² 2024 |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for name, model in report["models"].items():
        h = model["holdout_2024"]
        r2 = f"{h['r_squared']:.3f}" if h["r_squared"] is not None else "No definido"
        lines.append(
            "| "
            + " | ".join(
                (
                    name,
                    f"{model['development']['mae_pp']:.3f}",
                    f"{h['mae_pp']:.3f}",
                    f"{h['rmse_pp']:.3f}",
                    r2,
                )
            )
            + " |"
        )
    delta = report["selected_model_holdout_mae_delta_vs_baseline_pp"]
    selected = report["development_selected_model"]
    lines += [
        "",
        f"Selección congelada usando solo 2018 y 2021: **{selected}**.",
        f"Diferencia de MAE en 2024 frente a baseline_last: {delta:+.3f} pp.",
        "Una diferencia negativa favorece al seleccionado; una positiva favorece al baseline.",
        "2024 se usa para evaluación final; no se cambia el ganador después de ver ese resultado.",
        "",
        "## Métricas por elección",
        "",
        "| Año de prueba | Modelo | MAE (pp) | RMSE (pp) |",
        "| --- | --- | ---: | ---: |",
    ]
    for fold in report["folds"]:
        for model in fold["models"]:
            lines.append(
                "| "
                + " | ".join(
                    (
                        str(fold["test_year"]),
                        model["model_name"],
                        f"{model['metrics']['mae_pp']:.3f}",
                        f"{model['metrics']['rmse_pp']:.3f}",
                    )
                )
                + " |"
            )
    lines += [
        "",
        "## Interpretación y límites",
        "",
        "Los estados de una misma elección no son 32 réplicas temporales independientes.",
        "Solo hay dos bloques de desarrollo y un bloque final. La comparación es exploratoria.",
        "En el primer corte, el entrenamiento supervisado solo contiene elecciones intermedias; "
        "2018 es un tipo no observado durante ese ajuste.",
        "Se fijaron parámetros, semillas y procesamiento antes de calcular las métricas. "
        "No se usaron búsquedas sobre 2024 ni particiones aleatorias "
        "entre estados de una elección.",
        "El linaje de variables respeta años anteriores al objetivo. Sin embargo, "
        "las versiones históricas de publicación no están acreditadas. "
        "Es una validación retrospectiva por fecha electoral, "
        "no una recreación ex ante verificada.",
        "Los municipios están excluidos hasta homologarlos. NS y la cobertura de cuadernillos "
        "pueden sesgar la abstención observada.",
        "Los pesos finales se reajustaron con todos los ejemplos disponibles después de evaluar. "
        "Esos pesos no son los usados para producir el error de 2024; "
        "ambos se conservan separados.",
        "No se producen aún intervalos, efectos causales, predicciones de elecciones futuras "
        "ni una promoción automática a producción.",
        "",
        "## Reproducibilidad",
        "",
        "El JSON conserva parámetros, métricas, versiones, huellas de datos y código, "
        "fuentes oficiales y selección congelada. Los artefactos incluyen la instantánea, "
        "variables con linaje, modelos de cada corte, pesos finales y manifiesto SHA-256.",
        "El CSV `data/samples/ccpc_backtest_errors.csv` conserva cada error "
        "por entidad, año y modelo.",
        "Metodología y ejecución: `docs/phase4.md`.",
        "",
    ]
    (root / "docs/phase4_results.md").write_text("\n".join(lines), encoding="utf-8")
