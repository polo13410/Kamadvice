export type ItemId = number

export interface ItemType {
  id: number
  name: string
  categoryId: number
}

export interface Item {
  id: ItemId
  name: string
  type: ItemType | null
  level: number
  iconId: number | null
  pods: number
}

export interface RecipeEntry {
  itemId: ItemId
  quantity: number
}

export interface Recipe {
  resultId: ItemId
  entries: RecipeEntry[]
}

/**
 * Ce qu'un carburant d'enclos a de plus qu'un item, et que le catalogue
 * générique ne porte pas : sa jauge, ce qu'il y verse et jusqu'où.
 *
 * Produit par `scripts/build-data.mjs` à partir des effets du dump, que le
 * catalogue ne garde pas.
 */
export interface Carburant {
  id: ItemId
  /** `element_id` de l'effet : l'identifiant de jeu de la jauge. */
  gaugeElementId: number
  /** Points de jauge rendus par une unité. Détermine le calibre. */
  points: number
  /**
   * Valeur au-delà de laquelle ce carburant ne remplit plus la jauge.
   * `null` pour les élixirs, seuls à n'avoir aucun plafond.
   */
  cap: number | null
}

export interface Catalog {
  items: Item[]
  byId: ReadonlyMap<ItemId, Item>
  /** Recette produisant cet item, s'il est craftable. */
  recipeFor: ReadonlyMap<ItemId, Recipe>
  /** Index inverse : ingrédient -> items dont il est un composant. */
  usedIn: ReadonlyMap<ItemId, ItemId[]>
  /** Types réellement présents, triés par libellé, pour alimenter les filtres. */
  types: ItemType[]
  /**
   * Tranche dérivée du tableau de bord des carburants. Les prochains métiers
   * en ajouteront une chacun plutôt que d'alourdir `Item` de champs qu'une
   * seule page lit.
   */
  carburants: Carburant[]
  categories: Record<number, string>
  /** Sources d'icônes, à essayer dans l'ordre : voir ItemIcon. */
  iconBaseUrls: string[]
}

/** Prix HDV connus, en kamas. Un item absent de la map n'a pas de prix saisi. */
export type PriceMap = ReadonlyMap<ItemId, number>

/** Items déjà en stock, dont le coût ne compte pas dans les crafts. */
export type IgnoredSet = ReadonlySet<ItemId>
