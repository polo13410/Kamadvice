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

export interface Catalog {
  items: Item[]
  byId: ReadonlyMap<ItemId, Item>
  /** Recette produisant cet item, s'il est craftable. */
  recipeFor: ReadonlyMap<ItemId, Recipe>
  /** Index inverse : ingrédient -> items dont il est un composant. */
  usedIn: ReadonlyMap<ItemId, ItemId[]>
  /** Types réellement présents, triés par libellé, pour alimenter les filtres. */
  types: ItemType[]
  categories: Record<number, string>
  iconBaseUrl: string
}

/** Prix HDV connus, en kamas. Un item absent de la map n'a pas de prix saisi. */
export type PriceMap = ReadonlyMap<ItemId, number>
