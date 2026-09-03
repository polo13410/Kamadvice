/**
 * Montants en kamas, suivis de la pièce.
 *
 * Passer par ce composant plutôt que d'appeler `formatKamas` directement
 * garantit qu'un montant se reconnaît partout à sa pièce, sans avoir à écrire
 * « kamas » dans chaque cellule — et distingue d'un coup d'œil un prix d'un
 * simple compte (un nombre d'extraits, un niveau, des points de jauge).
 *
 * L'image est servie depuis `public/`, comme les données du catalogue.
 */
import { formatKamas } from '../lib/format'

const KAMA_SRC = `${import.meta.env.BASE_URL}data/Kama.webp`

/**
 * La pièce seule, pour les endroits où le montant n'est pas du texte : à côté
 * d'un champ de saisie, par exemple, où elle se pose après l'input.
 */
export function KamaIcon({ className = 'size-3' }: { className?: string }) {
  return (
    <img
      src={KAMA_SRC}
      alt=""
      aria-hidden
      // Dimensions natives : sans elles, la ligne sursaute au chargement.
      width={717}
      height={723}
      decoding="async"
      className={`${className} shrink-0 select-none`}
    />
  )
}

export default function Kamas({
  value,
  signed = false,
  className = '',
}: {
  value: number | null | undefined
  /** Précède les gains d'un `+`. Pour les marges et les écarts. */
  signed?: boolean
  className?: string
}) {
  // Un tiret n'est pas un montant : la pièce n'aurait rien à qualifier.
  if (value === null || value === undefined) {
    return <span className={`tabular-nums text-slate-600 ${className}`}>—</span>
  }

  return (
    <span className={`inline-flex items-center gap-1 tabular-nums ${className}`}>
      {signed && value > 0 ? '+' : ''}
      {formatKamas(value)}
      <KamaIcon />
    </span>
  )
}
