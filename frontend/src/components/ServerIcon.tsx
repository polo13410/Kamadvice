/**
 * Emblème d'un serveur de jeu, lu dans `public/data/servers/<id>.webp`.
 *
 * Aucun CDN ne sert ces images (Ankama comme DofusDB répondent 403 ou 404) :
 * elles sont hébergées ici, une par serveur, nommées par sa clé — 64 px, pour
 * un affichage à 28 px au plus sur écran dense. Sans fichier (serveur ajouté
 * à la liste avant son emblème), un badge à l'initiale prend la place — même
 * taille, même rond — et l'échec est retenu pour ne pas redemander l'image à
 * chaque ouverture.
 */
import { useState } from 'react'
import type { GameServer } from '../data/servers'

const missing = new Set<string>()

/** Une teinte par serveur, stable : le badge d'Imagiro est toujours le même. */
function hue(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

export default function ServerIcon({
  server,
  size = 24,
  className = '',
}: {
  server: GameServer
  size?: number
  className?: string
}) {
  const [, rerender] = useState(0)

  if (missing.has(server.id)) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-slate-100 select-none ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.5,
          backgroundColor: `hsl(${hue(server.id)} 45% 35%)`,
        }}
        aria-hidden
      >
        {server.name[0]}
      </span>
    )
  }

  return (
    <img
      key={server.id}
      src={`${import.meta.env.BASE_URL}data/servers/${server.id}.webp`}
      alt=""
      aria-hidden
      width={size}
      height={size}
      decoding="async"
      className={`shrink-0 rounded-full object-cover ${className}`}
      onError={() => {
        missing.add(server.id)
        rerender((n) => n + 1)
      }}
    />
  )
}
