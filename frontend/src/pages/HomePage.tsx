/**
 * L'accueil : ce que fait l'app, et où aller ensuite.
 *
 * La même page pour tout le monde, quel que soit ce que le navigateur garde en
 * mémoire — une page qui change de forme selon l'état du visiteur ne s'apprend
 * pas. D'où le format court : deux phrases, les pages en cartes, de quoi
 * amorcer une recherche, et rien d'autre à faire défiler.
 *
 * Une seule chose s'y règle : le serveur de jeu. Il conditionne tous les prix
 * de l'app, donc il se choisit avant d'aller les voir, et il est visible ici
 * plutôt qu'enfoui dans un menu.
 */
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import ServerPicker from '../components/ServerPicker'
import { recordQuery } from '../data/recent'
import { Icon } from '../lib/icons'
import { DASHBOARDS, FAVORITES, SEARCH, SEARCH_EXAMPLES } from '../lib/pages'

export default function HomePage() {
  return (
    // `my-auto` plutôt que `justify-center` : sur un écran trop court, des
    // marges automatiques se réduisent à zéro au lieu de rogner le haut du
    // bloc, et la page redevient simplement défilante.
    <div className="flex flex-1 flex-col">
      <div className="my-auto space-y-8 py-4">
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold text-slate-100 sm:text-3xl">
            Acheter ou crafter ?
          </h1>
          <p className="max-w-3xl text-sm text-slate-400 sm:text-base">
            Kamadvice met face à face le prix à l'HDV et le coût de fabrication de chaque item de
            Dofus. Les relevés viennent de ceux qui s'en servent et sont partagés en direct :
            saisissez-en un, tout le monde en profite.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <ServerPicker />
            <p className="text-xs text-slate-500">
              Chaque serveur a ses prix : ceux affichés partout dans l'app sont ceux de celui-ci.
            </p>
          </div>
        </header>

        <div className="flex flex-wrap gap-4">
          {[SEARCH, FAVORITES, ...DASHBOARDS].map((page) => (
            <Shortcut
              key={page.to}
              to={page.to}
              icon={page.icon}
              label={page.label}
              description={page.description}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500">
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5">
              <Icon.search className="size-3.5 shrink-0" aria-hidden />
              Pour commencer :
            </span>
            {SEARCH_EXAMPLES.map((example) => (
              <Link
                key={example}
                to={`${SEARCH.to}?q=${encodeURIComponent(example)}`}
                // La recherche part d'ici sans passer par le champ du header : à
                // lui de l'apprendre quand même, il la reproposera ensuite.
                onClick={() => recordQuery(example)}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-400 hover:border-slate-600 hover:text-amber-400"
              >
                {example}
              </Link>
            ))}
          </span>

          <span className="flex items-center gap-2">
            <Icon.favorite className="size-3.5 shrink-0 text-rose-400" aria-hidden />
            Le cœur d'une ligne épingle l'item dans vos favoris.
          </span>

          <span className="flex items-center gap-2">
            <Icon.copied className="size-3.5 shrink-0 text-emerald-400" aria-hidden />
            <kbd className="rounded border border-slate-700 px-1 text-[10px]">Alt</kbd> + clic sur un
            item copie son nom, à coller dans la recherche de l'HDV.
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Une page de l'app, en carte. Les cartes se partagent la ligne à parts égales
 * et grandissent avec la place disponible, sans jamais passer sous les 16 rem
 * qui gardent leur description lisible.
 */
function Shortcut({
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
  return (
    <Link
      to={to}
      className="group flex min-w-64 flex-1 items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 hover:bg-slate-900"
    >
      {Glyph && (
        <Glyph
          className="mt-0.5 size-5 shrink-0 text-slate-500 group-hover:text-amber-400"
          aria-hidden
        />
      )}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-200 group-hover:text-amber-400">
          {label}
        </span>
        {description && <span className="mt-1 block text-xs text-slate-500">{description}</span>}
      </span>
    </Link>
  )
}
