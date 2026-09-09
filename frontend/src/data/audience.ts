/**
 * Fréquentation : qui est là en ce moment, et combien de navigateurs sont
 * passés depuis le lancement.
 *
 * Deux chiffres, deux mécaniques :
 *
 * - « en ligne » vient de la Presence du canal Realtime. Chaque onglet s'y
 *   déclare, le serveur diffuse la liste à tous, et un onglet fermé en
 *   disparaît de lui-même. Rien n'est écrit nulle part. Le canal est ouvert
 *   une fois pour la vie de la page : il porte un nom fixe, celui que tous
 *   les clients partagent, et le SDK rendrait le même objet si on le
 *   redemandait — le fermer pour le rouvrir se bat avec sa propre fermeture.
 * - « visiteurs » vient d'une table en ajout seul : un identifiant aléatoire
 *   par navigateur, inséré une fois. Le compte est rendu par une fonction SQL,
 *   pour ne pas ouvrir la table en lecture (voir `supabase/schema.sql`).
 *
 * Ce sont des comptes de navigateurs, pas de personnes : navigation privée,
 * stockage effacé ou second appareil comptent chacun pour un. L'identifiant
 * est un UUID tiré au hasard, sans lien avec rien — pas une donnée
 * personnelle. Sans projet Supabase, les deux restent inconnus (`null`) et le
 * pied de page ne les montre pas.
 */
import { useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { currentServer, subscribeServer } from './servers'
import { supabase } from './supabase'

const VISITOR_KEY = 'kamadvice.visitor.v1'
const VISITORS = 'visitors'
const COUNT_FN = 'visitor_count'
/** Un seul nom pour tous les clients : la Presence se partage par canal. */
const CHANNEL = 'presence:app'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `crypto.randomUUID` n'existe qu'en contexte sécurisé ; en HTTP sur le réseau
 * local, on fabrique le même format à partir de `getRandomValues`, la colonne
 * distante étant un vrai `uuid`.
 */
function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Identifiant de ce navigateur, créé à la première visite et gardé ensuite. */
function readVisitorId(): string {
  try {
    const known = localStorage.getItem(VISITOR_KEY)
    if (known && UUID.test(known)) return known
    const fresh = randomUuid()
    localStorage.setItem(VISITOR_KEY, fresh)
    return fresh
  } catch {
    // Stockage indisponible : ce navigateur comptera pour un à chaque visite.
    return randomUuid()
  }
}

const visitorId = readVisitorId()

let online: number | null = null
let visitors: number | null = null

const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// --- Visiteurs ------------------------------------------------------------

/**
 * Déclare ce navigateur, puis relève le compte. L'insertion ignore les
 * doublons : un navigateur déjà connu ne coûte qu'une requête sans effet.
 * Si l'un des deux appels échoue, la stat reste inconnue plutôt que fausse.
 */
export async function recordVisit(): Promise<void> {
  if (!supabase) return

  const { error } = await supabase
    .from(VISITORS)
    .upsert({ id: visitorId }, { onConflict: 'id', ignoreDuplicates: true })
  if (error) return

  const { data, error: countError } = await supabase.rpc(COUNT_FN)
  const count = Number(data)
  if (countError || !Number.isFinite(count)) return
  visitors = count
  notify()
}

// --- En ligne -------------------------------------------------------------

let channel: RealtimeChannel | null = null
/** Vrai entre `watchPresence` et sa fonction de retour : on veut être compté. */
let tracking = false

/** Ce que les autres voient de nous : de quoi compter par serveur plus tard. */
const payload = () => ({ server: currentServer().id })

function announce() {
  if (channel && tracking) void channel.track(payload())
}

/**
 * Se déclare présent et suit le compte des présents. La fonction rendue retire
 * ce navigateur du compte ; le canal, lui, reste ouvert (voir en tête).
 */
export function watchPresence(): () => void {
  if (!supabase) return () => {}
  tracking = true

  if (channel) {
    announce()
  } else {
    // Une clé par navigateur, pas par onglet : deux onglets ouverts ici ne
    // font qu'une entrée dans l'état de présence.
    const live = supabase.channel(CHANNEL, { config: { presence: { key: visitorId } } })
    live
      .on('presence', { event: 'sync' }, () => {
        online = Object.keys(live.presenceState()).length
        notify()
      })
      .subscribe((status) => {
        // Chaque (re)connexion repart d'un état vide côté serveur : on se
        // redéclare à chaque fois.
        if (status === 'SUBSCRIBED') announce()
      })
    channel = live
  }

  return () => {
    tracking = false
    void channel?.untrack()
  }
}

// Le serveur fait partie de ce qu'on déclare : le changer le redit aux autres.
subscribeServer(announce)

// --- Lecture --------------------------------------------------------------

/** Navigateurs connectés en ce moment. `null` tant qu'on ne sait pas. */
export function useOnlineCount(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => online,
    () => online,
  )
}

/** Navigateurs distincts depuis le lancement. `null` tant qu'on ne sait pas. */
export function useVisitorCount(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => visitors,
    () => visitors,
  )
}
