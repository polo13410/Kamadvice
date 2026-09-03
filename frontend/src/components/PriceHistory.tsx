import { removePricePoint, usePriceLog } from '../data/prices'
import { formatDateTime, formatKamas, formatPercent, formatRelativeDate } from '../lib/format'
import type { ItemId } from '../domain/types'
import { Icon } from '../lib/icons'
import { Tooltip } from './Tooltip'
import TrendIcon from './TrendIcon'

/**
 * Journal des relevés de prix d'un item, du plus récent au plus ancien, avec la
 * variation par rapport au relevé précédent.
 */
export default function PriceHistory({ itemId }: { itemId: ItemId }) {
  const log = usePriceLog(itemId)

  if (log.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Icon.history className="size-4 shrink-0" aria-hidden />
        Aucun prix relevé pour cet item.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-900 text-xs text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">
              <span className="flex items-center gap-1.5">
                <Icon.history className="size-3.5" aria-hidden />
                Relevé
              </span>
            </th>
            <th className="w-32 px-3 py-2 text-right font-medium">
              <span className="flex items-center justify-end gap-1.5">
                <Icon.price className="size-3.5" aria-hidden />
                Prix
              </span>
            </th>
            <th className="w-32 px-3 py-2 text-right font-medium">Variation</th>
            <th className="w-10 px-3 py-2">
              <span className="sr-only">Supprimer</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {log.map((point, index) => {
            const previous = log[index + 1]
            const delta = previous ? point.price - previous.price : null
            const ratio = previous?.price ? delta! / previous.price : null

            return (
              <tr key={`${point.at ?? 'inconnu'}-${index}`} className="border-t border-slate-800/60">
                <td className="px-3 py-2 text-slate-300">
                  <Tooltip content={formatDateTime(point.at)}>{formatRelativeDate(point.at)}</Tooltip>
                  {index === 0 && (
                    <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                      actuel
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-200">
                  {formatKamas(point.price)}
                </td>
                <td
                  className={`px-3 py-2 tabular-nums ${
                    delta === null ? 'text-slate-600' : delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span className="flex items-center justify-end gap-1.5">
                    <TrendIcon value={delta} className="size-3.5 shrink-0" />
                    {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${formatKamas(Math.abs(delta))}`}
                    {ratio !== null && (
                      <span className="text-xs text-slate-500">{formatPercent(ratio)}</span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <Tooltip content="Supprimer ce relevé">
                    <button
                      type="button"
                      onClick={() => removePricePoint(itemId, index)}
                      aria-label={`Supprimer le relevé de ${formatKamas(point.price)} kamas`}
                      className="text-slate-600 hover:text-rose-400"
                    >
                      <Icon.delete className="size-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
