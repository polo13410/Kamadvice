/**
 * La généalogie d'une monture, sur sa fiche d'item : à gauche ses parents,
 * au centre elle, à droite ce qu'elle permet d'obtenir — comme l'écran du
 * jeu —, puis la recette dépliée jusqu'aux générations 1.
 *
 * Tout ici est la **recette théorique** de la variété. L'arbre *réel* d'une
 * monture possédée se renseigne dans un plan d'élevage, où il compte.
 */
import { Fragment, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCatalog } from '../data/catalogContext'
import { DEFAULT_SETTINGS, varietyName } from '../data/mounts'
import { createPlan, usePlans } from '../data/plans'
import { evaluatePlan, theoreticalPlan } from '../domain/breeding'
import type { Item, MountVariety } from '../domain/types'
import { Icon } from '../lib/icons'
import { planPath } from '../lib/pages'
import { BUTTON } from './Adorned'
import BreedingTree from './BreedingTree'
import ItemIcon from './ItemIcon'
import { GenerationBadge } from './MountVariety'
import { Tooltip } from './Tooltip'

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

  const recipes = variety.recipes
    .map(([a, b]) => [catalog.mounts.byId.get(a), catalog.mounts.byId.get(b)])
    .filter((pair): pair is [MountVariety, MountVariety] => pair[0] !== undefined && pair[1] !== undefined)
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

  return (
    <section className="space-y-3">
      <h2 className="flex flex-wrap items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
        <Icon.genealogy className="size-4 shrink-0" aria-hidden />
        Généalogie
        {isCertificate && (
          <span className="font-normal normal-case tracking-normal text-slate-600">
            · certificat de la{' '}
            <Link to={`/item/${variety.id}`} className="text-slate-400 hover:text-amber-400">
              monture
            </Link>
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {existing.length > 0 && (
            <span className="text-xs font-normal normal-case tracking-normal text-slate-500">
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
            className={`${BUTTON} h-8 text-xs font-normal normal-case tracking-normal`}
          >
            <Icon.breeding className="size-4" aria-hidden />
            Planifier cet élevage
          </button>
        </span>
      </h2>

      {/* Parents → la monture → enfants. Les parents l'un sous l'autre,
          comme dans le jeu ; une recette de plus fait une colonne de plus.
          Les traits ne sont que du dessin : sur un écran étroit, les
          colonnes s'empilent et ils disparaissent. */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-4 rounded-lg border border-slate-800 p-4">
        <div className="flex items-center gap-2">
          {recipes.length === 0 ? (
            <p className="w-40 text-xs text-slate-500">
              {variety.generation === 1 ? 'Génération 1 : se capture.' : 'Ne s’obtient pas par croisement.'}
            </p>
          ) : (
            recipes.map(([a, b], index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                {recipes.length > 1 && (
                  <span className="text-[10px] text-slate-600">Recette {index + 1}</span>
                )}
                <VarietyCard variety={a} />
                <VarietyCard variety={b} />
              </div>
            ))
          )}
        </div>
        {recipes.length > 0 && <Joint kind="merge" />}
        <VarietyCard variety={variety} size={72} current />
        {children.length > 0 && <Joint kind="fork" />}
        {/* Les enfants en colonnes : de haut en bas, trois par colonne —
            quatre ou cinq quand il y en a beaucoup, pour que les colonnes
            tiennent à côté des parents —, puis la colonne suivante. Des
            colonnes explicites, chacune centrée verticalement : la dernière,
            incomplète, se cale au milieu et non en haut. */}
        {children.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-4 pt-3 pr-3">
            {columns(children, children.length > 12 ? 5 : children.length > 9 ? 4 : 3).map((column, index) => (
              <div key={index} className="flex flex-col justify-center gap-4">
                {column.map(({ child, partner }) => (
                  <VarietyCard key={`${child.id}-${partner.id}`} variety={child} partner={partner} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {evaluation && (
        <div className="rounded-lg border border-slate-800 p-3">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Icon.genealogy className="size-3.5 shrink-0" aria-hidden />
            Jusqu’aux générations 1
            <span className="text-slate-600">
              {evaluation.crosses.length} croisement{evaluation.crosses.length > 1 ? 's' : ''}
            </span>
          </h3>
          <BreedingTree root={evaluation.root} theoretical />
        </div>
      )}
    </section>
  )
}

/** Découpe une liste en colonnes de `rows` éléments, la dernière plus courte. */
function columns<T>(items: readonly T[], rows: number): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += rows) result.push(items.slice(start, start + rows))
  return result
}

/**
 * Une variété en carte : son image, son nom dessous, la génération ; un lien
 * vers sa fiche, où la même carte se retrouve au centre. Avec `partner`, la
 * variété qu'il faut lui croiser, en médaillon dans le coin — un lien à
 * part, posé à côté de la carte et non dedans, avec son nom en infobulle.
 */
function VarietyCard({
  variety,
  partner,
  size = 48,
  current = false,
}: {
  variety: MountVariety
  partner?: MountVariety
  size?: number
  current?: boolean
}) {
  const catalog = useCatalog()
  const item = catalog.byId.get(variety.id)
  const partnerItem = partner && catalog.byId.get(partner.id)
  const body = (
    <>
      {item ? (
        <ItemIcon item={item} size={size} />
      ) : (
        <Icon.mount className="text-slate-600" style={{ width: size, height: size }} aria-hidden />
      )}
      <span className="max-w-24 truncate text-center text-[11px] leading-tight">{variety.name}</span>
      <GenerationBadge generation={variety.generation} />
    </>
  )
  const className = `flex w-28 flex-col items-center gap-1 rounded-lg border px-2 py-2 ${
    current
      ? 'w-36 border-amber-500/60 bg-amber-500/6 text-slate-100'
      : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:text-amber-400'
  }`
  if (current) return <div className={className}>{body}</div>
  return (
    <span className="relative flex">
      <Link to={`/item/${variety.id}`} data-item-name={varietyName(variety)} className={className}>
        {body}
      </Link>
      {partner && (
        <Tooltip content={`avec ${partner.name}`} className="absolute -top-3 -right-3 flex">
          <Link
            to={`/item/${partner.id}`}
            aria-label={`avec ${partner.name}`}
            className="flex size-9 items-center justify-center rounded-full border border-slate-700 bg-slate-900 hover:border-amber-500/60"
          >
            {partnerItem ? (
              <ItemIcon item={partnerItem} size={28} />
            ) : (
              <Icon.mount className="size-4 text-slate-500" aria-hidden />
            )}
          </Link>
        </Tooltip>
      )}
    </span>
  )
}

/**
 * Les traits entre colonnes : deux flèches qui convergent vers la monture
 * (`merge`), ou une flèche qui part vers les enfants (`fork`).
 */
function Joint({ kind }: { kind: 'merge' | 'fork' }) {
  const stroke = 'stroke-slate-600'
  return (
    <svg viewBox="0 0 48 64" className="hidden h-16 w-12 shrink-0 sm:block" aria-hidden>
      <defs>
        <marker id="genealogy-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" className="fill-slate-500" />
        </marker>
      </defs>
      {kind === 'merge' ? (
        <>
          <path d="M2 14 C 22 14, 22 32, 44 32" fill="none" strokeWidth="1.5" className={stroke} markerEnd="url(#genealogy-arrow)" />
          <path d="M2 50 C 22 50, 22 32, 44 32" fill="none" strokeWidth="1.5" className={stroke} markerEnd="url(#genealogy-arrow)" />
        </>
      ) : (
        <path d="M2 32 L 44 32" fill="none" strokeWidth="1.5" className={stroke} markerEnd="url(#genealogy-arrow)" />
      )}
    </svg>
  )
}
