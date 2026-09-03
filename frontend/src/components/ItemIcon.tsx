import { useState } from 'react'
import { useCatalog } from '../data/catalogContext'
import type { Item } from '../domain/types'
import { Icon } from '../lib/icons'

/**
 * Icône servie directement par le CDN d'Ankama : aucun asset à héberger.
 *
 * Quelques items retirés du jeu n'ont plus d'icône côté Ankama. On affiche alors
 * un marqueur plutôt qu'un trou : la ligne garde son alignement et l'absence est
 * explicite.
 */
export default function ItemIcon({ item, size = 32 }: { item: Item; size?: number }) {
  const { iconBaseUrl } = useCatalog()
  // On mémorise l'item en échec, pas un simple booléen : la liste virtualisée
  // réutilise ses composants, et un drapeau resterait collé au suivant.
  const [failedId, setFailedId] = useState<number | null>(null)

  if (item.iconId === null || failedId === item.id) {
    return (
      <span
        className="flex shrink-0 items-center justify-center text-slate-700"
        style={{ width: size, height: size }}
        title="Icône indisponible"
      >
        <Icon.missingImage style={{ width: size * 0.6, height: size * 0.6 }} aria-hidden />
      </span>
    )
  }

  return (
    <img
      src={`${iconBaseUrl}${item.iconId}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 object-contain"
      onError={() => setFailedId(item.id)}
    />
  )
}
