/**
 * Une variété de monture, telle qu'elle se montre partout : son icône, son
 * nom, sa génération en pastille. Un lien vers la fiche de l'item de monture,
 * c'est là que vivent le prix, la généalogie et le bouton « Planifier ».
 */
import { Link } from 'react-router-dom'
import { useCatalog } from '../data/catalogContext'
import { varietyName } from '../data/mounts'
import type { MountVariety } from '../domain/types'
import { Icon } from '../lib/icons'
import ItemIcon from './ItemIcon'
import { Tooltip } from './Tooltip'

/** « Gén. 5 », en pastille. */
export function GenerationBadge({
  generation,
  className = '',
}: {
  generation: number
  className?: string
}) {
  return (
    <Tooltip
      content={`Génération ${generation}`}
      className={`inline-flex shrink-0 cursor-help items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-1.5 py-px text-[10px] font-medium tabular-nums text-slate-400 ${className}`}
    >
      <Icon.generation className="size-2.5" aria-hidden />
      G{generation}
    </Tooltip>
  )
}

export default function VarietyLink({
  variety,
  size = 24,
  full = false,
  focusable = true,
  className = '',
}: {
  variety: MountVariety
  size?: number
  /** Le nom complet avec l'espèce, plutôt que le nom court. */
  full?: boolean
  focusable?: boolean
  className?: string
}) {
  const catalog = useCatalog()
  const item = catalog.byId.get(variety.id)
  const name = full ? varietyName(variety) : variety.name

  return (
    <Link
      to={`/item/${variety.id}`}
      tabIndex={focusable ? undefined : -1}
      data-item-name={varietyName(variety)}
      className={`flex min-w-0 items-center gap-2 text-slate-200 hover:text-amber-400 ${className}`}
    >
      {item ? (
        <ItemIcon item={item} size={size} />
      ) : (
        <Icon.mount className="shrink-0 text-slate-600" style={{ width: size, height: size }} aria-hidden />
      )}
      <span className="truncate">{name}</span>
      <GenerationBadge generation={variety.generation} />
    </Link>
  )
}
