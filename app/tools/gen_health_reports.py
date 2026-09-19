#!/usr/bin/env python3
"""Informes de Health pregenerados con Claude -> app/api/data/reports/<company_id>.json.

Proceso de un solo disparo y fuera del loop: lee la ficha de cada empresa de la API v2 local,
construye un prompt en español con las cifras ya formateadas (`value_fmt`), pide a Claude un
JSON con cinco secciones fijas y lo valida antes de escribirlo. Nunca corre en CI ni en tests.

Ejemplo:
    ANTHROPIC_API_KEY=... uv run --group reports python gen_health_reports.py
    uv run python gen_health_reports.py --dry-run   # imprime el prompt, no llama a Claude
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, Field, field_validator

REPORT_COMPANIES = ["COMP_0007", "COMP_0001", "COMP_0004", "COMP_0003", "COMP_0002"]
DEFAULT_API_URL = "http://localhost:8787"
MODEL = "claude-opus-5"
MAX_TOKENS = 4000
REPORTS_DIR = Path(__file__).resolve().parents[1] / "api" / "data" / "reports"
SECTION_TITLES = ["Resumen", "Liquidez y caja", "Pagos y cobros", "Deuda", "Actividad"]
TIMELINE_MONTHS = 12

SYSTEM_PROMPT = f"""Eres analista de tesorería de Embat. Redactas informes de Health para el equipo
financiero de un grupo de empresas, en español, con tono profesional y directo.

Reglas que no puedes romper:
- Prohibido inventar cifras. Solo puedes citar las cifras que aparecen literalmente en los
  datos recibidos (los campos `value_fmt`, el score, las bandas y los deltas). Si un dato no
  está o llega como «no disponible», dilo así: nunca lo sustituyas por 0 ni lo estimes.
- No des consejos de inversión ni conclusiones que los datos no sostengan.
- Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después, sin bloques de
  código, con esta forma exacta:
  {{
    "risk_level": "low" | "medium" | "high",
    "summary": "<dos o tres frases con la foto del corte>",
    "sections": [
      {{"title": "{SECTION_TITLES[0]}", "body": "..."}},
      {{"title": "{SECTION_TITLES[1]}", "body": "..."}},
      {{"title": "{SECTION_TITLES[2]}", "body": "..."}},
      {{"title": "{SECTION_TITLES[3]}", "body": "..."}},
      {{"title": "{SECTION_TITLES[4]}", "body": "..."}}
    ],
    "watch_next": ["<punto>", "<punto>"]
  }}
- Las cinco secciones van siempre, con esos títulos y en ese orden; si un pilar no aplica a
  la empresa, la sección lo dice en una frase.
- `watch_next` lleva entre 2 y 4 puntos concretos y accionables.
"""


class Section(BaseModel):
    title: str
    body: str = Field(min_length=1)


class HealthReport(BaseModel):
    company_id: str = ""
    as_of: str = ""
    generated_at: str = ""
    model: str = ""
    risk_level: Literal["low", "medium", "high"]
    summary: str = Field(min_length=1)
    sections: list[Section]
    watch_next: list[str] = Field(min_length=2, max_length=4)

    @field_validator("sections")
    @classmethod
    def five_fixed_sections(cls, sections: list[Section]) -> list[Section]:
        titles = [section.title for section in sections]
        if titles != SECTION_TITLES:
            raise ValueError(f"sections debe llevar exactamente {SECTION_TITLES} en orden; llegó {titles}")
        return sections


def fetch_company_bundle(api_url: str, company_id: str) -> tuple[dict, dict, list, dict]:
    """Ficha, señales, timeline y alertas de la empresa, tal cual las sirve la API v2."""
    base = api_url.rstrip("/")
    with httpx.Client(timeout=60.0) as client:

        def get(route: str):
            response = client.get(f"{base}{route}")
            response.raise_for_status()
            return response.json()

        sheet = get(f"/api/v2/companies/{company_id}")
        signals = get(f"/api/v2/companies/{company_id}/signals")
        timeline = get(f"/api/v2/companies/{company_id}/timeline")
        alerts = get(f"/api/v2/alerts?company_id={company_id}&limit=500")
    return sheet, signals, timeline, alerts


def _fmt(value: object) -> str:
    return "no disponible" if value is None else str(value)


def build_prompt(sheet: dict, signals: dict, timeline: list, alerts: dict) -> str:
    """El prompt de usuario: todo lo que Claude puede citar, y nada más."""
    company = sheet["company"]
    outlook = sheet.get("outlook") or {}
    penalty = sheet.get("penalty") or {}
    cap = sheet.get("cap")
    narrative = sheet.get("narrative") or {}

    lines = [
        f"Empresa: {company['name']} ({company['company_id']}), grupo {_fmt(company.get('group_id'))}.",
        f"Mes de corte: {sheet['as_of']}.",
        f"Score: {_fmt(sheet.get('score'))} · banda: {_fmt(sheet.get('band'))} · régimen: "
        f"{_fmt(sheet.get('regime'))} · delta 3 meses: {_fmt(sheet.get('delta_3m'))}.",
        f"Outlook: 3 meses {_fmt(outlook.get('h3'))}, 6 meses {_fmt(outlook.get('h6'))} "
        f"(banda {_fmt(outlook.get('low'))}–{_fmt(outlook.get('high'))}), etiqueta {_fmt(outlook.get('label'))}.",
        f"Confianza: {_fmt(sheet.get('confidence'))}.",
        f"Penalización: {_fmt(penalty.get('points'))} puntos (pilar más débil: {_fmt(penalty.get('weakest_pillar'))}).",
        "Techo: " + ("ninguno" if cap is None else f"{_fmt(cap.get('code'))} en {_fmt(cap.get('value'))}") + ".",
        "",
        "Pilares y señales en el corte (value_fmt · contribución · disponible):",
    ]
    for pillar in signals.get("pillars", []):
        lines.append(
            f"- Pilar {pillar['pillar']} {_fmt(pillar.get('pillar_name'))}: valor {_fmt(pillar.get('value'))}, "
            f"peso {_fmt(pillar.get('weight'))}"
        )
        for signal in pillar.get("signals", []):
            available = signal.get("is_available", True)
            lines.append(
                f"    · {signal['signal_id']} {_fmt(signal.get('name'))}: "
                f"{_fmt(signal.get('value_fmt')) if available else 'no aplica'} · "
                f"contribución {_fmt(signal.get('contribution'))} · disponible {'sí' if available else 'no'}"
            )

    lines += ["", f"Últimos {TIMELINE_MONTHS} meses (mes · score · banda · régimen):"]
    for row in timeline[-TIMELINE_MONTHS:]:
        lines.append(f"- {row['month']} · {_fmt(row.get('score'))} · {_fmt(row.get('band'))} · {_fmt(row.get('regime'))}")

    lines += ["", "Principales impulsores del score (rank · señal · pilar · value_fmt · contribución · dirección):"]
    for driver in sheet.get("drivers", []):
        lines.append(
            f"- {driver.get('rank')} · {driver['signal_id']} · {_fmt(driver.get('pillar'))} · "
            f"{_fmt(driver.get('value_fmt'))} · {_fmt(driver.get('contribution'))} · {_fmt(driver.get('direction'))}"
        )

    items = alerts.get("items", [])
    lines += ["", f"Alertas de la empresa ({len(items)}):"]
    for alert in items:
        lines.append(
            f"- {alert['month_detected']} · {alert.get('severity')} · {alert.get('event')} · "
            f"{_fmt(alert.get('status'))}: {_fmt(alert.get('message'))}"
        )
    if not items:
        lines.append("- ninguna")

    lines += [
        "",
        "Narrativa del motor:",
        f"- Titular: {_fmt(narrative.get('headline'))}",
        f"- Cuerpo: {_fmt(narrative.get('body'))}",
        f"- Qué vigilar: {_fmt(narrative.get('watch_next'))}",
        "",
        "Redacta el informe de Health en el JSON indicado.",
    ]
    return "\n".join(lines)


def validate_report(data: dict) -> HealthReport:
    """Lanza `pydantic.ValidationError` (subclase de `ValueError`) si el informe no cumple el esquema."""
    return HealthReport.model_validate(data)


def generate(company_id: str, api_url: str, dry_run: bool = False) -> Path | None:
    sheet, signals, timeline, alerts = fetch_company_bundle(api_url, company_id)
    prompt = build_prompt(sheet, signals, timeline, alerts)
    if dry_run:
        print(f"===== {company_id} · system =====\n{SYSTEM_PROMPT}\n===== {company_id} · user =====\n{prompt}\n")
        return None

    import anthropic  # perezoso: los tests y --dry-run no lo necesitan

    client = anthropic.Anthropic()
    message = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(block.text for block in message.content if getattr(block, "type", "") == "text").strip()
    report = validate_report(json.loads(text))
    report.company_id = company_id
    report.as_of = sheet["as_of"]
    report.generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report.model = MODEL

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out = REPORTS_DIR / f"{company_id}.json"
    out.write_text(
        json.dumps(report.model_dump(), indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"API v2 local (defecto {DEFAULT_API_URL})")
    parser.add_argument("--dry-run", action="store_true", help="imprime los prompts y no llama a Claude")
    parser.add_argument("--company", action="append", help=f"empresa concreta (defecto: {', '.join(REPORT_COMPANIES)})")
    args = parser.parse_args(argv)

    for company_id in args.company or REPORT_COMPANIES:
        out = generate(company_id, args.api_url, dry_run=args.dry_run)
        if out is not None:
            print(f"{company_id} -> {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
