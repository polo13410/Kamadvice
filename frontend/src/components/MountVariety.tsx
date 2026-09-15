/**
 * Une variété de monture, telle qu'elle se montre partout : son icône, son
 * nom, sa génération en pastille. Un lien vers la fiche de l'item de monture,
 * c'est là que vivent la généalogie et le bouton « Planifier ».
 *
 * Et les petites pièces qui vont avec : le sexe en glyphe, une monture réelle
 * en puce, le choix d'une variété dans une liste groupée par génération.
 */
import { Link } from 'react-router-dom'
import { useCatalog } from '../data/catalogContext'
import { varietyName } from '../data/mounts'
import type { Sex, SexNeed, StableMount } from '../domain/breeding'
import type { MountVariety, VarietyId } from '../domain/types'
import { Icon } from '../lib/icons'
import ItemIcon from './ItemIcon'
import { Tooltip } from './Tooltip'

/**
 * Une couleur par génération, la même partout où « Gx » se montre. Des
 * teintes choisies pour que deux générations voisines ne se ressemblent pas
 * — pas un dégradé, qu'on ne saurait pas lire à la volée.
 */
const GENERATION_TONE: Record<number, string> = {
  1: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  2: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  3: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  4: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300',
  5: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  6: 'border-lime-500/40 bg-lime-500/10 text-lime-300',
  7: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  8: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  9: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  10: 'border-pink-500/40 bg-pink-500/10 text-pink-300',
  11: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300',
}

/** Les classes de couleur d'une génération, pour un chip ou un filtre qui la désigne. */
export const generationTone = (generation: number): string =>
  GENERATION_TONE[generation] ?? 'border-slate-700 bg-slate-800/80 text-slate-400'

/** « G5 », en pastille de la couleur de sa génération. */
export function GenerationBadge({
  generation,
  className = '',
}: {
  generation: number
  className?: string
}) {
  return (
    <Tooltip
      content={`Génération ${generation}`}
      className={`inline-flex shrink-0 cursor-help items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium tabular-nums ${generationTone(generation)} ${className}`}
    >
      <Icon.generation className="size-2.5" aria-hidden />
      G{generation}
    </Tooltip>
  )
}

export default function VarietyLink({
  variety,
  size = 24,
  full = false,
  focusable = true,
  className = '',
}: {
  variety: MountVariety
  size?: number
  /** Le nom complet avec l'espèce, plutôt que le nom court. */
  full?: boolean
  focusable?: boolean
  className?: string
}) {
  const catalog = useCatalog()
  const item = catalog.byId.get(variety.id)
  const name = full ? varietyName(variety) : variety.name

  return (
    <Link
      to={`/item/${variety.id}`}
      tabIndex={focusable ? undefined : -1}
      data-item-name={varietyName(variety)}
      className={`flex min-w-0 items-center gap-2 text-slate-200 hover:text-amber-400 ${className}`}
    >
      {item ? (
        <ItemIcon item={item} size={size} />
      ) : (
        <Icon.mount className="shrink-0 text-slate-600" style={{ width: size, height: size }} aria-hidden />
      )}
      <span className="truncate">{name}</span>
      <GenerationBadge generation={variety.generation} />
    </Link>
  )
}

/** Le sexe d'une monture, en glyphe. */
export function SexGlyph({ sex, className = 'size-3.5' }: { sex: Sex | null; className?: string }) {
  if (sex === 'male') return <Icon.male className={`${className} shrink-0 text-sky-400`} aria-label="Mâle" />
  if (sex === 'female') return <Icon.female className={`${className} shrink-0 text-rose-400`} aria-label="Femelle" />
  return (
    <span className={`${className} inline-block shrink-0 text-center leading-none text-slate-600`} aria-label="Sexe inconnu">
      ?
    </span>
  )
}

/**
 * Le choix d'un sexe : deux boutons, celui qui est retenu en surbrillance.
 * Recliquer le retenu revient à « inconnu ».
 */
export function SexToggle({
  value,
  onChange,
  className = '',
}: {
  value: Sex | null
  onChange: (sex: Sex | null) => void
  className?: string
}) {
  const button = (sex: Sex, Glyph: typeof Icon.male, label: string, tone: string) => {
    const active = value === sex
    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        title={label}
        onClick={() => onChange(active ? null : sex)}
        className={`flex h-7 w-8 items-center justify-center border first:rounded-l last:rounded-r focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
          active ? tone : 'border-slate-700 bg-slate-900 text-slate-600 hover:text-slate-300'
        }`}
      >
        <Glyph className="size-4" aria-hidden />
      </button>
    )
  }
  return (
    <span className={`inline-flex -space-x-px ${className}`} role="group" aria-label="Sexe">
      {button('male', Icon.male, 'Mâle', 'border-sky-500/60 bg-sky-500/15 text-sky-300')}
      {button('female', Icon.female, 'Femelle', 'border-rose-500/60 bg-rose-500/15 text-rose-300')}
    </span>
  )
}

/**
 * Deux boutons ♂ ♀ qui ajoutent d'un clic une monture de la variété à
 * l'étable, du sexe cliqué : le geste le plus court pour dire « j'en ai une ».
 *
 * Avec `need`, les boutons disent aussi quel sexe il faut : celui dont on n'a
 * aucun besoin est grisé — cliquable quand même, on ne refuse pas une monture.
 * Sans préférence, les deux restent pleins.
 */
export function SexAddButtons({
  onAdd,
  need,
  label = 'Ajouter à l’étable',
  className = '',
}: {
  onAdd: (sex: Sex) => void
  need?: SexNeed
  label?: string
  className?: string
}) {
  const wanted = (sex: Sex): number | null => {
    if (!need) return null
    if (need.any > 0) return null
    return sex === 'male' ? need.male : need.female
  }
  const button = (sex: Sex, Glyph: typeof Icon.male, name: string, tone: string) => {
    const count = wanted(sex)
    const dimmed = count === 0
    const title =
      count === null
        ? `${label} : ${name}`
        : count === 0
          ? `Aucun besoin de ${name} ici — ${label.toLowerCase()} quand même`
          : `Il faut ${count} ${name}${count > 1 ? 's' : ''} — ${label.toLowerCase()}`
    return (
      <button
        type="button"
        aria-label={title}
        title={title}
        onClick={() => onAdd(sex)}
        className={`flex h-7 w-8 items-center justify-center border border-slate-700 bg-slate-900 first:rounded-l last:rounded-r focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
          dimmed ? 'text-slate-700 hover:text-slate-500' : tone
        }`}
      >
        <Glyph className="size-4" aria-hidden />
      </button>
    )
  }
  return (
    <span className={`inline-flex -space-x-px ${className}`} role="group" aria-label={label}>
      {button('male', Icon.male, 'mâle', 'text-sky-400 hover:border-sky-500/60 hover:bg-sky-500/15 hover:text-sky-300')}
      {button('female', Icon.female, 'femelle', 'text-rose-400 hover:border-rose-500/60 hover:bg-rose-500/15 hover:text-rose-300')}
    </span>
  )
}

/** « 2 ♂ · 1 ♀ » : le détail des sexes voulus, quand il y a une préférence. */
export function SexNeedLabel({ need }: { need: SexNeed }) {
  if (need.male === 0 && need.female === 0) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-slate-400">
      {need.male > 0 && (
        <span className="inline-flex items-center gap-0.5">
          {need.male}
          <Icon.male className="size-3 text-sky-400" aria-label="mâle" />
        </span>
      )}
      {need.female > 0 && (
        <span className="inline-flex items-center gap-0.5">
          {need.female}
          <Icon.female className="size-3 text-rose-400" aria-label="femelle" />
        </span>
      )}
      {need.any > 0 && <span className="text-slate-600">{need.any} au choix</span>}
    </span>
  )
}

/**
 * Une monture précise de l'enclos, telle qu'elle se montre partout :
 * icône, nom, génération | sexe, niveau | icônes de ses deux parents, leurs
 * noms en infobulle — et ce qui compte encore : stérile, ou clonée à refaire.
 */
export function MountTag({
  mount,
  className = '',
  note,
}: {
  mount: StableMount
  className?: string
  /** Un mot de plus, après les parents : « porte Ébène », par exemple. */
  note?: React.ReactNode
}) {
  const catalog = useCatalog()
  const variety = catalog.mounts.byId.get(mount.variety)

  return (
    <span
      className={`inline-flex items-center gap-2 rounded border px-1.5 py-1 text-xs ${
        mount.sterile ? 'border-slate-800 text-slate-500' : 'border-slate-700 bg-slate-800/60 text-slate-300'
      } ${className}`}
    >
      {variety ? (
        <VarietyLink variety={variety} size={22} className={mount.sterile ? 'text-slate-400' : ''} />
      ) : (
        <span>#{mount.variety}</span>
      )}
      <span className="h-4 w-px bg-slate-700" aria-hidden />
      <span className="inline-flex items-center gap-1 tabular-nums">
        <SexGlyph sex={mount.sex} className="size-3.5" />
        niv. {mount.level}
      </span>
      <span className="h-4 w-px bg-slate-700" aria-hidden />
      <ParentIcons mount={mount} />
      {mount.sterile && (
        <Tooltip content="A déjà reproduit : ne sert plus qu'au clonage" className="flex cursor-help items-center gap-0.5 text-slate-500">
          <Icon.sterile className="size-3" aria-hidden />
          stérile
        </Tooltip>
      )}
      {!mount.sterile && !mount.ready && (
        <Tooltip content="Jauges à faire, comptées dans le coût" className="cursor-help text-sky-300">
          à préparer
        </Tooltip>
      )}
      {note}
    </span>
  )
}

/** Les deux parents d'une monture en icônes, leurs noms en infobulle — le même bloc que dans `MountTag`. */
export function ParentIcons({ mount, size = 18 }: { mount: StableMount; size?: number }) {
  const catalog = useCatalog()
  const parents = mount.parents.map((id) => (id === null ? null : (catalog.mounts.byId.get(id) ?? null)))
  const tip = parents.some((parent) => parent !== null)
    ? `Parents : ${parents.map((parent) => parent?.name ?? '?').join(' + ')}`
    : 'Parents inconnus'
  return (
    <Tooltip content={tip} className="inline-flex cursor-help items-center gap-0.5">
      {parents.map((parent, index) => {
        const item = parent ? catalog.byId.get(parent.id) : undefined
        return item ? (
          <ItemIcon key={index} item={item} size={size} />
        ) : (
          <span key={index} className="inline-block text-center text-slate-600" style={{ width: size }}>
            ?
          </span>
        )
      })}
    </Tooltip>
  )
}

/**
 * Une monture réelle, en une puce : sexe, niveau, et ce qui compte encore —
 * stérile, ou clonée et pas encore refaite.
 */
export function MountChip({ mount, className = '' }: { mount: StableMount; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-px text-xs ${
        mount.sterile
          ? 'border-slate-800 text-slate-500'
          : 'border-slate-700 bg-slate-800/60 text-slate-300'
      } ${className}`}
    >
      <SexGlyph sex={mount.sex} className="size-3" />
      <span className="tabular-nums">niv. {mount.level}</span>
      {mount.sterile && (
        <Tooltip content="A déjà reproduit : ne sert plus qu'au clonage" className="flex cursor-help items-center gap-0.5">
          <Icon.sterile className="size-3" aria-hidden />
          stérile
        </Tooltip>
      )}
      {!mount.sterile && !mount.ready && (
        <Tooltip content="Jauges à faire, comptées dans le coût" className="cursor-help text-sky-300">
          à préparer
        </Tooltip>
      )}
    </span>
  )
}

/**
 * Choix d'une variété à même la ligne : une icône par variété, le nom et la
 * génération en infobulle, la retenue cernée d'ambre. Pour une poignée
 * d'options — les sorties possibles d'un accouplement —, là où une liste
 * déroulante cache ce qu'on veut voir d'un coup d'œil.
 */
export function VarietyIconPicker({
  value,
  options,
  onChange,
  size = 28,
  className = '',
}: {
  value: VarietyId | null
  options: readonly MountVariety[]
  onChange: (id: VarietyId) => void
  size?: number
  className?: string
}) {
  const catalog = useCatalog()
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} role="radiogroup">
      {options.map((variety) => {
        const item = catalog.byId.get(variety.id)
        const active = variety.id === value
        return (
          <Tooltip key={variety.id} content={`${variety.name} — génération ${variety.generation}`}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={variety.name}
              onClick={() => onChange(variety.id)}
              className={`flex items-center justify-center rounded border p-0.5 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
                active
                  ? 'border-amber-500/70 bg-amber-500/15'
                  : 'border-transparent opacity-70 hover:border-slate-600 hover:bg-slate-800 hover:opacity-100'
              }`}
            >
              {item ? (
                <ItemIcon item={item} size={size} />
              ) : (
                <Icon.mount className="text-slate-600" style={{ width: size, height: size }} aria-hidden />
              )}
            </button>
          </Tooltip>
        )
      })}
    </span>
  )
}

