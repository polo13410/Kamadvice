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
  /** Métier qui la fabrique. `1` est « Base », à la portée de tous. */
  jobId: number
  entries: RecipeEntry[]
}

/** Un métier qui fabrique quelque chose. Les métiers de modification n'y sont pas. */
export interface Job {
  id: number
  name: string
  /** `forgeron`, `eleveur`… : l'identifiant lisible des routes `/job/:slug`. */
  slug: string
  /** Identifiant d'icône de jeu, servi par les CDN. `null` pour un métier sans icône. */
  iconId: number | null
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
  /** Métiers producteurs, triés par nom. */
  jobs: Job[]
  /** Recettes de chaque métier, dans l'ordre du dump. */
  recipesByJob: ReadonlyMap<number, Recipe[]>
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
  /** Même chose pour les icônes de métier : voir JobIcon. */
  jobIconBaseUrls: string[]
}

/** Prix HDV connus, en kamas. Un item absent de la map n'a pas de prix saisi. */
export type PriceMap = ReadonlyMap<ItemId, number>

/** Items déjà en stock, dont le coût ne compte pas dans les crafts. */
export type IgnoredSet = ReadonlySet<ItemId>
