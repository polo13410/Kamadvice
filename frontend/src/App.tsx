import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import NavMenu, { type NavMenuItem } from './components/NavMenu'
import { CatalogContext } from './data/catalogContext'
import { loadCatalog } from './data/catalog'
import type { Catalog } from './domain/types'
import { Icon } from './lib/icons'
import CarburantPage from './pages/CarburantPage'
import ItemsPage from './pages/ItemsPage'
import ItemPage from './pages/ItemPage'

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
    return () => controller.abort()
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
              <Icon.app className="size-5 text-amber-400" aria-hidden />
              Kamadvice
            </Link>
            <nav className="flex items-center gap-1">
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
            <Route path="/" element={<ItemsPage />} />
            <Route path="/item/:id" element={<ItemPage />} />
            <Route path="/dashboard/carburant" element={<CarburantPage />} />
            <Route path="/dashboard" element={<Navigate to="/dashboard/carburant" replace />} />
            <Route path="*" element={<p className="text-slate-400">Page introuvable.</p>} />
          </Routes>
        </main>
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
