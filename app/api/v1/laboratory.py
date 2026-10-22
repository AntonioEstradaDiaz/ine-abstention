"""Lectura de resultados entrenados offline: no entrena ni carga pesos en la API."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from pydantic import ValidationError

from app.schemas.laboratory import LaboratoryReport

router = APIRouter(prefix="/ml", tags=["machine-learning"])
REPORT_PATH = Path(__file__).resolve().parents[3] / "data/samples/ml_laboratory.json"


@router.get("/laboratory", response_model=LaboratoryReport)
def laboratory(response: Response):
    try:
        report = LaboratoryReport.model_validate_json(REPORT_PATH.read_bytes())
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail="Laboratorio sin entrenar. Ejecuta scripts/train_web_ml.py."
        ) from None
    except (ValidationError, OSError):
        raise HTTPException(
            status_code=503, detail="El informe ML no está disponible o es inválido."
        ) from None
    response.headers["Cache-Control"] = "no-store"
    return report
