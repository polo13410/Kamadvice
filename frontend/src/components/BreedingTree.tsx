/**
 * L'arbre d'un plan d'élevage, repliable nœud par nœud : la variété visée en
 * haut, ses deux parents en dessous, et ainsi de suite jusqu'aux montures de
 * départ. Chaque nœud dit où en est son emplacement.
 *
 * Le même arbre sert à la fiche d'une monture — recette théorique, sans
 * aucune monture — et à un plan en cours, où les emplacements se remplissent.
 * En `<details>` natifs : replier se fait sans état à tenir, et un arbre de
 * génération 10 (cinq cents nœuds) reste replié par défaut au-delà des
 * premiers niveaux.
 */
import type { ReactNode } from 'react'
import type { Cross, MountStatus, Slot } from '../domain/breeding'
import { formatChance } from '../lib/format'
import { Icon } from '../lib/icons'
import VarietyLink from './MountVariety'
import { Tooltip } from './Tooltip'

/** Profondeur ouverte par défaut : la cible, ses parents, leurs parents. */
const OPEN_DEPTH = 2

export const STATUS_LABEL: Record<MountStatus, string> = {
  missing: 'Manquante',
  owned: 'Possédée',
  obtained: 'Obtenue',
  preparing: 'En préparation',
  fertile: 'Féconde',
  bred: 'Reproduction effectuée',
}

const STATUS_STYLE: Record<MountStatus, string> = {
  missing: 'border-slate-800 text-slate-500',
  owned: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  obtained: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  preparing: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  fertile: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
  bred: 'border-slate-700 bg-slate-800 text-slate-400',
}

/** Pastille d'état d'une monture. */
export function StatusBadge({ status }: { status: MountStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium ${STATUS_STYLE[status]}`}
    >
      {status === 'bred' && <Icon.sterile className="size-2.5" aria-hidden />}
      {STATUS_LABEL[status]}
    </span>
  )
}

export const STATE_LABEL: Record<Cross['state'], string> = {
  done: 'Faite',
  ready: 'Prête',
  'in-progress': 'En cours',
  waiting: 'En attente',
  blocked: 'Bloquée',
}

const STATE_STYLE: Record<Cross['state'], { icon: typeof Icon.stepDone; className: string }> = {
  done: { icon: Icon.stepDone, className: 'text-emerald-400' },
  ready: { icon: Icon.stepReady, className: 'text-amber-300' },
  'in-progress': { icon: Icon.stepProgress, className: 'text-sky-300' },
  waiting: { icon: Icon.stepWaiting, className: 'text-slate-500' },
  blocked: { icon: Icon.stepBlocked, className: 'text-rose-400' },
}

/** L'état d'un croisement, icône et mot. */
export function StateBadge({ state, short = false }: { state: Cross['state']; short?: boolean }) {
  const { icon: Glyph, className } = STATE_STYLE[state]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${className}`}>
      <Glyph className="size-3.5" aria-hidden />
      {!short && STATE_LABEL[state]}
    </span>
  )
}

/** Le sexe d'une monture, en glyphe. */
export function SexGlyph({ sex, className = 'size-3.5' }: { sex: 'male' | 'female' | null; className?: string }) {
  if (sex === 'male') return <Icon.male className={`${className} shrink-0 text-sky-400`} aria-label="Mâle" />
  if (sex === 'female') return <Icon.female className={`${className} shrink-0 text-rose-400`} aria-label="Femelle" />
  return <span className={`${className} inline-block shrink-0 text-center text-slate-600`} aria-label="Sexe inconnu">?</span>
}

export default function BreedingTree({
  root,
  theoretical = false,
  multiplicities,
  renderSlot,
}: {
  root: Slot
  /** Recette théorique : pas d'états à montrer, juste les variétés et les chances. */
  theoretical?: boolean
  /** Nombre moyen de fois où chaque emplacement devra être pourvu. */
  multiplicities?: ReadonlyMap<string, number>
  /** Ce que la page ajoute sous un nœud : un éditeur de monture, par exemple. */
  renderSlot?: (slot: Slot) => ReactNode
}) {
  return (
    <div className="text-sm">
      <Node
        slot={root}
        theoretical={theoretical}
        multiplicities={multiplicities}
        renderSlot={renderSlot}
      />
    </div>
  )
}

function Node({
  slot,
  theoretical,
  multiplicities,
  renderSlot,
}: {
  slot: Slot
  theoretical: boolean
  multiplicities?: ReadonlyMap<string, number>
  renderSlot?: (slot: Slot) => ReactNode
}) {
  const cross = slot.cross
  const expected = multiplicities?.get(slot.path)
  const extra = renderSlot?.(slot)

  const head = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <VarietyLink variety={slot.variety} size={28} className="min-w-0" />
      {!theoretical && (
        <>
          {slot.mount && <SexGlyph sex={slot.mount.sex} />}
          {slot.mount && (
            <span className="text-xs tabular-nums text-slate-500">niv. {slot.mount.level}</span>
          )}
          <StatusBadge status={slot.status} />
        </>
      )}
      {cross && (
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {!theoretical && <StateBadge state={cross.state} />}
          <Tooltip
            content={
              cross.chanceFromMounts
                ? 'Chance de la génération cible, calculée sur les niveaux des deux montures en place'
                : 'Chance de la génération cible, au niveau visé du plan pour les deux parents'
            }
            className="flex cursor-help items-center gap-1 tabular-nums"
          >
            <Icon.chance className="size-3.5" aria-hidden />
            {formatChance(cross.chance)}
          </Tooltip>
          {cross.recipeCount > 1 && (
            <Tooltip content={`Recette ${cross.recipeIndex + 1} sur ${cross.recipeCount} : cette variété a plusieurs couples de parents possibles`}>
              <span className="cursor-help">recette {cross.recipeIndex + 1}/{cross.recipeCount}</span>
            </Tooltip>
          )}
        </span>
      )}
      {slot.collapsed && (
        <span className="text-xs text-slate-500">déjà possédée : rien à élever en dessous</span>
      )}
      {expected !== undefined && expected > 1.05 && (
        <Tooltip
          content="Nombre moyen de fois où cet emplacement devra être pourvu, tentatives et parents stériles compris"
          className="cursor-help text-xs tabular-nums text-slate-500"
        >
          × {expected.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} en moyenne
        </Tooltip>
      )}
    </span>
  )

  if (!cross) {
    return (
      <div className="py-1 pl-5">
        {head}
        {extra}
      </div>
    )
  }

  return (
    <details open={slot.depth < OPEN_DEPTH} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 marker:hidden [&::-webkit-details-marker]:hidden">
        <Icon.next
          className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
          aria-hidden
        />
        {head}
      </summary>
      {extra && <div className="pl-5">{extra}</div>}
      <div className="ml-2 border-l border-slate-800 pl-3">
        {cross.parents.map((parent) => (
          <Node
            key={parent.path}
            slot={parent}
            theoretical={theoretical}
            multiplicities={multiplicities}
            renderSlot={renderSlot}
          />
        ))}
      </div>
    </details>
  )
}
