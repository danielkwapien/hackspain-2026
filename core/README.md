# Static scoring baseline

Pipeline batch, sin dependencias externas, que calcula una foto de salud financiera por sociedad a
`2026-09-01`. No estima probabilidad de impago ni trayectoria: combina liquidez, utilización de líneas,
mora y comportamiento de pago en un score explicable de 0 a 100.

## Ejecución

Desde la raíz del repositorio:

```bash
python3 core/pipeline.py
```

También se puede abrir `core/pipeline.py` en PyCharm y ejecutar `main`; no recibe argumentos y resuelve
las rutas desde la ubicación del propio archivo.

## Entradas y salidas

Lee `companies.csv`, `banking_products.csv`, `balances.csv`, `debt_products.csv` e `invoices.csv.gz` de
`datasets/`. Genera un único fichero con todas las sociedades en `core/outputs/scores.json`. El pipeline
no lee ni escribe nada dentro de `app/`; los equipos de API y frontend pueden integrar después este
contrato sin acoplar el cálculo a la aplicación.

`scoring.py` contiene únicamente funciones financieras puras y sus umbrales. `pipeline.py` se ocupa de
leer, validar, agregar y exportar. Las facturas negativas se tratan como proveedor y las positivas como
cliente, solo se consolida la moneda funcional, y la ausencia de datos reduce cobertura en lugar de
convertirse en cero.
