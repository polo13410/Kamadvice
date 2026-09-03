import { useEffect, useState } from 'react'
import { setPrice } from '../data/prices'
import { formatKamas, parseKamas } from '../lib/format'
import type { ItemId } from '../domain/types'

/**
 * Saisie d'un prix HDV. La valeur n'est validée qu'à la sortie du champ ou sur
 * Entrée : on évite ainsi de recalculer tous les coûts de craft à chaque frappe.
 *
 * Un champ laissé vide est une saisie abandonnée, pas un prix : elle est
 * annulée, comme avec Échap. Effacer un prix passe par l'historique.
 */
export default function PriceInput({
  itemId,
  value,
  className = '',
}: {
  itemId: ItemId
  value: number | null
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  // Un prix modifié ailleurs (autre ligne, autre page) doit se refléter ici tant
  // que le champ n'est pas en cours d'édition.
  useEffect(() => setDraft(null), [value])

  const commit = () => {
    if (draft === null) return
    const price = parseKamas(draft)
    if (price !== null) setPrice(itemId, price)
    setDraft(null)
  }

  return (
    <input
      inputMode="numeric"
      value={draft ?? (value === null ? '' : formatKamas(value))}
      placeholder="—"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
      }}
      className={`w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none ${className}`}
    />
  )
}
