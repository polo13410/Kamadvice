/**
 * L'assistant d'élevage : depuis la variété visée et l'étable réelle, ce qu'il
 * reste à faire, dans quel ordre, avec quelles montures, et ce que ça coûte.
 *
 * Volontairement pur — ni React, ni stockage, ni formatage — comme `craft.ts`.
 * Un plan ne retient que la cible et ses réglages ; tout le reste se déduit
 * de l'inventaire à chaque rendu, ce qui fait qu'un accouplement ou un
 * clonage enregistré reconstruit le plan sans rien à synchroniser.
 *
 * Deux arbres à ne pas confondre :
 *
 * - la **recette théorique** d'une variété : ses deux parents, puis les leurs,
 *   jusqu'aux générations 1. Une variété peut avoir plusieurs recettes (les
 *   muldos et volkornes surtout) : l'assistant retient celle que l'étable rend
 *   la moins chère, sauf choix explicite.
 * - l'**arbre réel** d'une monture : ses parents et grands-parents tels qu'ils
 *   sont, déduits à la naissance ou renseignés. C'est lui qui décide quelles
 *   variétés de la génération cible peuvent naître d'un couple.
 *
 * La probabilité connue, depuis la refonte 3.5, est celle d'obtenir *la
 * génération cible* : 30 % + 0,15 % × (niveau A + niveau B), +10 % avec une
 * Optimakina, plafonnée à 100 %. La répartition entre variétés de cette
 * génération dépend des ancêtres selon une formule que le jeu ne publie pas :
 * on ne l'invente pas. Les chances sont données accouplement par
 * accouplement ; un échec n'est pas « refaire la branche » — le bébé rejoint
 * l'étable et peut servir ailleurs, ou au clonage.
 */
import type { Gauge } from '../data/carburants'
import {
  cheapestOptimakina,
  FEED_GAUGE,
  FERTILITY_GAUGES,
  fertilityPoints,
  readMakinas,
  varietyName,
} from '../data/mounts'
import { buildCarburantRows } from './carburant'
import type {
  Catalog,
  IgnoredSet,
  Item,
  MountCatalog,
  MountVariety,
  PriceMap,
  VarietyId,
} from './types'

// --- Probabilités ------------------------------------------------------------

/** Chance de base d'obtenir la génération cible, parents au niveau 0. */
export const BASE_CHANCE = 0.3
/** Ce que chaque niveau de chaque parent ajoute. */
export const CHANCE_PER_LEVEL = 0.0015
/** Ce qu'une Optimakina ajoute au croisement. */
export const OPTIMAKINA_BONUS = 0.1

/**
 * Probabilité qu'un bébé soit de la génération cible.
 *
 * 1 + 1 : 30,30 % ; 39 + 39 : 41,70 % ; 100 + 100 : 60 % ; 200 + 200 : 90 %,
 * et 100 % avec une Optimakina.
 */
export function generationChance(levelA: number, levelB: number, optimakina: boolean): number {
  const raw = BASE_CHANCE + CHANCE_PER_LEVEL * (levelA + levelB) + (optimakina ? OPTIMAKINA_BONUS : 0)
  return Math.min(1, Math.max(0, raw))
}

/** Probabilité d'au moins un succès en `attempts` tentatives : 1 − (1 − p)ⁿ. */
export const successAfter = (chance: number, attempts: number): number =>
  1 - (1 - chance) ** attempts

/** Nombre moyen de tentatives avant le premier succès : 1 / p. */
export const meanAttempts = (chance: number): number => (chance <= 0 ? Infinity : 1 / chance)

/** Tentatives nécessaires pour que la chance cumulée atteigne `confidence`. */
export function attemptsFor(chance: number, confidence: number): number {
  if (chance >= 1) return 1
  if (chance <= 0) return Infinity
  return Math.max(1, Math.ceil(Math.log(1 - confidence) / Math.log(1 - chance)))
}

/** Les seuils de confiance affichés, dans l'ordre. */
export const CONFIDENCE_LEVELS: readonly number[] = [0.5, 0.8, 0.9, 0.95]

// --- Niveau et expérience -----------------------------------------------------

export const MAX_LEVEL = 200

/** XP cumulée au niveau donné, `0` sans table. */
export const xpAtLevel = (xp: readonly number[], level: number): number =>
  xp[Math.min(MAX_LEVEL, Math.max(1, Math.round(level)))] ?? 0

/** Le plus haut niveau que ces points de mangeoire permettent d'atteindre depuis le niveau 1. */
export function levelForXp(xp: readonly number[], points: number): number {
  let level = 1
  for (let candidate = 1; candidate <= MAX_LEVEL; candidate++) {
    const needed = xp[candidate]
    if (needed === undefined || needed > points) break
    level = candidate
  }
  return level
}

// --- L'étable et le plan, tels qu'ils sont sauvegardés ---------------------------

export type Sex = 'male' | 'female'

/**
 * Une monture réelle, à l'étable. Deux états comptent pour l'élevage : elle
 * est féconde (jauges pleines) ou pas, et elle est stérile ou pas — une
 * monture qui a reproduit ne sert plus qu'au clonage.
 */
export interface StableMount {
  id: string
  variety: VarietyId
  sex: Sex | null
  level: number
  /** Jauges d'amour, de maturité et d'endurance au maximum. */
  ready: boolean
  sterile: boolean
  /** Arbre réel : les deux parents, `null` quand on ne les connaît pas. */
  parents: [VarietyId | null, VarietyId | null]
  /** Puis les quatre grands-parents : ceux du premier parent, ceux du second. */
  grandparents: [VarietyId | null, VarietyId | null, VarietyId | null, VarietyId | null]
  createdAt: string
}

export interface PlanSettings {
  /** Niveau visé des parents avant de reproduire : `feedPoints` en découle, et réciproquement. */
  targetLevel: number
  /** Points de mangeoire à verser à une monture née au niveau 1 pour l'y amener. */
  feedPoints: number
  /** Une Optimakina à chaque croisement. */
  optimakina: boolean
}

/**
 * Un emplacement du plan est désigné par son chemin dans l'arbre : `''` la
 * cible, `'0'` et `'1'` ses deux parents, `'00'` le premier parent du
 * premier parent, etc.
 */
export type SlotPath = string

export interface Plan {
  id: string
  target: VarietyId
  createdAt: string
  updatedAt: string
  settings: PlanSettings
  /** Recette imposée à un emplacement, quand on ne veut pas de celle que l'étable suggère. */
  recipes: Record<SlotPath, number>
}

/** Un plan vierge : la recette théorique d'une variété, sans étable. */
export const theoreticalPlan = (target: VarietyId, settings: PlanSettings): Plan => ({
  id: '',
  target,
  createdAt: '',
  updatedAt: '',
  settings,
  recipes: {},
})

// --- L'évaluation ---------------------------------------------------------------

/**
 * D'où viendra la monture d'un emplacement : elle est à l'étable, elle sortira
 * d'un clonage, d'un croisement, ou d'une capture (génération 1, ou variété
 * hors élevage).
 */
export type SlotSource = 'mount' | 'clone' | 'cross' | 'capture'

export interface Slot {
  path: SlotPath
  variety: MountVariety
  depth: number
  source: SlotSource
  mount: StableMount | null
  cross: Cross | null
  clone: ClonePlan | null
  /** Le sexe qu'il faudrait ici, quand l'autre parent est déjà connu. */
  wantedSex: Sex | null
  /** Ce qui manque pour que l'emplacement serve : un sexe à renseigner, une femelle à trouver… */
  issue: string | null
}

/**
 * Deux montures de même espèce et génération se détruisent pour en rendre
 * une, féconde, tirée au sort entre les deux — même sexe, même arbre. On
 * propose le clonage quand une variété manque et qu'une copie stérile
 * existe ; la partenaire est choisie pour coûter le moins à perdre.
 */
export interface ClonePlan {
  /** La monture dont on veut une copie féconde. */
  keep: StableMount
  partner: StableMount
  /** La partenaire ne sert à rien d'autre : la perdre ne coûte rien. */
  sacrifice: boolean
}

export type CrossState = 'ready' | 'preparing' | 'waiting' | 'blocked'

export interface Cross {
  path: SlotPath
  child: Slot
  recipeIndex: number
  recipeCount: number
  parents: [Slot, Slot]
  /** Chance qu'un bébé soit de la génération cible. */
  chance: number
  /** Calculée sur les niveaux des deux montures en place, ou sur le niveau visé du plan. */
  chanceFromMounts: boolean
  /**
   * Variétés de la génération cible que les arbres réels des deux parents
   * rendent possibles. La variété visée y est toujours ; quand elle y est
   * seule, la probabilité de génération est aussi celle de la variété.
   */
  possibleTargets: MountVariety[]
  exact: boolean
  state: CrossState
  issues: string[]
  /** Rang dans l'ordre d'exécution : le bas de l'arbre d'abord. */
  step: number
}

export type Suggestion =
  | { kind: 'done' }
  | { kind: 'info'; mount: StableMount; slot: Slot; message: string }
  | { kind: 'breed'; cross: Cross }
  | { kind: 'clone'; slot: Slot; clone: ClonePlan }
  | { kind: 'prepare'; mount: StableMount; slot: Slot; feed: number; gauges: boolean }
  | { kind: 'capture'; slot: Slot }

export interface Evaluation {
  root: Slot
  slots: Slot[]
  /** Les croisements restants, dans l'ordre d'exécution. */
  crosses: Cross[]
  /** Monture réservée → emplacement qu'elle occupe (clonage compris). */
  reserved: ReadonlyMap<string, Slot>
  /** Montures de l'espèce que le plan n'emploie pas : matière à clonage. */
  surplus: StableMount[]
  suggestion: Suggestion
  /** Emplacements encore à pourvoir, cible comprise. */
  remaining: number
  done: boolean
}

/**
 * Unités du chiffrage interne : des points de jauge. C'est ce qu'un choix de
 * recette compare — ce que coûte d'amener des parents à l'état fécond —
 * sans dépendre d'un prix HDV. Les constantes ci-dessous pèsent ce qui
 * n'est pas un point de jauge : le trajet d'une capture, l'aléa d'un
 * accouplement.
 */
const CAPTURE_PENALTY = 20_000
const MATING_PENALTY = 40_000

const opposite = (sex: Sex): Sex => (sex === 'male' ? 'female' : 'male')

/** Points de fécondité restants : rien si les jauges sont pleines. */
export function fertilityLeft(mount: StableMount): number {
  return mount.ready ? 0 : FERTILITY_GAUGES.reduce((sum, gauge) => sum + fertilityPoints(gauge), 0)
}

/** Points de mangeoire restants pour amener la monture aux points visés du plan. */
export function feedLeft(xp: readonly number[], mount: StableMount, settings: PlanSettings): number {
  return Math.max(0, settings.feedPoints - xpAtLevel(xp, mount.level))
}

/** Tout ce qu'il reste à verser à une monture avant de la faire reproduire. */
export const prepLeft = (xp: readonly number[], mount: StableMount, settings: PlanSettings): number =>
  feedLeft(xp, mount, settings) + fertilityLeft(mount)

/** Ce que coûte de préparer une monture née au niveau 1. */
export const fullPrep = (xp: readonly number[], settings: PlanSettings): number =>
  Math.max(0, settings.feedPoints - xpAtLevel(xp, 1)) +
  FERTILITY_GAUGES.reduce((sum, gauge) => sum + fertilityPoints(gauge), 0)

/**
 * Déroule le plan sur l'étable : à chaque emplacement, la monture qui convient
 * si elle existe, sinon la façon la moins chère de l'obtenir.
 *
 * Deux passes. La première ignore le clonage et dit quelles variétés manquent ;
 * la seconde sait alors quelles montures stériles valent une copie et
 * lesquelles peuvent être sacrifiées comme partenaires.
 */
export function evaluatePlan(
  mounts: MountCatalog,
  plan: Plan,
  stable: readonly StableMount[],
): Evaluation {
  const found = mounts.byId.get(plan.target)
  if (!found) throw new Error(`Variété inconnue : ${plan.target}`)
  // Une constante déjà vérifiée : les fonctions déclarées plus bas la voient
  // sans que le compilateur ait à refaire le test.
  const target: MountVariety = found
  const xp = mounts.xp
  const settings = plan.settings

  const herd = stable.filter((mount) => mounts.byId.get(mount.variety)?.species === target.species)
  const byVariety = new Map<VarietyId, StableMount[]>()
  for (const mount of herd) {
    const list = byVariety.get(mount.variety)
    if (list) list.push(mount)
    else byVariety.set(mount.variety, [mount])
  }

  // --- Estimation, sans réserver : ce que coûte une monture féconde de la variété. ---
  const estimates = new Map<VarietyId, number>()
  function estimate(varietyId: VarietyId, trail: ReadonlySet<VarietyId>): number {
    const known = estimates.get(varietyId)
    if (known !== undefined) return known
    const variety = mounts.byId.get(varietyId)
    const available = (byVariety.get(varietyId) ?? []).filter((mount) => !mount.sterile)
    let cost: number
    if (available.length > 0) {
      cost = Math.min(...available.map((mount) => prepLeft(xp, mount, settings)))
    } else if (!variety || variety.recipes.length === 0 || trail.has(varietyId)) {
      cost = CAPTURE_PENALTY + fullPrep(xp, settings)
    } else {
      const next = new Set(trail)
      next.add(varietyId)
      cost =
        Math.min(...variety.recipes.map(([a, b]) => estimate(a, next) + estimate(b, next))) +
        MATING_PENALTY +
        fullPrep(xp, settings)
    }
    estimates.set(varietyId, cost)
    return cost
  }

  function run(cloning: ReadonlySet<VarietyId> | null) {
    const slots: Slot[] = []
    const crosses: Cross[] = []
    const reserved = new Map<string, Slot>()

    const available = (varietyId: VarietyId, sex: Sex | null): StableMount[] =>
      (byVariety.get(varietyId) ?? [])
        .filter((mount) => !mount.sterile && !reserved.has(mount.id))
        .filter((mount) => sex === null || mount.sex === null || mount.sex === sex)
        // La plus avancée d'abord : moins à verser, et un sexe connu vaut mieux qu'un inconnu.
        .sort(
          (a, b) =>
            prepLeft(xp, a, settings) - prepLeft(xp, b, settings) ||
            Number(a.sex === null) - Number(b.sex === null),
        )

    /**
     * Un clonage possible pour cette variété, si une copie stérile attend une
     * partenaire — et seulement s'il revient moins cher que de refaire la
     * monture. La partenaire idéale ne sert à rien d'autre ; une partenaire
     * utile ailleurs compte pour la moitié de ce qu'elle coûterait à refaire,
     * puisqu'on la perd une fois sur deux.
     */
    function clonePlan(variety: MountVariety, sex: Sex | null, trail: ReadonlySet<VarietyId>): ClonePlan | null {
      if (!cloning) return null
      const keeps = (byVariety.get(variety.id) ?? []).filter(
        (mount) => mount.sterile && !reserved.has(mount.id) && (sex === null || mount.sex === null || mount.sex === sex),
      )
      if (keeps.length === 0) return null
      const alternative = estimate(variety.id, trail)
      let best: { plan: ClonePlan; cost: number } | null = null
      for (const keep of keeps) {
        const reset = Math.max(0, settings.feedPoints - xpAtLevel(xp, keep.level)) + fullPrep(xp, { ...settings, feedPoints: 0 })
        for (const partner of herd) {
          if (partner.id === keep.id || reserved.has(partner.id)) continue
          const partnerVariety = mounts.byId.get(partner.variety)
          if (!partnerVariety || partnerVariety.generation !== variety.generation) continue
          const needed = cloning.has(partner.variety)
          // Les deux parents d'un même croisement, tous deux stériles et tous
          // deux encore utiles : les cloner l'un contre l'autre n'en rend
          // qu'un, et le couple reste incomplet. Jamais.
          const coParents =
            needed &&
            partner.sterile &&
            mounts.varieties.some((candidate) =>
              candidate.recipes.some(
                ([a, b]) =>
                  (a === keep.variety && b === partner.variety) ||
                  (a === partner.variety && b === keep.variety),
              ),
            )
          if (coParents) continue
          const loss = needed ? 0.5 * estimate(partner.variety, new Set()) : partner.sterile ? 0 : 1_000
          const cost = reset + loss
          if (cost < alternative && (!best || cost < best.cost)) {
            best = { plan: { keep, partner, sacrifice: !needed }, cost }
          }
        }
      }
      return best?.plan ?? null
    }

    function build(
      path: SlotPath,
      variety: MountVariety,
      depth: number,
      trail: ReadonlySet<VarietyId>,
      wantedSex: Sex | null,
      preset: StableMount | null,
    ): Slot {
      const slot: Slot = {
        path,
        variety,
        depth,
        source: 'capture',
        mount: null,
        cross: null,
        clone: null,
        wantedSex,
        issue: null,
      }
      slots.push(slot)

      // La cible : n'importe quelle monture de la variété fait l'affaire,
      // stérile comprise — on ne lui demande plus rien.
      const mount =
        preset ??
        (path === ''
          ? ((byVariety.get(variety.id) ?? [])[0] ?? null)
          : (available(variety.id, wantedSex)[0] ?? null))
      if (mount) {
        reserved.set(mount.id, slot)
        slot.source = 'mount'
        slot.mount = mount
        if (mount.sex === null && path !== '') slot.issue = 'Sexe à renseigner'
        return slot
      }

      const clone = clonePlan(variety, wantedSex, trail)
      if (clone) {
        reserved.set(clone.keep.id, slot)
        reserved.set(clone.partner.id, slot)
        slot.source = 'clone'
        slot.clone = clone
        return slot
      }

      const recipes = trail.has(variety.id) ? [] : variety.recipes
      if (recipes.length === 0) {
        slot.source = 'capture'
        if (wantedSex) slot.issue = `Il faut ${wantedSex === 'male' ? 'un mâle' : 'une femelle'}`
        return slot
      }

      // La recette : imposée, sinon celle que l'étable rend la moins chère.
      const next = new Set(trail)
      next.add(variety.id)
      const forced = plan.recipes[path]
      const recipeIndex =
        forced !== undefined && forced >= 0 && forced < recipes.length
          ? forced
          : recipes
              .map(([a, b], index) => ({ index, cost: estimate(a, next) + estimate(b, next) }))
              .sort((x, y) => x.cost - y.cost)[0]!.index
      const [varA, varB] = recipes[recipeIndex]!
      const first = mounts.byId.get(varA)
      const second = mounts.byId.get(varB)
      if (!first || !second) {
        slot.source = 'capture'
        return slot
      }

      // Le couple : un mâle et une femelle parmi ce que l'étable a. Quand les
      // deux côtés n'ont que le même sexe, on garde la monture la plus chère
      // à refaire, et l'autre côté cherchera le sexe qui manque.
      const candidatesA = available(varA, null)
      const candidatesB = available(varB, null)
      let pick: [StableMount | null, StableMount | null] = [null, null]
      let bestScore = Infinity
      for (const a of candidatesA) {
        for (const b of candidatesB) {
          if (a.id === b.id) continue
          if (a.sex && b.sex && a.sex === b.sex) continue
          const unknown = Number(a.sex === null) + Number(b.sex === null)
          const score = prepLeft(xp, a, settings) + prepLeft(xp, b, settings) + unknown * 1_000_000
          if (score < bestScore) {
            bestScore = score
            pick = [a, b]
          }
        }
      }
      if (!pick[0] && !pick[1]) {
        const a = candidatesA[0] ?? null
        const b = candidatesB[0] ?? null
        if (a && b) {
          pick = estimate(varA, next) >= estimate(varB, next) ? [a, null] : [null, b]
        } else {
          pick = [a, b]
        }
      }
      const sexForB = pick[0]?.sex ? opposite(pick[0].sex) : null
      const sexForA = pick[1]?.sex ? opposite(pick[1].sex) : null
      const parents: [Slot, Slot] = [
        build(`${path}0`, first, depth + 1, next, pick[0] ? null : sexForA, pick[0]),
        build(`${path}1`, second, depth + 1, next, pick[1] ? null : sexForB, pick[1]),
      ]

      const chanceFromMounts = parents.every((parent) => parent.mount !== null)
      const chance = chanceFromMounts
        ? generationChance(parents[0].mount!.level, parents[1].mount!.level, settings.optimakina)
        : generationChance(settings.targetLevel, settings.targetLevel, settings.optimakina)

      const issues = parents.flatMap((parent) => (parent.issue ? [parent.issue] : []))
      const state: CrossState = !chanceFromMounts
        ? 'waiting'
        : issues.length > 0
          ? 'blocked'
          : parents.every((parent) => parent.mount?.ready)
            ? 'ready'
            : 'preparing'

      const possibleTargets = possibleTargetVarieties(mounts, variety, parents)
      const cross: Cross = {
        path,
        child: slot,
        recipeIndex,
        recipeCount: recipes.length,
        parents,
        chance,
        chanceFromMounts,
        possibleTargets,
        exact: possibleTargets.length === 1,
        state,
        issues,
        step: crosses.length + 1,
      }
      crosses.push(cross)
      slot.source = 'cross'
      slot.cross = cross
      return slot
    }

    const root = build('', target, 0, new Set(), null, null)
    return { root, slots, crosses, reserved }
  }

  const first = run(null)
  const missing = new Set(first.slots.filter((slot) => slot.mount === null).map((slot) => slot.variety.id))
  const { root, slots, crosses, reserved } = missing.size > 0 ? run(missing) : first

  const surplus = herd.filter((mount) => !reserved.has(mount.id))
  const remaining = slots.filter((slot) => slot.mount === null).length

  return {
    root,
    slots,
    crosses,
    reserved,
    surplus,
    suggestion: suggest(xp, root, slots, crosses, settings),
    remaining,
    done: root.mount !== null,
  }
}

/** La variété d'une monture, ses parents et grands-parents réels quand on les connaît. */
function lineage(slot: Slot): Set<VarietyId> {
  const ids = new Set<VarietyId>([slot.variety.id])
  if (slot.mount) {
    for (const id of [...slot.mount.parents, ...slot.mount.grandparents]) if (id !== null) ids.add(id)
  }
  return ids
}

/**
 * Les variétés de la génération cible qu'un croisement peut donner, d'après
 * les arbres réels : chaque variété de cette génération dont une recette se
 * compose d'un ancêtre de chaque parent. Sans ancêtre connu, il ne reste que
 * la variété visée. Une lecture des recettes, pas la formule du jeu : elle
 * dit ce qui *peut* naître, jamais avec quelle chance.
 */
function possibleTargetVarieties(
  mounts: MountCatalog,
  target: MountVariety,
  parents: [Slot, Slot],
): MountVariety[] {
  const left = lineage(parents[0])
  const right = lineage(parents[1])
  const found: MountVariety[] = [target]
  for (const candidate of mounts.varieties) {
    if (candidate === target) continue
    if (candidate.species !== target.species || candidate.generation !== target.generation) continue
    const reachable = candidate.recipes.some(
      ([a, b]) => (left.has(a) && right.has(b)) || (left.has(b) && right.has(a)),
    )
    if (reachable) found.push(candidate)
  }
  return found
}

/**
 * La prochaine chose à faire, une seule. Dans l'ordre : dire ce qu'on ne sait
 * pas (un sexe), accoupler ce qui est prêt, cloner ce qui s'y prête — une
 * remise à zéro de jauges coûte moins qu'une branche —, préparer ce qui
 * attend, et enfin capturer ce qui manque en bas de l'arbre.
 */
function suggest(
  xp: readonly number[],
  root: Slot,
  slots: Slot[],
  crosses: Cross[],
  settings: PlanSettings,
): Suggestion {
  if (root.mount) return { kind: 'done' }

  for (const slot of slots) {
    if (slot.mount && slot.mount.sex === null && slot.path !== '') {
      return { kind: 'info', mount: slot.mount, slot, message: `Renseigner le sexe de ${varietyName(slot.variety)}` }
    }
  }

  const ready = crosses.find((cross) => cross.state === 'ready')
  if (ready) return { kind: 'breed', cross: ready }

  const clone = slots.find((slot) => slot.source === 'clone')
  if (clone?.clone) return { kind: 'clone', slot: clone, clone: clone.clone }

  let prepare: Suggestion | null = null
  let least = Infinity
  for (const cross of crosses) {
    if (cross.state !== 'preparing') continue
    for (const parent of cross.parents) {
      const mount = parent.mount
      if (!mount || mount.ready) continue
      const left = prepLeft(xp, mount, settings)
      if (left < least) {
        least = left
        prepare = { kind: 'prepare', mount, slot: parent, feed: feedLeft(xp, mount, settings), gauges: !mount.ready }
      }
    }
  }
  if (prepare) return prepare

  // Le bas de l'arbre d'abord : c'est par là que tout commence.
  const capture = [...slots]
    .filter((slot) => slot.source === 'capture' && slot.mount === null)
    .sort((a, b) => b.depth - a.depth)[0]
  if (capture) return { kind: 'capture', slot: capture }

  return { kind: 'done' }
}

/** Ce qu'il faut capturer : les emplacements sans monture ni recette, par variété. */
export function captures(evaluation: Evaluation): { variety: MountVariety; count: number }[] {
  const counts = new Map<VarietyId, { variety: MountVariety; count: number }>()
  for (const slot of evaluation.slots) {
    if (slot.source !== 'capture' || slot.mount) continue
    const entry = counts.get(slot.variety.id) ?? { variety: slot.variety, count: 0 }
    entry.count += 1
    counts.set(slot.variety.id, entry)
  }
  return [...counts.values()].sort((a, b) => a.variety.name.localeCompare(b.variety.name, 'fr'))
}

// --- Coût du plan actuel -----------------------------------------------------------

export interface CostLine {
  label: string
  /** Points de jauge à verser, ou nombre d'objets. */
  points: number
  /** Kamas, `null` tant qu'un prix manque à cette ligne. */
  amount: number | null
  detail: string
}

export interface CostEstimate {
  lines: CostLine[]
  /** Points de jauge à verser, toutes lignes confondues. */
  points: number
  total: number | null
  complete: boolean
  missing: string[]
  /** Les items dont un prix rendrait le chiffrage complet, pour les saisir sur place. */
  unpriced: Item[]
}

/**
 * Le moins cher des carburants de chaque jauge, en kamas par point : achat ou
 * craft, comme sur le tableau de bord des carburants.
 */
export function fuelCostPerPoint(
  catalog: Catalog,
  prices: PriceMap,
  ignored?: IgnoredSet,
): Map<Gauge, number> {
  const best = new Map<Gauge, number>()
  for (const row of buildCarburantRows(catalog, prices, ignored)) {
    if (row.unitCost === null) continue
    const perPoint = row.unitCost / row.points
    const current = best.get(row.gauge)
    if (current === undefined || perPoint < current) best.set(row.gauge, perPoint)
  }
  return best
}

/**
 * Ce que coûte le plan tel qu'il est : préparer les montures en place,
 * préparer celles qui restent à obtenir, remettre à zéro celles qu'on clone,
 * et les Optimakinas des croisements restants. Ni tentatives moyennes ni
 * branches à refaire : le chiffre bouge à chaque résultat réel.
 */
export function estimateCost(
  catalog: Catalog,
  evaluation: Evaluation,
  settings: PlanSettings,
  prices: PriceMap,
  ignored?: IgnoredSet,
): CostEstimate {
  const xp = catalog.mounts.xp
  const missing = new Set<string>()
  const unpriced = new Map<number, Item>()
  const rate = fuelCostPerPoint(catalog, prices, ignored)

  const feedRate = rate.get(FEED_GAUGE) ?? null
  if (feedRate === null) missing.add('Aucun carburant de mangeoire n’a de prix')
  // Les trois jauges de fécondité se remplissent ensemble : leur coût se
  // compte pour un jeu complet, au prorata des points restants.
  const fertility = FERTILITY_GAUGES.reduce((sum, gauge) => sum + fertilityPoints(gauge), 0)
  let fertilityCost: number | null = 0
  for (const gauge of FERTILITY_GAUGES) {
    const value = rate.get(gauge)
    if (value === undefined) {
      missing.add(`Aucun carburant de ${gauge} n’a de prix`)
      fertilityCost = null
    } else if (fertilityCost !== null) {
      fertilityCost += fertilityPoints(gauge) * value
    }
  }
  const priceOf = (feed: number, gauges: number): number | null =>
    feedRate === null || fertilityCost === null
      ? null
      : feed * feedRate + (gauges / fertility) * fertilityCost

  let inPlaceFeed = 0
  let inPlaceGauges = 0
  let inPlace = 0
  let toObtain = 0
  let clones = 0
  let cloneFeed = 0
  for (const slot of evaluation.slots) {
    if (slot.path === '') continue
    if (slot.mount) {
      const feed = feedLeft(xp, slot.mount, settings)
      const gauges = fertilityLeft(slot.mount)
      if (feed + gauges > 0) inPlace += 1
      inPlaceFeed += feed
      inPlaceGauges += gauges
    } else if (slot.clone) {
      clones += 1
      cloneFeed += Math.max(0, settings.feedPoints - xpAtLevel(xp, slot.clone.keep.level))
    } else {
      toObtain += 1
    }
  }
  const newFeed = Math.max(0, settings.feedPoints - xpAtLevel(xp, 1))

  const lines: CostLine[] = [
    {
      label: 'Préparer les montures en place',
      points: inPlaceFeed + inPlaceGauges,
      amount: priceOf(inPlaceFeed, inPlaceGauges),
      detail: `${inPlace} monture${inPlace > 1 ? 's' : ''} à monter jusqu’aux points visés ou à rendre féconde${inPlace > 1 ? 's' : ''}`,
    },
    {
      label: 'Préparer les montures à obtenir',
      points: toObtain * (newFeed + fertility),
      amount: priceOf(toObtain * newFeed, toObtain * fertility),
      detail: `${toObtain} monture${toObtain > 1 ? 's' : ''} encore à faire naître ou à capturer, chacune du niveau 1 aux jauges pleines`,
    },
  ]
  if (clones > 0) {
    lines.push({
      label: 'Clonages',
      points: cloneFeed + clones * fertility,
      amount: priceOf(cloneFeed, clones * fertility),
      detail: `${clones} clonage${clones > 1 ? 's' : ''} suggéré${clones > 1 ? 's' : ''} : les jauges de la survivante repartent de zéro`,
    })
  }
  if (settings.optimakina) {
    const makinas = readMakinas(catalog)
    let amount: number | null = 0
    for (const cross of evaluation.crosses) {
      const found = cheapestOptimakina(makinas, cross.child.variety.species, cross.child.variety.generation, (id) => prices.get(id) ?? null)
      if (found.item) {
        if (amount !== null) amount += found.price
      } else {
        amount = null
        if (found.candidates.length === 0) missing.add(`Aucune Optimakina n’agit sur ${varietyName(cross.child.variety)}`)
        else {
          missing.add(`Optimakina de génération ${cross.child.variety.generation} sans prix`)
          for (const item of found.candidates) unpriced.set(item.id, item)
        }
      }
    }
    lines.push({
      label: 'Optimakinas',
      points: evaluation.crosses.length,
      amount,
      detail: `Une par croisement restant, la moins chère qui agisse sur la génération visée`,
    })
  }

  const points = lines.filter((line) => line.label !== 'Optimakinas').reduce((sum, line) => sum + line.points, 0)
  const total = lines.every((line) => line.amount !== null)
    ? lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
    : null

  return {
    lines,
    points,
    total,
    complete: total !== null && missing.size === 0,
    missing: [...missing],
    unpriced: [...unpriced.values()],
  }
}
