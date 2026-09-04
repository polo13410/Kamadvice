/**
 * Tableau de bord d'un métier : ce qu'il fabrique, à quel prix, et si ça vaut
 * mieux que l'HDV.
 *
 * Volontairement pur — ni React, ni formatage, ni classes CSS — et construit
 * par-dessus `createEvaluator` plutôt qu'en le redoublant. C'est le cousin
 * générique de `carburant.ts`, sans la couche de jeu propre aux jauges : une
 * ligne par recette du métier, et rien de plus à savoir sur l'item.
 */
import { createEvaluator } from './craft'
import type { Catalog, IgnoredSet, Item, ItemId, PriceMap, Recipe } from './types'

/** Le moins cher des deux, une fois les deux chiffrés. */
export type Decision = 'craft' | 'achat'

export interface JobIngredient {
  itemId: ItemId
  /** `null` si l'ingrédient est absent du catalogue. */
  item: Item | null
  quantity: number
  /** Déjà en stock : compté pour 0 dans le coût de craft. */
  inStock: boolean
}

export interface JobRow {
  item: Item
  recipe: Recipe
  ingredients: JobIngredient[]
  /** Prix d'achat HDV, `null` si non saisi. */
  buy: number | null
  /** Coût de fabrication, seulement si tous les ingrédients ont un prix. */
  craft: number | null
  /** Ingrédients sans prix : tant qu'il en reste, le craft n'est pas chiffrable. */
  missing: ItemId[]
  /** Ingrédients comptés pour 0 parce qu'ils sont en stock. */
  inStock: ItemId[]
  /** Ce qu'on paiera vraiment, achat ou craft. */
  unitCost: number | null
  decision: Decision | null
  /** Gain à fabriquer plutôt qu'acheter : `buy - craft`. */
  margin: number | null
  /** Marge rapportée au coût de craft, en fraction (0.25 = +25 %). */
  marginRatio: number | null
}

/**
 * Une ligne par recette du métier dont le résultat est au catalogue, dans
 * l'ordre du dump. C'est la vue qui trie.
 */
export function buildJobRows(
  catalog: Catalog,
  jobId: number,
  prices: PriceMap,
  ignored?: IgnoredSet,
): JobRow[] {
  const inStock = ignored ?? new Set<ItemId>()
  const evaluate = createEvaluator(catalog, prices, inStock)

  return (catalog.recipesByJob.get(jobId) ?? []).flatMap((recipe) => {
    const item = catalog.byId.get(recipe.resultId)
    if (!item) return []

    const report = evaluate.report(item.id)
    // Un chiffrage partiel n'est jamais retenu : il sous-estimerait le craft
    // et ferait basculer la décision à tort.
    const craft = report.craft?.complete ? report.craft.cost : null
    const buy = report.buy
    const unitCost = craft === null ? buy : buy === null ? craft : Math.min(buy, craft)
    // À prix égal, l'achat gagne : il économise le trajet chez l'artisan.
    const decision: Decision | null =
      unitCost === null ? null : craft !== null && (buy === null || craft < buy) ? 'craft' : 'achat'

    return [
      {
        item,
        recipe,
        ingredients: recipe.entries.map((entry) => ({
          itemId: entry.itemId,
          item: catalog.byId.get(entry.itemId) ?? null,
          quantity: entry.quantity,
          inStock: inStock.has(entry.itemId),
        })),
        buy,
        craft,
        missing: report.craft?.missing ?? [],
        inStock: report.craft?.ignored ?? [],
        unitCost,
        decision,
        margin: report.margin,
        marginRatio: report.marginRatio,
      },
    ]
  })
}
