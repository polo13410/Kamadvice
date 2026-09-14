/**
 * La question du premier passage : sur quel serveur jouez-vous ?
 *
 * Tous les prix de l'app dépendent du serveur, et le navigateur démarre sur
 * celui par défaut sans le dire : un joueur d'ailleurs relèverait ses prix au
 * mauvais endroit sans s'en apercevoir. D'où cette fenêtre, une seule fois —
 * dès qu'un serveur a été choisi, même celui par défaut, elle ne revient pas.
 *
 * « Plus tard » la referme pour la session seulement : rien n'est choisi,
 * elle reviendra au prochain démarrage. Pas de piège, mais pas d'oubli.
 */
import { useEffect, useId, useState } from 'react'
import {
  DEFAULT_SERVER,
  hasChosenServer,
  KIND_LABEL,
  SERVERS,
  setServer,
  type ServerKind,
} from '../data/servers'
import ServerIcon from './ServerIcon'

const KINDS: readonly ServerKind[] = ['multi', 'mono', 'heroic']

export default function ServerOnboarding() {
  const [open, setOpen] = useState(() => !hasChosenServer())
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (!open) return null

  function choose(id: string) {
    setServer(id)
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="rise max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/60"
      >
        <h2 id={titleId} className="text-xl font-semibold text-slate-100">
          Sur quel serveur jouez-vous ?
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Chaque serveur a ses prix. Kamadvice ne montre que ceux du vôtre, et vos relevés y vont.
          Vous pourrez en changer à tout moment depuis le header.
        </p>

        {KINDS.map((kind) => (
          <section key={kind} className="mt-5">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {KIND_LABEL[kind]}
            </h3>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SERVERS.filter((server) => server.kind === kind).map((server, index) => (
                <button
                  key={server.id}
                  type="button"
                  autoFocus={kind === KINDS[0] && index === 0}
                  onClick={() => choose(server.id)}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-amber-500/60 hover:bg-slate-800 hover:text-amber-300 focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none"
                >
                  <ServerIcon server={server} size={32} />
                  <span className="truncate">{server.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-300 focus-visible:ring-1 focus-visible:ring-amber-500 focus-visible:outline-none"
          >
            Plus tard — rester sur {DEFAULT_SERVER.name} pour l'instant
          </button>
        </div>
      </div>
    </div>
  )
}
