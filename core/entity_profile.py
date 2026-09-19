"""Identidad de presentacion: la tabla `entity_profile`.

Nombre, pais e industria de las 1.286 sociedades y los 250 grupos. Es una tabla
de APARIENCIA: nada de lo que hay aqui entra en el score. No la lee ninguna
señal, ni el motor, ni `company_scores` / `group_scores`; solo la pantalla.

Las tres reglas, en una linea cada una:

- **Nombre**: composicion `sustantivo de actividad + toponimo + forma juridica`,
  sembrada con `blake2b` del identificador. El mismo id da siempre el mismo
  nombre, para que las capturas de la demo no caduquen. Ni `random` ni `uuid`.
- **Pais**: se conserva el real de `companies.country` cuando lo hay (230 de
  1.286 filas). El resto se infiere de la MONEDA dominante de los productos por
  los que se mueve el dinero: euro -> reparto de una plataforma de tesoreria
  española; cualquier otra -> el pais de esa moneda. Una empresa cuyos
  movimientos van en MXN nunca sale en España.
- **Industria**: se INFIERE de los movimientos con la cascada documentada en
  `classify_industry`, nunca se sortea.

Uso:

    .venv/bin/python core/entity_profile.py                 # publica en MotherDuck
    .venv/bin/python core/entity_profile.py --dry-run       # solo el fichero local
"""

from __future__ import annotations

import argparse
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pandas as pd  # noqa: PANDAS_OK

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE = "md:hackspain_2026"
DEFAULT_OUTPUT = ROOT / "core" / "outputs" / "entity_profile.parquet"

#: Los diez sectores acordados. Ni uno mas.
INDUSTRIES = (
    "industria y manufactura",
    "distribución y mayorista",
    "servicios profesionales",
    "transporte y logística",
    "alimentación y bebidas",
    "construcción e instalaciones",
    "comercio minorista",
    "tecnología y software",
    "salud y farmacia",
    "hostelería y ocio",
)

ENTITY_PROFILE_COLUMNS = (
    "entity_id", "entity_kind", "name", "country", "country_method",
    "industry", "industry_method", "generated_at",
)

ENTITY_PROFILE_DDL = """
entity_id VARCHAR NOT NULL, entity_kind VARCHAR NOT NULL, name VARCHAR NOT NULL,
country VARCHAR NOT NULL, country_method VARCHAR NOT NULL,
industry VARCHAR NOT NULL, industry_method VARCHAR NOT NULL,
generated_at TIMESTAMPTZ NOT NULL
"""


def _token_from_env_file() -> str | None:
    """Mismo patron que `core/publish.py`: el token vive en `app/api/.env`."""
    env_path = ROOT / "app" / "api" / ".env"
    if not env_path.exists():
        return None
    for line in env_path.read_text(encoding="utf-8").splitlines():
        key, separator, value = line.partition("=")
        if separator and key.strip() in {"MOTHERDUCK_TOKEN", "motherduck_token"}:
            return value.strip().strip("\"'")
    return None


def connect(database: str) -> duckdb.DuckDBPyConnection:
    if not database.startswith("md:"):
        return duckdb.connect(database)
    token = os.environ.get("MOTHERDUCK_TOKEN") or os.environ.get("motherduck_token")
    token = token or _token_from_env_file()
    if token is None:
        raise RuntimeError("MOTHERDUCK_TOKEN es obligatorio para publicar en la nube")
    return duckdb.connect(database, config={"motherduck_token": token})


# --------------------------------------------------------------------------
# Nombres: composicion determinista sembrada con el identificador
# --------------------------------------------------------------------------

#: Sustantivo de actividad por sector: el nombre habla del mismo negocio que la
#: industria inferida, asi que la ficha no se contradice a si misma.
INDUSTRY_NOUNS: dict[str, tuple[str, ...]] = {
    "industria y manufactura": ("Industrias", "Manufacturas", "Metalúrgica", "Fundiciones", "Cerámicas", "Plásticos", "Talleres", "Forjas"),
    "distribución y mayorista": ("Distribuciones", "Suministros", "Mayoristas", "Almacenes", "Comercial", "Abastecimientos"),
    "servicios profesionales": ("Asesores", "Consultores", "Gestión", "Servicios", "Estudios", "Auditores"),
    "transporte y logística": ("Transportes", "Logística", "Cargas", "Fletes", "Mensajería", "Portes"),
    "alimentación y bebidas": ("Conservas", "Bodegas", "Harinas", "Lácteos", "Cárnicas", "Aceites"),
    "construcción e instalaciones": ("Construcciones", "Obras", "Instalaciones", "Montajes", "Reformas", "Estructuras"),
    "comercio minorista": ("Comercios", "Tiendas", "Droguerías", "Ferreterías", "Papelerías", "Mercantil"),
    "tecnología y software": ("Tecnologías", "Sistemas", "Informática", "Software", "Datos", "Redes"),
    "salud y farmacia": ("Laboratorios", "Clínicas", "Ortopedias", "Farmacéutica", "Diagnósticos", "Sanitaria"),
    "hostelería y ocio": ("Hostelería", "Restauración", "Hoteles", "Turismo", "Balnearios", "Ocio"),
}

#: Toponimos españoles (rios, comarcas y fachadas). 64 x 6 x 4 pasa de 1.500
#: combinaciones por sector: sobra sitio para el sector mas poblado.
TOPONYMS = (
    "Duero", "Ebro", "Tajo", "Guadiana", "Guadalquivir", "Segura", "Júcar", "Turia",
    "Miño", "Sil", "Nervión", "Jalón", "Cinca", "Genil", "Almanzora", "Vinalopó",
    "Sella", "Nalón", "Tormes", "Pisuerga", "Arlanzón", "Órbigo", "Esla", "Carrión",
    "Noroeste", "Levante", "Mediterráneo", "Cantábrico", "Atlántico", "Meseta",
    "Pirineos", "Alcarria", "Mancha", "Penedés", "Maresme", "Vallés", "Aljarafe",
    "Bierzo", "Moncayo", "Montsec", "Aneto", "Gredos", "Guadarrama", "Ordesa",
    "Urgell", "Ampurdán", "Bages", "Tajuña", "Henares", "Segre", "Cidacos", "Arga",
    "Tudela", "Ulzama", "Ribera", "Quintana", "Valverde", "Olmedo", "Cardona",
    "Iranzo", "Lacalle", "Jimena", "Salazar", "Yuste",
)

LEGAL_FORMS = ("S.L.", "S.A.", "S.L.U.", "S.A.U.")

#: Rendirse antes que girar para siempre si un sector se quedase sin combinaciones.
MAX_NAME_ATTEMPTS = 4096


def _seed(text: str) -> int:
    """Entero estable de 64 bits. `hashlib` porque tiene que sobrevivir al proceso."""
    return int.from_bytes(hashlib.blake2b(text.encode("utf-8"), digest_size=8).digest(), "big")


def _pick(options: tuple[str, ...], seed: int, shift: int) -> str:
    """Un tramo distinto de bits para cada pieza del nombre."""
    return options[(seed >> shift) % len(options)]


def company_name(company_id: str, industry: str, taken: set[str]) -> str:
    """`COMP_0001` + `transporte y logística` -> `Transportes Duero S.L.U.`.

    La colision se resuelve reintentando con la semilla `<id>#<intento>`: sigue
    siendo funcion del identificador, no del orden en que se genere.
    """
    nouns = INDUSTRY_NOUNS[industry]
    for attempt in range(MAX_NAME_ATTEMPTS):
        seed = _seed(f"{company_id}#{attempt}")
        name = f"{_pick(nouns, seed, 0)} {_pick(TOPONYMS, seed, 16)} {_pick(LEGAL_FORMS, seed, 32)}"
        if name not in taken:
            return name
    raise RuntimeError(f"sin nombre libre para {company_id}")


def group_name(group_id: str, anchor_base: str, anchor_industry: str, taken: set[str]) -> str:
    """El grupo se llama como su sociedad dominante: `Grupo Transportes Duero`.

    `anchor_base` es el nombre de esa sociedad sin la forma juridica. Si las dos
    variantes estan cogidas se compone una base nueva con los sustantivos de su
    sector, para que el grupo siga sonando a lo que hace.
    """
    seed = _seed(group_id)
    preferred = (f"Grupo {anchor_base}", f"{anchor_base} Holding")
    first = seed % 2
    for name in (preferred[first], preferred[1 - first]):
        if name not in taken:
            return name
    for attempt in range(MAX_NAME_ATTEMPTS):
        fallback_seed = _seed(f"{group_id}#grupo{attempt}")
        name = (
            f"Grupo {_pick(INDUSTRY_NOUNS[anchor_industry], fallback_seed, 0)} "
            f"{_pick(TOPONYMS, fallback_seed, 16)}"
        )
        if name not in taken:
            return name
    raise RuntimeError(f"sin nombre libre para {group_id}")


def base_name(name: str) -> str:
    """`Transportes Duero S.L.U.` -> `Transportes Duero`."""
    for form in LEGAL_FORMS:
        if name.endswith(f" {form}"):
            return name[: -len(form) - 1]
    return name


# --------------------------------------------------------------------------
# Pais: el real manda; el inferido lo fija la moneda
# --------------------------------------------------------------------------

#: `companies.country` llega sucio (`ES`, `ESPAÑA`, `Spain`, `Espanya`...).
COUNTRY_ALIASES: dict[str, str] = {
    "ES": "España", "ESPAÑA": "España", "ESPANA": "España", "ESPANYA": "España", "SPAIN": "España",
    "PT": "Portugal", "PORTUGAL": "Portugal",
    "FR": "Francia", "FRANCIA": "Francia", "FRANCE": "Francia",
    "IT": "Italia", "ITALIA": "Italia", "ITALY": "Italia",
    "DE": "Alemania", "ALEMANIA": "Alemania", "GERMANY": "Alemania",
    "NL": "Países Bajos", "PAISES BAJOS": "Países Bajos", "NETHERLANDS": "Países Bajos",
    "MX": "México", "MEXICO": "México", "MÉXICO": "México",
    "BE": "Bélgica", "BELGICA": "Bélgica", "BELGIUM": "Bélgica",
    "AT": "Austria", "AUSTRIA": "Austria",
    "PL": "Polonia", "POLONIA": "Polonia", "POLAND": "Polonia",
    "SE": "Suecia", "SUECIA": "Suecia", "SWEDEN": "Suecia",
    "GB": "Reino Unido", "UK": "Reino Unido", "REINO UNIDO": "Reino Unido",
    "US": "Estados Unidos", "USA": "Estados Unidos", "ESTADOS UNIDOS": "Estados Unidos",
    "MY": "Malasia", "MALAYSIA": "Malasia", "MALASIA": "Malasia",
}

#: Reparto de una plataforma de tesoreria española para las empresas en euro sin
#: pais real. Suma 100; se reparte por hash del id, no por sorteo.
EURO_MIX: tuple[tuple[str, int], ...] = (
    ("España", 72), ("Portugal", 7), ("Francia", 6),
    ("Italia", 5), ("Alemania", 5), ("Países Bajos", 5),
)

#: Coherencia moneda-pais: si el dinero se mueve en esta divisa, la empresa vive
#: en este pais. El euro no esta aqui: lo reparte `EURO_MIX`.
CURRENCY_COUNTRY: dict[str, str] = {
    "USD": "Estados Unidos", "GBP": "Reino Unido", "MXN": "México", "BRL": "Brasil",
    "DKK": "Dinamarca", "COP": "Colombia", "CAD": "Canadá", "AUD": "Australia",
    "PEN": "Perú", "CLP": "Chile", "PLN": "Polonia", "AED": "Emiratos Árabes Unidos",
    "NZD": "Nueva Zelanda", "NOK": "Noruega", "AOA": "Angola", "CHF": "Suiza",
    "ARS": "Argentina", "SEK": "Suecia", "INR": "India", "VND": "Vietnam",
    "JPY": "Japón", "MZN": "Mozambique", "CZK": "Chequia", "BAM": "Bosnia y Herzegovina",
    "NAD": "Namibia", "ILS": "Israel", "GHS": "Ghana", "MYR": "Malasia",
    "XOF": "Senegal", "SGD": "Singapur", "HUF": "Hungría", "RON": "Rumanía",
    "HKD": "Hong Kong", "PHP": "Filipinas", "ZAR": "Sudáfrica", "THB": "Tailandia",
    "RUB": "Rusia", "TRY": "Turquía",
}

#: Debajo de esta cuota la divisa no manda: una cuenta suelta en dolares no
#: muda la sede social de una empresa que opera en euros.
CURRENCY_DOMINANCE = 0.5


def _text(value: object) -> str | None:
    """Las columnas nulas llegan de pandas como `NaN`, no como `None`."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def normalise_country(raw: object) -> str | None:
    """El pais real, en castellano. Un valor que no reconocemos no es un pais real."""
    cleaned = _text(raw)
    return None if cleaned is None else COUNTRY_ALIASES.get(cleaned.upper())


def infer_country(entity_id: str, currency: str | None, share: float) -> str:
    """Pais inferido de la moneda dominante; en euro, del reparto de `EURO_MIX`."""
    if currency is not None and share >= CURRENCY_DOMINANCE:
        country = CURRENCY_COUNTRY.get(currency)
        if country is not None:
            return country
    bucket = _seed(f"{entity_id}#pais") % 100
    running = 0
    for country, weight in EURO_MIX:
        running += weight
        if bucket < running:
            return country
    return EURO_MIX[0][0]


# --------------------------------------------------------------------------
# Industria: se infiere de los movimientos
# --------------------------------------------------------------------------

#: Rasgos por sociedad, todos en cuota sobre su propio total. Las sumas van
#: redondeadas a centimos porque DuckDB agrega en paralelo y la suma en coma
#: flotante no es asociativa.
FEATURES_SQL = """
WITH tx AS (
  SELECT company_id,
         date_trunc('month', date) AS month,
         category,
         round(amount, 2) AS amount
  FROM transactions
), flows AS (
  SELECT company_id,
    round(sum(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 2) AS outflow,
    round(sum(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) AS inflow,
    round(sum(CASE WHEN category IN ('salary','social_security') THEN abs(amount) ELSE 0 END), 2) AS salary,
    round(sum(CASE WHEN category IN ('pos_settlement','pos_withdrawal','cash_settlement','cash_settlements','cash_withdrawal') THEN abs(amount) ELSE 0 END), 2) AS pos_cash,
    round(sum(CASE WHEN category = 'bulk_collection' THEN abs(amount) ELSE 0 END), 2) AS bulk_collection,
    round(sum(CASE WHEN category = 'utility' THEN abs(amount) ELSE 0 END), 2) AS utility,
    round(sum(CASE WHEN category IN ('payment','bulk_payment','payment_refund') THEN abs(amount) ELSE 0 END), 2) AS supplier_payments
  FROM tx GROUP BY company_id
), monthly AS (
  SELECT company_id, month, round(sum(CASE WHEN amount > 0 THEN amount ELSE 0 END), 2) AS inflow
  FROM tx GROUP BY company_id, month
), season AS (
  SELECT company_id,
    round(avg(inflow), 2) AS mean_inflow,
    round(stddev_pop(inflow), 2) AS sd_inflow
  FROM monthly GROUP BY company_id
), counterparties AS (
  SELECT company_id, count(DISTINCT counterparty_id)::INTEGER AS n_counterparties
  FROM transactions GROUP BY company_id
), volume AS (
  SELECT company_id, round(sum(abs(round(amount, 2))), 2) AS movement_volume,
         count(*)::INTEGER AS n_transactions
  FROM transactions GROUP BY company_id
), products AS (
  SELECT product_id, currency FROM banking_products
  UNION ALL SELECT product_id, currency FROM debt_products
), currency_use AS (
  SELECT t.company_id, p.currency, count(*) AS n,
         row_number() OVER (PARTITION BY t.company_id ORDER BY count(*) DESC, p.currency) AS rank,
         sum(count(*)) OVER (PARTITION BY t.company_id) AS total
  FROM transactions t JOIN products p USING (product_id)
  GROUP BY t.company_id, p.currency
), dominant_currency AS (
  SELECT company_id, currency, n::DOUBLE / total AS share
  FROM currency_use WHERE rank = 1
)
SELECT c.company_id, c.group_id, c.country AS raw_country, c.currency AS declared_currency,
  coalesce(d.currency, c.currency) AS currency,
  coalesce(d.share, 1.0) AS currency_share,
  coalesce(f.outflow, 0) AS outflow, coalesce(f.inflow, 0) AS inflow,
  coalesce(f.salary, 0) AS salary, coalesce(f.pos_cash, 0) AS pos_cash,
  coalesce(f.bulk_collection, 0) AS bulk_collection, coalesce(f.utility, 0) AS utility,
  coalesce(f.supplier_payments, 0) AS supplier_payments,
  coalesce(s.mean_inflow, 0) AS mean_inflow, coalesce(s.sd_inflow, 0) AS sd_inflow,
  coalesce(p.n_counterparties, 0) AS n_counterparties,
  coalesce(v.movement_volume, 0) AS movement_volume,
  coalesce(v.n_transactions, 0) AS n_transactions
FROM companies c
LEFT JOIN flows f USING (company_id)
LEFT JOIN season s USING (company_id)
LEFT JOIN counterparties p USING (company_id)
LEFT JOIN volume v USING (company_id)
LEFT JOIN dominant_currency d USING (company_id)
ORDER BY c.company_id
"""


def _share(part: float, whole: float) -> float:
    return float(part) / float(whole) if whole > 0 else 0.0


def classify_industry(row: pd.Series) -> str:
    """Cascada sobre cuatro ejes reales; gana la primera regla que encaja.

    Los ejes son los unicos que el dataset da de verdad: el reparto de
    `transactions.category`, el peso de la nomina sobre el gasto, la
    estacionalidad del cobro (`cv` = desviacion / media del cobro mensual) y el
    numero de contrapartes distintas. Los cortes son constantes fijas, no
    percentiles de la cohorte: asi la industria de una empresa no se mueve
    cuando cambia el conjunto cargado.

    1. Liquidacion de TPV y efectivo por encima del 8 % del cobro -> venta al
       publico: `hostelería y ocio` si ademas el cobro es muy estacional
       (cv >= 1,2), `comercio minorista` si es regular.
    2. Remesas de cobro domiciliadas (>= 2 % del cobro) -> cartera recurrente:
       `salud y farmacia` si la nomina pesa (>= 8 % del gasto: servicio prestado
       por plantilla), `distribución y mayorista` si no (giro a muchos puntos).
    3. Nomina por encima del 22 % del gasto -> negocio intensivo en personas:
       `servicios profesionales` si el cobro es regular (cv <= 1,0),
       `construcción e instalaciones` si va a golpes de certificacion.
    4. Suministros por encima del 12 % del gasto -> consumo energetico alto:
       `transporte y logística` con >= 25 contrapartes (flota y corresponsales),
       `industria y manufactura` con menos (planta y pocos clientes grandes).
    5. Mas de 60 contrapartes y el 40 % del gasto en proveedores ->
       `distribución y mayorista`.
    6. Cobro plano (cv <= 0,65) -> ingreso recurrente: `tecnología y software`
       si hay nomina propia (>= 2 %); si no, se queda en el resto.
    7. Nomina entre el 10 % y el 22 % -> `servicios profesionales` con cobro
       regular (cv <= 1,2), `construcción e instalaciones` si no.
    8. Cobro muy estacional (cv >= 1,4) con menos de 30 contrapartes ->
       `alimentación y bebidas` (campaña).
    9. Gasto concentrado en proveedores (>= 55 %) y pocas contrapartes ->
       `construcción e instalaciones` (subcontrata).
    10. Resto -> `industria y manufactura`: es el cajon de las sociedades sin
        señal (sin nomina, sin TPV, sin suministros y casi sin contrapartes).
    """
    salary = _share(row.salary, row.outflow)
    pos = _share(row.pos_cash, row.inflow)
    bulk = _share(row.bulk_collection, row.inflow)
    utility = _share(row.utility, row.outflow)
    supplier = _share(row.supplier_payments, row.outflow)
    cv = _share(row.sd_inflow, row.mean_inflow)
    counterparties = int(row.n_counterparties)

    if pos >= 0.08:
        return "hostelería y ocio" if cv >= 1.2 else "comercio minorista"
    if bulk >= 0.02:
        return "salud y farmacia" if salary >= 0.08 else "distribución y mayorista"
    if salary >= 0.22:
        return "servicios profesionales" if cv <= 1.0 else "construcción e instalaciones"
    if utility >= 0.12:
        return "transporte y logística" if counterparties >= 25 else "industria y manufactura"
    if counterparties >= 60 and supplier >= 0.40:
        return "distribución y mayorista"
    if cv <= 0.65 and salary >= 0.02:
        return "tecnología y software"
    if salary >= 0.10:
        return "servicios profesionales" if cv <= 1.2 else "construcción e instalaciones"
    if cv >= 1.4 and counterparties < 30:
        return "alimentación y bebidas"
    if supplier >= 0.55 and counterparties < 40:
        return "construcción e instalaciones"
    return "industria y manufactura"


# --------------------------------------------------------------------------
# Construccion de la tabla
# --------------------------------------------------------------------------

def build_profiles(connection: duckdb.DuckDBPyConnection, generated_at: datetime) -> pd.DataFrame:
    """Una fila por sociedad y una por grupo, en orden de identificador."""
    features = connection.sql(FEATURES_SQL).df()
    features = features.sort_values("company_id").reset_index(drop=True)
    features["industry"] = features.apply(classify_industry, axis=1)

    taken: set[str] = set()
    rows: list[dict[str, object]] = []
    companies_by_group: dict[str, list[dict[str, object]]] = {}

    for row in features.itertuples(index=False):
        industry = str(row.industry)
        real_country = normalise_country(row.raw_country)
        country = real_country or infer_country(
            row.company_id, _text(row.currency), float(row.currency_share),
        )
        name = company_name(row.company_id, industry, taken)
        taken.add(name)
        profile = {
            "entity_id": row.company_id,
            "entity_kind": "company",
            "name": name,
            "country": country,
            "country_method": "real" if real_country else "inferred",
            "industry": industry,
            "industry_method": "inferred",
            "generated_at": generated_at,
        }
        rows.append(profile)
        companies_by_group.setdefault(row.group_id, []).append(
            {**profile, "volume": float(row.movement_volume), "n_transactions": int(row.n_transactions)},
        )

    groups = connection.sql("SELECT group_id FROM groups ORDER BY group_id").df()
    for group_id in groups["group_id"]:
        members = companies_by_group.get(group_id, [])
        # Dominante = mayor volumen de movimientos; el numero de apuntes y el id
        # desempatan para que el grupo no cambie de nombre entre ejecuciones.
        anchor = max(
            members,
            key=lambda member: (member["volume"], member["n_transactions"], member["entity_id"]),
            default=None,
        )
        if anchor is None:
            # Grupo sin filiales en la muestra: se compone desde su propio id.
            industry = INDUSTRIES[_seed(group_id) % len(INDUSTRIES)]
            base = base_name(company_name(group_id, industry, taken))
            country, country_method = infer_country(group_id, None, 0.0), "inferred"
        else:
            industry = str(anchor["industry"])
            base = base_name(str(anchor["name"]))
            country, country_method = str(anchor["country"]), str(anchor["country_method"])
        name = group_name(group_id, base, industry, taken)
        taken.add(name)
        rows.append({
            "entity_id": group_id,
            "entity_kind": "group",
            "name": name,
            "country": country,
            "country_method": country_method,
            "industry": industry,
            "industry_method": "inferred",
            "generated_at": generated_at,
        })

    return pd.DataFrame(rows, columns=list(ENTITY_PROFILE_COLUMNS))


def publish(connection: duckdb.DuckDBPyConnection, profiles: pd.DataFrame, output: Path) -> None:
    """Fichero local primero y carga en bloque: fila a fila tardaria horas."""
    output.parent.mkdir(parents=True, exist_ok=True)
    profiles.to_parquet(output, index=False)
    staged = pd.read_parquet(output)
    connection.register("entity_profile_stage", staged)
    try:
        connection.execute(f"CREATE OR REPLACE TABLE entity_profile ({ENTITY_PROFILE_DDL})")
        connection.execute(
            "INSERT INTO entity_profile SELECT "
            + ", ".join(ENTITY_PROFILE_COLUMNS)
            + " FROM entity_profile_stage",
        )
    finally:
        connection.unregister("entity_profile_stage")


def main() -> int:
    parser = argparse.ArgumentParser(description="Publica entity_profile (identidad de presentacion)")
    parser.add_argument("--database", default=DEFAULT_DATABASE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--dry-run", action="store_true", help="solo escribe el fichero local")
    args = parser.parse_args()

    connection = connect(args.database)
    try:
        profiles = build_profiles(connection, datetime.now(timezone.utc))
        if args.dry_run:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            profiles.to_parquet(args.output, index=False)
        else:
            publish(connection, profiles, args.output)
    finally:
        connection.close()

    print(f"entity_profile: {len(profiles)} filas -> {args.output}")
    print(profiles["industry"].value_counts().to_string())
    print(profiles["country"].value_counts().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
