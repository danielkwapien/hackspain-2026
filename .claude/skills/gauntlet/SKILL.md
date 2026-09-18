---
name: gauntlet
description: Somete el demo path al criterio de un jurado VC mediante un critico
  ciego que evalua paso a paso donde se pierde la confianza. Acepta como argumento
  el numero maximo de pasadas (default 3).
disable-model-invocation: true
---
# Gauntlet: el jurado antes del jurado

Criterio primario, en cada paso de la demo: "¿en que paso perderia la confianza
un jurado?". No "¿funciona?", sino "¿convence?".

## Protocolo

1. Lee el demo path (docs/pitch/guion.md si existe; si no, el happy path de
   docs/spec/product.md).
2. Lanza el agente adversary con rol de critico ciego: recibe el guion paso a
   paso y acceso a la app desplegada o local, sin contexto de construccion.
3. El critico recorre la demo PASO A PASO y emite decision BINARIA por paso:
   CONFIA o PIERDE (con el motivo en una linea). Sin medias tintas.
4. Si docs/spec/product.md declara un referente comparable: captura las
   pantallas equivalentes y compara las nuestras contra las del referente;
   la comparacion alimenta el veredicto del paso.
5. Con los pasos en PIERDE, produce la lista priorizada de arreglos (que paso,
   que rompe la confianza, arreglo minimo propuesto) y entregala al usuario.
   Los arreglos entran por /express o /new-feature, nunca los haces tu aqui.

## Presupuesto

- El argumento de la skill es el numero maximo de pasadas completas; sin
  argumento, 3.
- Cada pasada re-evalua SOLO los pasos que estaban en PIERDE.
- Presupuesto agotado con pasos aun en PIERDE: reportalo tal cual; decidir si
  se demo-a con eso es del humano.
