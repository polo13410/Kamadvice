/**
 * Tableau de bord des carburants d'enclos.
 *
 * Une ligne par carburant, avec les prix — le sien et ceux de ses ingrédients —
 * saisissables sur place : tout ce qui en découle (coût de craft, décision,
 * ka/point, coût pour maxer) se recalcule à la frappe.
 *
 * 120 carburants ne tiennent pas à l'écran : les filtres se cumulent (jauge,
 * famille, calibre, niveau du joueur, meilleur rendement) et le tri fait
 * l'ordre de lecture. Pas de virtualisation : sous filtre on affiche rarement
 * plus de trente lignes, et les champs de prix supportent mal d'être
 * démontés en plein défilement.
 */
import { Fragment, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import DashboardHeader from '../components/DashboardHeader'
import {
  FilterBar,
  FilterChips,
  FilterDivider,
  FilterRange,
  FilterReset,
  FilterSearch,
  FilterToggle,
} from '../components/FilterBar'
import ItemIcon from '../components/ItemIcon'
import Kamas from '../components/Kamas'
import PriceField from '../components/PriceField'
import { PriceWizardButton } from '../components/PriceWizard'
import Th, { INGREDIENT_GRID } from '../components/TableHead'
import { Tooltip } from '../components/Tooltip'
import {
  capLabel,
  carburantLabel,
  FAMILIES,
  GAUGE_INFO,
  GAUGES_ALPHA,
  SIZE_LABELS,
  SIZES,
} from '../data/carburants'
import { useCatalog } from '../data/catalogContext'
import { useIgnored } from '../data/ignored'
import { usePrices } from '../data/prices'
import {
  bestPerGauge,
  buildCarburantRows,
  unknownCarburants,
  type CarburantIngredient,
  type CarburantRow,
  type MaxingEstimate,
} from '../domain/carburant'
import {
  defaultSortDir,
  isFiltering,
  NO_FILTERS,
  useCarburantFilters,
  type CarburantFilters,
  type CarburantSortKey,
} from '../lib/carburantFilters'
import { formatKamas, formatRatio, normalize } from '../lib/format'
import { heat, heatScale } from '../lib/heat'
import { Icon } from '../lib/icons'
import { within } from '../lib/range'

const NONE = <span className="tabular-nums text-slate-600">—</span>

/** Rang de chaque jauge dans l'ordre alphabétique, second critère des tris. */
const GAUGE_RANK = new Map(GAUGES_ALPHA.map((gauge, index) => [gauge.key, index]))

const GAUGE_OPTIONS = GAUGES_ALPHA.map((gauge) => ({ value: gauge.key, label: gauge.label }))
const FAMILY_OPTIONS = FAMILIES.map((family) => ({ value: family.key, label: family.label }))
const SIZE_OPTIONS = SIZES.map((size) => ({ value: size, label: SIZE_LABELS[size] }))

/**
 * Compare deux lignes selon le tri demandé.
 *
 * Le second critère ne suit pas le sens du tri : inverser « par jauge » renverse
 * les jauges, pas l'ordre des calibres à l'intérieur d'une jauge, qui reste le
 * plus lisible du petit au grand.
 */
function compare(a: CarburantRow, b: CarburantRow, sort: CarburantFilters['sort']): number {
  const sign = sort.dir === 'asc' ? 1 : -1
  const byGauge = (GAUGE_RANK.get(a.gauge) ?? 0) - (GAUGE_RANK.get(b.gauge) ?? 0)
  const byLevel = a.level - b.level

  if (sort.key === 'gauge') return sign * byGauge || byLevel
  if (sort.key === 'level') return sign * byLevel || byGauge

  // Une ligne sans chiffre ne répond ni au « plus » ni au « moins » : elle
  // reste en bas dans les deux sens.
  const left = sort.key === 'ratio' ? a.pointsPerKama : a.craftMargin
  const right = sort.key === 'ratio' ? b.pointsPerKama : b.craftMargin
  if (left === null && right === null) return byGauge || byLevel
  if (left === null) return 1
  if (right === null) return -1
  return sign * (left - right) || byGauge || byLevel
}

export default function CarburantPage() {
  const catalog = useCatalog()
  const prices = usePrices()
  const ignored = useIgnored()
  const [filters, update] = useCarburantFilters()

  const rows = useMemo(
    () => buildCarburantRows(catalog, prices, ignored),
    [catalog, prices, ignored],
  )
  const unknown = useMemo(() => unknownCarburants(catalog), [catalog])

  /**
   * Les filtres de portée d'abord, le meilleur rendement ensuite : « le
   * meilleur » se juge parmi ce qu'on peut fabriquer et ce qu'on regarde, pas
   * parmi les 120.
   */
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

  const { visible, bestIds } = useMemo(() => {
    const needle = normalize(filters.search.trim())
    // Un ensemble vide ne restreint rien ; à l'intérieur d'un ensemble, c'est
    // un OU (Baffeur ou Caresseur) ; entre ensembles, un ET.
    const scoped = rows.filter((row) => {
      if (needle && !haystacks.get(row.item.id)?.includes(needle)) return false
      if (filters.gauges.size > 0 && !filters.gauges.has(row.gauge)) return false
      if (filters.families.size > 0 && !filters.families.has(row.family)) return false
      if (filters.sizes.size > 0 && !filters.sizes.has(row.size)) return false
      if (!within(row.level, filters.level)) return false
      return true
    })
    const best = bestPerGauge(scoped)
    const kept = filters.bestOnly ? scoped.filter((row) => best.has(row.item.id)) : scoped
    return { visible: kept.sort((a, b) => compare(a, b, filters.sort)), bestIds: best }
  }, [rows, haystacks, filters])

  /** Premier clic : le sens naturel de la colonne. Les suivants basculent. */
  const toggleSort = (key: CarburantSortKey) =>
    update({
      sort:
        filters.sort.key === key
          ? { key, dir: filters.sort.dir === 'asc' ? 'desc' : 'asc' }
          : { key, dir: defaultSortDir(key) },
    })

  const sortControl = (key: CarburantSortKey) => ({
    dir: filters.sort.key === key ? filters.sort.dir : null,
    onToggle: () => toggleSort(key),
    onReset: () => update({ sort: { key: 'gauge', dir: 'asc' } }),
  })

  /**
   * De quoi orienter la saisie : combien de prix sont attendus (les carburants
   * affichés plus leurs ingrédients), combien sont connus, et le plus gros
   * écart, qui sert d'échelle à la carte de chaleur.
   */
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
      scale: heatScale(visible.map((row) => row.craftMargin)),
    }
  }, [visible, prices])

  /**
   * Portée du remplissage assisté : les carburants affichés d'abord — tous au
   * même comptoir — puis leurs ingrédients. L'assistant dédoublonne.
   */
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
        icon={Icon.fuel}
        title="Carburants d'enclos"
        description="Le coût retenu est le moins cher entre l'achat à l'HDV et la fabrication ; les points/kama départagent ensuite les carburants d'une même jauge."
        stats={[
          {
            icon: Icon.item,
            label: `${visible.length} / ${rows.length} carburants`,
          },
          { icon: Icon.price, label: `${priced} / ${expected} prix saisis` },
        ]}
      >
        <PriceWizardButton items={wizardItems} />
      </DashboardHeader>

      {unknown.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-amber-500/80">
          <Icon.warning className="size-4 shrink-0" aria-hidden />
          {unknown.length} carburant(s) du catalogue non reconnu(s), absent(s) du tableau :{' '}
          {unknown.map((item) => item.name).join(', ')}.
        </p>
      )}

      <FilterBar>
        <FilterSearch
          value={filters.search}
          placeholder="Carburant ou ingrédient…"
          onChange={(search) => update({ search }, { replace: true })}
        />
        <FilterDivider />
        <FilterChips
          icon={Icon.gauge}
          label="Jauges"
          value={filters.gauges}
          options={GAUGE_OPTIONS}
          onChange={(gauges) => update({ gauges })}
        />
        <FilterDivider />
        <FilterChips
          icon={Icon.family}
          label="Familles"
          value={filters.families}
          options={FAMILY_OPTIONS}
          onChange={(families) => update({ families })}
        />
        <FilterDivider />
        <FilterChips
          icon={Icon.size}
          label="Calibres"
          value={filters.sizes}
          options={SIZE_OPTIONS}
          onChange={(sizes) => update({ sizes })}
        />
        <FilterDivider />
        <FilterRange
          icon={Icon.level}
          label="Niveau d'Éleveur requis"
          value={filters.level}
          onChange={(range) => update({ level: range }, { replace: true })}
        />
        <FilterDivider />
        <FilterToggle
          icon={Icon.best}
          label="Meilleur rendement par jauge"
          checked={filters.bestOnly}
          onChange={(bestOnly) => update({ bestOnly })}
          tip="Une ligne par jauge : le carburant qui rend le plus de points par kama, parmi ceux affichés"
        />
        {isFiltering(filters) && <FilterReset onClick={() => update(NO_FILTERS)} />}
      </FilterBar>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="max-h-[calc(100vh-24rem)] min-h-96 overflow-auto">
          {/* `table-fixed` : les largeurs viennent des en-têtes et ne bougent
              pas d'une ligne à l'autre. Chaque colonne chiffrée est serrée sur
              son contenu ; seule « Ingrédients » n'a pas de largeur, et prend
              tout le reste — c'est elle qui grandit avec l'écran. Le `min-w`
              lui garantit de quoi loger au moins un ingrédient. */}
          <table className="w-full min-w-[86rem] table-fixed text-sm">
            <thead className="bg-slate-900 text-xs text-slate-400">
              <tr>
                <Th width="w-44" icon={Icon.fuel}>
                  Carburant
                </Th>
                <Th
                  width="w-28"
                  icon={Icon.gauge}
                  tip="Jauge remplie. Cliquer pour trier par jauge, puis par niveau."
                  sort={sortControl('gauge')}
                >
                  Catégorie
                </Th>
                <Th
                  width="w-14"
                  align="right"
                  tip="Niveau d'Éleveur requis. Cliquer pour trier par niveau, puis par jauge."
                  sort={sortControl('level')}
                >
                  Niv.
                </Th>
                <Th width="w-36" icon={Icon.price}>
                  Prix HDV
                </Th>
                <Th icon={Icon.recipe}>Ingrédients</Th>
                <Th
                  width="w-24"
                  align="right"
                  icon={Icon.craft}
                  tip="Somme des ingrédients. Vide tant qu'un prix manque."
                >
                  Coût craft
                </Th>
                <Th
                  width="w-28"
                  align="right"
                  tip="Points de jauge obtenus par kama dépensé : plus c'est haut, mieux c'est. Cliquer pour trier."
                  sort={sortControl('ratio')}
                >
                  Points/kama
                </Th>
                <Th
                  width="w-28"
                  align="right"
                  tip="Prix HDV moins coût du craft. Cliquer pour trier."
                  sort={sortControl('margin')}
                >
                  Rentabilité
                </Th>
                <Th width="w-20" align="center">
                  Décision
                </Th>
                <Th width="w-20" align="right" icon={Icon.points} tip="Points de jauge rendus">
                  Points
                </Th>
                <Th width="w-24" align="right" icon={Icon.target} tip="Carburants à consommer">
                  Nb maxer
                </Th>
                <Th
                  width="w-36"
                  align="right"
                  icon={Icon.target}
                  tip="Calculé sur le nombre exact de carburants : le surplus du dernier resservira"
                >
                  Coût maxer
                </Th>
              </tr>
            </thead>

            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-2 py-8 text-center text-sm text-slate-500">
                    Aucun carburant ne passe ces filtres.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <Row
                    key={row.item.id}
                    row={row}
                    best={bestIds.has(row.item.id)}
                    scale={scale}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Icon.best className="size-3.5 shrink-0 text-amber-300" aria-hidden />
          Meilleur rendement de la jauge, parmi les lignes affichées
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-emerald-500/20" aria-hidden />
          Craft rentable, teinte proportionnelle à l'écart
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-rose-500/20" aria-hidden />
          Craft perdant
        </span>
        <span className="flex items-center gap-1.5">
          <Icon.cap className="size-3.5 shrink-0" aria-hidden />
          Plafond de jauge : extrait 40 000, philtre 70 000, potion 90 000, élixir sans limite. La
          jauge se vide en nourrissant les montures : on recharge en boucle, le plafond ne borne
          pas le total.
        </span>
      </p>
    </div>
  )
}

function Row({ row, best, scale }: { row: CarburantRow; best: boolean; scale: number }) {
  const gauge = GAUGE_INFO.get(row.gauge)

  return (
    <tr className={`border-t border-slate-800/60 align-top ${best ? 'bg-amber-500/[0.04]' : ''}`}>
      {/* L'icône et le nom court ne font qu'un seul lien vers la fiche. Le
          nom complet et le plafond vivent dans la bulle. Hors tabulation,
          pour que Tab enchaîne les champs de prix. */}
      <td className="min-w-0 px-2 py-1.5">
        <Tooltip content={`${row.item.name} — ${capLabel(row.cap)}`} className="block min-w-0">
          <Link
            to={`/item/${row.item.id}`}
            tabIndex={-1}
            data-item-name={row.item.name}
            className="flex min-w-0 items-center gap-2 text-slate-300 hover:text-amber-400"
          >
            <ItemIcon item={row.item} size={24} />
            <span className="block truncate">{carburantLabel(row.info)}</span>
          </Link>
        </Tooltip>
      </td>
      <td className="px-2 py-1.5">
        <Tooltip content={gauge?.note} className="flex h-6 cursor-help items-center text-slate-300">
          {gauge?.label ?? row.gauge}
        </Tooltip>
      </td>
      <td className="px-2 py-1.5">
        <span className="flex h-6 items-center justify-end tabular-nums text-slate-400">
          {row.level}
        </span>
      </td>
      <td className="px-2 py-1.5">
        {/* Même structure qu'une ligne d'ingrédient, ligne de nom comprise :
            sans cette cale, le champ monterait d'un cran et les saisies de la
            ligne ne s'aligneraient plus. */}
        <div className="space-y-0.5">
          <span className="block h-4" aria-hidden />
          <PriceField itemId={row.item.id} layout="column" align="left" />
        </div>
      </td>
      {/* De 2 à 5 ingrédients selon la famille. `auto-fill` en range autant
          par ligne que la colonne en loge : un seul sur un petit écran, quatre
          ou cinq sur un grand — la colonne, elle, grandit avec l'écran. */}
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
          best ? 'font-medium text-amber-300' : 'text-slate-300'
        }`}
      >
        {row.pointsPerKama === null ? (
          <span className="flex h-6 items-center justify-end">{NONE}</span>
        ) : (
          <span className="flex h-6 items-center justify-end gap-1">
            {best && (
              <Tooltip content="Meilleur rendement de la jauge">
                <Icon.best className="size-3.5 shrink-0" aria-hidden />
              </Tooltip>
            )}
            {formatRatio(row.pointsPerKama)}
          </span>
        )}
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${
          row.craftMargin === null ? '' : heat(row.craftMargin, scale)
        }`}
      >
        <span className="flex h-6 items-center justify-end">
          <Kamas value={row.craftMargin} signed />
        </span>
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className="flex h-6 items-center justify-center">
          <Decision decision={row.decision} cost={row.unitCost} />
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
        <span className="flex h-6 items-center justify-end">
          {row.points.toLocaleString('fr-FR')}
        </span>
      </td>
      {/* Le nombre de carburants ne dépend que du calibre : il reste affiché
          même sans aucun prix, contrairement au coût. */}
      <td className="px-2 py-1.5">
        <Maxing maxing={row.maxing} render={(step) => step.count.toLocaleString('fr-FR')} />
      </td>
      <td className="px-2 py-1.5">
        <Maxing maxing={row.maxing} render={(step) => <Kamas value={step.cost} />} />
      </td>
    </tr>
  )
}

/**
 * Le coût de craft, et pourquoi il vaut ce qu'il vaut : un chiffrage incomplet
 * s'annonce en orange, et un ingrédient sorti du stock est signalé — sans quoi
 * un coût anormalement bas resterait inexplicable depuis cette page.
 */
function CraftCost({ row }: { row: CarburantRow }) {
  if (row.craft === null) {
    // Rien de saisi encore : un tiret suffit. L'orange est réservé au
    // chiffrage entamé mais incomplet, seul cas où le chiffre tromperait —
    // sinon cent vingt alertes s'allument sur une page vierge.
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

/**
 * Nom de l'ingrédient au-dessus de son prix : deux lignes courtes valent mieux
 * qu'une colonne de 18rem, à douze colonnes.
 */
function Ingredient({ ingredient }: { ingredient: CarburantIngredient }) {
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

/**
 * Pastille ACHAT / CRAFT, qui porte le coût retenu dans sa bulle : une colonne
 * entière pour un chiffre que la décision explique déjà n'en valait pas la
 * peine.
 *
 * L'ambre du craft ne mord pas sur l'emerald des marges.
 */
function Decision({ decision, cost }: { decision: CarburantRow['decision']; cost: number | null }) {
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

/**
 * Un palier par ligne, préfixé de son libellé quand la jauge en compte
 * plusieurs — le cas de la mangeoire, dont l'XP dépend du niveau visé.
 */
function Maxing({
  maxing,
  render,
}: {
  maxing: MaxingEstimate[]
  render: (step: MaxingEstimate) => ReactNode
}) {
  if (maxing.length <= 1) {
    const only = maxing[0]
    return (
      <span className="flex h-6 items-center justify-end tabular-nums text-slate-300">
        {only ? render(only) : NONE}
      </span>
    )
  }

  // Colonnes `auto` et non `1fr` : le libellé reste collé à sa valeur au lieu
  // de s'échouer à l'autre bout de la cellule, et les valeurs s'alignent
  // quand même entre elles.
  return (
    <span className="grid grid-cols-[auto_auto] items-baseline justify-end gap-x-2 gap-y-1 pt-1">
      {maxing.map((step) => (
        <Fragment key={step.target}>
          <span className="whitespace-nowrap text-[10px] text-slate-500">{step.label}</span>
          <span className="text-right tabular-nums text-slate-300">{render(step)}</span>
        </Fragment>
      ))}
    </span>
  )
}
