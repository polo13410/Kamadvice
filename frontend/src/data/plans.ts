/**
 * Les plans d'élevage de l'utilisateur.
 *
 * Même mécanique que les favoris — `localStorage` exposé à React via
 * `useSyncExternalStore`, snapshot recréé à chaque écriture — parce qu'un
 * élevage dure des jours et que la page doit retrouver où on en était. Faute
 * de comptes, un plan ne quitte pas le navigateur.
 *
 * Le contenu d'un plan est décrit dans `domain/breeding.ts` ; ici on ne fait
 * que le garder et le modifier par petites touches, un emplacement à la fois.
 */
import { useSyncExternalStore } from 'react'
import type {
  OwnedMount,
  Plan,
  PlanSettings,
  SlotPath,
} from '../domain/breeding'
import type { VarietyId } from '../domain/types'
import { DEFAULT_SETTINGS } from './mounts'

const STORAGE_KEY = 'kamadvice.breeding.v1'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isId = (value: unknown): value is number => Number.isInteger(value)

/** Un plan relu du stockage : chaque champ est vérifié, un plan illisible est écarté. */
function readPlan(raw: unknown): Plan | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isId(raw.target)) return null
  const settings = isRecord(raw.settings) ? raw.settings : {}
  const mounts: Record<SlotPath, OwnedMount> = {}
  if (isRecord(raw.mounts)) {
    for (const [path, value] of Object.entries(raw.mounts)) {
      const mount = readMount(value)
      if (mount && /^[01]*$/.test(path)) mounts[path] = mount
    }
  }
  const recipes: Record<SlotPath, number> = {}
  if (isRecord(raw.recipes)) {
    for (const [path, value] of Object.entries(raw.recipes)) {
      if (isId(value) && value >= 0 && /^[01]*$/.test(path)) recipes[path] = value
    }
  }
  return {
    id: raw.id,
    target: raw.target,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    settings: {
      targetLevel: readLevel(settings.targetLevel, DEFAULT_SETTINGS.targetLevel),
      feedPoints:
        typeof settings.feedPoints === 'number' && settings.feedPoints >= 0
          ? settings.feedPoints
          : DEFAULT_SETTINGS.feedPoints,
      optimakina: settings.optimakina === true,
      reproducteur: settings.reproducteur === true,
    },
    recipes,
    mounts,
  }
}

const readLevel = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 200 ? value : fallback

const idOrNull = (value: unknown): VarietyId | null => (isId(value) ? value : null)

function readMount(raw: unknown): OwnedMount | null {
  if (!isRecord(raw)) return null
  const status = raw.status
  if (
    status !== 'owned' &&
    status !== 'preparing' &&
    status !== 'fertile' &&
    status !== 'bred' &&
    status !== 'obtained'
  ) {
    return null
  }
  const parents = Array.isArray(raw.parents) ? raw.parents : []
  const grandparents = Array.isArray(raw.grandparents) ? raw.grandparents : []
  return {
    origin: raw.origin === 'bred' ? 'bred' : 'external',
    sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : null,
    level: readLevel(raw.level, 1),
    status,
    parents: [idOrNull(parents[0]), idOrNull(parents[1])],
    grandparents: [
      idOrNull(grandparents[0]),
      idOrNull(grandparents[1]),
      idOrNull(grandparents[2]),
      idOrNull(grandparents[3]),
    ],
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
    // localStorage indisponible ou contenu corrompu : on repart sans plan
    // plutôt que d'empêcher l'app de démarrer.
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
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable,
    // seule la persistance est perdue.
  }
  for (const listener of listeners) listener()
}

/** Identifiant court et lisible dans une URL, sans dépendre de `crypto.randomUUID`. */
const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Crée un plan pour cette variété et rend son identifiant, pour y naviguer. */
export function createPlan(target: VarietyId, settings: PlanSettings = DEFAULT_SETTINGS): string {
  const now = new Date().toISOString()
  const plan: Plan = {
    id: newId(),
    target,
    createdAt: now,
    updatedAt: now,
    settings: { ...settings },
    recipes: {},
    mounts: {},
  }
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

/** Retient une recette pour un emplacement. Ce qui était saisi en dessous n'est plus valable : on l'oublie. */
export function chooseRecipe(id: string, path: SlotPath, recipeIndex: number) {
  patch(id, (plan) => {
    const mounts = { ...plan.mounts }
    const recipes = { ...plan.recipes, [path]: recipeIndex }
    for (const key of Object.keys(plan.mounts)) {
      if (key !== path && key.startsWith(path)) delete mounts[key]
    }
    for (const key of Object.keys(plan.recipes)) {
      if (key !== path && key.startsWith(path)) delete recipes[key]
    }
    return { ...plan, recipes, mounts }
  })
}

/** Pose, modifie ou retire (`null`) la monture d'un emplacement. */
export function setMount(id: string, path: SlotPath, mount: OwnedMount | null) {
  patch(id, (plan) => {
    const mounts = { ...plan.mounts }
    if (mount) mounts[path] = mount
    else delete mounts[path]
    return { ...plan, mounts }
  })
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
