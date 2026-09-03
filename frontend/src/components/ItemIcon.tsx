import { useState } from 'react'
import { useCatalog } from '../data/catalogContext'
import type { Item, ItemId } from '../domain/types'
import { Icon } from '../lib/icons'

/**
 * Icône d'item, servie par un CDN tiers : aucun asset à héberger.
 *
 * Les sources de `catalog.iconBaseUrls` sont essayées dans l'ordre, chaque échec
 * faisant passer à la suivante, jusqu'au marqueur d'absence. Ankama reste la
 * source officielle mais ne sert pas ~17 % des iconId du dump (403 AccessDenied,
 * une erreur XML de S3) ; DofusDB comble ces trous.
 *
 * `referrerPolicy="no-referrer"` n'est pas cosmétique : Ankama filtre l'en-tête
 * `Referer` et ne répond qu'à ses propres domaines. Le navigateur envoie
 * l'origine par défaut, ce qui vaut un 403 aussi bien depuis localhost que
 * depuis netlify.app. Sans `Referer`, la même URL répond 200.
 */
export default function ItemIcon({ item, size = 32 }: { item: Item; size?: number }) {
  const { iconBaseUrls } = useCatalog()
  // On mémorise l'item avec la source atteinte, et pas seulement un index : la
  // liste virtualisée réutilise ses composants, un compteur nu resterait collé
  // à l'item suivant et lui ferait sauter des sources sans raison.
  const [failed, setFailed] = useState<{ itemId: ItemId; source: number } | null>(null)

  const source = failed?.itemId === item.id ? failed.source : 0
  const baseUrl = item.iconId === null ? undefined : iconBaseUrls[source]

  if (baseUrl === undefined) {
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
      // Repartir sur un élément neuf à chaque source : on ne dépend pas du
      // navigateur pour relancer un chargement sur une URL déjà en échec.
      key={source}
      src={`${baseUrl}${item.iconId}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="shrink-0 object-contain"
      onError={() => setFailed({ itemId: item.id, source: source + 1 })}
    />
  )
}
