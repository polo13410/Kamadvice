/**
 * Serveurs de jeu : la liste, et celui sur lequel on relève les prix.
 *
 * Les prix HDV n'ont rien à voir d'un serveur à l'autre, donc chaque relevé
 * porte son serveur (colonne `server`, voir `supabase/schema.sql`) et l'app ne
 * montre à la fois que les prix d'un seul. Le choix est propre au navigateur,
 * comme les favoris : on joue en général sur un serveur, on le règle une fois.
 *
 * Changer de serveur change *tout* : prix courants, journaux, canal temps réel.
 * C'est `data/prices.ts` qui s'en charge, en s'abonnant ici — ce module ne
 * connaît que le choix, pas ce qui en dépend.
 */
import { useSyncExternalStore } from 'react'

export type ServerKind = 'multi' | 'mono' | 'heroic'

export interface GameServer {
  /**
   * Clé de la colonne `server` en base, et nom du fichier d'emblème dans
   * `public/data/servers/`. Stable pour toujours : la renommer, c'est perdre
   * les relevés qui la portent.
   */
  id: string
  name: string
  kind: ServerKind
}

export const KIND_LABEL: Record<ServerKind, string> = {
  multi: 'Multi-compte',
  mono: 'Mono-compte',
  heroic: 'Héroïque',
}

/**
 * Les serveurs Dofus 3 ouverts, par famille puis par ordre alphabétique. Les
 * serveurs éphémères (Temporis, Speed Rush, tournois) n'ont pas de marché qui
 * mérite d'être suivi : ils n'y sont pas.
 */
export const SERVERS: readonly GameServer[] = [
  { id: 'brial', name: 'Brial', kind: 'multi' },
  { id: 'hellmina', name: 'Hell Mina', kind: 'multi' },
  { id: 'imagiro', name: 'Imagiro', kind: 'multi' },
  { id: 'orukam', name: 'Orukam', kind: 'multi' },
  { id: 'rafal', name: 'Rafal', kind: 'multi' },
  { id: 'salar', name: 'Salar', kind: 'multi' },
  { id: 'talkasha', name: 'Tal Kasha', kind: 'multi' },
  { id: 'tylezia', name: 'Tylezia', kind: 'multi' },
  { id: 'dakal', name: 'Dakal', kind: 'mono' },
  { id: 'draconiros', name: 'Draconiros', kind: 'mono' },
  { id: 'kourial', name: 'Kourial', kind: 'mono' },
  { id: 'mikhal', name: 'Mikhal', kind: 'mono' },
  { id: 'ombre', name: 'Ombre', kind: 'heroic' },
]

/**
 * Le serveur d'avant le multi-serveur : celui des relevés collectés jusqu'ici,
 * et celui d'un navigateur qui n'a encore rien choisi.
 */
export const DEFAULT_SERVER: GameServer = SERVERS.find((server) => server.id === 'imagiro')!

const STORAGE_KEY = 'kamadvice.server.v1'

function read(): GameServer {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return SERVERS.find((server) => server.id === id) ?? DEFAULT_SERVER
  } catch {
    return DEFAULT_SERVER
  }
}

let current = read()
const listeners = new Set<() => void>()

/** Le serveur courant, hors React. Identité stable : deux appels rendent le même objet. */
export const currentServer = (): GameServer => current

/**
 * Clé de `localStorage` propre à un serveur. Le serveur par défaut garde la clé
 * nue : les caches et journaux écrits avant le multi-serveur lui appartiennent,
 * et restent lisibles sans migration.
 */
export function scopedKey(key: string, server: GameServer = current): string {
  return server === DEFAULT_SERVER ? key : `${key}.${server.id}`
}

export function setServer(id: string) {
  const next = SERVERS.find((server) => server.id === id)
  if (!next || next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next.id)
  } catch {
    // Le choix vaut pour la session ; il sera à refaire au prochain démarrage.
  }
  for (const listener of listeners) listener()
}

/** Prévenu à chaque changement, de façon synchrone — avant que React ne redessine. */
export function subscribeServer(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useServer(): GameServer {
  return useSyncExternalStore(subscribeServer, currentServer, currentServer)
}
