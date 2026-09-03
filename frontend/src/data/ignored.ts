/**
 * Ingrédients dont on ne compte pas le coût : ceux qu'on a déjà en stock.
 *
 * Même mécanique que les prix — `localStorage` exposé à React via
 * `useSyncExternalStore` — avec un snapshot recréé à chaque écriture et
 * d'identité stable entre deux modifications, pour ne pas relancer le chiffrage
 * des crafts pour rien.
 */
import { useSyncExternalStore } from 'react'
import type { IgnoredSet, ItemId } from '../domain/types'

const STORAGE_KEY = 'kamadvice.ignored.v1'

function read(): Set<ItemId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is ItemId => Number.isInteger(id)))
  } catch {
    // localStorage indisponible ou contenu corrompu : on repart sans exclusion
    // plutôt que d'empêcher l'app de démarrer.
    return new Set()
  }
}

let ignored = read()
const listeners = new Set<() => void>()

/** Écarte le coût de l'item des crafts (`true`) ou le remet en compte (`false`). */
export function setIgnored(itemId: ItemId, value: boolean) {
  if (ignored.has(itemId) === value) return

  const next = new Set(ignored)
  if (value) next.add(itemId)
  else next.delete(itemId)
  ignored = next

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

/** Items ignorés, dans la forme attendue par le moteur de craft. */
export function useIgnored(): IgnoredSet {
  return useSyncExternalStore(
    subscribe,
    () => ignored,
    () => ignored,
  )
}
