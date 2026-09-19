/**
 * Frontera de error de un widget.
 *
 * El tablero monta widgets independientes y hasta XR-035 compartian destino: un
 * `TypeError` dentro de la lista de alertas desmontaba el arbol entero y dejaba
 * la pagina en negro. Aqui se corta esa propagacion. Cada widget falla solo, con
 * su nombre y su causa a la vista, y el resto del tablero sigue en pie.
 *
 * Es una clase porque React solo ofrece `getDerivedStateFromError` en clases; no
 * hay equivalente en hooks.
 */

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

export type WidgetBoundaryProps = {
  /** Titulo del widget, para que el aviso diga cual ha fallado. */
  title: string;
  children: ReactNode;
};

type WidgetBoundaryState = { error: Error | null };

export class WidgetBoundary extends Component<WidgetBoundaryProps, WidgetBoundaryState> {
  state: WidgetBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WidgetBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sin servicio de errores todavia: la consola es el unico canal, y perder la
    // traza haria el fallo invisible justo cuando la frontera lo vuelve silencioso.
    console.error(`Widget «${this.props.title}» ha fallado`, error, info.componentStack);
  }

  /** El reintento es remontar: se descarta el error y los hijos vuelven a construirse. */
  private readonly retry = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div role="alert" className="flex flex-col items-start gap-2 pt-4">
        <div className="flex items-center gap-2 text-[length:var(--text-body)] text-content-primary">
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-content-negative" />
          Este widget no ha podido pintarse
        </div>
        <p className="text-[length:var(--text-micro)] text-content-secondary">{error.message}</p>
        <button
          type="button"
          onClick={this.retry}
          className="rounded-[var(--radius-control)] px-2 py-1 text-[length:var(--text-body)] text-content-secondary transition-colors duration-[var(--duration-fast)] [@media(hover:hover)]:hover:bg-surface-glass-hover [@media(hover:hover)]:hover:text-content-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
        >
          Reintentar
        </button>
      </div>
    );
  }
}
