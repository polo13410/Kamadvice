/**
 * Tableau de bord des carburants d'enclos : acheter ou crafter, et à quel prix
 * remplir une jauge.
 *
 * Volontairement pur — ni React, ni formatage, ni classes CSS — et construit
 * par-dessus `createEvaluator` plutôt qu'en le redoublant : le coût de craft,
 * la marge et les ingrédients en stock sont déjà son travail.
 *
 * Les lignes sortent à plat, sans regroupement : avec 120 carburants et des
 * filtres cumulables, c'est la vue qui décide de l'ordre, et le meilleur
 * rendement se calcule sur ce qui reste affiché plutôt que sur le tout.
 */
import {
  CARBURANT_TYPE_ID,
  GAUGE_INFO,
  readCarburant,
  type CarburantFamily,
  type CarburantInfo,
  type CarburantSize,
  type Gauge,
  type GaugeTarget,
} from '../data/carburants'
import { createEvaluator } from './craft'
import type { Catalog, IgnoredSet, Item, ItemId, PriceMap } from './types'

/** Le moins cher des deux, une fois les deux chiffrés. */
export type Decision = 'craft' | 'achat'

/** Ce que coûte l'atteinte d'un palier avec ce calibre de carburant. */
export interface MaxingEstimate {
  label: string | null
  target: number
  /** Carburants à consommer : arrondi au supérieur, on n'en coupe pas un en deux. */
  count: number
  /**
   * Coût du remplissage, sur le nombre *fractionnaire* de carburants.
   *
   * Le surplus du dernier n'est pas perdu — il resservira au prochain
   * remplissage. Arrondir ici gonflerait les petits calibres, qui gaspillent
   * pourtant le moins, et rendrait les lignes incomparables entre elles.
   */
  cost: number | null
}

export interface CarburantIngredient {
  itemId: ItemId
  /** `null` si l'ingrédient est absent du catalogue. */
  item: Item | null
  quantity: number
  /** Déjà en stock : compté pour 0 dans le coût de craft. */
  inStock: boolean
}

export interface CarburantRow {
  info: CarburantInfo
  item: Item
  gauge: Gauge
  family: CarburantFamily
  size: CarburantSize
  /** Niveau d'Éleveur requis pour le fabriquer. */
  level: number
  /** Points de jauge rendus par une unité. */
  points: number
  /** Valeur de jauge au-delà de laquelle il ne remplit plus. `null` sans plafond. */
  cap: number | null
  /** Prix d'achat HDV, `null` si non saisi. */
  buy: number | null
  /** De 2 ingrédients pour un extrait à 5 pour un élixir. */
  ingredients: CarburantIngredient[]
  /** Coût de fabrication, seulement si tous les ingrédients ont un prix. */
  craft: number | null
  /** Ingrédients sans prix : tant qu'il en reste, le craft n'est pas chiffrable. */
  missing: ItemId[]
  /** Ingrédients comptés pour 0 parce qu'ils sont en stock. */
  inStock: ItemId[]
  /** Ce qu'on paiera vraiment. Base de tous les ratios en aval. */
  unitCost: number | null
  decision: Decision | null
  /** Gain à fabriquer plutôt qu'acheter : `buy - craft`. */
  craftMargin: number | null
  /** Points de jauge obtenus par kama dépensé : plus c'est haut, mieux c'est. */
  pointsPerKama: number | null
  maxing: MaxingEstimate[]
}

/** Chiffre un palier pour un calibre donné. */
function estimate(target: GaugeTarget, points: number, unitCost: number | null): MaxingEstimate {
  const units = target.points / points
  return {
    label: target.label,
    target: target.points,
    count: Math.ceil(units),
    cost: unitCost === null ? null : units * unitCost,
  }
}

function buildRow(
  info: CarburantInfo,
  item: Item,
  catalog: Catalog,
  ignored: IgnoredSet,
  evaluate: ReturnType<typeof createEvaluator>,
): CarburantRow {
  const report = evaluate.report(info.id)

  // Un chiffrage partiel n'est jamais retenu : il sous-estimerait le craft et
  // ferait basculer la décision à tort. Même parti-pris que `craft.ts`, qui
  // n'annonce pas de marge sur un coût incomplet.
  const craft = report.craft?.complete ? report.craft.cost : null
  const buy = report.buy
  const unitCost = craft === null ? buy : buy === null ? craft : Math.min(buy, craft)

  // À prix égal, l'achat gagne : il économise le trajet chez l'artisan.
  const decision: Decision | null =
    unitCost === null ? null : craft !== null && (buy === null || craft < buy) ? 'craft' : 'achat'

  const recipe = catalog.recipeFor.get(info.id)
  const ingredients = (recipe?.entries ?? []).map((entry) => ({
    itemId: entry.itemId,
    item: catalog.byId.get(entry.itemId) ?? null,
    quantity: entry.quantity,
    inStock: ignored.has(entry.itemId),
  }))

  const targets = GAUGE_INFO.get(info.gauge)?.targets ?? []

  return {
    info,
    item,
    gauge: info.gauge,
    family: info.family,
    size: info.size,
    level: item.level,
    points: info.points,
    cap: info.cap,
    buy,
    ingredients,
    craft,
    missing: report.craft?.missing ?? [],
    inStock: report.craft?.ignored ?? [],
    unitCost,
    decision,
    // `report.margin` est déjà `buy - craft`, gardé sur un chiffrage complet.
    craftMargin: report.margin,
    pointsPerKama: unitCost === null || unitCost === 0 ? null : info.points / unitCost,
    maxing: targets.map((target) => estimate(target, info.points, unitCost)),
  }
}

/**
 * Une ligne par carburant reconnu, dans l'ordre du dump.
 *
 * Les carburants que les tables de jeu ne reconnaissent pas sont écartés : la
 * page les signale à part, via `unknownCarburants`.
 */
export function buildCarburantRows(
  catalog: Catalog,
  prices: PriceMap,
  ignored?: IgnoredSet,
): CarburantRow[] {
  const inStock = ignored ?? new Set<ItemId>()
  const evaluate = createEvaluator(catalog, prices, inStock)

  return catalog.carburants.flatMap((raw) => {
    const info = readCarburant(raw)
    const item = info && catalog.byId.get(info.id)
    return info && item ? [buildRow(info, item, catalog, inStock, evaluate)] : []
  })
}

/**
 * Le meilleur rendement de chaque jauge, parmi les lignes reçues.
 *
 * Calculé sur les lignes déjà filtrées, et non sur le catalogue entier : sous
 * un filtre de niveau, « le meilleur » ne peut être un carburant qu'on ne sait
 * pas encore fabriquer.
 *
 * Égalité de ratio : on garde le premier rencontré, donc le plus petit
 * calibre, qui laisse le moins de surplus perdu.
 */
export function bestPerGauge(rows: CarburantRow[]): Set<ItemId> {
  const best = new Map<Gauge, { id: ItemId; ratio: number }>()
  for (const row of rows) {
    if (row.pointsPerKama === null) continue
    const current = best.get(row.gauge)
    if (current && current.ratio >= row.pointsPerKama) continue
    best.set(row.gauge, { id: row.item.id, ratio: row.pointsPerKama })
  }
  return new Set([...best.values()].map((entry) => entry.id))
}

/**
 * Carburants du catalogue que les tables de jeu ne savent pas lire.
 *
 * Garde-fou de la dérivation : sans lui, un calibre inédit ou un plafond
 * changé amputerait le tableau en silence. On repart du type d'item plutôt que
 * de la tranche dérivée, pour attraper aussi ce que le build aurait écarté.
 */
export function unknownCarburants(catalog: Catalog): Item[] {
  const known = new Set<ItemId>()
  for (const raw of catalog.carburants) {
    if (readCarburant(raw)) known.add(raw.id)
  }

  return catalog.items.filter(
    (item) => item.type?.id === CARBURANT_TYPE_ID && !known.has(item.id),
  )
}
