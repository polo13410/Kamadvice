import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import NotFound, { useBackExit, type Exit } from "../components/NotFound";
import FavoriteButton from "../components/FavoriteButton";
import ItemIcon from "../components/ItemIcon";
import Kamas from "../components/Kamas";
import PriceField from "../components/PriceField";
import PriceHistory from "../components/PriceHistory";
import ShareButton from "../components/ShareButton";
import { Tooltip } from "../components/Tooltip";
import TrendIcon from "../components/TrendIcon";
import { useCatalog } from "../data/catalogContext";
import { setIgnored, useIgnored } from "../data/ignored";
import { usePrices } from "../data/prices";
import { recordItem } from "../data/recent";
import { createEvaluator } from "../domain/craft";
import type { Item } from "../domain/types";
import { formatPercent } from "../lib/format";
import { Icon } from "../lib/icons";
import { rememberedFilters } from "../lib/itemFilters";
import { FAVORITES, SEARCH } from "../lib/pages";

export default function ItemPage() {
  const { id } = useParams();
  const catalog = useCatalog();
  const prices = usePrices();
  const ignored = useIgnored();

  const itemId = Number(id);
  const item = catalog.byId.get(itemId);

  const evaluate = useMemo(
    () => createEvaluator(catalog, prices, ignored),
    [catalog, prices, ignored],
  );

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

  // La barre de recherche propose ce qu'on vient de consulter : c'est ici que
  // la consultation se constate, pas au clic qui y menait.
  useEffect(() => {
    if (item) recordItem(item.id);
  }, [item]);

  if (!item) return <MissingItem id={id ?? ""} />;

  const report = evaluate.report(itemId);
  const recipe = catalog.recipeFor.get(itemId);

  return (
    <div className="space-y-8">
      <BackLink />

      <header className="flex flex-wrap items-center gap-4">
        <ItemIcon item={item} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold text-slate-100">
            {item.name}
            <FavoriteButton itemId={item.id} />
            {/* Épingler et partager sont les deux gestes qu'on fait d'un item
                sans le quitter : ils voisinent avec son nom. */}
            <ShareButton className="ml-1 font-normal" />
          </h1>
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
                  <th className="w-28 px-3 py-2 text-center font-medium">
                    <Tooltip
                      content="Ingrédient déjà en stock : son coût n'est pas compté"
                      className="flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <Icon.inStock className="size-3.5 shrink-0" aria-hidden />
                      En stock
                    </Tooltip>
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
                        <Tooltip content="Ne pas compter le coût de cet ingrédient">
                          <input
                            type="checkbox"
                            checked={inStock}
                            onChange={(event) =>
                              setIgnored(entry.itemId, event.target.checked)
                            }
                            tabIndex={-1}
                            aria-label={`Ingrédient en stock : ${
                              ingredient?.name ?? `item #${entry.itemId}`
                            }`}
                            className="size-4 cursor-pointer accent-amber-500"
                          />
                        </Tooltip>
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
                        {inStock ? (
                          "0"
                        ) : (
                          <Kamas
                            value={
                              unitPrice === null
                                ? null
                                : unitPrice * entry.quantity
                            }
                          />
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
                            <Kamas value={report.margin} />
                            <span className="text-xs text-slate-500">
                              {formatPercent(report.marginRatio)}
                            </span>
                          </span>
                        )}
                      </FooterStat>

                      <FooterStat icon={Icon.craft} label="Coût du craft">
                        <span className="text-base font-medium tabular-nums text-slate-100">
                          <Kamas value={report.craft?.cost ?? null} />
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
                        <Kamas value={target.buy} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        <Kamas
                          value={
                            target.craft?.complete ? target.craft.cost : null
                          }
                        />
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
    <span className="flex min-w-0 items-center gap-2">
      {/* Le cœur reste en dehors du lien : imbriqués, un clic sur l'un
          déclencherait l'autre. */}
      <FavoriteButton itemId={item.id} focusable={focusable} />
      <Link
        to={`/item/${item.id}`}
        tabIndex={focusable ? undefined : -1}
        className="flex min-w-0 items-center gap-2 text-slate-200 hover:text-amber-400"
      >
        <ItemIcon item={item} size={24} />
        <span className="truncate">{item.name}</span>
      </Link>
    </span>
  );
}

/**
 * L'impasse propre à une fiche : l'id demandé n'est pas au catalogue.
 *
 * Le cas vient presque toujours d'un lien — partagé, mis en favori du
 * navigateur, ou saisi à la main — donc l'id fautif est affiché en grand :
 * c'est la seule information qui permette de comprendre ce qui a raté.
 */
function MissingItem({ id }: { id: string }) {
  const catalog = useCatalog();
  // Les mêmes destinations que `BackLink`, et le retour arrière quand il y a
  // un « avant ». `rememberedFilters` se lit au rendu : les filtres changent
  // d'une visite à l'autre.
  const exits: Exit[] = [
    ...useBackExit(),
    {
      to: { pathname: SEARCH.to, search: rememberedFilters() },
      label: "Retour à la liste",
      description: "Mes derniers filtres de recherche",
      icon: Icon.search,
    },
    {
      to: FAVORITES.to,
      label: "Mes favoris",
      description: "Les items que je suis",
      icon: Icon.favorite,
    },
  ];

  return (
    <NotFound
      code={id || "?"}
      glyph={Icon.missingItem}
      title="Item introuvable"
      message={
        <>
          Aucun item ne porte cet identifiant parmi les{" "}
          {catalog.items.length.toLocaleString("fr-FR")} du catalogue. Le lien
          est peut-être tronqué, ou l'item a disparu d'une mise à jour du jeu.
        </>
      }
      exits={exits}
    />
  );
}

function BackLink() {
  return (
    <Link
      to={{ pathname: SEARCH.to, search: rememberedFilters() }}
      className="flex w-fit items-center gap-1.5 text-sm text-slate-500 hover:text-amber-400"
    >
      <Icon.back className="size-4" aria-hidden />
      Retour à la liste
    </Link>
  );
}
