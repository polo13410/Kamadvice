/**
 * Les pages que l'app propose, décrites une seule fois.
 *
 * Le menu du header et les raccourcis de l'accueil lisent la même table : un
 * tableau de bord ajouté ici apparaît aux deux endroits, et il n'y a pas de
 * seconde liste à penser à mettre à jour.
 */
import type { NavMenuItem } from '../components/NavMenu'
import type { Job } from '../domain/types'
import { Icon } from './icons'

/** La liste des métiers ; chaque métier vit sous `/job/:slug`. */
export const JOBS_PATH = '/job'

export const jobPath = (job: Job): string => `${JOBS_PATH}/${job.slug}`

/** Le planificateur d'élevage ; chaque plan sauvegardé vit sous `/dashboard/elevage/:id`. */
export const BREEDING_PATH = '/dashboard/elevage'

export const planPath = (planId: string): string => `${BREEDING_PATH}/${planId}`

/** Entrées du menu « Dashboard ». À garder alignées sur les routes de `App`. */
export const DASHBOARDS: NavMenuItem[] = [
  {
    to: '/dashboard/catalyst',
    label: 'Carburant',
    icon: Icon.fuel,
    description: "Acheter ou crafter les carburants d'enclos, par jauge et par niveau",
  },
  {
    to: JOBS_PATH,
    label: 'Métiers',
    icon: Icon.job,
    description: 'Chaque recette d’un métier face à son prix HDV',
  },
  {
    to: BREEDING_PATH,
    label: 'Élevage',
    icon: Icon.breeding,
    description: 'Planifier une dragodinde, un muldo ou un volkorne : étapes, chances et coût',
  },
]

/** Les pages hors dashboards, telles que l'accueil les présente. */
export const SEARCH: NavMenuItem = {
  to: '/search',
  label: 'Recherche',
  icon: Icon.search,
  description: 'Tout le catalogue, filtré par catégorie, type ou craftabilité',
}

export const FAVORITES: NavMenuItem = {
  to: '/favorites',
  label: 'Favoris',
  icon: Icon.favorite,
  description: 'Les items que vous suivez, filtrables par type et par rentabilité',
}

/**
 * De quoi amorcer une première recherche. Des noms de familles larges plutôt
 * que d'items précis : on veut montrer ce que la page sait faire, pas envoyer
 * sur une liste d'une seule ligne.
 */
export const SEARCH_EXAMPLES = ['extrait', 'bois', 'minerai', 'plume', 'viande']
