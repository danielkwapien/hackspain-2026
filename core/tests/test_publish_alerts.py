"""Las decisiones que cambian el contenido de la bandeja de alertas (XR-037).

Cada test monta las tablas publicadas minimas en una base local y comprueba una
sola regla. No hace falta MotherDuck: las cuatro causas nuevas son SQL sobre
columnas ya publicadas, asi que la misma consulta que corre en la nube corre
aqui contra seis filas escritas a mano.

Los numeros estan elegidos para que el acierto y el error se distingan a simple
vista: si alguien lee "cambio de banda" donde pone "bajada", el test no falla por
una fila, falla por la fila que dice que subir es bajar.
"""

from __future__ import annotations

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "core"))

from publication_schema import ALERT_DDL  # noqa: E402
from publish_alerts import publish  # noqa: E402

MONTH = "2026-08"
PARAMS = "sha256:test"
MD5 = "md5test"

SCORE_DDL = """
entity_kind VARCHAR, group_id VARCHAR, company_id VARCHAR, month VARCHAR,
band VARCHAR, cap_code VARCHAR, score DOUBLE, delta_1m DOUBLE, direction VARCHAR,
params_version VARCHAR, source_md5 VARCHAR
"""

SUMMARY_DDL = """
company_id VARCHAR, group_id VARCHAR, month VARCHAR, side VARCHAR,
n_counterparties INTEGER, top1_weight DOUBLE
"""


def _company(month, *, band=None, cap=None, score=50.0, delta=0.0,
             company="COMP_0001", group="GROUP_0001", direction="flat"):
    return ("company", group, company, month, band, cap, score, delta, direction,
            PARAMS, MD5)


def _group(month, *, band=None, cap=None, score=50.0, delta=0.0, group="GROUP_0001"):
    return ("group", group, None, month, band, cap, score, delta, "flat", PARAMS, MD5)


def _summary(side, top1, *, month=MONTH, company="COMP_0001", group="GROUP_0001", n=12):
    return (company, group, month, side, n, top1)


def _base(*, companies=(), groups=(), summaries=(), company_alerts=(), group_alerts=()):
    """Base local con las cinco tablas publicadas que el script lee."""
    connection = duckdb.connect(":memory:")
    connection.execute(f"CREATE TABLE company_scores({SCORE_DDL})")
    connection.execute(f"CREATE TABLE group_scores({SCORE_DDL})")
    connection.execute(f"CREATE TABLE company_counterparty_summary({SUMMARY_DDL})")
    connection.execute(f"CREATE TABLE company_alerts({ALERT_DDL})")
    connection.execute(f"CREATE TABLE group_alerts({ALERT_DDL})")
    for table, rows, width in (("company_scores", companies, 11), ("group_scores", groups, 11),
                               ("company_counterparty_summary", summaries, 6),
                               ("company_alerts", company_alerts, 16),
                               ("group_alerts", group_alerts, 16)):
        if rows:
            marks = ",".join("?" * width)
            connection.executemany(f"INSERT INTO {table} VALUES ({marks})", list(rows))
    return connection


def _alerts(connection, table="company_alerts_v2", cause=None):
    where = f" WHERE cause = '{cause}'" if cause else ""
    return connection.sql(f"SELECT * FROM {table}{where} ORDER BY alert_id").df().to_dict("records")


def _engine_alert(month, cause="buffer_days", company="COMP_0001"):
    return (f"{company}:{month}:buffer", "company", "GROUP_0001", company, month, "urgent",
            cause, "falling", None, 31.6, "PENALTY", "Colchon de caja de 9 dias",
            "{}", PARAMS, MD5, "2026-09-19 21:29:38+02:00")


def test_only_a_worse_band_raises_an_alert_and_the_message_names_both() -> None:
    # Given: a company that recovers from watch to healthy and then falls back.
    connection = _base(companies=[
        _company("2026-06", band="watch"),
        _company("2026-07", band="healthy"),
        _company("2026-08", band="watch"),
    ])

    # When: the alerts are published.
    publish(connection, MONTH)

    # Then: only the fall is an alert, and it says where it comes from.
    rows = _alerts(connection, cause="band_drop")
    assert [row["month"] for row in rows] == ["2026-08"]
    assert rows[0]["message"] == "Baja de Sana a Vigilar"
    assert rows[0]["severity"] == "review"
    assert rows[0]["alert_id"] == "COMP_0001:2026-08:band"


def test_a_fall_into_stress_is_urgent() -> None:
    # Given: a company that drops from watch to stress.
    connection = _base(companies=[
        _company("2026-07", band="watch"),
        _company("2026-08", band="stress"),
    ])

    # When: the alerts are published.
    publish(connection, MONTH)

    # Then: landing on the worst band is the only band drop that is urgent.
    rows = _alerts(connection, cause="band_drop")
    assert [(row["severity"], row["message"]) for row in rows] == [
        ("urgent", "Baja de Vigilar a Tensión")]


def test_the_cap_alert_fires_on_the_transition_not_on_every_capped_month() -> None:
    # Given: a cap that stays on for three consecutive months.
    connection = _base(companies=[
        _company("2026-06", band="watch"),
        _company("2026-07", band="watch", cap="CAP_NEGCASH"),
        _company("2026-08", band="watch", cap="CAP_NEGCASH"),
    ])

    # When: the alerts are published.
    publish(connection, MONTH)

    # Then: the news is the month the cap appeared, said once, with its meaning.
    rows = _alerts(connection, cause="cap_applied")
    assert [(row["month"], row["severity"], row["message"]) for row in rows] == [
        ("2026-07", "urgent", "Caja negativa persistente")]
    assert rows[0]["top_driver"] == "CAP_NEGCASH"


def test_the_score_drop_threshold_is_minus_eight() -> None:
    # Given: two companies, one just above the threshold and one just below.
    connection = _base(companies=[
        _company("2026-08", band="watch", score=40.6, delta=-7.9, company="COMP_0001"),
        _company("2026-08", band="watch", score=40.6, delta=-9.4, company="COMP_0002"),
    ])

    # When: the alerts are published.
    publish(connection, MONTH)

    # Then: only the steep fall is served, with the drop written in Spanish.
    rows = _alerts(connection, cause="score_drop")
    assert [(row["company_id"], row["message"]) for row in rows] == [
        ("COMP_0002", "El score cae 9,4 puntos en un mes")]


def test_concentration_reads_both_sides_of_the_book_above_forty_percent() -> None:
    # Given: a company whose customers are concentrated, whose suppliers are not,
    # and a supplier side right on the threshold.
    connection = _base(
        companies=[_company(MONTH, band="watch", score=44.0)],
        summaries=[_summary("ar", 0.47), _summary("ap", 0.39),
                   _summary("ap", 0.44, company="COMP_0002")])

    # When: the alerts are published.
    publish(connection, MONTH)

    # Then: each side speaks its own language and the ids do not collide.
    rows = _alerts(connection, cause="concentration")
    assert [(row["alert_id"], row["message"]) for row in rows] == [
        ("COMP_0001:2026-08:conc_ar", "El 47 % de los cobros depende de un solo cliente")]
    assert rows[0]["score_after"] == 44.0


def test_the_engine_alerts_are_copied_and_their_tables_are_left_alone() -> None:
    # Given: the buffer alerts the engine already published, plus a band drop.
    connection = _base(
        companies=[_company("2026-07", band="healthy"), _company(MONTH, band="watch")],
        company_alerts=[_engine_alert("2026-07"), _engine_alert(MONTH)])

    # When: the alerts are published.
    summary = publish(connection, MONTH)

    # Then: the new table adds without touching the old one, which is the whole
    # point of publishing next to it instead of republishing the engine.
    assert summary.by_cause["company_alerts_v2"] == {"band_drop": 1, "buffer_days": 2}
    assert summary.untouched == {"company_alerts": 2, "group_alerts": 0}
    assert connection.sql("SELECT count(*) FROM company_alerts").fetchone()[0] == 2


def test_groups_get_the_score_rules_and_never_a_concentration_row() -> None:
    # Given: a group that drops a band the same month a company is concentrated.
    connection = _base(
        companies=[_company(MONTH, band="watch")],
        groups=[_group("2026-07", band="healthy"), _group(MONTH, band="watch", delta=-12.0)],
        summaries=[_summary("ar", 0.80)])

    # When: the alerts are published.
    summary = publish(connection, MONTH)

    # Then: concentration only exists for companies; the counterparty summary
    # does not aggregate by group and inventing it would be a made-up number.
    assert summary.by_cause["group_alerts_v2"] == {"band_drop": 1, "score_drop": 1}
    rows = _alerts(connection, table="group_alerts_v2")
    assert {row["group_id"] for row in rows} == {"GROUP_0001"}
    assert {row["company_id"] for row in rows} == {None}
