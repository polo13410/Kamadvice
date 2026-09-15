/**
 * Tableau de bord d'un métier : une ligne par recette, avec les prix — celui
 * du résultat et ceux de ses ingrédients — saisissables sur place.
 *
 * Le même module pour tous les métiers ; ce qui change d'un métier à l'autre
 * vient des données : les types proposés au filtre sont ceux que le métier
 * fabrique vraiment, le niveau du joueur est celui de ce métier.
 *
 * Pas de virtualisation — les champs de prix supportent mal d'être démontés
 * en plein défilement — mais un plafond de lignes : un métier peut compter
 * sept cents recettes à huit ingrédients, on ne monte pas six mille champs
 * d'un coup. Au-delà, la page le dit et invite à filtrer.
 */
import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import {
  FilterBar,
  FilterChips,
  FilterDivider,
  FilterRange,
  FilterReset,
  FilterSearch,
} from '../components/FilterBar'
import ItemIcon from '../components/ItemIcon'
import JobIcon from '../components/JobIcon'
import Kamas from '../components/Kamas'
import NotFound from '../components/NotFound'
import PriceField from '../components/PriceField'
import { PriceWizardButton } from '../components/PriceWizard'
import Th, { INGREDIENT_GRID } from '../components/TableHead'
import { Tooltip } from '../components/Tooltip'
import { useCatalog } from '../data/catalogContext'
import { useIgnored } from '../data/ignored'
import { usePrices } from '../data/prices'
import { buildJobRows, type JobIngredient, type JobRow } from '../domain/jobCraft'
import type { Job } from '../domain/types'
import { formatKamas, formatPercent, normalize } from '../lib/format'
import { heat, heatScale } from '../lib/heat'
import { Icon } from '../lib/icons'
import {
  DEFAULT_SORT_KEY,
  defaultSortDir,
  isFiltering,
  NO_FILTERS,
  useJobFilters,
  type JobFilters,
  type JobSortKey,
} from '../lib/jobFilters'
import { JOBS_PATH } from '../lib/pages'
import { within } from '../lib/range'

/** Au-delà, on n'affiche plus : voir l'en-tête du fichier. */
const MAX_ROWS = 150

const NONE = <span className="tabular-nums text-slate-600">—</span>

export default function JobPage() {
  const { slug } = useParams()
  const catalog = useCatalog()
  const job = catalog.jobs.find((candidate) => candidate.slug === slug)

  if (!job) {
    return (
      <NotFound
        code="404"
        glyph={Icon.notFound}
        title="Métier introuvable"
        message="Aucun métier ne porte ce nom — ou il ne fabrique rien."
        detail={slug}
        exits={[
          {
            to: JOBS_PATH,
            label: 'Métiers',
            description: 'Tous les métiers qui fabriquent quelque chose',
            icon: Icon.job,
          },
        ]}
      />
    )
  }

  // `key` : changer de métier repart d'un état neuf, filtres compris.
  return <JobDashboard key={job.id} job={job} />
}

/**
 * Compare deux lignes selon le tri demandé. Le nom départage toujours : deux
 * lignes égales sur la colonne triée ne doivent pas changer d'ordre sans raison.
 */
function compare(a: JobRow, b: JobRow, sort: JobFilters['sort']): number {
  const sign = sort.dir === 'asc' ? 1 : -1
  const byName = a.item.name.localeCompare(b.item.name, 'fr')

  switch (sort.key) {
    case 'name':
      return sign * byName
    case 'type':
      return (
        sign * (a.item.type?.name ?? '').localeCompare(b.item.type?.name ?? '', 'fr') || byName
      )
    case 'level':
      return sign * (a.item.level - b.item.level) || byName
    case 'ingredients':
      return sign * (a.ingredients.length - b.ingredients.length) || byName
  }

  // Une ligne sans chiffre ne répond ni au « plus » ni au « moins » : elle
  // reste en bas dans les deux sens.
  const pick = (row: JobRow) =>
    sort.key === 'buy'
      ? row.buy
      : sort.key === 'craft'
        ? row.craft
        : sort.key === 'margin'
          ? row.margin
          : row.marginRatio
  const left = pick(a)
  const right = pick(b)
  if (left === null && right === null) return byName
  if (left === null) return 1
  if (right === null) return -1
  return sign * (left - right) || byName
}

function JobDashboard({ job }: { job: Job }) {
  const catalog = useCatalog()
  const prices = usePrices()
  const ignored = useIgnored()
  const [filters, update] = useJobFilters()

  const rows = useMemo(
    () => buildJobRows(catalog, job.id, prices, ignored),
    [catalog, job.id, prices, ignored],
  )

  /** Les types que ce métier fabrique, et eux seuls, par ordre alphabétique. */
  const typeOptions = useMemo(() => {
    const seen = new Map<number, string>()
    for (const row of rows) if (row.item.type) seen.set(row.item.type.id, row.item.type.name)
    return [...seen]
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [rows])

  /** Ce que le mot-clé peut atteindre sur chaque ligne : le nom, et ceux des ingrédients. */
  const haystacks = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.item.id,
          normalize(
            [row.item.name, ...row.ingredients.map((i) => i.item?.name ?? '')].join(' '),
          ),
        ]),
      ),
    [rows],
  )

  const visible = useMemo(
    () =>
      rows
        .filter((row) => {
          const needle = normalize(filters.search.trim())
          if (needle && !haystacks.get(row.item.id)?.includes(needle)) return false
          if (!within(row.item.level, filters.level)) return false
          if (filters.types.size > 0 && !filters.types.has(row.item.type?.id ?? -1)) return false
          if (!within(row.buy, filters.buy)) return false
          if (!within(row.craft, filters.craft)) return false
          if (!within(row.ingredients.length, filters.ingredients)) return false
          return true
        })
        .sort((a, b) => compare(a, b, filters.sort)),
    [rows, haystacks, filters],
  )
  const shown = visible.length > MAX_ROWS ? visible.slice(0, MAX_ROWS) : visible

  const toggleSort = (key: JobSortKey) =>
    update({
      sort:
        filters.sort.key === key
          ? { key, dir: filters.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: defaultSortDir(key) },
    })

  const sortControl = (key: JobSortKey) => ({
    dir: filters.sort.key === key ? filters.sort.dir : null,
    onToggle: () => toggleSort(key),
    onReset: () => update({ sort: { key: DEFAULT_SORT_KEY, dir: defaultSortDir(DEFAULT_SORT_KEY) } }),
  })

  const { priced, expected, scale } = useMemo(() => {
    const wanted = new Set<number>()
    for (const row of visible) {
      wanted.add(row.item.id)
      for (const ingredient of row.ingredients) wanted.add(ingredient.itemId)
    }
    let known = 0
    for (const id of wanted) if (prices.has(id)) known += 1
    return {
      priced: known,
      expected: wanted.size,
      scale: heatScale(shown.map((row) => row.margin)),
    }
  }, [visible, shown, prices])

  /** Portée du remplissage assisté : les résultats d'abord, leurs ingrédients ensuite. */
  const wizardItems = useMemo(
    () => [
      ...visible.map((row) => row.item),
      ...visible.flatMap((row) =>
        row.ingredients.flatMap((ingredient) => (ingredient.item ? [ingredient.item] : [])),
      ),
    ],
    [visible],
  )

  return (
    <div className="space-y-4">
      <DashboardHeader
        icon={Icon.craft}
        glyph={<JobIcon job={job} size={32} />}
        title={job.name}
        description={
          <>
            <Link to={JOBS_PATH} className="text-slate-400 hover:text-amber-400">
              Métiers
            </Link>
            {' › '}Chaque recette face à son prix HDV : le coût retenu est le moins cher entre
            l'achat et la fabrication.
          </>
        }
        stats={[
          { icon: Icon.recipe, label: `${visible.length} / ${rows.length} recettes` },
          { icon: Icon.price, label: `${priced} / ${expected} prix saisis` },
        ]}
      >
        <PriceWizardButton items={wizardItems} />
      </DashboardHeader>

      <FilterBar>
        <FilterSearch
          value={filters.search}
          placeholder="Item ou ingrédient…"
          onChange={(search) => update({ search }, { replace: true })}
        />
        <FilterDivider />
        <FilterRange
          icon={Icon.level}
          label="Niveau requis"
          value={filters.level}
          onChange={(range) => update({ level: range }, { replace: true })}
        />
        <FilterDivider />
        <FilterRange
          icon={Icon.price}
          label="Prix HDV"
          value={filters.buy}
          onChange={(range) => update({ buy: range }, { replace: true })}
        />
        <FilterDivider />
        <FilterRange
          icon={Icon.craft}
          label="Coût de craft"
          value={filters.craft}
          onChange={(range) => update({ craft: range }, { replace: true })}
        />
        <FilterDivider />
        <FilterRange
          icon={Icon.recipe}
          label="Nombre d'ingrédients"
          value={filters.ingredients}
          onChange={(range) => update({ ingredients: range }, { replace: true })}
        />
        {isFiltering(filters) && <FilterReset onClick={() => update(NO_FILTERS)} />}
      </FilterBar>

      {/* Un seul type ne propose aucun choix : la rangée ne s'affiche qu'à
          partir de deux. */}
      {typeOptions.length > 1 && (
        <FilterChips
          icon={Icon.type}
          label="Types"
          value={new Set([...filters.types].map(String))}
          options={typeOptions}
          onChange={(types) => update({ types: new Set([...types].map(Number)) })}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="max-h-[calc(100vh-26rem)] min-h-96 overflow-auto">
          {/* Même logique que le tableau des carburants : colonnes chiffrées
              serrées, « Ingrédients » sans largeur prend le reste et grandit
              avec l'écran. */}
          <table className="w-full min-w-[80rem] table-fixed text-sm">
            <thead className="bg-slate-900 text-xs text-slate-400">
              <tr>
                <Th width="w-56" icon={Icon.item} sort={sortControl('name')}>
                  Item
                </Th>
                <Th width="w-32" icon={Icon.type} sort={sortControl('type')}>
                  Type
                </Th>
                <Th width="w-14" align="right" sort={sortControl('level')}>
                  Niv.
                </Th>
                <Th width="w-36" icon={Icon.price} sort={sortControl('buy')}>
                  Prix HDV
                </Th>
                <Th
                  icon={Icon.recipe}
                  tip="Cliquer pour trier par nombre d'ingrédients"
                  sort={sortControl('ingredients')}
                >
                  Ingrédients
                </Th>
                <Th
                  width="w-24"
                  align="right"
                  icon={Icon.craft}
                  tip="Somme des ingrédients. Vide tant qu'un prix manque."
                  sort={sortControl('craft')}
                >
                  Coût craft
                </Th>
                <Th
                  width="w-28"
                  align="right"
                  tip="Prix HDV moins coût du craft."
                  sort={sortControl('margin')}
                >
                  Rentabilité
                </Th>
                <Th
                  width="w-20"
                  align="right"
                  tip="Rentabilité rapportée au coût du craft."
                  sort={sortControl('ratio')}
                >
                  Marge
                </Th>
                <Th width="w-20" align="center">
                  Décision
                </Th>
              </tr>
            </thead>

            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-8 text-center text-sm text-slate-500">
                    Aucune recette ne passe ces filtres.
                  </td>
                </tr>
              ) : (
                shown.map((row) => <Row key={row.item.id} row={row} scale={scale} />)
              )}
              {visible.length > shown.length && (
                <tr className="border-t border-slate-800">
                  <td colSpan={9} className="px-2 py-3 text-center text-xs text-amber-500/80">
                    <Icon.warning className="mr-1.5 inline size-3.5 align-text-bottom" aria-hidden />
                    {visible.length - shown.length} recettes de plus ne sont pas affichées :
                    affinez les filtres ou triez pour faire remonter ce qui vous intéresse.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-emerald-500/20" aria-hidden />
          Craft rentable, teinte proportionnelle à l'écart
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-rose-500/20" aria-hidden />
          Craft perdant
        </span>
        <span className="flex items-center gap-1.5">
          <Icon.inStock className="size-3.5 shrink-0" aria-hidden />
          Ingrédient en stock, compté pour 0
        </span>
      </p>
    </div>
  )
}

function Row({ row, scale }: { row: JobRow; scale: number }) {
  return (
    <tr className="border-t border-slate-800/60 align-top">
      {/* Nom et type se tronquent dans leur colonne : la bulle porte le texte
          entier. Le lien reste hors tabulation, pour que Tab enchaîne les
          champs de prix. */}
      <td className="min-w-0 px-2 py-1.5">
        <Tooltip content={row.item.name} className="block min-w-0">
          <Link
            to={`/item/${row.item.id}`}
            tabIndex={-1}
            data-item-name={row.item.name}
            className="flex h-6 min-w-0 items-center gap-2 text-slate-300 hover:text-amber-400"
          >
            <ItemIcon item={row.item} size={24} />
            <span className="block truncate">{row.item.name}</span>
          </Link>
        </Tooltip>
      </td>
      <td className="min-w-0 px-2 py-1.5">
        <Tooltip content={row.item.type?.name} className="flex h-6 min-w-0 items-center">
          <span className="truncate text-xs text-slate-400">{row.item.type?.name ?? '—'}</span>
        </Tooltip>
      </td>
      <td className="px-2 py-1.5">
        <span className="flex h-6 items-center justify-end tabular-nums text-slate-400">
          {row.item.level}
        </span>
      </td>
      <td className="px-2 py-1.5">
        {/* Même cale qu'une ligne d'ingrédient, pour que les champs s'alignent. */}
        <div className="space-y-0.5">
          <span className="block h-4" aria-hidden />
          <PriceField itemId={row.item.id} layout="column" align="left" />
        </div>
      </td>
      {/* Jusqu'à huit ingrédients : autant par ligne que l'écran en loge. */}
      <td className="min-w-0 px-2 py-1.5">
        <div className={INGREDIENT_GRID}>
          {row.ingredients.map((ingredient) => (
            <Ingredient key={ingredient.itemId} ingredient={ingredient} />
          ))}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
        <span className="flex h-6 items-center justify-end">
          <CraftCost row={row} />
        </span>
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${
          row.margin === null ? '' : heat(row.margin, scale)
        }`}
      >
        <span className="flex h-6 items-center justify-end">
          <Kamas value={row.margin} signed />
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
        <span className="flex h-6 items-center justify-end">
          {row.marginRatio === null ? NONE : formatPercent(row.marginRatio)}
        </span>
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className="flex h-6 items-center justify-center">
          <Decision decision={row.decision} cost={row.unitCost} />
        </span>
      </td>
    </tr>
  )
}

function CraftCost({ row }: { row: JobRow }) {
  if (row.craft === null) {
    if (row.missing.length >= row.ingredients.length) return NONE
    return (
      <Tooltip
        content={`Coût incomplet : ${new Set(row.missing).size} ingrédient(s) sans prix saisi`}
        className="flex cursor-help items-center justify-end gap-1 text-amber-500/80"
      >
        <Icon.warning className="size-3.5 shrink-0" aria-hidden />—
      </Tooltip>
    )
  }

  return (
    <span className="flex items-center justify-end gap-1">
      {row.inStock.length > 0 && (
        <Tooltip content={`${new Set(row.inStock).size} ingrédient(s) en stock, comptés pour 0`}>
          <Icon.inStock className="size-3.5 shrink-0 cursor-help text-slate-500" aria-hidden />
        </Tooltip>
      )}
      <Kamas value={row.craft} />
    </span>
  )
}

function Ingredient({ ingredient }: { ingredient: JobIngredient }) {
  const name = ingredient.item?.name ?? `Item #${ingredient.itemId}`
  return (
    <div className="min-w-0 space-y-0.5">
      <Tooltip
        content={ingredient.inStock ? `${name} — en stock, compté pour 0` : name}
        className="flex min-w-0 items-center gap-1"
      >
        {ingredient.inStock && (
          <Icon.inStock className="size-3 shrink-0 text-slate-500" aria-hidden />
        )}
        <Link
          to={`/item/${ingredient.itemId}`}
          tabIndex={-1}
          data-item-name={name}
          className={`truncate text-xs hover:text-amber-400 ${
            ingredient.inStock ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {name}
        </Link>
        {ingredient.quantity > 1 && (
          <span className="shrink-0 text-xs text-slate-600">× {ingredient.quantity}</span>
        )}
      </Tooltip>
      <PriceField itemId={ingredient.itemId} layout="column" align="left" />
    </div>
  )
}

function Decision({ decision, cost }: { decision: JobRow['decision']; cost: number | null }) {
  if (decision === null) return NONE

  const craft = decision === 'craft'
  const Glyph = craft ? Icon.craft : Icon.price
  const verb = craft ? 'Fabriquer' : "Acheter à l'HDV"
  return (
    <Tooltip
      content={`${verb} revient à ${formatKamas(cost)} kamas l'unité`}
      className={`inline-flex cursor-help items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${
        craft
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          : 'border-slate-700 bg-slate-800 text-slate-300'
      }`}
    >
      <Glyph className="size-3 shrink-0" aria-hidden />
      {craft ? 'CRAFT' : 'ACHAT'}
    </Tooltip>
  )
}
