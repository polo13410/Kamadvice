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

const CHANCE = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/**
 * Une probabilité : « 41,7 % », sans signe — contrairement à `formatPercent`,
 * qui parle de marges et précède les gains d'un `+`. Deux décimales au plus :
 * 30,30 % se lit, 30,3 % aussi, et 60 % reste 60 %.
 */
export const formatChance = (chance: number | null | undefined): string =>
  chance === null || chance === undefined || !Number.isFinite(chance) ? '—' : CHANCE.format(chance)

/** Un compte de tentatives : entier, ou une décimale pour une moyenne. `∞` quand c'est sans espoir. */
export const formatAttempts = (value: number | null | undefined): string =>
  value === null || value === undefined
    ? '—'
    : !Number.isFinite(value)
      ? '∞'
      : Number.isInteger(value)
        ? KAMAS.format(value)
        : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value)

const RATIO = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Rapport à deux décimales, en fr-FR. `—` quand la valeur est inconnue.
 *
 * Deux décimales suffisent au rendement d'un carburant, qui s'étale de 0,40 à
 * 150 points par kama ; `formatKamas`, lui, arrondirait tout le bas de
 * l'échelle à 0.
 */
export const formatRatio = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : RATIO.format(value)

/** Accepte « 1 250 », « 1.250 » ou « 1250 ». Retourne `null` si vide ou invalide. */
export function parseKamas(input: string): number | null {
  const digits = input.replace(/\D/g, '')
  if (!digits) return null
  const value = Number(digits)
  return Number.isFinite(value) ? value : null
}

const HOURS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/**
 * Une durée d'élevage : « 45 min », « 11,1 h », « 3,2 j ». Une décimale au
 * plus — c'est un ordre de grandeur, pas un chronomètre.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min`
  if (seconds < 48 * 3_600) return `${HOURS.format(seconds / 3_600)} h`
  return `${HOURS.format(seconds / 86_400)} j`
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
