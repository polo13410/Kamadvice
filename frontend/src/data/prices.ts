/**
 * Prix HDV relevés par les contributeurs, partagés via Supabase.
 *
 * Chaque item garde un journal de ses relevés, du plus récent au plus ancien.
 * Le prix courant est simplement le premier du journal : une seule source de
 * vérité, pas de champ « prix actuel » à tenir synchronisé avec l'historique.
 * Côté base, c'est la même chose — une table en ajout seul, et une vue qui n'en
 * garde que le relevé le plus récent par item (voir `supabase/schema.sql`).
 *
 * Deux stores plutôt qu'un, parce que les deux besoins n'ont pas la même
 * volumétrie : les prix *courants* se chargent d'un bloc au démarrage (une ligne
 * par item, borné par le catalogue), les *journaux* complets se chargent à la
 * demande, uniquement sur la fiche d'un item.
 *
 * Les écritures sont optimistes : le relevé est posé localement puis envoyé en
 * tâche de fond, ce qui laisse `setPrice` synchrone et l'interface immédiate.
 * Un envoi qui échoue part dans un outbox rejoué au retour du réseau.
 *
 * Les relevés des autres arrivent en direct, par le canal Realtime. Le
 * rechargement au retour sur l'onglet reste là comme filet : une connexion
 * coupée laisse passer des événements, et personne ne s'en aperçoit.
 *
 * Sans projet Supabase configuré, tout continue de fonctionner dans le
 * navigateur seul : `localStorage` redevient l'unique dépôt des journaux.
 *
 * Tout ce qui est ici parle d'un seul serveur de jeu, le courant (voir
 * `servers.ts`). En changer vide la mémoire et repart du cache de l'autre ;
 * `App` relance alors le chargement et le canal temps réel.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { ItemId, PriceMap } from '../domain/types'
import {
  COLUMNS,
  CURRENT,
  ON_CONFLICT,
  POINTS,
  REMOTE_ENABLED,
  supabase,
  type RemotePricePoint,
} from './supabase'
import { currentServer, scopedKey, subscribeServer, type GameServer } from './servers'
import { LOCAL_LOG_KEY, UNDATED, isMigrated, readLocalLogs } from './priceMigration'

export interface PricePoint {
  /** Identifiant de la ligne distante. `null` tant que le relevé n'est pas synchronisé. */
  id: number | null
  price: number
  /** ISO 8601. `null` pour un prix repris d'une version du stockage sans date. */
  at: string | null
}

/**
 * Prix courants gardés sous la main : la page s'affiche avant la réponse réseau.
 * Une clé par serveur (`scopedKey`), pour que le retour sur un serveur ne
 * montre pas les prix de l'autre en attendant le réseau.
 */
const CACHE_KEY = 'kamadvice.prices.cache.v3'
/** Relevés dont l'envoi a échoué, à rejouer. */
const OUTBOX_KEY = 'kamadvice.outbox.v1'

/** Relevés conservés par item. Au-delà, les plus anciens sont oubliés. */
const MAX_POINTS = 50

/** Au-delà, un envoi en attente est trop vieux pour valoir la place qu'il prend. */
const MAX_OUTBOX = 500

const EMPTY: readonly PricePoint[] = []

/** Au-delà, un relevé est trop vieux pour qu'on s'y fie sans le revérifier. */
const STALE_AFTER_MS = 7 * 86_400_000

/** Deux rafraîchissements rapprochés ne diraient pas grand-chose de plus. */
const REFRESH_EVERY_MS = 30_000

/**
 * Fraîcheur d'un relevé, du plus sûr au moins sûr. Les paliers suivent le
 * rythme auquel un prix HDV bouge : dans l'heure il vaut encore, dans la
 * journée il se discute, au-delà d'une semaine il ne veut plus rien dire.
 */
export type Freshness = 'fresh' | 'recent' | 'aging' | 'stale'

const FRESHNESS_STEPS: [Freshness, number][] = [
  ['stale', STALE_AFTER_MS],
  ['aging', 86_400_000],
  ['recent', 3_600_000],
]

/**
 * Un relevé sans date (repris de l'ancien format) compte comme périmé : ne rien
 * savoir de sa fraîcheur n'est pas une raison de s'y fier.
 */
export function freshness(point: PricePoint | undefined): Freshness | null {
  const elapsed = ageMs(point)
  if (elapsed === null) return null
  for (const [level, since] of FRESHNESS_STEPS) if (elapsed > since) return level
  return 'fresh'
}

/**
 * Âge d'un relevé en millisecondes. Sans relevé, `null` ; sans date lisible,
 * l'infini : ne rien savoir de son âge, c'est le tenir pour le plus vieux.
 */
export function ageMs(point: PricePoint | undefined): number | null {
  if (!point) return null
  if (point.at === null) return Infinity
  const at = new Date(point.at).getTime()
  return Number.isFinite(at) ? Date.now() - at : Infinity
}

/** Relevé dont le prix a eu le temps de bouger sans qu'on le revérifie. */
export const isStale = (point: PricePoint | undefined): boolean =>
  freshness(point) === 'stale'

/** Instant d'un relevé, en millisecondes. Un relevé sans date est le plus ancien. */
const time = (at: string | null): number => {
  if (at === null) return 0
  const parsed = new Date(at).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const toPoint = (row: RemotePricePoint): PricePoint => ({ id: row.id, price: row.price, at: row.at })

/**
 * Trie un journal et en retire les doublons. Deux relevés de même date et de
 * même prix sont le même relevé — c'est aussi ce que dit l'index unique de la
 * base ; on garde alors celui qui porte un identifiant, seul supprimable. Un
 * relevé sans date est comparé sur la date que la migration lui a prêtée, sans
 * quoi il ferait doublon avec sa copie distante.
 */
function dedupe(points: readonly PricePoint[]): PricePoint[] {
  const byKey = new Map<string, PricePoint>()
  for (const point of points) {
    const key = `${point.at ?? UNDATED}:${point.price}`
    const kept = byKey.get(key)
    if (!kept || (kept.id === null && point.id !== null)) byKey.set(key, point)
  }
  return [...byKey.values()].sort((a, b) => time(b.at) - time(a.at)).slice(0, MAX_POINTS)
}

// --- Stockage local -------------------------------------------------------

function readCache(): Map<ItemId, PricePoint> {
  const cached = new Map<ItemId, PricePoint>()
  try {
    const raw = localStorage.getItem(scopedKey(CACHE_KEY))
    if (!raw) return cached

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return cached

    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      const itemId = Number(id)
      const point = value as PricePoint | null
      if (!Number.isInteger(itemId) || typeof point !== 'object' || point === null) continue
      if (typeof point.price !== 'number' || !Number.isFinite(point.price) || point.price < 0) continue
      if (typeof point.at !== 'string' && point.at !== null) continue
      cached.set(itemId, {
        id: typeof point.id === 'number' ? point.id : null,
        price: point.price,
        at: point.at,
      })
    }
  } catch {
    // localStorage indisponible ou contenu corrompu : le chargement distant
    // reconstruira le cache, l'app démarre en attendant.
  }
  return cached
}

function heads(source: Map<ItemId, PricePoint[]>): Map<ItemId, PricePoint> {
  const map = new Map<ItemId, PricePoint>()
  for (const [itemId, points] of source) {
    const latest = points[0]
    if (latest) map.set(itemId, latest)
  }
  return map
}

const toPrices = (source: Map<ItemId, PricePoint>): Map<ItemId, number> => {
  const map = new Map<ItemId, number>()
  for (const [itemId, point] of source) map.set(itemId, point.price)
  return map
}

/** Ce que le navigateur sait du serveur courant, avant toute réponse réseau. */
function initialState() {
  // Une fois les prix locaux remontés, le serveur fait foi : ressemer le journal
  // local ferait apparaître chaque relevé deux fois, la copie locale n'ayant pas
  // l'identifiant de sa jumelle distante.
  const seed =
    REMOTE_ENABLED && isMigrated() ? new Map<ItemId, PricePoint[]>() : readLocalLogs(currentServer())
  const cache = readCache()
  return { logs: seed, current: cache.size > 0 ? cache : heads(seed) }
}

const initial = initialState()
let logs = initial.logs
let current = initial.current
let prices = toPrices(current)

/**
 * Vrai tant que le serveur n'a pas changé depuis qu'on a noté `server`. Chaque
 * appel réseau le vérifie au retour : une réponse partie pour l'ancien serveur
 * ne doit pas s'inscrire dans la mémoire du nouveau.
 */
const stillOn = (server: GameServer): boolean => currentServer() === server

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

function setCurrent(next: Map<ItemId, PricePoint>) {
  current = next
  prices = toPrices(next)
  try {
    localStorage.setItem(scopedKey(CACHE_KEY), JSON.stringify(Object.fromEntries(next)))
  } catch {
    // Quota atteint ou stockage bloqué : la session en cours reste utilisable,
    // seule la persistance est perdue.
  }
}

function setLogs(next: Map<ItemId, PricePoint[]>) {
  logs = next
  // En mode distant, les journaux vivent côté base : les réécrire ici ferait
  // grossir le stockage à chaque fiche consultée, pour rien. Sans Supabase en
  // revanche, cette clé est leur seul dépôt.
  if (REMOTE_ENABLED) return
  try {
    localStorage.setItem(scopedKey(LOCAL_LOG_KEY), JSON.stringify(Object.fromEntries(next)))
  } catch {
    // Idem : on perd la persistance, pas la session.
  }
}

// --- Chargement distant ---------------------------------------------------

let lastLoad = 0

/**
 * Charge les prix courants de tous les items. Le résultat est fusionné plutôt
 * qu'appliqué tel quel : un relevé saisi ici et pas encore parti ne doit pas
 * être écrasé par une réponse antérieure.
 */
export async function loadPrices(signal?: AbortSignal): Promise<void> {
  if (!supabase) return
  const server = currentServer()
  lastLoad = Date.now()

  const query = supabase.from(CURRENT).select(COLUMNS).eq('server', server.id)
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) throw new Error(error.message)
  if (signal?.aborted || !stillOn(server)) return

  const next = new Map(current)
  for (const row of (data ?? []) as RemotePricePoint[]) {
    const local = next.get(row.item_id)
    // À égalité, la version distante gagne : c'est celle qui porte un identifiant.
    if (!local || time(local.at) <= time(row.at)) next.set(row.item_id, toPoint(row))
  }
  setCurrent(next)
  notify()
}

/** Recharge les prix, sauf si on vient de le faire. */
export function refreshPrices() {
  if (!REMOTE_ENABLED || Date.now() - lastLoad < REFRESH_EVERY_MS) return
  loadPrices().catch(() => {
    // Rafraîchissement d'arrière-plan : les prix en place restent affichés.
  })
}

const loading = new Set<ItemId>()
// Distinct de `logs.has()` : un journal peut être présent sans venir du serveur
// — celui repris du stockage local, avant que les prix aient été remontés.
const loaded = new Set<ItemId>()

// Changement de serveur : tout ce qui est en mémoire parlait de l'autre. On
// repart de ce que le navigateur garde pour celui-ci ; `App` relance ensuite
// le chargement et rouvre le canal. Les appels en vol se découvrent périmés
// par `stillOn` à leur retour.
subscribeServer(() => {
  const next = initialState()
  logs = next.logs
  current = next.current
  prices = toPrices(current)
  loaded.clear()
  loading.clear()
  lastLoad = 0
  notify()
})

/** Assemble le journal distant et les relevés locaux pas encore synchronisés. */
function mergeLog(itemId: ItemId, rows: RemotePricePoint[]): PricePoint[] {
  const known = logs.get(itemId) ?? EMPTY
  const head = current.get(itemId)
  const pending = [...known, ...(head ? [head] : [])].filter((point) => point.id === null)
  return dedupe([...rows.map(toPoint), ...pending])
}

/**
 * Charge le journal complet d'un item, une seule fois. Déclenché par
 * `usePriceLog`, donc seulement là où l'historique est vraiment affiché — pas
 * sur les centaines de champs de prix des listes.
 */
function ensureLog(itemId: ItemId) {
  if (!supabase || loaded.has(itemId) || loading.has(itemId)) return
  loading.add(itemId)
  void fetchLog(itemId)
    // Journal indisponible : la fiche reste lisible avec le prix courant.
    .catch(() => {})
    .finally(() => loading.delete(itemId))
}

async function fetchLog(itemId: ItemId) {
  if (!supabase) return
  const server = currentServer()

  const { data, error } = await supabase
    .from(POINTS)
    .select(COLUMNS)
    .eq('server', server.id)
    .eq('item_id', itemId)
    .order('at', { ascending: false })
    .limit(MAX_POINTS)
  if (error || !stillOn(server)) return

  const merged = mergeLog(itemId, (data ?? []) as RemotePricePoint[])
  const next = new Map(logs)
  next.set(itemId, merged)
  setLogs(next)
  loaded.add(itemId)

  // Le journal fait autorité sur le prix courant, et il apporte à celui-ci
  // l'identifiant que le cache local n'avait pas.
  const head = merged[0]
  if (head && time(head.at) >= time(current.get(itemId)?.at ?? null)) {
    const nextCurrent = new Map(current)
    nextCurrent.set(itemId, head)
    setCurrent(nextCurrent)
  }
  notify()
}

/**
 * Redemande le prix courant d'un seul item. Utile quand un relevé supprimé
 * ailleurs était celui qu'on affichait, sans que le journal soit chargé : c'est
 * la base qui sait quel relevé prend sa place.
 */
function reloadCurrent(itemId: ItemId) {
  // Le prochain rafraîchissement remettrait les choses d'aplomb de toute façon.
  void fetchCurrent(itemId).catch(() => {})
}

async function fetchCurrent(itemId: ItemId) {
  if (!supabase) return
  const server = currentServer()

  const { data, error } = await supabase
    .from(CURRENT)
    .select(COLUMNS)
    .eq('server', server.id)
    .eq('item_id', itemId)
    .maybeSingle()
  if (error || !stillOn(server)) return

  const next = new Map(current)
  if (data) next.set(itemId, toPoint(data as RemotePricePoint))
  else next.delete(itemId)
  setCurrent(next)
  notify()
}

// --- Temps réel -----------------------------------------------------------

/** Range un relevé arrivé du canal Realtime, qu'il vienne d'ici ou d'ailleurs. */
function applyRemoteInsert(row: RemotePricePoint) {
  const point = toPoint(row)
  let changed = false

  const known = logs.get(row.item_id)
  if (known && !known.some((candidate) => candidate.id === row.id)) {
    const next = new Map(logs)
    // `dedupe` absorbe au passage le jumeau optimiste de notre propre saisie,
    // qui n'a pas encore reçu son identifiant.
    next.set(row.item_id, dedupe([point, ...known]))
    setLogs(next)
    changed = true
  }

  const head = current.get(row.item_id)
  if (!head || time(head.at) <= time(row.at)) {
    const next = new Map(current)
    next.set(row.item_id, point)
    setCurrent(next)
    changed = true
  }

  if (changed) notify()
}

/**
 * Retire un relevé supprimé ailleurs. La table est en `replica identity full`,
 * donc l'événement porte la ligne entière et pas seulement sa clé — sans quoi
 * on ne saurait pas de quel item il s'agit.
 */
function applyRemoteDelete(row: RemotePricePoint) {
  const known = logs.get(row.item_id)
  const inLog = known?.some((candidate) => candidate.id === row.id) ?? false
  let changed = false

  if (known && inLog) {
    const remaining = known.filter((candidate) => candidate.id !== row.id)
    const next = new Map(logs)
    if (remaining.length === 0) next.delete(row.item_id)
    else next.set(row.item_id, remaining)
    setLogs(next)
    changed = true
  }

  if (current.get(row.item_id)?.id === row.id) {
    const head = logs.get(row.item_id)?.[0]
    if (head) {
      const next = new Map(current)
      next.set(row.item_id, head)
      setCurrent(next)
      changed = true
    } else {
      // Journal non chargé : c'est la base qui sait quel relevé remonte.
      reloadCurrent(row.item_id)
    }
  }

  if (changed) notify()
}

let channel: RealtimeChannel | null = null

/**
 * Ouvre le canal des relevés du serveur courant. Un seul canal pour toute
 * l'application ; la fonction rendue le referme, et `App` le rouvre au
 * changement de serveur. Les événements sont filtrés côté serveur sur le
 * serveur de jeu, pour ne pas réveiller l'onglet à chaque saisie qui ne le
 * concerne pas.
 *
 * Le nom du canal porte le serveur : le SDK rend le canal existant quand on
 * redemande le même nom, et la fermeture de l'ancien est asynchrone — un nom
 * partagé ferait hériter le nouveau canal des filtres de l'ancien.
 */
export function watchPrices(): () => void {
  if (!supabase || channel) return () => {}
  const db = supabase
  const server = currentServer()
  const filter = `server=eq.${server.id}`

  const live = db
    .channel(`prices:${server.id}`)
    .on<RemotePricePoint>(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: POINTS, filter },
      (payload) => {
        if (stillOn(server)) applyRemoteInsert(payload.new)
      },
    )
    .on<RemotePricePoint>(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: POINTS, filter },
      (payload) => {
        if (stillOn(server)) applyRemoteDelete(payload.old as RemotePricePoint)
      },
    )
    .subscribe((status) => {
      // Une coupure a pu laisser passer des relevés sans que personne le voie :
      // chaque (re)connexion resynchronise les prix courants.
      if (status === 'SUBSCRIBED') refreshPrices()
    })

  channel = live
  return () => {
    channel = null
    void db.removeChannel(live)
  }
}

// --- Envoi ----------------------------------------------------------------

interface OutboxRow {
  server: string
  item_id: number
  price: number
  at: string
}

function readOutbox(): OutboxRow[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? (parsed as OutboxRow[]) : []
  } catch {
    return []
  }
}

let outbox = readOutbox()

function writeOutbox() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox))
  } catch {
    // Le relevé reste en mémoire pour cette session.
  }
}

const enqueue = (row: OutboxRow) => {
  outbox = [...outbox, row].slice(-MAX_OUTBOX)
  writeOutbox()
}

/**
 * Rejoue les relevés dont l'envoi avait échoué. Le lot repart en bloc et
 * retourne dans l'outbox s'il échoue encore : un prix saisi hors ligne n'est
 * pas perdu, il attend. Sa date reste celle du relevé, pas celle de l'envoi.
 */
export async function flushOutbox(): Promise<void> {
  if (!supabase || outbox.length === 0) return

  const pending = outbox
  outbox = []
  writeOutbox()

  const { error } = await supabase
    .from(POINTS)
    .upsert(pending, { onConflict: ON_CONFLICT, ignoreDuplicates: true })

  if (error) {
    outbox = [...pending, ...outbox].slice(-MAX_OUTBOX)
    writeOutbox()
  }
}

/** Remplace un relevé optimiste par sa version enregistrée, identifiant compris. */
function adopt(itemId: ItemId, point: PricePoint, id: number) {
  const synced: PricePoint = { ...point, id }
  let changed = false

  if (current.get(itemId) === point) {
    const next = new Map(current)
    next.set(itemId, synced)
    setCurrent(next)
    changed = true
  }

  const known = logs.get(itemId)
  if (known?.includes(point)) {
    const next = new Map(logs)
    next.set(
      itemId,
      known.map((candidate) => (candidate === point ? synced : candidate)),
    )
    setLogs(next)
    changed = true
  }

  if (changed) notify()
}

async function push(itemId: ItemId, point: PricePoint) {
  if (!supabase || point.at === null) return
  // Le serveur est figé dans la ligne : un relevé saisi puis rejoué depuis
  // l'outbox après un changement de serveur reste celui du serveur où il a
  // été relevé.
  const row: OutboxRow = {
    server: currentServer().id,
    item_id: itemId,
    price: point.price,
    at: point.at,
  }

  const { data, error } = await supabase.from(POINTS).insert(row).select(COLUMNS).maybeSingle()

  if (error) enqueue(row)
  else if (data) adopt(itemId, point, (data as RemotePricePoint).id)
}

// --- Mutations ------------------------------------------------------------

/**
 * Enregistre un relevé de prix. Ressaisir le prix déjà en place ne crée pas de
 * relevé : ça ne dit rien de nouveau sur le marché et ça polluerait l'historique.
 *
 * Sauf à `confirm` : quand on vient de vérifier le prix à l'HDV, le retrouver
 * inchangé est bien une information, et elle mérite sa date. C'est le cas du
 * remplissage assisté, pas d'un champ de tableau qu'on quitte sans l'avoir touché.
 */
export function setPrice(itemId: ItemId, price: number, { confirm = false } = {}) {
  if (!confirm && current.get(itemId)?.price === price) return

  const point: PricePoint = { id: null, price, at: new Date().toISOString() }

  const nextCurrent = new Map(current)
  nextCurrent.set(itemId, point)
  setCurrent(nextCurrent)

  // Sans Supabase, le journal local est la seule mémoire de l'historique : il
  // faut donc l'ouvrir même pour un item qui n'en avait pas. En mode distant au
  // contraire, un journal créé ici passerait pour chargé et empêcherait
  // `ensureLog` d'aller chercher les relevés des autres.
  const known = logs.get(itemId) ?? (REMOTE_ENABLED ? undefined : EMPTY)
  if (known) {
    const nextLogs = new Map(logs)
    nextLogs.set(itemId, [point, ...known].slice(0, MAX_POINTS))
    setLogs(nextLogs)
  }
  notify()

  void push(itemId, point)
}

/**
 * Supprime un relevé, désigné par son rang dans le journal. Retirer le relevé
 * courant fait remonter le précédent ; retirer le dernier laisse l'item sans
 * prix. C'est la seule façon d'effacer un prix : un champ vidé par mégarde ne
 * doit pas détruire d'historique.
 *
 * Plus appelée depuis l'interface : le tableau qui la portait
 * (`PriceHistoryTable`) est mis de côté jusqu'aux droits administrateur.
 */
export function removePricePoint(itemId: ItemId, index: number) {
  const known = logs.get(itemId)
  const point = known?.[index]
  if (!known || !point) return

  const remaining = known.filter((_, rank) => rank !== index)
  const nextLogs = new Map(logs)
  if (remaining.length === 0) nextLogs.delete(itemId)
  else nextLogs.set(itemId, remaining)
  setLogs(nextLogs)

  if (index === 0) {
    const nextCurrent = new Map(current)
    const head = remaining[0]
    if (head) nextCurrent.set(itemId, head)
    else nextCurrent.delete(itemId)
    setCurrent(nextCurrent)
  }
  notify()

  if (supabase && point.id !== null) {
    void supabase
      .from(POINTS)
      .delete()
      .eq('id', point.id)
      .then(undefined, () => {
        // Le relevé réapparaîtra au prochain chargement du journal : mieux vaut
        // ça qu'une suppression qu'on croit acquise.
      })
  }
}

// --- Lecture --------------------------------------------------------------

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Prix courants, dans la forme attendue par le moteur de craft. */
export function usePrices(): PriceMap {
  return useSyncExternalStore(
    subscribe,
    () => prices,
    () => prices,
  )
}

/**
 * Tous les derniers relevés, prix *et* dates. Réservé à ce qui raisonne sur la
 * fraîcheur de l'ensemble : le moteur de craft, lui, se contente de `usePrices`.
 */
export function useCurrentPrices(): ReadonlyMap<ItemId, PricePoint> {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  )
}

/** Dernier relevé d'un item : le prix et sa date, sans charger tout l'historique. */
export function useCurrentPrice(itemId: ItemId): PricePoint | undefined {
  return useSyncExternalStore(
    subscribe,
    () => current.get(itemId),
    () => current.get(itemId),
  )
}

/** Relevés d'un item, du plus récent au plus ancien. Chargés à la demande. */
export function usePriceLog(itemId: ItemId): readonly PricePoint[] {
  useEffect(() => ensureLog(itemId), [itemId])
  return useSyncExternalStore(
    subscribe,
    () => logs.get(itemId) ?? EMPTY,
    () => logs.get(itemId) ?? EMPTY,
  )
}
