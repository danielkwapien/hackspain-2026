# XR-038 · Fase 6 · Metodologia (W2.5). El pop-up «Como se calcula» recupera
# complejidad —prosa larga y dos formulas— sin publicar el modelo. Ancla el
# criterio 11 de §8 del informe: `BandScale` y `WeightsRow` cada uno en su fila
# a ancho completo y el dialogo SIGUE SIN SCROLL a 1440×900 y a 1280×800.

# El front que se mide es el de ESTE worktree: si BASE_URL no responde, la
# medida de scroll de 1440×900 y 1280×800 se habria tomado sobre otra rama.
route_ok / 200

# 11 · Las dos filas a ancho completo (BandScale arriba, WeightsRow debajo, ni
# una rejilla de dos columnas), las barras a 10 px con sus textos a
# `--text-body` y las etiquetas de banda y de familia en blanco; cinco bloques
# de prosa de dos o tres parrafos; DOS formulas como maximo, en una card y como
# elemento visual; y ni pesos por senal, ni anclas, ni umbrales de regimen.
# El «sin scroll» que aqui se puede fijar es el estructural —`overflow-hidden`
# en la seccion, en la rejilla y en cada card, y ni un `overflow-y-auto`—:
# jsdom no tiene layout, asi que la medida real (`scrollHeight` vs
# `clientHeight` en las dos resoluciones) va en la verificacion del frontal.
web_test src/panels/research/Methodology.test.tsx

# La fase toca tamanos de texto y grosores de barra: se repite `tokens.test.ts`
# para que la escala siga teniendo nueve tamanos y ninguna card del pop-up
# invente un `px` tipografico suelto ni una segunda familia monoespaciada.
web_test src/design/tokens.test.ts
