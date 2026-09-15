/**
 * Choisir une variété de monture dans une fenêtre : une grille de cartes —
 * icône, nom, pastille de génération —, toutes à la suite, avec trois
 * filtres qui se déduisent de la liste proposée : le nom, la génération, la
 * couleur. Une monture se reconnaît à son image avant son nom ; on cherche
 * « tout ce qui a du Rousse » plus souvent qu'un nom exact.
 *
 * Sert à créer un plan, à ajouter une monture à l'étable, à renseigner les
 * parents d'une monture. La fenêtre se ferme au choix, à Échap, ou en
 * cliquant à côté.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCatalog } from '../data/catalogContext'
import { varietyName } from '../data/mounts'
import type { MountVariety, VarietyId } from '../domain/types'
import { normalize } from '../lib/format'
import { Icon } from '../lib/icons'
import { FIELD_TABLE } from './Adorned'
import ItemIcon from './ItemIcon'
import { GenerationBadge, generationTone } from './MountVariety'

/** Les couleurs d'une variété : les mots de son nom, « Amande et Rousse » en a deux. */
const colorsOf = (variety: MountVariety): string[] => variety.name.split(' et ')

const CHIP =
  'flex h-6 items-center rounded-full border px-2 text-[11px] focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none'

export function VarietyGrid({
  value,
  options,
  onChange,
  allowNone = false,
  className = '',
}: {
  value: VarietyId | null
  options: readonly MountVariety[]
  onChange: (id: VarietyId | null) => void
  /** Propose aussi « Inconnu », pour un parent qu'on ne connaît pas. */
  allowNone?: boolean
  className?: string
}) {
  const catalog = useCatalog()
  const [query, setQuery] = useState('')
  const [generations, setGenerations] = useState<ReadonlySet<number>>(new Set())
  const [colors, setColors] = useState<ReadonlySet<string>>(new Set())

  // Les filtres proposés sont ceux de la liste : les muldos n'ont pas de
  // Rousse mais un Roux, et pas de génération 11.
  const allGenerations = useMemo(
    () => [...new Set(options.map((variety) => variety.generation))].sort((a, b) => a - b),
    [options],
  )
  const allColors = useMemo(
    () =>
      [...new Set(options.flatMap(colorsOf))].sort((a, b) => a.localeCompare(b, 'fr')),
    [options],
  )

  const toggle = <T,>(set: ReadonlySet<T>, item: T): Set<T> => {
    const next = new Set(set)
    if (next.has(item)) next.delete(item)
    else next.add(item)
    return next
  }

  const needle = normalize(query.trim())
  // Générations : l'une ou l'autre. Couleurs : toutes à la fois — Amande et
  // Rousse cochées ne laissent que ce qui a les deux.
  const shown = options.filter(
    (variety) =>
      (needle === '' || normalize(variety.name).includes(needle)) &&
      (generations.size === 0 || generations.has(variety.generation)) &&
      (colors.size === 0 || [...colors].every((color) => colorsOf(variety).includes(color))),
  )

  // Les filtres en tête, la grille qui défile dessous : c'est le panneau qui
  // borne la hauteur (`min-h-0` laisse la grille céder).
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-3 p-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrer par nom…"
          aria-label="Filtrer les variétés par nom"
          className={`${FIELD_TABLE} w-44 text-left`}
        />
        {allGenerations.length > 1 && (
          <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Générations">
            {allGenerations.map((generation) => {
              const active = generations.has(generation)
              return (
                <button
                  key={generation}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGenerations(toggle(generations, generation))}
                  className={`${CHIP} tabular-nums ${
                    active ? generationTone(generation) : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  G{generation}
                </button>
              )
            })}
          </span>
        )}
      </div>
      {allColors.length > 1 && (
        <span className="flex flex-wrap items-center gap-1" role="group" aria-label="Couleurs">
          {allColors.map((color) => {
            const active = colors.has(color)
            return (
              <button
                key={color}
                type="button"
                aria-pressed={active}
                onClick={() => setColors(toggle(colors, color))}
                className={`${CHIP} ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                    : 'border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {color}
              </button>
            )
          })}
        </span>
      )}
      {shown.length === 0 && !allowNone ? (
        <p className="text-xs text-slate-500">Aucune variété ne répond à ces filtres.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto" role="radiogroup" aria-label="Variétés">
          {allowNone && (
            <button
              type="button"
              role="radio"
              aria-checked={value === null}
              onClick={() => onChange(null)}
              className={`flex items-center gap-2 rounded border px-1.5 py-1 text-left text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
                value === null
                  ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                  : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-600 hover:bg-slate-800/80 hover:text-slate-300'
              }`}
            >
              <span className="inline-block w-7 text-center text-lg leading-7 text-slate-600">?</span>
              Inconnu
            </button>
          )}
          {shown.map((variety) => {
            const item = catalog.byId.get(variety.id)
            const active = variety.id === value
            return (
              <button
                key={variety.id}
                type="button"
                role="radio"
                aria-checked={active}
                title={varietyName(variety)}
                onClick={() => onChange(variety.id)}
                className={`flex max-w-64 items-center gap-2 rounded border px-1.5 py-1 text-left text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
                  active
                    ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                    : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/80 hover:text-slate-100'
                }`}
              >
                {item ? (
                  <ItemIcon item={item} size={28} />
                ) : (
                  <Icon.mount className="size-7 shrink-0 text-slate-600" aria-hidden />
                )}
                <span className="min-w-0 truncate">{variety.name}</span>
                <GenerationBadge generation={variety.generation} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Le panneau : sa largeur, sa hauteur, et l'écart au bouton et au bord de la fenêtre. */
const PANEL_WIDTH = 672
const PANEL_HEIGHT = 416
const GAP = 6
const EDGE = 8

/**
 * Le bouton qui déroule la grille : fermé, il montre la variété retenue —
 * icône, nom, génération — ou l'invite. `compact` pour une cellule de
 * tableau, à la hauteur de ses voisins.
 *
 * Le panneau a une taille fixe, les filtres en tête et la grille qui défile
 * dessous. Il est posé dans un portail, en `fixed` sous le bouton : dans une
 * cellule de tableau, un panneau en absolu serait rogné par le conteneur.
 * Il suit le bouton au défilement et se referme au choix, à Échap, ou en
 * cliquant à côté.
 */
export function VarietyGridPicker({
  value,
  options,
  onChange,
  placeholder,
  allowNone = false,
  compact = false,
  className = '',
}: {
  value: VarietyId | null
  options: readonly MountVariety[]
  onChange: (id: VarietyId | null) => void
  placeholder: string
  allowNone?: boolean
  compact?: boolean
  className?: string
}) {
  const catalog = useCatalog()
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ left: number; top: number; width: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const chosen = value === null ? undefined : catalog.mounts.byId.get(value)
  const item = chosen && catalog.byId.get(chosen.id)

  // Sous le bouton, aligné à sa gauche, ramené dans la fenêtre s'il
  // dépasse ; au-dessus s'il n'y a pas la place en dessous.
  const locate = () => {
    const anchor = trigger.current?.getBoundingClientRect()
    if (!anchor) return
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * EDGE)
    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE))
    const below = anchor.bottom + GAP
    const top =
      below + PANEL_HEIGHT <= window.innerHeight - EDGE || anchor.top - GAP - PANEL_HEIGHT < EDGE
        ? below
        : anchor.top - GAP - PANEL_HEIGHT
    setPlace({ left, top, width })
  }

  useLayoutEffect(() => {
    if (open) locate()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    // `pointerdown` et non `click` : le panneau doit avoir disparu avant que
    // le clic extérieur n'atteigne sa cible.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', locate)
    window.addEventListener('resize', locate)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', locate)
      window.removeEventListener('resize', locate)
    }
  }, [open])

  const iconSize = compact ? 20 : 24
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((state) => !state)}
        className={`flex items-center gap-2 rounded border border-slate-700 bg-slate-900 px-2 hover:border-amber-500/60 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
          compact ? 'h-7 text-xs' : 'h-9 text-sm'
        } ${chosen ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'} ${className}`}
      >
        {chosen ? (
          <>
            {item ? <ItemIcon item={item} size={iconSize} /> : <Icon.mount className="size-5 text-slate-600" aria-hidden />}
            <span className="truncate">{chosen.name}</span>
            <GenerationBadge generation={chosen.generation} />
          </>
        ) : (
          <>
            <Icon.mount className="size-4 shrink-0 text-slate-500" aria-hidden />
            {placeholder}
          </>
        )}
        <Icon.dropdown
          className={`size-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label={placeholder}
            style={{
              position: 'fixed',
              left: place?.left ?? 0,
              top: place?.top ?? 0,
              width: place?.width ?? PANEL_WIDTH,
              height: PANEL_HEIGHT,
              visibility: place ? 'visible' : 'hidden',
            }}
            className="dropdown-enter z-40 flex flex-col rounded-lg border border-slate-800 bg-slate-900 shadow-2xl shadow-black/60"
          >
            <VarietyGrid
              value={value}
              options={options}
              allowNone={allowNone}
              onChange={(id) => {
                onChange(id)
                setOpen(false)
              }}
            />
          </div>,
          document.body,
        )}
    </>
  )
}
