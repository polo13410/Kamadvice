import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import Adorned, { CONTROL } from '../components/Adorned'
import { useCatalog } from '../data/catalogContext'
import { normalize } from '../lib/format'
import { defaultSortDir, rememberFilters, useFilters, type SortKey } from '../lib/itemFilters'
import ItemsTable, { sortRows, useItemRows } from '../components/ItemsTable'
import { Icon } from '../lib/icons'

/**
 * Recherche dans le catalogue : le filtre plein texte, les listes déroulantes
 * et le tri. C'est d'ici qu'on épingle les items qu'on suivra ensuite depuis
 * l'accueil.
 */
export default function ItemsPage() {
  const catalog = useCatalog()
  const rows = useItemRows()

  const [{ search, categoryId, typeId, craftableOnly, sort }, update] = useFilters(catalog)

  // La fiche d'un item ramène à la liste telle qu'on l'a quittée.
  const { search: query } = useLocation()
  useEffect(() => rememberFilters(query), [query])

  /** Types proposés au filtre, restreints à la catégorie sélectionnée. */
  const types = useMemo(
    () =>
      categoryId === null
        ? catalog.types
        : catalog.types.filter((type) => type.categoryId === categoryId),
    [catalog.types, categoryId],
  )

  const visible = useMemo(() => {
    const needle = normalize(search.trim())
    const filtered = rows.filter((row) => {
      if (needle && !row.search.includes(needle)) return false
      if (categoryId !== null && row.item.type?.categoryId !== categoryId) return false
      if (typeId !== null && row.item.type?.id !== typeId) return false
      if (craftableOnly && !catalog.recipeFor.has(row.item.id)) return false
      return true
    })
    return sortRows(filtered, sort)
  }, [rows, search, categoryId, typeId, craftableOnly, sort, catalog.recipeFor])

  const toggleSort = (key: SortKey) =>
    update({
      sort:
        sort.key === key
          ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: defaultSortDir(key) },
    })

  const priced = rows.filter((row) => row.buy !== null).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Adorned icon={Icon.search} className="min-w-56 flex-1">
          <input
            value={search}
            onChange={(event) => update({ search: event.target.value }, { replace: true })}
            placeholder="Rechercher un item…"
            className={`${CONTROL} w-full`}
          />
        </Adorned>

        <Adorned icon={Icon.category}>
          <select
            value={categoryId ?? ''}
            onChange={(event) =>
              // Changer de catégorie remet le type à zéro : l'ancien n'y existe pas.
              update({
                categoryId: event.target.value === '' ? null : Number(event.target.value),
                typeId: null,
              })
            }
            className={CONTROL}
          >
            <option value="">Toutes catégories</option>
            {Object.entries(catalog.categories).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Adorned>

        <Adorned icon={Icon.type}>
          <select
            value={typeId ?? ''}
            onChange={(event) =>
              update({ typeId: event.target.value === '' ? null : Number(event.target.value) })
            }
            className={`${CONTROL} max-w-56`}
          >
            <option value="">Tous types</option>
            {types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </Adorned>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400 hover:text-slate-200">
          <input
            type="checkbox"
            checked={craftableOnly}
            onChange={(event) => update({ craftableOnly: event.target.checked })}
            className="accent-amber-500"
          />
          <Icon.craft className="size-4" aria-hidden />
          Craftables
        </label>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Icon.item className="size-3.5" aria-hidden />
          {visible.length.toLocaleString('fr-FR')} items affichés
        </span>
        <span className="flex items-center gap-1.5">
          <Icon.price className="size-3.5" aria-hidden />
          {priced.toLocaleString('fr-FR')} prix saisis
        </span>
      </div>

      <ItemsTable
        rows={visible}
        sort={sort}
        onSort={toggleSort}
        height="h-[calc(100vh-22rem)] min-h-80"
      />
    </div>
  )
}
