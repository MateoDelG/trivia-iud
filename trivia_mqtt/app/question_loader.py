"""Helpers to load and validate trivia question banks."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Tuple

import pandas as pd

from app.models import Question

REQUIRED_COLUMNS = [
    "id",
    "pregunta",
    "opcion_a",
    "opcion_b",
    "opcion_c",
    "opcion_d",
    "respuesta_correcta",
    "puntos",
]

OPTIONAL_COLUMNS = ["categoria", "dificultad", "explicacion", "explicación", "retroalimentacion"]
SUPPORTED_EXTENSIONS = {".csv", ".xlsx"}


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if pd.isna(value):
        return True
    return str(value).strip() == ""


def _as_text(value: Any) -> str:
    if _is_empty(value):
        return ""
    return str(value).strip()


def _question_row_number(index: int) -> int:
    return index + 2


def _prepare_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    prepared = df.rename(columns={column: str(column).strip().lower() for column in df.columns})

    if "explicacion" not in prepared.columns:
        if "explicación" in prepared.columns:
            prepared["explicacion"] = prepared["explicación"]
        elif "retroalimentacion" in prepared.columns:
            prepared["explicacion"] = prepared["retroalimentacion"]

    return prepared


def validate_questions_dataframe(df: pd.DataFrame) -> Tuple[bool, list[str]]:
    df = _prepare_dataframe(df)
    errors: list[str] = []

    missing_columns = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    for column in missing_columns:
        errors.append(f"Falta la columna obligatoria: {column}")

    if missing_columns:
        return False, errors

    if df.empty:
        errors.append("El archivo no tiene preguntas")
        return False, errors

    seen_ids: set[str] = set()

    for index, row in df.iterrows():
        row_number = _question_row_number(index)

        question_id = _as_text(row.get("id"))
        if not question_id:
            errors.append(f"La fila {row_number} no tiene id")
        elif question_id in seen_ids:
            errors.append(f"El id {question_id} esta repetido")
        else:
            seen_ids.add(question_id)

        question_text = _as_text(row.get("pregunta"))
        if not question_text:
            errors.append(f"La fila {row_number} no tiene texto de pregunta")

        for option_column in ["opcion_a", "opcion_b", "opcion_c", "opcion_d"]:
            if not _as_text(row.get(option_column)):
                errors.append(f"La fila {row_number} no tiene valor en {option_column}")

        correct_answer = _as_text(row.get("respuesta_correcta")).upper()
        if correct_answer not in {"A", "B", "C", "D"}:
            raw_value = _as_text(row.get("respuesta_correcta"))
            errors.append(
                f"La fila {row_number} tiene una respuesta_correcta invalida: {raw_value or '(vacio)'}"
            )

        points_raw = row.get("puntos")
        try:
            points_value = float(points_raw)
            if pd.isna(points_value):
                raise ValueError
        except Exception:
            errors.append(f"La fila {row_number} tiene puntos no numericos")

    return len(errors) == 0, errors


def normalize_questions(df: pd.DataFrame) -> list[Question]:
    df = _prepare_dataframe(df)
    questions: list[Question] = []

    for _, row in df.iterrows():
        questions.append(
            Question(
                question_id=_as_text(row.get("id")),
                text=_as_text(row.get("pregunta")),
                option_a=_as_text(row.get("opcion_a")),
                option_b=_as_text(row.get("opcion_b")),
                option_c=_as_text(row.get("opcion_c")),
                option_d=_as_text(row.get("opcion_d")),
                correct_answer=_as_text(row.get("respuesta_correcta")).upper(),
                points=float(row.get("puntos")),
                category=_as_text(row.get("categoria")) or None,
                difficulty=_as_text(row.get("dificultad")) or None,
                explanation=_as_text(row.get("explicacion")) or None,
                feedback=_as_text(row.get("explicacion")) or None,
            )
        )

    return questions


def load_questions_from_file(file_path: str) -> Tuple[list[Question], list[str]]:
    path = Path(file_path)
    extension = path.suffix.lower()

    if extension not in SUPPORTED_EXTENSIONS:
        return [], ["Formato no soportado. Solo se permiten archivos .csv o .xlsx"]

    try:
        if extension == ".csv":
            dataframe = pd.read_csv(path)
        else:
            dataframe = pd.read_excel(path)
    except Exception as exc:
        return [], [f"No se pudo leer el archivo: {exc}"]

    is_valid, errors = validate_questions_dataframe(dataframe)
    if not is_valid:
        return [], errors

    try:
        questions = normalize_questions(dataframe)
    except Exception as exc:
        return [], [f"Error normalizando preguntas: {exc}"]

    return questions, []
