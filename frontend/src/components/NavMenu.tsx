/**
 * Menu déroulant de navigation du header.
 *
 * C'est un *disclosure* — un bouton qui révèle une liste de liens — et non un
 * `role="menu"` ARIA. Le patron « menu » impose de piloter le focus au clavier
 * et transforme ses entrées en commandes : les liens y perdent leur ordre de
 * tabulation naturel, le clic milieu et le ctrl-clic. Pour une navigation de
 * site, l'APG recommande justement le disclosure, qui laisse le navigateur
 * faire son travail.
 *
 * Avec `to`, le libellé est lui-même un lien vers la page de la section (la
 * liste des métiers, l'élevage), et un chevron à part ouvre la liste : au
 * doigt, où le survol n'existe pas, c'est lui qu'on touche.
 *
 * Les entrées épinglées passent en tête, au-dessus d'un trait ; chaque entrée
 * qui porte une clé d'épingle a son bouton pour l'épingler ou la détacher,
 * à côté du lien et non dedans — un bouton dans un lien n'est pas valide.
 *
 * Pas de portail non plus, contrairement à `Tooltip` : le header est
 * `sticky` sans `overflow-hidden`, un panneau positionné en absolu s'en
 * échappe déjà proprement.
 *
 * Le survol ouvre le panneau, mais seulement à la souris : au doigt, le même
 * événement partirait au premier appui et se battrait avec le clic.
 */
import type { LucideIcon } from 'lucide-react'
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { pinnedFirst, togglePin, usePins } from '../data/pins'
import { Icon } from '../lib/icons'
import { isCurrent } from '../lib/pages'

export interface NavMenuItem {
  to: string
  label: string
  icon?: LucideIcon
  /** Une image à la place de l'icône : celle d'un métier, d'une monture. */
  glyph?: ReactNode
  /** Une ligne pour dire ce qu'on y trouve. Facultatif. */
  description?: string
  /** Clé d'épingle (voir `data/pins`) : l'entrée se laisse épingler. */
  pinKey?: string
}

/**
 * Délai avant la fermeture au survol. Le panneau est décollé du bouton : sans
 * ce sursis, traverser les quelques pixels qui les séparent le refermerait.
 */
export const CLOSE_DELAY_MS = 150

/**
 * Le panneau d'un menu du header, tel qu'il se déroule partout : sous son
 * bouton, décollé de 0,5 rem, avec la petite entrée en fondu de
 * `.dropdown-enter` (voir index.css). Le bord d'alignement s'ajoute.
 */
export const DROPDOWN =
  'dropdown-enter absolute top-full z-30 mt-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 py-1 shadow-lg shadow-black/50'

const TRIGGER =
  'flex items-center gap-1.5 rounded px-2 py-1 text-sm hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none'

export default function NavMenu({
  label,
  icon: Glyph,
  items,
  to,
  empty,
  align = 'left',
}: {
  label: string
  icon?: LucideIcon
  items: readonly NavMenuItem[]
  /** La page de la section : le libellé y mène, le chevron ouvre la liste. */
  to?: string
  /** Ce que dit le panneau quand la liste est vide. */
  empty?: ReactNode
  /** Bord du bouton sur lequel le panneau s'aligne. */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  /** Ouverture au clavier : le premier lien doit prendre le focus. */
  const [grabFocus, setGrabFocus] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const closing = useRef<number | undefined>(undefined)
  const { pathname } = useLocation()
  const pins = usePins()

  const cancelClose = () => window.clearTimeout(closing.current)
  useEffect(() => cancelClose, [])

  const active =
    (to !== undefined && isCurrent(pathname, to)) || items.some((item) => isCurrent(pathname, item.to))

  const ordered = pinnedFirst(items, (item) => item.pinKey, pins)

  /** Les liens du panneau, dans l'ordre du DOM : pas de ref par entrée. */
  const links = () => [...(panel.current?.querySelectorAll('a') ?? [])]

  // Fermer au changement de route couvre le clic sur une entrée comme le
  // bouton Retour du navigateur.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    // `pointerdown` et non `click` : le menu doit avoir disparu avant que le
    // clic extérieur n'atteigne sa cible, sinon il l'avale.
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  useEffect(() => {
    if (!open || !grabFocus) return
    links()[0]?.focus()
    setGrabFocus(false)
  }, [open, grabFocus])

  function close(focusTrigger: boolean) {
    setOpen(false)
    if (focusTrigger) trigger.current?.focus()
  }

  /** Déplace le focus de `step` liens, en bouclant aux extrémités. */
  function move(step: number) {
    const all = links()
    if (all.length === 0) return
    const from = all.findIndex((link) => link === document.activeElement)
    const to = from === -1 ? (step > 0 ? 0 : all.length - 1) : (from + step + all.length) % all.length
    all[to]?.focus()
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (!open) {
      setOpen(true)
      setGrabFocus(true)
      return
    }
    move(event.key === 'ArrowDown' ? 1 : -1)
  }

  const tone = active || open ? 'text-slate-100' : 'text-slate-400'
  const chevron = (
    <Icon.dropdown
      className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden
    />
  )

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={onKeyDown}
      // Sortie au Tab : `focusout` bulle, donc un focus qui quitte le
      // conteneur referme le panneau resté ouvert derrière.
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget)) setOpen(false)
      }}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') return
        cancelClose()
        setOpen(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') return
        cancelClose()
        closing.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
      }}
    >
      {to === undefined ? (
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={`${TRIGGER} ${tone}`}
        >
          {Glyph && <Glyph className="size-4 shrink-0" aria-hidden />}
          {label}
          {chevron}
        </button>
      ) : (
        <div className="flex items-center">
          <Link
            to={to}
            aria-current={isCurrent(pathname, to) ? 'page' : undefined}
            className={`${TRIGGER} pr-1 ${tone}`}
          >
            {Glyph && <Glyph className="size-4 shrink-0" aria-hidden />}
            {label}
          </Link>
          <button
            ref={trigger}
            type="button"
            aria-label={`Ouvrir la liste : ${label}`}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className={`rounded py-1.5 pr-1.5 pl-0.5 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${tone}`}
          >
            {chevron}
          </button>
        </div>
      )}

      {open && (
        <div
          ref={panel}
          id={panelId}
          className={`${DROPDOWN} max-h-[70vh] min-w-60 ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {ordered.items.length === 0 && empty !== undefined && (
            <p className="max-w-64 px-3 py-2 text-xs text-slate-500">{empty}</p>
          )}
          {ordered.items.map((item, index) => (
            <Fragment key={item.to}>
              {index > 0 && index === ordered.divider && (
                <div role="separator" className="my-1 border-t border-slate-800" />
              )}
              <MenuRow
                item={item}
                current={isCurrent(pathname, item.to)}
                pinned={item.pinKey !== undefined && pins.has(item.pinKey)}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/** Une entrée du panneau : le lien, et l'épingle à côté s'il y a lieu. */
function MenuRow({ item, current, pinned }: { item: NavMenuItem; current: boolean; pinned: boolean }) {
  const ItemGlyph = item.icon
  return (
    <div className="flex items-center">
      <Link
        to={item.to}
        aria-current={current ? 'page' : undefined}
        className={`flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-sm hover:bg-slate-800 hover:text-amber-400 focus-visible:bg-slate-800 focus-visible:outline-none ${
          current ? 'text-amber-400' : 'text-slate-300'
        }`}
      >
        {item.glyph !== undefined ? (
          <span className="mt-0.5 shrink-0">{item.glyph}</span>
        ) : (
          ItemGlyph && <ItemGlyph className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <span className="min-w-0">
          <span className="block truncate">{item.label}</span>
          {item.description && (
            <span className="block text-xs text-slate-500">{item.description}</span>
          )}
        </span>
      </Link>
      {item.pinKey !== undefined && (
        <PinButton pinKey={item.pinKey} pinned={pinned} label={item.label} className="mr-1.5" />
      )}
    </div>
  )
}

/**
 * Le bouton d'épingle, tel qu'il se montre dans toutes les listes : discret
 * tant que l'entrée n'est pas épinglée, ambre et plein quand elle l'est.
 * Il arrête la propagation du clic : posé dans une option de liste, il ne
 * doit pas la choisir.
 */
export function PinButton({
  pinKey,
  pinned,
  label,
  className = '',
}: {
  pinKey: string
  pinned: boolean
  label: string
  className?: string
}) {
  const title = pinned ? `Détacher ${label}` : `Épingler ${label}`
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={title}
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        togglePin(pinKey)
      }}
      className={`shrink-0 rounded p-1 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
        pinned ? 'text-amber-400 hover:text-slate-400' : 'text-slate-600 hover:text-amber-400'
      } ${className}`}
    >
      <Icon.pin className={`size-3.5 ${pinned ? 'fill-current' : ''}`} aria-hidden />
    </button>
  )
}
