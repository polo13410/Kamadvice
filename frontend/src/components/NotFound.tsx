import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, type To } from 'react-router-dom'
import { Icon } from '../lib/icons'

/**
 * Une sortie proposée à quelqu'un de perdu : un lien, ou une action quand la
 * destination ne s'écrit pas dans une URL (le retour arrière, par exemple).
 */
export interface Exit {
  label: string
  description: string
  icon: LucideIcon
  to?: To
  onClick?: () => void
}

/**
 * L'écran des impasses : URL inconnue, item absent du catalogue…
 *
 * Le motif est le même partout — un grand repère en filigrane, ce qui a
 * échoué, et des sorties — pour qu'un cul-de-sac se reconnaisse au premier
 * coup d'œil, quelle qu'en soit la cause. Seul le contenu change.
 */
export default function NotFound({
  code,
  glyph: Glyph,
  title,
  message,
  detail,
  exits,
}: {
  /** Repère en gros derrière l'icône : « 404 », l'id demandé… */
  code: string
  glyph: LucideIcon
  title: string
  message: ReactNode
  /** Ce qui a été demandé, à recopier tel quel : chemin, identifiant… */
  detail?: ReactNode
  exits: Exit[]
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="relative flex items-center justify-center">
        <span
          className="text-7xl font-semibold tracking-tighter text-slate-800 tabular-nums select-none sm:text-8xl"
          aria-hidden
        >
          {code}
        </span>
        <Glyph
          className="absolute size-12 text-amber-500/80 drop-shadow-[0_0_12px_rgba(0,0,0,0.6)] sm:size-14"
          aria-hidden
        />
      </div>

      <h1 className="mt-4 text-lg font-semibold text-slate-100">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">{message}</p>
      {detail && (
        <p className="mt-3 max-w-full overflow-hidden text-xs text-slate-600">
          <code className="rounded border border-slate-800 bg-slate-900/60 px-2 py-1 break-all">
            {detail}
          </code>
        </p>
      )}

      <div className="mt-8 flex w-full max-w-2xl flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
        {exits.map((exit) => (
          <ExitCard key={exit.label} {...exit} />
        ))}
      </div>
    </div>
  )
}

/** Carte de sortie, accordée aux entrées du menu du header. */
function ExitCard({ label, description, icon: Glyph, to, onClick }: Exit) {
  const className =
    'flex grow basis-0 items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-left text-sm text-slate-300 hover:border-amber-500/50 hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none sm:min-w-52'

  const body = (
    <>
      <Glyph className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        {label}
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </>
  )

  if (to === undefined) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    )
  }

  return (
    <Link to={to} onClick={onClick} className={className}>
      {body}
    </Link>
  )
}

/**
 * Sortie « page précédente », absente quand il n'y a rien derrière : sur une
 * URL ouverte directement — un lien partagé, un favori du navigateur — le
 * retour arrière ferait sortir de l'app. React Router marque cette première
 * entrée d'historique par la clé `default`.
 */
export function useBackExit(): Exit[] {
  const navigate = useNavigate()
  const { key } = useLocation()
  if (key === 'default') return []
  return [
    {
      label: 'Page précédente',
      description: "D'où je viens",
      icon: Icon.back,
      onClick: () => navigate(-1),
    },
  ]
}
