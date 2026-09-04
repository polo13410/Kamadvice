/**
 * Le tableau d'items de l'app : mêmes colonnes, même tri, même cœur, que la
 * liste vienne des favoris ou d'une recherche. Seul le jeu de lignes change,
 * et c'est l'appelant qui le compose.
 */
import { useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCatalog } from '../data/catalogContext'
import { useIgnored } from '../data/ignored'
import { usePrices } from '../data/prices'
import { createEvaluator } from '../domain/craft'
import type { Item } from '../domain/types'
import { formatKamas, formatPercent, normalize } from '../lib/format'
import { Icon } from '../lib/icons'
import type { SortDir, SortKey } from '../lib/itemFilters'
import FavoriteButton from './FavoriteButton'
import ItemIcon from './ItemIcon'
import Kamas from './Kamas'
import PriceField from './PriceField'
import { Tooltip } from './Tooltip'
import TrendIcon from './TrendIcon'

export interface ItemRow {
  item: Item
  /** Nom normalisé, prêt pour la recherche. */
  search: string
  buy: number | null
  /** L'item a une recette. Sans quoi son coût de craft n'est pas inconnu : il n'existe pas. */
  craftable: boolean
  craft: number | null
  margin: number | null
  marginRatio: number | null
}

export interface Sort {
  key: SortKey
  dir: SortDir
}

/** Assez haut pour loger l'input de prix, désormais sur une seule ligne. */
const ROW_HEIGHT = 44

/**
 * Une seule grille pour l'en-tête et les lignes : décrite deux fois, la
 * première colonne qui bouge désaligne tout le tableau.
 */
const COLUMNS = 'grid grid-cols-[1.75rem_1fr_9rem_3.5rem_16rem_8rem_6rem] items-center gap-3'

/**
 * Tout le catalogue, chiffré. Un seul évaluateur par jeu de prix : la
 * mémoïsation interne rend le chiffrage des 17 000 items négligeable, et tout
 * se recalcule dès qu'un prix change.
 */
export function useItemRows(): ItemRow[] {
  const catalog = useCatalog()
  const prices = usePrices()
  const ignored = useIgnored()

  return useMemo(() => {
    const evaluate = createEvaluator(catalog, prices, ignored)
    return catalog.items.map((item) => {
      const report = evaluate.report(item.id)
      return {
        item,
        search: normalize(item.name),
        buy: report.buy,
        craftable: report.craft !== null,
        // Coût complet uniquement : un total partiel n'est pas comparable aux
        // autres lignes, et « trier par coût » n'y répondrait plus.
        craft: report.craft?.complete ? report.craft.cost : null,
        margin: report.margin,
        marginRatio: report.marginRatio,
      }
    })
  }, [catalog, prices, ignored])
}

/** Trie une copie des lignes : celles reçues sont mémoïsées en amont. */
export function sortRows(rows: ItemRow[], sort: Sort): ItemRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return sign * a.item.name.localeCompare(b.item.name, 'fr')
    if (sort.key === 'level') return sign * (a.item.level - b.item.level)
    if (sort.key === 'type') {
      // Les items sans type rejoignent les prix inconnus tout en bas, et deux
      // items d'un même type se départagent par leur nom : sans ce second
      // critère, l'intérieur d'un groupe changerait d'ordre sans raison.
      const left = a.item.type?.name ?? null
      const right = b.item.type?.name ?? null
      if (left === null && right === null) return a.item.name.localeCompare(b.item.name, 'fr')
      if (left === null) return 1
      if (right === null) return -1
      const between = left.localeCompare(right, 'fr')
      return between !== 0 ? sign * between : a.item.name.localeCompare(b.item.name, 'fr')
    }
    // Les valeurs inconnues restent en bas quel que soit le sens du tri : une
    // ligne sans prix n'est jamais une réponse à « le moins cher / le plus rentable ».
    const left = a[sort.key]
    const right = b[sort.key]
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return sign * (left - right)
  })
}

export default function ItemsTable({
  rows,
  sort,
  onSort,
  height,
  empty,
}: {
  rows: ItemRow[]
  sort: Sort
  onSort: (key: SortKey) => void
  /** Hauteur de la zone défilante, à ajuster selon ce que la page pose au-dessus. */
  height: string
  /** Ce qu'on affiche à la place des lignes quand il n'y en a aucune. */
  empty?: ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <div
        className={`${COLUMNS} border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-400`}
      >
        {/* La colonne des cœurs se passe d'intitulé : le cœur le dit déjà. */}
        <Tooltip content="Favoris" className="flex justify-center">
          <Icon.favorite className="size-3.5" aria-hidden />
        </Tooltip>
        <SortHeader label="Item" icon={Icon.item} active={sort} sortKey="name" onClick={onSort} />
        <SortHeader label="Type" icon={Icon.type} active={sort} sortKey="type" onClick={onSort} />
        <SortHeader label="Niv." active={sort} sortKey="level" onClick={onSort} align="right" />
        <SortHeader
          label="Prix HDV"
          icon={Icon.price}
          active={sort}
          sortKey="buy"
          onClick={onSort}
          align="right"
        />
        <SortHeader
          label="Coût craft"
          icon={Icon.craft}
          active={sort}
          sortKey="craft"
          onClick={onSort}
          align="right"
        />
        <SortHeader
          label="Marge"
          icon={Icon.gain}
          active={sort}
          sortKey="margin"
          onClick={onSort}
          align="right"
        />
      </div>

      {rows.length === 0 && empty !== undefined ? (
        empty
      ) : (
        <div ref={scrollRef} className={`${height} overflow-auto`}>
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null
              return (
                <div
                  key={row.item.id}
                  className={`absolute inset-x-0 ${COLUMNS} border-b border-slate-800/60 px-3 hover:bg-slate-900/60`}
                  style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                >
                  <FavoriteButton itemId={row.item.id} />

                  {/* Nom et type se tronquent dans leur colonne : la bulle
                      porte le texte entier. */}
                  <Tooltip content={row.item.name} className="block min-w-0">
                    <Link
                      to={`/item/${row.item.id}`}
                      data-item-name={row.item.name}
                      className="flex min-w-0 items-center gap-2 text-slate-200 hover:text-amber-400"
                    >
                      <ItemIcon item={row.item} size={28} />
                      <span className="truncate">{row.item.name}</span>
                    </Link>
                  </Tooltip>

                  <Tooltip
                    content={row.item.type?.name}
                    className="block min-w-0 truncate text-xs text-slate-500"
                  >
                    {row.item.type?.name ?? '—'}
                  </Tooltip>
                  <span className="text-right text-xs tabular-nums text-slate-500">
                    {row.item.level}
                  </span>

                  <PriceField itemId={row.item.id} />

                  {/* Un tiret dit « on ne sait pas », ce qui serait faux d'un
                      item qui ne se crafte pas : lui n'a pas de coût du tout. */}
                  {row.craftable ? (
                    <Tooltip
                      content={row.craft === null ? "Coût inconnu : au moins un ingrédient n'a pas de prix" : null}
                      className="flex items-center justify-end tabular-nums text-slate-300"
                    >
                      <Kamas value={row.craft} />
                    </Tooltip>
                  ) : (
                    <Tooltip
                      content="Cet item n'a pas de recette"
                      className="flex items-center justify-end text-slate-700"
                    >
                      <Icon.none className="size-3.5" aria-hidden />
                    </Tooltip>
                  )}

                  {/* Même distinction qu'au coût : sans recette il n'y a rien à
                      revendre plus cher qu'on ne l'a fabriqué, donc pas de
                      marge — et non une marge qu'on ignorerait. */}
                  {row.craftable ? (
                    <Tooltip
                      content={
                        row.margin === null
                          ? "Marge inconnue : il manque le prix HDV ou le coût du craft"
                          : `${formatKamas(row.margin)} kamas`
                      }
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
                  ) : (
                    <Tooltip
                      content="Cet item n'a pas de recette"
                      className="flex items-center justify-end text-slate-700"
                    >
                      <Icon.none className="size-3.5" aria-hidden />
                    </Tooltip>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
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
  active: Sort
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
