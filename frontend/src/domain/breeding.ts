/**
 * Planification d'un élevage : de la variété visée aux montures de départ,
 * avec les croisements dans l'ordre, l'avancement de chacun, la probabilité
 * d'aboutir et ce que tout cela coûte.
 *
 * Volontairement pur — ni React, ni stockage, ni formatage — comme `craft.ts`.
 * La page ne fait qu'afficher ce qui sort d'ici et renvoyer les saisies au
 * store des plans.
 *
 * Deux arbres à ne pas confondre :
 *
 * - la **recette théorique** d'une variété : ses deux parents, puis les leurs,
 *   jusqu'aux générations 1. C'est ce que le jeu publie, et ce que la fiche
 *   d'une monture montre. Une variété peut avoir plusieurs recettes (les muldos
 *   et volkornes surtout) : le plan en retient une par emplacement.
 * - l'**arbre réel** d'une monture possédée : ses parents et grands-parents
 *   tels qu'ils sont, que l'utilisateur renseigne s'il les connaît. C'est lui
 *   qui décide quelles variétés de la génération cible peuvent naître.
 *
 * Ce qu'on sait de la probabilité, depuis la refonte 3.5 : la chance d'obtenir
 * *la génération cible* vaut 30 % + 0,15 % × (niveau A + niveau B), +10 % avec
 * une Optimakina, plafonnée à 100 %. La répartition entre les variétés de cette
 * génération, elle, dépend des ancêtres selon une formule que le jeu ne
 * publie pas : on ne l'invente pas. Quand une seule variété est possible, la
 * probabilité de la génération est celle de la variété ; sinon on affiche les
 * candidates, et « probabilité exacte inconnue ».
 */
import { buildCarburantRows } from './carburant'
import type { Gauge } from '../data/carburants'
import {
  cheapestOptimakina,
  FEED_GAUGE,
  FERTILITY_GAUGES,
  fertilityPoints,
  readMakinas,
  varietyName,
  type Makina,
} from '../data/mounts'
import type {
  Catalog,
  IgnoredSet,
  Item,
  ItemId,
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

/**
 * Tentatives nécessaires pour que la chance cumulée atteigne `confidence`.
 * Toujours au moins une, et une seule quand le succès est certain.
 */
export function attemptsFor(chance: number, confidence: number): number {
  if (chance >= 1) return 1
  if (chance <= 0) return Infinity
  return Math.max(1, Math.ceil(Math.log(1 - confidence) / Math.log(1 - chance)))
}

/** Les seuils de confiance affichés, dans l'ordre. */
export const CONFIDENCE_LEVELS: readonly number[] = [0.5, 0.8, 0.9, 0.95]

// --- Le plan, tel qu'il est sauvegardé ----------------------------------------

export type Sex = 'male' | 'female'

/**
 * Où en est une monture d'un plan. `missing` est l'absence de monture ; les
 * autres se déclarent, dans l'ordre où un élevage les traverse : possédée,
 * en préparation (jauges), féconde, reproduction faite — stérile désormais.
 * `obtained` est l'état de naissance d'un bébé issu du plan.
 */
export type MountStatus = 'missing' | 'owned' | 'preparing' | 'fertile' | 'bred' | 'obtained'

export type OwnedStatus = Exclude<MountStatus, 'missing'>

export const STATUS_ORDER: readonly MountStatus[] = [
  'missing',
  'owned',
  'obtained',
  'preparing',
  'fertile',
  'bred',
]

/**
 * D'où vient une monture : achetée ou capturée (`external`), ou née d'un
 * croisement de ce plan (`bred`). C'est l'origine, pas l'état, qui dit si le
 * croisement en dessous a eu lieu — l'état continue d'évoluer ensuite, quand
 * le bébé devient à son tour un parent.
 */
export type MountOrigin = 'external' | 'bred'

export interface OwnedMount {
  origin: MountOrigin
  sex: Sex | null
  level: number
  status: OwnedStatus
  /** Arbre réel : les deux parents, `null` quand on ne les connaît pas. */
  parents: [VarietyId | null, VarietyId | null]
  /** Puis les quatre grands-parents, dans l'ordre : ceux du premier parent, ceux du second. */
  grandparents: [VarietyId | null, VarietyId | null, VarietyId | null, VarietyId | null]
}

export interface PlanSettings {
  /** Niveau auquel on monte chaque parent avant de le faire reproduire. */
  targetLevel: number
  /** Points de mangeoire à verser pour l'y amener. */
  feedPoints: number
  /** Une Optimakina à chaque croisement. */
  optimakina: boolean
  /** Un parent à la capacité Reproducteur : deux bébés par portée. */
  reproducteur: boolean
}

/**
 * Un emplacement du plan est désigné par son chemin dans l'arbre : `''` la
 * cible, `'0'` et `'1'` ses deux parents, `'00'` le premier parent du
 * premier parent, etc. Un chemin ne dépend que de la variété visée et des
 * recettes retenues : un plan reste lisible quand les données changent.
 */
export type SlotPath = string

export interface Plan {
  id: string
  target: VarietyId
  createdAt: string
  updatedAt: string
  settings: PlanSettings
  /** Recette retenue par emplacement, quand la variété en a plusieurs. */
  recipes: Record<SlotPath, number>
  mounts: Record<SlotPath, OwnedMount>
}

// --- L'évaluation d'un plan ---------------------------------------------------

export type CrossState = 'done' | 'ready' | 'in-progress' | 'waiting' | 'blocked'

export type IssueKind = 'same-sex' | 'sterile'

export interface Issue {
  kind: IssueKind
  message: string
}

export interface Slot {
  path: SlotPath
  variety: MountVariety
  depth: number
  mount: OwnedMount | null
  status: MountStatus
  /**
   * Le croisement qui doit produire cette monture. `null` pour un point de
   * départ : génération 1, variété hors élevage, ou monture déjà possédée.
   */
  cross: Cross | null
  /** Une recette existe, mais la monture étant là, son arbre n'est pas déroulé. */
  collapsed: boolean
}

export interface Cross {
  path: SlotPath
  child: Slot
  recipeIndex: number
  recipeCount: number
  parents: [Slot, Slot]
  /** Chance qu'un bébé soit de la génération cible. */
  chance: number
  /** Chance qu'une portée en donne au moins un : deux bébés avec Reproducteur. */
  attemptChance: number
  /** Calculée sur les niveaux des montures en place, ou sur le niveau visé du plan. */
  chanceFromMounts: boolean
  /**
   * Variétés de la génération cible que les arbres réels des deux parents
   * rendent possibles. La variété visée y est toujours ; quand elle y est
   * seule, la probabilité de génération est aussi celle de la variété.
   */
  possibleTargets: MountVariety[]
  exact: boolean
  state: CrossState
  issues: Issue[]
  /** Rang dans l'ordre d'exécution : les croisements du bas de l'arbre d'abord. */
  step: number
}

export interface StartingMount {
  variety: MountVariety
  /** Emplacements de départ de cette variété : ce qu'il faut au minimum, tout réussissant du premier coup. */
  minimum: number
  /** Ce qu'il faut en moyenne, une fois comptées les tentatives et les parents devenus stériles. */
  expected: number
  /** Emplacements déjà pourvus. */
  owned: number
}

export interface PlanEvaluation {
  root: Slot
  slots: Slot[]
  /** Dans l'ordre d'exécution. */
  crosses: Cross[]
  starting: StartingMount[]
  done: number
  blocked: number
}

const RECIPE_LESS: readonly (readonly [VarietyId, VarietyId])[] = []

/**
 * Déroule le plan en arbre d'emplacements et de croisements.
 *
 * Un emplacement pourvu d'une monture venue d'ailleurs arrête la descente :
 * son arbre théorique existe, mais il n'y a plus rien à élever en dessous. Un
 * bébé né du plan, lui, garde son croisement — il est fait, et ses parents
 * restent visibles, stériles.
 */
export function evaluatePlan(mounts: MountCatalog, plan: Plan): PlanEvaluation {
  const slots: Slot[] = []
  const crosses: Cross[] = []

  function build(path: SlotPath, variety: MountVariety, depth: number, trail: ReadonlySet<VarietyId>): Slot {
    const mount = plan.mounts[path] ?? null
    const slot: Slot = {
      path,
      variety,
      depth,
      mount,
      status: mount?.status ?? 'missing',
      cross: null,
      collapsed: false,
    }
    slots.push(slot)

    // Une recette qui remonterait à elle-même ne se déroule pas deux fois.
    const recipes = trail.has(variety.id) ? RECIPE_LESS : variety.recipes
    if (recipes.length === 0) return slot
    if (mount !== null && mount.origin === 'external') {
      slot.collapsed = true
      return slot
    }

    const recipeIndex = Math.min(Math.max(0, plan.recipes[path] ?? 0), recipes.length - 1)
    const recipe = recipes[recipeIndex]
    const first = recipe && mounts.byId.get(recipe[0])
    const second = recipe && mounts.byId.get(recipe[1])
    if (!first || !second) return slot

    const next = new Set(trail)
    next.add(variety.id)
    const parents: [Slot, Slot] = [
      build(`${path}0`, first, depth + 1, next),
      build(`${path}1`, second, depth + 1, next),
    ]

    const chanceFromMounts = parents.every((parent) => parent.mount !== null)
    const [levelA, levelB] = chanceFromMounts
      ? parents.map((parent) => parent.mount?.level ?? 0)
      : [plan.settings.targetLevel, plan.settings.targetLevel]
    const chance = generationChance(levelA ?? 0, levelB ?? 0, plan.settings.optimakina)
    const attemptChance = plan.settings.reproducteur ? successAfter(chance, 2) : chance

    const possibleTargets = possibleTargetVarieties(mounts, variety, parents)
    const done = mount !== null && mount.origin === 'bred'
    const issues = done ? [] : crossIssues(parents)

    const cross: Cross = {
      path,
      child: slot,
      recipeIndex,
      recipeCount: recipes.length,
      parents,
      chance,
      attemptChance,
      chanceFromMounts,
      possibleTargets,
      exact: possibleTargets.length === 1,
      state: done
        ? 'done'
        : issues.length > 0
          ? 'blocked'
          : parents.some((parent) => parent.mount === null)
            ? 'waiting'
            : parents.every((parent) => parent.status === 'fertile')
              ? 'ready'
              : 'in-progress',
      issues,
      // Les parents ont été construits avant : leurs croisements sont déjà
      // numérotés, celui-ci vient après.
      step: crosses.length + 1,
    }
    crosses.push(cross)
    slot.cross = cross
    return slot
  }

  const target = mounts.byId.get(plan.target)
  if (!target) throw new Error(`Variété inconnue : ${plan.target}`)
  const root = build('', target, 0, new Set())

  return {
    root,
    slots,
    crosses,
    starting: startingMounts(root),
    done: crosses.filter((cross) => cross.state === 'done').length,
    blocked: crosses.filter((cross) => cross.state === 'blocked').length,
  }
}

/** Un plan vierge : la recette théorique d'une variété, sans aucune monture. */
export const theoreticalPlan = (target: VarietyId, settings: PlanSettings): Plan => ({
  id: '',
  target,
  createdAt: '',
  updatedAt: '',
  settings,
  recipes: {},
  mounts: {},
})

/**
 * Ce qui empêche un croisement : deux parents du même sexe, ou un parent
 * déjà stérile alors que le bébé n'est pas né. Un parent manquant n'est pas
 * un blocage, c'est l'étape d'avant qui n'est pas faite.
 */
function crossIssues(parents: [Slot, Slot]): Issue[] {
  const issues: Issue[] = []
  const [a, b] = parents
  if (a.mount?.sex && b.mount?.sex && a.mount.sex === b.mount.sex) {
    issues.push({
      kind: 'same-sex',
      message: 'Les deux parents sont du même sexe : il faut un mâle et une femelle.',
    })
  }
  for (const parent of parents) {
    if (parent.mount?.status === 'bred') {
      issues.push({
        kind: 'sterile',
        message: `${varietyName(parent.variety)} a déjà reproduit : stérile, il faut une nouvelle monture féconde ou un clone.`,
      })
    }
  }
  return issues
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
 * compose d'un ancêtre de chaque parent. Sans ancêtre renseigné, il ne reste
 * que la variété visée.
 *
 * C'est une lecture des recettes, pas la formule du jeu : elle dit ce qui
 * *peut* naître, jamais avec quelle chance.
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
 * Nombre moyen de fois où chaque emplacement devra être pourvu.
 *
 * La cible une fois ; chacun de ses parents autant de fois qu'il y aura de
 * tentatives en moyenne — les parents d'un croisement raté sont stériles, la
 * tentative suivante en demande deux neufs — et ainsi de suite en descendant.
 */
export function multiplicities(root: Slot): Map<SlotPath, number> {
  const result = new Map<SlotPath, number>()
  function walk(slot: Slot, count: number) {
    result.set(slot.path, count)
    if (!slot.cross) return
    const attempts = count * meanAttempts(slot.cross.attemptChance)
    for (const parent of slot.cross.parents) walk(parent, attempts)
  }
  walk(root, 1)
  return result
}

/** Les emplacements de départ — ceux qu'aucun croisement du plan ne produit — regroupés par variété. */
function startingMounts(root: Slot): StartingMount[] {
  const expected = multiplicities(root)
  const byVariety = new Map<VarietyId, StartingMount>()
  function walk(slot: Slot) {
    if (slot.cross) {
      for (const parent of slot.cross.parents) walk(parent)
      return
    }
    const entry = byVariety.get(slot.variety.id) ?? {
      variety: slot.variety,
      minimum: 0,
      expected: 0,
      owned: 0,
    }
    entry.minimum += 1
    entry.expected += expected.get(slot.path) ?? 1
    if (slot.mount) entry.owned += 1
    byVariety.set(slot.variety.id, entry)
  }
  walk(root)
  return [...byVariety.values()].sort(
    (a, b) =>
      a.variety.generation - b.variety.generation ||
      a.variety.name.localeCompare(b.variety.name, 'fr'),
  )
}

// --- Coûts ---------------------------------------------------------------------

export interface CostLine {
  label: string
  /** `null` tant qu'un prix manque à cette ligne. */
  amount: number | null
  detail: string
}

export interface Threshold {
  confidence: number
  attempts: number
  cost: number | null
}

export interface CostEstimate {
  /** Préparation d'une monture : mangeoire jusqu'au niveau visé, puis les trois jauges de fécondité. */
  feedPerMount: number | null
  fertilityPerMount: number | null
  /** Optimakina retenue pour le croisement final, et son prix. */
  optimakina: Item | null
  /** Ce que coûte une tentative du croisement final, parents compris. */
  perAttempt: number | null
  meanAttempts: number
  /** Coût moyen de tout le plan : `meanAttempts × perAttempt`. */
  mean: number | null
  thresholds: Threshold[]
  /** Le même total, ventilé. */
  lines: CostLine[]
  /** Ce qui manque pour chiffrer : prix d'items, carburants sans prix… */
  missing: string[]
  complete: boolean
  /** Les items dont un prix rendrait le chiffrage complet, pour les saisir sur place. */
  unpriced: Item[]
}

/** Le prix d'une variété : celui de l'item de monture, ou à défaut de son certificat. */
export function varietyPrice(
  catalog: Catalog,
  prices: PriceMap,
  variety: MountVariety,
): { item: Item | null; price: number | null } {
  const mount = catalog.byId.get(variety.id) ?? null
  const certificate = variety.certificateId === null ? null : (catalog.byId.get(variety.certificateId) ?? null)
  const mountPrice = prices.get(variety.id)
  if (mountPrice !== undefined) return { item: mount, price: mountPrice }
  const certificatePrice = variety.certificateId === null ? undefined : prices.get(variety.certificateId)
  if (certificatePrice !== undefined) return { item: certificate, price: certificatePrice }
  return { item: mount ?? certificate, price: null }
}

/**
 * Le moins cher des carburants de chaque jauge, en kamas par point : achat ou
 * craft, comme sur le tableau de bord des carburants. `null` pour une jauge
 * dont aucun carburant n'a de prix.
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
 * Chiffre un plan, de zéro : ce que coûterait de tout acheter et tout élever,
 * tentatives comprises. Les montures déjà en place ne sont pas déduites — un
 * élevage qui rate demande de toute façon d'en racheter, et un chiffrage
 * partiel se lirait comme un reste à payer alors qu'il ne l'est pas.
 *
 * Tout ce qui manque est nommé plutôt que compté pour zéro : un total n'est
 * annoncé que complet.
 */
export function estimateCost(
  catalog: Catalog,
  evaluation: PlanEvaluation,
  settings: PlanSettings,
  prices: PriceMap,
  ignored?: IgnoredSet,
): CostEstimate {
  const missing = new Set<string>()
  const unpriced = new Map<ItemId, Item>()
  const perPoint = fuelCostPerPoint(catalog, prices, ignored)
  const makinas = readMakinas(catalog)

  // --- Préparation d'une monture : les mêmes points pour chaque parent. ---
  const feedRate = perPoint.get(FEED_GAUGE)
  if (feedRate === undefined) missing.add('Aucun carburant de mangeoire n’a de prix')
  const feedPerMount = feedRate === undefined ? null : settings.feedPoints * feedRate

  let fertilityPerMount: number | null = 0
  for (const gauge of FERTILITY_GAUGES) {
    const rate = perPoint.get(gauge)
    if (rate === undefined) {
      missing.add(`Aucun carburant de ${gauge} n’a de prix`)
      fertilityPerMount = null
    } else if (fertilityPerMount !== null) {
      fertilityPerMount += fertilityPoints(gauge) * rate
    }
  }
  const prepPerMount =
    feedPerMount === null || fertilityPerMount === null ? null : feedPerMount + fertilityPerMount

  // --- Optimakina, par croisement : la génération de chaque enfant décide. ---
  const optimakinaFor = (cross: Cross): number | null => {
    if (!settings.optimakina) return 0
    const found = cheapestOptimakina(
      makinas,
      cross.child.variety.species,
      cross.child.variety.generation,
      (itemId) => prices.get(itemId) ?? null,
    )
    if (found.item) return found.price
    if (found.candidates.length === 0) {
      missing.add(`Aucune Optimakina n’agit sur ${varietyName(cross.child.variety)}`)
    } else {
      missing.add(`Optimakina de génération ${cross.child.variety.generation} sans prix`)
      for (const item of found.candidates) unpriced.set(item.id, item)
    }
    return null
  }

  // --- Coût attendu d'un emplacement, en descendant l'arbre. ---
  const add = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b)
  const times = (a: number | null, k: number) => (a === null ? null : a * k)

  function unitCost(slot: Slot): number | null {
    if (!slot.cross) {
      const { item, price } = varietyPrice(catalog, prices, slot.variety)
      if (price === null) {
        missing.add(`${varietyName(slot.variety)} sans prix`)
        if (item) unpriced.set(item.id, item)
      }
      return price
    }
    return times(attemptCost(slot.cross), meanAttempts(slot.cross.attemptChance))
  }

  /** Une tentative : les deux parents, leur préparation, l'Optimakina. */
  function attemptCost(cross: Cross): number | null {
    const parents = add(unitCost(cross.parents[0]), unitCost(cross.parents[1]))
    return add(add(parents, times(prepPerMount, 2)), optimakinaFor(cross))
  }

  const final = evaluation.root.cross
  const perAttempt = final ? attemptCost(final) : unitCost(evaluation.root)
  const attempts = final ? meanAttempts(final.attemptChance) : 1
  const mean = final ? times(perAttempt, attempts) : perAttempt

  // --- La même somme, ventilée : ce qu'on achète, ce qu'on verse, ce qu'on casse. ---
  const counts = multiplicities(evaluation.root)
  let startingCost: number | null = 0
  let parentsTotal = 0
  let optimakinaCost: number | null = 0
  let optimakinaItem: Item | null = null
  for (const slot of evaluation.slots) {
    const count = counts.get(slot.path) ?? 1
    if (slot.cross) {
      const tries = count * meanAttempts(slot.cross.attemptChance)
      parentsTotal += 2 * tries
      optimakinaCost = add(optimakinaCost, times(optimakinaFor(slot.cross), tries))
    } else {
      startingCost = add(startingCost, times(varietyPrice(catalog, prices, slot.variety).price, count))
    }
  }
  if (final && settings.optimakina) {
    const found = cheapestOptimakina(
      makinas,
      final.child.variety.species,
      final.child.variety.generation,
      (itemId) => prices.get(itemId) ?? null,
    )
    optimakinaItem = found.item
  }

  const lines: CostLine[] = [
    {
      label: 'Montures de départ',
      amount: startingCost,
      detail: 'Prix HDV des générations 1, autant de fois qu’il en faudra en moyenne',
    },
    {
      label: 'Mangeoire',
      amount: times(feedPerMount, parentsTotal),
      detail: `${settings.feedPoints.toLocaleString('fr-FR')} points par parent, au carburant le moins cher`,
    },
    {
      label: 'Fécondité',
      amount: times(fertilityPerMount, parentsTotal),
      detail: 'Amour, maturité et endurance à 20 000 pour chaque parent',
    },
  ]
  if (settings.optimakina) {
    lines.push({
      label: 'Optimakinas',
      amount: optimakinaCost,
      detail: 'Une par tentative, la moins chère qui agisse sur la génération visée',
    })
  }

  const thresholds: Threshold[] = final
    ? CONFIDENCE_LEVELS.map((confidence) => {
        const needed = attemptsFor(final.attemptChance, confidence)
        return { confidence, attempts: needed, cost: times(perAttempt, needed) }
      })
    : []

  return {
    feedPerMount,
    fertilityPerMount,
    optimakina: optimakinaItem,
    perAttempt,
    meanAttempts: attempts,
    mean,
    thresholds,
    lines,
    missing: [...missing],
    complete: missing.size === 0 && mean !== null,
    unpriced: [...unpriced.values()],
  }
}

/** Les Makina, exposées pour la page : elle en propose la saisie des prix. */
export type { Makina }
