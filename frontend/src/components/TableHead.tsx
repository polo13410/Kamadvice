/**
 * En-tête de colonne d'un tableau de bord : icône facultative, bulle
 * facultative pour la formule, et commande de tri facultative.
 *
 * Commun aux tableaux de bord métier, qui partagent la même grammaire : des
 * colonnes chiffrées, triables, expliquées dans une bulle. Le tableau du
 * catalogue (`ItemsTable`) reste à part, il est virtualisé en grille et non en
 * `<table>`.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Icon } from '../lib/icons'
import { Tooltip } from './Tooltip'

export type SortDir = 'asc' | 'desc'

/** Ce qu'un en-tête triable attend de sa page. `dir` est `null` quand le tri porte ailleurs. */
export interface SortControl {
  dir: SortDir | null
  onToggle: () => void
  /** Sans lui, pas de bouton pour revenir au classement par défaut. */
  onReset?: () => void
}

const TEXT_ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

const JUSTIFY = {
  left: '',
  right: 'justify-end',
  center: 'justify-center',
} as const

/**
 * `sticky` sur les `th` plutôt que sur `thead` : avec `border-collapse`, seule
 * la cellule se fige. La bordure du bas passe en ombre interne, une bordure
 * fusionnée ne suivant pas la cellule collée.
 */
export const TH_SHELL =
  'sticky top-0 z-10 bg-slate-900 px-2 py-2 font-medium shadow-[inset_0_-1px_0_var(--color-slate-800)]'

/**
 * La cellule des ingrédients d'un tableau de bord : autant par ligne que la
 * cellule en loge. 11 rem par ingrédient — le champ de prix (7 rem), la
 * pièce, et un nom qui ne se tronque pas trop tôt. Un seul sur un petit
 * écran, quatre ou cinq sur un grand : c'est la colonne « Ingrédients », sans
 * largeur fixe, qui grandit avec l'écran.
 */
export const INGREDIENT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-4 gap-y-1.5'

export default function Th({
  width = '',
  align = 'left',
  icon: Glyph,
  tip,
  sort,
  children,
}: {
  width?: string
  align?: keyof typeof TEXT_ALIGN
  icon?: LucideIcon
  tip?: string
  sort?: SortControl
  children: ReactNode
}) {
  const inner = (
    <>
      {Glyph && <Glyph className="size-3.5 shrink-0" aria-hidden />}
      {children}
    </>
  )
  const line = `flex items-center gap-1.5 whitespace-nowrap ${JUSTIFY[align]}`

  if (sort) {
    const Arrow = sort.dir === 'asc' ? Icon.sortAsc : Icon.sortDesc
    return (
      <th
        aria-sort={sort.dir === 'asc' ? 'ascending' : sort.dir === 'desc' ? 'descending' : 'none'}
        className={TH_SHELL + ` ${width} ${TEXT_ALIGN[align]}`}
      >
        <span className={`flex items-center gap-1 ${JUSTIFY[align]}`}>
          {sort.dir && sort.onReset && (
            <Tooltip content="Annuler le tri et revenir au classement par défaut">
              <button
                type="button"
                onClick={sort.onReset}
                aria-label="Annuler le tri"
                className="flex text-slate-500 hover:text-amber-400"
              >
                <Icon.sortReset className="size-3" aria-hidden />
              </button>
            </Tooltip>
          )}
          <Tooltip content={tip}>
            <button
              type="button"
              onClick={sort.onToggle}
              className={`${line} hover:text-amber-400 ${sort.dir ? 'text-amber-400' : ''}`}
            >
              {inner}
              <Arrow
                className={`size-3 shrink-0 ${sort.dir ? '' : 'text-slate-600'}`}
                aria-hidden
              />
            </button>
          </Tooltip>
        </span>
      </th>
    )
  }

  return (
    <th className={TH_SHELL + ` ${width} ${TEXT_ALIGN[align]}`}>
      {tip ? (
        <Tooltip content={tip} className={`${line} cursor-help`}>
          {inner}
        </Tooltip>
      ) : (
        <span className={line}>{inner}</span>
      )}
    </th>
  )
}
