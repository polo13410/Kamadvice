import { useMemo, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import Adorned, { CONTROL } from '../components/Adorned'
import { PriceWizardButton } from '../components/PriceWizard'
import ItemsTable, {
  sortRows,
  useItemRows,
  type ItemRow,
  type Sort,
} from '../components/ItemsTable'
import { useCatalog } from '../data/catalogContext'
import { useFavorites } from '../data/favorites'
import type { Catalog } from '../domain/types'
import { normalize } from '../lib/format'
import { Icon } from '../lib/icons'
import { SEARCH } from '../lib/pages'
import { defaultSortDir, type SortKey } from '../lib/itemFilters'

/** Puce des items sans type : aucun type réel ne porte cet id. */
const NO_TYPE = -1

interface Preset<K extends string> {
  key: K
  label: string
  test: (row: ItemRow, catalog: Catalog) => boolean
}

type FlagKey = 'profitable' | 'unpriced' | 'craftable'

/**
 * Les questions chiffrées qu'on se pose assez souvent pour mériter un clic
 * plutôt qu'un min/max à remplir. Chacune parle d'autre chose que les autres :
 * elles se cumulent donc en ET.
 */
const FLAGS: Preset<FlagKey>[] = [
  { key: 'profitable', label: 'Rentable', test: (row) => row.margin !== null && row.margin > 0 },
  { key: 'unpriced', label: 'Sans prix', test: (row) => row.buy === null },
  { key: 'craftable', label: 'Craftable', test: (row, catalog) => catalog.recipeFor.has(row.item.id) },
]

type BandKey = 'low' | 'mid' | 'high'

/** Trois tranches de niveau : de quoi dégrossir sans transformer la page en formulaire. */
const BANDS: Preset<BandKey>[] = [
  { key: 'low', label: 'Niv. ≤ 50', test: (row) => row.item.level <= 50 },
  { key: 'mid', label: 'Niv. 51-100', test: (row) => row.item.level > 50 && row.item.level <= 100 },
  { key: 'high', label: 'Niv. > 100', test: (row) => row.item.level > 100 },
]

interface Selection {
  types: ReadonlySet<number>
  bands: ReadonlySet<BandKey>
  flags: ReadonlySet<FlagKey>
}

const NOTHING: Selection = { types: new Set(), bands: new Set(), flags: new Set() }

/**
 * Un groupe vide ne restreint rien, et ses puces s'additionnent — « ressource
 * OU consommable », « niveau ≤ 50 OU > 100 » : cocher deux cases d'une même
 * question pour n'obtenir aucune ligne n'aurait aucun sens. Les drapeaux, eux,
 * se cumulent en ET puisque chacun porte sur autre chose.
 */
function matches(row: ItemRow, selection: Selection, catalog: Catalog): boolean {
  if (selection.types.size > 0 && !selection.types.has(row.item.type?.id ?? NO_TYPE)) return false
  if (
    selection.bands.size > 0 &&
    !BANDS.some((band) => selection.bands.has(band.key) && band.test(row, catalog))
  ) {
    return false
  }
  return FLAGS.every((flag) => !selection.flags.has(flag.key) || flag.test(row, catalog))
}

const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

/**
 * Les items qu'on suit, et rien d'autre.
 *
 * Les filtres y sont plus légers qu'à la recherche, parce que la matière l'est
 * aussi : une poignée de lignes se dégrossit à la frappe, et les types
 * réellement présents tiennent dans une rangée de puces — une liste déroulante
 * de trente types dont trois donnent un résultat serait un piège.
 *
 * Le tri et les filtres restent locaux, contrairement à la recherche : une vue
 * bâtie sur des favoris propres au navigateur n'a rien à partager par l'URL.
 */
export default function FavoritesPage() {
  const catalog = useCatalog()
  const rows = useItemRows()
  const favorites = useFavorites()
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Selection>(NOTHING)

  const pinned = useMemo(() => rows.filter((row) => favorites.has(row.item.id)), [rows, favorites])

  /** Ce que le champ laisse passer. Toutes les puces se comptent là-dessus. */
  const matching = useMemo(() => {
    const needle = normalize(search.trim())
    return needle ? pinned.filter((row) => row.search.includes(needle)) : pinned
  }, [pinned, search])

  /**
   * Types présents, par ordre alphabétique : les comptes, eux, dépendent des
   * autres puces actives, et un tri par effectif ferait sauter les puces de
   * place à chaque clic.
   */
  const facets = useMemo(() => {
    const counts = new Map<number, { id: number; name: string }>()
    for (const row of matching) {
      const id = row.item.type?.id ?? NO_TYPE
      if (!counts.has(id)) counts.set(id, { id, name: row.item.type?.name ?? 'Sans type' })
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [matching])

  // Un type que la frappe ou un cœur retiré vient de faire disparaître ne doit
  // pas vider la page en silence : sa puce n'existe plus, sa restriction non plus.
  const active = useMemo<Selection>(() => {
    const present = new Set(facets.map((facet) => facet.id))
    const kept = [...selection.types].filter((id) => present.has(id))
    return kept.length === selection.types.size
      ? selection
      : { ...selection, types: new Set(kept) }
  }, [facets, selection])

  const visible = useMemo(
    () => sortRows(matching.filter((row) => matches(row, active, catalog)), sort),
    [matching, active, catalog, sort],
  )

  /**
   * Ce que la puce donnerait si on la cliquait : son propre groupe est mis de
   * côté, les autres restent. Un compte à zéro dit de ne pas essayer, et la
   * puce se désactive plutôt que de mener à une liste vide.
   */
  const countWith = (relaxed: Selection, test: (row: ItemRow) => boolean) =>
    matching.filter((row) => test(row) && matches(row, relaxed, catalog)).length

  const withoutTypes: Selection = { ...active, types: NOTHING.types }
  const withoutBands: Selection = { ...active, bands: NOTHING.bands }

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultSortDir(key) },
    )

  const clear = () => {
    setSearch('')
    setSelection(NOTHING)
  }

  const filtering =
    search !== '' || active.types.size > 0 || active.bands.size > 0 || active.flags.size > 0

  /** Portée du remplissage assisté : ce que les filtres laissent à l'écran. */
  const wizardItems = useMemo(() => visible.map((row) => row.item), [visible])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <Icon.favorite className="size-5 shrink-0 fill-current text-rose-400" aria-hidden />
          Mes favoris
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Icon.item className="size-3.5" aria-hidden />
            {filtering
              ? `${visible.length} item${visible.length > 1 ? 's' : ''} sur ${pinned.length}`
              : `${pinned.length} item${pinned.length > 1 ? 's' : ''} suivi${pinned.length > 1 ? 's' : ''}`}
          </span>
          <PriceWizardButton items={wizardItems} />
        </div>
      </div>

      {pinned.length > 0 && (
        <div className="space-y-3">
          <Adorned icon={Icon.search} className="max-w-md">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrer mes favoris…"
              className={`${CONTROL} w-full`}
            />
          </Adorned>

          {/* Un seul type ne propose aucun choix : la rangée ne s'affiche qu'à
              partir de deux. */}
          {facets.length > 1 && (
            <ChipRow icon={Icon.type} label="Types">
              <Chip
                label="Tous"
                count={countWith(withoutTypes, () => true)}
                active={active.types.size === 0}
                onClick={() => setSelection({ ...active, types: NOTHING.types })}
              />
              {facets.map((facet) => (
                <Chip
                  key={facet.id}
                  label={facet.name}
                  count={countWith(withoutTypes, (row) => (row.item.type?.id ?? NO_TYPE) === facet.id)}
                  active={active.types.has(facet.id)}
                  onClick={() => setSelection({ ...active, types: toggle(active.types, facet.id) })}
                />
              ))}
            </ChipRow>
          )}

          <ChipRow icon={Icon.filter} label="Filtres">
            {FLAGS.map((flag) => (
              <Chip
                key={flag.key}
                label={flag.label}
                // Un drapeau ne relâche que lui-même : les deux autres, qui
                // portent sur autre chose, continuent de compter.
                count={countWith(
                  { ...active, flags: toggle(active.flags, flag.key) },
                  (row) => flag.test(row, catalog),
                )}
                active={active.flags.has(flag.key)}
                onClick={() => setSelection({ ...active, flags: toggle(active.flags, flag.key) })}
              />
            ))}

            <span className="mx-1 h-4 w-px shrink-0 bg-slate-800" aria-hidden />

            {BANDS.map((band) => (
              <Chip
                key={band.key}
                label={band.label}
                count={countWith(withoutBands, (row) => band.test(row, catalog))}
                active={active.bands.has(band.key)}
                onClick={() => setSelection({ ...active, bands: toggle(active.bands, band.key) })}
              />
            ))}

            {filtering && (
              <button
                type="button"
                onClick={clear}
                className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400"
              >
                <Icon.sortReset className="size-3.5 shrink-0" aria-hidden />
                Tout effacer
              </button>
            )}
          </ChipRow>
        </div>
      )}

      <ItemsTable
        rows={visible}
        sort={sort}
        onSort={toggleSort}
        height="h-[calc(100vh-27rem)] min-h-80"
        empty={
          <div className="px-4 py-12 text-center text-sm text-slate-500">
            <Icon.favorite className="mx-auto size-8 text-slate-700" aria-hidden />
            {pinned.length === 0 ? (
              <>
                <p className="mt-3">Aucun favori pour l'instant.</p>
                <p className="mt-1">
                  Cherchez un item dans la{' '}
                  <Link to={SEARCH.to} className="text-amber-400 hover:text-amber-300">
                    recherche
                  </Link>{' '}
                  et cliquez sur son cœur pour le suivre ici.
                </p>
              </>
            ) : (
              <p className="mt-3">Aucun favori ne correspond aux filtres.</p>
            )}
          </div>
        }
      />
    </div>
  )
}

/** Une famille de puces, annoncée par son icône plutôt que par un intitulé. */
function ChipRow({
  icon: Glyph,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Glyph className="size-3.5 shrink-0 text-slate-600" aria-label={label} />
      {children}
    </div>
  )
}

/** Filtre d'un clic, avec le nombre de lignes qu'il laisserait passer. */
function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  // Une puce qui ne mène nulle part reste visible — la retirer ferait sauter la
  // rangée d'un caractère à l'autre — mais elle ne se clique plus.
  const dead = count === 0 && !active
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dead}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
        active
          ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
          : dead
            ? 'cursor-not-allowed border-slate-800 text-slate-700'
            : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
      }`}
    >
      {label}
      <span
        className={`tabular-nums ${active ? 'text-amber-500/70' : dead ? 'text-slate-800' : 'text-slate-600'}`}
      >
        {count}
      </span>
    </button>
  )
}
