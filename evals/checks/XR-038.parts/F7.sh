# XR-038 · Fase 7 · La cabecera de Cartera a su ancho nuevo (W5.1 sobre W4.1).
#
# W5.1 subió las tres cifras de la cabecera a `--text-figure`, y W4.1 movió el
# widget de w8 a w6. Juntas dejaban la cabecera recortada: medido en el tablero
# Investigacion a 1440 x 900, sin maximizar, el `dl` da 314 px y las tres
# columnas iguales de `grid-cols-3` dan 91 px cada una, mientras el contenido
# pide 99 px («EUR 3,6 M») y 240 px («1 tension · 4 vigilancia»). En la demo se
# leia «EUR 3,…» y «1 tens…».
#
# El contrato que ancla el arreglo, y que jsdom si puede medir: la cabecera deja
# de repartir tres columnas iguales (las columnas se dimensionan por contenido)
# y «En riesgo» pasa a cifra compacta con la frase entera en `title` y para el
# lector de pantalla —el mismo recurso que W5.2 usa en Alertas—, conservando la
# escala de W5.1: etiqueta a `--text-control` blanca, valor a `--text-figure`
# peso 600 en las tres.
web_test src/widgets/portfolio/PortfolioWidget.test.tsx
