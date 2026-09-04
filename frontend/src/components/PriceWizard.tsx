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
 * a moins d'une heure et n'est pas redemandé, il reprend donc de lui-même là
 * où on l'a quitté.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { hdvOf, type HdvInfo } from '../data/hdv'
import { freshness, setPrice, useCurrentPrice, useCurrentPrices, type PricePoint } from '../data/prices'
import type { Item, ItemId } from '../domain/types'
import { formatKamas, formatRelativeDate, parseKamas } from '../lib/format'
import { Icon } from '../lib/icons'
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

type Step =
  | { kind: 'hdv'; hdv: HdvInfo; count: number }
  | { kind: 'item'; item: Item; hdv: HdvInfo; position: number }
  | { kind: 'done' }

/**
 * Le parcours : un rendez-vous par HDV, puis ses items, et un écran de fin.
 *
 * Un prix relevé dans l'heure ne se redemande pas, sauf à forcer : il n'a pas
 * eu le temps de bouger, et c'est ce qui permet de relancer l'assistant sans
 * repasser sur ce qu'on vient de faire.
 */
function plan(items: Item[], current: ReadonlyMap<ItemId, PricePoint>, force: boolean): Step[] {
  const seen = new Set<ItemId>()
  const groups = new Map<HdvInfo, Item[]>()
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    if (!force && freshness(current.get(item.id)) === 'fresh') continue

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
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={items.length === 0}
          className={`flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-300 hover:border-amber-500/60 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
          <Icon.wizard className="size-4 shrink-0" aria-hidden />
          Remplissage assisté
        </button>
      </Tooltip>
      {open && <PriceWizard items={items} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function PriceWizard({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const current = useCurrentPrices()
  const [skipIntro, setSkipIntro] = useState(readSkipIntro)
  const [phase, setPhase] = useState<'intro' | 'steps'>(() => (readSkipIntro() ? 'steps' : 'intro'))
  const [force, setForce] = useState(false)
  /** Le parcours, figé au démarrage et à chaque changement de « forcer ». */
  const [steps, setSteps] = useState<Step[]>(() => plan(items, current, false))
  const [index, setIndex] = useState(0)
  const [saved, setSaved] = useState(0)
  const [skipped, setSkipped] = useState(0)

  const step = steps[index] ?? { kind: 'done' as const }
  const total = useMemo(() => steps.filter((s) => s.kind === 'item').length, [steps])
  const ignored = useMemo(() => {
    const seen = new Set<ItemId>()
    let count = 0
    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      if (freshness(current.get(item.id)) === 'fresh') count += 1
    }
    return count
  }, [items, current])

  const restart = (nextForce: boolean) => {
    setForce(nextForce)
    setSteps(plan(items, current, nextForce))
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
      <div className="flex max-h-full w-full max-w-xl flex-col rounded-lg border border-slate-700 bg-slate-900 shadow-2xl shadow-black/60">
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
                setPrice(step.item.id, price)
                setSaved((n) => n + 1)
                goNext()
              }}
              onSkip={() => {
                setSkipped((n) => n + 1)
                goNext()
              }}
            />
          ) : (
            <Done total={total} saved={saved} skipped={skipped} ignored={ignored} force={force} />
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-slate-800 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 hover:text-slate-300">
            <input
              type="checkbox"
              checked={force}
              onChange={(event) => restart(event.target.checked)}
              className="accent-amber-500"
            />
            Forcer les prix de moins d'une heure
            {ignored > 0 && !force && (
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
    </div>,
    document.body,
  )
}

function Intro({
  total,
  ignored,
  skipIntro,
  onSkipIntro,
}: {
  total: number
  ignored: number
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
          {ignored} prix relevé{ignored > 1 ? 's' : ''} il y a moins d'une heure ne{' '}
          {ignored > 1 ? 'sont' : 'est'} pas redemandé{ignored > 1 ? 's' : ''}.
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
  force,
}: {
  total: number
  saved: number
  skipped: number
  ignored: number
  force: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Icon.done className="size-10 text-emerald-400" aria-hidden />
      <h3 className="text-lg font-semibold text-slate-100">
        {total === 0 ? 'Rien à relever' : 'Tour terminé'}
      </h3>
      <p className="text-sm text-slate-400">
        {total === 0 ? (
          ignored > 0 && !force ? (
            <>Tous les prix de cette vue ont moins d'une heure. Cochez « forcer » pour les revoir.</>
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
