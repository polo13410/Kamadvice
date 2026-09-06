/**
 * Connexion au projet Supabase, l'entrepôt des prix partagés.
 *
 * Le client est `null` quand le projet n'est pas configuré : l'application
 * bascule alors en local seul plutôt que de refuser de démarrer. C'est aussi ce
 * qui fait que chaque appel commence par vérifier le client — TypeScript s'en
 * sert pour interdire une requête qui pourrait partir dans le vide.
 *
 * Les identifiants sont lus à la compilation (`import.meta.env`), donc changer
 * les variables sur Netlify impose un redeploy. La clé publiable se retrouve
 * dans le bundle : c'est voulu, les droits sont tenus par la Row Level Security
 * décrite dans `supabase/schema.sql`.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Table des relevés, et vue qui n'en garde que le plus récent par item. */
export const POINTS = 'price_points'
export const CURRENT = 'current_prices'

/** Colonnes d'un relevé, dans l'ordre où le client les attend. */
export const COLUMNS = 'id,item_id,price,at'

/** Contrainte visée quand un relevé est renvoyé deux fois. */
export const ON_CONFLICT = 'server,item_id,at,price'

/** Une ligne de `price_points`. */
export interface RemotePricePoint {
  id: number
  item_id: number
  price: number
  at: string
}

export const supabase =
  SUPABASE_URL && PUBLISHABLE_KEY
    ? createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
        // Personne ne se connecte : inutile de réserver de la place dans le
        // stockage du navigateur pour une session qui n'existera jamais.
        auth: { persistSession: false, autoRefreshToken: false },
        // Les relevés arrivent au rythme des saisies humaines. Ce plafond
        // protège d'un emballement sans jamais gêner l'usage normal.
        realtime: { params: { eventsPerSecond: 5 } },
      })
    : null

/**
 * Faux si le projet n'est pas configuré. L'application reste alors utilisable,
 * prix conservés dans le navigateur : un clone sans `.env.local` doit démarrer.
 */
export const REMOTE_ENABLED = supabase !== null
