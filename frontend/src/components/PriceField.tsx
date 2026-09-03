import { isStale, useCurrentPrice, type PricePoint } from "../data/prices";
import type { ItemId } from "../domain/types";
import { formatDateTime, formatRelativeDate } from "../lib/format";
import { Icon } from "../lib/icons";
import { KamaIcon } from "./Kamas";
import PriceInput from "./PriceInput";
import { useTooltip } from "./Tooltip";

/** Ce que dit la bulle de la date : quand, et s'il faut s'en méfier. */
function describe(latest: PricePoint | undefined): string | null {
  if (!latest) return null;
  if (latest.at === null)
    return "Attention : ce prix n'a pas de date de relevé, il a peut-être changé depuis";
  if (isStale(latest)) {
    return `Attention : prix relevé le ${formatDateTime(latest.at)}, il a peut-être changé depuis`;
  }
  return `Prix relevé le ${formatDateTime(latest.at)}`;
}

/**
 * Saisie d'un prix HDV accompagnée de sa date de dernier relevé, sur une ligne.
 *
 * Le composant lit lui-même le prix courant : les listes n'ont donc pas à le
 * faire descendre, et un prix modifié depuis n'importe quel autre endroit de la
 * page se reflète ici immédiatement.
 *
 * La date porte aussi l'alerte de péremption : un relevé trop vieux passe en
 * orange, ce qui la signale partout où un prix se lit, sans avertissement à
 * placer vue par vue.
 */
export default function PriceField({
  itemId,
  align = "right",
  layout = "row",
  className = "",
}: {
  itemId: ItemId;
  /**
   * `right` (défaut) épingle l'input à droite et pousse la date à sa gauche :
   * dans une colonne, les montants restent alignés quelle que soit la longueur
   * de la date. `left` met l'input d'abord, pour un champ isolé.
   */
  align?: "left" | "right";
  /**
   * `row` (défaut) tient sur une ligne, au prix d'environ 18rem de large.
   * `column` glisse la date sous le champ : une cellule de prix retombe à
   * 8rem, ce qui permet d'en aligner plusieurs dans un tableau large sans
   * renoncer à l'alerte de péremption.
   */
  layout?: "row" | "column";
  className?: string;
}) {
  // Seulement le dernier relevé, jamais tout le journal : ce composant est
  // rendu sur chaque ligne des listes, et charger un historique par ligne
  // reviendrait à des centaines d'appels pour une date affichée en 10px.
  const latest = useCurrentPrice(itemId);
  const stale = isStale(latest);
  const tip = useTooltip(describe(latest));

  // `shrink-0` : dans une cellule étroite, c'est la date qui cède, pas le champ.
  // La pièce est posée après le champ, en dehors : elle dit l'unité sans
  // rogner la place de la saisie ni se retrouver sélectionnée avec le nombre.
  const input = (
    <span className="flex shrink-0 items-center gap-1">
      <PriceInput
        itemId={itemId}
        value={latest?.price ?? null}
        className="shrink-0"
      />
      <KamaIcon />
    </span>
  );
  // `h-3` même sans relevé : la ligne garde sa hauteur, sinon une cellule
  // sans date remonte et les champs voisins ne s'alignent plus.
  const date = (
    <span
      {...tip.props}
      className={`flex h-3 min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[10px] leading-none ${
        stale ? "text-amber-500/80" : "text-slate-600"
      }`}
    >
      {latest && (
        <>
          <Icon.history className="size-3 shrink-0" aria-hidden />
          {formatRelativeDate(latest.at)}
          {tip.tooltip}
        </>
      )}
    </span>
  );

  // Empilé, le champ passe toujours en premier : c'est lui qu'on vient
  // chercher, la date n'est qu'un commentaire.
  const stacked = layout === "column";
  const dateFirst = !stacked && align === "right";
  const arrangement = stacked
    ? `flex flex-col gap-0.5 ${align === "right" ? "items-end" : "items-start"}`
    : `flex items-center gap-2 ${align === "right" ? "justify-end" : ""}`;

  return (
    <div className={`${arrangement} ${className}`}>
      {dateFirst ? (
        <>
          {date}
          {input}
        </>
      ) : (
        <>
          {input}
          {date}
        </>
      )}
    </div>
  );
}
