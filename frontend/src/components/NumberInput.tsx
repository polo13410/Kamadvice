/**
 * Un champ numérique dont la valeur ne remonte qu'après un temps de silence
 * — ou sur Entrée, ou en sortant du champ. Pour les réglages qui font
 * recalculer tout un plan : « 39 » se tape en deux frappes, on ne recalcule
 * pas à « 3 ».
 *
 * Deux écritures : `plain` pour un niveau (« 39 »), `grouped` pour des
 * points ou des kamas (« 20 000 », l'espace compris). Une frappe hors bornes
 * ou vide reste un brouillon : rien ne remonte tant que la valeur n'est pas
 * valable, et le champ reprend la valeur courante en sortant.
 */
import { useDeferred } from './FilterBar'
import { FIELD_NUMBER, FIELD_TABLE } from './Adorned'

const GROUPED = new Intl.NumberFormat('fr-FR')

export default function NumberInput({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  format = 'plain',
  size = 'bar',
  className = '',
  ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  format?: 'plain' | 'grouped'
  /** La hauteur d'une barre de réglages, ou celle d'une cellule de tableau. */
  size?: 'bar' | 'table'
  className?: string
  ariaLabel?: string
}) {
  const show = (n: number) => (format === 'grouped' ? GROUPED.format(n) : String(n))
  const parse = (raw: string): number | null => {
    const digits = raw.replace(/\D/g, '')
    if (digits === '') return null
    const n = Number(digits)
    return Number.isInteger(n) && n >= min && n <= max ? n : null
  }
  // Le brouillon est le texte tapé ; ce qui remonte est le nombre qu'il vaut.
  const { draft, edit, commit } = useDeferred<string>(
    show(value),
    (text) => {
      const n = parse(text)
      if (n !== null && n !== value) onChange(n)
    },
    (a, b) => parse(a) === parse(b),
  )
  const leave = () => {
    commit(draft)
    // Un brouillon invalide ne remonte pas : le champ reprend la valeur courante.
    if (parse(draft) === null) edit(show(value))
  }

  return (
    <input
      inputMode="numeric"
      value={draft}
      aria-label={ariaLabel}
      onChange={(event) => edit(event.target.value)}
      onBlur={leave}
      onKeyDown={(event) => {
        if (event.key === 'Enter') leave()
      }}
      className={`${size === 'bar' ? FIELD_NUMBER : FIELD_TABLE} ${className}`}
    />
  )
}
