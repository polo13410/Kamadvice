/**
 * L'arbre d'un plan d'élevage, repliable nœud par nœud : la variété visée en
 * haut, ses deux parents en dessous, jusqu'aux montures de départ. Chaque
 * nœud dit d'où viendra sa monture.
 *
 * Le même arbre sert à la fiche d'une monture — recette théorique, sans
 * étable — et à un plan en cours. En `<details>` natifs : replier se fait
 * sans état à tenir, et un arbre de génération 10 reste replié par défaut
 * au-delà des premiers niveaux.
 */
import type { Cross, Slot, SlotSource } from '../domain/breeding'
import { formatChance } from '../lib/format'
import { Icon } from '../lib/icons'
import VarietyLink, { MountChip } from './MountVariety'
import { Tooltip } from './Tooltip'

/** Profondeur ouverte par défaut : la cible, ses parents, leurs parents. */
const OPEN_DEPTH = 2

const SOURCE_LABEL: Record<SlotSource, string> = {
  mount: 'À l’étable',
  clone: 'Par clonage',
  cross: 'À faire naître',
  capture: 'À capturer',
}

const SOURCE_STYLE: Record<SlotSource, string> = {
  mount: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  clone: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  cross: 'border-slate-700 text-slate-400',
  capture: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

/** D'où viendra la monture d'un emplacement, en pastille. */
export function SourceBadge({ source }: { source: SlotSource }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-medium ${SOURCE_STYLE[source]}`}>
      {SOURCE_LABEL[source]}
    </span>
  )
}

export const STATE_LABEL: Record<Cross['state'], string> = {
  ready: 'Parents en place',
  waiting: 'En attente d’un parent',
  blocked: 'Bloqué',
}

const STATE_STYLE: Record<Cross['state'], { icon: typeof Icon.stepDone; className: string }> = {
  ready: { icon: Icon.stepReady, className: 'text-emerald-400' },
  waiting: { icon: Icon.stepWaiting, className: 'text-slate-500' },
  blocked: { icon: Icon.stepBlocked, className: 'text-rose-400' },
}

/** L'état d'un croisement, icône et mot. */
export function StateBadge({ state }: { state: Cross['state'] }) {
  const { icon: Glyph, className } = STATE_STYLE[state]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${className}`}>
      <Glyph className="size-3.5" aria-hidden />
      {STATE_LABEL[state]}
    </span>
  )
}

/**
 * L'état d'un croisement en un cercle, le mot en infobulle : pointillé gris
 * sans aucun parent, moitié jaune moitié pointillée avec un parent sur deux,
 * plein bleu quand les deux sont là, plein vert une fois la monture obtenue,
 * rouge barré quand quelque chose bloque.
 */
export function StepCircle({
  cross,
  done = false,
  className = 'size-4',
}: {
  cross: Cross | null
  /** La monture est à l'étable : l'étape est derrière nous. */
  done?: boolean
  className?: string
}) {
  const owned = cross ? cross.parents.filter((parent) => parent.mount !== null).length : 2
  const label = done
    ? 'Obtenue : la monture est à l’étable'
    : cross?.state === 'blocked'
      ? `Bloqué : ${cross.issues.join(' ; ')}`
      : owned === 2
        ? 'Les deux parents sont à l’étable : prêt à accoupler'
        : owned === 1
          ? 'Un parent sur deux à l’étable'
          : 'En attente des deux parents'

  let glyph: React.ReactNode
  if (done) {
    glyph = <Icon.stepDone className={`${className} text-emerald-400`} aria-hidden />
  } else if (cross?.state === 'blocked') {
    glyph = <Icon.stepBlocked className={`${className} text-rose-400`} aria-hidden />
  } else if (owned === 2) {
    glyph = (
      <svg viewBox="0 0 16 16" className={`${className} text-sky-400`} aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="currentColor" />
      </svg>
    )
  } else if (owned === 1) {
    glyph = (
      <svg viewBox="0 0 16 16" className={className} aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" className="text-slate-600" />
        <path d="M8 1.5 A6.5 6.5 0 0 0 8 14.5 Z" fill="currentColor" className="text-amber-400" />
      </svg>
    )
  } else {
    glyph = <Icon.stepWaiting className={`${className} text-slate-600`} aria-hidden />
  }

  return (
    <Tooltip content={label} className="flex shrink-0 cursor-help items-center">
      {glyph}
      <span className="sr-only">{label}</span>
    </Tooltip>
  )
}

export default function BreedingTree({ root, theoretical = false }: { root: Slot; theoretical?: boolean }) {
  return (
    <div className="text-sm">
      <Node slot={root} theoretical={theoretical} />
    </div>
  )
}

function Node({ slot, theoretical }: { slot: Slot; theoretical: boolean }) {
  const cross = slot.cross
  const head = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <VarietyLink variety={slot.variety} size={28} className="min-w-0" />
      {!theoretical && slot.mount && <MountChip mount={slot.mount} />}
      {!theoretical && !slot.mount && <SourceBadge source={slot.source} />}
      {!theoretical && slot.clone && (
        <span className="text-xs text-slate-500">
          copie de la stérile, contre {slot.clone.partner.sex === 'female' ? 'une' : 'un'}{' '}
          {slot.clone.partner.variety === slot.variety.id ? 'de même variété' : 'autre'}
        </span>
      )}
      {!theoretical && slot.issue && <span className="text-xs text-rose-400">{slot.issue}</span>}
      {cross && (
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {!theoretical && <StateBadge state={cross.state} />}
          <Tooltip
            content={
              cross.chanceFromMounts
                ? 'Chance de la génération cible, sur les niveaux des deux montures en place'
                : 'Chance de la génération cible, au niveau visé du plan pour les deux parents'
            }
            className="flex cursor-help items-center gap-1 tabular-nums"
          >
            <Icon.chance className="size-3.5" aria-hidden />
            {formatChance(cross.chance)}
          </Tooltip>
          {cross.recipeCount > 1 && (
            <Tooltip content={`Recette ${cross.recipeIndex + 1} sur ${cross.recipeCount} : cette variété a plusieurs couples de parents possibles`}>
              <span className="cursor-help">
                recette {cross.recipeIndex + 1}/{cross.recipeCount}
              </span>
            </Tooltip>
          )}
        </span>
      )}
    </span>
  )

  if (!cross) return <div className="py-1 pl-5">{head}</div>

  return (
    <details open={slot.depth < OPEN_DEPTH} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 [&::-webkit-details-marker]:hidden">
        <Icon.next
          className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {head}
      </summary>
      <div className="ml-2 border-l border-slate-800 pl-3">
        {cross.parents.map((parent) => (
          <Node key={parent.path} slot={parent} theoretical={theoretical} />
        ))}
      </div>
    </details>
  )
}
