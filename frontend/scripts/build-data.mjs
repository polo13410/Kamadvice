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
 * Deux formats cohabitent dans `dofus_data/`, tous deux tirés des releases
 * dofusdude/dofus3-main :
 * - `items.json` est le `MAPPED_ITEMS.json`, déjà résolu (noms en clair) ;
 * - `recipes.json` et `jobs.json` sont les assets *bruts* (dumps Unity), seuls
 *   à porter le `jobId` d'une recette — la version mappée l'a perdu.
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

/**
 * Icônes de métier, par `iconId`, même mécanique (voir JobIcon).
 *
 * Ankama n'en sert aucune — 403 sur toutes les formes d'URL essayées —, seul
 * DofusDB les expose. La liste reste une liste pour le jour où une seconde
 * source apparaît ; en attendant, le repli est un pictogramme.
 */
const JOB_ICON_BASE_URLS = ['https://api.dofusdb.fr/img/jobs/']

const fr = (o) => (o && typeof o === 'object' ? (o.fr ?? null) : null)

/**
 * Un dump Unity range ses lignes dans `references.RefIds[].data`, et enveloppe
 * chaque tableau dans `{ Array: [...] }`. `objectsById` n'est qu'un index, on
 * l'ignore.
 */
const unityRows = (dump) => dump.references.RefIds.map((ref) => ref.data)
const unityArray = (field) => field?.Array ?? []

/**
 * Libellés FR des métiers, par `id` de jeu.
 *
 * `jobs.json` ne porte qu'un `nameId` vers la table i18n (`fr.json`, 30 Mo pour
 * 23 chaînes) : les écrire ici coûte moins que d'embarquer la table. Un id
 * absent est signalé au build, pas inventé.
 */
const JOB_NAMES = {
  1: 'Base',
  2: 'Bûcheron',
  11: 'Forgeron',
  13: 'Sculpteur',
  15: 'Cordonnier',
  16: 'Bijoutier',
  24: 'Mineur',
  26: 'Alchimiste',
  27: 'Tailleur',
  28: 'Paysan',
  36: 'Pêcheur',
  41: 'Chasseur',
  44: 'Forgemage',
  48: 'Sculptemage',
  60: 'Façonneur',
  62: 'Cordomage',
  63: 'Joaillomage',
  64: 'Costumage',
  65: 'Bricoleur',
  74: 'Façomage',
  75: 'Parchomage',
  78: 'Bestiologue',
  79: 'Éleveur',
}

/**
 * Métiers qu'on ne propose pas : « Base » (1) est le métier de personne — ses
 * recettes sont à tout le monde, il n'y a ni niveau à monter ni atelier.
 */
const HIDDEN_JOBS = new Set([1])

/**
 * Type des carburants d'enclos, le métier d'Éleveur en entier côté craft avec
 * les Makina et les filets de capture.
 */
const CARBURANT_TYPE_ID = 326

/**
 * Ce que le catalogue générique ne peut pas porter : les carburants d'enclos.
 *
 * Le catalogue ne garde ni les effets ni les descriptions — c'est ce qui le
 * ramène de 41 Mo à 1,2 Mo. Or tout ce qui fait un carburant vit précisément
 * là : les points de jauge rendus, la jauge visée et le plafond au-delà duquel
 * il ne remplit plus. On extrait donc cette tranche à part, dans un fichier que
 * seul le tableau de bord charge.
 *
 * Trois champs suffisent, le reste s'en déduit côté front :
 * - `g` : `element_id` de l'effet, l'identifiant de jeu de la jauge (263
 *   Caresseur, 265 Baffeur, 267 Foudroyeur, 268 Dragofesse, 269 Mangeoire,
 *   270 Abreuvoir) ;
 * - `p` : points rendus, qui déterminent à eux seuls le calibre (1000
 *   minuscule → 5000 gigantesque) ;
 * - `c` : plafond de jauge, `null` quand il n'y en a pas. Il détermine à lui
 *   seul la famille : 40 000 extrait, 70 000 philtre, 90 000 potion, aucun
 *   plafond élixir.
 *
 * Les points ne survivent que dans le libellé rendu (`templated`) : le dump
 * mappe le jet de dés sur `min`/`max` et laisse tomber la valeur. `max` porte
 * en revanche le plafond, au centuple (400 → 40 000).
 */
function buildCarburants(rawItems) {
  const rows = []
  const skipped = []

  for (const item of rawItems) {
    if (item.type?.id !== CARBURANT_TYPE_ID) continue

    const effect = item.effects?.[0]
    const points = Number(/\+(\d+)/.exec(fr(effect?.templated) ?? '')?.[1])
    const gauge = effect?.element_id

    // Un carburant illisible est écarté plutôt que deviné : mieux vaut une
    // ligne manquante, que le front signale, qu'une ligne au mauvais chiffre.
    if (!Number.isInteger(gauge) || !Number.isFinite(points) || points <= 0) {
      skipped.push(`${item.ankama_id} ${fr(item.name)}`)
      continue
    }

    rows.push({
      i: item.ankama_id,
      g: gauge,
      p: points,
      c: effect.max > 0 ? effect.max * 100 : null,
    })
  }

  rows.sort((a, b) => a.i - b.i)
  return { rows, skipped }
}

async function main() {
  const [rawItems, rawRecipes, rawJobs] = await Promise.all([
    readFile(join(SRC, 'items.json'), 'utf8').then(JSON.parse),
    readFile(join(SRC, 'recipes.json'), 'utf8').then(JSON.parse).then(unityRows),
    readFile(join(SRC, 'jobs.json'), 'utf8').then(JSON.parse).then(unityRows),
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
  const recipesByJob = new Map()
  for (const recipe of rawRecipes) {
    if (!knownIds.has(recipe.resultId)) {
      dropped.push(recipe.resultId)
      continue
    }
    const ids = unityArray(recipe.ingredientIds)
    const quantities = unityArray(recipe.quantities)
    recipes.push({
      r: recipe.resultId,
      j: recipe.jobId,
      e: ids.map((id, index) => ({ i: id, q: quantities[index] ?? 1 })),
    })
    recipesByJob.set(recipe.jobId, (recipesByJob.get(recipe.jobId) ?? 0) + 1)
  }

  // --- Métiers --------------------------------------------------------------
  // Seuls les métiers qui produisent quelque chose : les *mages (Forgemage,
  // Costumage…) modifient sans fabriquer et n'ont aucune recette.
  // `i` est l'`iconId` de jeu, que les CDN servent tel quel ; `null` quand le
  // métier n'en a pas (-1 au dump), le front dessine alors un pictogramme.
  const unnamed = []
  const jobs = []
  for (const job of rawJobs) {
    if (!recipesByJob.has(job.id) || HIDDEN_JOBS.has(job.id)) continue
    const name = JOB_NAMES[job.id]
    if (!name) {
      unnamed.push(job.id)
      continue
    }
    jobs.push({ id: job.id, n: name, i: job.iconId >= 0 ? job.iconId : null })
  }
  jobs.sort((a, b) => a.n.localeCompare(b.n, 'fr'))

  // --- Carburants d'enclos ---------------------------------------------------
  const carburants = buildCarburants(rawItems)

  const meta = {
    iconBaseUrls: ICON_BASE_URLS,
    jobIconBaseUrls: JOB_ICON_BASE_URLS,
    categories: CATEGORIES,
  }

  await mkdir(OUT, { recursive: true })
  const written = []
  for (const [name, payload] of [
    ['meta', meta],
    ['types', types],
    ['items', items],
    ['recipes', recipes],
    ['jobs', jobs],
    ['carburants', carburants.rows],
  ]) {
    const json = JSON.stringify(payload)
    await writeFile(join(OUT, `${name}.json`), json)
    written.push([name, json.length])
  }

  for (const [name, bytes] of written) {
    console.log(`  public/data/${name}.json`.padEnd(30), `${(bytes / 1024).toFixed(0)} Ko`)
  }
  console.log(`
${items.length} items, ${recipes.length} recettes, ${jobs.length} métiers, ${carburants.rows.length} carburants.`)
  if (dropped.length) {
    console.log(`${dropped.length} recettes ignorées (résultat hors catalogue) : ${dropped.join(', ')}`)
  }
  if (unnamed.length) {
    console.log(`${unnamed.length} métier(s) sans libellé dans JOB_NAMES, ignoré(s) : ${unnamed.join(', ')}`)
  }
  if (carburants.skipped.length) {
    console.log(`${carburants.skipped.length} carburant(s) sans effet lisible : ${carburants.skipped.join(', ')}`)
  }
}

main()
