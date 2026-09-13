/**
 * Les plans d'élevage de l'utilisateur.
 *
 * Même mécanique que les favoris — `localStorage` exposé à React via
 * `useSyncExternalStore`, snapshot recréé à chaque écriture. Un plan ne
 * retient que la cible, ses réglages et d'éventuelles recettes imposées :
 * tout le reste se déduit de l'étable (`inventory.ts`) au rendu.
 */
import { useSyncExternalStore } from 'react'
import type { Plan, PlanSettings, SlotPath } from '../domain/breeding'
import { levelForXp, MAX_LEVEL, xpAtLevel } from '../domain/breeding'
import type { VarietyId } from '../domain/types'
import { DEFAULT_SETTINGS } from './mounts'

/** `v2` : les montures ont quitté le plan pour l'étable, un plan `v1` ne se relit pas. */
const STORAGE_KEY = 'kamadvice.breeding.v2'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const readLevel = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_LEVEL
    ? value
    : fallback

function readPlan(raw: unknown): Plan | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !Number.isInteger(raw.target)) return null
  const settings = isRecord(raw.settings) ? raw.settings : {}
  const recipes: Record<SlotPath, number> = {}
  if (isRecord(raw.recipes)) {
    for (const [path, value] of Object.entries(raw.recipes)) {
      if (Number.isInteger(value) && (value as number) >= 0 && /^[01]*$/.test(path)) {
        recipes[path] = value as number
      }
    }
  }
  return {
    id: raw.id,
    target: raw.target as VarietyId,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    settings: {
      targetLevel: readLevel(settings.targetLevel, DEFAULT_SETTINGS.targetLevel),
      feedPoints:
        typeof settings.feedPoints === 'number' && settings.feedPoints >= 0
          ? settings.feedPoints
          : DEFAULT_SETTINGS.feedPoints,
      optimakina: settings.optimakina === true,
      probable: settings.probable === true,
    },
    recipes,
  }
}

function read(): Plan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(readPlan).filter((plan): plan is Plan => plan !== null)
  } catch {
    return []
  }
}

let plans: readonly Plan[] = read()
const listeners = new Set<() => void>()

function save(next: readonly Plan[]) {
  plans = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable.
  }
  for (const listener of listeners) listener()
}

const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Crée un plan pour cette variété et rend son identifiant, pour y naviguer. */
export function createPlan(target: VarietyId, settings: PlanSettings = DEFAULT_SETTINGS): string {
  const now = new Date().toISOString()
  const plan: Plan = { id: newId(), target, createdAt: now, updatedAt: now, settings: { ...settings }, recipes: {} }
  save([plan, ...plans])
  return plan.id
}

export function removePlan(id: string) {
  if (!plans.some((plan) => plan.id === id)) return
  save(plans.filter((plan) => plan.id !== id))
}

function patch(id: string, change: (plan: Plan) => Plan) {
  const current = plans.find((plan) => plan.id === id)
  if (!current) return
  const next = { ...change(current), updatedAt: new Date().toISOString() }
  save(plans.map((plan) => (plan.id === id ? next : plan)))
}

export function updateSettings(id: string, settings: Partial<PlanSettings>) {
  patch(id, (plan) => ({ ...plan, settings: { ...plan.settings, ...settings } }))
}

/** Le niveau visé change : les points de mangeoire suivent la table d'XP. */
export function setTargetLevel(id: string, xp: readonly number[], level: number) {
  const clamped = Math.min(MAX_LEVEL, Math.max(1, level))
  updateSettings(
    id,
    xp.length > 0
      ? { targetLevel: clamped, feedPoints: xpAtLevel(xp, clamped) }
      : { targetLevel: clamped },
  )
}

/** Les points changent : le niveau visé devient le plus haut qu'ils permettent. */
export function setFeedPoints(id: string, xp: readonly number[], points: number) {
  const safe = Math.max(0, points)
  updateSettings(
    id,
    xp.length > 0 ? { feedPoints: safe, targetLevel: levelForXp(xp, safe) } : { feedPoints: safe },
  )
}

/** Impose une recette à un emplacement ; `null` rend la main à l'assistant. */
export function chooseRecipe(id: string, path: SlotPath, recipeIndex: number | null) {
  patch(id, (plan) => {
    const recipes = { ...plan.recipes }
    if (recipeIndex === null) delete recipes[path]
    else recipes[path] = recipeIndex
    return { ...plan, recipes }
  })
}

/** « Recalculer depuis l'inventaire » : oublie les recettes imposées, l'étable décide de tout. */
export function resetChoices(id: string) {
  patch(id, (plan) => ({ ...plan, recipes: {} }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePlans(): readonly Plan[] {
  return useSyncExternalStore(
    subscribe,
    () => plans,
    () => plans,
  )
}

export function usePlan(id: string | undefined): Plan | undefined {
  const find = () => plans.find((plan) => plan.id === id)
  return useSyncExternalStore(subscribe, find, find)
}
