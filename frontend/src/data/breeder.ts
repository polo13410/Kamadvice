/**
 * Le niveau du métier d'éleveur : un seul pour tous les plans, puisque c'est
 * le même joueur. Il fait le nombre d'enclos (voir `enclosuresFor`), donc la
 * taille des vagues de préparation et d'accouplement.
 *
 * Même mécanique que les épingles — `localStorage` exposé à React via
 * `useSyncExternalStore`. Les plans ne le stockent plus : la page le pose
 * dans leurs réglages au moment de les évaluer.
 */
import { useSyncExternalStore } from 'react'
import { MAX_LEVEL } from '../domain/breeding'
import { DEFAULT_SETTINGS } from './mounts'

const STORAGE_KEY = 'kamadvice.breeder.v1'

const clamp = (level: number): number => Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))

function read(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const level = raw === null ? NaN : Number(raw)
    return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL ? level : DEFAULT_SETTINGS.breederLevel
  } catch {
    return DEFAULT_SETTINGS.breederLevel
  }
}

let level = read()
const listeners = new Set<() => void>()

export function setBreederLevel(next: number) {
  const safe = clamp(next)
  if (safe === level) return
  level = safe
  try {
    localStorage.setItem(STORAGE_KEY, String(safe))
  } catch {
    // Stockage bloqué : la session en cours garde le niveau, pas la suivante.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBreederLevel(): number {
  return useSyncExternalStore(
    subscribe,
    () => level,
    () => level,
  )
}
