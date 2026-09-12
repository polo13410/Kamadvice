/**
 * L'étable : les montures possédées, à modifier sur place.
 *
 * Sur la page d'un plan, restreinte à l'espèce du plan et annotée de ce que
 * le plan fait de chaque monture — réservée pour telle étape, matière à
 * clonage, ou en trop. Sur le tableau de bord, toutes espèces confondues.
 *
 * Seuls comptent pour l'élevage le sexe, le niveau, la fécondité et la
 * stérilité ; l'arbre réel se déduit à la naissance et ne se renseigne à la
 * main que pour une monture venue d'ailleurs, replié.
 */
import { useState } from 'react'
import { useCatalog } from '../data/catalogContext'
import { addMount, removeMount, updateMount } from '../data/inventory'
import { SPECIES, SPECIES_INFO, varietyName } from '../data/mounts'
import type { Evaluation, Sex, StableMount } from '../domain/breeding'
import type { MountVariety, Species, VarietyId } from '../domain/types'
import { Icon } from '../lib/icons'
import { FIELD_TABLE } from './Adorned'
import VarietyLink, { SexGlyph, VarietySelect } from './MountVariety'
import Th from './TableHead'
import { Tooltip } from './Tooltip'

const SELECT = `${FIELD_TABLE} w-auto text-left`

/** L'ancre d'une ligne : la suggestion du plan y renvoie. */
export const mountAnchor = (mount: StableMount): string => `mount-${mount.id}`

export default function StablePanel({
  mounts,
  species,
  evaluation,
}: {
  mounts: readonly StableMount[]
  /** Restreint l'étable, et le formulaire d'ajout, à cette espèce. */
  species?: Species
  /** Le plan qui lit cette étable : pour dire ce qu'il fait de chaque monture. */
  evaluation?: Evaluation
}) {
  const catalog = useCatalog()
  const shown = mounts.filter(
    (mount) => !species || catalog.mounts.byId.get(mount.variety)?.species === species,
  )

  return (
    <div className="space-y-3">
      <AddMountForm species={species} />

      {shown.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucune monture {species ? `de cette espèce ` : ''}à l’étable. Ajoutez celles que vous avez —
          les plans les emploient aussitôt.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs text-slate-400">
              <tr>
                <Th icon={Icon.mount}>Monture</Th>
                <Th width="w-28">Sexe</Th>
                <Th width="w-20" align="right">
                  Niveau
                </Th>
                <Th width="w-24" align="center" tip="Jauges d'amour, de maturité et d'endurance pleines">
                  Féconde
                </Th>
                <Th width="w-20" align="center" tip="A déjà reproduit : ne sert plus qu'au clonage">
                  Stérile
                </Th>
                {evaluation && <Th width="w-44">Dans le plan</Th>}
                <Th width="w-10" align="center">
                  <span className="sr-only">Retirer</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((mount) => (
                <MountRow key={mount.id} mount={mount} evaluation={evaluation} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MountRow({ mount, evaluation }: { mount: StableMount; evaluation?: Evaluation }) {
  const catalog = useCatalog()
  const variety = catalog.mounts.byId.get(mount.variety)
  const usage = evaluation ? describeUsage(mount, evaluation) : null

  return (
    <tr id={mountAnchor(mount)} className="border-t border-slate-800/60 align-top target:bg-amber-500/[0.06]">
      <td className="px-2 py-1.5">
        {variety ? (
          <VarietyLink variety={variety} full />
        ) : (
          <span className="text-slate-500">Variété inconnue (#{mount.variety})</span>
        )}
        {variety && <Genealogy mount={mount} species={variety.species} />}
      </td>
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-1.5">
          <SexGlyph sex={mount.sex} />
          <select
            value={mount.sex ?? ''}
            onChange={(event) => updateMount(mount.id, { sex: (event.target.value || null) as Sex | null })}
            aria-label="Sexe"
            className={SELECT}
          >
            <option value="">?</option>
            <option value="male">Mâle</option>
            <option value="female">Femelle</option>
          </select>
        </span>
      </td>
      <td className="px-2 py-1.5">
        <input
          type="number"
          min={1}
          max={200}
          value={mount.level}
          onChange={(event) => {
            const level = Number(event.target.value)
            if (Number.isInteger(level) && level >= 1 && level <= 200) updateMount(mount.id, { level })
          }}
          aria-label="Niveau"
          className={`${FIELD_TABLE} w-16`}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={mount.ready}
          onChange={(event) => updateMount(mount.id, { ready: event.target.checked })}
          aria-label="Féconde"
          className="size-4 cursor-pointer accent-emerald-500"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={mount.sterile}
          onChange={(event) => updateMount(mount.id, { sterile: event.target.checked })}
          aria-label="Stérile"
          className="size-4 cursor-pointer accent-slate-500"
        />
      </td>
      {evaluation && <td className="px-2 py-1.5 text-xs text-slate-500">{usage}</td>}
      <td className="px-2 py-1.5 text-center">
        <Tooltip content="Retirer de l’étable">
          <button
            type="button"
            onClick={() => removeMount(mount.id)}
            aria-label="Retirer de l’étable"
            className="text-slate-600 hover:text-rose-400"
          >
            <Icon.delete className="size-4" aria-hidden />
          </button>
        </Tooltip>
      </td>
    </tr>
  )
}

/** Ce que le plan fait de cette monture. */
function describeUsage(mount: StableMount, evaluation: Evaluation): string {
  const slot = evaluation.reserved.get(mount.id)
  if (!slot) {
    return mount.sterile ? 'En trop : matière à clonage' : 'En trop'
  }
  if (slot.path === '') return 'La cible'
  if (slot.clone) {
    return slot.clone.keep.id === mount.id ? 'À cloner' : 'Partenaire de clonage'
  }
  const parentPath = slot.path.slice(0, -1)
  const cross = evaluation.crosses.find((candidate) => candidate.path === parentPath)
  return cross ? `Étape ${cross.step}` : 'Réservée'
}

/** L'arbre réel, replié : rarement utile à voir, précieux quand il l'est. */
function Genealogy({ mount, species }: { mount: StableMount; species: Species }) {
  const catalog = useCatalog()
  const options = catalog.mounts.varieties.filter((variety) => variety.species === species)
  const known = mount.parents.some((id) => id !== null) || mount.grandparents.some((id) => id !== null)

  return (
    <details className="mt-1 text-[11px] text-slate-500">
      <summary className="cursor-pointer select-none hover:text-slate-300">
        Arbre réel {known ? '· ' + describeLineage(mount, catalog.mounts.byId) : '(inconnu)'}
      </summary>
      <div className="mt-1 grid gap-1 sm:grid-cols-2">
        {([0, 1] as const).map((index) => (
          <div key={index} className="space-y-1 rounded border border-slate-800 p-1.5">
            <AncestorSelect
              label={`Parent ${index + 1}`}
              value={mount.parents[index]}
              options={options}
              onChange={(id) => {
                const parents: StableMount['parents'] = [...mount.parents]
                parents[index] = id
                updateMount(mount.id, { parents })
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
                    const grandparents: StableMount['grandparents'] = [...mount.grandparents]
                    grandparents[position] = id
                    updateMount(mount.id, { grandparents })
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </details>
  )
}

function describeLineage(mount: StableMount, byId: ReadonlyMap<VarietyId, MountVariety>): string {
  const name = (id: VarietyId | null) => (id === null ? '?' : (byId.get(id)?.name ?? '?'))
  return `${name(mount.parents[0])} + ${name(mount.parents[1])}`
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
    <label className={`flex items-center gap-2 ${indent ? 'pl-3' : ''}`}>
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

/** Ajouter une monture venue d'ailleurs : capture, achat, étable d'avant. */
function AddMountForm({ species: fixed }: { species?: Species }) {
  const catalog = useCatalog()
  const [species, setSpecies] = useState<Species>(fixed ?? 'dragodinde')
  const [variety, setVariety] = useState<VarietyId | null>(null)
  const [sex, setSex] = useState<Sex | null>(null)
  const [level, setLevel] = useState(1)
  const current = fixed ?? species
  const options = catalog.mounts.varieties.filter((candidate) => candidate.species === current)

  return (
    <form
      className="flex flex-wrap items-center gap-2 text-xs text-slate-400"
      onSubmit={(event) => {
        event.preventDefault()
        if (variety === null) return
        addMount({ variety, sex, level })
        setVariety(null)
        setSex(null)
        setLevel(1)
      }}
    >
      <Icon.add className="size-3.5 text-slate-600" aria-hidden />
      {!fixed && (
        <select
          value={species}
          onChange={(event) => {
            setSpecies(event.target.value as Species)
            setVariety(null)
          }}
          aria-label="Espèce"
          className={SELECT}
        >
          {SPECIES.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </select>
      )}
      <VarietySelect
        value={variety}
        options={options}
        onChange={setVariety}
        placeholder={`${SPECIES_INFO.get(current)?.label ?? 'Monture'} possédée…`}
        ariaLabel="Variété"
        className={`${SELECT} min-w-48`}
      />
      <select
        value={sex ?? ''}
        onChange={(event) => setSex((event.target.value || null) as Sex | null)}
        aria-label="Sexe"
        className={SELECT}
      >
        <option value="">Sexe ?</option>
        <option value="male">Mâle</option>
        <option value="female">Femelle</option>
      </select>
      <label className="flex items-center gap-1">
        niv.
        <input
          type="number"
          min={1}
          max={200}
          value={level}
          onChange={(event) => setLevel(Math.min(200, Math.max(1, Number(event.target.value) || 1)))}
          aria-label="Niveau"
          className={`${FIELD_TABLE} w-16`}
        />
      </label>
      <button
        type="submit"
        disabled={variety === null}
        className="flex h-7 items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-300 hover:border-amber-500/60 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Ajouter à l’étable
      </button>
      {variety !== null && (
        <span className="text-slate-600">{varietyName(catalog.mounts.byId.get(variety)!)}</span>
      )}
    </form>
  )
}
