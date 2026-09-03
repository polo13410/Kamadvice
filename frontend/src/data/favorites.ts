/**
 * Items épinglés par l'utilisateur, qui font la page d'accueil.
 *
 * Même mécanique que les items en stock — `localStorage` exposé à React via
 * `useSyncExternalStore`, avec un snapshot recréé à chaque écriture et
 * d'identité stable entre deux modifications.
 *
 * Faute de comptes, la liste ne quitte pas le navigateur : elle est propre à la
 * machine, là où les prix, eux, sont partagés.
 */
import { useSyncExternalStore } from 'react'
import type { ItemId } from '../domain/types'

const STORAGE_KEY = 'kamadvice.favorites.v1'

function read(): Set<ItemId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is ItemId => Number.isInteger(id)))
  } catch {
    // localStorage indisponible ou contenu corrompu : on repart sans favoris
    // plutôt que d'empêcher l'app de démarrer.
    return new Set()
  }
}

let favorites = read()
const listeners = new Set<() => void>()

/** Épingle l'item (`true`) ou le retire des favoris (`false`). */
export function setFavorite(itemId: ItemId, value: boolean) {
  if (favorites.has(itemId) === value) return

  const next = new Set(favorites)
  if (value) next.add(itemId)
  else next.delete(itemId)
  favorites = next

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable,
    // seule la persistance est perdue.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Tous les favoris, pour la page d'accueil. */
export function useFavorites(): ReadonlySet<ItemId> {
  return useSyncExternalStore(
    subscribe,
    () => favorites,
    () => favorites,
  )
}

/**
 * Un seul item. Le snapshot est un booléen : une ligne de liste ne se redessine
 * que si son propre cœur change, pas à chaque favori ajouté ailleurs.
 */
export function useIsFavorite(itemId: ItemId): boolean {
  const has = () => favorites.has(itemId)
  return useSyncExternalStore(subscribe, has, has)
}
