import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCatalog } from '../data/catalogContext'
import { usePrices } from '../data/prices'
import { useIgnored } from '../data/ignored'
import { createEvaluator } from '../domain/craft'
import type { Item } from '../domain/types'
import { formatKamas, formatPercent, normalize } from '../lib/format'
import { defaultSortDir, rememberFilters, useFilters, type SortDir, type SortKey } from '../lib/itemFilters'
import ItemIcon from '../components/ItemIcon'
import PriceField from '../components/PriceField'
import TrendIcon from '../components/TrendIcon'
import { Tooltip } from '../components/Tooltip'
import { Icon } from '../lib/icons'

interface Row {
  item: Item
  search: string
  buy: number | null
  craft: number | null
  margin: number | null
  marginRatio: number | null
}

/** Assez haut pour loger l'input de prix, désormais sur une seule ligne. */
const ROW_HEIGHT = 44

/** Style commun des contrôles de la barre d'outils (le `pl-9` loge l'icône). */
const CONTROL =
  'rounded border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none'

export default function ItemsPage() {
  const catalog = useCatalog()
  const prices = usePrices()
  const ignored = useIgnored()

  const [{ search, categoryId, typeId, craftableOnly, sort }, update] = useFilters(catalog)

  // La fiche d'un item ramène à la liste telle qu'on l'a quittée.
  const { search: query } = useLocation()
  useEffect(() => rememberFilters(query), [query])

  // Un seul évaluateur par jeu de prix : la mémoïsation interne rend le chiffrage
  // des 17 000 items négligeable, et tout se recalcule dès qu'un prix change.
  const rows = useMemo<Row[]>(() => {
    const evaluate = createEvaluator(catalog, prices, ignored)
    return catalog.items.map((item) => {
      const report = evaluate.report(item.id)
      return {
        item,
        search: normalize(item.name),
        buy: report.buy,
        // Coût complet uniquement : un total partiel n'est pas comparable aux
        // autres lignes, et « trier par coût » n'y répondrait plus.
        craft: report.craft?.complete ? report.craft.cost : null,
        margin: report.margin,
        marginRatio: report.marginRatio,
      }
    })
  }, [catalog, prices, ignored])

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

    const sign = sort.dir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      if (sort.key === 'name') return sign * a.item.name.localeCompare(b.item.name, 'fr')
      if (sort.key === 'level') return sign * (a.item.level - b.item.level)
      // Les valeurs inconnues restent en bas quel que soit le sens du tri : une
      // ligne sans prix n'est jamais une réponse à « le moins cher / le plus rentable ».
      const left = a[sort.key]
      const right = b[sort.key]
      if (left === null && right === null) return 0
      if (left === null) return 1
      if (right === null) return -1
      return sign * (left - right)
    })
  }, [rows, search, categoryId, typeId, craftableOnly, sort, catalog.recipeFor])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

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

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="grid grid-cols-[1fr_9rem_3.5rem_16rem_8rem_6rem] items-center gap-3 border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-400">
          <SortHeader label="Item" icon={Icon.item} active={sort} sortKey="name" onClick={toggleSort} />
          <span className="flex items-center gap-1.5">
            <Icon.type className="size-3.5" aria-hidden />
            Type
          </span>
          <SortHeader label="Niv." active={sort} sortKey="level" onClick={toggleSort} align="right" />
          <SortHeader
            label="Prix HDV"
            icon={Icon.price}
            active={sort}
            sortKey="buy"
            onClick={toggleSort}
            align="right"
          />
          <SortHeader
            label="Coût craft"
            icon={Icon.craft}
            active={sort}
            sortKey="craft"
            onClick={toggleSort}
            align="right"
          />
          <SortHeader
            label="Marge"
            icon={Icon.gain}
            active={sort}
            sortKey="margin"
            onClick={toggleSort}
            align="right"
          />
        </div>

        <div ref={scrollRef} className="h-[calc(100vh-19rem)] min-h-80 overflow-auto">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = visible[virtualRow.index]
              if (!row) return null
              return (
                <div
                  key={row.item.id}
                  className="absolute inset-x-0 grid grid-cols-[1fr_9rem_3.5rem_16rem_8rem_6rem] items-center gap-3 border-b border-slate-800/60 px-3 hover:bg-slate-900/60"
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <Link
                    to={`/item/${row.item.id}`}
                    className="flex min-w-0 items-center gap-2 text-slate-200 hover:text-amber-400"
                  >
                    <ItemIcon item={row.item} size={28} />
                    <span className="truncate">{row.item.name}</span>
                  </Link>

                  <span className="truncate text-xs text-slate-500">{row.item.type?.name ?? '—'}</span>
                  <span className="text-right text-xs tabular-nums text-slate-500">{row.item.level}</span>

                  <PriceField itemId={row.item.id} />

                  <span className="text-right tabular-nums text-slate-300">{formatKamas(row.craft)}</span>

                  <Tooltip
                    content={row.margin === null ? null : `${formatKamas(row.margin)} kamas`}
                    className={`flex items-center justify-end gap-1 tabular-nums ${
                      row.margin === null
                        ? 'text-slate-600'
                        : row.margin >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                    }`}
                  >
                    <TrendIcon value={row.margin} className="size-3.5 shrink-0" />
                    {formatPercent(row.marginRatio)}
                  </Tooltip>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Contrôle de formulaire précédé d'une icône, posée par-dessus le champ. */
function Adorned({
  icon: Glyph,
  className = '',
  children,
}: {
  icon: LucideIcon
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Glyph className="pointer-events-none absolute left-3 size-4 text-slate-500" aria-hidden />
      {children}
    </div>
  )
}

function SortHeader({
  label,
  icon: Glyph,
  sortKey,
  active,
  onClick,
  align = 'left',
}: {
  label: string
  icon?: LucideIcon
  sortKey: SortKey
  active: { key: SortKey; dir: SortDir }
  onClick: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const isActive = active.key === sortKey
  const Arrow = active.dir === 'asc' ? Icon.sortAsc : Icon.sortDesc
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1.5 hover:text-slate-200 ${
        align === 'right' ? 'justify-end' : ''
      } ${isActive ? 'text-amber-400' : ''}`}
    >
      {Glyph && <Glyph className="size-3.5 shrink-0" aria-hidden />}
      {label}
      {isActive && <Arrow className="size-3.5 shrink-0" aria-hidden />}
    </button>
  )
}
