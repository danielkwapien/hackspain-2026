# XR-038 · Fase 4 · Las tres tablas de evidencia de W2.3 en pantalla. La fase 1
# sirve `/cash`, `/debt` y `/activity`; esta las pinta bajo Liquidez, Deuda y
# Actividad, que hasta ahora ensenaban cuatro senales y dos tercios del widget
# en blanco. Ancla los criterios 8, 9 y 10 de §8 del informe.

# 8 · «Donde esta la caja»: con COMP_0169, seis productos en cinco bancos, el
# saldo total SOLO en euros (217.665,33) y USD listado aparte —39 monedas en el
# dataset y ninguna tabla de cambio—, y Abanca CHECKING_03, que no tiene fila en
# `balances`, con «—» y nunca 0. Sin columna «Disponible»: `balances.available`
# esta vacia en las 7.996 filas y seria una columna entera de guiones.
web_test src/widgets/research-deep/CashPositions.test.tsx

# 9 · «Posiciones de financiacion»: diez productos de COMP_0169 en magnitudes,
# con encabezados que dicen que son «Concedido» y «Saldo vivo», y NINGUNA ratio
# de utilizacion calculada desde esas dos columnas (los signos de origen estan
# mezclados: `granted` negativo en 2.043 de 2.239 filas, `outstanding` negativo
# en 1.351, positivo en 155 y cero en 743). Las 908 sociedades sin financiacion
# reciben el estado vacio, nunca una tabla de ceros.
web_test src/widgets/research-deep/DebtPositions.test.tsx

# 10 · «Ultimos movimientos»: lo que identifica el movimiento es categoria +
# banco/producto, porque el 77,6 % de las descripciones lleva marcadores de
# anonimizacion (1.636.103 de 2.555.981). La categoria `-` se etiqueta «Sin
# clasificar» y NO se esconde: es la mayor de todas (635.530 movimientos). Un
# producto fuera de los dos catalogos (1.314 movimientos) da «—», no descarta
# la fila.
web_test src/widgets/research-deep/RecentActivity.test.tsx

# Las tres cuelgan de la familia activa del widget profundo, y solo de la suya.
web_test src/widgets/research-deep/ResearchDeepWidget.test.tsx

# Los codigos crudos (`checking`, `lineofcredit`, `debt_repayment`) se traducen
# con indexado degradado: uno que el motor publique y el front no conozca se
# pinta humanizado y NO tumba la tabla (leccion de XR-034, en AGENTS.md). El
# dataset ya trae `cash_settlements`, que no esta en las diez categorias
# medidas del informe.
web_test src/lib/definitions.test.ts

# Los tres fetchers del cliente v2, contra la forma real del contrato.
web_test src/lib/api-v2.test.ts

# La descripcion ni siquiera viaja: la API no la sirve, asi que `[NUM]` y
# `[COMPANY]` no pueden ser el contenido principal de ninguna columna.
api_json /api/v2/companies/COMP_0169/activity '[.items[] | keys[]] | unique | map(select(test("desc"))) | length == 0'
