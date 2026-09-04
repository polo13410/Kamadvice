/**
 * Copie l'adresse de la page courante, et le dit.
 *
 * `window.location.href` plutôt qu'une adresse reconstruite : c'est exactement
 * ce que l'utilisateur a sous les yeux, avec ses éventuels paramètres, et
 * aucune règle de construction à tenir à jour quand les routes bougent.
 */
import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/clipboard'
import { Icon } from '../lib/icons'
import { useTooltip } from './Tooltip'

/** Le temps que la confirmation reste lisible avant que le bouton se rende. */
const CONFIRM_MS = 2000

type State = 'idle' | 'done' | 'failed'

const LABELS: Record<State, string> = {
  idle: 'Copier le lien de cette page',
  done: 'Lien copié',
  failed: 'Copie impossible',
}

export default function ShareButton({ className = '' }: { className?: string }) {
  const [state, setState] = useState<State>('idle')
  const timer = useRef<number | undefined>(undefined)
  const tip = useTooltip(LABELS[state])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    window.clearTimeout(timer.current)
    const copied = await copyText(window.location.href)
    setState(copied ? 'done' : 'failed')
    timer.current = window.setTimeout(() => setState('idle'), CONFIRM_MS)
  }

  const Glyph = state === 'done' ? Icon.done : state === 'failed' ? Icon.warning : Icon.share

  return (
    <button
      {...tip.props}
      type="button"
      onClick={() => void copy()}
      aria-label={LABELS[state]}
      className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
        state === 'done'
          ? 'border-emerald-500/40 text-emerald-400'
          : state === 'failed'
            ? 'border-red-500/40 text-red-400'
            : 'border-slate-800 text-slate-400 hover:border-slate-700 hover:text-amber-400'
      } ${className}`}
    >
      <Glyph className="size-3.5 shrink-0" aria-hidden />
      {state === 'idle' ? 'Partager' : LABELS[state]}
      {tip.tooltip}
    </button>
  )
}
