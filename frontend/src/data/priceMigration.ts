/**
 * Reprise des prix saisis avant le passage au stockage partagé.
 *
 * Les relevés accumulés dans `localStorage` sont de vraies données de marché :
 * ils sont remontés une fois vers Supabase, puis le serveur fait foi. Les clés
 * locales ne sont jamais effacées — elles restent le filet de sécurité si la
 * remontée s'est mal passée.
 */
import { ON_CONFLICT, POINTS, supabase } from './supabase'
import { DEFAULT_SERVER, scopedKey, type GameServer } from './servers'
import type { PricePoint } from './prices'
import type { ItemId } from '../domain/types'

/** Journal local, écrit tel quel tant qu'aucun projet Supabase n'est configuré. */
export const LOCAL_LOG_KEY = 'kamadvice.prices.v2'
/** Tout premier format : un simple nombre par item, sans date de relevé. */
const LEGACY_KEY = 'kamadvice.prices.v1'
const MIGRATED_KEY = 'kamadvice.migrated.v3'

/**
 * Date prêtée aux relevés du premier format, qui n'en avaient pas. La colonne
 * distante est obligatoire, et une date très ancienne les fait ressortir
 * périmés — c'est déjà ce que `isStale` en dit localement. Inventer une date
 * récente leur donnerait une fausse fraîcheur.
 */
export const UNDATED = '2000-01-01T00:00:00.000Z'

/** Au-delà, PostgREST commence à peiner sur un seul appel. */
const BATCH = 500

const isValidPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

export function parsePoints(value: unknown): PricePoint[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (point): point is { id?: unknown; price: number; at: string | null } =>
        typeof point === 'object' &&
        point !== null &&
        isValidPrice((point as PricePoint).price) &&
        (typeof (point as PricePoint).at === 'string' || (point as PricePoint).at === null),
    )
    .map((point) => ({
      id: typeof point.id === 'number' ? point.id : null,
      price: point.price,
      at: point.at,
    }))
}

function readV1(): Map<ItemId, PricePoint[]> {
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return new Map()
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return new Map()

  const log = new Map<ItemId, PricePoint[]>()
  for (const [id, price] of Object.entries(parsed as Record<string, unknown>)) {
    const itemId = Number(id)
    if (Number.isInteger(itemId) && isValidPrice(price)) log.set(itemId, [{ id: null, price, at: null }])
  }
  return log
}

/**
 * Journaux conservés dans ce navigateur pour un serveur, du plus récent au plus
 * ancien. Les formats d'avant le multi-serveur n'appartiennent qu'au serveur
 * par défaut : c'est là qu'ils ont été relevés.
 */
export function readLocalLogs(server: GameServer = DEFAULT_SERVER): Map<ItemId, PricePoint[]> {
  try {
    const raw = localStorage.getItem(scopedKey(LOCAL_LOG_KEY, server))
    if (!raw) return server === DEFAULT_SERVER ? readV1() : new Map()

    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return new Map()

    const log = new Map<ItemId, PricePoint[]>()
    for (const [id, points] of Object.entries(parsed as Record<string, unknown>)) {
      const itemId = Number(id)
      const parsedPoints = parsePoints(points)
      if (Number.isInteger(itemId) && parsedPoints.length > 0) log.set(itemId, parsedPoints)
    }
    return log
  } catch {
    // localStorage indisponible (navigation privée) ou contenu corrompu : on
    // repart sur des prix vides plutôt que d'empêcher l'app de démarrer.
    return new Map()
  }
}

/** Vrai si les prix de ce navigateur ont déjà été remontés vers Supabase. */
export function isMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) !== null
  } catch {
    return false
  }
}

/**
 * Remonte une fois les relevés locaux vers Supabase. L'opération est rejouable :
 * l'index unique côté base, combiné à `resolution=ignore-duplicates`, absorbe un
 * second passage comme le cas « le même utilisateur migre depuis deux machines ».
 */
export async function migrateLocalPrices(): Promise<void> {
  if (!supabase || isMigrated()) return

  // Ces relevés datent d'avant le choix du serveur : ils sont ceux du serveur
  // par défaut, quel que soit celui réglé aujourd'hui.
  const rows = [...readLocalLogs(DEFAULT_SERVER)].flatMap(([itemId, points]) =>
    points.map((point) => ({
      server: DEFAULT_SERVER.id,
      item_id: itemId,
      price: point.price,
      at: point.at ?? UNDATED,
    })),
  )

  for (let start = 0; start < rows.length; start += BATCH) {
    const { error } = await supabase
      .from(POINTS)
      .upsert(rows.slice(start, start + BATCH), { onConflict: ON_CONFLICT, ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }

  try {
    localStorage.setItem(MIGRATED_KEY, new Date().toISOString())
  } catch {
    // Sans le drapeau, la remontée sera rejouée au prochain démarrage : sans
    // conséquence, les doublons étant écartés côté base.
  }
}
