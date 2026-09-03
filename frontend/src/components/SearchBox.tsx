/**
 * La recherche du header : un champ qui propose, et une page qui liste.
 *
 * C'est une *combobox* au sens de l'APG — un champ dont un panneau propose des
 * valeurs — et non un menu : les flèches parcourent les suggestions, Entrée
 * prend celle qui est active ou, à défaut, emmène la recherche complète sur
 * la page de recherche, qui a les filtres que ce panneau n'aura jamais.
 */
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useCatalog } from '../data/catalogContext'
import { recordQuery, useRecent } from '../data/recent'
import type { Item } from '../domain/types'
import { normalize } from '../lib/format'
import { Icon } from '../lib/icons'
import { rememberFilters } from '../lib/itemFilters'
import { SEARCH } from '../lib/pages'
import ItemIcon from './ItemIcon'

/** Le temps qu'on laisse à la frappe avant de balayer les 17 000 items. */
const DEBOUNCE_MS = 500

/** Au-delà, la liste cesse d'aider : c'est la page de recherche qu'il faut. */
const MAX_SUGGESTIONS = 5

/** Quelques recherches passées suffisent ; le reste, on le retape. */
const MAX_RECENT_QUERIES = 3

type Entry = { kind: 'item'; item: Item } | { kind: 'query'; query: string }

/** La query string que produirait cette recherche sur la page de recherche. */
const toSearch = (query: string) => `?${new URLSearchParams({ q: query })}`

export default function SearchBox({ className = '' }: { className?: string }) {
  const catalog = useCatalog()
  const recent = useRecent()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [query, setQuery] = useState('')
  /** La frappe, une fois retombée : c'est elle qui déclenche le balayage. */
  const [needle, setNeedle] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const panelId = useId()

  // Fermer au changement de route couvre aussi bien le choix d'une suggestion
  // que le bouton Retour du navigateur.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    const trimmed = query.trim()
    // Champ vidé : les récents sont déjà là, rien à attendre.
    if (trimmed === '') {
      setNeedle('')
      return
    }
    const timer = window.setTimeout(() => setNeedle(normalize(trimmed)), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  /**
   * Les noms normalisés une fois pour toutes : le catalogue ne change pas de la
   * session, et refaire 17 000 `normalize` à chaque frappe se sentirait.
   */
  const index = useMemo(
    () => catalog.items.map((item) => ({ item, search: normalize(item.name) })),
    [catalog.items],
  )

  const matches = useMemo(() => {
    if (needle === '') return []
    const found: { item: Item; rank: number }[] = []
    for (const entry of index) {
      if (!entry.search.includes(needle)) continue
      // Le nom exact d'abord — taper « blé » cherche « Blé », pas « Blé de
      // qualité douteuse » —, puis ce qui commence par la frappe, puis le
      // reste ; et dans chaque groupe l'alphabet, seul ordre que l'œil suit.
      const rank = entry.search === needle ? 0 : entry.search.startsWith(needle) ? 1 : 2
      found.push({ item: entry.item, rank })
    }
    found.sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name, 'fr'))
    return found.slice(0, MAX_SUGGESTIONS).map(({ item }) => item)
  }, [index, needle])

  /** Une frappe en cours, dont on attend encore qu'elle retombe. */
  const searching = query.trim() !== ''
  const pending = searching && needle === ''

  /** Champ vide : ce qu'on vient de consulter, puis ce qu'on vient de chercher. */
  const entries = useMemo<Entry[]>(() => {
    // Dès qu'il y a du texte, les récents n'ont plus rien à faire là : ils
    // répondraient à autre chose que ce qui est écrit.
    if (searching) return matches.map((item) => ({ kind: 'item', item }))
    const items = recent.items
      .map((id) => catalog.byId.get(id))
      .filter((item): item is Item => item !== undefined)
      .slice(0, MAX_SUGGESTIONS)
    return [
      ...items.map((item): Entry => ({ kind: 'item', item })),
      ...recent.queries
        .slice(0, MAX_RECENT_QUERIES)
        .map((value): Entry => ({ kind: 'query', query: value })),
    ]
  }, [searching, matches, recent, catalog.byId])

  // Une suggestion active qui n'existe plus après une frappe laisserait Entrée
  // ouvrir n'importe quoi : on repart de la recherche complète.
  useEffect(() => setActive(-1), [entries])

  // En cours de frappe, le panneau reste ouvert même sans suggestion : c'est
  // là qu'il dit qu'il cherche, ou qu'il n'a rien trouvé.
  const visible = open && (entries.length > 0 || searching)

  /** Emmène la recherche complète sur la page qui sait la filtrer. */
  function submit(text: string) {
    const trimmed = text.trim()
    setOpen(false)
    input.current?.blur()
    if (trimmed === '') {
      navigate(SEARCH.to)
      return
    }
    recordQuery(trimmed)
    navigate({ pathname: SEARCH.to, search: toSearch(trimmed) })
  }

  function choose(entry: Entry) {
    if (entry.kind === 'query') {
      setQuery(entry.query)
      submit(entry.query)
      return
    }
    // La fiche propose « Retour à la liste » : elle doit ramener à la recherche
    // en cours, même si on n'est jamais passé par la page qui la mémorise.
    const trimmed = query.trim()
    if (trimmed !== '') {
      recordQuery(trimmed)
      rememberFilters(toSearch(trimmed))
    }
    setOpen(false)
    input.current?.blur()
    navigate(`/item/${entry.item.id}`)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      if (visible) setOpen(false)
      else setQuery('')
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const entry = entries[active]
      if (visible && entry) choose(entry)
      else submit(query)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (!visible) {
      setOpen(true)
      return
    }
    const step = event.key === 'ArrowDown' ? 1 : -1
    // On repasse par « aucune suggestion » entre le bas et le haut de la liste :
    // c'est le seul état d'où Entrée lance la recherche complète.
    setActive((current) => {
      const next = current + step
      if (next >= entries.length) return -1
      if (next < -1) return entries.length - 1
      return next
    })
  }

  return (
    <div
      ref={root}
      className={`relative ${className}`}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <Icon.search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
        aria-hidden
      />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={visible}
        aria-controls={panelId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${panelId}-${active}` : undefined}
        aria-label="Rechercher un item"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Rechercher un item…"
        className="w-full rounded border border-slate-700 bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
      />

      {visible && (
        <div
          id={panelId}
          role="listbox"
          aria-label="Suggestions"
          // `w-full` et rien d'autre : le panneau fait exactement la largeur du
          // champ, y compris quand celui-ci se resserre faute de place.
          className="absolute left-0 top-full z-30 mt-2 w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900 py-1 shadow-lg shadow-black/50"
        >
          {pending && <Hint>Recherche…</Hint>}
          {!pending && searching && entries.length === 0 && (
            <Hint>Aucun item ne correspond.</Hint>
          )}
          {entries.map((entry, position) => (
            <Fragment key={entry.kind === 'item' ? `item-${entry.item.id}` : `query-${entry.query}`}>
              {!searching && (position === 0 || entries[position - 1]?.kind !== entry.kind) && (
                <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-slate-600">
                  {entry.kind === 'item' ? 'Consultés récemment' : 'Recherches récentes'}
                </p>
              )}
              <div
                id={`${panelId}-${position}`}
                role="option"
                aria-selected={position === active}
                // Le pointeur ne doit pas voler le focus au champ : sans ça, le
                // panneau se referme avant que le clic n'atteigne sa cible.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(entry)}
                onPointerMove={() => setActive(position)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                  position === active ? 'bg-slate-800 text-amber-400' : 'text-slate-300'
                }`}
              >
                {entry.kind === 'item' ? (
                  <>
                    <ItemIcon item={entry.item} size={24} />
                    <span className="truncate">{entry.item.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-600">
                      {entry.item.type?.name ?? '—'}
                    </span>
                  </>
                ) : (
                  <>
                    <Icon.search className="size-4 shrink-0 text-slate-600" aria-hidden />
                    <span className="truncate">{entry.query}</span>
                  </>
                )}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/** Ce que le panneau dit quand il n'a pas de suggestion à proposer. */
function Hint({ children }: { children: ReactNode }) {
  return <p className="px-3 py-2 text-sm text-slate-500">{children}</p>
}
