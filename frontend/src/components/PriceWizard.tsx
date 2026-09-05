/**
 * Remplissage assisté des prix.
 *
 * Une fenêtre qui fait défiler, un par un, les items de la vue courante dont
 * le prix mérite un relevé, regroupés par hôtel de vente. À chaque item, son
 * nom part dans le presse-papiers : il n'y a plus qu'à le coller dans la
 * recherche de l'HDV, lire le prix, le taper, Entrée — et au suivant.
 *
 * C'est la page qui décide de la portée : elle passe ses items dans l'ordre
 * où elle veut qu'on les relève (le tableau de bord carburant donne ses
 * carburants d'abord, leurs ingrédients ensuite). L'assistant regroupe par
 * HDV dans l'ordre de première apparition, et trie chaque groupe par type puis
 * par nom : l'ordre dans lequel on parcourt les onglets d'un comptoir.
 *
 * Le plan est figé au démarrage. Le recalculer à chaque prix saisi ferait
 * disparaître l'item qu'on vient de renseigner — devenu « frais » — et
 * décalerait tout d'un cran sous les doigts de l'utilisateur.
 *
 * Relancer l'assistant ne demande aucune sauvegarde : ce qu'on vient de saisir
 * est plus récent que le seuil choisi (une heure par défaut) et n'est pas
 * redemandé, il reprend donc de lui-même là où on l'a quitté. Le seuil se
 * règle au pied de la fenêtre et se retient d'une fois sur l'autre.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { hdvOf, type HdvInfo } from '../data/hdv'
import { ageMs, freshness, setPrice, useCurrentPrice, useCurrentPrices, type PricePoint } from '../data/prices'
import type { Item, ItemId } from '../domain/types'
import { formatKamas, formatRelativeDate, parseKamas } from '../lib/format'
import { Icon } from '../lib/icons'
import { BUTTON } from './Adorned'
import ItemIcon from './ItemIcon'
import { KamaIcon } from './Kamas'
import { Tooltip } from './Tooltip'

const SKIP_INTRO_KEY = 'kamadvice.priceWizard.skipIntro.v1'

function readSkipIntro(): boolean {
  try {
    return localStorage.getItem(SKIP_INTRO_KEY) === '1'
  } catch {
    return false
  }
}

function writeSkipIntro(value: boolean) {
  try {
    if (value) localStorage.setItem(SKIP_INTRO_KEY, '1')
    else localStorage.removeItem(SKIP_INTRO_KEY)
  } catch {
    // Stockage bloqué : l'intro reviendra, ce n'est pas grave.
  }
}

const SKIP_KEY = 'kamadvice.priceWizard.skip.v1'

const HOUR_MS = 3_600_000

/** Seuils proposés. Une heure est le palier « frais » de la fraîcheur des prix. */
const MAX_AGE_OPTIONS: readonly { value: number; label: string }[] = [
  { value: HOUR_MS / 4, label: '15 min' },
  { value: HOUR_MS / 2, label: '30 min' },
  { value: HOUR_MS, label: '1 h' },
  { value: 3 * HOUR_MS, label: '3 h' },
  { value: 6 * HOUR_MS, label: '6 h' },
  { value: 12 * HOUR_MS, label: '12 h' },
  { value: 24 * HOUR_MS, label: '24 h' },
]

/** Le seuil tel qu'il est affiché dans le menu, pour les phrases de l'intro et de la fin. */
const describeMaxAge = (maxAge: number): string =>
  MAX_AGE_OPTIONS.find((option) => option.value === maxAge)?.label ?? `${maxAge / HOUR_MS} h`

/**
 * Le réglage « ignorer les items rentrés il y a moins de … » : la case et le
 * seuil sont retenus séparément, pour que décocher puis recocher retrouve la
 * durée choisie.
 */
type Skip = { enabled: boolean; maxAge: number }

const DEFAULT_SKIP: Skip = { enabled: true, maxAge: HOUR_MS }

/** Âge en deçà duquel un relevé n'est pas redemandé ; zéro redemande tout. */
const thresholdOf = (skip: Skip): number => (skip.enabled ? skip.maxAge : 0)

function readSkip(): Skip {
  try {
    const raw = localStorage.getItem(SKIP_KEY)
    if (raw === null) return DEFAULT_SKIP
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SKIP
    const { enabled, maxAge } = parsed as Partial<Skip>
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_SKIP.enabled,
      maxAge: MAX_AGE_OPTIONS.some((option) => option.value === maxAge)
        ? (maxAge as number)
        : DEFAULT_SKIP.maxAge,
    }
  } catch {
    return DEFAULT_SKIP
  }
}

function writeSkip(skip: Skip) {
  try {
    localStorage.setItem(SKIP_KEY, JSON.stringify(skip))
  } catch {
    // Stockage bloqué : le réglage reviendra à une heure, ce n'est pas grave.
  }
}

/** Relevé assez récent pour ne pas être redemandé. */
const settled = (point: PricePoint | undefined, maxAge: number): boolean => {
  const age = ageMs(point)
  return age !== null && age < maxAge
}

type Step =
  | { kind: 'hdv'; hdv: HdvInfo; count: number }
  | { kind: 'item'; item: Item; hdv: HdvInfo; position: number }
  | { kind: 'done' }

/**
 * Le parcours : un rendez-vous par HDV, puis ses items, et un écran de fin.
 *
 * Un prix plus jeune que `maxAge` ne se redemande pas : il n'a pas eu le
 * temps de bouger, et c'est ce qui permet de relancer l'assistant sans
 * repasser sur ce qu'on vient de faire. À zéro, on redemande tout.
 */
function plan(items: Item[], current: ReadonlyMap<ItemId, PricePoint>, maxAge: number): Step[] {
  const seen = new Set<ItemId>()
  const groups = new Map<HdvInfo, Item[]>()
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (settled(current.get(item.id), maxAge)) continue

    const hdv = hdvOf(item)
    const group = groups.get(hdv)
    if (group) group.push(item)
    else groups.set(hdv, [item])
  }

  const steps: Step[] = []
  let position = 0
  for (const [hdv, group] of groups) {
    group.sort(
      (a, b) =>
        (a.type?.name ?? '').localeCompare(b.type?.name ?? '', 'fr') ||
        a.name.localeCompare(b.name, 'fr'),
    )
    steps.push({ kind: 'hdv', hdv, count: group.length })
    for (const item of group) steps.push({ kind: 'item', item, hdv, position: ++position })
  }
  steps.push({ kind: 'done' })
  return steps
}

/**
 * Le bouton qui ouvre l'assistant, à poser dans l'en-tête d'une page.
 *
 * `items` est la portée, dans l'ordre voulu ; les doublons sont tolérés, le
 * premier gagne.
 */
export function PriceWizardButton({ items, className = '' }: { items: Item[]; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip content="Relever les prix de cette vue un par un, avec le nom copié à chaque étape">
        {/* Le halo est un frère peint sous le bouton ; l'enveloppe porte
            l'arrondi dont les deux héritent. Voir `.rainbow` dans index.css. */}
        <span className={`rainbow inline-flex rounded ${className}`}>
          <span className="rainbow-halo" aria-hidden />
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={items.length === 0}
            // `border-transparent` : c'est l'anneau qui fait le bord, pas la bordure.
            className={`${BUTTON} rainbow-ring border-transparent hover:border-transparent`}
          >
            <Icon.wizard className="size-4 shrink-0" aria-hidden />
            Remplissage assisté
          </button>
        </span>
      </Tooltip>
      {open && <PriceWizard items={items} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function PriceWizard({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const current = useCurrentPrices()
  const [skipIntro, setSkipIntro] = useState(readSkipIntro)
  const [phase, setPhase] = useState<'intro' | 'steps'>(() => (readSkipIntro() ? 'steps' : 'intro'))
  const [skip, setSkip] = useState(readSkip)
  const maxAge = thresholdOf(skip)
  /** Le parcours, figé au démarrage et à chaque changement de réglage. */
  const [steps, setSteps] = useState<Step[]>(() => plan(items, current, maxAge))
  const [index, setIndex] = useState(0)
  const [saved, setSaved] = useState(0)
  const [skipped, setSkipped] = useState(0)

  const step = steps[index] ?? { kind: 'done' as const }
  const total = useMemo(() => steps.filter((s) => s.kind === 'item').length, [steps])

  /**
   * Part du tour de fenêtre allumée : les items déjà passés — saisis ou non —
   * sur le total. Revenir en arrière éteint ce qu'on redéfait ; l'intro part
   * de zéro, la fin fait le tour complet.
   */
  const done = useMemo(
    () => steps.slice(0, index).filter((s) => s.kind === 'item').length,
    [steps, index],
  )
  const progress =
    phase === 'intro' ? 0 : step.kind === 'done' || total === 0 ? 100 : Math.round((done / total) * 100)
  const ignored = useMemo(() => {
    const seen = new Set<ItemId>()
    let count = 0
    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      if (settled(current.get(item.id), maxAge)) count += 1
    }
    return count
  }, [items, current, maxAge])

  const restart = (nextSkip: Skip) => {
    setSkip(nextSkip)
    writeSkip(nextSkip)
    setSteps(plan(items, current, thresholdOf(nextSkip)))
    setIndex(0)
    setSaved(0)
    setSkipped(0)
  }

  const goNext = () => setIndex((i) => Math.min(i + 1, steps.length - 1))
  const goPrevious = () => setIndex((i) => Math.max(i - 1, 0))

  // Le reste de la page ne doit ni défiler ni recevoir Échap pendant que la
  // fenêtre est ouverte.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="price-wizard-title"
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      {/* L'anneau est une jauge : `--rainbow-progress` allume la part du tour
          déjà faite (voir index.css). La bordure grise dessous fait le rail. */}
      <div
        className="rainbow flex max-h-full w-full max-w-xl rounded-lg"
        style={{ '--rainbow-progress': `${progress}%` } as CSSProperties}
      >
        <span className="rainbow-halo" aria-hidden />
        <div className="rainbow-ring flex max-h-full w-full flex-col rounded-lg border border-slate-800 bg-slate-900 shadow-2xl shadow-black/60">
        <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
          <Icon.wizard className="size-5 shrink-0 text-amber-400" aria-hidden />
          <h2 id="price-wizard-title" className="flex-1 text-base font-semibold text-slate-100">
            Remplissage assisté
          </h2>
          {phase === 'steps' && step.kind === 'item' && (
            <span className="text-xs tabular-nums text-slate-500">
              Prix {step.position} / {total}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex rounded p-1 text-slate-500 hover:text-slate-200 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none"
          >
            <Icon.close className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-64 flex-1 overflow-auto px-5 py-5">
          {phase === 'intro' ? (
            <Intro
              total={total}
              ignored={ignored}
              maxAge={maxAge}
              skipIntro={skipIntro}
              onSkipIntro={(value) => {
                setSkipIntro(value)
                writeSkipIntro(value)
              }}
            />
          ) : step.kind === 'hdv' ? (
            <HdvStep step={step} />
          ) : step.kind === 'item' ? (
            <ItemStep
              key={step.item.id}
              step={step}
              onSave={(price) => {
                // Un prix tapé ici vient d'être lu à l'HDV : même inchangé,
                // il vaut un relevé daté d'aujourd'hui.
                setPrice(step.item.id, price, { confirm: true })
                setSaved((n) => n + 1)
                goNext()
              }}
              onSkip={() => {
                setSkipped((n) => n + 1)
                goNext()
              }}
            />
          ) : (
            <Done total={total} saved={saved} skipped={skipped} ignored={ignored} maxAge={maxAge} />
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-slate-800 px-4 py-3">
          {/* Toucher au réglage rebat le parcours depuis le début. */}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 hover:text-slate-300">
            <input
              type="checkbox"
              checked={skip.enabled}
              onChange={(event) => restart({ ...skip, enabled: event.target.checked })}
              className="accent-amber-500"
            />
            Ignorer les items rentrés il y a moins de
            <select
              value={skip.maxAge}
              disabled={!skip.enabled}
              onChange={(event) => restart({ ...skip, maxAge: Number(event.target.value) })}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:border-slate-600 focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {MAX_AGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {ignored > 0 && (
              <span className="tabular-nums text-slate-600">
                ({ignored} ignoré{ignored > 1 ? 's' : ''})
              </span>
            )}
          </label>

          <span className="flex-1" />

          {phase === 'intro' ? (
            <Button primary onClick={() => setPhase('steps')} autoFocus>
              Commencer
              <Icon.next className="size-4" aria-hidden />
            </Button>
          ) : step.kind === 'done' ? (
            <Button primary onClick={onClose} autoFocus>
              Fermer
            </Button>
          ) : (
            <>
              <Button onClick={goPrevious} disabled={index === 0}>
                <Icon.previous className="size-4" aria-hidden />
                Précédent
              </Button>
              {step.kind === 'hdv' && (
                <Button primary onClick={goNext} autoFocus>
                  Suivant
                  <Icon.next className="size-4" aria-hidden />
                </Button>
              )}
            </>
          )}
        </footer>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Intro({
  total,
  ignored,
  maxAge,
  skipIntro,
  onSkipIntro,
}: {
  total: number
  ignored: number
  maxAge: number
  skipIntro: boolean
  onSkipIntro: (value: boolean) => void
}) {
  return (
    <div className="space-y-4 text-sm text-slate-300">
      <p>
        L'assistant fait le tour des <strong className="text-slate-100">{total} prix</strong> de
        cette vue, hôtel de vente par hôtel de vente.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-slate-400">
        <li>
          À chaque item, son nom est <strong className="text-slate-200">copié</strong> : collez-le
          dans la recherche de l'HDV.
        </li>
        <li>
          Tapez le prix, <kbd className="rounded border border-slate-700 px-1 text-xs">Entrée</kbd>,
          et l'item suivant arrive.
        </li>
        <li>
          <kbd className="rounded border border-slate-700 px-1 text-xs">Entrée</kbd> sur un champ
          vide passe l'item. <kbd className="rounded border border-slate-700 px-1 text-xs">Échap</kbd>{' '}
          ferme : relancez plus tard, l'assistant reprend où vous en étiez.
        </li>
      </ol>
      {ignored > 0 && (
        <p className="text-xs text-slate-500">
          {ignored} prix relevé{ignored > 1 ? 's' : ''} il y a moins de {describeMaxAge(maxAge)} ne{' '}
          {ignored > 1 ? 'sont' : 'est'} pas redemandé{ignored > 1 ? 's' : ''} — réglable en bas de la
          fenêtre.
        </p>
      )}
      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 hover:text-slate-300">
        <input
          type="checkbox"
          checked={skipIntro}
          onChange={(event) => onSkipIntro(event.target.checked)}
          className="accent-amber-500"
        />
        Ne plus afficher cette explication
      </label>
    </div>
  )
}

function HdvStep({ step }: { step: Extract<Step, { kind: 'hdv' }> }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Icon.hdv className="size-10 text-amber-400" aria-hidden />
      <p className="text-xs uppercase tracking-wide text-slate-500">Rendez-vous à l'</p>
      <h3 className="text-lg font-semibold text-slate-100">{step.hdv.label}</h3>
      <p className="max-w-sm text-sm text-slate-400">{step.hdv.hint}</p>
      <p className="text-sm text-slate-300">{step.count} prix à relever</p>
    </div>
  )
}

/**
 * Le nom part dans le presse-papiers à l'arrivée sur l'écran. Le navigateur
 * l'autorise parce qu'on y arrive toujours par un geste — clic ou Entrée —
 * dont l'activation court encore quelques secondes.
 */
function ItemStep({
  step,
  onSave,
  onSkip,
}: {
  step: Extract<Step, { kind: 'item' }>
  onSave: (price: number) => void
  onSkip: () => void
}) {
  const { item, hdv } = step
  const latest = useCurrentPrice(item.id)
  const age = freshness(latest)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState<boolean | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const copy = () => {
    if (!navigator.clipboard) return setCopied(false)
    navigator.clipboard
      .writeText(item.name)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  // Une seule fois par item : le composant est recréé à chaque étape (`key`),
  // l'effet n'a donc rien à suivre.
  useEffect(() => {
    copy()
    input.current?.focus()
  }, [])

  const submit = () => {
    const price = parseKamas(draft)
    if (price === null) onSkip()
    else onSave(price)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ItemIcon item={item} size={64} />
        <div className="min-w-0 flex-1">
          <h3 data-item-name={item.name} className="truncate text-lg font-semibold text-slate-100">
            {item.name}
          </h3>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Icon.type className="size-3" aria-hidden />
              {item.type?.name ?? 'Sans type'}
            </span>
            <span className="flex items-center gap-1">
              <Icon.level className="size-3" aria-hidden />
              Niv. {item.level}
            </span>
            <span className="flex items-center gap-1">
              <Icon.hdv className="size-3" aria-hidden />
              {hdv.label}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {copied === true ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <Icon.copied className="size-3.5" aria-hidden />
            Nom copié — collez-le dans la recherche de l'HDV
          </span>
        ) : (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-slate-400 hover:text-amber-400"
          >
            <Icon.copied className="size-3.5" aria-hidden />
            {copied === false ? 'Copie refusée par le navigateur — cliquer pour réessayer' : 'Copier le nom'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Prix HDV</span>
          <span className="flex items-center gap-1.5">
            <input
              ref={input}
              inputMode="numeric"
              value={draft}
              placeholder={latest ? formatKamas(latest.price) : '—'}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
              className="w-40 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-right text-lg tabular-nums text-slate-100 placeholder:text-slate-700 focus:border-amber-500 focus:outline-none"
            />
            <KamaIcon className="size-4" />
          </span>
        </label>

        <div className="space-y-1 pb-2 text-xs">
          <span className="block text-slate-500">Dernier relevé</span>
          {latest ? (
            <span className={`flex items-center gap-1.5 ${AGE_COLOR[age ?? 'stale']}`}>
              <Icon.history className="size-3.5" aria-hidden />
              {formatKamas(latest.price)} <KamaIcon /> · {formatRelativeDate(latest.at)}
            </span>
          ) : (
            <span className="text-slate-600">aucun</span>
          )}
        </div>
      </div>

      {/* Les deux actions sur leur propre ligne, à droite comme le pied de la
          fenêtre : elles ne se replient jamais sous le champ. */}
      <div className="flex justify-end gap-3">
        <Button onClick={onSkip}>
          <Icon.skip className="size-4" aria-hidden />
          Passer
        </Button>
        <Button primary onClick={submit} disabled={parseKamas(draft) === null}>
          Enregistrer
          <Icon.next className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/** Même code couleur que `PriceField` : gris dans l'heure, rouge au-delà d'une semaine. */
const AGE_COLOR = {
  fresh: 'text-slate-400',
  recent: 'text-yellow-500/80',
  aging: 'text-orange-500/80',
  stale: 'text-red-500/80',
} as const

function Done({
  total,
  saved,
  skipped,
  ignored,
  maxAge,
}: {
  total: number
  saved: number
  skipped: number
  ignored: number
  maxAge: number
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Icon.done className="size-10 text-emerald-400" aria-hidden />
      <h3 className="text-lg font-semibold text-slate-100">
        {total === 0 ? 'Rien à relever' : 'Tour terminé'}
      </h3>
      <p className="text-sm text-slate-400">
        {total === 0 ? (
          ignored > 0 ? (
            <>
              Tous les prix de cette vue ont moins de {describeMaxAge(maxAge)}. Décochez le réglage
              en bas de la fenêtre, ou baissez le seuil, pour les revoir.
            </>
          ) : (
            <>Cette vue n'a aucun prix à relever.</>
          )
        ) : (
          <>
            {saved} prix enregistré{saved > 1 ? 's' : ''}, {skipped} passé{skipped > 1 ? 's' : ''}
            {skipped > 0 && ' — relancez l’assistant pour y revenir'}.
          </>
        )}
      </p>
    </div>
  )
}

function Button({
  primary = false,
  disabled = false,
  autoFocus = false,
  onClick,
  children,
}: {
  primary?: boolean
  disabled?: boolean
  autoFocus?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
          : 'border-slate-700 text-slate-300 hover:border-slate-600 hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  )
}
