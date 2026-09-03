import { setFavorite, useIsFavorite } from '../data/favorites'
import type { ItemId } from '../domain/types'
import { Icon } from '../lib/icons'
import { useTooltip } from './Tooltip'

/**
 * Cœur d'épinglage, à poser sur toute ligne qui recense un item — jamais dans
 * un tableau de bord, dont la sélection d'items est déjà le sujet.
 *
 * Le cœur reste dessiné en creux tant que l'item n'est pas suivi : une colonne
 * de cœurs pleins se lirait comme une décoration, alors que seul le contraste
 * plein/vide porte l'information.
 */
export default function FavoriteButton({
  itemId,
  focusable = true,
  className = '',
}: {
  itemId: ItemId
  /**
   * `false` sort le bouton de l'ordre de tabulation, là où Tab doit enchaîner
   * les champs de prix sans détour — comme la coche « en stock » d'une recette.
   */
  focusable?: boolean
  className?: string
}) {
  const favorite = useIsFavorite(itemId)
  const label = favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'
  const tip = useTooltip(label)

  return (
    <button
      {...tip.props}
      type="button"
      onClick={() => setFavorite(itemId, !favorite)}
      tabIndex={focusable ? undefined : -1}
      aria-pressed={favorite}
      aria-label={label}
      className={`flex shrink-0 items-center justify-center rounded p-0.5 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
        favorite ? 'text-rose-400 hover:text-rose-300' : 'text-slate-700 hover:text-rose-400'
      } ${className}`}
    >
      <Icon.favorite className={`size-4 ${favorite ? 'fill-current' : ''}`} aria-hidden />
      {tip.tooltip}
    </button>
  )
}
