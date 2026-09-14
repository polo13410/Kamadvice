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

/** Le tableau de bord des carburants d'enclos. */
export const CARBURANT_PATH = '/dashboard/catalyst'

/**
 * Une page est « courante » sur son chemin et sur ceux qu'elle abrite : la
 * liste des métiers l'est sur le tableau de bord d'un métier, l'élevage sur un
 * plan. Le header et le menu s'en servent pour souligner la section ouverte.
 */
export const isCurrent = (pathname: string, to: string): boolean =>
  pathname === to || pathname.startsWith(`${to}/`)

export const CARBURANT: NavMenuItem = {
  to: CARBURANT_PATH,
  label: 'Carburant',
  icon: Icon.fuel,
  description: "Acheter ou crafter les carburants d'enclos, par jauge et par niveau",
}

/** Les tableaux de bord, tels que l'accueil les présente. À garder alignés sur les routes de `App`. */
export const DASHBOARDS: NavMenuItem[] = [
  CARBURANT,
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
 * Les vues : des listes d'items toutes faites, au format tableau de bord. Le
 * menu « Vues » du header les déroule ; les vues sur mesure (voir `TODO.md`)
 * viendront s'y ajouter.
 */
export const VIEWS: NavMenuItem[] = [CARBURANT, FAVORITES]

/**
 * De quoi amorcer une première recherche. Des noms de familles larges plutôt
 * que d'items précis : on veut montrer ce que la page sait faire, pas envoyer
 * sur une liste d'une seule ligne.
 */
export const SEARCH_EXAMPLES = ['extrait', 'bois', 'minerai', 'plume', 'viande']
