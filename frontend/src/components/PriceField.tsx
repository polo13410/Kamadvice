import { usePriceLog } from '../data/prices'
import { formatDateTime, formatRelativeDate } from '../lib/format'
import type { ItemId } from '../domain/types'
import { Icon } from '../lib/icons'
import PriceInput from './PriceInput'

/**
 * Saisie d'un prix HDV accompagnée de sa date de dernier relevé.
 *
 * Le composant lit lui-même le prix courant : les listes n'ont donc pas à le
 * faire descendre, et un prix modifié depuis n'importe quel autre endroit de la
 * page se reflète ici immédiatement.
 */
export default function PriceField({
  itemId,
  className = '',
}: {
  itemId: ItemId
  className?: string
}) {
  const log = usePriceLog(itemId)
  const latest = log[0]

  return (
    <div className={`flex flex-col items-end gap-0.5 ${className}`}>
      <PriceInput itemId={itemId} value={latest?.price ?? null} className="w-full" />
      <span
        className="flex items-center gap-1 text-[10px] leading-none text-slate-600"
        title={latest ? formatDateTime(latest.at) : undefined}
      >
        <Icon.history className="size-3 shrink-0" aria-hidden />
        {latest ? formatRelativeDate(latest.at) : 'jamais saisi'}
      </span>
    </div>
  )
}
