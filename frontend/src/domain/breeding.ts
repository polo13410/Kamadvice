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
 * Une monture réelle, à l'étable. Une monture déclarée possédée est tenue
 * pour préparée : sexe et niveau connus, jauges faites, plus rien à verser.
 * Deux états comptent encore : stérile — elle a reproduit, elle ne sert plus
 * qu'au clonage — et, pour une survivante de clonage seulement, des jauges
 * remises à zéro qu'on compte dans le coût tant qu'on ne les a pas refaites.
 */
export interface StableMount {
  id: string
  variety: VarietyId
  sex: Sex | null
  level: number
  /** Préparée. Faux seulement après un clonage, jusqu'à confirmation. */
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
  /**
   * Compter les montures « au nombre probable » : chaque croisement se prévoit
   * en `1 / chance` tentatives, arrondi (voir `plannedAttempts`), et chaque
   * tentative consomme un couple — ses parents sont à prévoir d'autant. Sans
   * cascade d'un étage à l'autre (voir `computeNeeds`). Décoché, une
   * tentative par croisement.
   */
  probable: boolean
}

/**
 * Tentatives à prévoir pour un croisement : `1 / chance`, arrondi à l'entier
 * en montant dès que la fraction dépasse 0,3 — 40 % → 3, 52 % → 2, 70 % → 2,
 * 80 % → 1, 100 % → 1. Un arrondi de prudence : on prévoit plutôt une
 * monture de trop qu'une de moins.
 */
export const plannedAttempts = (chance: number): number =>
  chance <= 0 ? Infinity : Math.max(1, Math.ceil(1 / chance - 0.3))

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
  /**
   * La monture en place n'est pas de la variété demandée, mais l'a pour
   * parent direct : un bébé raté qui en porte les gènes. Le croisement peut
   * la donner quand même — c'est la seconde chance.
   */
  potential: boolean
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

/** Un croisement se fait (les deux parents sont là, de sexes opposés), attend un parent, ou bute sur un manque. */
export type CrossState = 'ready' | 'waiting' | 'blocked'

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

/**
 * Un enclos loge dix montures, et ses carburants les nourrissent toutes à la
 * fois : c'est la taille des lots — de capture, d'accouplement — et le
 * diviseur du coût des jauges.
 */
export const ENCLOSURE_CAPACITY = 10

/** Une variété du lot, avec le détail des sexes voulus, comme dans « À obtenir ». */
export interface CaptureBatchEntry extends SexNeed {
  variety: MountVariety
  count: number
}

export type Suggestion =
  | { kind: 'done' }
  | { kind: 'info'; mount: StableMount; slot: Slot; message: string }
  /** Jusqu'à cinq couples — dix montures — prêts à accoupler ensemble. */
  | { kind: 'breeds'; crosses: Cross[] }
  /**
   * Jusqu'à cinq clonages — dix montures — à faire avant de recapturer ou de
   * ré-accoupler : les survivantes rejoignent le prochain lot à préparer.
   */
  | { kind: 'clones'; items: { slot: Slot; clone: ClonePlan }[] }
  /** Un lot de captures, un enclos plein au plus, le bas de l'arbre d'abord. */
  | { kind: 'captures'; entries: CaptureBatchEntry[]; total: number; remaining: number }

/**
 * Combien de fois un emplacement doit être pourvu. `need` est ce que les
 * croisements au-dessus consomment ; `missing` ce qu'il reste après la monture
 * en place ; `attempts` les tentatives du croisement de cet emplacement, qui
 * font le `need` de ses deux parents.
 */
export interface SlotNeed {
  need: number
  missing: number
  attempts: number
}

export interface Evaluation {
  root: Slot
  slots: Slot[]
  /** Les croisements restants, dans l'ordre d'exécution. */
  crosses: Cross[]
  /** Besoins par emplacement, selon le réglage « nombre probable ». */
  needs: ReadonlyMap<SlotPath, SlotNeed>
  /** Tentatives à prévoir, tous croisements confondus. */
  attempts: number
  /**
   * Les mêmes besoins « en moyenne » : `1 / chance` sans arrondi. Un ordre de
   * grandeur, fractionnaire — 52 % et 70 % font tous deux 2 tentatives
   * arrondies, mais 1,9 et 1,4 en moyenne.
   */
  meanNeeds: ReadonlyMap<SlotPath, SlotNeed>
  meanAttempts: number
  /** Montures à capturer, en moyenne. */
  meanCaptures: number
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

/** Les trois jauges de fécondité, en points. */
export const FERTILITY_TOTAL = FERTILITY_GAUGES.reduce((sum, gauge) => sum + fertilityPoints(gauge), 0)

/**
 * Ce qu'il reste à verser à une monture en place : rien pour une monture
 * possédée, tout pour une survivante de clonage — ses jauges sont à zéro, et
 * sa mangeoire jusqu'aux points visés si son niveau est en dessous.
 */
export const prepCost = (xp: readonly number[], mount: StableMount, settings: PlanSettings): number =>
  mount.ready ? 0 : Math.max(0, settings.feedPoints - xpAtLevel(xp, mount.level)) + FERTILITY_TOTAL

/** Ce que coûte de préparer une monture née au niveau 1. */
export const fullPrep = (xp: readonly number[], settings: PlanSettings): number =>
  Math.max(0, settings.feedPoints - xpAtLevel(xp, 1)) + FERTILITY_TOTAL

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
  // Les montures qui *portent* une variété sans l'être : leurs parents
  // directs. Un bébé raté d'Ébène × Indigo porte Ébène et Indigo, et peut
  // tenir l'un ou l'autre rôle dans un nouveau croisement.
  const carriers = new Map<VarietyId, StableMount[]>()
  for (const mount of herd) {
    for (const parent of mount.parents) {
      if (parent === null || parent === mount.variety) continue
      const list = carriers.get(parent)
      if (list) list.push(mount)
      else carriers.set(parent, [mount])
    }
  }
  /** Les montures de la variété, puis celles qui la portent. */
  const holders = (varietyId: VarietyId): StableMount[] => [
    ...(byVariety.get(varietyId) ?? []),
    ...(carriers.get(varietyId) ?? []),
  ]

  /**
   * Une porteuse ne vaut que vers le haut : elle sert un croisement d'une
   * génération supérieure à la sienne — retenter ce qui l'a fait naître —,
   * jamais à recréer son propre calibre ou en dessous, ce que ses parents
   * font aussi bien.
   */
  const carrierFits = (mount: StableMount, varietyId: VarietyId, forGeneration: number | null): boolean => {
    if (mount.variety === varietyId) return true
    if (forGeneration === null) return false
    const own = mounts.byId.get(mount.variety)
    return own !== undefined && own.generation < forGeneration
  }

  // --- Estimation, sans réserver : ce que coûte une monture féconde de la variété. ---
  const estimates = new Map<VarietyId, number>()
  function estimate(varietyId: VarietyId, trail: ReadonlySet<VarietyId>): number {
    const known = estimates.get(varietyId)
    if (known !== undefined) return known
    const variety = mounts.byId.get(varietyId)
    const available = holders(varietyId).filter((mount) => !mount.sterile)
    let cost: number
    if (available.length > 0) {
      cost = Math.min(...available.map((mount) => prepCost(xp, mount, settings)))
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

  /** Ce que coûte de *refaire* une monture de la variété, montures en place ignorées. */
  function rebuildEstimate(variety: MountVariety, trail: ReadonlySet<VarietyId>): number {
    if (variety.recipes.length === 0 || trail.has(variety.id)) return CAPTURE_PENALTY + fullPrep(xp, settings)
    const next = new Set(trail)
    next.add(variety.id)
    return (
      Math.min(...variety.recipes.map(([a, b]) => estimate(a, next) + estimate(b, next))) +
      MATING_PENALTY +
      fullPrep(xp, settings)
    )
  }

  /**
   * Les montures « montantes » : un bébé raté dont un parent est d'une
   * génération supérieure à la sienne. Elles valent plus comme porteuses vers
   * le haut que comme elles-mêmes — on ne les emploie telles quelles qu'en
   * dernier, si rien ne reste à porter.
   */
  const upward = new Set(
    herd
      .filter((mount) => {
        const own = mounts.byId.get(mount.variety)?.generation ?? 0
        return mount.parents.some((parent) => parent !== null && (mounts.byId.get(parent)?.generation ?? 0) > own)
      })
      .map((mount) => mount.id),
  )

  interface RunOptions {
    /** Les porteuses sont admises. */
    carriers: boolean
    /** Les variétés qui manquent une fois les porteuses placées, seules à valoir un clonage. */
    cloning: ReadonlySet<VarietyId> | null
    /** Employées telles quelles par la première passe : jamais détournées. */
    protectedIds: ReadonlySet<string>
    /** Montantes qu'on autorise, faute de mieux, à servir comme elles-mêmes. */
    exactUpward: ReadonlySet<string>
    /**
     * Ne poser que des couples complets — un mâle et une femelle disponibles
     * pour le même croisement — et laisser les célibataires. Ce qui est posé
     * ainsi est ensuite épinglé (`pins`) pour la passe complète : un
     * croisement qui pouvait se faire ne se voit pas voler un parent par un
     * croisement plus haut dans l'arbre, qui n'avait que celui-là.
     */
    pairsOnly?: boolean
    pins?: ReadonlyMap<SlotPath, string>
    /**
     * Les variétés que l'arbre emploie quelque part : une monture féconde de
     * l'une d'elles n'est jamais sacrifiée à un clonage.
     */
    inTree?: ReadonlySet<VarietyId>
  }

  function run({
    carriers: withCarriers,
    cloning,
    protectedIds,
    exactUpward,
    pairsOnly = false,
    pins,
    inTree,
  }: RunOptions) {
    const slots: Slot[] = []
    const crosses: Cross[] = []
    const reserved = new Map<string, Slot>()
    const pinned = (path: SlotPath): StableMount | null => {
      const id = pins?.get(path)
      const mount = id === undefined ? undefined : herd.find((candidate) => candidate.id === id)
      return mount && !mount.sterile && !reserved.has(mount.id) ? mount : null
    }
    // Une monture épinglée attend son emplacement : personne d'autre ne la prend.
    const pinnedIds = new Set(pins?.values() ?? [])

    const available = (varietyId: VarietyId, sex: Sex | null, forGeneration: number | null): StableMount[] =>
      holders(varietyId)
        .filter((mount) => !mount.sterile && !reserved.has(mount.id) && !pinnedIds.has(mount.id))
        .filter((mount) =>
          mount.variety === varietyId
            ? !upward.has(mount.id) || exactUpward.has(mount.id)
            : withCarriers && !protectedIds.has(mount.id) && carrierFits(mount, varietyId, forGeneration),
        )
        .filter((mount) => sex === null || mount.sex === null || mount.sex === sex)
        // La variété elle-même avant une porteuse, une possédée avant une
        // clonée à refaire, puis la plus haute — plus de chance —, et un sexe
        // connu avant un inconnu.
        .sort(
          (a, b) =>
            Number(a.variety !== varietyId) - Number(b.variety !== varietyId) ||
            prepCost(xp, a, settings) - prepCost(xp, b, settings) ||
            b.level - a.level ||
            Number(a.sex === null) - Number(b.sex === null),
        )

    /**
     * Un clonage possible pour cette variété, si une copie stérile attend une
     * partenaire — et seulement s'il revient moins cher que de refaire la
     * monture. Le résultat est tiré au sort entre les deux : la meilleure
     * partenaire est donc celle dont la survie serait *aussi* utile — une
     * stérile d'une variété qui manque ailleurs —, puis celle qui ne sert à
     * rien d'autre, dont la perte ne coûte rien. Une partenaire féconde et
     * utile n'est jamais sacrifiée.
     */
    function clonePlan(variety: MountVariety, sex: Sex | null, trail: ReadonlySet<VarietyId>): ClonePlan | null {
      if (!cloning) return null
      const keeps = (byVariety.get(variety.id) ?? []).filter(
        (mount) => mount.sterile && !reserved.has(mount.id) && (sex === null || mount.sex === null || mount.sex === sex),
      )
      if (keeps.length === 0) return null
      // On est ici parce qu'aucune monture en place ne convient : l'alternative
      // au clonage est bien de refaire la monture, pas d'en prendre une autre.
      const alternative = rebuildEstimate(variety, trail)
      let best: { plan: ClonePlan; cost: number } | null = null
      for (const keep of keeps) {
        const reset = prepCost(xp, { ...keep, ready: false }, settings)
        for (const partner of herd) {
          if (partner.id === keep.id || reserved.has(partner.id)) continue
          const partnerVariety = mounts.byId.get(partner.variety)
          if (!partnerVariety || partnerVariety.generation !== variety.generation) continue
          // Utile : sa variété, ou l'une qu'elle porte, manque quelque part.
          const needed =
            cloning.has(partner.variety) ||
            partner.parents.some((parent) => parent !== null && cloning.has(parent))
          // Une féconde ne se sacrifie que si l'arbre n'a que faire d'elle :
          // ni sa variété, ni celles qu'elle porte, n'y servent — même pas
          // un emplacement plus bas qu'on n'a pas encore visité.
          const serves =
            (inTree?.has(partner.variety) ?? true) ||
            partner.parents.some((parent) => parent !== null && (inTree?.has(parent) ?? false))
          if (!partner.sterile && (needed || serves)) continue
          // Les deux parents d'un même croisement, tous deux stériles et tous
          // deux encore nécessaires : les cloner l'un contre l'autre n'en rend
          // qu'un, et le couple reste incomplet. Si l'un des deux rôles est
          // déjà tenu — par une porteuse, par exemple —, la paire redevient
          // bonne : quelle que soit la survivante, elle sert.
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
          // Une partenaire utile et stérile : la moitié du temps c'est elle
          // qui survit, et c'est encore une bonne nouvelle — elle vaut ce
          // qu'elle épargne. Une inutile stérile ne coûte rien à perdre ; une
          // inutile féconde, un peu.
          const gain = needed ? 0.5 * estimate(partner.variety, new Set()) : partner.sterile ? 0 : -1_000
          const cost = reset - gain
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
      /** Génération du croisement que cet emplacement nourrit ; `null` pour la cible. */
      forGeneration: number | null,
    ): Slot {
      const slot: Slot = {
        path,
        variety,
        depth,
        source: 'capture',
        mount: null,
        potential: false,
        cross: null,
        clone: null,
        wantedSex,
        issue: null,
      }
      slots.push(slot)

      // La cible : n'importe quelle monture de la variété fait l'affaire,
      // stérile comprise — on ne lui demande plus rien. Une porteuse, non :
      // elle n'est pas la cible, elle peut seulement la donner.
      // En passe « couples d'abord », seules les feuilles attendent leur
      // partenaire : une monture qui remplace tout un sous-arbre se pose tout
      // de suite, sans quoi la passe épinglerait des parents pour des
      // emplacements qui n'existeront pas.
      const mount =
        preset ??
        pinned(path) ??
        (path === ''
          ? ((byVariety.get(variety.id) ?? [])[0] ?? null)
          : pairsOnly && variety.recipes.length === 0
            ? null
            : (available(variety.id, wantedSex, forGeneration)[0] ?? null))
      if (mount) {
        reserved.set(mount.id, slot)
        slot.source = 'mount'
        slot.mount = mount
        slot.potential = mount.variety !== variety.id
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
      // Les parents épinglés par la passe « couples complets » passent devant.
      const pinA = pinned(`${path}0`)
      const pinB = pinned(`${path}1`)
      const candidatesA = pinA ? [pinA] : available(varA, null, variety.generation)
      const candidatesB = pinB ? [pinB] : available(varB, null, variety.generation)
      let pick: [StableMount | null, StableMount | null] = [null, null]
      let bestScore = Infinity
      for (const a of candidatesA) {
        for (const b of candidatesB) {
          if (a.id === b.id) continue
          if (a.sex && b.sex && a.sex === b.sex) continue
          const unknown = Number(a.sex === null) + Number(b.sex === null)
          const score =
            prepCost(xp, a, settings) + prepCost(xp, b, settings) - (a.level + b.level) + unknown * 1_000_000
          if (score < bestScore) {
            bestScore = score
            pick = [a, b]
          }
        }
      }
      if (!pick[0] && !pick[1] && pairsOnly) {
        // Pas de couple complet : on ne pose rien, la passe suivante verra.
        pick = [pinA, pinB]
      } else if (!pick[0] && !pick[1]) {
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
        build(`${path}0`, first, depth + 1, next, pick[0] ? null : sexForA, pick[0], variety.generation),
        build(`${path}1`, second, depth + 1, next, pick[1] ? null : sexForB, pick[1], variety.generation),
      ]

      const chanceFromMounts = parents.every((parent) => parent.mount !== null)
      const chance = chanceFromMounts
        ? generationChance(parents[0].mount!.level, parents[1].mount!.level, settings.optimakina)
        : generationChance(settings.targetLevel, settings.targetLevel, settings.optimakina)

      const issues = parents.flatMap((parent) => (parent.issue ? [parent.issue] : []))
      const state: CrossState = !chanceFromMounts ? 'waiting' : issues.length > 0 ? 'blocked' : 'ready'

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

    const root = build('', target, 0, new Set(), null, null, null)
    // Par couches, le bas de l'arbre d'abord : on capture, puis on monte
    // d'un rang à la fois, jusqu'à la cible.
    crosses.sort((a, b) => b.child.depth - a.child.depth || a.path.localeCompare(b.path))
    crosses.forEach((cross, index) => {
      cross.step = index + 1
    })
    return { root, slots, crosses, reserved }
  }

  // Par passes. La première n'emploie que les montures telles quelles (les
  // montantes exceptées) : ce qu'elle prend est protégé. La deuxième y ajoute
  // les porteuses, et dit ce qui manque encore — seules ces variétés-là
  // valent un clonage. La troisième planifie les clonages pour elles. Une
  // dernière, s'il reste des montantes sans emploi et des manques, les laisse
  // servir comme elles-mêmes.
  const lacking = (result: ReturnType<typeof run>) =>
    new Set(result.slots.filter((slot) => slot.mount === null).map((slot) => slot.variety.id))
  /**
   * Chaque passe se joue en deux temps : les couples complets d'abord,
   * épinglés, puis le reste. Sans ça, un croisement haut placé prendrait un
   * parent seul avant qu'un croisement du bas, qui avait déjà l'autre, ne
   * le demande — et le couple prêt attendrait pour rien.
   */
  const settle = (options: RunOptions) => {
    const couples = run({ ...options, pairsOnly: true })
    const pins = new Map<SlotPath, string>()
    for (const [id, slot] of couples.reserved) if (slot.mount?.id === id) pins.set(slot.path, id)
    let result = run({ ...options, pins })
    // Une épingle dont l'emplacement n'a pas été visité retiendrait sa
    // monture pour rien : on la relâche et on rejoue.
    const stale = [...pins].filter(([, id]) => !result.reserved.has(id))
    if (stale.length > 0) {
      for (const [path] of stale) pins.delete(path)
      result = run({ ...options, pins })
    }
    return result
  }
  const none = new Set<string>()
  const first = settle({ carriers: false, cloning: null, protectedIds: none, exactUpward: none })
  let chosen = first
  if (lacking(first).size > 0) {
    const guarded = new Set(first.reserved.keys())
    const inTree = new Set(first.slots.map((slot) => slot.variety.id))
    const second = settle({ carriers: true, cloning: null, protectedIds: guarded, exactUpward: none, inTree })
    const missing = lacking(second)
    chosen = missing.size > 0 ? settle({ carriers: true, cloning: missing, protectedIds: guarded, exactUpward: none, inTree }) : second
    const idle = new Set([...upward].filter((id) => !chosen.reserved.has(id)))
    if (idle.size > 0 && lacking(chosen).size > 0) {
      chosen = settle({ carriers: true, cloning: lacking(second), protectedIds: guarded, exactUpward: idle, inTree })
    }
  }
  const { root, slots, crosses, reserved } = chosen

  const surplus = herd.filter((mount) => !reserved.has(mount.id))
  const remaining = slots.filter((slot) => slot.mount === null).length
  const needs = computeNeeds(root, settings.probable ? 'rounded' : 'one')
  const meanNeeds = computeNeeds(root, settings.probable ? 'mean' : 'one')
  let attempts = 0
  for (const need of needs.values()) attempts += need.attempts
  let meanAttempts = 0
  let meanCaptures = 0
  for (const slot of slots) {
    const need = meanNeeds.get(slot.path)
    if (!need) continue
    meanAttempts += need.attempts
    if (slot.source === 'capture') meanCaptures += need.missing
  }

  return {
    root,
    slots,
    crosses,
    needs,
    attempts,
    meanNeeds,
    meanAttempts,
    meanCaptures,
    reserved,
    surplus,
    suggestion: suggest(
      root,
      slots,
      crosses,
      needs,
      // L'enclos des captures : les sauvages de l'espèce, qu'un emplacement
      // les emploie ou non. Les stériles y sont encore — un lot entamé se
      // finit d'accoupler avant qu'on reparte capturer — mais ne prennent
      // pas de place au lot suivant.
      herd.filter((mount) => (mounts.byId.get(mount.variety)?.recipes.length ?? 1) === 0).length,
      herd.filter(
        (mount) => !mount.sterile && (mounts.byId.get(mount.variety)?.recipes.length ?? 1) === 0,
      ).length,
    ),
    remaining,
    done: root.mount !== null,
  }
}

/** Une tentative par croisement, `1 / chance` arrondi, ou `1 / chance` tel quel. */
type NeedMode = 'one' | 'rounded' | 'mean'

/**
 * Descend l'arbre en comptant : la cible une fois ; chaque parent autant de
 * fois que le croisement juste au-dessus sera tenté, une monture en place
 * couvrant une unité. Les tentatives ne se multiplient *pas* d'un étage à
 * l'autre — chaque croisement se prévoit en `1 / chance` tentatives, point :
 * les échecs plus bas sont absorbés par le réemploi des bébés ratés et le
 * clonage, que l'assistant fait au fil des résultats réels. Sans « nombre
 * probable », une tentative par croisement et tout vaut un.
 */
function computeNeeds(root: Slot, mode: NeedMode): Map<SlotPath, SlotNeed> {
  const needs = new Map<SlotPath, SlotNeed>()
  const perCross = (chance: number): number =>
    mode === 'one' ? 1 : mode === 'rounded' ? plannedAttempts(chance) : meanAttempts(chance)
  function walk(slot: Slot, need: number) {
    const have = slot.mount || slot.clone ? 1 : 0
    const missing = Math.max(0, need - have)
    const attempts = slot.cross && missing > 0 ? perCross(slot.cross.chance) : 0
    needs.set(slot.path, { need, missing, attempts })
    if (slot.cross) for (const parent of slot.cross.parents) walk(parent, attempts)
  }
  walk(root, 1)
  return needs
}

/** Libellé d'un rang d'ancêtres : parents, grands-parents, arrière-grands-parents… */
export function ancestorRank(depth: number): string {
  if (depth === 1) return 'Parents'
  if (depth === 2) return 'Grands-parents'
  if (depth === 3) return 'Arrière-grands-parents'
  return `Ancêtres de rang ${depth}`
}

/**
 * Ce qui manque d'une variété, et de quel sexe : quand l'autre parent est déjà
 * là, c'est le sexe opposé qu'il faut ; sinon n'importe lequel (`any`).
 */
export interface SexNeed {
  male: number
  female: number
  any: number
}

export interface VarietyNeed extends SexNeed {
  variety: MountVariety
  missing: number
  owned: number
}

export interface AncestorRow {
  depth: number
  label: string
  entries: VarietyNeed[]
  missing: number
}

function addNeed(
  into: Map<VarietyId, VarietyNeed>,
  slot: Slot,
  need: SlotNeed,
): void {
  const entry = into.get(slot.variety.id) ?? {
    variety: slot.variety,
    missing: 0,
    owned: 0,
    male: 0,
    female: 0,
    any: 0,
  }
  entry.missing += need.missing
  entry.owned += need.need - need.missing
  if (need.missing > 0) {
    if (slot.wantedSex === 'male') entry.male += need.missing
    else if (slot.wantedSex === 'female') entry.female += need.missing
    else entry.any += need.missing
  }
  into.set(slot.variety.id, entry)
}

/**
 * Les ancêtres de chaque rang : les parents, puis les grands-parents, puis…
 * Chaque rangée ne compte que les emplacements situés exactement à cette
 * profondeur — une génération 1 rencontrée plus haut n'y redescend pas, elle
 * est déjà dans « À capturer ». Groupé par variété, avec ce qu'on a déjà.
 */
export function ancestorRows(evaluation: Evaluation): AncestorRow[] {
  const deepest = Math.max(0, ...evaluation.slots.map((slot) => slot.depth))
  const rows: AncestorRow[] = []
  for (let depth = 1; depth <= deepest; depth++) {
    const byVariety = new Map<VarietyId, VarietyNeed>()
    let missing = 0
    for (const slot of evaluation.slots) {
      if (slot.depth !== depth) continue
      const need = evaluation.needs.get(slot.path)
      if (!need || need.need === 0) continue
      addNeed(byVariety, slot, need)
      missing += need.missing
    }
    const entries = [...byVariety.values()].sort(
      (a, b) => b.variety.generation - a.variety.generation || a.variety.name.localeCompare(b.variety.name, 'fr'),
    )
    if (entries.length > 0) rows.push({ depth, label: ancestorRank(depth), entries, missing })
  }
  return rows
}

/**
 * Ce qu'une monture apporte à un croisement : sa variété et ses deux parents
 * directs — seuls eux comptent, pas les ancêtres plus haut. Sans monture en
 * place, la variété attendue à l'emplacement.
 */
function lineage(slot: Slot): Set<VarietyId> {
  if (!slot.mount) return new Set([slot.variety.id])
  const ids = new Set<VarietyId>([slot.mount.variety])
  for (const id of slot.mount.parents) if (id !== null) ids.add(id)
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
 * La prochaine chose à faire, une seule — mais à l'échelle d'un enclos. Dans
 * l'ordre : dire ce qu'on ne sait pas (un sexe), accoupler tous les couples
 * prêts qui tiennent dans un enclos, cloner ce qui s'y prête — une remise à
 * zéro de jauges coûte moins qu'une branche —, et enfin capturer un lot de ce
 * qui manque, le bas de l'arbre d'abord.
 */
function suggest(
  root: Slot,
  slots: Slot[],
  crosses: Cross[],
  needs: ReadonlyMap<SlotPath, SlotNeed>,
  /** Sauvages à l'étable, stériles compris : l'enclos entamé. */
  inEnclosure: number,
  /** Sauvages féconds seulement : ce qui prend une place au prochain lot. */
  fertileWild: number,
): Suggestion {
  if (root.mount) return { kind: 'done' }

  for (const slot of slots) {
    if (slot.mount && slot.mount.sex === null && slot.path !== '') {
      return { kind: 'info', mount: slot.mount, slot, message: `Renseigner le sexe de ${varietyName(slot.variety)}` }
    }
  }

  // Les captures, une unité par monture manquante, le bas de l'arbre d'abord.
  const units: { variety: MountVariety; sex: Sex | null }[] = []
  const pending = [...slots]
    .filter((slot) => slot.source === 'capture')
    .sort((a, b) => b.depth - a.depth || a.path.localeCompare(b.path))
  for (const slot of pending) {
    const missing = needs.get(slot.path)?.missing ?? 0
    for (let i = 0; i < missing; i++) units.push({ variety: slot.variety, sex: slot.wantedSex })
  }

  // L'enclos des captures : les sauvages en place, accouplés ou non. Tant
  // qu'il n'est pas plein et qu'il reste à capturer, on finit le lot ; les
  // accouplements viennent quand il est plein — un lot entamé se finit
  // d'accoupler — ou quand il n'y a plus rien à capturer.
  const ready = crosses.filter((cross) => cross.state === 'ready')
  if (ready.length > 0 && (units.length === 0 || inEnclosure >= ENCLOSURE_CAPACITY)) {
    return { kind: 'breeds', crosses: ready.slice(0, ENCLOSURE_CAPACITY / 2) }
  }

  // Puis les clonages : deux stériles se détruisent pour en rendre une
  // féconde, et chaque emplacement qui en attend une a déjà sa paire — la
  // plus utile, choisie à l'évaluation. On clone avant de recapturer, pour
  // que les survivantes partent dans le prochain lot à préparer. Un enclos à
  // la fois.
  const cloneSlots = slots.filter((slot) => slot.source === 'clone' && slot.clone !== null)
  if (cloneSlots.length > 0) {
    return {
      kind: 'clones',
      items: cloneSlots
        .slice(0, ENCLOSURE_CAPACITY / 2)
        .map((slot) => ({ slot, clone: slot.clone! })),
    }
  }

  if (units.length === 0) return { kind: 'done' }

  // Ce que l'enclos peut encore accueillir fait le lot, le reste attend le suivant.
  const room = Math.max(1, ENCLOSURE_CAPACITY - fertileWild)
  const batch = new Map<VarietyId, CaptureBatchEntry>()
  for (const unit of units.slice(0, room)) {
    const entry = batch.get(unit.variety.id) ?? { variety: unit.variety, count: 0, male: 0, female: 0, any: 0 }
    entry.count += 1
    if (unit.sex === 'male') entry.male += 1
    else if (unit.sex === 'female') entry.female += 1
    else entry.any += 1
    batch.set(unit.variety.id, entry)
  }
  const entries = [...batch.values()].sort((a, b) => a.variety.name.localeCompare(b.variety.name, 'fr'))
  const total = Math.min(units.length, room)
  return { kind: 'captures', entries, total, remaining: units.length - total }
}

/** Ce qu'il faut capturer : les emplacements sans monture ni recette, par variété, au nombre et au sexe voulus. */
export function captures(evaluation: Evaluation): VarietyNeed[] {
  const counts = new Map<VarietyId, VarietyNeed>()
  for (const slot of evaluation.slots) {
    if (slot.source !== 'capture') continue
    const need = evaluation.needs.get(slot.path)
    if (!need || need.missing === 0) continue
    addNeed(counts, slot, need)
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
  /** Le même total « en moyenne » (`1 / chance` sans arrondi), `null` sans nombre probable ou prix manquant. */
  meanTotal: number | null
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
 * Le coût restant probable : préparer les montures encore à obtenir, refaire
 * les jauges après les clonages — proposés, ou faits et pas encore confirmés
 * —, et les Optimakinas des croisements restants. Une monture possédée ne
 * coûte plus rien. Ni tentatives moyennes ni branches à refaire : le chiffre
 * bouge à chaque résultat réel.
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
  // Un carburant nourrit tout l'enclos : ses points se partagent entre dix
  // montures, et son prix aussi. Le joueur ne les fait pas évoluer une par une.
  const share = 1 / ENCLOSURE_CAPACITY
  const priceOf = (feed: number, gauges: number): number | null =>
    feedRate === null || fertilityCost === null
      ? null
      : (feed * feedRate + (gauges / fertility) * fertilityCost) * share

  let toObtain = 0
  let meanToObtain = 0
  let clones = 0
  let cloneFeed = 0
  for (const slot of evaluation.slots) {
    if (slot.path === '') continue
    // Au-delà de la monture en place, chaque exemplaire manquant est à préparer.
    toObtain += evaluation.needs.get(slot.path)?.missing ?? 0
    meanToObtain += evaluation.meanNeeds.get(slot.path)?.missing ?? 0
    if (slot.mount) {
      // Une survivante de clonage pas encore confirmée : ses jauges restent à refaire.
      if (!slot.mount.ready) {
        clones += 1
        cloneFeed += Math.max(0, settings.feedPoints - xpAtLevel(xp, slot.mount.level))
      }
    } else if (slot.clone) {
      clones += 1
      cloneFeed += Math.max(0, settings.feedPoints - xpAtLevel(xp, slot.clone.keep.level))
    }
  }
  const newFeed = Math.max(0, settings.feedPoints - xpAtLevel(xp, 1))

  const lines: CostLine[] = [
    {
      label: 'Montures encore à obtenir',
      points: toObtain * (newFeed + fertility) * share,
      amount: priceOf(toObtain * newFeed, toObtain * fertility),
      detail: `${toObtain} monture${toObtain > 1 ? 's' : ''} à faire naître ou à capturer, du niveau 1 aux jauges pleines, par enclos de ${ENCLOSURE_CAPACITY}`,
    },
  ]
  if (clones > 0) {
    lines.push({
      label: 'Jauges à refaire après clonage',
      points: (cloneFeed + clones * fertility) * share,
      amount: priceOf(cloneFeed, clones * fertility),
      detail: `${clones} survivante${clones > 1 ? 's' : ''} de clonage, jauges à zéro, jusqu’à confirmation — par enclos de ${ENCLOSURE_CAPACITY}`,
    })
  }
  let meanOptimakina = 0
  if (settings.optimakina) {
    const makinas = readMakinas(catalog)
    let amount: number | null = 0
    for (const cross of evaluation.crosses) {
      const tries = evaluation.needs.get(cross.path)?.attempts ?? 1
      const meanTries = evaluation.meanNeeds.get(cross.path)?.attempts ?? 1
      const found = cheapestOptimakina(makinas, cross.child.variety.species, cross.child.variety.generation, (id) => prices.get(id) ?? null)
      if (found.item) {
        if (amount !== null) amount += found.price * tries
        meanOptimakina += found.price * meanTries
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
      points: evaluation.attempts,
      amount,
      detail: `Une par accouplement à prévoir, la moins chère qui agisse sur la génération visée`,
    })
  }

  const points = lines.filter((line) => line.label !== 'Optimakinas').reduce((sum, line) => sum + line.points, 0)
  const total = lines.every((line) => line.amount !== null)
    ? lines.reduce((sum, line) => sum + (line.amount ?? 0), 0)
    : null
  // En moyenne : les mêmes lignes avec `1 / chance` non arrondi — seules les
  // montures à obtenir et les Optimakinas en dépendent.
  const meanObtain = priceOf(meanToObtain * newFeed, meanToObtain * fertility)
  const meanTotal =
    !settings.probable || total === null || meanObtain === null
      ? null
      : total - (lines[0]?.amount ?? 0) + meanObtain - (lines.find((line) => line.label === 'Optimakinas')?.amount ?? 0) + meanOptimakina

  return {
    lines,
    points,
    total,
    meanTotal,
    complete: total !== null && missing.size === 0,
    missing: [...missing],
    unpriced: [...unpriced.values()],
  }
}
