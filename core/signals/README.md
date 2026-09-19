# Crear señales en paralelo

Cada señal recibe el panel común de `pipeline_embat.py` y devuelve una
`pandas.Series` con el mismo índice: un valor crudo por grupo y mes. El motor
convierte ese valor a 0–100 con sus anclas y lo incorpora al pilar indicado.

## Flujo de trabajo

1. Cada persona crea su propio módulo o trabaja en un fichero de pilar distinto.
2. Define una función causal: un mes nunca puede mirar meses futuros.
3. Exporta un objeto `Signal` con nombre, pilar, peso, anclas y función.
4. Prueba cobertura, determinismo y sentido financiero de forma aislada.
5. Solo cuando ambos decidáis incorporarla, añadidla juntos a `active.py`.
6. Comparad `evaluate.py` antes y después de activarla.

Una función puede ser una ratio, una media móvil o la salida de un modelo. Un
modelo debe cargar parámetros ya entrenados o validarse walk-forward; entrenar
con meses futuros para puntuar el pasado introduce fuga temporal.

## Ejemplo

```python
def transaction_growth(panel):
    current = panel.groupby("group_id")["n_tx"].transform(
        lambda values: values.rolling(3, min_periods=3).sum()
    )
    previous = current.groupby(panel["group_id"]).shift(3)
    return current / previous.where(previous > 0) - 1

SIGNALS = [
    Signal(
        name="transaction_growth",
        pillar="activity",
        label="Crecimiento del número de operaciones",
        weight=15,
        anchors=((-0.5, 0), (0, 60), (0.5, 100)),
        calculate=transaction_growth,
    )
]
```

No leáis los CSV desde una señal. Si falta una materia prima común, añadidla
una vez al constructor del panel y documentadla.
