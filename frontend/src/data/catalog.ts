/**
 * Chargement du catalogue statique.
 *
 * Les 6 fichiers de `public/data/` sont générés par `scripts/build-data.mjs` et
 * servis par le CDN (~1,7 Mo, ~360 Ko gzippés). On les charge une seule fois au
 * démarrage et on construit les index en mémoire : c'est ce qui permet de trier,
 * filtrer et chiffrer 17 000 items sans le moindre appel réseau ensuite.
 */
import type {
  Carburant,
  Catalog,
  Item,
  ItemId,
  ItemType,
  Job,
  MountCatalog,
  MountChild,
  MountVariety,
  Recipe,
  Species,
  VarietyId,
} from '../domain/types'
import { normalize } from '../lib/format'

interface RawMeta {
  iconBaseUrls: string[]
  jobIconBaseUrls: string[]
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
  j: number
  e: { i: number; q: number }[]
}
interface RawJob {
  id: number
  n: string
  i: number | null
}
interface RawCarburant {
  i: number
  g: number
  p: number
  c: number | null
}
interface RawMount {
  i: number
  s: Species
  n: string
  g: number
  r: [number, number][]
  c: number | null
  m: number | null
}

const SPECIES_RANK: Record<Species, number> = { dragodinde: 0, muldo: 1, volkorne: 2 }

/**
 * Les variétés de montures et leurs deux index : par item (monture ou
 * certificat) pour la fiche, et par parent pour « permet d'obtenir ». Quelques
 * centaines de lignes : rien à faire côté build.
 */
function buildMounts(raw: RawMount[]): MountCatalog {
  const varieties: MountVariety[] = raw.map((row) => ({
    id: row.i,
    species: row.s,
    name: row.n,
    generation: row.g,
    recipes: row.r.map(([a, b]) => [a, b] as const),
    certificateId: row.c,
  }))
  varieties.sort(
    (a, b) =>
      SPECIES_RANK[a.species] - SPECIES_RANK[b.species] ||
      a.generation - b.generation ||
      a.name.localeCompare(b.name, 'fr'),
  )

  const byId = new Map<VarietyId, MountVariety>()
  const byItemId = new Map<ItemId, MountVariety>()
  const childrenOf = new Map<VarietyId, MountChild[]>()
  for (const variety of varieties) {
    byId.set(variety.id, variety)
    byItemId.set(variety.id, variety)
    if (variety.certificateId !== null) byItemId.set(variety.certificateId, variety)
    for (const [a, b] of variety.recipes) {
      for (const [parent, partner] of [
        [a, b],
        [b, a],
      ]) {
        if (parent === undefined || partner === undefined) continue
        const children = childrenOf.get(parent)
        const entry = { child: variety.id, partner }
        if (children) children.push(entry)
        else childrenOf.set(parent, [entry])
      }
    }
  }
  return { varieties, byId, byItemId, childrenOf }
}

async function fetchJson<T>(name: string, signal?: AbortSignal): Promise<T> {
  // `?v=` change avec le contenu des données (voir `vite.config.ts`) : le
  // navigateur ne peut pas resservir un fichier d'un déploiement précédent à
  // un bundle qui en attend un autre.
  const response = await fetch(
    `${import.meta.env.BASE_URL}data/${name}.json?v=${__DATA_VERSION__}`,
    { signal },
  )
  if (!response.ok) {
    throw new Error(`Chargement de ${name}.json impossible (HTTP ${response.status})`)
  }
  return response.json() as Promise<T>
}

export async function loadCatalog(signal?: AbortSignal): Promise<Catalog> {
  const [meta, rawTypes, rawItems, rawRecipes, rawJobs, rawCarburants, rawMounts] =
    await Promise.all([
      fetchJson<RawMeta>('meta', signal),
      fetchJson<RawTypes>('types', signal),
      fetchJson<RawItem[]>('items', signal),
      fetchJson<RawRecipe[]>('recipes', signal),
      fetchJson<RawJob[]>('jobs', signal),
      // 5 Ko : les charger avec le reste évite un second état de chargement dans
      // le tableau de bord, pour un poids qui ne se voit pas.
      fetchJson<RawCarburant[]>('carburants', signal),
      // 30 Ko, même raison : la fiche d'une monture et le planificateur
      // s'ouvrent sans attendre.
      fetchJson<RawMount[]>('mounts', signal),
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
  const recipesByJob = new Map<number, Recipe[]>()
  for (const raw of rawRecipes) {
    const entries = raw.e.map((entry) => ({ itemId: entry.i, quantity: entry.q }))
    const recipe: Recipe = { resultId: raw.r, jobId: raw.j, entries }
    recipeFor.set(raw.r, recipe)
    for (const entry of entries) {
      const consumers = usedIn.get(entry.itemId)
      if (consumers) consumers.push(raw.r)
      else usedIn.set(entry.itemId, [raw.r])
    }
    const ofJob = recipesByJob.get(raw.j)
    if (ofJob) ofJob.push(recipe)
    else recipesByJob.set(raw.j, [recipe])
  }

  // Le slug vient du nom, sans accent ni espace : « Éleveur » -> `eleveur`.
  // Il ne sert qu'aux routes ; l'id de jeu reste la clé partout ailleurs.
  const jobs: Job[] = rawJobs.map((raw) => ({
    id: raw.id,
    name: raw.n,
    slug: normalize(raw.n).replace(/[^a-z0-9]+/g, '-'),
    iconId: raw.i,
  }))

  const categories: Record<number, string> = {}
  for (const [id, label] of Object.entries(meta.categories)) categories[Number(id)] = label

  const carburants: Carburant[] = rawCarburants.map((raw) => ({
    id: raw.i,
    gaugeElementId: raw.g,
    points: raw.p,
    cap: raw.c,
  }))

  return {
    items,
    byId,
    recipeFor,
    usedIn,
    jobs,
    recipesByJob,
    types: [...typeById.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    categories,
    carburants,
    mounts: buildMounts(rawMounts),
    iconBaseUrls: meta.iconBaseUrls,
    jobIconBaseUrls: meta.jobIconBaseUrls,
  }
}

