/**
 * Connaissance de jeu sur les carburants d'enclos.
 *
 * Le catalogue sait tout des extraits — nom, niveau, icône, recette — sauf la
 * seule chose qui compte ici : combien de points de jauge ils rendent. Cette
 * valeur, et les paliers à atteindre pour maxer une jauge, n'existent nulle
 * part dans le dump : ce sont des constantes du jeu, saisies à la main.
 *
 * Les ids sont écrits en dur, faute de mieux :
 * - la plage 33309-33352 **n'est pas** continue (33321-33325, 33332-33335 et
 *   33342-33346 sont des Kromakina de dragodinde) ;
 * - le type « Carburant d'enclos » compte 120 items, les extraits n'en étant
 *   que le premier palier (viennent ensuite philtres, potions et élixirs) ;
 * - déduire la jauge du nom français demanderait de gérer l'élision
 *   (« Extrait d'Abreuvoir » contre « Extrait de Baffeur ») et casserait en
 *   silence au moindre renommage.
 *
 * En échange, un id disparu du catalogue ne doit jamais passer inaperçu : voir
 * `missingExtraits` dans `domain/carburant.ts`.
 *
 * Provenance de la table : `dofus_data/dragodindes_carbu.json`.
 */
import type { ItemId } from '../domain/types'

/** Les six jauges d'un enclos. */
export type Gauge = 'mangeoire' | 'dragofesse' | 'abreuvoir' | 'foudroyeur' | 'caresseur' | 'baffeur'

/** Calibre d'un extrait. Détermine à lui seul les points rendus. */
export type ExtraitSize = 'minuscule' | 'petit' | 'normal' | 'grand' | 'gigantesque'

/** Points de jauge rendus par un extrait, selon son calibre. */
export const POINTS_BY_SIZE: Record<ExtraitSize, number> = {
  minuscule: 1_000,
  petit: 2_000,
  normal: 3_000,
  grand: 4_000,
  gigantesque: 5_000,
}

export const SIZE_LABELS: Record<ExtraitSize, string> = {
  minuscule: 'Minuscule',
  petit: 'Petit',
  normal: 'Normal',
  grand: 'Grand',
  gigantesque: 'Gigantesque',
}

/** Calibres du plus petit au plus grand : l'ordre de lecture du tableau. */
export const SIZES: readonly ExtraitSize[] = [
  'minuscule',
  'petit',
  'normal',
  'grand',
  'gigantesque',
]

/**
 * Palier à atteindre pour remplir une jauge.
 *
 * `label` reste `null` quand la jauge n'a qu'un seul palier : il n'y a alors
 * rien à préciser, et la cellule affiche une valeur nue.
 */
export interface GaugeTarget {
  label: string | null
  points: number
}

export interface GaugeInfo {
  key: Gauge
  label: string
  /** Rappel du palier, affiché en tête de groupe. */
  note: string
  targets: readonly GaugeTarget[]
}

/**
 * Les jauges dans l'ordre du tableau de bord : l'XP d'abord, puisque c'est le
 * seul cas à plusieurs paliers, les jauges à 20 000 ensuite, la sérénité en
 * dernier.
 */
export const GAUGES: readonly GaugeInfo[] = [
  {
    key: 'mangeoire',
    label: 'Mangeoire',
    note: "Jauge d'expérience : le palier dépend du niveau visé.",
    // Les seuils cumulés d'XP d'une dragodinde aux trois paliers usuels.
    targets: [
      { label: 'Niv. 50', points: 34_365 },
      { label: 'Niv. 100', points: 172_668 },
      { label: 'Niv. 200', points: 867_582 },
    ],
  },
  {
    key: 'dragofesse',
    label: 'Dragofesse',
    note: 'Palier unique : 20 000 points.',
    targets: [{ label: null, points: 20_000 }],
  },
  {
    key: 'abreuvoir',
    label: 'Abreuvoir',
    note: 'Palier unique : 20 000 points.',
    targets: [{ label: null, points: 20_000 }],
  },
  {
    key: 'foudroyeur',
    label: 'Foudroyeur',
    note: 'Palier unique : 20 000 points.',
    targets: [{ label: null, points: 20_000 }],
  },
  {
    key: 'caresseur',
    label: 'Caresseur',
    // La sérénité va de -5 000 à +5 000 : on chiffre le pire cas, soit un
    // trajet complet depuis l'autre extrémité.
    note: 'Sérénité de -5 000 à +5 000 : on retient le pire cas, 5 000 points.',
    targets: [{ label: null, points: 5_000 }],
  },
  {
    key: 'baffeur',
    label: 'Baffeur',
    note: 'Sérénité de -5 000 à +5 000 : on retient le pire cas, 5 000 points.',
    targets: [{ label: null, points: 5_000 }],
  },
]

export interface ExtraitInfo {
  id: ItemId
  gauge: Gauge
  size: ExtraitSize
}

/**
 * Les 30 extraits, groupés par jauge puis par calibre croissant. Le nom en
 * commentaire rend la table auditable sans ouvrir le catalogue.
 */
export const EXTRAITS: readonly ExtraitInfo[] = [
  // Mangeoire
  { id: 33314, gauge: 'mangeoire', size: 'minuscule' }, // Minuscule Extrait de Mangeoire
  { id: 33320, gauge: 'mangeoire', size: 'petit' }, // Petit Extrait de Mangeoire
  { id: 33331, gauge: 'mangeoire', size: 'normal' }, // Extrait de Mangeoire
  { id: 33341, gauge: 'mangeoire', size: 'grand' }, // Grand Extrait de Mangeoire
  { id: 33352, gauge: 'mangeoire', size: 'gigantesque' }, // Gigantesque Extrait de Mangeoire
  // Dragofesse
  { id: 33311, gauge: 'dragofesse', size: 'minuscule' }, // Minuscule Extrait de Dragofesse
  { id: 33317, gauge: 'dragofesse', size: 'petit' }, // Petit Extrait de Dragofesse
  { id: 33328, gauge: 'dragofesse', size: 'normal' }, // Extrait de Dragofesse
  { id: 33338, gauge: 'dragofesse', size: 'grand' }, // Grand Extrait de Dragofesse
  { id: 33349, gauge: 'dragofesse', size: 'gigantesque' }, // Gigantesque Extrait de Dragofesse
  // Abreuvoir
  { id: 33313, gauge: 'abreuvoir', size: 'minuscule' }, // Minuscule Extrait d'Abreuvoir
  { id: 33319, gauge: 'abreuvoir', size: 'petit' }, // Petit Extrait d'Abreuvoir
  { id: 33330, gauge: 'abreuvoir', size: 'normal' }, // Extrait d'Abreuvoir
  { id: 33340, gauge: 'abreuvoir', size: 'grand' }, // Grand Extrait d'Abreuvoir
  { id: 33351, gauge: 'abreuvoir', size: 'gigantesque' }, // Gigantesque Extrait d'Abreuvoir
  // Foudroyeur
  { id: 33312, gauge: 'foudroyeur', size: 'minuscule' }, // Minuscule Extrait de Foudroyeur
  { id: 33318, gauge: 'foudroyeur', size: 'petit' }, // Petit Extrait de Foudroyeur
  { id: 33329, gauge: 'foudroyeur', size: 'normal' }, // Extrait de Foudroyeur
  { id: 33339, gauge: 'foudroyeur', size: 'grand' }, // Grand Extrait de Foudroyeur
  { id: 33350, gauge: 'foudroyeur', size: 'gigantesque' }, // Gigantesque Extrait de Foudroyeur
  // Caresseur
  { id: 33310, gauge: 'caresseur', size: 'minuscule' }, // Minuscule Extrait de Caresseur
  { id: 33316, gauge: 'caresseur', size: 'petit' }, // Petit Extrait de Caresseur
  { id: 33327, gauge: 'caresseur', size: 'normal' }, // Extrait de Caresseur
  { id: 33337, gauge: 'caresseur', size: 'grand' }, // Grand Extrait de Caresseur
  { id: 33348, gauge: 'caresseur', size: 'gigantesque' }, // Gigantesque Extrait de Caresseur
  // Baffeur
  { id: 33309, gauge: 'baffeur', size: 'minuscule' }, // Minuscule Extrait de Baffeur
  { id: 33315, gauge: 'baffeur', size: 'petit' }, // Petit Extrait de Baffeur
  { id: 33326, gauge: 'baffeur', size: 'normal' }, // Extrait de Baffeur
  { id: 33336, gauge: 'baffeur', size: 'grand' }, // Grand Extrait de Baffeur
  { id: 33347, gauge: 'baffeur', size: 'gigantesque' }, // Gigantesque Extrait de Baffeur
]
