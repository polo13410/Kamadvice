/**
 * Le pied de page comptable : ce que sait l'app, ce que valent ses prix, et ce
 * que le navigateur garde en propre.
 *
 * Ces chiffres tenaient dans le header, où ils prenaient la place de la
 * recherche pour deux compteurs. En bas, ils peuvent enfin dire quelque chose
 * — la fraîcheur des relevés, surtout, qui est la vraie santé du jeu de prix.
 */
import { useMemo, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useCatalog } from '../data/catalogContext'
import { useFavorites } from '../data/favorites'
import { useIgnored } from '../data/ignored'
import { freshness, useCurrentPrices } from '../data/prices'
import { formatKamas, formatRelativeDate } from '../lib/format'
import { Icon } from '../lib/icons'
import { Tooltip } from './Tooltip'

const DAY_MS = 86_400_000

export default function Footer({ shell }: { shell: string }) {
  const catalog = useCatalog()
  const points = useCurrentPrices()
  const favorites = useFavorites()
  const ignored = useIgnored()

  /**
   * Un seul passage sur les relevés : ils sont aussi nombreux que les items
   * cotés, et le pied de page se redessine à chaque prix saisi.
   */
  const stats = useMemo(() => {
    const values: number[] = []
    let today = 0
    let stale = 0
    let latest = 0

    for (const point of points.values()) {
      values.push(point.price)
      if (freshness(point) === 'stale') stale += 1
      const at = point.at === null ? 0 : new Date(point.at).getTime()
      if (!Number.isFinite(at)) continue
      if (Date.now() - at < DAY_MS) today += 1
      if (at > latest) latest = at
    }

    // La médiane plutôt que la moyenne : quelques items à des dizaines de
    // millions tireraient la seconde loin de tout ce qu'on manipule vraiment.
    values.sort((a, b) => a - b)
    const middle = values.length === 0 ? null : (values[values.length >> 1] ?? null)

    return {
      priced: points.size,
      // Ce sur quoi on peut réellement travailler : un prix vieux d'un mois ne
      // compte pas comme un item renseigné.
      usable: points.size - stale,
      today,
      stale,
      median: middle,
      latest: latest === 0 ? null : new Date(latest).toISOString(),
    }
  }, [points])

  const total = catalog.items.length

  /**
   * Une décimale sous le pour cent : à 75 items cotés sur 17 000, l'entier
   * afficherait « 0 % » et donnerait la couverture pour nulle.
   */
  const percent = (part: number) => {
    if (total === 0) return '0'
    const ratio = (part / total) * 100
    return ratio > 0 && ratio < 1 ? ratio.toFixed(1).replace('.', ',') : String(Math.round(ratio))
  }

  return (
    <footer className="border-t border-slate-900 bg-slate-950/60">
      <div
        className={`mx-auto flex ${shell} flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-slate-500`}
      >
        <Stat icon={Icon.item} value={catalog.items.length} label="items" tip="Items du catalogue" />
        <Stat
          icon={Icon.recipe}
          value={catalog.recipeFor.size}
          label="recettes"
          tip="Items qui se craftent"
        />
        <Stat
          icon={Icon.usedIn}
          value={catalog.usedIn.size}
          label="ingrédients"
          tip="Items qui entrent dans au moins une recette"
        />
        <Stat icon={Icon.type} value={catalog.types.length} label="types" tip="Types d'items" />

        <Divider />

        <Stat
          icon={Icon.price}
          value={stats.priced}
          label="prix connus"
          tip={`${percent(stats.priced)} % du catalogue est coté, fraîcheur comprise`}
        />
        <Stat
          icon={Icon.target}
          value={`${percent(stats.usable)} %`}
          label="complétion"
          tip={`${stats.usable.toLocaleString('fr-FR')} items sur ${total.toLocaleString('fr-FR')} ont un prix de moins de 7 jours`}
          className={stats.usable * 2 >= total ? 'text-emerald-500/80' : 'text-amber-500/80'}
        />
        <Stat
          icon={Icon.history}
          value={stats.today}
          label="relevés · 24 h"
          tip="Prix mis à jour depuis hier"
          className={stats.today > 0 ? 'text-emerald-500/80' : undefined}
        />
        <Stat
          icon={Icon.warning}
          value={stats.stale}
          label="périmés"
          tip="Relevés de plus de 7 jours, ou sans date"
          className={stats.stale > 0 ? 'text-red-500/70' : undefined}
        />
        {stats.median !== null && (
          <Stat
            icon={Icon.gauge}
            value={formatKamas(stats.median)}
            label="kamas médians"
            tip="Prix médian des items cotés — la moyenne, elle, suivrait les quelques items à des millions"
          />
        )}
        {stats.latest !== null && (
          <Tooltip content="Dernier prix relevé, tous contributeurs confondus">
            <span className="flex items-center gap-1.5">
              <Icon.time className="size-3.5 shrink-0" aria-hidden />
              dernier relevé {formatRelativeDate(stats.latest)}
            </span>
          </Tooltip>
        )}

        <Divider />

        <Stat
          icon={Icon.favorite}
          value={favorites.size}
          label="favoris"
          tip="Épinglés dans ce navigateur"
        />
        <Stat
          icon={Icon.inStock}
          value={ignored.size}
          label="en stock"
          tip="Ingrédients dont le coût n'est pas compté dans les crafts"
        />
      </div>
    </footer>
  )
}

const Divider = () => <span className="h-3 w-px shrink-0 bg-slate-800" aria-hidden />

/** Un chiffre et ce qu'il compte, la bulle disant le reste. */
function Stat({
  icon: Glyph,
  value,
  label,
  tip,
  className = 'text-slate-400',
}: {
  icon: LucideIcon
  value: ReactNode
  label: string
  tip: string
  className?: string
}) {
  return (
    <Tooltip content={tip} className="flex items-center gap-1.5">
      <Glyph className={`size-3.5 shrink-0 ${className}`} aria-hidden />
      <span className={`tabular-nums ${className}`}>
        {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
      </span>
      {label}
    </Tooltip>
  )
}
