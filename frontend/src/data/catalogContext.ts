import { createContext, useContext } from 'react'
import type { Catalog } from '../domain/types'

export const CatalogContext = createContext<Catalog | null>(null)

/** Le catalogue n'est fourni qu'une fois chargé : il est donc toujours défini ici. */
export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('useCatalog doit être utilisé sous <CatalogContext.Provider>')
  return catalog
}
