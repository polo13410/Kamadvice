/**
 * Les pages que l'app propose, décrites une seule fois.
 *
 * Le menu du header et les raccourcis de l'accueil lisent la même table : un
 * tableau de bord ajouté ici apparaît aux deux endroits, et il n'y a pas de
 * seconde liste à penser à mettre à jour.
 */
import type { NavMenuItem } from '../components/NavMenu'
import { Icon } from './icons'

/** Entrées du menu « Dashboard ». À garder alignées sur les routes de `App`. */
export const DASHBOARDS: NavMenuItem[] = [
  {
    to: '/dashboard/catalyst',
    label: 'Carburant',
    icon: Icon.fuel,
    description: "Acheter ou crafter les carburants d'enclos, par jauge et par niveau",
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
