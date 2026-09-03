import { usePriceLog } from '../data/prices'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import type { ItemId } from '../domain/types'
import { Icon } from '../lib/icons'
import PriceInput from './PriceInput'

/**
 * Saisie d'un prix HDV accompagnée de sa date de dernier relevé, sur une ligne.
 *
 * Le composant lit lui-même le prix courant : les listes n'ont donc pas à le
 * faire descendre, et un prix modifié depuis n'importe quel autre endroit de la
 * page se reflète ici immédiatement.
 */
export default function PriceField({
  itemId,
  align = 'right',
  className = '',
}: {
  itemId: ItemId
  /**
   * `right` (défaut) épingle l'input à droite et pousse la date à sa gauche :
   * dans une colonne, les montants restent alignés quelle que soit la longueur
   * de la date. `left` met l'input d'abord, pour un champ isolé.
   */
  align?: 'left' | 'right'
  className?: string
}) {
  const log = usePriceLog(itemId)
  const latest = log[0]

  // `shrink-0` : dans une cellule étroite, c'est la date qui cède, pas le champ.
  const input = (
    <PriceInput itemId={itemId} value={latest?.price ?? null} className="shrink-0" />
  )
  const date = (
    <span
      className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[10px] leading-none text-slate-600"
      title={latest ? formatDateTime(latest.at) : undefined}
    >
      <Icon.history className="size-3 shrink-0" aria-hidden />
      {latest ? formatRelativeDate(latest.at) : 'jamais saisi'}
    </span>
  )

  return (
    <div
      className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : ''} ${className}`}
    >
      {align === 'right' ? (
        <>
          {date}
          {input}
        </>
      ) : (
        <>
          {input}
          {date}
        </>
      )}
    </div>
  )
}
