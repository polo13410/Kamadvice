/**
 * Connaissance de jeu sur les montures d'élevage : dragodindes, muldos et
 * volkornes — « monture » désigne les trois, partout dans l'app.
 *
 * Les variétés, leurs générations et leurs croisements viennent du catalogue
 * (`public/data/mounts.json`, voir `scripts/build-data.mjs`). Ce module ne
 * garde que ce qui n'y est pas : les libellés d'espèce, les réglages par
 * défaut d'un plan, les jauges à remplir pour rendre une monture féconde, et
 * la lecture des Makina — les objets qui modifient un accouplement.
 */
import type { Catalog, Item, ItemId, MountVariety, Species } from '../domain/types'
import type { PlanSettings } from '../domain/breeding'
import { GAUGE_INFO, type Gauge } from './carburants'

export interface SpeciesInfo {
  key: Species
  label: string
  plural: string
}

/** Les trois espèces, dans l'ordre où le jeu les a introduites. */
export const SPECIES: readonly SpeciesInfo[] = [
  { key: 'dragodinde', label: 'Dragodinde', plural: 'Dragodindes' },
  { key: 'muldo', label: 'Muldo', plural: 'Muldos' },
  { key: 'volkorne', label: 'Volkorne', plural: 'Volkornes' },
]

export const SPECIES_INFO = new Map(SPECIES.map((species) => [species.key, species]))

/** « Dragodinde Amande et Rousse » : le nom complet, tel que l'item le porte. */
export const varietyName = (variety: MountVariety): string =>
  `${SPECIES_INFO.get(variety.species)?.label ?? variety.species} ${variety.name}`

/**
 * Réglages par défaut d'un plan d'élevage.
 *
 * On raisonne en points de mangeoire : 20 000, un plein de jauge, ce que les
 * éleveurs versent en pratique — soit le niveau 39 d'après la table d'XP
 * (20 437 au niveau 40). Niveau et points restent liés par la table :
 * changer l'un déplace l'autre.
 */
export const DEFAULT_SETTINGS: PlanSettings = {
  targetLevel: 39,
  feedPoints: 20_000,
  optimakina: false,
  probable: false,
  breederLevel: 1,
}

/** La jauge d'expérience : c'est elle qui fait le niveau. */
export const FEED_GAUGE: Gauge = 'mangeoire'

/** L'item dont l'image dit « mangeoire » là où une icône ne parle pas : l'extrait de base. */
export const FEED_EXTRACT_NAME = 'Extrait de Mangeoire'

/**
 * Les trois jauges à porter au maximum pour qu'une monture devienne féconde :
 * amour (dragofesse), maturité (abreuvoir) et endurance (foudroyeur). La
 * sérénité, elle, ne se remplit pas : elle se règle, et ne coûte que le temps
 * de l'amener dans la bonne zone.
 */
export const FERTILITY_GAUGES: readonly Gauge[] = ['dragofesse', 'abreuvoir', 'foudroyeur']

/** Points à verser dans une jauge de fécondité : son palier unique, 20 000. */
export const fertilityPoints = (gauge: Gauge): number =>
  GAUGE_INFO.get(gauge)?.targets[0]?.points ?? 20_000

// --- Makina ------------------------------------------------------------------

/** Le type d'item « Makina », tel que le dump le numérote. */
export const MAKINA_TYPE_ID = 323

export type MakinaKind = 'optimakina' | 'animakina' | 'kromakina'

export interface Makina {
  kind: MakinaKind
  species: Species
  /** Génération cible maximale sur laquelle la makina agit. */
  generation: number
  item: Item
}

const MAKINA_NAME = /^(Optimakina|Animakina|Kromakina) (Dragodinde|Muldo|Volkorne) de Génération (\d+)$/

const KIND_BY_PREFIX: Record<string, MakinaKind> = {
  Optimakina: 'optimakina',
  Animakina: 'animakina',
  Kromakina: 'kromakina',
}

const SPECIES_BY_LABEL = new Map(SPECIES.map((species) => [species.label, species.key]))

/**
 * Lit les Makina du catalogue à leur nom : « Optimakina Dragodinde de
 * Génération 3 ». Le dump ne porte ni l'espèce ni la génération en clair,
 * seulement dans l'intitulé et la description, et le nom est le plus stable
 * des deux.
 *
 * Une Optimakina agit « si la génération cible est N ou inférieure » : pour un
 * croisement de génération g, toute Optimakina de génération ≥ g convient. La
 * moins chère se choisit alors parmi celles-là, voir `cheapestOptimakina`.
 */
export function readMakinas(catalog: Catalog): Makina[] {
  const makinas: Makina[] = []
  for (const item of catalog.items) {
    if (item.type?.id !== MAKINA_TYPE_ID) continue
    const match = MAKINA_NAME.exec(item.name)
    if (!match) continue
    const kind = KIND_BY_PREFIX[match[1] ?? '']
    const species = SPECIES_BY_LABEL.get(match[2] ?? '')
    const generation = Number(match[3])
    if (!kind || !species || !Number.isInteger(generation)) continue
    makinas.push({ kind, species, generation, item })
  }
  return makinas
}

/**
 * L'Optimakina la moins chère qui agisse sur un croisement de cette espèce et
 * de cette génération, parmi celles dont le prix est connu.
 *
 * `null` si aucune n'a de prix : le coût est alors incomplet, pas nul. Les
 * candidates sans prix sont rendues à part, pour que la page puisse proposer
 * de les saisir.
 */
export function cheapestOptimakina(
  makinas: readonly Makina[],
  species: Species,
  generation: number,
  price: (itemId: ItemId) => number | null,
): { item: Item; price: number } | { item: null; candidates: Item[] } {
  let best: { item: Item; price: number } | null = null
  const candidates: Item[] = []
  for (const makina of makinas) {
    if (makina.kind !== 'optimakina' || makina.species !== species) continue
    if (makina.generation < generation) continue
    candidates.push(makina.item)
    const value = price(makina.item.id)
    if (value !== null && (best === null || value < best.price)) best = { item: makina.item, price: value }
  }
  return best ?? { item: null, candidates }
}
