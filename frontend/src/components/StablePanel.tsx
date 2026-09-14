/**
 * L'étable : les montures possédées, à modifier sur place.
 *
 * Sur la page d'un plan, restreinte à l'espèce du plan et annotée de ce que
 * le plan fait de chaque monture — réservée pour telle étape, matière à
 * clonage, ou en trop. Sur le tableau de bord, toutes espèces confondues.
 *
 * Ce qui compte d'une monture : le sexe, le niveau, si elle est préparée —
 * jauges faites, prête à reproduire — et si elle est stérile. L'arbre réel
 * se déduit à la naissance et ne se renseigne à la main que pour une monture
 * venue d'ailleurs, replié.
 */
import { useState } from 'react'
import { useCatalog } from '../data/catalogContext'
import { addMount, duplicateMount, prepareMount, removeMount, updateMount } from '../data/inventory'
import { SPECIES, SPECIES_INFO, varietyName } from '../data/mounts'
import type { Evaluation, Sex, StableMount } from '../domain/breeding'
import type { Species, VarietyId } from '../domain/types'
import { Icon } from '../lib/icons'
import { FIELD_TABLE } from './Adorned'
import ItemIcon from './ItemIcon'
import VarietyLink, { SexToggle, VarietySelect } from './MountVariety'
import Th from './TableHead'
import { Tooltip } from './Tooltip'

const SELECT = `${FIELD_TABLE} w-auto text-left`

/** L'ancre d'une ligne : la suggestion du plan y renvoie. */
export const mountAnchor = (mount: StableMount): string => `mount-${mount.id}`

export default function StablePanel({
  mounts,
  species,
  evaluation,
  preparedLevel,
}: {
  mounts: readonly StableMount[]
  /** Restreint l'étable, et le formulaire d'ajout, à cette espèce. */
  species?: Species
  /** Le plan qui lit cette étable : pour dire ce qu'il fait de chaque monture. */
  evaluation?: Evaluation
  /** Niveau visé du plan : cocher « Préparée » y monte la monture si elle est en dessous. */
  preparedLevel?: number
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
                <Th width="w-24">Sexe</Th>
                <Th width="w-20" align="right">
                  Niveau
                </Th>
                <Th width="w-80" icon={Icon.genealogy} tip="Ses deux parents directs : seuls eux comptent dans la reproduction">
                  Parents
                </Th>
                <Th width="w-20" align="center" tip="Jauges faites, prête à reproduire — cocher la monte au niveau visé du plan. Une capture ou un bébé arrive à préparer.">
                  Préparée
                </Th>
                <Th width="w-20" align="center" tip="A déjà reproduit : ne sert plus qu'au clonage">
                  Stérile
                </Th>
                {evaluation && <Th width="w-44">Dans le plan</Th>}
                <Th width="w-16" align="center">
                  <span className="sr-only">Dupliquer, retirer</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((mount) => (
                <MountRow key={mount.id} mount={mount} evaluation={evaluation} preparedLevel={preparedLevel} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MountRow({
  mount,
  evaluation,
  preparedLevel,
}: {
  mount: StableMount
  evaluation?: Evaluation
  preparedLevel?: number
}) {
  const catalog = useCatalog()
  const variety = catalog.mounts.byId.get(mount.variety)
  const usage = evaluation ? describeUsage(mount, evaluation) : null

  return (
    <tr id={mountAnchor(mount)} className="border-t border-slate-800/60 align-top target:bg-amber-500/6">
      <td className="px-2 py-1.5">
        {variety ? (
          <VarietyLink variety={variety} full />
        ) : (
          <span className="text-slate-500">Variété inconnue (#{mount.variety})</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <SexToggle value={mount.sex} onChange={(sex) => updateMount(mount.id, { sex })} />
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
      <td className="px-2 py-1.5">
        {variety && <ParentsEditor mount={mount} species={variety.species} />}
      </td>
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={mount.ready}
          disabled={mount.sterile}
          onChange={(event) =>
            event.target.checked && preparedLevel !== undefined
              ? prepareMount(mount.id, preparedLevel)
              : updateMount(mount.id, { ready: event.target.checked })
          }
          aria-label="Préparée"
          className="size-4 cursor-pointer accent-emerald-500 disabled:cursor-default disabled:opacity-40"
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
        <span className="inline-flex items-center gap-2">
          <Tooltip content="Dupliquer : une monture pareille de plus">
            <button
              type="button"
              onClick={() => duplicateMount(mount.id)}
              aria-label="Dupliquer"
              className="text-slate-600 hover:text-amber-400"
            >
              <Icon.duplicate className="size-4" aria-hidden />
            </button>
          </Tooltip>
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
        </span>
      </td>
    </tr>
  )
}

/**
 * Ce que le plan fait de cette monture *aujourd'hui* : rien n'est acquis, le
 * prochain résultat peut la destiner ailleurs.
 */
function describeUsage(mount: StableMount, evaluation: Evaluation): string {
  const slot = evaluation.reserved.get(mount.id)
  if (!slot) {
    return mount.sterile ? 'En attente : matière à clonage' : 'Sans emploi pour l’instant'
  }
  if (slot.path === '') return 'La cible'
  if (slot.clone) {
    return slot.clone.keep.id === mount.id ? 'À cloner' : 'Partenaire de clonage'
  }
  const parentPath = slot.path.slice(0, -1)
  const cross = evaluation.crosses.find((candidate) => candidate.path === parentPath)
  const reserve = slot.extras.some((extra) => extra.id === mount.id) ? 'En réserve pour' : 'Visée pour'
  return cross ? `${reserve} l’étape ${cross.step}` : `${reserve} le plan`
}

/**
 * Les deux parents directs, à même la ligne : l'icône de chacun devant son
 * choix — les mêmes icônes que partout où la monture se montre. Seuls les
 * parents directs comptent dans la reproduction ; un bébé raté porte leurs
 * gènes et peut retenter le croisement.
 */
function ParentsEditor({ mount, species }: { mount: StableMount; species: Species }) {
  const catalog = useCatalog()
  const options = catalog.mounts.varieties.filter((variety) => variety.species === species)

  return (
    <span className="flex items-center gap-2">
      {([0, 1] as const).map((index) => {
        const id = mount.parents[index]
        const item = id === null ? undefined : catalog.byId.get(id)
        return (
          <span key={index} className="flex min-w-0 items-center gap-1">
            {item ? (
              <ItemIcon item={item} size={20} />
            ) : (
              <span className="inline-block w-5 text-center text-slate-600">?</span>
            )}
            <VarietySelect
              value={id}
              options={options}
              onChange={(parent) => {
                const parents: StableMount['parents'] = [...mount.parents]
                parents[index] = parent
                updateMount(mount.id, { parents })
              }}
              placeholder="Inconnu"
              ariaLabel={`Parent ${index + 1}`}
              className={`${SELECT} w-32`}
            />
          </span>
        )
      })}
    </span>
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
      <SexToggle value={sex} onChange={setSex} />
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
