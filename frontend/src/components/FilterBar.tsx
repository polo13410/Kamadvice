/**
 * La barre de filtres d'un tableau de bord, et ses contrôles.
 *
 * Tous posés sur `Adorned` — icône dans le champ, pas de libellé à côté — pour
 * tenir sur une ligne à plusieurs. Un tableau de bord métier compose ce qu'il
 * lui faut : liste, nombre, coche ; c'est la page qui garde l'état, ces
 * composants ne font qu'afficher et remonter.
 */
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../lib/icons'
import Adorned, { CONTROL, FIELD_NUMBER } from './Adorned'
import { Tooltip } from './Tooltip'

/**
 * Tous les contrôles d'une barre font la hauteur de `FIELD` (voir `Adorned`),
 * y compris les coches et les boutons : c'est ce qui les aligne sur une ligne
 * sans jeu de marges.
 */
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
            className={`flex h-7 items-center rounded-full border px-2.5 text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
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

/**
 * Le temps qu'on laisse à la frappe avant d'appliquer un champ texte : filtrer
 * sept cents recettes à chaque touche saccade, et « 10 000 » se tape en cinq
 * frappes. Entrée et la sortie du champ appliquent tout de suite.
 */
export const TYPING_DEBOUNCE_MS = 500

/**
 * Un brouillon qui ne remonte à la page qu'après un temps de silence.
 *
 * Une valeur venue d'ailleurs — « Tout effacer », bouton Retour — remplace le
 * brouillon et annule une frappe qui n'aurait pas encore été appliquée.
 * Partagé avec `NumberInput` : tout champ dont chaque valeur déclenche un
 * recalcul lourd passe par là.
 */
export function useDeferred<T>(value: T, onChange: (value: T) => void, same: (a: T, b: T) => boolean) {
  const [draft, setDraft] = useState<T>(value)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => {
    window.clearTimeout(timer.current)
    setDraft(value)
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const commit = (next: T) => {
    window.clearTimeout(timer.current)
    if (!same(next, value)) latest.current(next)
  }

  const edit = (next: T) => {
    setDraft(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => commit(next), TYPING_DEBOUNCE_MS)
  }

  return { draft, edit, commit }
}

/**
 * Recherche par mot-clé dans les lignes d'un tableau de bord.
 *
 * C'est la page qui décide où chercher — nom de l'item, ingrédients — et qui
 * normalise ; le champ ne fait que remonter le texte, après le même délai que
 * les bornes.
 */
export function FilterSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const { draft, edit, commit } = useDeferred(value, onChange, (a, b) => a === b)
  return (
    <Adorned icon={Icon.search} className="w-64">
      <input
        type="search"
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => edit(event.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit(draft)
        }}
        className={`${CONTROL} w-full`}
      />
    </Adorned>
  )
}

type Bounds = { min: number | null; max: number | null }

const parseBound = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

/**
 * Une fourchette : deux bornes facultatives, « min » et « max ».
 *
 * Les champs restent en texte avec un clavier numérique plutôt qu'en
 * `type="number"` : on veut pouvoir taper « 10 000 » avec l'espace, comme on
 * lit un prix, et un champ vidé doit redevenir « pas de borne ».
 *
 * Le champ garde un brouillon et ne remonte la valeur qu'après un temps de
 * silence : c'est la page qui filtre, et elle le fait à chaque valeur reçue.
 */
export function FilterRange({
  icon: Glyph,
  label,
  value,
  onChange,
}: {
  icon: LucideIcon
  /** Ce qu'on borne : « Niveau », « Prix HDV »… Sert d'accessibilité et de bulle. */
  label: string
  value: Bounds
  onChange: (value: Bounds) => void
}) {
  const { draft, edit, commit } = useDeferred(
    value,
    onChange,
    (a, b) => a.min === b.min && a.max === b.max,
  )

  const field = (bound: 'min' | 'max') => (
    <input
      inputMode="numeric"
      value={draft[bound] ?? ''}
      placeholder={bound}
      aria-label={`${label}, ${bound === 'min' ? 'minimum' : 'maximum'}`}
      onChange={(event) => edit({ ...draft, [bound]: parseBound(event.target.value) })}
      onBlur={() => commit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit(draft)
      }}
      className={FIELD_NUMBER}
    />
  )

  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5">
      <Tooltip content={label} className="flex">
        <Glyph className="size-4 shrink-0 cursor-help text-slate-500" aria-hidden />
      </Tooltip>
      {field('min')}
      <span className="text-slate-600" aria-hidden>
        –
      </span>
      {field('max')}
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
      className="ml-auto flex h-9 items-center gap-1.5 text-xs text-slate-500 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none"
    >
      <Icon.sortReset className="size-3.5 shrink-0" aria-hidden />
      Tout effacer
    </button>
  )
}

/**
 * Case à cocher, avec icône et bulle facultative pour dire ce qu'elle
 * restreint. `children` se pose après le libellé : un champ qui précise la
 * coche, comme le niveau du joueur.
 */
export function FilterToggle({
  icon: Glyph,
  label,
  checked,
  onChange,
  tip,
  disabled = false,
  children,
}: {
  icon: LucideIcon
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  tip?: string
  disabled?: boolean
  children?: ReactNode
}) {
  const control = (
    <label
      className={`flex h-9 items-center gap-2 text-sm ${
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
  const labelled = tip ? <Tooltip content={tip}>{control}</Tooltip> : control
  if (!children) return labelled
  return (
    <span className="flex items-center gap-2">
      {labelled}
      {children}
    </span>
  )
}
