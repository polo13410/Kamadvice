/**
 * Icône d'un métier, servie par un CDN tiers comme celles des items : rien à
 * builder ni à héberger.
 *
 * Les sources de `catalog.jobIconBaseUrls` sont essayées dans l'ordre, chaque
 * échec faisant passer à la suivante, jusqu'au pictogramme. Il n'y en a qu'une
 * aujourd'hui — Ankama ne sert pas d'icônes de métier, DofusDB oui — mais la
 * mécanique est celle d'`ItemIcon`, et une seconde source s'ajoute au build.
 *
 * Le pictogramme sert aussi aux métiers sans icône en jeu, de la même taille,
 * pour que cartes et titres gardent leur alignement.
 */
import { useState } from 'react'
import { useCatalog } from '../data/catalogContext'
import type { Job } from '../domain/types'
import { Icon } from '../lib/icons'

export default function JobIcon({
  job,
  size = 32,
  className = '',
}: {
  job: Job
  size?: number
  className?: string
}) {
  const { jobIconBaseUrls } = useCatalog()
  // L'item avec la source atteinte, et pas seulement un index : la liste des
  // métiers réutilise ses cartes, un compteur nu resterait collé au suivant.
  const [failed, setFailed] = useState<{ jobId: number; source: number } | null>(null)

  const source = failed?.jobId === job.id ? failed.source : 0
  const baseUrl = job.iconId === null ? undefined : jobIconBaseUrls[source]

  if (baseUrl === undefined) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center text-slate-500 ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Icon.craft style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    )
  }

  return (
    <img
      // Repartir sur un élément neuf à chaque source : on ne dépend pas du
      // navigateur pour relancer un chargement sur une URL déjà en échec.
      key={source}
      src={`${baseUrl}${job.iconId}.png`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      decoding="async"
      referrerPolicy="no-referrer"
      className={`shrink-0 object-contain ${className}`}
      onError={() => setFailed({ jobId: job.id, source: source + 1 })}
    />
  )
}
