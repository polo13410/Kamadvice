/**
 * Le niveau de chaque métier du joueur.
 *
 * Rangé ici plutôt que dans l'URL, contrairement aux filtres : le niveau
 * d'Éleveur décrit *le joueur*, pas la vue qu'il regarde. Un lien partagé doit
 * ouvrir le tableau de bord au niveau de celui qui le reçoit, pas à celui de
 * celui qui l'a envoyé.
 *
 * Même mécanique que les prix et le stock — `localStorage` exposé à React via
 * `useSyncExternalStore` — avec un snapshot recréé à chaque écriture et
 * d'identité stable entre deux modifications.
 *
 * La table est indexée par `jobId` du jeu (79 pour l'Éleveur) : les prochains
 * tableaux de bord métier s'y branchent sans rien ajouter ici.
 */
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'kamadvice.jobLevels.v1'

/** Bornes d'un niveau de métier. Hors de là, la valeur est ignorée. */
const MIN_LEVEL = 1
const MAX_LEVEL = 200

export type JobLevels = ReadonlyMap<number, number>

const EMPTY: JobLevels = new Map()

function read(): JobLevels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return EMPTY

    const levels = new Map<number, number>()
    for (const [jobId, level] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(jobId)
      if (!Number.isInteger(id) || !Number.isInteger(level)) continue
      const value = level as number
      if (value < MIN_LEVEL || value > MAX_LEVEL) continue
      levels.set(id, value)
    }
    return levels
  } catch {
    // localStorage indisponible ou contenu corrompu : on repart sans niveau
    // plutôt que d'empêcher l'app de démarrer.
    return EMPTY
  }
}

let levels = read()
const listeners = new Set<() => void>()

/** Fixe le niveau d'un métier, ou l'oublie avec `null`. */
export function setJobLevel(jobId: number, level: number | null) {
  const clamped =
    level === null ? null : Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)))
  if (levels.get(jobId) === (clamped ?? undefined)) return

  const next = new Map(levels)
  if (clamped === null) next.delete(jobId)
  else next.set(jobId, clamped)
  levels = next

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next)))
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

const snapshot = () => levels

/** Niveau connu pour ce métier, `null` tant qu'il n'a pas été renseigné. */
export function useJobLevel(jobId: number): number | null {
  const all = useSyncExternalStore(subscribe, snapshot, snapshot)
  return all.get(jobId) ?? null
}
