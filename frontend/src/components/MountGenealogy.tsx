/**
 * La généalogie d'une monture, sur sa fiche d'item : ses parents, la
 * décomposition jusqu'aux générations 1, et ce qu'elle permet d'obtenir —
 * le pendant de « Recette » et « Permet de crafter » pour les montures.
 *
 * Tout ici est la **recette théorique** de la variété. L'arbre *réel* d'une
 * monture possédée — ses vrais parents et grands-parents — se renseigne dans
 * un plan d'élevage, où il compte.
 */
import type { ReactNode } from 'react'
import { Fragment, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCatalog } from '../data/catalogContext'
import { DEFAULT_SETTINGS, SPECIES_INFO, varietyName } from '../data/mounts'
import { createPlan, usePlans } from '../data/plans'
import { captures, evaluatePlan, generationChance, theoreticalPlan } from '../domain/breeding'
import type { Item, MountVariety } from '../domain/types'
import { formatChance } from '../lib/format'
import { Icon } from '../lib/icons'
import { BREEDING_PATH, planPath } from '../lib/pages'
import { BUTTON } from './Adorned'
import BreedingTree from './BreedingTree'
import VarietyLink, { GenerationBadge } from './MountVariety'

export default function MountGenealogy({ item }: { item: Item }) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const plans = usePlans()
  const variety = catalog.mounts.byItemId.get(item.id)

  const evaluation = useMemo(
    () =>
      variety && variety.recipes.length > 0
        ? evaluatePlan(catalog.mounts, theoreticalPlan(variety.id, DEFAULT_SETTINGS), [])
        : null,
    [catalog.mounts, variety],
  )

  if (!variety) return null

  const species = SPECIES_INFO.get(variety.species)
  const children = (catalog.mounts.childrenOf.get(variety.id) ?? [])
    .map((entry) => ({
      child: catalog.mounts.byId.get(entry.child),
      partner: catalog.mounts.byId.get(entry.partner),
    }))
    .filter(
      (entry): entry is { child: MountVariety; partner: MountVariety } =>
        entry.child !== undefined && entry.partner !== undefined,
    )
    .sort(
      (a, b) =>
        a.child.generation - b.child.generation || a.child.name.localeCompare(b.child.name, 'fr'),
    )
  const existing = plans.filter((plan) => plan.target === variety.id)
  const isCertificate = item.id !== variety.id
  const chance = generationChance(DEFAULT_SETTINGS.targetLevel, DEFAULT_SETTINGS.targetLevel, false)

  return (
    <section className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
        <Icon.genealogy className="size-4 shrink-0" aria-hidden />
        Généalogie
        <span className="flex items-center gap-2 font-normal normal-case tracking-normal text-slate-600">
          {species?.label} · <GenerationBadge generation={variety.generation} />
        </span>
        {isCertificate && (
          <span className="font-normal normal-case tracking-normal text-slate-600">
            · certificat de la{' '}
            <Link to={`/item/${variety.id}`} className="text-slate-400 hover:text-amber-400">
              monture
            </Link>
          </span>
        )}
      </h2>

      <p className="text-sm text-slate-500">
        Recette théorique de la variété. L’arbre réel d’une monture que vous possédez — ses vrais
        parents et grands-parents — se renseigne dans un{' '}
        <Link to={BREEDING_PATH} className="text-slate-400 hover:text-amber-400">
          plan d’élevage
        </Link>
        .
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon={Icon.cross} title="Parents nécessaires">
          {variety.recipes.length === 0 ? (
            <p className="text-sm text-slate-500">
              {variety.generation === 1
                ? 'Génération 1 : se capture à l’état sauvage ou s’achète, sans croisement.'
                : 'Cette monture ne s’obtient pas par croisement.'}
            </p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {variety.recipes.map(([a, b], index) => {
                const first = catalog.mounts.byId.get(a)
                const second = catalog.mounts.byId.get(b)
                if (!first || !second) return null
                return (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    {variety.recipes.length > 1 && (
                      <span className="w-16 shrink-0 text-xs text-slate-600">Recette {index + 1}</span>
                    )}
                    <VarietyLink variety={first} />
                    <span className="text-slate-600">+</span>
                    <VarietyLink variety={second} />
                  </li>
                )
              })}
              <li className="pt-1 text-xs text-slate-500">
                Un mâle et une femelle, de ces deux variétés. Chance de la génération {variety.generation}{' '}
                à deux parents niveau {DEFAULT_SETTINGS.targetLevel} : {formatChance(chance)}.
              </li>
            </ul>
          )}
        </Panel>

        <Panel
          icon={Icon.usedIn}
          title="Permet d’obtenir"
          count={children.length}
        >
          {children.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun croisement connu ne part de cette variété.</p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_auto_1fr]">
              {children.map(({ child, partner }) => (
                <Fragment key={`${child.id}-${partner.id}`}>
                  <VarietyLink variety={child} />
                  <span className="text-xs text-slate-600 sm:self-center">avec</span>
                  <VarietyLink variety={partner} className="text-slate-400" />
                </Fragment>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {evaluation && (
        <Panel
          icon={Icon.genealogy}
          title="Jusqu’aux générations 1"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {existing.length > 0 && (
                <span className="text-xs text-slate-500">
                  {existing.length} plan{existing.length > 1 ? 's' : ''} en cours :{' '}
                  {existing.map((plan, index) => (
                    <Fragment key={plan.id}>
                      {index > 0 && ', '}
                      <Link to={planPath(plan.id)} className="text-amber-400 hover:text-amber-300">
                        ouvrir
                      </Link>
                    </Fragment>
                  ))}
                </span>
              )}
              <button
                type="button"
                onClick={() => navigate(planPath(createPlan(variety.id)))}
                className={`${BUTTON} h-8`}
              >
                <Icon.breeding className="size-4" aria-hidden />
                Planifier cet élevage
              </button>
            </div>
          }
        >
          <p className="mb-2 text-xs text-slate-500">
            Depuis une étable vide, tout réussissant du premier coup :{' '}
            {captures(evaluation).map((entry, index) => (
              <Fragment key={entry.variety.id}>
                {index > 0 && ', '}
                <span className="tabular-nums text-slate-300">{entry.missing}</span> {entry.variety.name}
              </Fragment>
            ))}{' '}
            — soit {evaluation.crosses.length} croisement{evaluation.crosses.length > 1 ? 's' : ''}{' '}
            pour {varietyName(variety)}.
          </p>
          <BreedingTree root={evaluation.root} theoretical />
        </Panel>
      )}
    </section>
  )
}

function Panel({
  icon: Glyph,
  title,
  count,
  action,
  children,
}: {
  icon: typeof Icon.cross
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-800 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <Glyph className="size-3.5 shrink-0" aria-hidden />
          {title}
          {count !== undefined && <span className="text-slate-600">{count}</span>}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}
