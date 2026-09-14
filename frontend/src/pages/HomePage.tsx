/**
 * L'accueil : la vitrine de l'app.
 *
 * Ce que fait Kamadvice, en grand, et où aller ensuite. La page garde la même
 * forme pour tout le monde — une page qui se réorganise selon ce que le
 * navigateur garde en mémoire ne s'apprend pas — mais elle vit : les chiffres
 * sont ceux du moment, et les illustrations sont les icônes du jeu, servies
 * par les mêmes CDN que partout ailleurs, sans un asset de plus à héberger.
 * Une icône introuvable (item renommé à une mise à jour) disparaît sans bruit,
 * la carte reste.
 *
 * Une seule chose s'y règle : le serveur de jeu. Il conditionne tous les prix
 * de l'app, donc il se choisit avant d'aller les voir, et il est visible ici
 * plutôt qu'enfoui dans un menu.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import ItemIcon from '../components/ItemIcon'
import JobIcon from '../components/JobIcon'
import { usePinnedShortcuts } from '../components/SectionMenus'
import ServerIcon from '../components/ServerIcon'
import ServerPicker from '../components/ServerPicker'
import { useOnlineCount } from '../data/audience'
import { useCatalog } from '../data/catalogContext'
import { usePrices } from '../data/prices'
import { recordQuery } from '../data/recent'
import { useServer } from '../data/servers'
import type { Catalog, Item, Species } from '../domain/types'
import { Icon } from '../lib/icons'
import {
  BREEDING_PATH,
  CARBURANT_PATH,
  DASHBOARDS,
  FAVORITES,
  JOBS_PATH,
  SEARCH,
  SEARCH_EXAMPLES,
} from '../lib/pages'

// --- Illustrations ------------------------------------------------------------

/** D'où viennent les icônes d'une illustration. Toutes sont déjà au catalogue. */
type Art =
  | { kind: 'items'; names: readonly string[] }
  | { kind: 'jobs'; names: readonly string[] }
  | { kind: 'mounts'; picks: readonly (readonly [Species, string])[] }

/**
 * Les items nommés, dans l'ordre demandé, sans ceux qui manquent. Un seul
 * passage sur le catalogue : les noms y sont uniques à de rares exceptions,
 * et le premier trouvé fait l'affaire.
 */
function itemsNamed(catalog: Catalog, names: readonly string[]): Item[] {
  const wanted = new Set(names)
  const found = new Map<string, Item>()
  for (const item of catalog.items) {
    if (wanted.has(item.name) && !found.has(item.name)) found.set(item.name, item)
    if (found.size === wanted.size) break
  }
  return names.flatMap((name) => {
    const item = found.get(name)
    return item ? [item] : []
  })
}

/** Les icônes d'une illustration, prêtes à poser dans une tuile. */
function artwork(catalog: Catalog, art: Art, size: number): ReactNode[] {
  switch (art.kind) {
    case 'items':
      return itemsNamed(catalog, art.names).map((item) => (
        <ItemIcon key={item.id} item={item} size={size} />
      ))
    case 'jobs':
      return art.names.flatMap((name) => {
        const job = catalog.jobs.find((candidate) => candidate.name === name)
        return job ? [<JobIcon key={job.id} job={job} size={size} />] : []
      })
    case 'mounts':
      return art.picks.flatMap(([species, name]) => {
        const variety = catalog.mounts.varieties.find(
          (candidate) => candidate.species === species && candidate.name === name,
        )
        const item = variety ? catalog.byId.get(variety.id) : undefined
        return item ? [<ItemIcon key={item.id} item={item} size={size} />] : []
      })
  }
}

/** Une icône du jeu sur un fond qui la détache : la même tuile partout sur la page. */
function Tile({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900/95 shadow-lg shadow-black/40 ${className}`}
      style={style}
    >
      {children}
    </span>
  )
}

// --- Les sections de l'app, en cartes ------------------------------------------

type Tone = 'amber' | 'rose' | 'emerald' | 'sky' | 'violet'

/**
 * Les classes d'une teinte, écrites en toutes lettres : Tailwind ne génère que
 * ce qu'il lit dans les sources, une classe composée à l'exécution n'existerait
 * pas.
 */
const TONES: Record<
  Tone,
  { glyph: string; title: string; border: string; shadow: string; halo: string; tile: string }
> = {
  amber: {
    glyph: 'text-amber-400',
    title: 'group-hover:text-amber-300',
    border: 'hover:border-amber-500/50',
    shadow: 'hover:shadow-amber-500/15',
    halo: 'bg-amber-500/15 group-hover:bg-amber-500/30',
    tile: 'group-hover:border-amber-500/50',
  },
  rose: {
    glyph: 'text-rose-400',
    title: 'group-hover:text-rose-300',
    border: 'hover:border-rose-500/50',
    shadow: 'hover:shadow-rose-500/15',
    halo: 'bg-rose-500/15 group-hover:bg-rose-500/30',
    tile: 'group-hover:border-rose-500/50',
  },
  emerald: {
    glyph: 'text-emerald-400',
    title: 'group-hover:text-emerald-300',
    border: 'hover:border-emerald-500/50',
    shadow: 'hover:shadow-emerald-500/15',
    halo: 'bg-emerald-500/15 group-hover:bg-emerald-500/30',
    tile: 'group-hover:border-emerald-500/50',
  },
  sky: {
    glyph: 'text-sky-400',
    title: 'group-hover:text-sky-300',
    border: 'hover:border-sky-500/50',
    shadow: 'hover:shadow-sky-500/15',
    halo: 'bg-sky-500/15 group-hover:bg-sky-500/30',
    tile: 'group-hover:border-sky-500/50',
  },
  violet: {
    glyph: 'text-violet-400',
    title: 'group-hover:text-violet-300',
    border: 'hover:border-violet-500/50',
    shadow: 'hover:shadow-violet-500/15',
    halo: 'bg-violet-500/15 group-hover:bg-violet-500/30',
    tile: 'group-hover:border-violet-500/50',
  },
}

/**
 * Ce que l'accueil ajoute à chaque page de `lib/pages` : une teinte et une
 * illustration. Indexé par chemin, pour que la liste des pages reste écrite à
 * un seul endroit — une page sans entrée ici a quand même sa carte, en gris.
 */
const SHOWCASE: Record<string, { tone: Tone; art: Art; span: string }> = {
  [SEARCH.to]: {
    tone: 'amber',
    art: { kind: 'items', names: ['Dofus Émeraude', 'Gelano', 'Blé'] },
    span: 'lg:col-span-3',
  },
  [FAVORITES.to]: {
    tone: 'rose',
    art: { kind: 'items', names: ['Dofus Pourpre', 'Dofus Turquoise', 'Dofus Ocre'] },
    span: 'lg:col-span-3',
  },
  [CARBURANT_PATH]: {
    tone: 'emerald',
    art: {
      kind: 'items',
      names: ['Petit Extrait de Mangeoire', "Grand Extrait d'Abreuvoir", 'Gigantesque Extrait de Dragofesse'],
    },
    span: 'lg:col-span-2',
  },
  [JOBS_PATH]: {
    tone: 'sky',
    art: { kind: 'jobs', names: ['Forgeron', 'Alchimiste', 'Bûcheron'] },
    span: 'lg:col-span-2',
  },
  [BREEDING_PATH]: {
    tone: 'violet',
    art: {
      kind: 'mounts',
      picks: [
        ['dragodinde', 'Amande'],
        ['muldo', 'Doré'],
        ['volkorne', 'Ébène'],
      ],
    },
    span: 'lg:col-span-2',
  },
}

const NEUTRAL_TONE: (typeof TONES)[Tone] = {
  glyph: 'text-slate-400',
  title: 'group-hover:text-slate-50',
  border: 'hover:border-slate-600',
  shadow: 'hover:shadow-black/40',
  halo: 'bg-slate-500/10 group-hover:bg-slate-500/20',
  tile: 'group-hover:border-slate-500',
}

/**
 * L'éventail de trois tuiles d'une carte : la première penche à gauche, la
 * dernière à droite, celle du milieu passe devant. Au survol, l'éventail
 * s'ouvre. Écrit tuile par tuile, Tailwind oblige.
 */
const FAN = [
  'z-0 -rotate-6 translate-y-2 group-hover:-rotate-12 group-hover:-translate-x-3 group-hover:translate-y-3',
  'z-10 -translate-y-1 group-hover:-translate-y-4 group-hover:scale-110',
  'z-0 rotate-6 translate-y-2 group-hover:rotate-12 group-hover:translate-x-3 group-hover:translate-y-3',
]

/** Une page de l'app, en carte illustrée : un clic l'ouvre. */
function ShowcaseCard({
  to,
  icon: Glyph,
  label,
  description,
}: {
  to: string
  icon?: LucideIcon
  label: string
  description?: string
}) {
  const catalog = useCatalog()
  const extra = SHOWCASE[to]
  const tone = extra ? TONES[extra.tone] : NEUTRAL_TONE
  const icons = useMemo(
    () => (extra ? artwork(catalog, extra.art, 40) : []),
    [catalog, extra],
  )

  return (
    <Link
      to={to}
      className={`group relative flex min-h-64 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1 hover:bg-slate-900/80 hover:shadow-2xl focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${tone.border} ${tone.shadow} ${extra?.span ?? ''}`}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute -top-16 -right-16 size-56 rounded-full blur-3xl transition duration-500 ${tone.halo}`}
      />

      {icons.length > 0 && (
        <span aria-hidden className="absolute top-6 right-6 flex -space-x-3">
          {icons.map((icon, index) => (
            <Tile
              key={index}
              className={`size-16 p-2 transition duration-300 ${tone.tile} ${FAN[index] ?? ''}`}
            >
              {icon}
            </Tile>
          ))}
        </span>
      )}

      <span className="relative mt-auto pt-20">
        <span className="flex items-center gap-2">
          {Glyph && <Glyph className={`size-5 shrink-0 ${tone.glyph}`} aria-hidden />}
          <span className={`text-lg font-semibold text-slate-100 transition ${tone.title}`}>
            {label}
          </span>
        </span>
        {description && (
          <span className="mt-2 block text-sm leading-relaxed text-slate-400">{description}</span>
        )}
        <span className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${tone.glyph}`}>
          Ouvrir
          <Icon.next
            className="size-4 transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden
          />
        </span>
      </span>
    </Link>
  )
}

// --- Le hero ------------------------------------------------------------------

/**
 * Les icônes qui flottent autour du logo. Des ressources, des équipements,
 * des montures, un carburant : un échantillon de ce que l'app chiffre.
 */
const FLOATING = [
  'Dofus Émeraude',
  'Gelano',
  'Blé',
  'Dragodinde Amande',
  'Fer',
  'Petit Extrait de Mangeoire',
  'Bois de Frêne',
  'Dofus Pourpre',
  'Trèfle à 5 feuilles',
  'Or',
  'Potion de Rappel',
  'Muldo Doré',
  'Truite',
  'Dofus Turquoise',
  'Volkorne Ivoire',
  "Bois d'If",
]

/**
 * Un générateur pseudo-aléatoire à graine fixe (mulberry32) : la dispersion
 * doit avoir l'air d'un hasard, mais être la même à chaque visite — une page
 * qui se réorganise à chaque chargement ne s'apprend pas.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Scatter {
  /** Position, en pourcentage du visuel. */
  style: CSSProperties
  /** Côté de la tuile, en pixels : les plus grandes semblent plus proches. */
  size: number
  /** Inclinaison fixe, en degrés : aucune tuile n'est tout à fait droite. */
  tilt: number
}

/** Le rayon, en pourcentage du visuel, entre lequel flottent les icônes. */
const RADIUS_MIN = 22
/** Sous 42 % : sur mobile, une tuile au bord doit tenir dans la marge de la page, dérive comprise. */
const RADIUS_MAX = 42
/**
 * Écart minimal entre deux icônes, en pourcentage. Plus que la plus grande
 * tuile : c'est cet écart qui pousse les icônes à occuper toute la couronne
 * au lieu de se tasser d'un côté.
 */
const SPACING = 17

/**
 * Où va chaque icône. Le cercle est découpé en autant de secteurs que
 * d'icônes, chacune tirée au hasard dans le sien — c'est ce qui garantit
 * qu'aucun côté ne reste vide, ce qu'un tirage libre ne promet pas — à un
 * rayon tantôt proche, tantôt lointain. Puis quelques tours de répulsion :
 * deux points trop proches se repoussent, et chacun reste dans la couronne.
 * Le résultat garde l'air du hasard — pas de grille, pas d'anneau — sans
 * qu'une icône n'en recouvre une autre.
 */
function scatter(count: number): Scatter[] {
  const random = seeded(1337)
  const sector = (2 * Math.PI) / count
  const span = RADIUS_MAX - RADIUS_MIN
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index + 0.15 + random() * 0.7) * sector
    const radius =
      index % 2 === 0
        ? RADIUS_MIN + random() * span * 0.45
        : RADIUS_MIN + span * (0.55 + random() * 0.45)
    return { x: radius * Math.sin(angle), y: -radius * Math.cos(angle) }
  })

  for (let round = 0; round < 60; round++) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]!
        const b = points[j]!
        const dx = b.x - a.x
        const dy = b.y - a.y
        const distance = Math.hypot(dx, dy) || 0.01
        if (distance >= SPACING) continue
        const push = ((SPACING - distance) / distance) * 0.5
        a.x -= dx * push
        a.y -= dy * push
        b.x += dx * push
        b.y += dy * push
      }
    }
    for (const point of points) {
      const radius = Math.hypot(point.x, point.y) || 0.01
      const clamped = Math.min(Math.max(radius, RADIUS_MIN), RADIUS_MAX)
      point.x *= clamped / radius
      point.y *= clamped / radius
    }
  }

  return points.map((point) => {
    const size = Math.round(40 + random() * 16)
    const wander = () => `${Math.round((random() - 0.5) * 24)}px`
    const path = () => `translate(${wander()}, ${wander()})`
    return {
      style: {
        left: `${(50 + point.x).toFixed(1)}%`,
        top: `${(50 + point.y).toFixed(1)}%`,
        zIndex: size,
        '--drift-1': path(),
        '--drift-2': path(),
        '--drift-3': path(),
        animationDuration: `${(8 + random() * 7).toFixed(1)}s`,
        animationDelay: `${(-random() * 12).toFixed(1)}s`,
      } as CSSProperties,
      size,
      tilt: Math.round((random() - 0.5) * 16),
    }
  })
}

const SCATTER = scatter(FLOATING.length)

/**
 * Une icône qui flotte : posée à sa place, penchée, elle dérive sur son
 * propre circuit. Le décalage de centrage et la dérive sont deux `transform`
 * qui s'écraseraient : le premier est sur l'enveloppe, l'animation sur le
 * bloc du dessous, l'inclinaison sur la tuile.
 */
function Floating({ item, place }: { item: Item; place: Scatter }) {
  const { style, size, tilt } = place
  return (
    <span aria-hidden className="absolute -translate-x-1/2 -translate-y-1/2" style={style}>
      <span className="drift block" style={{ animationDuration: style.animationDuration, animationDelay: style.animationDelay }}>
        <Tile
          className="p-1.5"
          style={{ width: size, height: size, transform: `rotate(${tilt}deg)` }}
        >
          <ItemIcon item={item} size={size - 12} />
        </Tile>
      </span>
    </span>
  )
}

/**
 * Le logo au centre, comme une boussole, un halo derrière, et tout autour
 * des icônes dispersées qui flottent chacune à son rythme.
 */
function HeroVisual() {
  const catalog = useCatalog()
  const floating = useMemo(() => itemsNamed(catalog, FLOATING), [catalog])

  return (
    // `isolate` : les tuiles s'empilent entre elles par `z-index` (les plus
    // grandes devant) ; sans contexte propre, elles passeraient aussi devant
    // les menus du header et les fenêtres.
    <div className="relative isolate mx-auto aspect-square w-full max-w-88 sm:max-w-104 lg:max-w-md">
      <div aria-hidden className="absolute inset-[10%] rounded-full bg-amber-500/10 blur-3xl" />
      <div aria-hidden className="absolute inset-[22%] rounded-full bg-amber-500/20 blur-3xl" />
      <div
        aria-hidden
        className="absolute inset-[30%] translate-x-6 translate-y-6 rounded-full bg-emerald-500/15 blur-2xl"
      />

      {floating.map((item, index) => {
        const place = SCATTER[index]
        return place ? <Floating key={item.id} item={item} place={place} /> : null
      })}

      <div className="absolute inset-[34%] z-10 flex items-center justify-center">
        <div className="float">
          <img
            src={`${import.meta.env.BASE_URL}data/logo.webp`}
            alt=""
            width={96}
            height={96}
            className="size-full drop-shadow-[0_12px_32px_rgba(245,158,11,0.45)] select-none"
          />
        </div>
      </div>
    </div>
  )
}

// --- Les chiffres ------------------------------------------------------------------

function StatTile({
  icon: Glyph,
  value,
  label,
  className = '',
}: {
  icon: LucideIcon
  value: number
  label: string
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 px-5 py-4 ${className}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/80 text-amber-400">
        <Glyph className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold tabular-nums text-slate-100">
          {value.toLocaleString('fr-FR')}
        </span>
        <span className="block text-xs leading-snug text-slate-500">{label}</span>
      </span>
    </div>
  )
}

// --- La page --------------------------------------------------------------------

/** Retard d'entrée d'une section : elles arrivent l'une après l'autre. */
const after = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })

function Heading({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string
  title: string
  lead?: ReactNode
}) {
  return (
    <div className="max-w-2xl space-y-2">
      <p className="text-xs font-semibold tracking-[0.2em] text-amber-400/90 uppercase">{eyebrow}</p>
      <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">{title}</h2>
      {lead && <p className="text-sm text-slate-400 sm:text-base">{lead}</p>}
    </div>
  )
}

export default function HomePage() {
  const catalog = useCatalog()
  const prices = usePrices()
  const server = useServer()
  const online = useOnlineCount()
  const pinned = usePinnedShortcuts()

  const steps: { title: string; text: string; glyph: ReactNode }[] = [
    {
      title: 'Choisissez votre serveur',
      text: "Chaque serveur a ses prix. Celui réglé ici vaut pour toute l'app, jusqu'à ce que vous en changiez.",
      glyph: <ServerIcon server={server} size={28} />,
    },
    {
      title: 'Relevez un prix',
      text: "Un champ par item, sur toutes les pages. Un prix saisi est partagé aussitôt avec tous les visiteurs du serveur.",
      glyph: <Icon.price className="size-6 text-amber-400" aria-hidden />,
    },
    {
      title: 'Décidez',
      text: 'Le prix HDV face au coût de fabrication : la marge se lit en vert ou en rouge, sur chaque ligne.',
      glyph: <Icon.craft className="size-6 text-emerald-400" aria-hidden />,
    },
  ]

  const tips: { icon: LucideIcon; tone: string; text: ReactNode }[] = [
    {
      icon: Icon.favorite,
      tone: 'text-rose-400',
      text: "Le cœur d'une ligne épingle l'item dans vos favoris, pour le retrouver sans le rechercher.",
    },
    {
      icon: Icon.copied,
      tone: 'text-emerald-400',
      text: (
        <>
          <kbd className="rounded border border-slate-700 px-1 text-[10px]">Alt</kbd> + clic sur un
          item copie son nom, à coller dans la recherche de l'HDV.
        </>
      ),
    },
    {
      icon: Icon.wizard,
      tone: 'text-amber-400',
      text: "La baguette d'un tableau fait le tour des prix manquants, HDV par HDV, le nom déjà copié.",
    },
  ]

  return (
    <div className="relative flex flex-1 flex-col pb-8">
      {/* Fond : lueurs et quadrillage, fixés à la fenêtre et derrière tout.
          Purement décoratif, et sous le header translucide pour que le haut
          de la page baigne dans la même lumière. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="home-grid absolute inset-x-0 top-0 h-160" />
        <div className="absolute -top-40 left-1/4 size-144 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-120 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 size-112 rounded-full bg-violet-500/8 blur-3xl" />
      </div>

      {/* Le hero : ce que fait l'app, le serveur, et par où commencer. */}
      <section className="rise grid items-center gap-10 py-8 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6 lg:py-20">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs text-slate-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            {online === null
              ? 'Prix partagés en direct, sans compte'
              : `${online.toLocaleString('fr-FR')} en ligne · prix partagés en direct`}
          </p>

          <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
            Acheter ou{' '}
            <span className="bg-linear-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
              crafter
            </span>
            {' '}?
          </h1>

          <p className="max-w-xl text-base text-slate-400 sm:text-lg">
            Kamadvice met face à face le prix à l'HDV et le coût de fabrication de chaque item de
            Dofus. Les relevés viennent de ceux qui s'en servent et sont partagés en direct :
            saisissez-en un, tout le monde en profite.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ServerPicker />
            <p className="text-xs text-slate-500">
              Les prix affichés partout dans l'app sont ceux de ce serveur.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              to={SEARCH.to}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-amber-500 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/25 transition hover:bg-amber-400 hover:shadow-amber-400/40 focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:outline-none"
            >
              <Icon.search className="size-4" aria-hidden />
              Explorer le catalogue
            </Link>
            <Link
              to={JOBS_PATH}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
            >
              <Icon.job className="size-4" aria-hidden />
              Voir les métiers
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Pour commencer :</span>
            {SEARCH_EXAMPLES.map((example) => (
              <Link
                key={example}
                to={`${SEARCH.to}?q=${encodeURIComponent(example)}`}
                // La recherche part d'ici sans passer par le champ du header : à
                // lui de l'apprendre quand même, il la reproposera ensuite.
                onClick={() => recordQuery(example)}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-400 transition hover:border-amber-500/60 hover:text-amber-400"
              >
                {example}
              </Link>
            ))}
          </div>
        </div>

        <HeroVisual />
      </section>

      {/* Les écrans épinglés, s'il y en a : le chemin le plus court vers ce
          qu'on ouvre tous les jours. Ils s'épinglent depuis les menus du header. */}
      {pinned.length > 0 && (
        <section className="rise mb-8 flex flex-wrap items-center gap-2" style={after(60)}>
          <span className="mr-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Icon.pin className="size-3.5 fill-current text-amber-400" aria-hidden />
            Épinglés :
          </span>
          {pinned.map((item) => {
            const Glyph = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-200 transition hover:border-amber-500/60 hover:text-amber-300"
              >
                {item.glyph ?? (Glyph && <Glyph className="size-4 text-slate-400" aria-hidden />)}
                {item.label}
              </Link>
            )
          })}
        </section>
      )}

      {/* Les chiffres du moment : ce que sait l'app, et ce qu'elle sait de ce serveur. */}
      <section className="rise grid grid-cols-2 gap-3 lg:grid-cols-4" style={after(120)}>
        <StatTile icon={Icon.item} value={catalog.items.length} label="items au catalogue" />
        <StatTile icon={Icon.recipe} value={catalog.recipeFor.size} label="recettes de craft" />
        <StatTile icon={Icon.price} value={prices.size} label={`prix relevés sur ${server.name}`} />
        <StatTile icon={Icon.job} value={catalog.jobs.length} label="métiers producteurs" />
      </section>

      {/* Les pages, en cartes illustrées. */}
      <section className="rise mt-16 space-y-8 sm:mt-24" style={after(200)}>
        <Heading
          eyebrow="Où aller"
          title="Tout le jeu de prix, en cinq pages"
          lead="Les mêmes prix partout : un relevé fait dans un tableau de bord se retrouve dans la recherche, les favoris et les fiches."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[SEARCH, FAVORITES, ...DASHBOARDS].map((page) => (
            <ShowcaseCard
              key={page.to}
              to={page.to}
              icon={page.icon}
              label={page.label}
              description={page.description}
            />
          ))}
        </div>
      </section>

      {/* La méthode, en trois pas. */}
      <section className="rise mt-16 space-y-8 sm:mt-24" style={after(280)}>
        <Heading
          eyebrow="Comment ça marche"
          title="Trois gestes, et la décision se lit toute seule"
        />
        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <span className="flex items-center justify-between">
                <span className="flex size-12 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-900">
                  {step.glyph}
                </span>
                <span
                  className="text-5xl font-semibold tracking-tighter text-slate-800 tabular-nums select-none"
                  aria-hidden
                >
                  {index + 1}
                </span>
              </span>
              <h3 className="mt-5 text-base font-semibold text-slate-100">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Les gestes qui font gagner du temps. */}
      <section className="rise mt-16 space-y-8 sm:mt-24" style={after(360)}>
        <Heading eyebrow="Bon à savoir" title="Trois raccourcis" />
        <ul className="grid gap-4 sm:grid-cols-3">
          {tips.map((tip, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-400"
            >
              <tip.icon className={`mt-0.5 size-5 shrink-0 ${tip.tone}`} aria-hidden />
              <span>{tip.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
