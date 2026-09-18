"""Hechos REALES extraidos de `datasets/` con DuckDB.

Este modulo solo lee: no sintetiza nada. Es el esqueleto sobre el que
`simulate.py` cuelga la parte estocastica del mock, de forma que el dataset
generado conserve la topologia real (quien existe, en que grupo, en que moneda,
desde cuando, con que cobertura de facturas y deuda).

Las derivaciones siguen `docs/alfonso/ENGINE-EMBAT.md`:

- §3.1 Spine y ventana: 2024-09 … 2026-08 (24 meses). **2026-09 se descarta**
  porque es un unico dia. `first_activity = min(transactions.date)`, no
  `created_at`.
- §3.2 Universo de facturas: `document_type = 'invoice' AND status <> 'cancel'`;
  direccion `AR` si `amount > 0`, `AP` si `amount < 0`.
- §3.3 Unidad monetaria: las magnitudes por empresa quedan en su moneda
  contable (son ratios intra-empresa); la consolidacion de grupo usa la tabla
  FX **constante** `FX_TO_EUR`, nunca el `exchange_rate` fila a fila.
- §3.4 Taxonomia fija de flujos: `op_in`, `op_out`, `fin_out`, `internal`.
- §4.2 P4-P6 (`ss_regularity`, `tax_regularity`, `salary_regularity`) solo se
  calculan si la empresa ha mostrado esa categoria al menos 3 veces en su
  historia: de ahi el umbral de `has_ss` / `has_salary` / `has_tax`.
- §4.7 Ramas de cobertura: `full`, `no_debt`, `no_invoices`,
  `no_invoices_no_debt`, que fijan la renormalizacion de pesos.

Cada funcion publica cachea su resultado en un parquet dentro de `cache_dir`
(por defecto `datasets_mocked/.cache/`, gitignored). La clave del cache incluye
los SHA-256 de los ficheros de origen: si `datasets/` cambia, se regenera sola.

Uso:

    from xray_mock.real_inputs import load_company_facts
    facts = load_company_facts(Path("datasets"))
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Callable

import duckdb
import pandas as pd

# --------------------------------------------------------------------------
# Constantes
# --------------------------------------------------------------------------

#: `datasets_mocked/`
PACKAGE_ROOT = Path(__file__).resolve().parent.parent

#: Parquet derivado, gitignored (ver `datasets_mocked/.gitignore`).
CACHE_DIR = PACKAGE_ROOT / ".cache"

#: Se incrementa cuando cambia el esquema devuelto: invalida el cache.
SCHEMA_VERSION = "real-inputs-v1"

#: ENGINE §3.1. `WINDOW_END` es exclusivo: deja fuera el 2026-09-01 suelto.
WINDOW_START = "2024-09-01"
WINDOW_END = "2026-09-01"

#: Los 24 meses del spine, en orden.
MONTHS: tuple[str, ...] = tuple(
    f"{y:04d}-{m:02d}"
    for y, m in (
        (2024 + (8 + i) // 12, (8 + i) % 12 + 1) for i in range(24)
    )
)
FIRST_MONTH = MONTHS[0]  # 2024-09
LAST_MONTH = MONTHS[-1]  # 2026-08

#: Ventana TTM usada por `op_in_12m` / `op_out_12m`: 2025-09 … 2026-08.
TTM_START = "2025-09-01"

# ENGINE §3.4. Taxonomia fija. `cash_settlement` y `cash_settlements` conviven
# en el dataset (90 filas usan el plural); la categoria vacia llega como '-'.
OP_IN_CATEGORIES: tuple[str, ...] = (
    "collection",
    "bulk_collection",
    "pos_settlement",
    "cash_settlement",
    "cash_settlements",
    "payment_refund",
    "tax_refund",
)
OP_OUT_CATEGORIES: tuple[str, ...] = (
    "payment",
    "bulk_payment",
    "utility",
    "salary",
    "tax",
    "social_security",
    "collection_refund",
)
FIN_OUT_CATEGORIES: tuple[str, ...] = ("debt_repayment", "interest_charge", "fee")

#: ENGINE §4.2: P4-P6 solo se calculan con >= 3 apariciones historicas.
MIN_CATEGORY_OCCURRENCES = 3

#: ENGINE §4.4 D1: las lineas dispuestas agrupan estos tres tipos de deuda.
LINE_OF_CREDIT_TYPES: tuple[str, ...] = ("lineofcredit", "confirming", "factoring")

#: ENGINE §4.1 L5: `invest_eom` sale de estos productos bancarios.
INVEST_TYPES: tuple[str, ...] = ("investment", "saving")

#: ENGINE §3.3. Tabla FX CONSTANTE, **unidades de divisa por EUR** (mediana del
#: `exchange_rate` observado). La conversion es por tanto `importe / rate`:
#: 1.000 USD / 1,16 = 862 EUR, 1.000 GBP / 0,84 = 1.190 EUR. Supuesto visible y
#: neutro en trayectoria; nunca se usa el `exchange_rate` fila a fila.
FX_TO_EUR: dict[str, float] = {
    "EUR": 1.0,
    "USD": 1.16,
    "GBP": 0.84,
    "MXN": 20.8,
    "CLP": 1048.0,
    "COP": 4272.0,
}

#: Divisa sin tabla: se asume paridad y se deja constancia en `notes`.
FX_FALLBACK = 1.0

#: `companies.country` viene sin normalizar y vacio en ~82 % de las filas.
#: Estos son TODOS los valores no ISO-2 presentes hoy en `datasets/`.
COUNTRY_ALIASES: dict[str, str] = {
    "ESPANA": "ES",
    "ESPAÑA": "ES",
    "ESPANYA": "ES",
    "SPAIN": "ES",
    "PORTUGAL": "PT",
    "ITALIA": "IT",
    "ALEMANIA": "DE",
    "MALAYSIA": "MY",
}

#: Ramas de cobertura de ENGINE §4.7.
BRANCHES: tuple[str, ...] = ("full", "no_debt", "no_invoices", "no_invoices_no_debt")


# --------------------------------------------------------------------------
# Hashes de origen y cache
# --------------------------------------------------------------------------


def _source_files(data_dir: Path) -> list[Path]:
    """Los CSV de origen (planos y gzip), en orden estable."""
    return sorted(
        [*data_dir.glob("*.csv"), *data_dir.glob("*.csv.gz")],
        key=lambda p: p.name,
    )


def source_hashes(data_dir: Path) -> list[dict]:
    """SHA-256 de cada `.csv` / `.csv.gz` de `data_dir`.

    Alimenta la clave del cache y el `manifest.json` del mock (`data_kind`
    mock trazable a los ficheros originales).
    """
    out: list[dict] = []
    for path in _source_files(Path(data_dir)):
        digest = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                digest.update(chunk)
        out.append(
            {"file": path.name, "sha256": digest.hexdigest(), "bytes": path.stat().st_size}
        )
    return out


def _cache_key(data_dir: Path) -> str:
    """Huella corta de (esquema + contenido de `datasets/`)."""
    blob = SCHEMA_VERSION + "".join(
        f"{h['file']}:{h['sha256']}" for h in source_hashes(data_dir)
    )
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _cached(
    name: str,
    data_dir: Path,
    cache_dir: Path | None,
    refresh: bool,
    build: Callable[[], pd.DataFrame],
) -> pd.DataFrame:
    """Lee el parquet si la huella coincide; si no, lo construye y lo escribe."""
    target_dir = Path(cache_dir) if cache_dir is not None else CACHE_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    path = target_dir / f"{name}-{_cache_key(Path(data_dir))}.parquet"
    if path.exists() and not refresh:
        return pd.read_parquet(path)
    frame = build()
    frame.to_parquet(path, index=False)
    return frame


# --------------------------------------------------------------------------
# Helpers de SQL
# --------------------------------------------------------------------------


def _in_list(values: tuple[str, ...]) -> str:
    """`('a', 'b')` listo para un `IN (...)` de SQL."""
    return ", ".join(f"'{v}'" for v in values)


def _src(data_dir: Path, pattern: str) -> str:
    """`read_csv(...)` sobre un fichero (o glob) de `datasets/`."""
    return (
        f"read_csv('{Path(data_dir) / pattern}', header=true, union_by_name=true)"
    )


def _normalize_country(raw: object) -> str | None:
    """`country` -> ISO-2, o `None`.

    Trim, mayusculas, `''` / `'nan'` / nulo -> `None`, y los alias no ISO-2 que
    trae el dataset (`ESPAÑA`, `Spain`, `Portugal`, ...) -> su codigo.
    """
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    text = str(raw).strip().upper()
    if text in ("", "NAN", "NONE"):
        return None
    if text in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[text]
    return text if len(text) == 2 and text.isalpha() else None


# --------------------------------------------------------------------------
# Pasadas grandes: una por fichero de origen
# --------------------------------------------------------------------------


def _scan_transactions(con: duckdb.DuckDBPyConnection, data_dir: Path) -> pd.DataFrame:
    """Una sola pasada sobre `transactions_*.csv.gz`.

    Devuelve las dos granularidades a la vez (`GROUPING SETS`): la fila de
    rollup por empresa (`is_total = 1`) y el panel `empresa x mes`. ENGINE §3.1
    (ventana, 2026-09 fuera) y §3.4 (taxonomia de flujos).
    """
    return con.sql(f"""
        WITH tx AS (
            SELECT
                company_id,
                strftime(date, '%Y-%m') AS month,
                date,
                amount,
                category,
                counterparty_id
            FROM {_src(data_dir, 'transactions_*.csv.gz')}
            WHERE date >= TIMESTAMP '{WINDOW_START}'
              AND date <  TIMESTAMP '{WINDOW_END}'
        )
        SELECT
            company_id,
            GROUPING(month) AS is_total,
            month,
            count(*) AS n_tx,
            min(date) AS first_activity,
            max(date) AS last_activity,
            count(DISTINCT month) AS months_hist,
            count(DISTINCT counterparty_id) AS n_counterparties,
            coalesce(sum(amount) FILTER (
                WHERE category IN ({_in_list(OP_IN_CATEGORIES)})), 0.0) AS op_in,
            coalesce(sum(amount) FILTER (
                WHERE category IN ({_in_list(OP_OUT_CATEGORIES)})), 0.0) AS op_out_signed,
            coalesce(sum(amount) FILTER (
                WHERE category IN ({_in_list(FIN_OUT_CATEGORIES)})), 0.0) AS fin_out_signed,
            coalesce(sum(amount) FILTER (
                WHERE category IN ({_in_list(OP_IN_CATEGORIES)})
                  AND date >= TIMESTAMP '{TTM_START}'), 0.0) AS op_in_12m,
            coalesce(sum(amount) FILTER (
                WHERE category IN ({_in_list(OP_OUT_CATEGORIES)})
                  AND date >= TIMESTAMP '{TTM_START}'), 0.0) AS op_out_12m_signed,
            count(*) FILTER (WHERE category = 'social_security') AS n_ss,
            count(*) FILTER (WHERE category = 'salary') AS n_salary,
            count(*) FILTER (WHERE category = 'tax') AS n_tax,
            count(*) FILTER (WHERE category = 'debt_repayment') AS n_debtrep,
            count(*) FILTER (WHERE category = 'transfer') AS n_transfer
        FROM tx
        GROUP BY GROUPING SETS ((company_id, month), (company_id))
    """).df()


def _scan_invoices(con: duckdb.DuckDBPyConnection, data_dir: Path) -> pd.DataFrame:
    """Una sola pasada sobre `invoices.csv.gz`.

    Universo y direccion de ENGINE §3.2: `document_type = 'invoice'`,
    `status <> 'cancel'`, `AR` si `amount > 0` y `AP` si `amount < 0`. Igual que
    en transacciones, rollup y panel mensual en la misma consulta.
    """
    return con.sql(f"""
        WITH inv AS (
            SELECT
                company_id,
                strftime(issuance_date, '%Y-%m') AS month,
                amount
            FROM {_src(data_dir, 'invoices.csv.gz')}
            WHERE document_type = 'invoice'
              AND (status IS NULL OR status <> 'cancel')
        )
        SELECT
            company_id,
            GROUPING(month) AS is_total,
            month,
            count(*) AS n_invoices,
            count(*) FILTER (WHERE amount > 0) AS n_invoices_issued,
            count(*) FILTER (WHERE amount < 0) AS n_invoices_received
        FROM inv
        GROUP BY GROUPING SETS ((company_id, month), (company_id))
    """).df()


def _scan_static(con: duckdb.DuckDBPyConnection, data_dir: Path) -> pd.DataFrame:
    """Empresas + productos + saldos: una pasada por fichero, todos pequenos."""
    return con.sql(f"""
        WITH companies AS (
            SELECT company_id, group_id, country, currency, erp, created_at
            FROM {_src(data_dir, 'companies.csv')}
        ),
        banking AS (
            SELECT
                company_id,
                count(*) AS n_banking_products,
                count(*) FILTER (
                    WHERE type IN ({_in_list(INVEST_TYPES)})) AS n_invest_products
            FROM {_src(data_dir, 'banking_products.csv')}
            GROUP BY company_id
        ),
        debt AS (
            SELECT
                company_id,
                count(*) AS n_debt_products,
                count(*) FILTER (
                    WHERE type IN ({_in_list(LINE_OF_CREDIT_TYPES)})) AS n_loc_products
            FROM {_src(data_dir, 'debt_products.csv')}
            GROUP BY company_id
        ),
        bal AS (
            SELECT company_id, sum(balance) AS balance_total
            FROM {_src(data_dir, 'balances.csv')}
            GROUP BY company_id
        )
        SELECT
            c.*,
            coalesce(b.n_banking_products, 0) AS n_banking_products,
            coalesce(b.n_invest_products, 0) AS n_invest_products,
            coalesce(d.n_debt_products, 0) AS n_debt_products,
            coalesce(d.n_loc_products, 0) AS n_loc_products,
            coalesce(bal.balance_total, 0.0) AS balance_total
        FROM companies c
        LEFT JOIN banking b USING (company_id)
        LEFT JOIN debt d USING (company_id)
        LEFT JOIN bal USING (company_id)
    """).df()


# --------------------------------------------------------------------------
# API publica
# --------------------------------------------------------------------------


def load_company_facts(
    data_dir: Path, cache_dir: Path | None = None, refresh: bool = False
) -> pd.DataFrame:
    """Una fila por `company_id` (1.286) con los hechos reales de la empresa.

    Columnas: identidad (`group_id`, `country` ISO-2, `currency`, `erp`,
    `created_at`), ventana real (`first_activity`, `last_activity`,
    `months_hist`), recuentos (`n_transactions`, `n_banking_products`,
    `n_debt_products`, `n_invoices`, `n_counterparties`), cobertura
    (`has_invoices`, `has_debt`, `has_debt_repayment`, `has_lineofcredit`,
    `has_ss`, `has_salary`, `has_tax`, `has_invest`, `has_intercompany`),
    la rama de ENGINE §4.7 (`branch`) y la escala real (`op_in_12m`,
    `op_out_12m`, `balance_total`).

    Todos los importes van en la moneda contable de la empresa (ENGINE §3.3:
    las senales intra-empresa son ratios, no hace falta EUR).
    """

    def build() -> pd.DataFrame:
        con = duckdb.connect()
        try:
            tx = _scan_transactions(con, data_dir)
            inv = _scan_invoices(con, data_dir)
            static = _scan_static(con, data_dir)
        finally:
            con.close()

        tx_total = tx[tx["is_total"] == 1].drop(columns=["is_total", "month"])
        inv_total = inv[inv["is_total"] == 1][
            ["company_id", "n_invoices"]
        ]

        facts = static.merge(tx_total, on="company_id", how="left").merge(
            inv_total, on="company_id", how="left"
        )

        facts["country"] = facts["country"].map(_normalize_country)
        facts["n_transactions"] = facts["n_tx"].fillna(0).astype("int64")
        facts["n_invoices"] = facts["n_invoices"].fillna(0).astype("int64")
        facts["months_hist"] = facts["months_hist"].fillna(0).astype("int64")
        facts["n_counterparties"] = facts["n_counterparties"].fillna(0).astype("int64")
        facts["op_in_12m"] = facts["op_in_12m"].fillna(0.0)
        facts["op_out_12m"] = facts["op_out_12m_signed"].fillna(0.0).abs()

        # Tamano del grupo tal y como esta en la muestra: el neteo intercompany
        # de ENGINE §3.6 necesita las dos patas presentes.
        group_size = facts.groupby("group_id")["company_id"].transform("size")

        facts["has_invoices"] = facts["n_invoices"] > 0
        facts["has_debt"] = facts["n_debt_products"] > 0
        facts["has_debt_repayment"] = facts["n_debtrep"].fillna(0) > 0
        facts["has_lineofcredit"] = facts["n_loc_products"] > 0
        facts["has_invest"] = facts["n_invest_products"] > 0
        # ENGINE §4.2: P4-P6 solo se calculan con >= 3 apariciones historicas.
        facts["has_ss"] = facts["n_ss"].fillna(0) >= MIN_CATEGORY_OCCURRENCES
        facts["has_salary"] = facts["n_salary"].fillna(0) >= MIN_CATEGORY_OCCURRENCES
        facts["has_tax"] = facts["n_tax"].fillna(0) >= MIN_CATEGORY_OCCURRENCES
        # Aproximacion barata del emparejamiento de ENGINE §3.6: hay traspasos y
        # hay hermanas en la muestra. El emparejamiento exacto queda fuera del mock.
        facts["has_intercompany"] = (facts["n_transfer"].fillna(0) > 0) & (group_size >= 2)

        facts["branch"] = [
            _branch(has_inv, has_debt)
            for has_inv, has_debt in zip(facts["has_invoices"], facts["has_debt"])
        ]

        columns = [
            "company_id", "group_id", "country", "currency", "erp", "created_at",
            "first_activity", "last_activity", "months_hist",
            "n_transactions", "n_banking_products", "n_debt_products", "n_invoices",
            "n_counterparties",
            "has_invoices", "has_debt", "has_debt_repayment", "has_lineofcredit",
            "has_ss", "has_salary", "has_tax", "has_invest", "has_intercompany",
            "branch", "op_in_12m", "op_out_12m", "balance_total",
        ]
        return facts[columns].sort_values("company_id").reset_index(drop=True)

    return _cached("company_facts", data_dir, cache_dir, refresh, build)


def _branch(has_invoices: bool, has_debt: bool) -> str:
    """Rama de cobertura de ENGINE §4.7, que fija la renormalizacion de pesos."""
    if has_invoices:
        return "full" if has_debt else "no_debt"
    return "no_invoices" if has_debt else "no_invoices_no_debt"


def load_group_facts(
    data_dir: Path, cache_dir: Path | None = None, refresh: bool = False
) -> pd.DataFrame:
    """Una fila por `group_id` (250), con la consolidacion de ENGINE §3.3.

    `op_in_12m_eur` suma el `op_in_12m` de las filiales convertido con la tabla
    CONSTANTE `FX_TO_EUR` (`importe / rate`, porque el rate son unidades de
    divisa por EUR). Nunca se usa el `exchange_rate` fila a fila. Una divisa sin
    entrada en la tabla se convierte a 1,0 y deja constancia en `notes`.
    """

    def build() -> pd.DataFrame:
        companies = load_company_facts(data_dir, cache_dir=cache_dir, refresh=refresh)
        con = duckdb.connect()
        try:
            groups = con.sql(
                f"SELECT group_id, erp, n_companies_in_sample "
                f"FROM {_src(data_dir, 'groups.csv')}"
            ).df()
        finally:
            con.close()

        rates = companies["currency"].map(FX_TO_EUR)
        eur = companies["op_in_12m"] / rates.fillna(FX_FALLBACK)
        unknown = companies["currency"].where(rates.isna())

        per_group = (
            pd.DataFrame(
                {
                    "group_id": companies["group_id"],
                    "company_id": companies["company_id"],
                    "country": companies["country"],
                    "currency": companies["currency"],
                    "op_in_12m_eur": eur,
                    "has_intercompany": companies["has_intercompany"],
                    "unknown_currency": unknown,
                }
            )
            .groupby("group_id")
            .agg(
                n_companies_present=("company_id", "size"),
                countries=("country", lambda s: sorted(s.dropna().unique())),
                currencies=("currency", lambda s: sorted(s.dropna().unique())),
                op_in_12m_eur=("op_in_12m_eur", "sum"),
                has_intercompany=("has_intercompany", "any"),
                unknown_currencies=("unknown_currency", lambda s: sorted(s.dropna().unique())),
            )
            .reset_index()
        )

        facts = groups.merge(per_group, on="group_id", how="left")
        facts["n_companies_present"] = facts["n_companies_present"].fillna(0).astype("int64")
        facts["consolidation_currency"] = "EUR"
        facts["notes"] = [
            [f"fx_fallback_1.0:{c}" for c in unknowns]
            for unknowns in facts["unknown_currencies"]
        ]

        columns = [
            "group_id", "erp", "n_companies_in_sample", "n_companies_present",
            "countries", "currencies", "consolidation_currency", "op_in_12m_eur",
            "has_intercompany", "notes",
        ]
        return facts[columns].sort_values("group_id").reset_index(drop=True)

    frame = _cached("group_facts", data_dir, cache_dir, refresh, build)
    # El round-trip a parquet devuelve ndarray en las columnas de lista.
    for column in ("countries", "currencies", "notes"):
        frame[column] = frame[column].map(list)
    return frame


def load_monthly_activity(
    data_dir: Path, cache_dir: Path | None = None, refresh: bool = False
) -> pd.DataFrame:
    """Panel `company_id x month` del spine real (ENGINE §3.1).

    El spine arranca en el mes de `first_activity` de cada empresa y acaba en
    2026-08; los meses sin movimientos dentro de ese rango existen con ceros
    (son informacion: un hueco es una caida de actividad, no una fila ausente).

    `op_out` y `fin_out` salen en valor absoluto. `fin_out` agrupa
    `debt_repayment + interest_charge + fee` (ENGINE §3.4). Las facturas se
    cuentan por mes de emision, con la direccion de ENGINE §3.2.
    """

    def build() -> pd.DataFrame:
        con = duckdb.connect()
        try:
            tx = _scan_transactions(con, data_dir)
            inv = _scan_invoices(con, data_dir)
        finally:
            con.close()

        tx_months = tx[tx["is_total"] == 0].copy()
        first_month = (
            tx[tx["is_total"] == 1]
            .set_index("company_id")["first_activity"]
            .dt.strftime("%Y-%m")
        )

        spine = (
            first_month.rename("first_month")
            .reset_index()
            .merge(pd.DataFrame({"month": list(MONTHS)}), how="cross")
        )
        spine = spine[spine["month"] >= spine["first_month"]].drop(columns=["first_month"])

        panel = spine.merge(
            tx_months[
                [
                    "company_id", "month", "n_tx", "op_in", "op_out_signed",
                    "fin_out_signed", "n_ss", "n_salary", "n_tax", "n_debtrep",
                ]
            ],
            on=["company_id", "month"],
            how="left",
        ).merge(
            inv[inv["is_total"] == 0][
                ["company_id", "month", "n_invoices_issued", "n_invoices_received"]
            ],
            on=["company_id", "month"],
            how="left",
        )

        panel["n_tx"] = panel["n_tx"].fillna(0).astype("int64")
        panel["op_in"] = panel["op_in"].fillna(0.0)
        panel["op_out"] = panel["op_out_signed"].fillna(0.0).abs()
        panel["fin_out"] = panel["fin_out_signed"].fillna(0.0).abs()
        for column in ("n_invoices_issued", "n_invoices_received"):
            panel[column] = panel[column].fillna(0).astype("int64")
        for flag, source in (
            ("has_ss_tx", "n_ss"),
            ("has_salary_tx", "n_salary"),
            ("has_tax_tx", "n_tax"),
            ("has_debtrep_tx", "n_debtrep"),
        ):
            panel[flag] = panel[source].fillna(0) > 0

        columns = [
            "company_id", "month", "n_tx", "op_in", "op_out", "fin_out",
            "n_invoices_issued", "n_invoices_received",
            "has_ss_tx", "has_salary_tx", "has_tax_tx", "has_debtrep_tx",
        ]
        return (
            panel[columns]
            .sort_values(["company_id", "month"])
            .reset_index(drop=True)
        )

    return _cached("monthly_activity", data_dir, cache_dir, refresh, build)


# --------------------------------------------------------------------------


if __name__ == "__main__":  # pragma: no cover - ayuda manual
    data_dir = PACKAGE_ROOT.parent / "datasets"
    started = time.time()
    companies = load_company_facts(data_dir)
    groups = load_group_facts(data_dir)
    monthly = load_monthly_activity(data_dir)
    print(f"companies : {len(companies):>6} filas")
    print(f"groups    : {len(groups):>6} filas")
    print(f"monthly   : {len(monthly):>6} filas")
    print(f"branch    : {companies['branch'].value_counts().to_dict()}")
    print(f"sources   : {len(source_hashes(data_dir))} ficheros")
    print(f"elapsed   : {time.time() - started:.2f} s")
