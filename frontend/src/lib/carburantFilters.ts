/**
 * Filtres et tri du tableau de bord des carburants, portés par la query string.
 *
 * Même parti-pris que `itemFilters` : l'URL est l'unique source de vérité, une
 * vue filtrée se partage, et les valeurs par défaut ne sont jamais écrites.
 *
 * Jauges, familles et calibres se cumulent : « Baffeur et Caresseur, en
 * minuscule, petit ou normal ». Un ensemble vide ne restreint rien.
 */
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FAMILIES,
  GAUGES,
  SIZES,
  type CarburantFamily,
  type CarburantSize,
  type Gauge,
} from '../data/carburants'
import type { SortDir } from '../components/TableHead'
import { isBounded, NO_RANGE, readRange, writeRange, type Range } from './range'

/**
 * `gauge` et `level` sont des tris de lecture, `ratio` et `margin` des tris de
 * décision. Chacun a un second critère fixe, pour que l'intérieur d'un groupe
 * ne change pas d'ordre sans raison.
 */
export type CarburantSortKey = 'gauge' | 'level' | 'ratio' | 'margin'

const SORT_KEYS: CarburantSortKey[] = ['gauge', 'level', 'ratio', 'margin']

export interface CarburantFilters {
  /** Mot-clé, cherché dans le nom du carburant et de ses ingrédients. */
  search: string
  gauges: ReadonlySet<Gauge>
  families: ReadonlySet<CarburantFamily>
  sizes: ReadonlySet<CarburantSize>
  /** Niveau d'Éleveur requis, borné. */
  level: Range
  /** Ne garder que le meilleur rendement de chaque jauge. */
  bestOnly: boolean
  sort: { key: CarburantSortKey; dir: SortDir }
}

export const DEFAULT_SORT_KEY: CarburantSortKey = 'level'

/**
 * Sens initial d'un tri : lecture par le début, chiffres par le haut —
 * « le plus rentable » est la question qu'on se pose en cliquant sur Marge.
 */
export const defaultSortDir = (key: CarburantSortKey): SortDir =>
  key === 'gauge' || key === 'level' ? 'asc' : 'desc'

const GAUGE_KEYS = new Set<string>(GAUGES.map((g) => g.key))
const FAMILY_KEYS = new Set<string>(FAMILIES.map((f) => f.key))
const SIZE_KEYS = new Set<string>(SIZES)

/**
 * Liste séparée par des virgules, dont on ne garde que les valeurs connues :
 * une valeur inconnue est ignorée plutôt que de produire une liste vide, un
 * lien partagé se rattrape tout seul.
 */
function pickAll<T extends string>(raw: string | null, known: ReadonlySet<string>): Set<T> {
  const values = new Set<T>()
  if (raw === null) return values
  for (const part of raw.split(',')) if (known.has(part)) values.add(part as T)
  return values
}

function parse(params: URLSearchParams): CarburantFilters {
  const key = SORT_KEYS.find((candidate) => candidate === params.get('sort')) ?? DEFAULT_SORT_KEY
  const dir = params.get('dir')

  return {
    search: params.get('q') ?? '',
    gauges: pickAll<Gauge>(params.get('gauge'), GAUGE_KEYS),
    families: pickAll<CarburantFamily>(params.get('family'), FAMILY_KEYS),
    sizes: pickAll<CarburantSize>(params.get('size'), SIZE_KEYS),
    level: readRange(params, 'l'),
    bestOnly: params.get('best') === '1',
    sort: { key, dir: dir === 'asc' || dir === 'desc' ? dir : defaultSortDir(key) },
  }
}

/** Ordre fixe des paramètres : deux fois les mêmes filtres donnent la même URL. */
function serialize(filters: CarburantFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search !== '') params.set('q', filters.search)
  if (filters.gauges.size > 0) params.set('gauge', [...filters.gauges].join(','))
  if (filters.families.size > 0) params.set('family', [...filters.families].join(','))
  if (filters.sizes.size > 0) params.set('size', [...filters.sizes].join(','))
  writeRange(params, 'l', filters.level)
  if (filters.bestOnly) params.set('best', '1')
  if (filters.sort.key !== DEFAULT_SORT_KEY) params.set('sort', filters.sort.key)
  if (filters.sort.dir !== defaultSortDir(filters.sort.key)) params.set('dir', filters.sort.dir)
  return params
}

/** Tout ce que « Tout effacer » remet à zéro : les filtres, pas le tri. */
export const NO_FILTERS: Omit<CarburantFilters, 'sort'> = {
  search: '',
  gauges: new Set(),
  families: new Set(),
  sizes: new Set(),
  level: NO_RANGE,
  bestOnly: false,
}

/** Au moins une restriction posée : de quoi afficher « Tout effacer ». */
export const isFiltering = (filters: CarburantFilters): boolean =>
  filters.search !== '' ||
  filters.gauges.size > 0 ||
  filters.families.size > 0 ||
  filters.sizes.size > 0 ||
  isBounded(filters.level) ||
  filters.bestOnly

export function useCarburantFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parse(params), [params])

  /**
   * `replace` pour la frappe dans une borne : sans lui, chaque chiffre
   * laisserait une entrée d'historique. Les puces et coches poussent au
   * contraire une entrée, pour qu'un retour annule le dernier choix.
   */
  const update = useCallback(
    (patch: Partial<CarburantFilters>, options?: { replace?: boolean }) => {
      setParams(serialize({ ...filters, ...patch }), { replace: options?.replace ?? false })
    },
    [filters, setParams],
  )

  return [filters, update] as const
}
