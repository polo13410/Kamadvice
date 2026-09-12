/**
 * La monture d'un emplacement du plan : ce qu'on en sait, et où elle en est.
 *
 * Au minimum le sexe, le niveau et l'état ; les parents et grands-parents
 * réels sont facultatifs, repliés — ils ne servent qu'à dire quelles
 * variétés de la génération cible un croisement peut donner.
 *
 * Un emplacement vide propose de le pourvoir : « J'ai cette monture » pour
 * une monture venue d'ailleurs, « Bébé obtenu » quand l'emplacement est le
 * fruit d'un croisement du plan. C'est l'origine qui distingue les deux, et
 * elle ne change plus.
 */
import { useCatalog } from '../data/catalogContext'
import { setMount } from '../data/plans'
import type { MountOrigin, OwnedMount, OwnedStatus, Sex, Slot } from '../domain/breeding'
import type { MountVariety, Species, VarietyId } from '../domain/types'
import { Icon } from '../lib/icons'
import { FIELD_TABLE } from './Adorned'
import { STATUS_LABEL } from './BreedingTree'

const STATUSES: readonly OwnedStatus[] = ['owned', 'obtained', 'preparing', 'fertile', 'bred']

const SELECT = `${FIELD_TABLE} w-auto text-left`

const blank = (origin: MountOrigin): OwnedMount => ({
  origin,
  sex: null,
  level: 1,
  status: origin === 'bred' ? 'obtained' : 'owned',
  parents: [null, null],
  grandparents: [null, null, null, null],
})

export default function MountSlotEditor({ planId, slot }: { planId: string; slot: Slot }) {
  const catalog = useCatalog()
  const mount = slot.mount
  const update = (patch: Partial<OwnedMount>) =>
    setMount(planId, slot.path, mount ? { ...mount, ...patch } : null)

  if (!mount) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1">
        <AddButton
          icon={Icon.add}
          label="J’ai cette monture"
          tip="Achetée, capturée ou déjà à l’étable : son arbre ne sera pas déroulé"
          onClick={() => setMount(planId, slot.path, blank('external'))}
        />
        {slot.cross && (
          <AddButton
            icon={Icon.baby}
            label="Bébé obtenu"
            tip="Né du croisement ci-dessous : l’étape est faite"
            onClick={() => setMount(planId, slot.path, blank('bred'))}
          />
        )}
      </div>
    )
  }

  const species = slot.variety.species
  const options = catalog.mounts.varieties.filter((variety) => variety.species === species)

  return (
    <div className="space-y-2 py-1">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
        <label className="flex items-center gap-1.5">
          <span className="flex items-center gap-1">
            <Icon.male className="size-3.5 text-sky-400" aria-hidden />
            <Icon.female className="size-3.5 text-rose-400" aria-hidden />
          </span>
          <select
            value={mount.sex ?? ''}
            onChange={(event) => update({ sex: (event.target.value || null) as Sex | null })}
            aria-label="Sexe"
            className={SELECT}
          >
            <option value="">Sexe ?</option>
            <option value="male">Mâle</option>
            <option value="female">Femelle</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <Icon.level className="size-3.5" aria-hidden />
          Niveau
          <input
            type="number"
            min={1}
            max={200}
            value={mount.level}
            onChange={(event) => {
              const level = Number(event.target.value)
              if (Number.isInteger(level) && level >= 1 && level <= 200) update({ level })
            }}
            aria-label="Niveau"
            className={`${FIELD_TABLE} w-16`}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <Icon.stepProgress className="size-3.5" aria-hidden />
          <select
            value={mount.status}
            onChange={(event) => update({ status: event.target.value as OwnedStatus })}
            aria-label="État"
            className={SELECT}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <span className="text-slate-600">
          {mount.origin === 'bred' ? 'née du plan' : 'venue d’ailleurs'}
        </span>
        <button
          type="button"
          onClick={() => setMount(planId, slot.path, null)}
          className="ml-auto flex items-center gap-1 text-slate-500 hover:text-rose-400"
        >
          <Icon.delete className="size-3.5" aria-hidden />
          Retirer
        </button>
      </div>

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-300">
          Arbre réel : parents et grands-parents{' '}
          {mount.parents.some((id) => id !== null) || mount.grandparents.some((id) => id !== null)
            ? '(renseigné)'
            : '(facultatif)'}
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {([0, 1] as const).map((index) => (
            <div key={index} className="space-y-1 rounded border border-slate-800 p-2">
              <AncestorSelect
                label={`Parent ${index + 1}`}
                value={mount.parents[index]}
                options={options}
                onChange={(id) => {
                  const parents: OwnedMount['parents'] = [...mount.parents]
                  parents[index] = id
                  update({ parents })
                }}
              />
              {([0, 1] as const).map((sub) => {
                const position = (index * 2 + sub) as 0 | 1 | 2 | 3
                return (
                  <AncestorSelect
                    key={sub}
                    label={`Grand-parent ${sub + 1}`}
                    value={mount.grandparents[position]}
                    options={options}
                    indent
                    onChange={(id) => {
                      const grandparents: OwnedMount['grandparents'] = [...mount.grandparents]
                      grandparents[position] = id
                      update({ grandparents })
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

function AddButton({
  icon: Glyph,
  label,
  tip,
  onClick,
}: {
  icon: typeof Icon.add
  label: string
  tip: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={tip}
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-300 hover:border-amber-500/60 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none"
    >
      <Glyph className="size-3.5" aria-hidden />
      {label}
    </button>
  )
}

/** Choix d'une variété parmi celles de l'espèce, groupées par génération. */
export function VarietySelect({
  value,
  options,
  onChange,
  placeholder,
  className = '',
  ariaLabel,
}: {
  value: VarietyId | null
  options: readonly MountVariety[]
  onChange: (id: VarietyId | null) => void
  placeholder: string
  className?: string
  ariaLabel: string
}) {
  const generations = new Map<number, MountVariety[]>()
  for (const variety of options) {
    const group = generations.get(variety.generation)
    if (group) group.push(variety)
    else generations.set(variety.generation, [variety])
  }
  return (
    <select
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      aria-label={ariaLabel}
      className={className}
    >
      <option value="">{placeholder}</option>
      {[...generations.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([generation, group]) => (
          <optgroup key={generation} label={`Génération ${generation}`}>
            {group.map((variety) => (
              <option key={variety.id} value={variety.id}>
                {variety.name}
              </option>
            ))}
          </optgroup>
        ))}
    </select>
  )
}

function AncestorSelect({
  label,
  value,
  options,
  indent = false,
  onChange,
}: {
  label: string
  value: VarietyId | null
  options: readonly MountVariety[]
  indent?: boolean
  onChange: (id: VarietyId | null) => void
}) {
  return (
    <label className={`flex items-center gap-2 ${indent ? 'pl-4' : ''}`}>
      <span className="w-24 shrink-0">{label}</span>
      <VarietySelect
        value={value}
        options={options}
        onChange={onChange}
        placeholder="Inconnu"
        ariaLabel={label}
        className={`${SELECT} min-w-0 flex-1`}
      />
    </label>
  )
}

/** Espèce d'une variété : ré-exporté pour que la page n'importe pas les types du domaine pour si peu. */
export type { Species }
