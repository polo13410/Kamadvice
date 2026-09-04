import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * La convention de taille des contrôles, en un seul endroit.
 *
 * Deux gabarits, pas plus : les contrôles d'une barre (filtres, boutons
 * d'en-tête) font 2,25 rem de haut ; les champs posés dans un tableau font
 * 1,75 rem, pour des lignes denses. Une hauteur explicite plutôt qu'un
 * `padding` : un `select`, un `input` et un `button` ne calculent pas leur
 * hauteur de la même façon, et ne s'alignaient jamais tout à fait.
 */
export const FIELD =
  'h-9 rounded border border-slate-700 bg-slate-900 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none'

/** Un `FIELD` précédé d'une icône (le `pl-9` la loge) : voir `Adorned`. */
export const CONTROL = `${FIELD} pl-9 pr-3`

/** Champ numérique d'une barre : étroit, chiffres alignés à droite. */
export const FIELD_NUMBER = `${FIELD} w-24 px-2 text-right tabular-nums`

/** Champ d'un tableau : plus bas, même style. */
export const FIELD_TABLE =
  'h-7 w-28 rounded border border-slate-700 bg-slate-900 px-2 text-right text-sm tabular-nums text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none'

/** Bouton d'une barre, à la hauteur des champs. */
export const BUTTON =
  'flex h-9 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 text-sm text-slate-300 hover:border-amber-500/60 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Contrôle de formulaire précédé d'une icône, posée par-dessus le champ.
 *
 * L'icône est dans le champ plutôt qu'à côté : les filtres se suivent sur une
 * même ligne, et un libellé par contrôle la ferait déborder.
 */
export default function Adorned({
  icon: Glyph,
  className = '',
  children,
}: {
  icon: LucideIcon
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Glyph className="pointer-events-none absolute left-3 size-4 text-slate-500" aria-hidden />
      {children}
    </div>
  )
}
