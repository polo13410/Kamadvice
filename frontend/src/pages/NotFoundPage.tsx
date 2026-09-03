import { useLocation } from 'react-router-dom'
import NotFound, { type Exit } from '../components/NotFound'
import { Icon } from '../lib/icons'

/** Où renvoyer quelqu'un qui s'est perdu : les trois entrées du header. */
const EXITS: Exit[] = [
  {
    to: '/',
    label: 'Mes favoris',
    description: 'Les items que je suis',
    icon: Icon.favorite,
  },
  {
    to: '/recherche',
    label: 'Recherche',
    description: 'Fouiller tout le catalogue',
    icon: Icon.search,
  },
  {
    // `/dashboard` redirige vers le tableau de bord courant : un lien direct
    // ici obligerait à le corriger à chaque nouveau tableau.
    to: '/dashboard',
    label: 'Tableaux de bord',
    description: "Carburant d'enclos et compagnie",
    icon: Icon.dashboard,
  },
]

/**
 * La page des adresses qui ne mènent nulle part.
 *
 * Elle affiche le chemin demandé — un lien partagé se répare plus vite quand
 * on voit la faute de frappe — et propose les sorties du header plutôt qu'un
 * simple « retour », qui ramènerait sur la page cassée après un rechargement.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <NotFound
      code="404"
      glyph={Icon.notFound}
      title="Page introuvable"
      message="Cette adresse ne mène à aucun item, aucune recette et surtout aucun kama."
      detail={pathname}
      exits={EXITS}
    />
  )
}
