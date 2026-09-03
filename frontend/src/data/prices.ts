/**
 * Prix HDV saisis à la main, conservés dans le navigateur.
 *
 * Chaque item garde un journal de ses relevés, du plus récent au plus ancien.
 * Le prix courant est simplement le premier du journal : une seule source de
 * vérité, pas de champ « prix actuel » à tenir synchronisé avec l'historique.
 *
 * Aucun serveur : tout vit dans `localStorage` et est exposé à React via
 * `useSyncExternalStore`. Les snapshots sont recréés à chaque écriture, avec une
 * identité stable entre deux modifications — indispensable pour que les
 * `useMemo` qui chiffrent les crafts ne se relancent pas pour rien.
 */
import { useSyncExternalStore } from 'react'
import type { ItemId, PriceMap } from '../domain/types'

export interface PricePoint {
  price: number
  /** ISO 8601. `null` pour un prix repris d'une version du stockage sans date. */
  at: string | null
}

const STORAGE_KEY = 'kamadvice.prices.v2'
const LEGACY_KEY = 'kamadvice.prices.v1'

/** Relevés conservés par item. Au-delà, les plus anciens sont oubliés. */
const MAX_POINTS = 50

const EMPTY: readonly PricePoint[] = []

/** Au-delà, un relevé est trop vieux pour qu'on s'y fie sans le revérifier. */
const STALE_AFTER_MS = 7 * 86_400_000

/**
 * Relevé dont le prix a eu le temps de bouger sans qu'on le revérifie. Un
 * relevé sans date (repris de l'ancien format) compte comme périmé : ne rien
 * savoir de sa fraîcheur n'est pas une raison de s'y fier.
 */
export function isStale(point: PricePoint | undefined): boolean {
  if (!point) return false
  if (point.at === null) return true
  const at = new Date(point.at).getTime()
  return Number.isFinite(at) && Date.now() - at > STALE_AFTER_MS
}

const isValidPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

function parsePoints(value: unknown): PricePoint[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (point): point is PricePoint =>
        typeof point === 'object' &&
        point !== null &&
        isValidPrice((point as PricePoint).price) &&
        (typeof (point as PricePoint).at === 'string' || (point as PricePoint).at === null),
    )
    .map((point) => ({ price: point.price, at: point.at }))
}

/**
 * Reprend les prix du format initial, qui ne stockait qu'un nombre par item.
 * Ces relevés arrivent avec `at: null` : inventer une date de saisie donnerait
 * une fausse impression de fraîcheur.
 */
function readLegacy(): Map<ItemId, PricePoint[]> {
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return new Map()
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return new Map()

  const log = new Map<ItemId, PricePoint[]>()
  for (const [id, price] of Object.entries(parsed as Record<string, unknown>)) {
    const itemId = Number(id)
    if (Number.isInteger(itemId) && isValidPrice(price)) log.set(itemId, [{ price, at: null }])
  }
  return log
}

function read(): Map<ItemId, PricePoint[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return readLegacy()

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return new Map()

    const log = new Map<ItemId, PricePoint[]>()
    for (const [id, points] of Object.entries(parsed as Record<string, unknown>)) {
      const itemId = Number(id)
      const parsedPoints = parsePoints(points)
      if (Number.isInteger(itemId) && parsedPoints.length > 0) log.set(itemId, parsedPoints)
    }
    return log
  } catch {
    // localStorage indisponible (navigation privée) ou contenu corrompu : on
    // repart sur des prix vides plutôt que d'empêcher l'app de démarrer.
    return new Map()
  }
}

const toCurrent = (log: Map<ItemId, PricePoint[]>): Map<ItemId, number> => {
  const current = new Map<ItemId, number>()
  for (const [itemId, points] of log) {
    const latest = points[0]
    if (latest) current.set(itemId, latest.price)
  }
  return current
}

let log = read()
let current = toCurrent(log)
const listeners = new Set<() => void>()

function commit(next: Map<ItemId, PricePoint[]>) {
  log = next
  current = toCurrent(next)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next)))
  } catch {
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable,
    // seule la persistance est perdue.
  }
  for (const listener of listeners) listener()
}

/**
 * Enregistre un relevé de prix. Ressaisir le prix déjà en place ne crée pas de
 * relevé : ça ne dit rien de nouveau sur le marché et ça polluerait l'historique.
 */
export function setPrice(itemId: ItemId, price: number) {
  const points = log.get(itemId) ?? EMPTY
  if (points[0]?.price === price) return

  const next = new Map(log)
  next.set(itemId, [{ price, at: new Date().toISOString() }, ...points].slice(0, MAX_POINTS))
  commit(next)
}

/**
 * Supprime un relevé, désigné par son rang dans le journal. Retirer le relevé
 * courant fait remonter le précédent ; retirer le dernier laisse l'item sans
 * prix. C'est la seule façon d'effacer un prix : un champ vidé par mégarde ne
 * doit pas détruire d'historique.
 */
export function removePricePoint(itemId: ItemId, index: number) {
  const points = log.get(itemId)
  if (!points || index < 0 || index >= points.length) return

  const remaining = points.filter((_, rank) => rank !== index)
  const next = new Map(log)
  if (remaining.length === 0) next.delete(itemId)
  else next.set(itemId, remaining)
  commit(next)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Prix courants, dans la forme attendue par le moteur de craft. */
export function usePrices(): PriceMap {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
}

/** Journaux de tous les items, pour juger de la fraîcheur d'un lot de prix. */
export function usePriceLogs(): ReadonlyMap<ItemId, readonly PricePoint[]> {
  return useSyncExternalStore(
    subscribe,
    () => log,
    () => log,
  )
}

/** Relevés d'un item, du plus récent au plus ancien. */
export function usePriceLog(itemId: ItemId): readonly PricePoint[] {
  return useSyncExternalStore(
    subscribe,
    () => log.get(itemId) ?? EMPTY,
    () => log.get(itemId) ?? EMPTY,
  )
}
