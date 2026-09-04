import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import CopyOnAltClick from './components/CopyOnAltClick'
import Footer from './components/Footer'
import NavMenu from './components/NavMenu'
import SearchBox from './components/SearchBox'
import { CatalogContext } from './data/catalogContext'
import { loadCatalog } from './data/catalog'
import { flushOutbox, loadPrices, refreshPrices, watchPrices } from './data/prices'
import { migrateLocalPrices } from './data/priceMigration'
import type { Catalog } from './domain/types'
import { Icon } from './lib/icons'
import { DASHBOARDS, FAVORITES, JOBS_PATH, SEARCH } from './lib/pages'
import CarburantPage from './pages/CarburantPage'
import FavoritesPage from './pages/FavoritesPage'
import HomePage from './pages/HomePage'
import ItemsPage from './pages/ItemsPage'
import ItemPage from './pages/ItemPage'
import JobPage from './pages/JobPage'
import JobsPage from './pages/JobsPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { pathname } = useLocation()

  /**
   * Le châssis ne bouge pas d'une page à l'autre : logo, recherche et liens
   * gardent leur place, même quand le contenu, lui, change de largeur.
   */
  const CHROME = 'max-w-[110rem]'

  // Un tableau de bord aligne une quinzaine de colonnes : la largeur de
  // lecture des autres pages l'étoufferait. La liste des métiers, elle, est
  // une page de lecture.
  const wide = pathname.startsWith('/dashboard') || pathname.startsWith(`${JOBS_PATH}/`)
  const shell = wide ? CHROME : 'max-w-6xl'

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
      <CopyOnAltClick />
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          <div className={`mx-auto flex ${CHROME} items-center gap-8 px-4 py-3`}>
            {/* Les deux flancs grandissent à parts égales : c'est ce qui pose
                la recherche au milieu du header, et non au milieu de ce que la
                navigation lui laisse. */}
            <div className="flex flex-1 items-center">
              <Link
                to="/"
                className="flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-slate-100 hover:text-amber-400"
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
            </div>

            <SearchBox className="w-full max-w-2xl" />

            <nav className="flex flex-1 items-center justify-end gap-1">
              <NavMenu label="Dashboard" icon={Icon.dashboard} items={DASHBOARDS} />
              <NavLink to={FAVORITES.to} icon={Icon.favorite} label={FAVORITES.label} />
            </nav>
          </div>
        </header>

        <main className={`mx-auto flex w-full ${shell} flex-1 flex-col px-4 py-6`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path={FAVORITES.to} element={<FavoritesPage />} />
            <Route path={SEARCH.to} element={<ItemsPage />} />
            <Route path="/item/:id" element={<ItemPage />} />
            <Route path={DASHBOARDS[0]!.to} element={<CarburantPage />} />
            <Route path="/dashboard" element={<Navigate to={DASHBOARDS[0]!.to} replace />} />
            <Route path={JOBS_PATH} element={<JobsPage />} />
            <Route path={`${JOBS_PATH}/:slug`} element={<JobPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <Footer shell={CHROME} />
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
