/**
 * Une variété de monture, telle qu'elle se montre partout : son icône, son
 * nom, sa génération en pastille. Un lien vers la fiche de l'item de monture,
 * c'est là que vivent la généalogie et le bouton « Planifier ».
 *
 * Et les petites pièces qui vont avec : le sexe en glyphe, une monture réelle
 * en puce, le choix d'une variété dans une liste groupée par génération.
 */
import { Link } from 'react-router-dom'
import { useCatalog } from '../data/catalogContext'
import { varietyName } from '../data/mounts'
import type { Sex, StableMount } from '../domain/breeding'
import type { MountVariety, VarietyId } from '../domain/types'
import { Icon } from '../lib/icons'
import ItemIcon from './ItemIcon'
import { Tooltip } from './Tooltip'

/** « G5 », en pastille. */
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

/** Le sexe d'une monture, en glyphe. */
export function SexGlyph({ sex, className = 'size-3.5' }: { sex: Sex | null; className?: string }) {
  if (sex === 'male') return <Icon.male className={`${className} shrink-0 text-sky-400`} aria-label="Mâle" />
  if (sex === 'female') return <Icon.female className={`${className} shrink-0 text-rose-400`} aria-label="Femelle" />
  return (
    <span className={`${className} inline-block shrink-0 text-center leading-none text-slate-600`} aria-label="Sexe inconnu">
      ?
    </span>
  )
}

/**
 * Une monture réelle, en une puce : sexe, niveau, et ce qui compte pour
 * l'élevage — féconde ou pas, stérile.
 */
export function MountChip({ mount, className = '' }: { mount: StableMount; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-xs ${
        mount.sterile
          ? 'border-slate-800 text-slate-500'
          : mount.ready
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border-slate-700 bg-slate-800/60 text-slate-300'
      } ${className}`}
    >
      <SexGlyph sex={mount.sex} className="size-3" />
      <span className="tabular-nums">niv. {mount.level}</span>
      {mount.sterile ? (
        <Tooltip content="A déjà reproduit : ne sert plus qu'au clonage" className="flex cursor-help items-center gap-0.5">
          <Icon.sterile className="size-3" aria-hidden />
          stérile
        </Tooltip>
      ) : mount.ready ? (
        <Tooltip content="Jauges d'amour, de maturité et d'endurance pleines" className="cursor-help">
          féconde
        </Tooltip>
      ) : (
        <Tooltip content="Jauges de fécondité à remplir" className="cursor-help text-slate-500">
          à préparer
        </Tooltip>
      )}
    </span>
  )
}

/** Choix d'une variété parmi une liste, groupée par génération. */
export function VarietySelect({
  value,
  options,
  onChange,
  placeholder,
  className = '',
  ariaLabel,
}: {
  value: VarietyId | null
  options: readonly MountVariety[]
  onChange: (id: VarietyId | null) => void
  placeholder: string
  className?: string
  ariaLabel: string
}) {
  const generations = new Map<number, MountVariety[]>()
  for (const variety of options) {
    const group = generations.get(variety.generation)
    if (group) group.push(variety)
    else generations.set(variety.generation, [variety])
  }
  return (
    <select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      aria-label={ariaLabel}
      className={className}
    >
      <option value="">{placeholder}</option>
      {[...generations.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([generation, group]) => (
          <optgroup key={generation} label={`Génération ${generation}`}>
            {group.map((variety) => (
              <option key={variety.id} value={variety.id}>
                {variety.name}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  )
}
