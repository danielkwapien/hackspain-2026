# Data analysis

Espacio común del equipo para ciencia de datos, análisis financiero, ingeniería de variables, scoring, forecasting y experimentos de modelos, principalmente en Python.

## Fuente del problema

Leer primero [PROBLEM.md](../PROBLEM.md), especialmente el brief transcrito, requisitos y preguntas abiertas. Las notas de [docs/dani](../docs/dani/README.md) son propuestas de Dani, no decisiones del equipo.

## Alcance previsto

- Inspección del dataset y su diccionario; validación de calidad, claves y cobertura.
- EDA y visualizaciones, notebooks reproducibles y extracción de señales.
- Features por sociedad/grupo y mes, calculadas respetando la información disponible en cada corte.
- Comparación de scores explicables, clasificación de trayectoria y forecasting.
- Evaluación temporal y generalización a grupos no vistos.
- Exportación reproducible de resultados para el dashboard y, una vez confirmado el contrato, el test oculto.

La estructura interna, dependencias y herramientas se decidirán al disponer de los datos. Este README no crea un framework ni asigna responsables.

## Acuerdos mínimos propuestos para colaborar

1. Cada experimento identifica autor, hipótesis, snapshot de datos, features, splits, configuración y resultados.
2. Compartir cortes de evaluación; todas las sociedades de un grupo permanecen juntas. Ajustar escaladores, imputación y selección de features solo en entrenamiento.
3. No sobrescribir notebooks o resultados ajenos. Separar exploración de funciones reutilizables cuando estas se estabilicen.
4. No subir credenciales, entornos, cachés, pesos ni datasets voluminosos al Git sin acordar distribución, permisos e ignores.
5. Distinguir datos observados, reconstrucciones, predicciones y fixtures sintéticos. No presentar un experimento propuesto como validado.
6. La integración recomendada es exportar resultados versionados para que la API los sirva: no entrenar en cada petición ni duplicar el motor financiero en TypeScript.

Todavía no hay código, dependencias ni benchmarks implementados en esta carpeta.
