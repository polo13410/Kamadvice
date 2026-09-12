/**
 * Récupère les données d'élevage des montures, dans `dofus_data/` à la racine
 * du dépôt, à côté des dumps du jeu :
 *
 * - `mounts.json` : le dump brut `MountsDataRoot` des releases
 *   dofusdude/dofus3-main. Il lie chaque monture de jeu à son certificat, et
 *   c'est tout ce qu'on lui prend : ni génération ni parents n'y figurent.
 * - `breeding.json` : les générations et les croisements, relevés sur les
 *   pages de dofuspourlesnoobs.com. Une connaissance communautaire, qui
 *   n'existe dans aucun dump — le jeu ne publie pas ses recettes.
 *
 * Les deux fichiers sont versionnés : le build (`build-data.mjs`) les lit
 * hors ligne, et un relevé figé se relit et se corrige à la main. Relancer ce
 * script après une mise à jour du jeu, puis `npm run data`.
 *
 *   node scripts/fetch-mounts.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(FRONTEND, '..', 'dofus_data')

const MOUNTS_URL = 'https://github.com/dofusdude/dofus3-main/releases/latest/download/mounts.json'

/** Une page par espèce : la clé est celle de `Species` côté front. */
const BREEDING_PAGES = {
  dragodinde: 'https://www.dofuspourlesnoobs.com/les-dragodindes.html',
  muldo: 'https://www.dofuspourlesnoobs.com/les-muldos.html',
  volkorne: 'https://www.dofuspourlesnoobs.com/les-volkornes.html',
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'kamadvice-fetch-mounts' } })
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`)
  return response.text()
}

const decode = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim()

/**
 * Chaque variété est une `mount-card` : sa génération en attribut, son nom
 * court (« Amande et Rousse », sans l'espèce), et ses croisements dans
 * `mount-breeding` — un seul « A + B », ou plusieurs séparés par des `<br>`
 * pour les variétés qui s'obtiennent de plusieurs couples.
 *
 * Une carte sans croisement est une génération 1, ou une monture qui ne
 * s'obtient pas par élevage (Dragodinde à Plumes) : les deux gardent une
 * liste vide, c'est la génération qui les distingue.
 */
function parseBreeding(html) {
  const varieties = []
  for (const card of html.split('<div class="mount-card"').slice(1)) {
    const generation = Number(/data-gen="(\d+)"/.exec(card)?.[1])
    const name = decode(/<div class="mount-name">([^<]*)<\/div>/.exec(card)?.[1] ?? '')
    if (!name || !Number.isInteger(generation)) continue

    const breeding = /<div class="mount-breeding">([\s\S]*?)<\/div>/.exec(card)?.[1] ?? ''
    const recipes = breeding
      .split(/<br\s*\/?>/)
      .map(decode)
      .filter(Boolean)
      .map((line) => line.split('+').map((part) => part.trim()))
      .filter((pair) => pair.length === 2 && pair.every(Boolean))

    varieties.push({ name, generation, recipes })
  }
  return varieties
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const mounts = await fetchText(MOUNTS_URL)
  // Le dump est réécrit tel quel : c'est une donnée de jeu, pas la nôtre.
  await writeFile(join(OUT, 'mounts.json'), mounts)
  console.log(`  dofus_data/mounts.json`.padEnd(30), `${(mounts.length / 1024).toFixed(0)} Ko`)

  const breeding = { fetchedAt: new Date().toISOString().slice(0, 10), sources: BREEDING_PAGES }
  for (const [species, url] of Object.entries(BREEDING_PAGES)) {
    const varieties = parseBreeding(await fetchText(url))
    if (varieties.length === 0) throw new Error(`${url} : aucune monture reconnue, la page a changé ?`)
    breeding[species] = varieties
    const multi = varieties.filter((v) => v.recipes.length > 1).length
    console.log(
      `  ${species}`.padEnd(30),
      `${varieties.length} variétés, ${multi} à plusieurs croisements`,
    )
  }
  await writeFile(join(OUT, 'breeding.json'), JSON.stringify(breeding, null, 2) + '\n')
}

main()
