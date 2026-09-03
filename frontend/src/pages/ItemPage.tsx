import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ItemIcon from "../components/ItemIcon";
import PriceField from "../components/PriceField";
import PriceHistory from "../components/PriceHistory";
import { useCatalog } from "../data/catalogContext";
import { usePrices } from "../data/prices";
import { createEvaluator } from "../domain/craft";
import TrendIcon from "../components/TrendIcon";
import type { Item } from "../domain/types";
import { formatKamas, formatPercent } from "../lib/format";
import { Icon } from "../lib/icons";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export default function ItemPage() {
  const { id } = useParams();
  const catalog = useCatalog();
  const prices = usePrices();

  const itemId = Number(id);
  const item = catalog.byId.get(itemId);

  const evaluate = useMemo(
    () => createEvaluator(catalog, prices),
    [catalog, prices],
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
        <div className="flex flex-col items-end gap-1">
          <span className="flex items-center gap-1.5 text-sm text-slate-400">
            <Icon.price className="size-4" aria-hidden />
            Prix HDV
          </span>
          <PriceField itemId={item.id} className="w-32" />
        </div>
      </header>

      {recipe && (
        <section className="space-y-3">
          <SectionTitle icon={Icon.recipe}>Recette</SectionTitle>

          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    <span className="flex items-center gap-1.5">
                      <Icon.item className="size-3.5" aria-hidden />
                      Ingrédient
                    </span>
                  </th>
                  <th className="w-16 px-3 py-2 text-right font-medium">Qté</th>
                  <th className="w-36 px-3 py-2 text-right font-medium">
                    <span className="flex items-center justify-end gap-1.5">
                      <Icon.price className="size-3.5" aria-hidden />
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
                  return (
                    <tr
                      key={entry.itemId}
                      className="border-t border-slate-800/60"
                    >
                      <td className="px-3 py-2">
                        {ingredient ? (
                          <ItemLink item={ingredient} />
                        ) : (
                          <span className="text-slate-500">
                            Item #{entry.itemId}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                        {entry.quantity}
                      </td>
                      <td className="px-3 py-2">
                        <PriceField
                          itemId={entry.itemId}
                          className="w-32 ml-auto"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                        {formatKamas(
                          unitPrice === null
                            ? null
                            : unitPrice * entry.quantity,
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-800 bg-slate-900/60">
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-right text-slate-400"
                  >
                    <span className="flex items-center justify-end gap-1.5">
                      <Icon.craft className="size-4" aria-hidden />
                      Coût du craft
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-100">
                    {formatKamas(report.craft?.cost ?? null)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {report.craft?.cost == null && (
            <p className="flex items-center gap-2 text-sm text-amber-500/80">
              <Icon.warning className="size-4 shrink-0" aria-hidden />
              Coût incomplet : {new Set(report.craft?.missing ?? []).size}{" "}
              ingrédient(s) sans prix saisi.
            </p>
          )}

          {report.margin !== null && (
            <p className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">Marge à la revente :</span>
              <span
                className={`flex items-center gap-1.5 ${
                  report.margin >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                <TrendIcon value={report.margin} className="size-4 shrink-0" />
                {formatKamas(report.margin)} kamas (
                {formatPercent(report.marginRatio)})
              </span>
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
                        {formatKamas(target.craft?.cost ?? null)}
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

function ItemLink({ item }: { item: Item }) {
  return (
    <Link
      to={`/item/${item.id}`}
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
