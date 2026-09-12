/**
 * Un plan d'élevage : la prochaine chose à faire, puis tout ce qui reste.
 *
 * La page ne garde aucun état propre : elle déroule le plan sur l'étable à
 * chaque rendu (`domain/breeding.ts`), et chaque geste — cocher une monture
 * possédée, enregistrer un accouplement ou un clonage — passe par l'étable,
 * d'où tout se recalcule. De haut en bas : la suggestion, les réglages, le
 * coût du plan tel qu'il est, les croisements restants dans l'ordre, et,
 * repliés, l'étable de l'espèce et l'arbre complet.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BUTTON, FIELD_NUMBER, FIELD_TABLE } from '../components/Adorned'
import BreedingTree, { StateBadge } from '../components/BreedingTree'
import DashboardHeader from '../components/DashboardHeader'
import { FilterBar, FilterDivider, FilterToggle } from '../components/FilterBar'
import ItemIcon from '../components/ItemIcon'
import Kamas from '../components/Kamas'
import VarietyLink, { MountChip, SexGlyph, VarietySelect } from '../components/MountVariety'
import NotFound from '../components/NotFound'
import PriceField from '../components/PriceField'
import StablePanel, { mountAnchor } from '../components/StablePanel'
import { Tooltip } from '../components/Tooltip'
import { useCatalog } from '../data/catalogContext'
import { useIgnored } from '../data/ignored'
import { addMount, recordBreeding, recordClone, removeMount, updateMount, useStable } from '../data/inventory'
import { varietyName } from '../data/mounts'
import {
  chooseRecipe,
  removePlan,
  resetChoices,
  setFeedPoints,
  setTargetLevel,
  updateSettings,
  usePlan,
} from '../data/plans'
import { usePrices } from '../data/prices'
import {
  attemptsFor,
  captures,
  CONFIDENCE_LEVELS,
  estimateCost,
  evaluatePlan,
  meanAttempts,
  type ClonePlan,
  type Cross,
  type Evaluation,
  type Plan,
  type Sex,
  type Slot,
  type Suggestion,
} from '../domain/breeding'
import type { Catalog } from '../domain/types'
import { formatAttempts, formatChance } from '../lib/format'
import { Icon } from '../lib/icons'
import { BREEDING_PATH, DASHBOARDS } from '../lib/pages'

const SELECT = `${FIELD_TABLE} w-auto text-left`

export default function PlanPage() {
  const { planId } = useParams()
  const plan = usePlan(planId)
  const catalog = useCatalog()
  const variety = plan && catalog.mounts.byId.get(plan.target)

  if (!plan || !variety) {
    return (
      <NotFound
        code="404"
        glyph={Icon.notFound}
        title="Plan introuvable"
        message="Ce plan n’est pas dans ce navigateur : les plans d’élevage ne se partagent pas encore d’une machine à l’autre."
        detail={planId}
        exits={[
          {
            to: BREEDING_PATH,
            label: 'Élevage',
            description: 'Mes plans, et en créer un',
            icon: Icon.breeding,
          },
        ]}
      />
    )
  }

  return <PlanDashboard key={plan.id} plan={plan} catalog={catalog} />
}

function PlanDashboard({ plan, catalog }: { plan: Plan; catalog: Catalog }) {
  const prices = usePrices()
  const ignored = useIgnored()
  const stable = useStable()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const target = catalog.mounts.byId.get(plan.target)!
  const targetItem = catalog.byId.get(target.id)
  const xp = catalog.mounts.xp

  const evaluation = useMemo(
    () => evaluatePlan(catalog.mounts, plan, stable),
    [catalog.mounts, plan, stable],
  )
  const cost = useMemo(
    () => estimateCost(catalog, evaluation, plan.settings, prices, ignored),
    [catalog, evaluation, plan.settings, prices, ignored],
  )
  const toCapture = useMemo(() => captures(evaluation), [evaluation])
  const settings = plan.settings

  return (
    <div className="space-y-6">
      <DashboardHeader
        icon={Icon.breeding}
        glyph={targetItem ? <ItemIcon item={targetItem} size={40} /> : undefined}
        title={varietyName(target)}
        description={
          <>
            <Link to={BREEDING_PATH} className="text-slate-400 hover:text-amber-400">
              Élevage
            </Link>
            {' › '}Génération {target.generation}. Le plan se recalcule sur l’étable à chaque
            changement ; les chances sont celles de la génération cible, accouplement par
            accouplement.
          </>
        }
        stats={[
          {
            icon: Icon.cross,
            label: evaluation.done
              ? 'cible obtenue'
              : `${evaluation.crosses.length} croisement${evaluation.crosses.length > 1 ? 's' : ''} restant${evaluation.crosses.length > 1 ? 's' : ''}`,
          },
          {
            icon: Icon.cost,
            label: cost.complete ? (
              <Kamas value={cost.total} />
            ) : (
              <span className="text-amber-500/80">coût incomplet</span>
            ),
          },
        ]}
      >
        <Tooltip content="Oublie les recettes imposées : l’étable décide à nouveau de tout">
          <button type="button" onClick={() => resetChoices(plan.id)} className={`${BUTTON} h-8 text-xs`}>
            <Icon.sortReset className="size-3.5" aria-hidden />
            Recalculer depuis l’inventaire
          </button>
        </Tooltip>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                removePlan(plan.id)
                navigate(BREEDING_PATH)
              }}
              className="text-rose-400 hover:text-rose-300"
            >
              Confirmer la suppression
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-slate-500 hover:text-slate-300">
              Annuler
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-400"
          >
            <Icon.delete className="size-3.5" aria-hidden />
            Supprimer
          </button>
        )}
      </DashboardHeader>

      <NextStep suggestion={evaluation.suggestion} target={target} />

      {/* Les réglages : ce que les chiffres supposent de chaque parent. Niveau
          et points sont les deux faces de la table d'XP. */}
      <FilterBar>
        <Tooltip content="Niveau auquel chaque parent est monté avant de reproduire : +0,15 % de chance par niveau. Les points suivent la table d’XP.">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.level className="size-4" aria-hidden />
            Niveau visé
            <input
              type="number"
              min={1}
              max={200}
              value={settings.targetLevel}
              onChange={(event) => {
                const level = Number(event.target.value)
                if (Number.isInteger(level) && level >= 1 && level <= 200) setTargetLevel(plan.id, xp, level)
              }}
              className={`${FIELD_NUMBER} w-20`}
            />
          </label>
        </Tooltip>
        <FilterDivider />
        <Tooltip content="Points de mangeoire versés à une monture née au niveau 1. Le niveau visé devient le plus haut que ces points permettent.">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.gauge className="size-4" aria-hidden />
            Mangeoire
            <input
              inputMode="numeric"
              value={settings.feedPoints.toLocaleString('fr-FR')}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '')
                setFeedPoints(plan.id, xp, digits === '' ? 0 : Number(digits))
              }}
              className={`${FIELD_NUMBER} w-28`}
            />
            <span className="text-xs text-slate-600">pts</span>
          </label>
        </Tooltip>
        <FilterDivider />
        <FilterToggle
          icon={Icon.wizard}
          label="Optimakina"
          checked={settings.optimakina}
          onChange={(optimakina) => updateSettings(plan.id, { optimakina })}
          tip="Une Optimakina à chaque croisement : +10 % de chance, et son prix dans le coût"
        />
      </FilterBar>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={Icon.cost} title="Coût du plan actuel">
          <Costs cost={cost} />
        </Section>
        <Section icon={Icon.mount} title="À capturer">
          {toCapture.length === 0 ? (
            <p className="rounded-lg border border-slate-800 p-3 text-sm text-slate-500">
              Rien à capturer : tout part de l’étable.
            </p>
          ) : (
            <ul className="space-y-1 rounded-lg border border-slate-800 p-3 text-sm">
              {toCapture.map((entry) => (
                <li key={entry.variety.id} className="flex items-center gap-3">
                  <span className="w-6 text-right tabular-nums text-slate-300">{entry.count}</span>
                  <VarietyLink variety={entry.variety} full />
                  <button
                    type="button"
                    onClick={() => addMount({ variety: entry.variety.id })}
                    className="ml-auto text-xs text-slate-500 hover:text-amber-400"
                  >
                    + une à l’étable
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        icon={Icon.cross}
        title="Croisements restants, dans l’ordre"
        note="Cochez « Possédée » quand vous avez un parent ; « Accoupler » enregistre le résultat réel, stérilise les parents et recalcule tout."
      >
        {evaluation.crosses.length === 0 ? (
          <p className="rounded-lg border border-slate-800 p-3 text-sm text-slate-500">
            {evaluation.done ? 'La cible est à l’étable : rien à croiser.' : 'Aucun croisement : tout s’obtient par capture ou clonage.'}
          </p>
        ) : (
          <ol className="space-y-2">
            {evaluation.crosses.map((cross) => (
              <Step key={cross.path} planId={plan.id} cross={cross} evaluation={evaluation} />
            ))}
          </ol>
        )}
      </Section>

      <details className="group rounded-lg border border-slate-800">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
          <Icon.next className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90" aria-hidden />
          <Icon.mount className="size-4 shrink-0" aria-hidden />
          Étable
          <span className="font-normal normal-case tracking-normal text-slate-600">
            {stable.filter((mount) => catalog.mounts.byId.get(mount.variety)?.species === target.species).length} de cette espèce
            {evaluation.surplus.length > 0 && `, ${evaluation.surplus.length} en trop`}
          </span>
        </summary>
        <div className="border-t border-slate-800/60 px-3 py-3">
          <StablePanel mounts={stable} species={target.species} evaluation={evaluation} />
        </div>
      </details>

      <details className="group rounded-lg border border-slate-800">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
          <Icon.next className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90" aria-hidden />
          <Icon.genealogy className="size-4 shrink-0" aria-hidden />
          Arbre complet
        </summary>
        <div className="border-t border-slate-800/60 px-3 py-3">
          <BreedingTree root={evaluation.root} />
        </div>
      </details>
    </div>
  )
}

function Section({
  icon: Glyph,
  title,
  note,
  children,
}: {
  icon: typeof Icon.cross
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
        <Glyph className="size-4 shrink-0" aria-hidden />
        {title}
      </h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {children}
    </section>
  )
}

// --- La prochaine étape --------------------------------------------------------

/** Une seule action, celle qui fait avancer le plan au moindre coût. */
function NextStep({ suggestion, target }: { suggestion: Suggestion; target: { name: string } }) {
  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/6 p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-amber-300">
        <Icon.target className="size-4 shrink-0" aria-hidden />
        Prochaine étape suggérée
      </h2>
      <div className="mt-2 text-sm text-slate-200">
        {suggestion.kind === 'done' && <p>Cible obtenue : {target.name} est à l’étable.</p>}
        {suggestion.kind === 'info' && (
          <p className="flex flex-wrap items-center gap-2">
            {suggestion.message}
            <a href={`#${mountAnchor(suggestion.mount)}`} className="text-xs text-amber-400 hover:text-amber-300">
              voir dans l’étable
            </a>
            <SexPicker mountId={suggestion.mount.id} />
          </p>
        )}
        {suggestion.kind === 'breed' && <BreedAction cross={suggestion.cross} />}
        {suggestion.kind === 'clone' && <CloneAction slot={suggestion.slot} clone={suggestion.clone} />}
        {suggestion.kind === 'prepare' && <PrepareAction suggestion={suggestion} />}
        {suggestion.kind === 'capture' && <CaptureAction slot={suggestion.slot} />}
      </div>
    </section>
  )
}

function SexPicker({ mountId }: { mountId: string }) {
  return (
    <select
      defaultValue=""
      onChange={(event) => {
        if (event.target.value) updateMount(mountId, { sex: event.target.value as Sex })
      }}
      aria-label="Sexe"
      className={SELECT}
    >
      <option value="">Sexe…</option>
      <option value="male">Mâle</option>
      <option value="female">Femelle</option>
    </select>
  )
}

function PrepareAction({ suggestion }: { suggestion: Extract<Suggestion, { kind: 'prepare' }> }) {
  const { mount, slot, feed, gauges } = suggestion
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>Préparer</span>
      <VarietyLink variety={slot.variety} />
      <MountChip mount={mount} />
      <span className="text-slate-400">
        {feed > 0 && <>{feed.toLocaleString('fr-FR')} points de mangeoire</>}
        {feed > 0 && gauges && ', puis '}
        {gauges && 'amour, maturité et endurance à 20 000'}
      </span>
      {gauges && (
        <button type="button" onClick={() => updateMount(mount.id, { ready: true })} className={`${BUTTON} h-7 text-xs`}>
          <Icon.done className="size-3.5" aria-hidden />
          Jauges pleines
        </button>
      )}
      <a href={`#${mountAnchor(mount)}`} className="text-xs text-amber-400 hover:text-amber-300">
        voir dans l’étable
      </a>
    </div>
  )
}

function CaptureAction({ slot }: { slot: Slot }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>Capturer</span>
      <VarietyLink variety={slot.variety} full />
      {slot.wantedSex && <span className="text-slate-400">{slot.wantedSex === 'male' ? 'un mâle' : 'une femelle'}</span>}
      <span className="text-xs text-slate-500">
        {slot.variety.generation === 1 ? 'génération 1, à l’état sauvage' : 'ne s’obtient pas par croisement'}
      </span>
      <button
        type="button"
        onClick={() => addMount({ variety: slot.variety.id, sex: slot.wantedSex })}
        className={`${BUTTON} h-7 text-xs`}
      >
        <Icon.add className="size-3.5" aria-hidden />
        Capturée : à l’étable
      </button>
    </div>
  )
}

/** « Accoupler A et B », et le formulaire du résultat réel. */
function BreedAction({ cross }: { cross: Cross }) {
  const [open, setOpen] = useState(false)
  const [a, b] = cross.parents
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Accoupler</span>
        <ParentSummary slot={a} />
        <span className="text-slate-600">et</span>
        <ParentSummary slot={b} />
        <span className="text-slate-600">→</span>
        <VarietyLink variety={cross.child.variety} />
        <span className="text-xs tabular-nums text-slate-400">{formatChance(cross.chance)} de génération {cross.child.variety.generation}</span>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={`${BUTTON} h-7 text-xs`}>
            <Icon.baby className="size-3.5" aria-hidden />
            Accoupler
          </button>
        )}
      </div>
      {open && <BreedingForm cross={cross} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** Après l'accouplement en jeu : la variété et le sexe du bébé, et l'étable fait le reste. */
function BreedingForm({ cross, onClose }: { cross: Cross; onClose: () => void }) {
  const catalog = useCatalog()
  const [a, b] = cross.parents
  const [variety, setVariety] = useState<number | null>(cross.child.variety.id)
  const [sex, setSex] = useState<Sex | null>(null)
  const options = catalog.mounts.varieties.filter((candidate) => candidate.species === cross.child.variety.species)
  if (!a.mount || !b.mount) return null
  const father = a.mount.sex === 'female' ? b.mount : a.mount
  const mother = father === a.mount ? b.mount : a.mount

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-950/40 p-2 text-xs text-slate-400"
      onSubmit={(event) => {
        event.preventDefault()
        if (variety === null) return
        recordBreeding(father.id, mother.id, variety, sex)
        onClose()
      }}
    >
      <Icon.baby className="size-3.5" aria-hidden />
      Bébé obtenu :
      <VarietySelect
        value={variety}
        options={options}
        onChange={setVariety}
        placeholder="Variété…"
        ariaLabel="Variété du bébé"
        className={`${SELECT} min-w-44`}
      />
      <select
        value={sex ?? ''}
        onChange={(event) => setSex((event.target.value || null) as Sex | null)}
        aria-label="Sexe du bébé"
        className={SELECT}
      >
        <option value="">Sexe ?</option>
        <option value="male">Mâle</option>
        <option value="female">Femelle</option>
      </select>
      <button type="submit" disabled={variety === null} className={`${BUTTON} h-7 text-xs`}>
        <Icon.done className="size-3.5" aria-hidden />
        Enregistrer
      </button>
      <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300">
        Annuler
      </button>
      <span className="basis-full text-slate-600">
        Les deux parents deviennent stériles ; le bébé rejoint l’étable au niveau 1 avec ses parents
        et grands-parents réels. S’il n’est pas la variété visée, il servira ailleurs ou au clonage.
      </span>
    </form>
  )
}

/** « Cloner X avec Y », et le formulaire du résultat réel. */
function CloneAction({ slot, clone }: { slot: Slot; clone: ClonePlan }) {
  const catalog = useCatalog()
  const [open, setOpen] = useState(false)
  const [survivor, setSurvivor] = useState<string>(clone.keep.id)
  const partnerVariety = catalog.mounts.byId.get(clone.partner.variety)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Cloner</span>
        <VarietyLink variety={slot.variety} />
        <MountChip mount={clone.keep} />
        <span className="text-slate-600">avec</span>
        {partnerVariety && <VarietyLink variety={partnerVariety} />}
        <MountChip mount={clone.partner} />
        <span className="text-xs text-slate-500">
          {clone.sacrifice
            ? 'la partenaire ne sert à rien d’autre : la perdre ne coûte rien'
            : 'la partenaire est utile aussi : l’une des deux sera perdue'}
        </span>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className={`${BUTTON} h-7 text-xs`}>
            <Icon.cross className="size-3.5" aria-hidden />
            Cloner
          </button>
        )}
      </div>
      {open && (
        <form
          className="flex flex-wrap items-center gap-3 rounded border border-slate-800 bg-slate-950/40 p-2 text-xs text-slate-400"
          onSubmit={(event) => {
            event.preventDefault()
            recordClone(survivor, survivor === clone.keep.id ? clone.partner.id : clone.keep.id)
            setOpen(false)
          }}
        >
          Survivante :
          <label className="flex items-center gap-1.5">
            <input type="radio" name="survivor" checked={survivor === clone.keep.id} onChange={() => setSurvivor(clone.keep.id)} className="accent-amber-500" />
            {slot.variety.name}
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="survivor" checked={survivor === clone.partner.id} onChange={() => setSurvivor(clone.partner.id)} className="accent-amber-500" />
            {partnerVariety?.name ?? 'partenaire'}
          </label>
          <button type="submit" className={`${BUTTON} h-7 text-xs`}>
            <Icon.done className="size-3.5" aria-hidden />
            Enregistrer
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300">
            Annuler
          </button>
          <span className="basis-full text-slate-600">
            La survivante redevient féconde, jauges à zéro ; l’autre disparaît de l’étable.
          </span>
        </form>
      )}
    </div>
  )
}

// --- Coût --------------------------------------------------------------------------

function Costs({ cost }: { cost: ReturnType<typeof estimateCost> }) {
  const fuelMissing = cost.missing.some((line) => line.startsWith('Aucun carburant'))
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-slate-100">
          {cost.complete ? <Kamas value={cost.total} /> : <span className="text-base text-amber-500/80">coût incomplet</span>}
        </span>
        <span className="text-xs text-slate-500">
          {cost.points.toLocaleString('fr-FR')} points de jauge à verser, au carburant le moins cher de
          chaque jauge
        </span>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">Détail</summary>
        <table className="mt-2 w-full">
          <tbody className="text-slate-300">
            {cost.lines.map((line) => (
              <tr key={line.label} className="border-t border-slate-800/60">
                <td className="py-1.5">
                  {line.label}
                  <span className="block text-[11px] text-slate-600">{line.detail}</span>
                </td>
                <td className="py-1.5 text-right align-top">
                  {line.amount === null ? <span className="text-amber-500/80">incomplet</span> : <Kamas value={line.amount} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-600">
          Ni tentatives moyennes ni branches à refaire : ce chiffre est celui du plan tel qu’il est,
          et bouge à chaque résultat réel.
        </p>
      </details>
      {!cost.complete && (
        <div className="space-y-1 text-xs">
          <ul className="list-disc space-y-0.5 pl-5 text-slate-500">
            {cost.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {fuelMissing && (
            <p className="text-slate-500">
              Les carburants se relèvent sur le{' '}
              <Link to={DASHBOARDS[0]!.to} className="text-amber-400 hover:text-amber-300">
                tableau de bord des carburants
              </Link>
              .
            </p>
          )}
          {cost.unpriced.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3">
              <Link to={`/item/${item.id}`} data-item-name={item.name} className="flex min-w-0 items-center gap-2 text-slate-300 hover:text-amber-400">
                <ItemIcon item={item} size={20} />
                <span className="truncate">{item.name}</span>
              </Link>
              <PriceField itemId={item.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Les croisements ------------------------------------------------------------------

function Step({ planId, cross, evaluation }: { planId: string; cross: Cross; evaluation: Evaluation }) {
  const [a, b] = cross.parents
  const suggested = evaluation.suggestion.kind === 'breed' && evaluation.suggestion.cross === cross

  return (
    <li className={`rounded-lg border ${suggested ? 'border-amber-500/40' : 'border-slate-800'}`}>
      <details className="group" open={cross.state !== 'waiting'}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <Icon.next className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90" aria-hidden />
          <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{cross.step}.</span>
          <StateBadge state={cross.state} />
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <ParentSummary slot={a} />
            <span className="text-slate-600">+</span>
            <ParentSummary slot={b} />
            <span className="text-slate-600">→</span>
            <VarietyLink variety={cross.child.variety} />
          </span>
          <Tooltip
            content={cross.chanceFromMounts ? 'Chance de la génération cible, sur les niveaux des montures en place' : 'Chance de la génération cible, au niveau visé du plan'}
            className="ml-auto flex cursor-help items-center gap-1 text-xs tabular-nums text-slate-500"
          >
            <Icon.chance className="size-3.5" aria-hidden />
            {formatChance(cross.chance)}
          </Tooltip>
        </summary>

        <div className="space-y-3 border-t border-slate-800/60 px-3 py-3">
          {cross.issues.length > 0 && (
            <ul className="space-y-1 text-xs text-rose-400">
              {cross.issues.map((issue, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Icon.stepBlocked className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {issue}
                </li>
              ))}
            </ul>
          )}

          {cross.recipeCount > 1 && (
            <label className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Icon.recipe className="size-3.5" aria-hidden />
              Recette
              <RecipeSelect planId={planId} cross={cross} />
            </label>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <ParentCard slot={a} />
            <ParentCard slot={b} />
          </div>

          {cross.state === 'ready' && <BreedAction cross={cross} />}

          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none hover:text-slate-300">Probabilités détaillées</summary>
            <Odds cross={cross} />
          </details>
        </div>
      </details>
    </li>
  )
}

function ParentSummary({ slot }: { slot: Slot }) {
  return (
    <span className="flex items-center gap-1.5">
      <VarietyLink variety={slot.variety} />
      {slot.mount ? <SexGlyph sex={slot.mount.sex} className="size-3" /> : <span className="text-[10px] text-slate-600">manquante</span>}
    </span>
  )
}

/**
 * Un parent : sa monture s'il y en a une, sinon d'où elle viendra — et la
 * coche « Possédée », qui ajoute une monture de la variété à l'étable ou l'en
 * retire.
 */
function ParentCard({ slot }: { slot: Slot }) {
  return (
    <div className="rounded border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
          <input
            type="checkbox"
            checked={slot.mount !== null}
            onChange={(event) => {
              if (event.target.checked) addMount({ variety: slot.variety.id, sex: slot.wantedSex })
              else if (slot.mount) removeMount(slot.mount.id)
            }}
            className="size-4 accent-amber-500"
          />
          Possédée
        </label>
        <VarietyLink variety={slot.variety} />
        {slot.mount && <MountChip mount={slot.mount} />}
        {slot.mount?.sex === null && <SexPicker mountId={slot.mount.id} />}
        {!slot.mount && slot.cross && <span className="text-slate-600">— née de l’étape {slot.cross.step}</span>}
        {!slot.mount && slot.clone && <span className="text-sky-300">— par clonage</span>}
        {!slot.mount && slot.source === 'capture' && <span className="text-amber-300">— à capturer</span>}
        {slot.issue && <span className="text-rose-400">{slot.issue}</span>}
      </div>
      {slot.mount && !slot.mount.ready && (
        <button type="button" onClick={() => updateMount(slot.mount!.id, { ready: true })} className="mt-1.5 text-[11px] text-slate-500 hover:text-emerald-400">
          <Icon.done className="mr-1 inline size-3 align-text-bottom" aria-hidden />
          Jauges de fécondité pleines
        </button>
      )}
    </div>
  )
}

function RecipeSelect({ planId, cross }: { planId: string; cross: Cross }) {
  const catalog = useCatalog()
  return (
    <select
      value={cross.recipeIndex}
      onChange={(event) => chooseRecipe(planId, cross.path, Number(event.target.value))}
      className={SELECT}
    >
      {cross.child.variety.recipes.map(([first, second], index) => (
        <option key={index} value={index}>
          {index + 1}. {catalog.mounts.byId.get(first)?.name ?? first} + {catalog.mounts.byId.get(second)?.name ?? second}
        </option>
      ))}
    </select>
  )
}

/** Ce que ce croisement peut donner, et combien de fois il faudrait le tenter. */
function Odds({ cross }: { cross: Cross }) {
  return (
    <div className="mt-2 space-y-2">
      {cross.exact ? (
        <p>
          D’après les arbres réels des deux parents, {varietyName(cross.child.variety)} est la seule
          variété de génération {cross.child.variety.generation} possible : {formatChance(cross.chance)}{' '}
          est aussi la probabilité de la variété.
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-amber-500/80">
            <Icon.warning className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
            Probabilité exacte de cette variété inconnue : d’après les arbres réels,{' '}
            {cross.possibleTargets.length} variétés de génération {cross.child.variety.generation}{' '}
            peuvent naître, et le jeu ne publie pas leur répartition.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {cross.possibleTargets.map((candidate) => (
              <li key={candidate.id}>
                <VarietyLink variety={candidate} className={candidate.id === cross.child.variety.id ? 'text-amber-300' : 'text-slate-400'} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <table className="w-auto">
        <tbody className="text-slate-400">
          <tr>
            <td className="pr-4 py-0.5">En moyenne</td>
            <td className="py-0.5 text-right tabular-nums">{formatAttempts(Math.round(meanAttempts(cross.chance) * 10) / 10)} tentatives</td>
          </tr>
          {CONFIDENCE_LEVELS.map((confidence) => (
            <tr key={confidence}>
              <td className="pr-4 py-0.5">{formatChance(confidence)} de chances</td>
              <td className="py-0.5 text-right tabular-nums">{formatAttempts(attemptsFor(cross.chance, confidence))} tentatives</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-600">
        Chaque tentative rend ses deux parents stériles ; un bébé raté rejoint l’étable et peut servir
        ailleurs ou au clonage. Le sexe d’un bébé est aléatoire et n’entre pas dans ces chiffres.
      </p>
    </div>
  )
}
