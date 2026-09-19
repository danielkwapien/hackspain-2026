/**
 * Parámetros del motor X-Ray que sirve `/api/v2/meta`. El dataset no exporta
 * ningún fichero de parámetros, así que se congelan aquí copiados del generador
 * (`datasets_mocked/xray_mock/`): la API no calcula nada con ellos, solo los
 * publica para que la UI pinte la metodología con las cifras reales.
 *
 * Origen de cada bloque (verificado contra el fuente Python):
 * - `params_version`: `manifest.json` (`"params_version": "v1"`).
 * - `penalty`: `catalog.py:38` `PENALTY = {"lambda": 0.5, "tau": 0.45}`.
 * - `caps`: `catalog.py:41` `CAPS = {"NEGCASH": 40, "SSMISS": 45, "DEBTSTOP": 50, "LOCFULL": 60}`.
 * - `calibration`: `catalog.py:65` `CALIBRATION = {"support": [30, 92], "mean": 62, "sd": 13}`.
 * - `ewma_alpha`: `catalog.py:68` `EWMA_ALPHA = {"flow": 0.5, "stock": 1.0}`.
 * - `outlook`: `catalog.py:84` `OUTLOOK = {"phi": 0.85, "horizons": [3, 6], "z_90": 1.28,
 *   "gamma": 3.0, "sigma_resid": 3.0}`.
 * - `confidence`: `core.py:758-778` `confidence()`: `f_hist` por tramos de `months_hist`
 *   (`[desde_mes, factor]`: 0,4 < 6 m; 0,7 6–11; 0,9 12–17; 1,0 ≥ 18) y `f_quality` 0,8
 *   si `cash_quality == "low"` o `unclassified_share > 0.6`.
 */

export const ENGINE_PARAMS = {
  params_version: "v1",
  penalty: { lambda: 0.5, tau: 0.45 },
  caps: { NEGCASH: 40, SSMISS: 45, DEBTSTOP: 50, LOCFULL: 60 },
  ewma_alpha: { flow: 0.5, stock: 1 },
  calibration: { support: [30, 92], mean: 62, sd: 13 },
  outlook: { phi: 0.85, horizons: [3, 6], z_90: 1.28, gamma: 3, sigma_resid: 3 },
  confidence: {
    f_hist: [
      [0, 0.4],
      [6, 0.7],
      [12, 0.9],
      [18, 1],
    ],
    f_quality_low: 0.8,
    unclassified_share_max: 0.6,
  },
} as const;
