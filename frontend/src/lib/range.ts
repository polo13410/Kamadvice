/**
 * Une fourchette de filtre : une borne basse et une borne haute, chacune
 * facultative. Commune aux tableaux de bord, qui bornent niveau, prix, coût
 * ou nombre d'ingrédients de la même façon.
 */

export interface Range {
  min: number | null
  max: number | null
}

export const NO_RANGE: Range = { min: null, max: null }

/** Au moins une borne posée. */
export const isBounded = (bounds: Range): boolean => bounds.min !== null || bounds.max !== null

/**
 * Une valeur passe-t-elle la fourchette ? Une valeur inconnue ne passe aucune
 * borne posée : « coût de craft sous 10 000 » ne peut pas inclure un coût
 * qu'on ne connaît pas.
 */
export function within(value: number | null, bounds: Range): boolean {
  if (!isBounded(bounds)) return true
  if (value === null) return false
  if (bounds.min !== null && value < bounds.min) return false
  if (bounds.max !== null && value > bounds.max) return false
  return true
}

const toInt = (raw: string | null): number | null => {
  if (raw === null || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : null
}

/** Lit `{key}min` et `{key}max` dans la query string. */
export const readRange = (params: URLSearchParams, key: string): Range => ({
  min: toInt(params.get(`${key}min`)),
  max: toInt(params.get(`${key}max`)),
})

/** Écrit les bornes posées, et seulement elles. */
export function writeRange(params: URLSearchParams, key: string, value: Range) {
  if (value.min !== null) params.set(`${key}min`, String(value.min))
  if (value.max !== null) params.set(`${key}max`, String(value.max))
}
