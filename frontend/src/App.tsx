import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import NavMenu, { type NavMenuItem } from './components/NavMenu'
import { CatalogContext } from './data/catalogContext'
import { loadCatalog } from './data/catalog'
import { flushOutbox, loadPrices, refreshPrices, watchPrices } from './data/prices'
import { migrateLocalPrices } from './data/priceMigration'
import type { Catalog } from './domain/types'
import { Icon } from './lib/icons'
import CarburantPage from './pages/CarburantPage'
import FavoritesPage from './pages/FavoritesPage'
import ItemsPage from './pages/ItemsPage'
import ItemPage from './pages/ItemPage'
import NotFoundPage from './pages/NotFoundPage'

/** Entrées du menu « Dashboard ». À garder alignées sur les routes ci-dessous. */
const DASHBOARDS: NavMenuItem[] = [
  {
    to: '/dashboard/carburant',
    label: 'Carburant',
    icon: Icon.fuel,
    description: "Acheter ou crafter les extraits d'enclos",
  },
]

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { pathname } = useLocation()

  // Un tableau de bord aligne une quinzaine de colonnes : la largeur de
  // lecture des autres pages l'étoufferait.
  const shell = pathname.startsWith('/dashboard') ? 'max-w-[110rem]' : 'max-w-6xl'

  useEffect(() => {
    const controller = new AbortController()
    loadCatalog(controller.signal)
      .then(setCatalog)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })

    // Les prix, eux, ne retiennent pas l'affichage : le cache local les montre
    // déjà, et la version partagée les remplace dès qu'elle arrive. Une panne
    // côté Supabase ne doit pas coûter plus qu'une fraîcheur perdue.
    loadPrices(controller.signal).catch(() => {})

    // Reprise des prix saisis avant le partage, puis des envois qui avaient
    // échoué. Les deux sont sans effet quand il n'y a rien à remonter.
    migrateLocalPrices()
      .then(flushOutbox)
      .catch(() => {})

    // Les relevés des autres arrivent en direct.
    const unwatch = watchPrices()

    // Filet : une connexion Realtime coupée laisse passer des relevés sans
    // prévenir. Le retour sur l'onglet et celui du réseau resynchronisent.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPrices()
    }
    const onOnline = () => {
      void flushOutbox()
      refreshPrices()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      controller.abort()
      unwatch()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  if (error) {
    return (
      <Centered>
        <Icon.error className="mx-auto size-8 text-rose-400" aria-hidden />
        <p className="mt-3 text-rose-400">Impossible de charger le catalogue.</p>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
      </Centered>
    )
  }

  if (!catalog) {
    return (
      <Centered>
        <Icon.loading className="mx-auto size-8 animate-spin text-slate-600" aria-hidden />
        <p className="mt-3 text-slate-400">Chargement du catalogue…</p>
      </Centered>
    )
  }

  return (
    <CatalogContext.Provider value={catalog}>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className={`mx-auto flex ${shell} items-center gap-4 px-4 py-3`}>
            <Link
              to="/"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-100 hover:text-amber-400"
            >
              <img
                src={`${import.meta.env.BASE_URL}data/logo.webp`}
                alt=""
                aria-hidden
                // Dimensions natives : sans elles, le titre sursaute au chargement.
                width={96}
                height={96}
                className="size-7 shrink-0 select-none"
              />
              Kamadvice
            </Link>
            <nav className="flex items-center gap-1">
              <NavLink to="/" icon={Icon.favorite} label="Favoris" />
              <NavLink to="/recherche" icon={Icon.search} label="Recherche" />
              <NavMenu label="Dashboard" icon={Icon.dashboard} items={DASHBOARDS} />
            </nav>
            <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Icon.item className="size-3.5" aria-hidden />
                {catalog.items.length.toLocaleString('fr-FR')} items
              </span>
              <span className="flex items-center gap-1">
                <Icon.recipe className="size-3.5" aria-hidden />
                {catalog.recipeFor.size.toLocaleString('fr-FR')} recettes
              </span>
            </span>
          </div>
        </header>

        <main className={`mx-auto w-full ${shell} flex-1 px-4 py-6`}>
          <Routes>
            <Route path="/" element={<FavoritesPage />} />
            <Route path="/recherche" element={<ItemsPage />} />
            <Route path="/item/:id" element={<ItemPage />} />
            <Route path="/dashboard/carburant" element={<CarburantPage />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/carburant" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>
    </CatalogContext.Provider>
  )
}

/**
 * Lien du header, accordé au bouton de `NavMenu` : les deux se côtoient dans la
 * même barre, un écart de style s'y verrait.
 */
function NavLink({ to, icon: Glyph, label }: { to: string; icon: LucideIcon; label: string }) {
  const { pathname } = useLocation()
  const current = pathname === to
  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-sm hover:text-amber-400 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none ${
        current ? 'text-slate-100' : 'text-slate-400'
      }`}
    >
      <Glyph className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>{children}</div>
    </div>
  )
}
