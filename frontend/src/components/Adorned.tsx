import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** Style commun des contrôles de filtre (le `pl-9` loge l'icône). */
export const CONTROL =
  'rounded border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none'

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
