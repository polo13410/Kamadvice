/**
 * Un plan d'élevage : tout ce qu'il faut pour obtenir la monture visée, et où
 * on en est.
 *
 * De haut en bas : les réglages qui font les chiffres (niveau visé, points de
 * mangeoire, Optimakina, Reproducteur), la probabilité du croisement final et
 * le nombre de tentatives à prévoir, le coût, les montures de départ, puis
 * les croisements dans l'ordre — chacun dépliable pour renseigner ses deux
 * parents et son bébé — et enfin l'arbre complet, repliable.
 *
 * Tout se recalcule à la saisie, depuis `domain/breeding.ts`. La page ne
 * garde aucun état propre : ce qu'elle montre sort du plan sauvegardé et des
 * prix courants.
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FIELD_NUMBER } from '../components/Adorned'
import BreedingTree, {
  SexGlyph,
  StateBadge,
  StatusBadge,
} from '../components/BreedingTree'
import DashboardHeader from '../components/DashboardHeader'
import { FilterBar, FilterDivider, FilterToggle } from '../components/FilterBar'
import ItemIcon from '../components/ItemIcon'
import Kamas from '../components/Kamas'
import MountSlotEditor from '../components/MountSlotEditor'
import VarietyLink from '../components/MountVariety'
import NotFound from '../components/NotFound'
import PriceField from '../components/PriceField'
import Th from '../components/TableHead'
import { Tooltip } from '../components/Tooltip'
import { useCatalog } from '../data/catalogContext'
import { useIgnored } from '../data/ignored'
import { varietyName } from '../data/mounts'
import { chooseRecipe, removePlan, updateSettings, usePlan } from '../data/plans'
import { usePrices } from '../data/prices'
import {
  estimateCost,
  evaluatePlan,
  multiplicities,
  varietyPrice,
  type Cross,
  type Plan,
  type Slot,
} from '../domain/breeding'
import type { Catalog } from '../domain/types'
import { formatAttempts, formatChance, formatKamas } from '../lib/format'
import { Icon } from '../lib/icons'
import { BREEDING_PATH, DASHBOARDS } from '../lib/pages'

const NONE = <span className="tabular-nums text-slate-600">—</span>

export default function PlanPage() {
  const { planId } = useParams()
  const plan = usePlan(planId)
  const catalog = useCatalog()
  const variety = plan && catalog.mounts.byId.get(plan.target)

  if (!plan || !variety) {
    return (
      <NotFound
        code="404"
        glyph={Icon.notFound}
        title="Plan introuvable"
        message="Ce plan n’est pas dans ce navigateur : les plans d’élevage ne se partagent pas encore d’une machine à l’autre."
        detail={planId}
        exits={[
          {
            to: BREEDING_PATH,
            label: 'Élevage',
            description: 'Mes plans, et en créer un',
            icon: Icon.breeding,
          },
        ]}
      />
    )
  }

  return <PlanDashboard key={plan.id} plan={plan} catalog={catalog} />
}

function PlanDashboard({ plan, catalog }: { plan: Plan; catalog: Catalog }) {
  const prices = usePrices()
  const ignored = useIgnored()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const target = catalog.mounts.byId.get(plan.target)!
  const targetItem = catalog.byId.get(target.id)

  const evaluation = useMemo(() => evaluatePlan(catalog.mounts, plan), [catalog.mounts, plan])
  const counts = useMemo(() => multiplicities(evaluation.root), [evaluation])
  const cost = useMemo(
    () => estimateCost(catalog, evaluation, plan.settings, prices, ignored),
    [catalog, evaluation, plan.settings, prices, ignored],
  )
  const final = evaluation.root.cross

  const settings = plan.settings
  const set = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(plan.id, patch)

  return (
    <div className="space-y-6">
      <DashboardHeader
        icon={Icon.breeding}
        glyph={targetItem ? <ItemIcon item={targetItem} size={40} /> : undefined}
        title={varietyName(target)}
        description={
          <>
            <Link to={BREEDING_PATH} className="text-slate-400 hover:text-amber-400">
              Élevage
            </Link>
            {' › '}Génération {target.generation}. Les chances sont celles de la génération cible ;
            le coût est chiffré de zéro, tentatives et parents stériles compris.
          </>
        }
        stats={[
          {
            icon: Icon.cross,
            label: `${evaluation.done} / ${evaluation.crosses.length} croisements faits`,
          },
          ...(evaluation.blocked > 0
            ? [
                {
                  icon: Icon.stepBlocked,
                  label: (
                    <span className="text-rose-400">
                      {evaluation.blocked} bloqué{evaluation.blocked > 1 ? 's' : ''}
                    </span>
                  ),
                },
              ]
            : []),
          {
            icon: Icon.cost,
            label: cost.complete ? (
              <Kamas value={cost.mean} />
            ) : (
              <span className="text-amber-500/80">coût incomplet</span>
            ),
          },
        ]}
      >
        <Link to={`/item/${target.id}`} className="text-xs text-slate-500 hover:text-amber-400">
          Fiche de la monture
        </Link>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                removePlan(plan.id)
                navigate(BREEDING_PATH)
              }}
              className="text-rose-400 hover:text-rose-300"
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-400"
          >
            <Icon.delete className="size-3.5" aria-hidden />
            Supprimer
          </button>
        )}
      </DashboardHeader>

      {/* Les réglages : ce que les chiffres supposent de chaque parent. */}
      <FilterBar>
        <Tooltip content="Niveau auquel chaque parent est monté avant de reproduire : +0,15 % de chance par niveau">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.level className="size-4" aria-hidden />
            Niveau visé
            <input
              type="number"
              min={1}
              max={200}
              value={settings.targetLevel}
              onChange={(event) => {
                const level = Number(event.target.value)
                if (Number.isInteger(level) && level >= 1 && level <= 200) set({ targetLevel: level })
              }}
              className={`${FIELD_NUMBER} w-20`}
            />
          </label>
        </Tooltip>
        <FilterDivider />
        <Tooltip content="Points de mangeoire versés à chaque parent pour atteindre ce niveau : 20 000 mènent vers le niveau 39">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.gauge className="size-4" aria-hidden />
            Mangeoire
            <input
              inputMode="numeric"
              value={settings.feedPoints.toLocaleString('fr-FR')}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '')
                set({ feedPoints: digits === '' ? 0 : Number(digits) })
              }}
              className={`${FIELD_NUMBER} w-28`}
            />
            <span className="text-xs text-slate-600">pts</span>
          </label>
        </Tooltip>
        <FilterDivider />
        <FilterToggle
          icon={Icon.wizard}
          label="Optimakina"
          checked={settings.optimakina}
          onChange={(optimakina) => set({ optimakina })}
          tip="Une Optimakina à chaque croisement : +10 % de chance, et son prix dans le coût"
        />
        <FilterDivider />
        <FilterToggle
          icon={Icon.baby}
          label="Reproducteur"
          checked={settings.reproducteur}
          onChange={(reproducteur) => set({ reproducteur })}
          tip="Un parent à la capacité Reproducteur donne deux bébés par portée : deux chances par tentative, supposées indépendantes"
        />
      </FilterBar>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={Icon.chance} title="Probabilité et tentatives">
          {final ? <Odds cross={final} cost={cost} /> : <p className="text-sm text-slate-500">Rien à croiser.</p>}
        </Section>

        <Section icon={Icon.cost} title="Coût estimé">
          <Costs cost={cost} />
        </Section>
      </div>

      <Section
        icon={Icon.mount}
        title="Montures de départ"
        note="Celles qu’aucun croisement du plan ne produit : générations 1, ou emplacements où vous avez déjà la monture."
      >
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs text-slate-400">
              <tr>
                <Th icon={Icon.mount}>Variété</Th>
                <Th width="w-24" align="right" tip="Emplacements à pourvoir, tout réussissant du premier coup">
                  Minimum
                </Th>
                <Th width="w-24" align="right" tip="En moyenne, tentatives et parents stériles compris">
                  Attendu
                </Th>
                <Th width="w-24" align="right">
                  Possédées
                </Th>
                <Th width="w-64" icon={Icon.price}>
                  Prix HDV
                </Th>
              </tr>
            </thead>
            <tbody>
              {evaluation.starting.map((entry) => {
                const { item } = varietyPrice(catalog, prices, entry.variety)
                return (
                  <tr key={entry.variety.id} className="border-t border-slate-800/60">
                    <td className="px-2 py-1.5">
                      <VarietyLink variety={entry.variety} full />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{entry.minimum}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">
                      {Math.ceil(entry.expected).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{entry.owned}</td>
                    <td className="px-2 py-1.5">
                      {item ? <PriceField itemId={item.id} align="left" /> : NONE}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        icon={Icon.cross}
        title="Croisements, dans l’ordre"
        note="Chaque étape se déplie pour renseigner ses deux parents et son bébé. Un parent qui a reproduit est stérile : une nouvelle tentative demande un couple neuf, ou un clone."
      >
        <ol className="space-y-2">
          {evaluation.crosses.map((cross) => (
            <Step key={cross.path} planId={plan.id} cross={cross} counts={counts} />
          ))}
        </ol>
      </Section>

      <Section
        icon={Icon.genealogy}
        title="Parcours détaillé"
        note="L’arbre entier, repliable : la cible en haut, les montures de départ tout en bas."
      >
        <BreedingTree root={evaluation.root} multiplicities={counts} />
      </Section>
    </div>
  )
}

function Section({
  icon: Glyph,
  title,
  note,
  children,
}: {
  icon: typeof Icon.cross
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
        <Glyph className="size-4 shrink-0" aria-hidden />
        {title}
      </h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {children}
    </section>
  )
}

/** Le croisement final : sa chance, ce qu'il peut donner, et combien de fois il faudra le tenter. */
function Odds({ cross, cost }: { cross: Cross; cost: ReturnType<typeof estimateCost> }) {
  const [a, b] = cross.parents
  return (
    <div className="space-y-3 rounded-lg border border-slate-800 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-slate-100">
          {formatChance(cross.chance)}
        </span>
        <span className="text-xs text-slate-500">
          d’obtenir la génération {cross.child.variety.generation} par bébé
          {cross.chanceFromMounts
            ? ` — niveaux ${a.mount?.level ?? '?'} + ${b.mount?.level ?? '?'} des montures en place`
            : ' — au niveau visé pour les deux parents'}
          {cross.attemptChance !== cross.chance && (
            <>, soit {formatChance(cross.attemptChance)} par portée de deux</>
          )}
        </span>
      </div>

      {cross.exact ? (
        <p className="text-xs text-slate-400">
          <Icon.done className="mr-1 inline size-3.5 align-text-bottom text-emerald-400" aria-hidden />
          D’après les ancêtres renseignés, {varietyName(cross.child.variety)} est la seule variété de
          génération {cross.child.variety.generation} possible : cette probabilité est aussi celle de
          la variété.
        </p>
      ) : (
        <div className="space-y-1 text-xs">
          <p className="text-amber-500/80">
            <Icon.warning className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
            Probabilité exacte de cette variété inconnue : d’après les ancêtres renseignés,{' '}
            {cross.possibleTargets.length} variétés de génération {cross.child.variety.generation}{' '}
            peuvent naître, et le jeu ne publie pas leur répartition.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {cross.possibleTargets.map((candidate) => (
              <li key={candidate.id}>
                <VarietyLink
                  variety={candidate}
                  className={candidate.id === cross.child.variety.id ? 'text-amber-300' : 'text-slate-400'}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 text-left font-medium">Objectif</th>
            <th className="py-1 text-right font-medium">Tentatives</th>
            <th className="py-1 text-right font-medium">Coût</th>
          </tr>
        </thead>
        <tbody className="text-slate-300">
          <tr className="border-t border-slate-800/60">
            <td className="py-1">En moyenne</td>
            <td className="py-1 text-right tabular-nums">{formatAttempts(cost.meanAttempts)}</td>
            <td className="py-1 text-right">
              <Kamas value={cost.complete ? cost.mean : null} />
            </td>
          </tr>
          {cost.thresholds.map((threshold) => (
            <tr key={threshold.confidence} className="border-t border-slate-800/60">
              <td className="py-1">{formatChance(threshold.confidence)} de chances</td>
              <td className="py-1 text-right tabular-nums">{formatAttempts(threshold.attempts)}</td>
              <td className="py-1 text-right">
                <Kamas value={cost.complete ? threshold.cost : null} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-600">
        Chaque tentative demande un couple fécond neuf : son coût ({formatKamas(cost.perAttempt)} kamas
        {cost.complete ? '' : ', incomplet'}) comprend les deux parents — élevés ou achetés, en
        moyenne —, leur préparation et l’Optimakina éventuelle. Le sexe d’un bébé est aléatoire et
        n’entre pas dans ces chiffres.
      </p>
    </div>
  )
}

function Costs({ cost }: { cost: ReturnType<typeof estimateCost> }) {
  const fuelMissing = cost.missing.some((line) => line.startsWith('Aucun carburant'))
  return (
    <div className="space-y-3 rounded-lg border border-slate-800 p-3 text-sm">
      <table className="w-full text-xs">
        <tbody className="text-slate-300">
          {cost.lines.map((line) => (
            <tr key={line.label} className="border-b border-slate-800/60">
              <td className="py-1.5">
                {line.label}
                <span className="block text-[11px] text-slate-600">{line.detail}</span>
              </td>
              <td className="py-1.5 text-right align-top">
                {line.amount === null ? (
                  <span className="text-amber-500/80">incomplet</span>
                ) : (
                  <Kamas value={line.amount} />
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td className="py-1.5 font-medium text-slate-200">Total moyen</td>
            <td className="py-1.5 text-right text-base font-medium text-slate-100">
              {cost.complete ? (
                <Kamas value={cost.mean} />
              ) : (
                <span className="text-sm text-amber-500/80">incomplet</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span>Préparation d’un parent : mangeoire {formatKamas(cost.feedPerMount)}, fécondité {formatKamas(cost.fertilityPerMount)} kamas.</span>
        {cost.optimakina && <span>Optimakina retenue : {cost.optimakina.name}.</span>}
      </div>

      {!cost.complete && (
        <div className="space-y-2 text-xs">
          <p className="flex items-center gap-2 text-amber-500/80">
            <Icon.warning className="size-4 shrink-0" aria-hidden />
            Coût incomplet : {cost.missing.length} manque{cost.missing.length > 1 ? 's' : ''}.
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-slate-500">
            {cost.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {fuelMissing && (
            <p className="text-slate-500">
              Les carburants se relèvent sur le{' '}
              <Link to={DASHBOARDS[0]!.to} className="text-amber-400 hover:text-amber-300">
                tableau de bord des carburants
              </Link>
              .
            </p>
          )}
          {cost.unpriced.length > 0 && (
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-[1fr_auto]">
              {cost.unpriced.map((item) => (
                <Fragment key={item.id}>
                  <Link
                    to={`/item/${item.id}`}
                    data-item-name={item.name}
                    className="flex min-w-0 items-center gap-2 text-slate-300 hover:text-amber-400"
                  >
                    <ItemIcon item={item} size={20} />
                    <span className="truncate">{item.name}</span>
                  </Link>
                  <PriceField itemId={item.id} />
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Une étape du plan, dépliable : ses deux parents et son bébé. */
function Step({
  planId,
  cross,
  counts,
}: {
  planId: string
  cross: Cross
  counts: ReadonlyMap<string, number>
}) {
  const [a, b] = cross.parents
  const expected = counts.get(cross.path) ?? 1
  const tries = expected / cross.attemptChance

  return (
    <li className="rounded-lg border border-slate-800">
      <details className="group" open={cross.state !== 'done'}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <Icon.next
            className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{cross.step}.</span>
          <StateBadge state={cross.state} />
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <ParentSummary slot={a} />
            <span className="text-slate-600">+</span>
            <ParentSummary slot={b} />
            <span className="text-slate-600">→</span>
            <VarietyLink variety={cross.child.variety} />
            <StatusBadge status={cross.child.status} />
          </span>
          <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
            <Tooltip
              content={
                cross.chanceFromMounts
                  ? 'Chance de la génération cible, sur les niveaux des montures en place'
                  : 'Chance de la génération cible, au niveau visé du plan'
              }
              className="flex cursor-help items-center gap-1 tabular-nums"
            >
              <Icon.chance className="size-3.5" aria-hidden />
              {formatChance(cross.chance)}
            </Tooltip>
            <Tooltip
              content="Tentatives attendues pour cette étape, sur l’ensemble du plan"
              className="flex cursor-help items-center gap-1 tabular-nums"
            >
              <Icon.attempts className="size-3.5" aria-hidden />
              {formatAttempts(Math.round(tries * 10) / 10)}
            </Tooltip>
          </span>
        </summary>

        <div className="space-y-3 border-t border-slate-800/60 px-3 py-3">
          {cross.issues.length > 0 && (
            <ul className="space-y-1 text-xs text-rose-400">
              {cross.issues.map((issue, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Icon.stepBlocked className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          {cross.recipeCount > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Icon.recipe className="size-3.5" aria-hidden />
              Recette
              <RecipeSelect planId={planId} cross={cross} />
              <span className="text-slate-600">
                changer de recette oublie les montures saisies en dessous
              </span>
            </label>
          )}

          {!cross.exact && (
            <p className="text-xs text-amber-500/80">
              <Icon.warning className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
              D’après les ancêtres renseignés, {cross.possibleTargets.length} variétés de génération{' '}
              {cross.child.variety.generation} peuvent naître :{' '}
              {cross.possibleTargets.map((candidate) => candidate.name).join(', ')}. Probabilité
              exacte de {cross.child.variety.name} inconnue.
            </p>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <ParentCard slot={a} planId={planId} />
            <ParentCard slot={b} planId={planId} />
          </div>

          <div className="rounded border border-slate-800/80 bg-slate-900/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Icon.baby className="size-3.5" aria-hidden />
              Bébé attendu
              <VarietyLink variety={cross.child.variety} />
            </div>
            <MountSlotEditor planId={planId} slot={cross.child} />
          </div>
        </div>
      </details>
    </li>
  )
}

function ParentSummary({ slot }: { slot: Slot }) {
  return (
    <span className="flex items-center gap-1.5">
      <VarietyLink variety={slot.variety} />
      {slot.mount && <SexGlyph sex={slot.mount.sex} className="size-3" />}
      <StatusBadge status={slot.status} />
    </span>
  )
}

function ParentCard({ slot, planId }: { slot: Slot; planId: string }) {
  return (
    <div className="rounded border border-slate-800/80 bg-slate-900/40 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <Icon.mount className="size-3.5" aria-hidden />
        Parent
        <VarietyLink variety={slot.variety} />
        {slot.cross ? (
          <span className="text-slate-600">— née de l’étape {slot.cross.step}</span>
        ) : (
          <span className="text-slate-600">— monture de départ</span>
        )}
      </div>
      <MountSlotEditor planId={planId} slot={slot} />
    </div>
  )
}

function RecipeSelect({ planId, cross }: { planId: string; cross: Cross }) {
  const catalog = useCatalog()
  return (
    <select
      value={cross.recipeIndex}
      onChange={(event) => chooseRecipe(planId, cross.path, Number(event.target.value))}
      className="h-7 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
    >
      {cross.child.variety.recipes.map(([first, second], index) => (
        <option key={index} value={index}>
          {index + 1}. {catalog.mounts.byId.get(first)?.name ?? first} +{' '}
          {catalog.mounts.byId.get(second)?.name ?? second}
        </option>
      ))}
    </select>
  )
}
