/**
 * La barre de filtres d'un tableau de bord, et ses contrôles.
 *
 * Tous posés sur `Adorned` — icône dans le champ, pas de libellé à côté — pour
 * tenir sur une ligne à plusieurs. Un tableau de bord métier compose ce qu'il
 * lui faut : liste, nombre, coche ; c'est la page qui garde l'état, ces
 * composants ne font qu'afficher et remonter.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Icon } from '../lib/icons'
import Adorned, { CONTROL } from './Adorned'
import { Tooltip } from './Tooltip'

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

export interface FilterOption<T extends string> {
  value: T
  label: string
}

/**
 * Liste déroulante à choix unique, avec une entrée « tout » qui vaut `null`.
 *
 * Générique sur la clé : la page reçoit exactement le type qu'elle a donné,
 * sans repasser par une chaîne à valider.
 */
export function FilterSelect<T extends string>({
  icon,
  all,
  value,
  options,
  onChange,
  className = '',
}: {
  icon: LucideIcon
  /** Libellé de l'entrée « tout ». */
  all: string
  value: T | null
  options: readonly FilterOption<T>[]
  onChange: (value: T | null) => void
  className?: string
}) {
  return (
    <Adorned icon={icon}>
      <select
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value
          onChange(raw === '' ? null : (options.find((o) => o.value === raw)?.value ?? null))
        }}
        className={`${CONTROL} ${className}`}
      >
        <option value="">{all}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Adorned>
  )
}

/**
 * Puces à sélection multiple : chaque clic ajoute ou retire une valeur, et
 * aucune puce active veut dire « tout ».
 *
 * Des puces plutôt qu'une liste `multiple` : on voit d'un coup d'œil ce qui
 * est coché, et cumuler deux jauges prend deux clics au lieu d'un Ctrl-clic
 * que personne ne devine.
 */
export function FilterChips<T extends string>({
  icon: Glyph,
  label,
  value,
  options,
  onChange,
}: {
  icon: LucideIcon
  /** Nom du groupe, pour les lecteurs d'écran : l'icône le dit aux autres. */
  label: string
  value: ReadonlySet<T>
  options: readonly FilterOption<T>[]
  onChange: (value: Set<T>) => void
}) {
  const toggle = (key: T) => {
    const next = new Set(value)
    if (!next.delete(key)) next.add(key)
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <Glyph className="mr-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden />
      {options.map((option) => {
        const active = value.has(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            aria-pressed={active}
            className={`rounded-full border px-2.5 py-1 text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
              active
                ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Trait vertical entre deux groupes de la barre. */
export function FilterDivider() {
  return <span className="h-5 w-px shrink-0 bg-slate-800" aria-hidden />
}

/** « Tout effacer », à n'afficher que quand il y a quelque chose à effacer. */
export function FilterReset({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none"
    >
      <Icon.sortReset className="size-3.5 shrink-0" aria-hidden />
      Tout effacer
    </button>
  )
}

/**
 * Nombre entier borné, vide quand la valeur est inconnue.
 *
 * Remonte `null` sur un champ vidé : c'est à la page de décider si un niveau
 * absent veut dire « tout montrer » ou « rien filtrer ».
 */
export function FilterNumber({
  icon,
  value,
  min,
  max,
  placeholder,
  onChange,
  tip,
  className = '',
}: {
  icon: LucideIcon
  value: number | null
  min: number
  max: number
  placeholder: string
  onChange: (value: number | null) => void
  tip?: string
  className?: string
}) {
  const field = (
    <Adorned icon={icon} className={className}>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) => {
          const raw = event.target.value
          if (raw === '') return onChange(null)
          const parsed = Number(raw)
          if (Number.isInteger(parsed)) onChange(Math.min(max, Math.max(min, parsed)))
        }}
        className={`${CONTROL} w-full`}
      />
    </Adorned>
  )
  return tip ? <Tooltip content={tip}>{field}</Tooltip> : field
}

/** Case à cocher, avec icône et bulle facultative pour dire ce qu'elle restreint. */
export function FilterToggle({
  icon: Glyph,
  label,
  checked,
  onChange,
  tip,
  disabled = false,
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  tip?: string
  disabled?: boolean
}) {
  const control = (
    <label
      className={`flex items-center gap-2 text-sm ${
        disabled
          ? 'cursor-not-allowed text-slate-600'
          : 'cursor-pointer text-slate-400 hover:text-slate-200'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-amber-500"
      />
      <Glyph className="size-4" aria-hidden />
      {label}
    </label>
  )
  return tip ? <Tooltip content={tip}>{control}</Tooltip> : control
}
