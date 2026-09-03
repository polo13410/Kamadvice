/**
 * Chargement du catalogue statique.
 *
 * Les 4 fichiers de `public/data/` sont générés par `scripts/build-data.mjs` et
 * servis par le CDN (~1,7 Mo, ~360 Ko gzippés). On les charge une seule fois au
 * démarrage et on construit les index en mémoire : c'est ce qui permet de trier,
 * filtrer et chiffrer 17 000 items sans le moindre appel réseau ensuite.
 */
import type { Catalog, Item, ItemId, ItemType, Recipe } from '../domain/types'

interface RawMeta {
  iconBaseUrl: string
  categories: Record<string, string>
}

type RawTypes = Record<string, { n: string; c: number }>
interface RawItem {
  id: number
  n: string
  t: number | null
  l: number
  i: number | null
  p: number
}
interface RawRecipe {
  r: number
  e: { i: number; q: number }[]
}

async function fetchJson<T>(name: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`, { signal })
  if (!response.ok) {
    throw new Error(`Chargement de ${name}.json impossible (HTTP ${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const [meta, rawTypes, rawItems, rawRecipes] = await Promise.all([
    fetchJson<RawMeta>('meta', signal),
    fetchJson<RawTypes>('types', signal),
    fetchJson<RawItem[]>('items', signal),
    fetchJson<RawRecipe[]>('recipes', signal),
  ])

  const typeById = new Map<number, ItemType>()
  for (const [id, type] of Object.entries(rawTypes)) {
    typeById.set(Number(id), {
      id: Number(id),
      name: type.n,
      categoryId: type.c,
    })
  }

  const items: Item[] = rawItems.map((raw) => ({
    id: raw.id,
    name: raw.n,
    type: raw.t === null ? null : (typeById.get(raw.t) ?? null),
    level: raw.l,
    iconId: raw.i,
    pods: raw.p,
  }))
  items.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  const byId = new Map<ItemId, Item>(items.map((item) => [item.id, item]))

  // Index direct (que produit cette recette) et inverse (où sert cet ingrédient).
  // L'inverse est construit ici plutôt que côté build : il se calcule en quelques
  // millisecondes et éviter un 6ᵉ fichier à garder synchronisé.
  const recipeFor = new Map<ItemId, Recipe>()
  const usedIn = new Map<ItemId, ItemId[]>()
  for (const raw of rawRecipes) {
    const entries = raw.e.map((entry) => ({ itemId: entry.i, quantity: entry.q }))
    recipeFor.set(raw.r, { resultId: raw.r, entries })
    for (const entry of entries) {
      const consumers = usedIn.get(entry.itemId)
      if (consumers) consumers.push(raw.r)
      else usedIn.set(entry.itemId, [raw.r])
    }
  }

  const categories: Record<number, string> = {}
  for (const [id, label] of Object.entries(meta.categories)) categories[Number(id)] = label

  return {
    items,
    byId,
    recipeFor,
    usedIn,
    types: [...typeById.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    categories,
    iconBaseUrl: meta.iconBaseUrl,
  }
}

