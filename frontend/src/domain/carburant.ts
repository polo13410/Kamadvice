/**
 * Tableau de bord des carburants d'enclos : acheter ou crafter, et à quel prix
 * remplir une jauge.
 *
 * Volontairement pur — ni React, ni formatage, ni classes CSS — et construit
 * par-dessus `createEvaluator` plutôt qu'en le redoublant : le coût de craft,
 * la marge et les ingrédients en stock sont déjà son travail.
 */
import {
  EXTRAITS,
  GAUGES,
  POINTS_BY_SIZE,
  type ExtraitInfo,
  type GaugeInfo,
  type GaugeTarget,
} from '../data/carburants'
import { createEvaluator } from './craft'
import type { Catalog, IgnoredSet, Item, ItemId, PriceMap } from './types'

/** Le moins cher des deux, une fois les deux chiffrés. */
export type Decision = 'craft' | 'achat'

/** Ce que coûte l'atteinte d'un palier avec ce calibre d'extrait. */
export interface MaxingEstimate {
  label: string | null
  target: number
  /** Extraits à consommer : arrondi au supérieur, on n'en coupe pas un en deux. */
  count: number
  /**
   * Coût du remplissage, sur le nombre *fractionnaire* d'extraits.
   *
   * Le surplus du dernier extrait n'est pas perdu — il resservira au prochain
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
  info: ExtraitInfo
  item: Item
  /** Points de jauge rendus par une unité. */
  points: number
  /** Prix d'achat HDV, `null` si non saisi. */
  buy: number | null
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
  kamasPerPoint: number | null
  maxing: MaxingEstimate[]
}

export interface CarburantGroup {
  gauge: GaugeInfo
  rows: CarburantRow[]
  /** Ligne au meilleur ka/point de la jauge. `null` si aucune n'est chiffrée. */
  bestId: ItemId | null
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
  info: ExtraitInfo,
  item: Item,
  gauge: GaugeInfo,
  catalog: Catalog,
  ignored: IgnoredSet,
  evaluate: ReturnType<typeof createEvaluator>,
): CarburantRow {
  const report = evaluate.report(info.id)
  const points = POINTS_BY_SIZE[info.size]

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

  return {
    info,
    item,
    points,
    buy,
    ingredients,
    craft,
    missing: report.craft?.missing ?? [],
    inStock: report.craft?.ignored ?? [],
    unitCost,
    decision,
    // `report.margin` est déjà `buy - craft`, gardé sur un chiffrage complet.
    craftMargin: report.margin,
    kamasPerPoint: unitCost === null ? null : unitCost / points,
    maxing: gauge.targets.map((target) => estimate(target, points, unitCost)),
  }
}

/**
 * Une ligne par extrait, groupée par jauge dans l'ordre de `GAUGES` et par
 * calibre croissant.
 *
 * Les extraits introuvables au catalogue sont ignorés : la page les signale à
 * part, via `missingExtraits`.
 */
export function buildCarburantGroups(
  catalog: Catalog,
  prices: PriceMap,
  ignored?: IgnoredSet,
): CarburantGroup[] {
  const inStock = ignored ?? new Set<ItemId>()
  const evaluate = createEvaluator(catalog, prices, inStock)

  return GAUGES.map((gauge) => {
    const rows = EXTRAITS.filter((info) => info.gauge === gauge.key).flatMap((info) => {
      const item = catalog.byId.get(info.id)
      return item ? [buildRow(info, item, gauge, catalog, inStock, evaluate)] : []
    })

    // Égalité de ratio : on garde le premier, donc le plus petit calibre, qui
    // laisse le moins de surplus perdu.
    let bestId: ItemId | null = null
    let bestRatio = Infinity
    for (const row of rows) {
      if (row.kamasPerPoint === null || row.kamasPerPoint >= bestRatio) continue
      bestRatio = row.kamasPerPoint
      bestId = row.item.id
    }

    return { gauge, rows, bestId }
  })
}

/**
 * Ids déclarés dans `EXTRAITS` mais absents du catalogue.
 *
 * Garde-fou de la table écrite en dur : sans lui, une mise à jour du dump
 * amputerait le tableau en silence.
 */
export function missingExtraits(catalog: Catalog): ItemId[] {
  return EXTRAITS.filter((info) => !catalog.byId.has(info.id)).map((info) => info.id)
}
