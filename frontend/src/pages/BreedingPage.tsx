/**
 * Le planificateur d'élevage : choisir une monture à obtenir, retrouver les
 * plans en cours, et tenir l'étable qu'ils partagent.
 *
 * Un plan se crée d'ici ou depuis la fiche d'une monture ; il vit ensuite sur
 * sa propre page. L'étable est ici au complet, toutes espèces confondues :
 * c'est l'endroit où l'on déclare ce qu'on a avant même de savoir pour quoi.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Adorned, { CONTROL } from '../components/Adorned'
import DashboardHeader from '../components/DashboardHeader'
import ItemIcon from '../components/ItemIcon'
import { GenerationBadge, VarietySelect } from '../components/MountVariety'
import StablePanel from '../components/StablePanel'
import { useCatalog } from '../data/catalogContext'
import { useStable } from '../data/inventory'
import { SPECIES, SPECIES_INFO, varietyName } from '../data/mounts'
import { createPlan, removePlan, usePlans } from '../data/plans'
import { evaluatePlan, type Plan, type StableMount } from '../domain/breeding'
import type { Species, VarietyId } from '../domain/types'
import { formatRelativeDate } from '../lib/format'
import { Icon } from '../lib/icons'
import { planPath } from '../lib/pages'

export default function BreedingPage() {
  const catalog = useCatalog()
  const plans = usePlans()
  const stable = useStable()
  const navigate = useNavigate()
  const [species, setSpecies] = useState<Species>('dragodinde')
  const [target, setTarget] = useState<VarietyId | null>(null)

  /** Ce qui se planifie : une variété qui s'obtient par croisement. */
  const options = useMemo(
    () =>
      catalog.mounts.varieties.filter(
        (variety) => variety.species === species && variety.recipes.length > 0,
      ),
    [catalog.mounts, species],
  )

  const chosen = target === null ? undefined : catalog.mounts.byId.get(target)

  return (
    <div className="space-y-6">
      <DashboardHeader
        icon={Icon.breeding}
        title="Élevage"
        description="Choisissez la monture à obtenir : le plan se déroule sur votre étable, suggère la prochaine action et se recalcule à chaque accouplement ou clonage. Plans et étable restent dans ce navigateur."
        stats={[
          { icon: Icon.plan, label: `${plans.length} plan${plans.length > 1 ? 's' : ''}` },
          { icon: Icon.mount, label: `${stable.length} monture${stable.length > 1 ? 's' : ''} à l’étable` },
        ]}
      />

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (chosen) navigate(planPath(createPlan(chosen.id)))
        }}
      >
        <div className="flex items-center gap-1.5" role="group" aria-label="Espèce">
          <Icon.mount className="mr-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden />
          {SPECIES.map((entry) => {
            const active = entry.key === species
            return (
              <button
                key={entry.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSpecies(entry.key)
                  setTarget(null)
                }}
                className={`flex h-7 items-center rounded-full border px-2.5 text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                {entry.plural}
              </button>
            )
          })}
        </div>
        <Adorned icon={Icon.target}>
          <VarietySelect
            value={target}
            options={options}
            onChange={setTarget}
            placeholder="Monture à obtenir…"
            ariaLabel="Monture à obtenir"
            className={`${CONTROL} min-w-64`}
          />
        </Adorned>
        <button
          type="submit"
          disabled={!chosen}
          className="flex h-9 items-center gap-1.5 rounded border border-amber-500/60 bg-amber-500/10 px-3 text-sm text-amber-300 hover:bg-amber-500/20 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon.add className="size-4" aria-hidden />
          Créer le plan
        </button>
        {chosen && (
          <Link to={`/item/${chosen.id}`} className="text-xs text-slate-500 hover:text-amber-400">
            Voir la fiche de {varietyName(chosen)}
          </Link>
        )}
      </form>

      {plans.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
          Aucun plan pour l’instant. Choisissez une monture ci-dessus, ou cliquez « Planifier cet
          élevage » sur la fiche d’une dragodinde, d’un muldo ou d’un volkorne.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} stable={stable} />
          ))}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
          <Icon.mount className="size-4 shrink-0" aria-hidden />
          Étable
        </h2>
        <p className="text-xs text-slate-500">
          Toutes vos montures, partagées par tous les plans. Un accouplement ou un clonage enregistré
          depuis un plan la met à jour.
        </p>
        <StablePanel mounts={stable} />
      </section>
    </div>
  )
}

function PlanCard({ plan, stable }: { plan: Plan; stable: readonly StableMount[] }) {
  const catalog = useCatalog()
  const [confirming, setConfirming] = useState(false)
  const variety = catalog.mounts.byId.get(plan.target)
  const item = variety && catalog.byId.get(variety.id)

  const summary = useMemo(() => {
    if (!variety) return null
    try {
      const evaluation = evaluatePlan(catalog.mounts, plan, stable)
      return { crosses: evaluation.crosses.length, done: evaluation.done, suggestion: evaluation.suggestion.kind }
    } catch {
      return null
    }
  }, [catalog.mounts, plan, stable, variety])

  if (!variety) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">
        Plan vers une variété inconnue (#{plan.target}).
        <button type="button" onClick={() => removePlan(plan.id)} className="ml-2 text-rose-400 hover:text-rose-300">
          Supprimer
        </button>
      </div>
    )
  }

  return (
    <div className="group relative flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 hover:bg-slate-900">
      <Link to={planPath(plan.id)} className="flex min-w-0 flex-1 items-start gap-3">
        {item ? <ItemIcon item={item} size={40} /> : <Icon.mount className="size-10 shrink-0 text-slate-600" aria-hidden />}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium text-slate-200 group-hover:text-amber-400">
            <span className="truncate">{varietyName(variety)}</span>
            <GenerationBadge generation={variety.generation} />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            {summary && (
              <span className="flex items-center gap-1">
                <Icon.cross className="size-3" aria-hidden />
                {summary.done ? 'cible obtenue' : `${summary.crosses} croisement${summary.crosses > 1 ? 's' : ''} restant${summary.crosses > 1 ? 's' : ''}`}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Icon.history className="size-3" aria-hidden />
              {formatRelativeDate(plan.updatedAt)}
            </span>
          </span>
          <span className="mt-1 block text-[10px] text-slate-600">{SPECIES_INFO.get(variety.species)?.label}</span>
        </span>
      </Link>
      {confirming ? (
        <span className="flex shrink-0 flex-col gap-1 text-xs">
          <button type="button" onClick={() => removePlan(plan.id)} className="text-rose-400 hover:text-rose-300">
            Confirmer
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-slate-500 hover:text-slate-300">
            Annuler
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} aria-label="Supprimer ce plan" className="shrink-0 text-slate-600 hover:text-rose-400">
          <Icon.delete className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
