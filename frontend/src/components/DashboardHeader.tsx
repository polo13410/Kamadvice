/**
 * En-tête d'un tableau de bord : titre, phrase de méthode, et les quelques
 * chiffres qui orientent la saisie (lignes affichées, prix connus…).
 *
 * Commun aux tableaux de bord métier, pour que l'ouverture d'une page soit la
 * même d'un métier à l'autre.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export interface DashboardStat {
  icon: LucideIcon
  label: ReactNode
}

export default function DashboardHeader({
  icon: Glyph,
  glyph,
  title,
  description,
  stats,
  children,
}: {
  icon: LucideIcon
  /** Une image à la place de l'icône : celle d'un métier, par exemple. */
  glyph?: ReactNode
  title: string
  description: ReactNode
  stats: DashboardStat[]
  /** Ce que la page pose à droite du titre : réglage du joueur, actions. */
  children?: ReactNode
}) {
  // Les chiffres voisinent avec les actions, à droite du titre, comme sur la
  // page des favoris : ils disent où en est la saisie, juste à côté de ce qui
  // permet de la faire avancer.
  return (
    <header className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
          {glyph ?? <Glyph className="size-5 shrink-0 text-amber-400" aria-hidden />}
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {stats.map((stat, index) => (
            <span key={index} className="flex items-center gap-1.5 text-xs text-slate-500">
              <stat.icon className="size-3.5 shrink-0" aria-hidden />
              {stat.label}
            </span>
          ))}
          {children}
        </div>
      </div>
      <p className="text-sm text-slate-500">{description}</p>
    </header>
  )
}
