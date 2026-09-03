const KAMAS = new Intl.NumberFormat('fr-FR')

/** Kamas lisibles, avec un tiret cadratin quand la valeur est inconnue. */
export const formatKamas = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : KAMAS.format(Math.round(value))

const PERCENT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})

export const formatPercent = (ratio: number | null): string =>
  ratio === null ? '—' : PERCENT.format(ratio)

/** Accepte « 1 250 », « 1.250 » ou « 1250 ». Retourne `null` si vide ou invalide. */
export function parseKamas(input: string): number | null {
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  const value = Number(digits)
  return Number.isFinite(value) ? value : null
}

/** Normalise pour la recherche : minuscules, sans accents. */
export const normalize = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')


const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export const formatDateTime = (iso: string | null | undefined): string =>
  iso ? DATE_TIME.format(new Date(iso)) : 'date inconnue'

const RELATIVE = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/** « il y a 3 jours », « hier »… pour juger d'un coup d'œil si un prix a vieilli. */
export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return 'date inconnue'
  const elapsed = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(elapsed)) return 'date inconnue'
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(elapsed) >= size) return RELATIVE.format(Math.round(elapsed / size), unit)
  }
  return "à l'instant"
}
