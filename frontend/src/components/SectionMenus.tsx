/**
 * Les trois menus du header, et les listes qu'ils déroulent :
 *
 * - **Métiers** : chaque métier producteur, son icône, son nombre de recettes.
 * - **Élevage** : les plans en cours, la monture visée en icône.
 * - **Vues** : les listes d'items toutes faites — carburants, favoris. Les
 *   vues sur mesure (voir `TODO.md`) viendront s'y ranger.
 *
 * Tout s'épingle : un écran épinglé remonte en tête de son menu, et
 * `usePinnedShortcuts` le rend à l'accueil en raccourci.
 */
import { useMemo } from 'react'
import { useCatalog } from '../data/catalogContext'
import { varietyName } from '../data/mounts'
import { PIN, usePins } from '../data/pins'
import { usePlans } from '../data/plans'
import { formatRelativeDate } from '../lib/format'
import { Icon } from '../lib/icons'
import { BREEDING_PATH, JOBS_PATH, jobPath, planPath, VIEWS } from '../lib/pages'
import ItemIcon from './ItemIcon'
import JobIcon from './JobIcon'
import NavMenu, { type NavMenuItem } from './NavMenu'

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

function useJobItems(): NavMenuItem[] {
  const catalog = useCatalog()
  return useMemo(
    () =>
      catalog.jobs.map((job) => ({
        to: jobPath(job),
        label: job.name,
        glyph: <JobIcon job={job} size={20} />,
        description: plural(catalog.recipesByJob.get(job.id)?.length ?? 0, 'recette'),
        pinKey: PIN.job(job.slug),
      })),
    [catalog],
  )
}

function usePlanItems(): NavMenuItem[] {
  const catalog = useCatalog()
  const plans = usePlans()
  return useMemo(
    () =>
      plans.map((plan) => {
        const variety = catalog.mounts.byId.get(plan.target)
        const item = variety && catalog.byId.get(variety.id)
        return {
          to: planPath(plan.id),
          label: variety ? varietyName(variety) : `Plan #${plan.target}`,
          glyph: item ? (
            <ItemIcon item={item} size={20} />
          ) : (
            <Icon.mount className="size-5 text-slate-600" aria-hidden />
          ),
          description: `${variety ? `Génération ${variety.generation} · ` : ''}modifié ${formatRelativeDate(plan.updatedAt)}`,
          pinKey: PIN.plan(plan.id),
        }
      }),
    [catalog, plans],
  )
}

const VIEW_ITEMS: NavMenuItem[] = VIEWS.map((page) => ({ ...page, pinKey: PIN.view(page.to) }))

export function JobsMenu() {
  return <NavMenu label="Métiers" icon={Icon.job} to={JOBS_PATH} items={useJobItems()} align="right" />
}

export function PlansMenu() {
  return (
    <NavMenu
      label="Élevage"
      icon={Icon.breeding}
      to={BREEDING_PATH}
      items={usePlanItems()}
      empty="Aucun plan en cours. Ouvrez Élevage pour choisir une monture à obtenir."
      align="right"
    />
  )
}

export function ViewsMenu() {
  return <NavMenu label="Vues" icon={Icon.dashboard} items={VIEW_ITEMS} align="right" />
}

/** Les écrans épinglés, résolus en liens, dans l'ordre des menus : métiers, plans, vues. */
export function usePinnedShortcuts(): NavMenuItem[] {
  const pins = usePins()
  const jobs = useJobItems()
  const plans = usePlanItems()
  return useMemo(
    () =>
      [...jobs, ...plans, ...VIEW_ITEMS].filter(
        (item) => item.pinKey !== undefined && pins.has(item.pinKey),
      ),
    [pins, jobs, plans],
  )
}
