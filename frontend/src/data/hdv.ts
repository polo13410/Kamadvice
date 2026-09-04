/**
 * Connaissance de jeu : dans quel hôtel de vente se relève le prix d'un item.
 *
 * Le catalogue ne le dit pas, et sa catégorie ne suffit pas : les carburants
 * d'enclos sont des « Ressources » au dump mais se vendent à l'HDV des
 * familiers et montures, avec les Makina et les filets. D'où une table par
 * type, qui prime, et un repli par catégorie pour tout le reste.
 *
 * Un type qui manquerait ici n'est pas une erreur : l'item retombe sur l'HDV
 * de sa catégorie. Si l'assistant vous envoie au mauvais comptoir, c'est ici
 * qu'on l'ajoute.
 */
import type { Item } from '../domain/types'

export type HdvKey = 'familiers' | 'ressources' | 'consommables' | 'equipement' | 'autre'

export interface HdvInfo {
  key: HdvKey
  label: string
  /** Ce qu'on y trouve, pour l'écran de rendez-vous. */
  hint: string
}

export const HDV: Record<HdvKey, HdvInfo> = {
  familiers: {
    key: 'familiers',
    label: 'HDV des familiers et montures',
    hint: "Carburants d'enclos, Makina, filets de capture, familiers.",
  },
  ressources: {
    key: 'ressources',
    label: 'HDV des ressources',
    hint: 'Céréales, bois, minerais, os, poils… tout ce qui entre dans une recette.',
  },
  consommables: {
    key: 'consommables',
    label: 'HDV des consommables',
    hint: 'Potions, pains, parchemins, poissons comestibles.',
  },
  equipement: {
    key: 'equipement',
    label: 'HDV des équipements',
    hint: 'Armes, coiffes, capes, anneaux, amulettes…',
  },
  autre: {
    key: 'autre',
    label: 'Hors HDV',
    hint: "Objets de quête ou d'apparat, sans comptoir dédié : à relever où vous les trouvez.",
  },
}

/** Types qui ne se vendent pas là où leur catégorie le laisserait croire. */
const HDV_BY_TYPE: Record<number, HdvKey> = {
  18: 'familiers', // Familier
  99: 'familiers', // Filet de capture
  323: 'familiers', // Makina
  326: 'familiers', // Carburant d'enclos
}

/** Repli : la catégorie du dump nomme l'HDV, à l'exception des types ci-dessus. */
const HDV_BY_CATEGORY: Record<number, HdvKey> = {
  0: 'equipement',
  1: 'consommables',
  2: 'ressources',
}

export function hdvOf(item: Item): HdvInfo {
  const type = item.type
  const key =
    (type && HDV_BY_TYPE[type.id]) ?? (type && HDV_BY_CATEGORY[type.categoryId]) ?? 'autre'
  return HDV[key]
}
