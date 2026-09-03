/**
 * Moteur de coût de craft.
 *
 * Répond à « combien me coûte cet item, et vaut-il mieux l'acheter ou le
 * fabriquer ? ». Volontairement pur — aucune dépendance à React ni au réseau —
 * pour rester testable et servir de socle aux vues.
 */
import type { Catalog, IgnoredSet, ItemId, PriceMap } from './types'

const NONE_IGNORED: IgnoredSet = new Set()

export interface CraftCost {
  /**
   * Coût de fabrication d'une unité. Quand des prix manquent, c'est un total
   * partiel — un plancher, meilleur qu'aucun chiffre. `null` seulement si aucun
   * ingrédient n'a de prix : il n'y aurait alors rien à additionner.
   */
  cost: number | null
  /** Ingrédients sans prix saisi. Vide si le chiffrage est complet. */
  missing: ItemId[]
  /** Ingrédients déjà en stock : comptés pour 0, ils ne manquent pas. */
  ignored: ItemId[]
  /** `true` si tous les ingrédients ont un prix : seul cas où `cost` est le coût réel. */
  complete: boolean
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
export function createEvaluator(
  catalog: Catalog,
  prices: PriceMap,
  ignored: IgnoredSet = NONE_IGNORED,
) {
  const buy = (itemId: ItemId): number | null => prices.get(itemId) ?? null

  function craftCost(itemId: ItemId): CraftCost | null {
    const recipe = catalog.recipeFor.get(itemId)
    if (!recipe) return null

    let subtotal = 0
    let accounted = 0
    const missing: ItemId[] = []
    const inStock: ItemId[] = []
    for (const entry of recipe.entries) {
      if (ignored.has(entry.itemId)) {
        inStock.push(entry.itemId)
        accounted += 1
        continue
      }

      const unitPrice = buy(entry.itemId)
      if (unitPrice === null) {
        missing.push(entry.itemId)
      } else {
        subtotal += unitPrice * entry.quantity
        accounted += 1
      }
    }

    return {
      cost: accounted === 0 ? null : subtotal,
      missing,
      ignored: inStock,
      complete: missing.length === 0,
    }
  }

  function report(itemId: ItemId): CraftReport {
    const buyPrice = buy(itemId)
    const craft = craftCost(itemId)
    // Un coût partiel donnerait une marge trop belle : on n'annonce un gain que
    // sur un chiffrage complet.
    const margin =
      buyPrice !== null && craft?.complete && craft.cost !== null ? buyPrice - craft.cost : null

    return {
      buy: buyPrice,
      craft,
      margin,
      marginRatio: margin !== null && craft?.cost ? margin / craft.cost : null,
    }
  }

  return { buy, report }
}
