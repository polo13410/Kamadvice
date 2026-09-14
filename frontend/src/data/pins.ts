/**
 * Les écrans épinglés par l'utilisateur : un métier, un plan d'élevage, une
 * vue, un serveur. Épinglé, un écran remonte en tête de sa liste dans les
 * menus du header, et l'accueil le propose en raccourci.
 *
 * Même mécanique que les favoris — `localStorage` exposé à React via
 * `useSyncExternalStore`, snapshot recréé à chaque écriture. Une épingle est
 * une clé texte, préfixée par ce qu'elle désigne (`job:forgeron`,
 * `plan:<id>`…) : les listes n'ont qu'à comparer, sans rien savoir des autres.
 * Une clé qui ne désigne plus rien (plan supprimé) reste sans effet.
 */
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'kamadvice.pins.v1'

/** Les clés d'épingle, écrites à un seul endroit. */
export const PIN = {
  job: (slug: string) => `job:${slug}`,
  plan: (id: string) => `plan:${id}`,
  view: (path: string) => `view:${path}`,
  server: (id: string) => `server:${id}`,
} as const

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((key): key is string => typeof key === 'string'))
  } catch {
    return new Set()
  }
}

let pins = read()
const listeners = new Set<() => void>()

/** Épingle (`true`) ou détache (`false`) un écran. */
export function setPinned(key: string, value: boolean) {
  if (pins.has(key) === value) return
  const next = new Set(pins)
  if (value) next.add(key)
  else next.delete(key)
  pins = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // Stockage bloqué : la session en cours garde ses épingles, pas la suivante.
  }
  for (const listener of listeners) listener()
}

export const togglePin = (key: string) => setPinned(key, !pins.has(key))

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePins(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => pins,
    () => pins,
  )
}

/**
 * Une liste avec ses épinglés devant, dans leur ordre d'origine, et le rang
 * du premier non épinglé — là où une liste pose son séparateur.
 */
export function pinnedFirst<T>(
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
  pinned: ReadonlySet<string>,
): { items: T[]; divider: number } {
  const first: T[] = []
  const rest: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (key !== undefined && pinned.has(key)) first.push(item)
    else rest.push(item)
  }
  return { items: [...first, ...rest], divider: first.length }
}
