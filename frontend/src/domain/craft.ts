/**
 * Moteur de coût de craft.
 *
 * Répond à « combien me coûte cet item, et vaut-il mieux l'acheter ou le
 * fabriquer ? ». Volontairement pur — aucune dépendance à React ni au réseau —
 * pour rester testable et servir de socle aux vues.
 */
import type { Catalog, ItemId, PriceMap } from './types'

export interface CraftCost {
  /** Coût de fabrication d'une unité, `null` si un prix d'ingrédient manque. */
  cost: number | null
  /** Ingrédients sans prix saisi qui empêchent le chiffrage. Vide si `cost` est connu. */
  missing: ItemId[]
}

export interface CraftReport {
  /** Prix d'achat direct à l'HDV, `null` si non saisi. */
  buy: number | null
  /** `null` si l'item n'a pas de recette. */
  craft: CraftCost | null
  /** Gain à fabriquer puis revendre : `buy - craft.cost`. `null` si l'un manque. */
  margin: number | null
  /** Marge rapportée au coût de craft, en fraction (0.25 = +25 %). */
  marginRatio: number | null
}

/**
 * Crée un évaluateur lié à un couple (catalogue, prix). En recréer un dès que les
 * prix changent : chiffrer les 17 000 items prend une dizaine de millisecondes.
 */
export function createEvaluator(catalog: Catalog, prices: PriceMap) {
  const buy = (itemId: ItemId): number | null => prices.get(itemId) ?? null

  function craftCost(itemId: ItemId): CraftCost | null {
    const recipe = catalog.recipeFor.get(itemId)
    if (!recipe) return null

    let cost: number | null = 0
    const missing: ItemId[] = []
    // On parcourt toute la recette même une fois le coût perdu : la liste
    // complète des ingrédients à renseigner est plus utile que le premier trouvé.
    for (const entry of recipe.entries) {
      const unitPrice = buy(entry.itemId)
      if (unitPrice === null) {
        missing.push(entry.itemId)
        cost = null
      } else if (cost !== null) {
        cost += unitPrice * entry.quantity
      }
    }

    return { cost, missing }
  }

  function report(itemId: ItemId): CraftReport {
    const buyPrice = buy(itemId)
    const craft = craftCost(itemId)
    const margin = buyPrice !== null && craft?.cost != null ? buyPrice - craft.cost : null

    return {
      buy: buyPrice,
      craft,
      margin,
      marginRatio: margin !== null && craft?.cost ? margin / craft.cost : null,
    }
  }

  return { buy, report }
}
