import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import CopyOnAltClick from './components/CopyOnAltClick'
import Footer from './components/Footer'
import SearchBox from './components/SearchBox'
import { JobsMenu, PlansMenu, ViewsMenu } from './components/SectionMenus'
import ServerOnboarding from './components/ServerOnboarding'
import ServerPicker from './components/ServerPicker'
import { recordVisit, watchPresence } from './data/audience'
import { CatalogContext } from './data/catalogContext'
import { loadCatalog } from './data/catalog'
import { flushOutbox, loadPrices, refreshPrices, watchPrices } from './data/prices'
import { migrateLocalPrices } from './data/priceMigration'
import { useServer } from './data/servers'
import type { Catalog } from './domain/types'
import { Icon } from './lib/icons'
import { BREEDING_PATH, CARBURANT_PATH, FAVORITES, JOBS_PATH, SEARCH } from './lib/pages'
import BreedingPage from './pages/BreedingPage'
import CarburantPage from './pages/CarburantPage'
import FavoritesPage from './pages/FavoritesPage'
import HomePage from './pages/HomePage'
import ItemsPage from './pages/ItemsPage'
import ItemPage from './pages/ItemPage'
import JobPage from './pages/JobPage'
import JobsPage from './pages/JobsPage'
import NotFoundPage from './pages/NotFoundPage'
import PlanPage from './pages/PlanPage'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { pathname } = useLocation()
  const server = useServer()

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
    return () => controller.abort()
  }, [])

  // Fréquentation : se compter, et compter les autres. Sans effet sur ce que
  // la page montre, donc sans rien retenir ni attendre.
  useEffect(() => {
    void recordVisit()
    return watchPresence()
  }, [])

  // Tout ce qui touche aux prix dépend du serveur de jeu : en changer rejoue
  // cet effet — chargement, canal, filets — pour le nouveau, après avoir
  // refermé le canal de l'ancien.
  useEffect(() => {
    const controller = new AbortController()

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
  }, [server])

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
      <ServerOnboarding />
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
          {/* Sur un écran étroit, la recherche passe seule sur une seconde
              ligne, pleine largeur : logo, serveur et navigation gardent la
              première. À partir de `md`, tout tient sur une ligne. */}
          <div
            className={`mx-auto flex ${CHROME} flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-8`}
          >
            {/* Les deux flancs grandissent à parts égales : c'est ce qui pose
                la recherche au milieu du header, et non au milieu de ce que la
                navigation lui laisse. */}
            <div className="flex flex-1 items-center gap-4">
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
              {/* Le serveur dont on lit et saisit les prix, toujours sous les
                  yeux : un relevé posé sur le mauvais serveur ne se voit pas
                  autrement. */}
              <ServerPicker variant="header" />
            </div>

            <SearchBox className="order-last w-full md:order-0 md:max-w-2xl" />

            {/* Une section par menu, ses écrans épinglés en tête : les
                métiers, les plans d'élevage, les vues. */}
            <nav className="flex flex-1 items-center justify-end gap-1">
              <JobsMenu />
              <PlansMenu />
              <ViewsMenu />
            </nav>
          </div>
        </header>

        <main className={`mx-auto flex w-full ${shell} flex-1 flex-col px-4 py-6`}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path={FAVORITES.to} element={<FavoritesPage />} />
            <Route path={SEARCH.to} element={<ItemsPage />} />
            <Route path="/item/:id" element={<ItemPage />} />
            <Route path={CARBURANT_PATH} element={<CarburantPage />} />
            <Route path="/dashboard" element={<Navigate to={CARBURANT_PATH} replace />} />
            <Route path={JOBS_PATH} element={<JobsPage />} />
            <Route path={`${JOBS_PATH}/:slug`} element={<JobPage />} />
            <Route path={BREEDING_PATH} element={<BreedingPage />} />
            <Route path={`${BREEDING_PATH}/:planId`} element={<PlanPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <Footer shell={CHROME} />
      </div>
    </CatalogContext.Provider>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>{children}</div>
    </div>
  )
}
