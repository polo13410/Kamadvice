import { Icon } from '../lib/icons'

/**
 * Flèche de tendance pour une variation en kamas : hausse, baisse, stable, ou
 * inconnue faute de prix saisi.
 */
export default function TrendIcon({
  value,
  className = 'size-4',
}: {
  value: number | null
  className?: string
}) {
  const Glyph = value === null || value === 0 ? Icon.flat : value > 0 ? Icon.gain : Icon.loss
  return <Glyph className={className} aria-hidden />
}
