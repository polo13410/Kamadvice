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
 * Pas de portail non plus, contrairement à `Tooltip` : le header est
 * `sticky` sans `overflow-hidden`, un panneau positionné en absolu s'en
 * échappe déjà proprement.
 *
 * Le survol ouvre le panneau, mais seulement à la souris : au doigt, le même
 * événement partirait au premier appui et se battrait avec le clic.
 */
import type { LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Icon } from '../lib/icons'

export interface NavMenuItem {
  to: string
  label: string
  icon?: LucideIcon
  /** Une ligne pour dire ce qu'on y trouve. Facultatif. */
  description?: string
}

/**
 * Délai avant la fermeture au survol. Le panneau est décollé du bouton : sans
 * ce sursis, traverser les quelques pixels qui les séparent le refermerait.
 */
const CLOSE_DELAY_MS = 150

export default function NavMenu({
  label,
  icon: Glyph,
  items,
}: {
  label: string
  icon?: LucideIcon
  items: readonly NavMenuItem[]
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

  const cancelClose = () => window.clearTimeout(closing.current)
  useEffect(() => cancelClose, [])

  const active = items.some((item) => item.to === pathname)

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
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
          active || open ? 'text-slate-100' : 'text-slate-400'
        }`}
      >
        {Glyph && <Glyph className="size-4 shrink-0" aria-hidden />}
        {label}
        <Icon.dropdown
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={panel}
          id={panelId}
          className="absolute left-0 top-full z-30 mt-2 min-w-52 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 py-1 shadow-lg shadow-black/50"
        >
          {items.map((item) => {
            const ItemGlyph = item.icon
            const current = item.to === pathname
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={current ? 'page' : undefined}
                className={`flex items-start gap-2 px-3 py-2 text-sm hover:bg-slate-800 hover:text-amber-400 focus-visible:bg-slate-800 focus-visible:outline-none ${
                  current ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                {ItemGlyph && <ItemGlyph className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span className="min-w-0">
                  {item.label}
                  {item.description && (
                    <span className="block text-xs text-slate-500">{item.description}</span>
                  )}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
