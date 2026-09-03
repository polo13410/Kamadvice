/**
 * Tableau de bord des carburants d'enclos.
 *
 * Une ligne par extrait, avec les prix — le sien et ceux de ses deux
 * ingrédients — saisissables sur place : tout ce qui en découle (coût de
 * craft, décision, ka/point, coût pour maxer) se recalcule à la frappe.
 *
 * Ni tri ni filtres, volontairement : l'ordre par jauge puis par calibre
 * croissant *est* l'ordre de lecture utile, et trente lignes tiennent à
 * l'écran. Pas de virtualisation non plus, pour la même raison.
 */
import type { LucideIcon } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ItemIcon from '../components/ItemIcon'
import PriceField from '../components/PriceField'
import Kamas from '../components/Kamas'
import { Tooltip } from '../components/Tooltip'
import { GAUGES, SIZE_LABELS } from '../data/carburants'
import { useCatalog } from '../data/catalogContext'
import { useIgnored } from '../data/ignored'
import { usePrices } from '../data/prices'
import {
  buildCarburantGroups,
  missingExtraits,
  type CarburantIngredient,
  type CarburantRow,
  type MaxingEstimate,
} from '../domain/carburant'
import type { ItemId } from '../domain/types'
import { formatKamas, formatRatio } from '../lib/format'
import { Icon } from '../lib/icons'

/** Nombre de colonnes du tableau, pour le `colSpan` des lignes de groupe. */
const COLUMNS = 12

/**
 * Reprise de la carte de chaleur du tableur : plus l'écart est gros, plus la
 * cellule est teintée.
 *
 * Les paliers sont des classes littérales — Tailwind ne génère que ce qu'il lit
 * dans le source, une classe assemblée à la volée n'existerait jamais dans la
 * feuille de style.
 */
const HEAT_GAIN = [
  'bg-emerald-500/10 text-emerald-300',
  'bg-emerald-500/20 text-emerald-200',
  'bg-emerald-500/30 text-emerald-100 font-medium',
] as const
const HEAT_LOSS = [
  'bg-rose-500/10 text-rose-300',
  'bg-rose-500/20 text-rose-200',
  'bg-rose-500/30 text-rose-100 font-medium',
] as const

/** `scale` est le plus gros écart du tableau : une seule légende suffit alors. */
function heat(value: number, scale: number): string {
  const ladder = value >= 0 ? HEAT_GAIN : HEAT_LOSS
  const share = scale <= 0 ? 0 : Math.abs(value) / scale
  return share >= 2 / 3 ? ladder[2] : share >= 1 / 3 ? ladder[1] : ladder[0]
}

const NONE = <span className="tabular-nums text-slate-600">—</span>

/** Libellé de jauge par clé, pour les lignes sorties de leur groupe. */
const GAUGE_LABELS = new Map(GAUGES.map((gauge) => [gauge.key, gauge.label]))

/** Colonnes triables, et le chiffre que chacune compare. */
const SORTABLE = {
  ratio: (row: CarburantRow) => row.pointsPerKama,
  margin: (row: CarburantRow) => row.craftMargin,
} as const

type SortKey = keyof typeof SORTABLE
/** Sur les deux colonnes triables, « avantageux » veut dire « élevé ». */
type SortDir = 'best' | 'worst'
interface Sort {
  key: SortKey
  dir: SortDir
}

export default function CarburantPage() {
  const catalog = useCatalog()
  const prices = usePrices()
  const ignored = useIgnored()

  const groups = useMemo(
    () => buildCarburantGroups(catalog, prices, ignored),
    [catalog, prices, ignored],
  )
  const absent = useMemo(() => missingExtraits(catalog), [catalog])
  const [sort, setSort] = useState<Sort | null>(null)

  const rows = useMemo(() => groups.flatMap((group) => group.rows), [groups])

  /** Meilleur rendement de chaque jauge : le repère survit au tri à plat. */
  const bestIds = useMemo(
    () => new Set(groups.map((group) => group.bestId).filter((id): id is ItemId => id !== null)),
    [groups],
  )

  /** Premier clic : le plus avantageux d'abord. Les suivants basculent le sens. */
  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current?.key === key
        ? { key, dir: current.dir === 'best' ? 'worst' : 'best' }
        : { key, dir: 'best' },
    )

  /**
   * Trier casse le regroupement par jauge : les six sections laissent la place
   * à une liste unique, et chaque ligne rappelle alors sa jauge elle-même.
   */
  const sorted = useMemo(() => {
    if (sort === null) return null
    const value = SORTABLE[sort.key]
    const sign = sort.dir === 'best' ? -1 : 1
    return [...rows].sort((left, right) => {
      // Une ligne sans chiffre ne répond ni au « plus » ni au « moins » : elle
      // reste en bas dans les deux sens.
      const a = value(left)
      const b = value(right)
      if (a === null && b === null) return 0
      if (a === null) return 1
      if (b === null) return -1
      return sign * (a - b)
    })
  }, [rows, sort])

  /**
   * De quoi orienter la saisie : combien de prix sont attendus (les extraits
   * plus leurs ingrédients), combien sont connus, et le plus gros écart du
   * tableau, qui sert d'échelle à la carte de chaleur.
   */
  const { priced, expected, scale } = useMemo(() => {
    const wanted = new Set<number>()
    let widest = 0
    for (const row of rows) {
      wanted.add(row.item.id)
      for (const ingredient of row.ingredients) wanted.add(ingredient.itemId)
      if (row.craftMargin !== null) widest = Math.max(widest, Math.abs(row.craftMargin))
    }
    let known = 0
    for (const id of wanted) if (prices.has(id)) known += 1
    return { priced: known, expected: wanted.size, scale: widest }
  }, [rows, prices])

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
          <Icon.fuel className="size-5 shrink-0 text-amber-400" aria-hidden />
          Carburants d'enclos
        </h1>
        <p className="text-sm text-slate-500">
          Le coût retenu est le moins cher entre l'achat à l'HDV et la fabrication ; les
          points/kama départagent ensuite les calibres d'une même jauge.
        </p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <Icon.item className="size-3.5 shrink-0" aria-hidden />
            {rows.length} extraits
          </span>
          <span className="flex items-center gap-1.5">
            <Icon.price className="size-3.5 shrink-0" aria-hidden />
            {priced} / {expected} prix saisis
          </span>
        </p>
      </header>

      {absent.length > 0 && (
        <p className="flex items-center gap-2 text-sm text-amber-500/80">
          <Icon.warning className="size-4 shrink-0" aria-hidden />
          {absent.length} extrait(s) déclaré(s) mais introuvable(s) au catalogue :{' '}
          {absent.join(', ')}.
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <div className="max-h-[calc(100vh-21rem)] min-h-96 overflow-auto">
          {/* `table-fixed` : sans lui, les lignes de groupe en `colSpan`
              redistribuent les largeurs et plus rien ne s'aligne d'une jauge à
              l'autre. `min-w` garde les colonnes lisibles sur petit écran, au
              prix d'un défilement horizontal. */}
          <table className="w-full min-w-[98rem] table-fixed text-sm">
            <thead className="bg-slate-900 text-xs text-slate-400">
              <tr>
                <Th width="w-16">ID</Th>
                <Th width="w-40" icon={Icon.size}>
                  Calibre
                </Th>
                <Th width="w-40" icon={Icon.price}>
                  Prix HDV
                </Th>
                <Th width="w-40" icon={Icon.recipe}>
                  Ingrédient 1
                </Th>
                <Th width="w-40" icon={Icon.recipe}>
                  Ingrédient 2
                </Th>
                <Th
                  width="w-28"
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
                  sort={{
                    dir: sort?.key === 'ratio' ? sort.dir : null,
                    onToggle: () => toggleSort('ratio'),
                    onReset: () => setSort(null),
                  }}
                >
                  Points/kama
                </Th>
                <Th
                  width="w-32"
                  align="right"
                  tip="Prix HDV moins coût du craft. Cliquer pour trier."
                  sort={{
                    dir: sort?.key === 'margin' ? sort.dir : null,
                    onToggle: () => toggleSort('margin'),
                    onReset: () => setSort(null),
                  }}
                >
                  Rentabilité
                </Th>
                <Th width="w-24" align="center">
                  Décision
                </Th>
                <Th width="w-24" align="right" icon={Icon.points} tip="Points de jauge rendus">
                  Points
                </Th>
                <Th width="w-28" align="right" icon={Icon.target} tip="Extraits à consommer">
                  Nb maxer
                </Th>
                <Th
                  width="w-44"
                  align="right"
                  icon={Icon.target}
                  tip="Calculé sur le nombre exact d'extraits : le surplus du dernier resservira"
                >
                  Coût maxer
                </Th>
              </tr>
            </thead>

            {sorted ? (
              <tbody>
                {sorted.map((row) => (
                  <Row
                    key={row.item.id}
                    row={row}
                    best={bestIds.has(row.item.id)}
                    scale={scale}
                    showGauge
                  />
                ))}
              </tbody>
            ) : (
              groups.map((group) => (
                <tbody key={group.gauge.key}>
                  <tr className="border-t border-slate-800 bg-slate-900/60">
                    <td colSpan={COLUMNS} className="px-2 py-1.5">
                      <span className="flex flex-wrap items-center gap-x-2 text-xs">
                        <Icon.gauge className="size-3.5 shrink-0 text-slate-500" aria-hidden />
                        <span className="font-medium uppercase tracking-wide text-slate-300">
                          {group.gauge.label}
                        </span>
                        <span className="text-slate-500">{group.gauge.note}</span>
                      </span>
                    </td>
                  </tr>

                  {group.rows.map((row) => (
                    <Row
                      key={row.item.id}
                      row={row}
                      best={bestIds.has(row.item.id)}
                      scale={scale}
                    />
                  ))}
                </tbody>
              ))
            )}
          </table>
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Icon.best className="size-3.5 shrink-0 text-amber-300" aria-hidden />
          Meilleur rendement de la jauge
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-emerald-500/20" aria-hidden />
          Craft rentable, teinte proportionnelle à l'écart
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-rose-500/20" aria-hidden />
          Craft perdant
        </span>
      </p>
    </div>
  )
}

function Row({
  row,
  best,
  scale,
  showGauge = false,
}: {
  row: CarburantRow
  best: boolean
  scale: number
  /** Hors regroupement, la jauge n'est plus rappelée en tête de section. */
  showGauge?: boolean
}) {
  // Deux emplacements fixes : toutes les recettes d'extrait tiennent en deux
  // ingrédients. Une recette plus courte laisse la cellule vide plutôt que de
  // décaler les colonnes suivantes.
  const [first, second] = row.ingredients

  return (
    <tr className={`border-t border-slate-800/60 ${best ? 'bg-amber-500/[0.04]' : ''}`}>
      <td className="px-2 py-1.5 tabular-nums text-slate-600">{row.item.id}</td>
      {/* L'icône et le calibre ne font qu'un seul lien vers la fiche. Le nom
          complet de l'extrait n'a plus de colonne : il vit dans la bulle.
          Hors tabulation, pour que Tab enchaîne les champs de prix. */}
      <td className="min-w-0 px-2 py-1.5">
        <Tooltip content={row.item.name} className="block min-w-0">
          <Link
            to={`/item/${row.item.id}`}
            tabIndex={-1}
            className="flex min-w-0 items-center gap-2 text-slate-300 hover:text-amber-400"
          >
            <ItemIcon item={row.item} size={24} />
            <span className="min-w-0">
              <span className="block truncate">{SIZE_LABELS[row.info.size]}</span>
              {showGauge && (
                <span className="block truncate text-[10px] text-slate-500">
                  {GAUGE_LABELS.get(row.info.gauge)}
                </span>
              )}
            </span>
          </Link>
        </Tooltip>
      </td>
      <td className="px-2 py-1.5">
        {/* Même structure qu'une cellule d'ingrédient, ligne de nom comprise :
            sans cette cale, le champ monterait d'un cran et les trois saisies
            de la ligne ne s'aligneraient plus. */}
        <div className="space-y-0.5">
          <span className="block h-4" aria-hidden />
          <PriceField itemId={row.item.id} layout="column" align="left" />
        </div>
      </td>
      <td className="min-w-0 px-2 py-1.5">
        <Ingredient ingredient={first} />
      </td>
      <td className="min-w-0 px-2 py-1.5">
        <Ingredient ingredient={second} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
        <CraftCost row={row} />
      </td>
      <td
        className={`px-2 py-1.5 text-right tabular-nums ${
          best ? 'font-medium text-amber-300' : 'text-slate-300'
        }`}
      >
        {row.pointsPerKama === null ? (
          NONE
        ) : (
          <span className="flex items-center justify-end gap-1">
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
        <Kamas value={row.craftMargin} signed />
      </td>
      <td className="px-2 py-1.5 text-center">
        <Decision decision={row.decision} cost={row.unitCost} />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">
        {row.points.toLocaleString('fr-FR')}
      </td>
      {/* Le nombre d'extraits ne dépend que du calibre : il reste affiché même
          sans aucun prix, contrairement au coût. */}
      <td className="px-2 py-1.5 align-middle">
        <Maxing maxing={row.maxing} render={(step) => step.count.toLocaleString('fr-FR')} />
      </td>
      <td className="px-2 py-1.5 align-middle">
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
    // sinon trente alertes s'allument sur une page vierge.
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
 * qu'une colonne de 18rem, à quinze colonnes.
 */
function Ingredient({ ingredient }: { ingredient: CarburantIngredient | undefined }) {
  if (!ingredient) return NONE

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
      <span className="block text-right tabular-nums text-slate-300">
        {only ? render(only) : NONE}
      </span>
    )
  }

  // Colonnes `auto` et non `1fr` : le libellé reste collé à sa valeur au lieu
  // de s'échouer à l'autre bout de la cellule, et les valeurs s'alignent
  // quand même entre elles.
  return (
    <span className="grid grid-cols-[auto_auto] items-baseline justify-end gap-x-2 gap-y-1">
      {maxing.map((step) => (
        <Fragment key={step.target}>
          <span className="whitespace-nowrap text-[10px] text-slate-500">{step.label}</span>
          <span className="text-right tabular-nums text-slate-300">{render(step)}</span>
        </Fragment>
      ))}
    </span>
  )
}

const TEXT_ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

const JUSTIFY = {
  left: '',
  right: 'justify-end',
  center: 'justify-center',
} as const

/**
 * `sticky` sur les `th` plutôt que sur `thead` : avec `border-collapse`, seule
 * la cellule se fige. La bordure du bas passe en ombre interne, une bordure
 * fusionnée ne suivant pas la cellule collée.
 */
const TH_SHELL =
  'sticky top-0 z-10 bg-slate-900 px-2 py-2 font-medium shadow-[inset_0_-1px_0_var(--color-slate-800)]'

/**
 * En-tête de colonne : icône facultative, bulle facultative pour la formule, et
 * commande de tri facultative.
 */
function Th({
  width = '',
  align = 'left',
  icon: Glyph,
  tip,
  sort,
  children,
}: {
  width?: string
  align?: keyof typeof TEXT_ALIGN
  icon?: LucideIcon
  tip?: string
  /** Rend l'en-tête cliquable. `dir` est `null` quand le tri porte ailleurs. */
  sort?: {
    dir: SortDir | null
    onToggle: () => void
    onReset: () => void
  }
  children: ReactNode
}) {
  const inner = (
    <>
      {Glyph && <Glyph className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </>
  )
  const line = `flex items-center gap-1.5 whitespace-nowrap ${JUSTIFY[align]}`

  if (sort) {
    // La flèche pointe vers le bas quand les plus avantageux sont en tête.
    const Arrow = sort.dir === 'worst' ? Icon.sortAsc : Icon.sortDesc
    return (
      <th
        aria-sort={sort.dir === 'best' ? 'descending' : sort.dir === 'worst' ? 'ascending' : 'none'}
        className={TH_SHELL + ` ${width} ${TEXT_ALIGN[align]}`}
      >
        <span className={`flex items-center gap-1 ${JUSTIFY[align]}`}>
          {sort.dir && (
            <Tooltip content="Annuler le tri et revenir au classement par jauge">
              <button
                type="button"
                onClick={sort.onReset}
                aria-label="Annuler le tri"
                className="flex text-slate-500 hover:text-amber-400"
              >
                <Icon.sortReset className="size-3" aria-hidden />
              </button>
            </Tooltip>
          )}
          <Tooltip content={tip}>
            <button
              type="button"
              onClick={sort.onToggle}
              className={`${line} hover:text-amber-400 ${sort.dir ? 'text-amber-400' : ''}`}
            >
              {inner}
              <Arrow
                className={`size-3 shrink-0 ${sort.dir ? '' : 'text-slate-600'}`}
                aria-hidden
              />
            </button>
          </Tooltip>
        </span>
      </th>
    )
  }

  return (
    <th className={TH_SHELL + ` ${width} ${TEXT_ALIGN[align]}`}>
      {tip ? (
        <Tooltip content={tip} className={`${line} cursor-help`}>
          {inner}
        </Tooltip>
      ) : (
        <span className={line}>{inner}</span>
      )}
    </th>
  )
}
