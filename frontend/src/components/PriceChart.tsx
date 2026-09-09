/**
 * Courbe du prix d'un item dans le temps.
 *
 * Une seule série, en SVG maison : cinquante relevés au plus par item, pas de
 * quoi justifier une bibliothèque de graphes. La période affichée se choisit
 * au-dessus de la courbe et se retient d'une fiche à l'autre.
 *
 * Le survol accroche le relevé le plus proche en abscisse : on vise une date,
 * pas un point de huit pixels. Le clavier fait la même chose, flèche par
 * flèche, une fois la courbe focalisée. Les deux lisent la même bulle.
 *
 * Quand la période commence après un relevé, la courbe entre par le bord
 * gauche à la hauteur interpolée entre ce relevé et le premier affiché :
 * l'échelle ne s'étire pas pour un point qu'on ne voit pas, et la courbe ne
 * surgit pas du vide au milieu du cadre.
 *
 * Les relevés sans date — repris du tout premier format de stockage — n'ont
 * pas de place sur un axe du temps : ils sont comptés en pied, pas tracés.
 */
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { usePriceLog, type PricePoint } from '../data/prices'
import { UNDATED } from '../data/priceMigration'
import type { ItemId } from '../domain/types'
import { formatDateTime, formatKamas, formatPercent, formatRelativeDate } from '../lib/format'
import { Icon } from '../lib/icons'
import Kamas from './Kamas'
import TrendIcon from './TrendIcon'

const HOUR = 3_600_000
const DAY = 24 * HOUR

// --- Période --------------------------------------------------------------

type RangeId = '24h' | '7d' | '30d' | '90d' | 'all'

interface RangeOption {
  id: RangeId
  label: string
  /** Durée remontée depuis maintenant ; `null` pour tout l'historique. */
  ms: number | null
}

/** Les périodes proposées, dans l'ordre des boutons. */
const RANGE_OPTIONS: Record<RangeId, RangeOption> = {
  '24h': { id: '24h', label: '24 h', ms: DAY },
  '7d': { id: '7d', label: '7 j', ms: 7 * DAY },
  '30d': { id: '30d', label: '30 j', ms: 30 * DAY },
  '90d': { id: '90d', label: '90 j', ms: 90 * DAY },
  all: { id: 'all', label: 'Tout', ms: null },
}
const RANGES: readonly RangeOption[] = Object.values(RANGE_OPTIONS)

const DEFAULT_RANGE: RangeId = '30d'
const RANGE_KEY = 'kamadvice.priceChart.range.v1'

function readRange(): RangeId {
  try {
    const raw = localStorage.getItem(RANGE_KEY)
    return RANGES.some((option) => option.id === raw) ? (raw as RangeId) : DEFAULT_RANGE
  } catch {
    return DEFAULT_RANGE
  }
}

function writeRange(id: RangeId) {
  try {
    localStorage.setItem(RANGE_KEY, id)
  } catch {
    // Stockage bloqué : la période reviendra à trente jours, ce n'est pas grave.
  }
}

// --- Données --------------------------------------------------------------

/** Un relevé daté, prêt à tracer. */
interface Sample {
  t: number
  price: number
}

/**
 * Les relevés datés, du plus ancien au plus récent. La date prêtée aux relevés
 * du premier format (`UNDATED`) n'en est pas une : tracée, elle tirerait
 * l'axe jusqu'en l'an 2000.
 */
function toSeries(log: readonly PricePoint[]): Sample[] {
  const series: Sample[] = []
  for (const point of log) {
    if (point.at === null || point.at === UNDATED) continue
    const t = new Date(point.at).getTime()
    if (Number.isFinite(t)) series.push({ t, price: point.price })
  }
  return series.sort((a, b) => a.t - b.t)
}

interface Frame {
  from: number
  to: number
  /** Les relevés de la période, dans l'ordre du temps. */
  visible: Sample[]
  /** Rang, dans la série complète, du premier relevé affiché. */
  offset: number
  /** Point d'entrée de la courbe par le bord gauche, s'il y a un relevé avant. */
  entry: Sample | null
}

function frame(series: Sample[], range: RangeOption): Frame {
  const now = Date.now()
  const last = series[series.length - 1]
  // Une horloge en avance ne doit pas pousser le dernier relevé hors cadre.
  const to = Math.max(now, last?.t ?? now)
  let from = range.ms === null ? (series[0]?.t ?? to - DAY) : to - range.ms
  // Un seul relevé, tout juste posé : sans largeur minimale, l'axe s'effondre.
  if (to - from < HOUR) from = to - HOUR

  const offset = series.findIndex((sample) => sample.t >= from)
  const visible = offset === -1 ? [] : series.slice(offset)
  const before = offset > 0 ? series[offset - 1] : undefined
  const first = visible[0]

  const entry =
    before && first
      ? {
          t: from,
          price:
            before.price +
            ((first.price - before.price) * (from - before.t)) / (first.t - before.t),
        }
      : null

  return { from, to, visible, offset, entry }
}

// --- Échelles -------------------------------------------------------------

/** Arrondit un pas à 1, 2 ou 5 fois une puissance de dix. */
function niceStep(raw: number): number {
  const base = 10 ** Math.floor(Math.log10(raw))
  const factor = raw / base
  return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * base
}

interface ValueScale {
  lo: number
  hi: number
  ticks: number[]
}

/** Bornes et graduations rondes qui encadrent les prix affichés. */
function valueScale(values: number[]): ValueScale {
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    const pad = Math.max(min * 0.1, 1)
    min = Math.max(min - pad, 0)
    max += pad
  }
  const step = niceStep((max - min) / 4)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = lo; value <= hi + step / 2; value += step) ticks.push(value)
  return { lo, hi, ticks }
}

const HOUR_LABEL = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' })

/** Pas d'axe candidats, jusqu'à la quinzaine ; au-delà, on compte en mois. */
const TIME_STEPS = [HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY]
const MONTH_STEPS = [1, 2, 3, 6, 12]

interface TimeTick {
  t: number
  label: string
}

/**
 * Graduations de l'axe du temps, calées sur des instants ronds en heure
 * locale : heures pleines, minuits, premiers du mois. Le pas est le plus fin
 * qui tienne en `max` graduations. Le minuit d'une échelle horaire porte la
 * date : c'est là qu'on change de jour.
 */
function timeTicks(from: number, to: number, max: number): TimeTick[] {
  const span = to - from
  const ticks: TimeTick[] = []
  const step = TIME_STEPS.find((candidate) => span / candidate <= max)

  if (step !== undefined && step < DAY) {
    const hours = step / HOUR
    const cursor = new Date(from)
    cursor.setMinutes(0, 0, 0)
    if (cursor.getTime() < from) cursor.setHours(cursor.getHours() + 1)
    cursor.setHours(Math.ceil(cursor.getHours() / hours) * hours)
    while (cursor.getTime() <= to) {
      const midnight = cursor.getHours() === 0
      ticks.push({ t: cursor.getTime(), label: (midnight ? DAY_LABEL : HOUR_LABEL).format(cursor) })
      cursor.setHours(cursor.getHours() + hours)
    }
    return ticks
  }

  if (step !== undefined) {
    const days = step / DAY
    const cursor = new Date(from)
    cursor.setHours(0, 0, 0, 0)
    if (cursor.getTime() < from) cursor.setDate(cursor.getDate() + 1)
    while (cursor.getTime() <= to) {
      ticks.push({ t: cursor.getTime(), label: DAY_LABEL.format(cursor) })
      cursor.setDate(cursor.getDate() + days)
    }
    return ticks
  }

  // Au-delà de douze mois par graduation, on accepte d'en avoir plus que `max`.
  const months = MONTH_STEPS.find((candidate) => span / (candidate * 30 * DAY) <= max) ?? 12
  const cursor = new Date(from)
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  if (cursor.getTime() < from) cursor.setMonth(cursor.getMonth() + 1)
  while (cursor.getTime() <= to) {
    ticks.push({ t: cursor.getTime(), label: MONTH_LABEL.format(cursor) })
    cursor.setMonth(cursor.getMonth() + months)
  }
  return ticks
}

/** « 12,5 k », « 1,3 M » : les graduations de prix, courtes pour tenir dans le cadre. */
const COMPACT = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })

// --- Géométrie ------------------------------------------------------------

const HEIGHT = 220
/** Marges du tracé : en haut pour l'étiquette du dernier prix, en bas pour les dates. */
const PAD = { top: 20, right: 14, bottom: 24, left: 10 }
/** Largeur laissée à chaque date sur l'axe. */
const TICK_WIDTH = 80

/** Largeur réelle d'un élément, suivie au redimensionnement. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, width }
}

// --- Composant ------------------------------------------------------------

export default function PriceChart({ itemId }: { itemId: ItemId }) {
  const log = usePriceLog(itemId)
  const [rangeId, setRangeId] = useState(readRange)
  const range = RANGE_OPTIONS[rangeId]

  const series = useMemo(() => toSeries(log), [log])
  const undated = log.length - series.length
  // `Date.now()` figé avec ses dépendances : le cadre ne glisse pas à chaque rendu.
  const view = useMemo(() => frame(series, range), [series, range])

  const chooseRange = (id: RangeId) => {
    setRangeId(id)
    writeRange(id)
  }

  if (log.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Icon.history className="size-4 shrink-0" aria-hidden />
        Aucun prix relevé pour cet item.
      </p>
    )
  }

  const { visible } = view
  const prices = visible.map((sample) => sample.price)
  const lowest = prices.length ? Math.min(...prices) : null
  const highest = prices.length ? Math.max(...prices) : null
  const last = series[series.length - 1]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Période affichée">
          <Icon.time className="mr-0.5 size-3.5 shrink-0 text-slate-600" aria-hidden />
          {RANGES.map((option) => {
            const active = option.id === rangeId
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => chooseRange(option.id)}
                aria-pressed={active}
                className={`flex h-7 items-center rounded-full border px-2.5 text-xs focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10 text-amber-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <p className="ml-auto flex flex-wrap items-center gap-x-3 text-xs tabular-nums text-slate-500">
          {visible.length === 0 ? (
            <span>Aucun relevé sur cette période</span>
          ) : (
            <>
              <span>
                {visible.length} relevé{visible.length > 1 ? 's' : ''}
              </span>
              {visible.length > 1 && (
                <>
                  <span className="flex items-center gap-1">
                    min <Kamas value={lowest} className="text-slate-400" />
                  </span>
                  <span className="flex items-center gap-1">
                    max <Kamas value={highest} className="text-slate-400" />
                  </span>
                </>
              )}
            </>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        {visible.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-1 px-4 text-center text-sm text-slate-500"
            style={{ height: HEIGHT }}
          >
            <span>Aucun relevé sur cette période.</span>
            {last && (
              <span className="text-xs text-slate-600">
                Dernier relevé {formatRelativeDate(new Date(last.t).toISOString())} — élargissez la
                période pour le voir.
              </span>
            )}
          </div>
        ) : (
          <Plot key={rangeId} view={view} series={series} />
        )}
      </div>

      {undated > 0 && (
        <p className="text-xs text-slate-600">
          {undated} relevé{undated > 1 ? 's' : ''} sans date, non tracé{undated > 1 ? 's' : ''}.
        </p>
      )}
    </div>
  )
}

/**
 * Le tracé lui-même, pour une période qui contient au moins un relevé.
 *
 * Remonté sur `rangeId` (`key`) : changer de période remet le survol à zéro,
 * le point accroché n'aurait plus le même rang.
 */
function Plot({ view, series }: { view: Frame; series: Sample[] }) {
  const { ref, width } = useWidth()
  const [active, setActive] = useState<number | null>(null)
  const { from, to, visible, offset, entry } = view

  const plotWidth = Math.max(width - PAD.left - PAD.right, 0)
  const plotHeight = HEIGHT - PAD.top - PAD.bottom

  const scale = useMemo(() => valueScale(visible.map((sample) => sample.price)), [visible])
  const dates = useMemo(
    () => timeTicks(from, to, Math.max(Math.floor(plotWidth / TICK_WIDTH), 2)),
    [from, to, plotWidth],
  )

  const x = (t: number) => PAD.left + ((t - from) / (to - from)) * plotWidth
  const y = (price: number) => PAD.top + ((scale.hi - price) / (scale.hi - scale.lo)) * plotHeight

  const drawn = entry ? [entry, ...visible] : visible
  const line = drawn
    .map((sample, i) => `${i === 0 ? 'M' : 'L'}${x(sample.t)},${y(sample.price)}`)
    .join(' ')
  const baseline = PAD.top + plotHeight
  const head = drawn[0]
  const tail = drawn[drawn.length - 1]
  const area =
    head && tail && drawn.length > 1
      ? `${line} L${x(tail.t)},${baseline} L${x(head.t)},${baseline} Z`
      : ''

  const lastVisible = visible[visible.length - 1]
  const current = active === null ? null : visible[active]
  const previous = active === null ? null : (series[offset + active - 1] ?? null)
  const delta = current && previous ? current.price - previous.price : null
  const ratio = delta !== null && previous?.price ? delta / previous.price : null

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const pointer = event.clientX - event.currentTarget.getBoundingClientRect().left
    let best = 0
    let distance = Infinity
    visible.forEach((sample, i) => {
      const gap = Math.abs(x(sample.t) - pointer)
      if (gap < distance) {
        distance = gap
        best = i
      }
    })
    setActive(best)
  }

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const lastIndex = visible.length - 1
    const moves: Record<string, number> = {
      ArrowLeft: Math.max((active ?? visible.length) - 1, 0),
      ArrowRight: Math.min((active ?? -1) + 1, lastIndex),
      Home: 0,
      End: lastIndex,
    }
    const move = moves[event.key]
    if (event.key === 'Escape') setActive(null)
    else if (move !== undefined) setActive(move)
    else return
    event.preventDefault()
  }

  const labelAbove = lastVisible ? y(lastVisible.price) > PAD.top + 14 : true

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          tabIndex={0}
          role="img"
          aria-label={`Courbe du prix : ${visible.length} relevé${visible.length > 1 ? 's' : ''} sur la période. Flèches pour parcourir les relevés.`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block touch-pan-y select-none focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:ring-inset focus-visible:outline-none"
        >
          {/* Grille et graduations de prix, posées dans le cadre : pas de
              marge à calculer sur la largeur des nombres. */}
          {scale.ticks.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotWidth}
                y1={y(value)}
                y2={y(value)}
                className="stroke-slate-800"
                strokeWidth={1}
              />
              <text
                x={PAD.left + 2}
                y={y(value) - 4}
                className="fill-slate-500 text-[10px] tabular-nums [paint-order:stroke] stroke-slate-950 [stroke-width:3px]"
              >
                {COMPACT.format(value)}
              </text>
            </g>
          ))}

          {dates.map((tick) => {
            const tx = x(tick.t)
            const anchor =
              tx < PAD.left + 24 ? 'start' : tx > PAD.left + plotWidth - 24 ? 'end' : 'middle'
            return (
              <text
                key={tick.t}
                x={tx}
                y={HEIGHT - 8}
                textAnchor={anchor}
                className="fill-slate-500 text-[10px] tabular-nums [paint-order:stroke] stroke-slate-950 [stroke-width:3px]"
              >
                {tick.label}
              </text>
            )
          })}

          {area && <path d={area} className="fill-amber-500/10" />}
          <path
            d={line}
            fill="none"
            className="stroke-amber-500"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {current && (
            <line
              x1={x(current.t)}
              x2={x(current.t)}
              y1={PAD.top}
              y2={baseline}
              className="stroke-slate-600"
              strokeWidth={1}
            />
          )}

          {/* L'anneau couleur du fond sépare les points de la courbe, et
              entre eux quand ils se touchent. */}
          {visible.map((sample, i) => (
            <circle
              key={sample.t}
              cx={x(sample.t)}
              cy={y(sample.price)}
              r={i === active ? 5.5 : 4}
              className="fill-amber-500 stroke-slate-950"
              strokeWidth={2}
            />
          ))}

          {/* Le dernier prix, lu sans survoler. Effacé pendant le survol : la
              bulle le redit. */}
          {lastVisible && active === null && (
            <text
              x={x(lastVisible.t) - 8}
              y={labelAbove ? y(lastVisible.price) - 9 : y(lastVisible.price) + 16}
              textAnchor="end"
              className="fill-slate-300 text-[11px] tabular-nums"
            >
              {formatKamas(lastVisible.price)}
            </text>
          )}
        </svg>
      )}

      {current && (
        <Readout
          x={x(current.t)}
          y={y(current.price)}
          flip={x(current.t) > width / 2}
          below={y(current.price) < 70}
          sample={current}
          delta={delta}
          ratio={ratio}
        />
      )}

      {/* Ce que la bulle montre, dit aux lecteurs d'écran quand on parcourt au clavier. */}
      <p className="sr-only" aria-live="polite">
        {current
          ? `${formatDateTime(new Date(current.t).toISOString())} : ${formatKamas(current.price)} kamas${
              delta === null
                ? ''
                : `, ${delta >= 0 ? '+' : ''}${formatKamas(delta)} (${formatPercent(ratio)})`
            }`
          : ''}
      </p>
    </div>
  )
}

/**
 * La bulle d'un relevé, à côté du point. Elle passe de l'autre côté du
 * curseur quand le bord approche, et sous le point quand le haut manque.
 */
function Readout({
  x,
  y,
  flip,
  below,
  sample,
  delta,
  ratio,
}: {
  x: number
  y: number
  flip: boolean
  below: boolean
  sample: Sample
  delta: number | null
  ratio: number | null
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-xs leading-snug whitespace-nowrap shadow-lg shadow-black/50"
      style={{
        left: flip ? x - 12 : x + 12,
        top: below ? y + 14 : y - 12,
        transform: `${flip ? 'translateX(-100%)' : ''} ${below ? '' : 'translateY(-100%)'}`,
      }}
    >
      <p className="text-slate-400">{formatDateTime(new Date(sample.t).toISOString())}</p>
      <p className="flex items-center gap-2">
        <Kamas value={sample.price} className="text-sm font-medium text-slate-100" />
        {delta !== null && (
          <span
            className={`flex items-center gap-1 tabular-nums ${
              delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            <TrendIcon value={delta} className="size-3 shrink-0" />
            <Kamas value={delta} signed />
            {ratio !== null && <span className="text-slate-500">{formatPercent(ratio)}</span>}
          </span>
        )}
      </p>
    </div>
  )
}
