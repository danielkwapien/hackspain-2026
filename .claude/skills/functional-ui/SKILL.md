---
name: functional-ui
description: Crea los mocks HTML funcionales del producto, mocks/app.html (clon de
  toda la app) y features/<id>/app.html (solo el delta de una feature). Usar cuando
  una feature necesita mock aprobable antes de encolarse o al fijar el diseno global.
---
# Functional-ui: mocks HTML funcionales

Objetivo: que el humano apruebe la interfaz ANTES de que el loop construya, con
un HTML que se abre en el navegador y se toca, no con una descripcion.

## mocks/app.html (el clon global)

1. SOLO si mocks/app.html no existe. Si existe, no lo toques: es la referencia
   aprobada. Los cambios globales de diseno los decide el humano editandolo o
   borrandolo para regenerar.
2. Es un clon HTML funcional de TODA la app: todas las pantallas del producto
   navegables entre si (anclas o JS minimo inline).
3. Un solo fichero autocontenido: CSS inline en <style>, JS inline en <script>,
   sin imagenes externas, sin CDN.
4. Usa design.functional.md como fuente del sistema de diseno (colores, tipografia,
   espaciado, tono). Si design.functional.md esta vacio, usa un sistema neutro y
   anotalo al principio del fichero en un comentario HTML.

## features/<id>/app.html (el delta)

1. Uno por feature, en el directorio de la feature.
2. Muestra UNICAMENTE el delta: la pantalla o el fragmento que la feature añade
   o cambia, no la app entera otra vez.
3. Mismas reglas: un fichero, autocontenido, sin frameworks.

## Reglas

- Los mocks son desechables: no son la implementacion, no se importan desde
  app/, no se les escribe test. Se tiran cuando la feature esta hecha.
- Sin frameworks: nada de React, Tailwind compilado ni build steps. HTML + CSS
  + JS planos que se abren con file://.
- El mock es el contrato visual del spec: la captura de verificacion de la
  feature se compara contra el.
