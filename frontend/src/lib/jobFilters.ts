/**
 * Filtres et tri d'un tableau de bord métier, portés par la query string.
 *
 * Même parti-pris que `itemFilters` et `carburantFilters` : l'URL est l'unique
 * source de vérité, une vue filtrée se partage, et les valeurs par défaut ne
 * sont jamais écrites.
 *
 * Les bornes sont toutes facultatives : une borne absente ne restreint rien.
 */
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SortDir } from '../components/TableHead'
import { isBounded, NO_RANGE, readRange, writeRange, type Range } from './range'

export type JobSortKey =
  | 'name'
  | 'type'
  | 'level'
  | 'buy'
  | 'craft'
  | 'margin'
  | 'ratio'
  | 'ingredients'

const SORT_KEYS: JobSortKey[] = [
  'name',
  'type',
  'level',
  'buy',
  'craft',
  'margin',
  'ratio',
  'ingredients',
]

export interface JobFilters {
  /** Mot-clé, cherché dans le nom de l'item et de ses ingrédients. */
  search: string
  level: Range
  /** Types d'item, par id. Vide = tous. */
  types: ReadonlySet<number>
  buy: Range
  craft: Range
  ingredients: Range
  sort: { key: JobSortKey; dir: SortDir }
}

export const DEFAULT_SORT_KEY: JobSortKey = 'level'

/**
 * Sens initial d'un tri : lecture par le début, chiffres par le haut —
 * « le plus rentable » est la question qu'on se pose en cliquant sur Marge.
 * Le nombre d'ingrédients se lit du plus simple au plus long.
 */
export const defaultSortDir = (key: JobSortKey): SortDir =>
  key === 'name' || key === 'type' || key === 'level' || key === 'ingredients' ? 'asc' : 'desc'

const toInt = (raw: string | null): number | null => {
  if (raw === null || raw === '') return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : null
}

function parse(params: URLSearchParams): JobFilters {
  const key = SORT_KEYS.find((candidate) => candidate === params.get('sort')) ?? DEFAULT_SORT_KEY
  const dir = params.get('dir')

  const types = new Set<number>()
  for (const part of params.get('type')?.split(',') ?? []) {
    const id = toInt(part)
    if (id !== null) types.add(id)
  }

  return {
    search: params.get('q') ?? '',
    level: readRange(params, 'l'),
    types,
    buy: readRange(params, 'b'),
    craft: readRange(params, 'c'),
    ingredients: readRange(params, 'i'),
    sort: { key, dir: dir === 'asc' || dir === 'desc' ? dir : defaultSortDir(key) },
  }
}

/** Ordre fixe des paramètres : deux fois les mêmes filtres donnent la même URL. */
function serialize(filters: JobFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search !== '') params.set('q', filters.search)
  writeRange(params, 'l', filters.level)
  if (filters.types.size > 0) params.set('type', [...filters.types].join(','))
  writeRange(params, 'b', filters.buy)
  writeRange(params, 'c', filters.craft)
  writeRange(params, 'i', filters.ingredients)
  if (filters.sort.key !== DEFAULT_SORT_KEY) params.set('sort', filters.sort.key)
  if (filters.sort.dir !== defaultSortDir(filters.sort.key)) params.set('dir', filters.sort.dir)
  return params
}

/** Tout ce que « Tout effacer » remet à zéro : les filtres, pas le tri. */
export const NO_FILTERS: Omit<JobFilters, 'sort'> = {
  search: '',
  level: NO_RANGE,
  types: new Set(),
  buy: NO_RANGE,
  craft: NO_RANGE,
  ingredients: NO_RANGE,
}

/** Au moins une restriction posée : de quoi afficher « Tout effacer ». */
export const isFiltering = (filters: JobFilters): boolean =>
  filters.search !== '' ||
  isBounded(filters.level) ||
  filters.types.size > 0 ||
  isBounded(filters.buy) ||
  isBounded(filters.craft) ||
  isBounded(filters.ingredients)

export function useJobFilters() {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parse(params), [params])

  /**
   * `replace` pour la frappe dans une borne : sans lui, chaque chiffre
   * laisserait une entrée d'historique. Les puces et coches poussent au
   * contraire une entrée, pour qu'un retour annule le dernier choix.
   */
  const update = useCallback(
    (patch: Partial<JobFilters>, options?: { replace?: boolean }) => {
      setParams(serialize({ ...filters, ...patch }), { replace: options?.replace ?? false })
    },
    [filters, setParams],
  )

  return [filters, update] as const
}
