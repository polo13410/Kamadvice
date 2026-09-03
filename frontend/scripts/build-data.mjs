/**
 * Génère les artefacts statiques consommés par le front à partir des dumps bruts
 * de `dofus_data/`, à la racine du dépôt.
 *
 * Le dump brut fait ~41 Mo parce qu'il embarque descriptions et effets en 5
 * langues. On ne garde que le français et les champs réellement affichés, ce qui
 * ramène le catalogue complet à ~1,7 Mo (~360 Ko une fois gzippé par le CDN) :
 * assez petit pour être chargé intégralement dans le navigateur, ce qui évite
 * tout backend pour la partie catalogue.
 *
 *   node scripts/build-data.mjs
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')
// Les dumps bruts vivent à la racine du dépôt : ce sont des données de jeu, pas
// un asset du front.
const SRC = join(FRONTEND, '..', 'dofus_data')
const OUT = join(FRONTEND, 'public', 'data')

/** Libellés FR des `categoryId` présents dans le dump. */
const CATEGORIES = {
  0: 'Équipement',
  1: 'Consommables',
  2: 'Ressources',
  3: 'Quête',
  4: 'Divers',
  5: 'Apparat',
}

/**
 * Sources d'icônes, essayées dans l'ordre par le front (voir ItemIcon).
 *
 * Le dump pointe vers le CDN d'Ankama, qui reste la source officielle mais ne
 * sert pas ~17 % des iconId référencés : il répond alors 403 AccessDenied (une
 * erreur XML de S3, pas une image), y compris sur des items actuels. DofusDB
 * expose les mêmes icônes par iconId et comble ces trous.
 *
 * Ankama filtre par ailleurs l'en-tête Referer ; c'est ItemIcon qui s'en occupe.
 */
const ICON_BASE_URLS = [
  'https://static.ankama.com/dofus/www/game/items/200/',
  'https://api.dofusdb.fr/img/items/',
]

const fr = (o) => (o && typeof o === 'object' ? (o.fr ?? null) : null)

async function main() {
  const [rawItems, rawRecipes] = await Promise.all([
    readFile(join(SRC, 'items.json'), 'utf8').then(JSON.parse),
    readFile(join(SRC, 'recipes.json'), 'utf8').then(JSON.parse),
  ])

  // --- Dictionnaire de types ------------------------------------------------
  // 222 types pour 17k items : les sortir dans une table à part évite de
  // répéter le libellé et la catégorie sur chaque ligne.
  const types = {}
  for (const item of rawItems) {
    const t = item.type
    if (!t || t.id == null || types[t.id]) continue
    types[t.id] = { n: fr(t.name), c: t.categoryId ?? null }
  }

  // --- Catalogue ------------------------------------------------------------
  const items = rawItems.map((item) => ({
    id: item.ankama_id,
    n: fr(item.name),
    t: item.type?.id ?? null,
    l: item.level ?? 0,
    i: item.iconId ?? null,
    p: item.pods ?? 0,
  }))

  const knownIds = new Set(items.map((i) => i.id))

  // --- Recettes -------------------------------------------------------------
  // Quelques recettes pointent vers un `result_id` absent du catalogue (items
  // retirés du jeu) : on les écarte, elles ne seraient affichables nulle part.
  const dropped = []
  const recipes = []
  for (const recipe of rawRecipes) {
    if (!knownIds.has(recipe.result_id)) {
      dropped.push(recipe.result_id)
      continue
    }
    recipes.push({
      r: recipe.result_id,
      e: recipe.entries.map((entry) => ({ i: entry.item_id, q: entry.quantity })),
    })
  }

  const meta = {
    iconBaseUrls: ICON_BASE_URLS,
    categories: CATEGORIES,
  }

  await mkdir(OUT, { recursive: true })
  const written = []
  for (const [name, payload] of [
    ['meta', meta],
    ['types', types],
    ['items', items],
    ['recipes', recipes],
  ]) {
    const json = JSON.stringify(payload)
    await writeFile(join(OUT, `${name}.json`), json)
    written.push([name, json.length])
  }

  for (const [name, bytes] of written) {
    console.log(`  public/data/${name}.json`.padEnd(30), `${(bytes / 1024).toFixed(0)} Ko`)
  }
  console.log(`
${items.length} items, ${recipes.length} recettes.`)
  if (dropped.length) {
    console.log(`${dropped.length} recettes ignorées (résultat hors catalogue) : ${dropped.join(', ')}`)
  }
}

main()
