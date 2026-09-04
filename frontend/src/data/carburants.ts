/**
 * Connaissance de jeu sur les carburants d'enclos.
 *
 * Le type « Carburant d'enclos » compte 120 items : 4 familles (extrait,
 * philtre, potion, élixir) × 5 calibres × 6 jauges. Tous se craftent au métier
 * d'Éleveur, et le catalogue en sait presque tout — nom, niveau, icône,
 * recette. Ce qui manquait vit dans les effets, que `build-data.mjs` extrait à
 * part : voir `Carburant` dans `domain/types`.
 *
 * Rien n'est écrit en dur ici sauf les tables ci-dessous, qui sont des
 * constantes de jeu introuvables dans le dump : les paliers de remplissage
 * d'une jauge, et les libellés. Le reste se déduit des données :
 *
 * - le **calibre** se lit dans les points rendus — 1 000 minuscule à 5 000
 *   gigantesque, identiques d'une famille à l'autre ;
 * - la **famille** se lit dans le plafond de jauge — 40 000 extrait, 70 000
 *   philtre, 90 000 potion, aucun plafond élixir ;
 * - le **niveau d'Éleveur** requis est celui de l'item au catalogue.
 *
 * Déduire plutôt qu'énumérer évite la table de 120 lignes à maintenir à la
 * main, et le parsing du nom français, qui casserait sur l'élision (« Extrait
 * d'Abreuvoir » contre « Extrait de Baffeur »). En échange, un carburant que
 * ces tables ne reconnaissent pas ne doit jamais disparaître en silence : voir
 * `unknownCarburants` dans `domain/carburant.ts`.
 */
import type { Carburant, ItemId } from '../domain/types'

/** Le type d'item « Carburant d'enclos », tel que le dump le numérote. */
export const CARBURANT_TYPE_ID = 326

/** Le métier dont relèvent tous les crafts de cette page. */
export const ELEVEUR_JOB_ID = 79

/** Niveau maximum d'un métier, et donc borne haute du filtre par niveau. */
export const MAX_JOB_LEVEL = 200

// --- Jauges ------------------------------------------------------------------

/** Les six jauges d'un enclos. */
export type Gauge = 'mangeoire' | 'dragofesse' | 'abreuvoir' | 'foudroyeur' | 'caresseur' | 'baffeur'

/**
 * `element_id` de l'effet vers la jauge qu'il remplit.
 *
 * L'identifiant de jeu plutôt que le libellé : il ne bouge pas d'une version à
 * l'autre, là où un renommage casserait tout en silence.
 */
export const GAUGE_BY_ELEMENT: Record<number, Gauge> = {
  263: 'caresseur',
  265: 'baffeur',
  267: 'foudroyeur',
  268: 'dragofesse',
  269: 'mangeoire',
  270: 'abreuvoir',
}

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
  /** Rappel du palier, porté par la bulle de la colonne « Catégorie ». */
  note: string
  targets: readonly GaugeTarget[]
}

/**
 * Les six jauges. L'ordre de cette table ne fait plus l'ordre du tableau —
 * c'est le tri de la page qui s'en charge — mais reste celui de la lecture :
 * l'XP d'abord, seule à plusieurs paliers, la sérénité en dernier.
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
    // La sérénité va de -5 000 à +5 000 : on chiffre le pire cas, soit un
    // trajet complet depuis l'autre extrémité.
    label: 'Caresseur',
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

export const GAUGE_INFO = new Map(GAUGES.map((gauge) => [gauge.key, gauge]))

/** Les jauges dans l'ordre alphabétique, celui des filtres et du tri. */
export const GAUGES_ALPHA: readonly GaugeInfo[] = [...GAUGES].sort((a, b) =>
  a.label.localeCompare(b.label, 'fr'),
)

// --- Calibres ----------------------------------------------------------------

/** Calibre d'un carburant. Détermine à lui seul les points rendus. */
export type CarburantSize = 'minuscule' | 'petit' | 'normal' | 'grand' | 'gigantesque'

/** Calibres du plus petit au plus grand : l'ordre de lecture du tableau. */
export const SIZES: readonly CarburantSize[] = [
  'minuscule',
  'petit',
  'normal',
  'grand',
  'gigantesque',
]

export const SIZE_LABELS: Record<CarburantSize, string> = {
  minuscule: 'Minuscule',
  petit: 'Petit',
  normal: 'Normal',
  grand: 'Grand',
  gigantesque: 'Gigantesque',
}

/** Points de jauge rendus par un carburant, selon son calibre. */
export const POINTS_BY_SIZE: Record<CarburantSize, number> = {
  minuscule: 1_000,
  petit: 2_000,
  normal: 3_000,
  grand: 4_000,
  gigantesque: 5_000,
}

/**
 * Lecture inverse : les points rendus donnent le calibre.
 *
 * Ils ne dépendent que de lui — un extrait gigantesque et un élixir
 * gigantesque versent les mêmes 5 000 points.
 */
export const SIZE_BY_POINTS = new Map<number, CarburantSize>(
  SIZES.map((size) => [POINTS_BY_SIZE[size], size]),
)

// --- Familles ----------------------------------------------------------------

/** Famille d'un carburant : sa gamme, du bas au haut niveau. */
export type CarburantFamily = 'extrait' | 'philtre' | 'potion' | 'elixir'

export interface FamilyInfo {
  key: CarburantFamily
  label: string
  /**
   * Valeur au-delà de laquelle la famille ne remplit plus la jauge.
   * `null` pour l'élixir, le seul sans plafond.
   *
   * Le plafond porte sur la jauge à l'instant du remplissage, pas sur un total
   * versé : la jauge se vide en alimentant les montures, et on recharge en
   * boucle. Un extrait mène donc bien une mangeoire au niveau 200, en plus
   * d'allers-retours. C'est pourquoi il ne pèse pas dans « Coût maxer ».
   */
  cap: number | null
  /** Niveaux d'Éleveur de ses cinq calibres, du minuscule au gigantesque. */
  levels: readonly [number, number, number, number, number]
}

export const FAMILIES: readonly FamilyInfo[] = [
  { key: 'extrait', label: 'Extrait', cap: 40_000, levels: [5, 15, 25, 35, 45] },
  { key: 'philtre', label: 'Philtre', cap: 70_000, levels: [55, 65, 75, 85, 95] },
  { key: 'potion', label: 'Potion', cap: 90_000, levels: [105, 115, 125, 135, 145] },
  { key: 'elixir', label: 'Élixir', cap: null, levels: [155, 165, 175, 185, 195] },
]

export const FAMILY_INFO = new Map(FAMILIES.map((family) => [family.key, family]))

/**
 * Lecture inverse : le plafond donne la famille.
 *
 * L'absence de plafond est l'élixir, cas que la `Map` ne sait pas porter : il
 * est traité à part dans `familyOf`.
 */
const FAMILY_BY_CAP = new Map<number, CarburantFamily>(
  FAMILIES.flatMap((family) => (family.cap === null ? [] : [[family.cap, family.key]])),
)

const familyOf = (cap: number | null): CarburantFamily | null =>
  cap === null ? 'elixir' : (FAMILY_BY_CAP.get(cap) ?? null)

// --- Lecture d'un carburant --------------------------------------------------

/** Un carburant du dump, une fois reconnu par les tables ci-dessus. */
export interface CarburantInfo {
  id: ItemId
  gauge: Gauge
  family: CarburantFamily
  size: CarburantSize
  points: number
  cap: number | null
}

/**
 * Reconnaît un carburant, ou `null` s'il sort des tables de jeu — points
 * inattendus, plafond inconnu, jauge jamais vue.
 *
 * L'appelant décide quoi faire du `null` ; la page, elle, le signale.
 */
export function readCarburant(raw: Carburant): CarburantInfo | null {
  const gauge = GAUGE_BY_ELEMENT[raw.gaugeElementId]
  const size = SIZE_BY_POINTS.get(raw.points)
  const family = familyOf(raw.cap)
  if (!gauge || !size || !family) return null

  return { id: raw.id, gauge, family, size, points: raw.points, cap: raw.cap }
}

/** « Gigantesque Élixir », le nom court d'une ligne du tableau. */
export const carburantLabel = (info: CarburantInfo): string =>
  `${SIZE_LABELS[info.size]} ${FAMILY_INFO.get(info.family)?.label ?? info.family}`

/** « ne remplit pas au-delà de 40 000 », ou l'absence de limite. */
export const capLabel = (cap: number | null): string =>
  cap === null
    ? 'Aucun plafond : remplit la jauge quel que soit son niveau'
    : `Ne remplit plus la jauge au-delà de ${cap.toLocaleString('fr-FR')}`
