/**
 * Carte de chaleur d'une colonne de gains et de pertes : plus l'écart est
 * gros, plus la cellule est teintée.
 *
 * Commune aux tableaux de bord : une marge de craft se lit de la même façon
 * quel que soit le métier.
 *
 * Les paliers sont des classes littérales — Tailwind ne génère que ce qu'il lit
 * dans le source, une classe assemblée à la volée n'existerait jamais dans la
 * feuille de style.
 */
const HEAT_GAIN = [
  'bg-emerald-500/10 text-emerald-300',
  'bg-emerald-500/20 text-emerald-200',
  'bg-emerald-500/30 text-emerald-100 font-medium',
] as const
const HEAT_LOSS = [
  'bg-rose-500/10 text-rose-300',
  'bg-rose-500/20 text-rose-200',
  'bg-rose-500/30 text-rose-100 font-medium',
] as const

/** `scale` est le plus gros écart du tableau : une seule légende suffit alors. */
export function heat(value: number, scale: number): string {
  const ladder = value >= 0 ? HEAT_GAIN : HEAT_LOSS
  const share = scale <= 0 ? 0 : Math.abs(value) / scale
  return share >= 2 / 3 ? ladder[2] : share >= 1 / 3 ? ladder[1] : ladder[0]
}

/** Le plus gros écart absolu d'une série, `0` si elle est vide ou sans chiffre. */
export function heatScale(values: Iterable<number | null>): number {
  let widest = 0
  for (const value of values) {
    if (value !== null) widest = Math.max(widest, Math.abs(value))
  }
  return widest
}
