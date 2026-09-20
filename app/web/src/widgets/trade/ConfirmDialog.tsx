/**
 * Confirmación de «Operar» (W4.4): `Dialog size="overlay"` con el resumen de la
 * operación en prosa, la nota de no vinculante y la casilla de autorización.
 *
 * `Enviar oferta` lleva `disabled` **real** en el `<button>`, no un gris que
 * igual se pulsa: el foco lo salta, el lector de pantalla lo anuncia y el
 * `onClick` no existe. El botón conserva su nombre en los dos lados; lo que
 * cambia con `Reclamar` es la prosa, que pasa a hablar de reclamación de deuda.
 *
 * No se envía ningún correo: el texto dice «se enviará» porque es lo que la
 * demo representa.
 */

import { useState } from "react";
import type { ReactElement } from "react";
import { fmtSize } from "@/charts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import type { Term, TradeSide } from "@/widgets/trade/trade-math";
import { fmtRate } from "@/widgets/trade/trade-math";

const CURRENCY = "EUR";

const AUTHORISATION =
  "Confirmo que tengo autorización de la empresa para realizar esta operación.";

const NOT_BINDING =
  "La propuesta no es vinculante hasta que ambas partes la formalicen por escrito.";

const TITLE: Record<TradeSide, string> = {
  offer: "Confirmar envío de la oferta",
  claim: "Confirmar envío de la reclamación",
};

/** Lo único que cambia en la prosa entre ofrecer y reclamar. */
const PROPOSAL: Record<TradeSide, string> = {
  offer: "una propuesta de financiación por",
  claim: "una propuesta de reclamación de deuda por",
};

const BUTTON_CLASS = "text-[length:var(--text-body)]";

export function ConfirmDialog({
  company,
  side,
  amount,
  rate,
  term,
  interest,
  onCancel,
  onConfirm,
}: {
  company: string;
  side: TradeSide;
  amount: number;
  rate: number;
  term: Term;
  /** Los intereses ya calculados en el widget: el diálogo no recalcula nada. */
  interest: number;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactElement {
  const [authorised, setAuthorised] = useState(false);

  return (
    <Dialog label={TITLE[side]} size="overlay" onClose={onCancel}>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-[length:var(--text-section)] font-semibold text-content-primary">
          {TITLE[side]}
        </p>

        <p className="text-pretty text-[length:var(--text-body)] text-content-secondary">
          Se enviará una comunicación al equipo financiero de{" "}
          <strong className="font-semibold text-content-primary">{company}</strong> con{" "}
          {PROPOSAL[side]}{" "}
          <strong className="num font-semibold text-content-primary">
            {fmtSize(amount, CURRENCY)}
          </strong>{" "}
          a un tipo anual del{" "}
          <strong className="num font-semibold text-content-primary">{fmtRate(rate)}</strong> y un
          plazo de{" "}
          <strong className="num font-semibold text-content-primary">{term} meses</strong>, lo que
          supone unos intereses estimados de{" "}
          <strong className="num font-semibold text-content-primary">
            {fmtSize(interest, CURRENCY)}
          </strong>
          .
        </p>

        <p className="text-pretty text-[length:var(--text-micro)] text-content-secondary">
          {NOT_BINDING}
        </p>

        <Checkbox checked={authorised} onChange={setAuthorised} label={AUTHORISATION} />

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" className={BUTTON_CLASS} onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            className={BUTTON_CLASS}
            disabled={!authorised}
            onClick={onConfirm}
          >
            Enviar oferta
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
