/**
 * Info-bulles maison, sans dépendance.
 *
 * L'attribut `title` du navigateur attend une seconde avant de s'afficher et ne
 * se laisse pas mettre en forme. Une bulle en CSS ne suffisait pas non plus :
 * les cellules de la liste vivent dans des conteneurs `overflow-hidden` qui la
 * rogneraient. D'où le portail sur `document.body`, positionné en `fixed` à
 * partir de la position réelle de l'élément survolé.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'

/** Écart à l'élément survolé, puis marge minimale au bord de la fenêtre. */
const GAP = 6
const EDGE = 8

interface TriggerProps {
  onPointerEnter?: (event: SyntheticEvent<HTMLElement>) => void
  onPointerLeave?: () => void
  onFocus?: (event: SyntheticEvent<HTMLElement>) => void
  onBlur?: () => void
  'aria-describedby'?: string
}

/**
 * Renvoie les props à étaler sur l'élément déclencheur et la bulle à insérer
 * dans le rendu. Un hook plutôt qu'un composant enveloppe : ni balise en plus
 * dans des `flex` réglés au pixel, ni impossibilité d'habiller un `input`.
 *
 * Une bulle sans contenu (`null`) ne s'arme pas : l'appelant n'a pas à traiter
 * le cas où il n'y a rien à dire.
 */
export function useTooltip(content: string | null | undefined): {
  props: TriggerProps
  tooltip: ReactNode
} {
  const id = useId()
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const bubble = useRef<HTMLDivElement>(null)

  const open = Boolean(content) && anchor !== null

  // Position calculée avant peinture, sur les dimensions réelles de la bulle :
  // elle passe sous l'élément quand le haut de la fenêtre manque, et se recale
  // quand elle dépasserait à droite ou à gauche.
  useLayoutEffect(() => {
    const element = bubble.current
    if (!element || !anchor) return

    const { offsetWidth: width, offsetHeight: height } = element
    const centered = anchor.left + anchor.width / 2 - width / 2
    const left = Math.max(Math.min(centered, window.innerWidth - width - EDGE), EDGE)
    const above = anchor.top - height - GAP >= EDGE

    element.style.left = `${left}px`
    element.style.top = `${above ? anchor.top - height - GAP : anchor.bottom + GAP}px`
    element.style.visibility = 'visible'
  }, [anchor, content])

  // Un défilement (page ou liste virtualisée) déplace l'élément sous la bulle,
  // qui pointerait alors à côté : on la referme plutôt que de la suivre.
  useEffect(() => {
    if (anchor === null) return
    const close = () => setAnchor(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchor])

  const show = (event: SyntheticEvent<HTMLElement>) =>
    setAnchor(event.currentTarget.getBoundingClientRect())
  const hide = () => setAnchor(null)

  return {
    props: content
      ? {
          onPointerEnter: show,
          onPointerLeave: hide,
          onFocus: show,
          onBlur: hide,
          'aria-describedby': open ? id : undefined,
        }
      : {},
    tooltip: open
      ? createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            // `visibility` cachée jusqu'au calcul de position, sinon la bulle
            // apparaîtrait un instant en haut à gauche de la fenêtre.
            style={{ position: 'fixed', left: 0, top: 0, visibility: 'hidden' }}
            className="pointer-events-none z-50 max-w-72 rounded-md border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-xs leading-snug text-slate-200 shadow-lg shadow-black/50"
          >
            {content}
          </div>,
          document.body,
        )
      : null,
  }
}

/**
 * Enveloppe prête à l'emploi, pour les éléments rendus en boucle : un hook ne
 * peut pas être appelé dans un `map`, une instance de composant si. Le
 * `className` remplace celui de l'élément habillé plutôt que de s'y ajouter :
 * la bulle vit dans un portail, le `span` reste donc à sa place dans la grille.
 */
export function Tooltip({
  content,
  className = '',
  children,
}: {
  content: string | null | undefined
  className?: string
  children: ReactNode
}) {
  const tip = useTooltip(content)
  return (
    <span {...tip.props} className={className}>
      {children}
      {tip.tooltip}
    </span>
  )
}
