/**
 * Lector CSV mínimo (RFC 4180) para las tablas de `datasets_mocked/`.
 *
 * No es un parser general: no hay dependencia de CSV en `app/api` y no se añade
 * ninguna. Hace falta tratar comillas de verdad porque las tablas del mock las
 * llevan: `alerts.message`, `narratives.body`, `drivers.value_fmt`,
 * `signals.value_fmt` y `signal_catalog.anchors` son texto con comas dentro
 * (`"[[0,0.0],[10,0.3]]"`, `"deterioro confirmado: el score cae 3,7 puntos"`).
 * Un `split(",")` partiría esas filas por la mitad.
 *
 * `forEachRow` no materializa la tabla: `signals.csv` son 438.701 filas y 80 MB,
 * y guardar `string[][]` intermedio antes de tipar multiplicaría la memoria.
 */

/** Recorre el CSV fila a fila. `onRow` recibe los valores crudos, sin cabecera. */
export function forEachRow(
  text: string,
  onRow: (values: string[], header: string[], index: number) => void,
): void {
  let header: string[] | null = null;
  let index = 0;
  let cursor = 0;
  const length = text.length;

  while (cursor < length) {
    const values: string[] = [];
    let endOfRow = false;

    while (!endOfRow) {
      if (text[cursor] === '"') {
        // Campo entrecomillado: se recorta entre comillas y solo se concatena
        // cuando hay `""` escapadas (raro: `signal_catalog.anchors`).
        let field = "";
        cursor += 1;
        for (;;) {
          const closing = text.indexOf('"', cursor);
          if (closing === -1) {
            field += text.slice(cursor);
            cursor = length;
            break;
          }
          field += text.slice(cursor, closing);
          if (text[closing + 1] === '"') {
            field += '"';
            cursor = closing + 2;
            continue;
          }
          cursor = closing + 1;
          break;
        }
        values.push(field);
        if (text[cursor] === ",") cursor += 1;
        else endOfRow = true;
      } else {
        // Campo normal: un solo `slice`, sin concatenar carácter a carácter.
        let end = cursor;
        while (end < length) {
          const char = text[end];
          if (char === "," || char === "\n") break;
          end += 1;
        }
        const stop = text[end - 1] === "\r" ? end - 1 : end;
        values.push(text.slice(cursor, stop));
        cursor = end;
        if (text[cursor] === ",") cursor += 1;
        else endOfRow = true;
      }
    }
    while (cursor < length && (text[cursor] === "\n" || text[cursor] === "\r")) cursor += 1;

    if (values.length === 1 && values[0] === "") continue; // línea en blanco final
    if (header === null) {
      header = values;
      continue;
    }
    onRow(values, header, index);
    index += 1;
  }
}

/** Índice `columna -> posición` de la cabecera, para leer sin construir objetos. */
export function columnIndex(header: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  header.forEach((name, position) => {
    index[name] = position;
  });
  return index;
}

/** Texto de la celda, o `null` si está vacía. */
export function cellText(values: string[], position: number | undefined): string | null {
  if (position === undefined) return null;
  const raw = values[position];
  return raw === undefined || raw === "" ? null : raw;
}

/** Número de la celda, o `null` si está vacía o no es un número. */
export function cellNumber(values: string[], position: number | undefined): number | null {
  const raw = cellText(values, position);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Booleano de la celda: el generador de Python escribe `True` / `False`. */
export function cellBoolean(values: string[], position: number | undefined): boolean {
  return cellText(values, position) === "True";
}
