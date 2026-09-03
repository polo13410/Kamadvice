import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ItemIcon from "../components/ItemIcon";
import PriceField from "../components/PriceField";
import PriceHistory from "../components/PriceHistory";
import TrendIcon from "../components/TrendIcon";
import { useCatalog } from "../data/catalogContext";
import { setIgnored, useIgnored } from "../data/ignored";
import { usePriceLogs, usePrices } from "../data/prices";
import { createEvaluator } from "../domain/craft";
import type { Item } from "../domain/types";
import { formatKamas, formatPercent, formatRelativeDate } from "../lib/format";
import { Icon } from "../lib/icons";

/** Au-delà, un relevé est trop vieux pour qu'on s'y fie sans le revérifier. */
const STALE_AFTER_MS = 7 * 86_400_000;

export default function ItemPage() {
  const { id } = useParams();
  const catalog = useCatalog();
  const prices = usePrices();
  const logs = usePriceLogs();
  const ignored = useIgnored();

  const itemId = Number(id);
  const item = catalog.byId.get(itemId);

  const evaluate = useMemo(
    () => createEvaluator(catalog, prices, ignored),
    [catalog, prices, ignored],
  );

  /**
   * Date du relevé le plus ancien parmi les ingrédients chiffrés, si elle
   * dépasse le seuil de péremption. C'est ce relevé qui date le coût du craft.
   * Les ingrédients jamais saisis ne comptent pas : ils relèvent du coût
   * incomplet, pas de la fraîcheur. Ceux en stock non plus : leur prix ne pèse
   * plus sur le coût.
   */
  const staleSince = useMemo(() => {
    const recipe = catalog.recipeFor.get(itemId);
    if (!recipe) return null;

    let oldest: string | null = null;
    for (const entry of recipe.entries) {
      if (ignored.has(entry.itemId)) continue;
      // Dates ISO en UTC : la comparaison lexicographique suffit.
      const at = logs.get(entry.itemId)?.[0]?.at;
      if (at && (oldest === null || at < oldest)) oldest = at;
    }

    if (oldest === null) return null;
    return Date.now() - new Date(oldest).getTime() > STALE_AFTER_MS
      ? oldest
      : null;
  }, [catalog, itemId, logs, ignored]);

  /** Recettes dans lesquelles cet item entre comme ingrédient. */
  const usedIn = useMemo(() => {
    const consumers = catalog.usedIn.get(itemId) ?? [];
    return consumers
      .flatMap((resultId) => {
        const result = catalog.byId.get(resultId);
        const recipe = catalog.recipeFor.get(resultId);
        if (!result || !recipe) return [];
        const quantity = recipe.entries
          .filter((entry) => entry.itemId === itemId)
          .reduce((sum, entry) => sum + entry.quantity, 0);
        return [{ result, quantity }];
      })
      .sort((a, b) => a.result.name.localeCompare(b.result.name, "fr"));
  }, [catalog, itemId]);

  if (!item) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-slate-400">Item introuvable.</p>
      </div>
    );
  }

  const report = evaluate.report(itemId);
  const recipe = catalog.recipeFor.get(itemId);

  return (
    <div className="space-y-8">
      <BackLink />

      <header className="flex flex-wrap items-center gap-4">
        <ItemIcon item={item} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-slate-100">{item.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <Icon.type className="size-3.5" aria-hidden />
              {item.type?.name ?? "Type inconnu"}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon.level className="size-3.5" aria-hidden />
              niveau {item.level}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon.pods className="size-3.5" aria-hidden />
              {item.pods} pods
            </span>
          </p>
        </div>
        {/* Sur un item craftable, le prix HDV est saisi dans le pied de la
            recette, à côté du coût et de la marge. Sans recette, il n'y a pas
            de pied : le champ reste ici. */}
        {!recipe && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-400">
              <Icon.price className="size-4" aria-hidden />
              Prix HDV
            </span>
            <PriceField itemId={item.id} align="left" />
          </div>
        )}
      </header>

      {recipe && (
        <section className="space-y-3">
          <SectionTitle icon={Icon.recipe}>Recette</SectionTitle>

          <div className="overflow-hidden rounded-lg border border-slate-800">
            {/* `table-fixed` : sans lui, les `colSpan` du pied redistribuent les
                largeurs du corps et rien ne s'aligne plus d'une ligne à l'autre. */}
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon.item className="size-3.5" aria-hidden />
                      Ingrédient
                    </span>
                  </th>
                  <th
                    className="w-28 px-3 py-2 text-center font-medium"
                    title="Ingrédient déjà en stock : son coût n'est pas compté"
                  >
                    <span className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                      <Icon.inStock className="size-3.5 shrink-0" aria-hidden />
                      En stock
                    </span>
                  </th>
                  <th className="w-16 px-3 py-2 text-right font-medium">Qté</th>
                  {/* Assez large pour loger la date du relevé à côté du champ. */}
                  <th className="w-72 px-3 py-2 text-right font-medium">
                    <span className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      <Icon.price className="size-3.5 shrink-0" aria-hidden />
                      Prix unitaire
                    </span>
                  </th>
                  <th className="w-32 px-3 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {recipe.entries.map((entry) => {
                  const ingredient = catalog.byId.get(entry.itemId);
                  const unitPrice = evaluate.buy(entry.itemId);
                  const inStock = ignored.has(entry.itemId);
                  return (
                    <tr
                      key={entry.itemId}
                      className="border-t border-slate-800/60"
                    >
                      <td className="min-w-0 px-3 py-2">
                        {ingredient ? (
                          <ItemLink item={ingredient} focusable={false} />
                        ) : (
                          <span className="text-slate-500">
                            Item #{entry.itemId}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {/* Hors tabulation : la saisie enchaîne les prix, la
                            coche se pointe à la souris. */}
                        <input
                          type="checkbox"
                          checked={inStock}
                          onChange={(event) =>
                            setIgnored(entry.itemId, event.target.checked)
                          }
                          tabIndex={-1}
                          title="Ne pas compter le coût de cet ingrédient"
                          aria-label={`Ingrédient en stock : ${
                            ingredient?.name ?? `item #${entry.itemId}`
                          }`}
                          className="size-4 cursor-pointer accent-amber-500"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {entry.quantity}
                      </td>
                      <td className="px-3 py-2">
                        <PriceField itemId={entry.itemId} />
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          inStock ? "text-slate-600" : "text-slate-300"
                        }`}
                      >
                        {inStock
                          ? "0"
                          : formatKamas(
                              unitPrice === null
                                ? null
                                : unitPrice * entry.quantity,
                            )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Tout ce qu'il faut pour décider sur une seule ligne : à combien
                  ça se revend, ce qu'il reste, ce que coûte la fabrication.
                  Une seule cellule sur toute la largeur : les trois blocs se
                  placent au flex, sans dépendre des colonnes du dessus. */}
              <tfoot className="border-t border-slate-800 bg-slate-900/60">
                <tr>
                  <td colSpan={5} className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                      <FooterStat icon={Icon.price} label="Prix HDV">
                        <PriceField itemId={item.id} align="left" />
                      </FooterStat>

                      <FooterStat
                        icon={Icon.gain}
                        label="Marge à la revente"
                        className="ml-auto"
                      >
                        {report.margin === null ? (
                          <span className="tabular-nums text-slate-600">—</span>
                        ) : (
                          <span
                            className={`flex items-center gap-1.5 text-base font-medium tabular-nums ${
                              report.margin >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            <TrendIcon
                              value={report.margin}
                              className="size-4 shrink-0"
                            />
                            {formatKamas(report.margin)}
                            <span className="text-xs text-slate-500">
                              {formatPercent(report.marginRatio)}
                            </span>
                          </span>
                        )}
                      </FooterStat>

                      <FooterStat icon={Icon.craft} label="Coût du craft">
                        <span className="text-base font-medium tabular-nums text-slate-100">
                          {formatKamas(report.craft?.cost ?? null)}
                        </span>
                      </FooterStat>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {report.craft && report.craft.missing.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-amber-500/80">
              <Icon.warning className="size-4 shrink-0" aria-hidden />
              Coût incomplet : {new Set(report.craft.missing).size}{" "}
              ingrédient(s) sans prix saisi.
            </p>
          )}

          {report.craft && report.craft.ignored.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Icon.inStock className="size-4 shrink-0" aria-hidden />
              {new Set(report.craft.ignored).size} ingrédient(s) en stock,
              comptés pour 0.
            </p>
          )}

          {staleSince !== null && (
            <p className="flex items-center gap-2 text-sm text-amber-500/80">
              <Icon.warning className="size-4 shrink-0" aria-hidden />
              Prix relevé {formatRelativeDate(staleSince)} : il a peut-être
              changé depuis.
            </p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle icon={Icon.history}>Historique des prix</SectionTitle>
        <PriceHistory itemId={item.id} />
      </section>

      {usedIn.length !== 0 && (
        <section className="space-y-3">
          <SectionTitle icon={Icon.usedIn}>
            Permet de crafter
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-600">
              {usedIn.length} recette{usedIn.length > 1 ? "s" : ""}
            </span>
          </SectionTitle>

          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon.item className="size-3.5" aria-hidden />
                      Résultat
                    </span>
                  </th>
                  <th className="w-24 px-3 py-2 text-right font-medium">
                    Qté requise
                  </th>
                  <th className="w-32 px-3 py-2 text-right font-medium">
                    <span className="flex items-center justify-end gap-1.5">
                      <Icon.price className="size-3.5" aria-hidden />
                      Prix HDV
                    </span>
                  </th>
                  <th className="w-32 px-3 py-2 text-right font-medium">
                    <span className="flex items-center justify-end gap-1.5">
                      <Icon.craft className="size-3.5" aria-hidden />
                      Coût craft
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {usedIn.map(({ result, quantity }) => {
                  const target = evaluate.report(result.id);
                  return (
                    <tr
                      key={result.id}
                      className="border-t border-slate-800/60"
                    >
                      <td className="px-3 py-2">
                        <ItemLink item={result} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {quantity}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {formatKamas(target.buy)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {formatKamas(
                          target.craft?.complete ? target.craft.cost : null,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Glyph,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
      <Glyph className="size-4 shrink-0" aria-hidden />
      {children}
    </h2>
  );
}

/** Bloc du pied de recette : un libellé discret suivi de sa valeur, en ligne. */
function FooterStat({
  icon: Glyph,
  label,
  className = "",
  children,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
        <Glyph className="size-3.5 shrink-0" aria-hidden />
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * `focusable={false}` sort le lien de l'ordre de tabulation : dans la table de
 * recette, Tab doit enchaîner les champs de prix sans détour.
 */
function ItemLink({
  item,
  focusable = true,
}: {
  item: Item;
  focusable?: boolean;
}) {
  return (
    <Link
      to={`/item/${item.id}`}
      tabIndex={focusable ? undefined : -1}
      className="flex items-center gap-2 text-slate-200 hover:text-amber-400"
    >
      <ItemIcon item={item} size={24} />
      <span className="truncate">{item.name}</span>
    </Link>
  );
}

function BackLink() {
  return (
    <Link
      to="/"
      className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-amber-400"
    >
      <Icon.back className="size-4" aria-hidden />
      Retour à la liste
    </Link>
  );
}
