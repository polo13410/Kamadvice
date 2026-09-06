/**
 * Choix du serveur de jeu : un bouton qui déroule la liste des serveurs, chacun
 * avec son emblème.
 *
 * Un `<select>` natif ne sait pas afficher d'image. C'est donc un combobox
 * « sélection seule » au sens de l'APG : le focus ne quitte jamais le bouton,
 * la liste se parcourt aux flèches et l'option visée est désignée par
 * `aria-activedescendant`. La liste empêche le `pointerdown` de lui voler le
 * focus, sans quoi la sortie de focus la refermerait avant le clic.
 *
 * Fermeture comme `NavMenu` : clic extérieur, Échap, sortie au Tab.
 *
 * Deux habillages du même bouton : `field`, un champ bordé à la hauteur des
 * contrôles de l'app, pour l'accueil ; `header`, texte nu accordé aux liens
 * du header, où il rappelle le serveur courant et permet d'en changer.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { KIND_LABEL, SERVERS, setServer, useServer } from '../data/servers'
import { Icon } from '../lib/icons'
import { BUTTON } from './Adorned'
import ServerIcon from './ServerIcon'

const TRIGGER = {
  field: `${BUTTON} pl-1.5 text-slate-100`,
  header:
    'flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-300 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none',
}

export default function ServerPicker({
  variant = 'field',
  className = '',
}: {
  variant?: keyof typeof TRIGGER
  className?: string
}) {
  const server = useServer()
  const [open, setOpen] = useState(false)
  /** Rang de l'option visée au clavier ou sous la souris. */
  const [active, setActive] = useState(() => SERVERS.indexOf(server))
  const root = useRef<HTMLDivElement>(null)
  const listId = useId()
  const optionId = (index: number) => `${listId}-${index}`

  // À l'ouverture, on repart du serveur courant, pas de la dernière option survolée.
  useEffect(() => {
    if (open) setActive(SERVERS.indexOf(server))
  }, [open, server])

  useEffect(() => {
    if (!open) return
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' })
  })

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  function choose(index: number) {
    const picked = SERVERS[index]
    if (picked) setServer(picked.id)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      if (!open) return
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => Math.min(Math.max(index + step, 0), SERVERS.length - 1))
      return
    }
    if (!open) return
    if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(SERVERS.length - 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      // Fermé, ces touches déclenchent le clic du bouton, qui ouvre : rien à faire.
      event.preventDefault()
      choose(active)
    }
  }

  return (
    <div
      ref={root}
      className={`relative ${className}`}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label="Serveur de jeu"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => setOpen((value) => !value)}
        className={TRIGGER[variant]}
      >
        <ServerIcon server={server} size={variant === 'field' ? 24 : 20} />
        <span className="font-medium">{server.name}</span>
        {variant === 'field' && (
          <span className="text-xs text-slate-500">{KIND_LABEL[server.kind]}</span>
        )}
        <Icon.dropdown
          className={`size-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Serveurs de jeu"
          onPointerDown={(event) => event.preventDefault()}
          className="absolute left-0 top-full z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 py-1 shadow-lg shadow-black/50"
        >
          {SERVERS.map((candidate, index) => {
            const selected = candidate === server
            const highlighted = index === active
            return (
              <div
                key={candidate.id}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm ${
                  highlighted ? 'bg-slate-800 text-amber-400' : selected ? 'text-amber-400' : 'text-slate-300'
                }`}
              >
                <ServerIcon server={candidate} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block">{candidate.name}</span>
                  <span className="block text-xs text-slate-500">{KIND_LABEL[candidate.kind]}</span>
                </span>
                {selected && <Icon.done className="size-4 shrink-0" aria-hidden />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
