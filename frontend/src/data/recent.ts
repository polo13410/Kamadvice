/**
 * Ce qu'on vient de consulter et de chercher, pour que la barre de recherche
 * ait quelque chose à proposer avant la première frappe.
 *
 * Même mécanique que les favoris — `localStorage` exposé à React via
 * `useSyncExternalStore` — mais un seul objet sous une seule clé : les deux
 * listes se lisent toujours ensemble.
 */
import { useSyncExternalStore } from 'react'
import { normalize } from '../lib/format'
import type { ItemId } from '../domain/types'

const STORAGE_KEY = 'kamadvice.recent.v1'

/** Au-delà, ce n'est plus « récent » : la liste n'existe que pour éviter de retaper. */
const MAX = 8

export interface Recent {
  /** Items consultés, du plus récent au plus ancien. */
  items: readonly ItemId[]
  /** Recherches lancées, du plus récent au plus ancien. */
  queries: readonly string[]
}

const EMPTY: Recent = { items: [], queries: [] }

function read(): Recent {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY
    const { items, queries } = parsed as Partial<Record<keyof Recent, unknown>>
    return {
      items: Array.isArray(items) ? items.filter((id): id is ItemId => Number.isInteger(id)) : [],
      queries: Array.isArray(queries)
        ? queries.filter((query): query is string => typeof query === 'string')
        : [],
    }
  } catch {
    // localStorage indisponible ou contenu corrompu : on repart sans historique
    // plutôt que d'empêcher l'app de démarrer.
    return EMPTY
  }
}

let recent = read()
const listeners = new Set<() => void>()

function save(next: Recent) {
  recent = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable,
    // seule la persistance est perdue.
  }
  for (const listener of listeners) listener()
}

/** Remet la valeur en tête sans la laisser figurer deux fois. */
const promote = <T,>(list: readonly T[], value: T, same: (a: T, b: T) => boolean): T[] => [
  value,
  ...list.filter((entry) => !same(entry, value)),
].slice(0, MAX)

/** Appelé à l'ouverture d'une fiche : c'est la consultation qui compte, pas le clic. */
export function recordItem(itemId: ItemId) {
  if (recent.items[0] === itemId) return
  save({ ...recent, items: promote(recent.items, itemId, (a, b) => a === b) })
}

/** Appelé quand une recherche part vraiment, pas à chaque frappe. */
export function recordQuery(query: string) {
  const trimmed = query.trim()
  if (trimmed === '') return
  // Dédoublonnage sur la forme normalisée : « Blé » et « ble » sont la même
  // recherche, et c'est la dernière orthographe saisie qu'on garde.
  save({
    ...recent,
    queries: promote(recent.queries, trimmed, (a, b) => normalize(a) === normalize(b)),
  })
}

export function useRecent(): Recent {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => recent,
    () => recent,
  )
}
