/**
 * L'étable : les montures que l'utilisateur possède, partagées par tous ses
 * plans d'élevage.
 *
 * Même mécanique que les favoris — `localStorage` exposé à React via
 * `useSyncExternalStore`, snapshot recréé à chaque écriture. Faute de
 * comptes, l'étable ne quitte pas le navigateur.
 *
 * Deux gestes de jeu s'enregistrent ici, et c'est l'étable qui en tire les
 * conséquences : un accouplement stérilise les parents et fait naître un bébé
 * dont l'arbre réel est déduit ; un clonage détruit une monture et rend
 * l'autre féconde. Les plans, eux, ne stockent rien de tout ça : ils se
 * recalculent sur l'étable.
 */
import { useSyncExternalStore } from 'react'
import type { Sex, StableMount } from '../domain/breeding'
import type { VarietyId } from '../domain/types'

const STORAGE_KEY = 'kamadvice.stable.v1'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isId = (value: unknown): value is number => Number.isInteger(value)
const idOrNull = (value: unknown): VarietyId | null => (isId(value) ? value : null)

function readMount(raw: unknown): StableMount | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isId(raw.variety)) return null
  const parents = Array.isArray(raw.parents) ? raw.parents : []
  const grandparents = Array.isArray(raw.grandparents) ? raw.grandparents : []
  const level = typeof raw.level === 'number' && Number.isInteger(raw.level) ? raw.level : 1
  return {
    id: raw.id,
    variety: raw.variety,
    sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : null,
    level: Math.min(200, Math.max(1, level)),
    ready: raw.ready === true,
    sterile: raw.sterile === true,
    parents: [idOrNull(parents[0]), idOrNull(parents[1])],
    grandparents: [
      idOrNull(grandparents[0]),
      idOrNull(grandparents[1]),
      idOrNull(grandparents[2]),
      idOrNull(grandparents[3]),
    ],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
  }
}

function read(): StableMount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(readMount).filter((mount): mount is StableMount => mount !== null)
  } catch {
    // localStorage indisponible ou contenu corrompu : on repart d'une étable
    // vide plutôt que d'empêcher l'app de démarrer.
    return []
  }
}

let stable: readonly StableMount[] = read()
const listeners = new Set<() => void>()

function save(next: readonly StableMount[]) {
  stable = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable,
    // seule la persistance est perdue.
  }
  for (const listener of listeners) listener()
}

// --- Le journal ---------------------------------------------------------------

/**
 * Ce qui s'est passé à l'étable, dans l'ordre : chaque accouplement et chaque
 * clonage, avec ce qu'on savait des montures à ce moment-là. Le plan se
 * recalcule sur l'étable et oublie les branches faites ; le journal, lui,
 * garde l'historique.
 */
export interface MountSnapshot {
  id: string
  variety: VarietyId
  sex: Sex | null
  level: number
  parents: StableMount['parents']
}

export type JournalEvent =
  | {
      id: string
      kind: 'breeding'
      at: string
      father: MountSnapshot
      mother: MountSnapshot
      baby: MountSnapshot
      /** La variété que le croisement visait, pour dire si le bébé est celui attendu. */
      intended: VarietyId | null
    }
  | { id: string; kind: 'clone'; at: string; survivor: MountSnapshot; lost: MountSnapshot }

const JOURNAL_KEY = 'kamadvice.journal.v1'

const snapshot = (mount: StableMount): MountSnapshot => ({
  id: mount.id,
  variety: mount.variety,
  sex: mount.sex,
  level: mount.level,
  parents: mount.parents,
})

function readSnapshot(raw: unknown): MountSnapshot | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isId(raw.variety)) return null
  const parents = Array.isArray(raw.parents) ? raw.parents : []
  return {
    id: raw.id,
    variety: raw.variety,
    sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : null,
    level: typeof raw.level === 'number' ? raw.level : 1,
    parents: [idOrNull(parents[0]), idOrNull(parents[1])],
  }
}

function readEvent(raw: unknown): JournalEvent | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.at !== 'string') return null
  if (raw.kind === 'breeding') {
    const father = readSnapshot(raw.father)
    const mother = readSnapshot(raw.mother)
    const baby = readSnapshot(raw.baby)
    if (!father || !mother || !baby) return null
    return { id: raw.id, kind: 'breeding', at: raw.at, father, mother, baby, intended: idOrNull(raw.intended) }
  }
  if (raw.kind === 'clone') {
    const survivor = readSnapshot(raw.survivor)
    const lost = readSnapshot(raw.lost)
    if (!survivor || !lost) return null
    return { id: raw.id, kind: 'clone', at: raw.at, survivor, lost }
  }
  return null
}

function readJournal(): JournalEvent[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(readEvent).filter((event): event is JournalEvent => event !== null)
  } catch {
    return []
  }
}

let journal: readonly JournalEvent[] = readJournal()

function log(event: JournalEvent) {
  journal = [...journal, event]
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal))
  } catch {
    // Même règle : la session continue, seule la persistance est perdue.
  }
}

/** Efface une entrée du journal — une erreur de saisie, par exemple. L'étable, elle, ne bouge pas. */
export function forgetEvent(id: string) {
  journal = journal.filter((event) => event.id !== id)
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal))
  } catch {
    // Idem.
  }
  for (const listener of listeners) listener()
}

export function useJournal(): readonly JournalEvent[] {
  return useSyncExternalStore(
    subscribe,
    () => journal,
    () => journal,
  )
}

const newId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export interface NewMount {
  variety: VarietyId
  sex?: Sex | null
  level?: number
  ready?: boolean
  sterile?: boolean
  parents?: StableMount['parents']
  grandparents?: StableMount['grandparents']
}

/** Ajoute une monture possédée — donc préparée — et rend son identifiant. */
export function addMount(input: NewMount): string {
  const mount: StableMount = {
    id: newId(),
    variety: input.variety,
    sex: input.sex ?? null,
    level: input.level ?? 1,
    ready: input.ready ?? true,
    sterile: input.sterile ?? false,
    parents: input.parents ?? [null, null],
    grandparents: input.grandparents ?? [null, null, null, null],
    createdAt: new Date().toISOString(),
  }
  save([...stable, mount])
  return mount.id
}

/** Une copie d'une monture — même variété, sexe, niveau, arbre —, pour en saisir plusieurs pareilles vite. */
export function duplicateMount(id: string): string {
  const source = stable.find((mount) => mount.id === id)
  if (!source) return ''
  const copy: StableMount = { ...source, id: newId(), createdAt: new Date().toISOString() }
  save([...stable, copy])
  return copy.id
}

export function updateMount(id: string, patch: Partial<Omit<StableMount, 'id' | 'createdAt'>>) {
  if (!stable.some((mount) => mount.id === id)) return
  save(stable.map((mount) => (mount.id === id ? { ...mount, ...patch } : mount)))
}

export function removeMount(id: string) {
  if (!stable.some((mount) => mount.id === id)) return
  save(stable.filter((mount) => mount.id !== id))
}

/**
 * Un accouplement a eu lieu : les deux parents deviennent stériles, et le bébé
 * — de la variété et du sexe constatés en jeu — rejoint l'étable, tenu pour
 * préparé au niveau visé du plan (sa préparation était déjà dans le coût), avec
 * pour arbre réel ses deux parents et leurs parents à eux.
 */
export function recordBreeding(
  fatherId: string,
  motherId: string,
  variety: VarietyId,
  sex: Sex | null,
  level: number,
  intended: VarietyId | null = null,
): string {
  const father = stable.find((mount) => mount.id === fatherId)
  const mother = stable.find((mount) => mount.id === motherId)
  if (!father || !mother) return ''
  const baby: StableMount = {
    id: newId(),
    variety,
    sex,
    level,
    ready: true,
    sterile: false,
    parents: [father.variety, mother.variety],
    grandparents: [father.parents[0], father.parents[1], mother.parents[0], mother.parents[1]],
    createdAt: new Date().toISOString(),
  }
  log({
    id: newId(),
    kind: 'breeding',
    at: baby.createdAt,
    father: snapshot(father),
    mother: snapshot(mother),
    baby: snapshot(baby),
    intended,
  })
  save([
    ...stable.map((mount) =>
      mount.id === fatherId || mount.id === motherId ? { ...mount, sterile: true } : mount,
    ),
    baby,
  ])
  return baby.id
}

/**
 * Un clonage a eu lieu : la survivante redevient fertile — tenue pour
 * préparée, comme toute monture possédée : la remise à niveau de ses jauges
 * était déjà comptée dans le coût du clonage —, l'autre disparaît. Sexe,
 * niveau et parents restent les siens.
 */
export function recordClone(survivorId: string, lostId: string) {
  const survivor = stable.find((mount) => mount.id === survivorId)
  const lost = stable.find((mount) => mount.id === lostId)
  if (!survivor) return
  if (lost) {
    log({ id: newId(), kind: 'clone', at: new Date().toISOString(), survivor: snapshot(survivor), lost: snapshot(lost) })
  }
  save(
    stable
      .filter((mount) => mount.id !== lostId)
      .map((mount) =>
        mount.id === survivorId ? { ...mount, sterile: false, ready: true } : mount,
      ),
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useStable(): readonly StableMount[] {
  return useSyncExternalStore(
    subscribe,
    () => stable,
    () => stable,
  )
}
