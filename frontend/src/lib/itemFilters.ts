/**
 * Filtres de la liste d'items, portés par la query string.
 *
 * L'URL est l'unique source de vérité : un état React parallèle se
 * désynchroniserait du bouton « retour » et une vue filtrée ne serait pas
 * partageable. Les valeurs par défaut ne sont jamais écrites, pour que
 * `/search` reste `/search` tant qu'on n'a rien filtré.
 */
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Catalog } from '../domain/types'

/** `updated` : la date du dernier relevé de prix. */
export type SortKey = 'name' | 'type' | 'level' | 'buy' | 'updated' | 'craft' | 'margin'
export type SortDir = 'asc' | 'desc'

const SORT_KEYS: SortKey[] = ['name', 'type', 'level', 'buy', 'updated', 'craft', 'margin']

/**
 * Le tri de la recherche qu'on ouvre : les derniers prix relevés en tête —
 * ce qui bouge sur le serveur, et les items sans prix en bas (voir `sortRows`).
 */
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: 'updated', dir: 'desc' }

/** Le sens qu'un tri prend sans qu'on le précise : celui du tri d'ouverture, sinon le sens naturel de la clé. */
const impliedDir = (key: SortKey): SortDir =>
  key === DEFAULT_SORT.key ? DEFAULT_SORT.dir : defaultSortDir(key)

export interface Filters {
  search: string
  categoryId: number | null
  typeId: number | null
  craftableOnly: boolean
  sort: { key: SortKey; dir: SortDir }
}

/**
 * Sens initial d'un tri : alphabétique par le début, niveau en montant,
 * kamas et dates par le haut — « le plus rentable », « le plus récent » sont
 * les questions qu'on se pose en cliquant sur Marge ou sur Relevé.
 */
export const defaultSortDir = (key: SortKey): SortDir =>
  key === 'name' || key === 'type' || key === 'level' ? 'asc' : 'desc'

const toId = (raw: string | null): number | null => {
  if (raw === null) return null
  const value = Number(raw)
  return Number.isInteger(value) ? value : null
}

function parse(params: URLSearchParams, catalog: Catalog): Filters {
  const category = toId(params.get('cat'))
  const categoryId = category !== null && category in catalog.categories ? category : null

  // Un type inconnu, ou étranger à la catégorie affichée, est ignoré plutôt
  // que de produire une liste vide : un lien partagé se rattrape tout seul.
  const type = catalog.types.find((candidate) => candidate.id === toId(params.get('type')))
  const typeId = type && (categoryId === null || type.categoryId === categoryId) ? type.id : null

  const key = SORT_KEYS.find((candidate) => candidate === params.get('sort')) ?? DEFAULT_SORT.key
  const dir = params.get('dir')

  return {
    search: params.get('q') ?? '',
    categoryId,
    typeId,
    craftableOnly: params.get('craft') === '1',
    sort: { key, dir: dir === 'asc' || dir === 'desc' ? dir : impliedDir(key) },
  }
}

/** Ordre fixe des paramètres : deux fois les mêmes filtres donnent la même URL. */
function serialize(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.search !== '') params.set('q', filters.search)
  if (filters.categoryId !== null) params.set('cat', String(filters.categoryId))
  if (filters.typeId !== null) params.set('type', String(filters.typeId))
  if (filters.craftableOnly) params.set('craft', '1')
  if (filters.sort.key !== DEFAULT_SORT.key) params.set('sort', filters.sort.key)
  if (filters.sort.dir !== impliedDir(filters.sort.key)) params.set('dir', filters.sort.dir)
  return params
}

export function useFilters(catalog: Catalog) {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parse(params, catalog), [params, catalog])

  /**
   * `replace` pour la frappe au clavier : sans lui, chaque caractère laisserait
   * une entrée d'historique et le bouton « retour » deviendrait inutilisable.
   * Les filtres discrets poussent au contraire une entrée, pour qu'un retour
   * annule le dernier choix.
   */
  const update = useCallback(
    (patch: Partial<Filters>, options?: { replace?: boolean }) => {
      setParams(serialize({ ...filters, ...patch }), { replace: options?.replace ?? false })
    },
    [filters, setParams],
  )

  return [filters, update] as const
}

const STORAGE_KEY = 'kamadvice.filters.v1'

/**
 * Derniers filtres consultés, mémorisés hors de l'URL pour que « Retour à la
 * liste » y ramène : le bouton du navigateur suffit après un simple aller-
 * retour, pas après un enchaînement d'items. `sessionStorage` survit au
 * rechargement d'une fiche sans polluer les sessions suivantes.
 */
export function rememberFilters(search: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, search)
  } catch {
    // Stockage bloqué : on retombera simplement sur la liste non filtrée.
  }
}

export function rememberedFilters(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}
