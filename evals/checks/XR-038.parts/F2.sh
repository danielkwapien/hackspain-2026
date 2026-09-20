# XR-038 · Fase 2 · Tipografia y limpieza (W1.1-W1.6, W3, W5, W6). Todo son
# tamanos de la escala, colores y borrados: ni un `px` suelto fuera de los nueve
# tokens de §1 del informe. Ancla los criterios 1, 2, 3, 4 y 12 de §8.

# 1 · La ficha de COMP_0169 ensena SEIS insignias mas el regimen —codigo,
# industria, pais, ERP, grupo e historia— a `--text-control` (12 px), con
# `px-2.5 py-1` y pegadas al titulo (`gap-1`).
# 2 · Una sociedad sin ERP (541 de 1.286, el 42 %) ensena CINCO: la insignia no
# se pinta. Ni hueco, ni «—», ni «Sin ERP»: la fila de identidad no es un
# formulario.
web_test src/panels/research/EntityIdentity.test.tsx

# 1 · Los 20 valores crudos de `companies.erp` son camelCase (§7.4 del informe)
# y se traducen con un diccionario propio. `humanizeCode` daria «business
# central» en minusculas, que no es el nombre comercial de nada.
web_test src/lib/definitions.test.ts

# 3 · El Score vuelve a llevar su unidad y se lee `81,1 pts (▲ +41,1 pts)`, la
# cifra a `--text-figure-lg` (30 px) y la etiqueta centrada encima. Se mide en
# la ficha entera porque `SheetHeader` no se monta solo.
web_test src/panels/research/ResearchPanel.test.tsx

# 4 · La celda «Conclusion» saca el texto de la capsula glass —suelto, a
# `--text-body`, con su ⓘ como las otras cinco— y los titulos de las seis celdas
# pasan a blanco a 12 px peso 400 con la cifra a 30 px peso 600 (W1.3, W1.4).
web_test src/panels/research/KpiRow.test.tsx

# W1.4 · W1.5 · W1.6 · La cabecera «TESORERIA» a `--text-section` peso 600 en
# blanco, la cifra de las seis cards a `--text-figure-lg` y el pie a
# `--text-micro` en secundario. La rejilla de seis se queda.
web_test src/panels/research/TreasuryRow.test.tsx

# 12 · El Mapa no tiene la linea de censo —ni el bloque `status`, ni la prop, ni
# los calculos que solo la alimentaban— y su boton `Filtros` esta a la derecha
# con los controles subidos a `--text-body` y `--size-segment`.
web_test src/widgets/treemap/TreemapWidget.test.tsx
web_test src/widgets/treemap/TreemapHeader.test.tsx

# W3.3 · El nombre de columna a `--text-body` peso 600 en blanco; el recuento y
# el importe se quedan en micro secundario: lo que se lee de un vistazo es la
# palabra, no la cifra.
web_test src/widgets/treemap/TreemapColumns.test.tsx

# W5.1 · W5.2 · Cartera: las tres cifras de cabecera en la misma escala. Alertas:
# el nombre de la sociedad a 13 px blanco peso 600 y la causa a 13 px en
# secundario, con `ROW_HEIGHT` subido a 34 px y el mensaje del motor SIN pintar.
web_test src/widgets/portfolio/PortfolioWidget.test.tsx
web_test src/widgets/alerts/AlertsWidget.test.tsx

# W6 · Marca y cabecera: logo `size-7`, «Kima» a `--text-figure`, pestanas a
# `--text-tile` y el buscador a `--text-section`, sin que la topbar de 60 px
# crezca ni el disparador se descentre. El fichero del logo no existe (la imagen
# llego en blanco): se aplican los tamanos y `Logo.tsx` se deja como esta.
web_test src/components/topbar.test.tsx
web_test src/components/SearchTrigger.test.tsx
