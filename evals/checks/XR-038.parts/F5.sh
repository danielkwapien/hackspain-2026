# XR-038 · Fase 5 · «Operar» (W4). Los criterios 13, 14 y 15 de §8 del informe.
#
# 13 · El tablero Investigacion tiene SIETE widgets, Operar en la primera fila y
# Favoritos entre Cartera y Comparativa en la segunda; las dos filas suman 24
# columnas exactas. Y el `minSize.w` declarado de Favoritos y Alertas baja a 5:
# el minimo solo se aplica al arrastrar, pero dejarlo en 6 con un layout fijo de
# 5 es una incoherencia que el test del registro tiene que cazar.
web_test src/dashboard/fixed/fixed.test.ts
web_test src/widgets/registry.test.ts

# 14 · La aritmetica de la simulacion es la cuota francesa
# (`c = P·i / (1 − (1+i)^−n)`, `i` mensual), no interes simple, y con `i = 0`
# degrada a `P/n`. Vive aparte del componente porque es la parte que una
# pregunta de un tesorero puede tumbar.
web_test src/widgets/trade/trade-math.test.ts

# 14 · El primitivo que no existia: casilla con `aria-checked` y
# `focus-visible:ring`, como el resto de `components/ui/`.
web_test src/components/ui/checkbox.test.tsx

# 14 · El widget entero: los cinco controles mueven las tres cifras calculadas,
# `Operar` abre el dialogo, `Enviar oferta` lleva `disabled` REAL en el
# `<button>` hasta marcar la casilla, y al confirmar salen el sobre y el aviso,
# que se va solo a los 2,5 s.
# 15 · Con `prefers-reduced-motion: reduce` el sobre no vuela pero el aviso
# sigue apareciendo: es la confirmacion de la accion, no un adorno.
web_test src/widgets/trade/TradeWidget.test.tsx
