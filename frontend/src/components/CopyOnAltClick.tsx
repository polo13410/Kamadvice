/**
 * Alt+clic sur un item, n'importe où dans l'app, copie son nom.
 *
 * Un seul écouteur pour toute l'app, et un attribut `data-item-name` sur les
 * éléments qui portent un item : c'est moins fragile qu'un gestionnaire par
 * composant, et un nouvel endroit qui affiche un item rejoint le raccourci en
 * posant l'attribut, sans rien brancher.
 *
 * Le navigateur donne son propre sens à Alt+clic sur un lien — télécharger la
 * cible. L'écouteur est posé en phase de capture sur `document`, donc avant le
 * routeur et avant ce comportement : `preventDefault` coupe le téléchargement,
 * `stopPropagation` coupe la navigation. Un clic sans Alt n'est jamais touché.
 *
 * Le retour visuel est un toast en bas de l'écran : sans lui, on ne sait pas
 * si le presse-papiers a accepté, et on colle dans le vide.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { copyText } from '../lib/clipboard'
import { Icon } from '../lib/icons'

/** Le temps que le toast reste lisible. */
const TOAST_MS = 1800

type Toast = { kind: 'done' | 'failed'; name: string; at: number }

export default function CopyOnAltClick() {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!event.altKey || event.button !== 0) return
      const target = event.target as Element | null
      const holder = target?.closest<HTMLElement>('[data-item-name]')
      const name = holder?.dataset.itemName
      if (!name) return

      event.preventDefault()
      event.stopPropagation()

      // La copie doit partir dans le même geste : on n'attend pas React.
      void copyText(name).then((copied) => {
        window.clearTimeout(timer.current)
        setToast({ kind: copied ? 'done' : 'failed', name, at: Date.now() })
        timer.current = window.setTimeout(() => setToast(null), TOAST_MS)
      })
    }
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.clearTimeout(timer.current)
    }
  }, [])

  if (!toast) return null

  const done = toast.kind === 'done'
  return createPortal(
    <div
      // `at` dans la clé : un second Alt+clic pendant l'affichage relance
      // l'animation, sinon rien ne dirait que la copie a bien eu lieu à nouveau.
      key={toast.at}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <span
        className={`flex max-w-full items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg shadow-black/50 ${
          done
            ? 'border-emerald-500/40 bg-slate-900 text-emerald-300'
            : 'border-red-500/40 bg-slate-900 text-red-300'
        }`}
      >
        {done ? (
          <Icon.copied className="size-4 shrink-0" aria-hidden />
        ) : (
          <Icon.warning className="size-4 shrink-0" aria-hidden />
        )}
        <span className="truncate">
          {done ? 'Nom copié : ' : 'Copie refusée par le navigateur : '}
          <strong className="font-medium">{toast.name}</strong>
        </span>
      </span>
    </div>,
    document.body,
  )
}
