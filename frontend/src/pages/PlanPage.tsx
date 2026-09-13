/**
 * Un plan d'élevage : la prochaine chose à faire, puis tout ce qui reste.
 *
 * La page ne garde aucun état propre : elle déroule le plan sur l'étable à
 * chaque rendu (`domain/breeding.ts`), et chaque geste — cocher une monture
 * possédée, enregistrer un accouplement ou un clonage — passe par l'étable,
 * d'où tout se recalcule. De haut en bas : la suggestion, les réglages, le
 * coût du plan tel qu'il est, les croisements restants dans l'ordre, et,
 * repliés, l'étable de l'espèce et l'arbre complet.
 */
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BUTTON, FIELD_NUMBER, FIELD_TABLE } from "../components/Adorned";
import BreedingTree, { StepCircle } from "../components/BreedingTree";
import DashboardHeader from "../components/DashboardHeader";
import {
  FilterBar,
  FilterDivider,
  FilterToggle,
} from "../components/FilterBar";
import ItemIcon from "../components/ItemIcon";
import Kamas from "../components/Kamas";
import VarietyLink, {
  MountTag,
  SexAddButtons,
  SexGlyph,
  SexNeedLabel,
  SexToggle,
  VarietySelect,
} from "../components/MountVariety";
import NotFound from "../components/NotFound";
import PriceField from "../components/PriceField";
import StablePanel, { mountAnchor } from "../components/StablePanel";
import { Tooltip } from "../components/Tooltip";
import { useCatalog } from "../data/catalogContext";
import { useIgnored } from "../data/ignored";
import {
  addMount,
  recordBreeding,
  forgetEvent,
  recordClone,
  updateMount,
  useJournal,
  useStable,
  type JournalEvent,
  type MountSnapshot,
} from "../data/inventory";
import { varietyName } from "../data/mounts";
import {
  chooseRecipe,
  removePlan,
  resetChoices,
  setFeedPoints,
  setTargetLevel,
  updateSettings,
  usePlan,
} from "../data/plans";
import { usePrices } from "../data/prices";
import {
  ancestorRank,
  ancestorRows,
  attemptsFor,
  captures,
  CONFIDENCE_LEVELS,
  estimateCost,
  evaluatePlan,
  meanAttempts,
  plannedAttempts,
  theoreticalPlan,
  type ClonePlan,
  type Cross,
  type Evaluation,
  type Plan,
  type Sex,
  type Slot,
  type StableMount,
  type Suggestion,
} from "../domain/breeding";
import type { Catalog } from "../domain/types";
import { formatAttempts, formatChance, formatRelativeDate } from "../lib/format";
import { Icon } from "../lib/icons";
import { BREEDING_PATH, DASHBOARDS } from "../lib/pages";

const SELECT = `${FIELD_TABLE} w-auto text-left`;

export default function PlanPage() {
  const { planId } = useParams();
  const plan = usePlan(planId);
  const catalog = useCatalog();
  const variety = plan && catalog.mounts.byId.get(plan.target);

  if (!plan || !variety) {
    return (
      <NotFound
        code="404"
        glyph={Icon.notFound}
        title="Plan introuvable"
        message="Ce plan n’est pas dans ce navigateur : les plans d’élevage ne se partagent pas encore d’une machine à l’autre."
        detail={planId}
        exits={[
          {
            to: BREEDING_PATH,
            label: "Élevage",
            description: "Mes plans, et en créer un",
            icon: Icon.breeding,
          },
        ]}
      />
    );
  }

  return <PlanDashboard key={plan.id} plan={plan} catalog={catalog} />;
}

function PlanDashboard({ plan, catalog }: { plan: Plan; catalog: Catalog }) {
  const prices = usePrices();
  const ignored = useIgnored();
  const stable = useStable();
  const journal = useJournal();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const target = catalog.mounts.byId.get(plan.target)!;
  const targetItem = catalog.byId.get(target.id);
  const xp = catalog.mounts.xp;

  const evaluation = useMemo(
    () => evaluatePlan(catalog.mounts, plan, stable),
    [catalog.mounts, plan, stable],
  );
  const cost = useMemo(
    () => estimateCost(catalog, evaluation, plan.settings, prices, ignored),
    [catalog, evaluation, plan.settings, prices, ignored],
  );
  const toCapture = useMemo(() => captures(evaluation), [evaluation]);
  const ranks = useMemo(() => ancestorRows(evaluation), [evaluation]);
  /**
   * Les étapes, par couches : les croisements restants, et les montures déjà
   * obtenues qui en tenaient lieu — celles qui ont une recette et sont à
   * l'étable —, pour voir le chemin parcouru avec le chemin qui reste.
   */
  const steps = useMemo(() => {
    // La profondeur d'une variété dans la recette théorique : c'est elle qui
    // range dans les couches ce que le journal raconte, même quand la branche
    // n'existe plus dans le plan recalculé.
    const theoretical = evaluatePlan(catalog.mounts, theoreticalPlan(target.id, plan.settings), []);
    const depthOf = new Map<number, number>();
    for (const slot of theoretical.slots) {
      const known = depthOf.get(slot.variety.id);
      if (known === undefined || slot.depth < known) depthOf.set(slot.variety.id, slot.depth);
    }
    const species = (id: number) => catalog.mounts.byId.get(id)?.species;
    const events = journal.filter((event) =>
      species(event.kind === "breeding" ? event.baby.variety : event.survivor.variety) === target.species,
    );
    const born = new Set(events.flatMap((event) => (event.kind === "breeding" ? [event.baby.id] : [])));

    type Entry =
      | { depth: number; path: string; kind: "cross"; cross: Cross; slot: Slot }
      | { depth: number; path: string; kind: "owned"; slot: Slot }
      | { depth: number; path: string; kind: "event"; event: JournalEvent };
    const items: Entry[] = [
      ...evaluation.crosses.map(
        (cross): Entry => ({ depth: cross.child.depth, path: cross.path, kind: "cross", cross, slot: cross.child }),
      ),
      // Une monture à l'étable qui a une recette : obtenue, sauf si le journal
      // raconte déjà sa naissance.
      ...evaluation.slots
        .filter((slot) => slot.mount !== null && slot.variety.recipes.length > 0 && !born.has(slot.mount.id))
        .map((slot): Entry => ({ depth: slot.depth, path: slot.path, kind: "owned", slot })),
      ...events.map((event): Entry => ({
        depth: depthOf.get(event.kind === "breeding" ? (event.intended ?? event.baby.variety) : event.survivor.variety) ?? -1,
        path: `~${event.at}`,
        kind: "event",
        event,
      })),
    ];
    const rank = { event: 0, owned: 1, cross: 2 } as const;
    return items.sort(
      (a, b) => b.depth - a.depth || rank[a.kind] - rank[b.kind] || a.path.localeCompare(b.path),
    );
  }, [catalog.mounts, evaluation, journal, plan.settings, target]);
  const settings = plan.settings;
  const totalToCapture = toCapture.reduce(
    (sum, entry) => sum + entry.missing,
    0,
  );

  return (
    <div className="space-y-6">
      <DashboardHeader
        icon={Icon.breeding}
        glyph={
          targetItem ? <ItemIcon item={targetItem} size={40} /> : undefined
        }
        title={varietyName(target)}
        description={
          <>
            <Link
              to={BREEDING_PATH}
              className="text-slate-400 hover:text-amber-400"
            >
              Élevage
            </Link>
            {" › "}Génération {target.generation}. Le plan se recalcule sur
            l’étable à chaque changement ; les chances sont celles de la
            génération cible, accouplement par accouplement.
          </>
        }
        stats={[
          {
            icon: Icon.cross,
            label: evaluation.done
              ? "cible obtenue"
              : `${evaluation.crosses.length} croisement${evaluation.crosses.length > 1 ? "s" : ""} restant${evaluation.crosses.length > 1 ? "s" : ""}${
                  settings.probable
                    ? `, ${evaluation.attempts} accouplements à prévoir (≈ ${formatAttempts(Math.round(evaluation.meanAttempts * 10) / 10)} en moyenne)`
                    : ""
                }`,
          },
          {
            icon: Icon.cost,
            label: cost.complete ? (
              <span className="inline-flex items-center gap-1.5">
                <Kamas value={cost.total} />
                {cost.meanTotal !== null && (
                  <span className="text-slate-600">
                    ≈ <Kamas value={cost.meanTotal} /> en moy.
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-500/80">coût incomplet</span>
            ),
          },
        ]}
      >
        <Tooltip content="Oublie les recettes imposées : l’étable décide à nouveau de tout">
          <button
            type="button"
            onClick={() => resetChoices(plan.id)}
            className={`${BUTTON} h-8 text-xs`}
          >
            <Icon.sortReset className="size-3.5" aria-hidden />
            Recalculer depuis l’inventaire
          </button>
        </Tooltip>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                removePlan(plan.id);
                navigate(BREEDING_PATH);
              }}
              className="text-rose-400 hover:text-rose-300"
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-slate-500 hover:text-slate-300"
            >
              Annuler
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-rose-400"
          >
            <Icon.delete className="size-3.5" aria-hidden />
            Supprimer
          </button>
        )}
      </DashboardHeader>

      <NextStep
        suggestion={evaluation.suggestion}
        target={target}
        level={settings.targetLevel}
      />

      {/* Les réglages : ce que les chiffres supposent de chaque parent. Niveau
          et points sont les deux faces de la table d'XP. */}
      <FilterBar>
        <Tooltip content="Niveau auquel chaque parent est monté avant de reproduire : +0,15 % de chance par niveau. Les points suivent la table d’XP.">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.level className="size-4" aria-hidden />
            Niveau visé
            <input
              type="number"
              min={1}
              max={200}
              value={settings.targetLevel}
              onChange={(event) => {
                const level = Number(event.target.value);
                if (Number.isInteger(level) && level >= 1 && level <= 200)
                  setTargetLevel(plan.id, xp, level);
              }}
              className={`${FIELD_NUMBER} w-20`}
            />
          </label>
        </Tooltip>
        <FilterDivider />
        <Tooltip content="Points de mangeoire versés à une monture née au niveau 1. Le niveau visé devient le plus haut que ces points permettent.">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.gauge className="size-4" aria-hidden />
            Mangeoire
            <input
              inputMode="numeric"
              value={settings.feedPoints.toLocaleString("fr-FR")}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "");
                setFeedPoints(plan.id, xp, digits === "" ? 0 : Number(digits));
              }}
              className={`${FIELD_NUMBER} w-28`}
            />
            <span className="text-xs text-slate-600">pts</span>
          </label>
        </Tooltip>
        <FilterDivider />
        <FilterToggle
          icon={Icon.wizard}
          label="Optimakina"
          checked={settings.optimakina}
          onChange={(optimakina) => updateSettings(plan.id, { optimakina })}
          tip="Une Optimakina à chaque croisement : +10 % de chance, et son prix dans le coût"
        />
        <FilterDivider />
        <FilterToggle
          icon={Icon.attempts}
          label="Prendre en compte les probabilités"
          checked={settings.probable}
          onChange={(probable) => updateSettings(plan.id, { probable })}
          tip="Prévoir 1 / chance tentatives par croisement (40 % → 3, 52 % → 2, 70 % → 2, 80 % → 1), chacune consommant un couple : les parents, les Optimakinas et le coût suivent, sans cascade d’un étage à l’autre. Décoché : une tentative par croisement."
        />
      </FilterBar>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={Icon.cost} title="Coût restant probable">
          <Costs cost={cost} />
        </Section>
        <Section icon={Icon.mount} title="À obtenir">
          <div className="space-y-3 rounded-lg border border-slate-800 p-3 text-sm">
            {toCapture.length === 0 ? (
              <p className="text-slate-500">
                Rien à capturer : tout part de l’étable.
              </p>
            ) : (
              <div>
                <p className="mb-1 text-xs text-slate-500">
                  À capturer, en tout : {totalToCapture} monture
                  {totalToCapture > 1 ? "s" : ""}
                  {settings.probable
                    ? ` au nombre probable (≈ ${formatAttempts(Math.round(evaluation.meanCaptures * 10) / 10)} en moyenne)`
                    : ""}{" "}
                  — ♂ ou ♀
                  l’ajoute à l’étable.
                </p>
                <ul className="space-y-1">
                  {toCapture.map((entry) => (
                    <li
                      key={entry.variety.id}
                      className="flex items-center gap-3"
                    >
                      <span className="w-6 text-right tabular-nums text-slate-300">
                        {entry.missing}
                      </span>
                      <VarietyLink variety={entry.variety} full />
                      <SexNeedLabel need={entry} />
                      <SexAddButtons
                        className="ml-auto"
                        need={entry}
                        onAdd={(sex) =>
                          addMount({
                            variety: entry.variety.id,
                            sex,
                            level: settings.targetLevel,
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ranks.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                  <Icon.next
                    className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
                    aria-hidden
                  />
                  Ou bien, en partant du haut : parents, grands-parents… les
                  ancêtres de chaque rang, pour renseigner l’étable sans passer
                  par les étapes du dessous
                </summary>
                <div className="mt-2 space-y-3">
                  {ranks.map((row) => (
                    <div key={row.depth}>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                        {row.label}
                        <span className="ml-2 normal-case tracking-normal text-slate-600">
                          {row.missing} à obtenir
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {row.entries.map((entry) => (
                          <div
                            key={entry.variety.id}
                            className={`flex items-center gap-2 rounded border px-2 py-1.5 ${
                              entry.missing === 0
                                ? "border-slate-800/60 opacity-60"
                                : "border-slate-800 bg-slate-900/40"
                            }`}
                          >
                            <span className="w-7 shrink-0 text-right text-sm tabular-nums text-slate-200">
                              {entry.missing}×
                            </span>
                            <VarietyLink variety={entry.variety} />
                            <SexNeedLabel need={entry} />
                            {entry.owned > 0 && (
                              <span className="text-[10px] text-slate-500">
                                {entry.owned} possédée
                                {entry.owned > 1 ? "s" : ""}
                              </span>
                            )}
                            <SexAddButtons
                              need={entry}
                              onAdd={(sex) =>
                                addMount({
                                  variety: entry.variety.id,
                                  sex,
                                  level: settings.targetLevel,
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </Section>
      </div>

      <Section
        icon={Icon.cross}
        title="Croisements restants, dans l’ordre"
        note="Une ligne par croisement : ce qu'on a, ce qui manque, ce que ça donne. Les montures se déclarent depuis la suggestion ou l'étable ; « Accoupler » enregistre le résultat réel, stérilise les parents et recalcule tout."
      >
        {evaluation.crosses.length === 0 ? (
          <p className="rounded-lg border border-slate-800 p-3 text-sm text-slate-500">
            {evaluation.done
              ? "La cible est à l’étable : rien à croiser."
              : "Aucun croisement : tout s’obtient par capture ou clonage."}
          </p>
        ) : (
          <ol className="space-y-2">
            {steps.map((entry, index) => {
              const previous = steps[index - 1];
              const newLayer = !previous || previous.depth !== entry.depth;
              return (
                <Fragment key={entry.path}>
                  {newLayer && (
                    <li className="pt-2 text-[11px] uppercase tracking-wide text-slate-500 first:pt-0">
                      {entry.depth === 0
                        ? "La cible"
                        : entry.depth < 0
                          ? "Hors du plan"
                          : `Vers les ${ancestorRank(entry.depth).toLowerCase()}`}
                    </li>
                  )}
                  {entry.kind === "cross" ? (
                    <Step
                      planId={plan.id}
                      cross={entry.cross}
                      evaluation={evaluation}
                      level={settings.targetLevel}
                      probable={settings.probable}
                    />
                  ) : entry.kind === "owned" ? (
                    <DoneStep slot={entry.slot} recipe={plan.recipes[entry.path] ?? 0} />
                  ) : (
                    <HistoryStep event={entry.event} stable={stable} />
                  )}
                </Fragment>
              );
            })}
          </ol>
        )}
      </Section>

      <details className="group rounded-lg border border-slate-800">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
          <Icon.next
            className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <Icon.mount className="size-4 shrink-0" aria-hidden />
          Étable
          <span className="font-normal normal-case tracking-normal text-slate-600">
            {
              stable.filter(
                (mount) =>
                  catalog.mounts.byId.get(mount.variety)?.species ===
                  target.species,
              ).length
            }{" "}
            de cette espèce
            {evaluation.surplus.length > 0 &&
              `, ${evaluation.surplus.length} en trop`}
          </span>
        </summary>
        <div className="border-t border-slate-800/60 px-3 py-3">
          <StablePanel
            mounts={stable}
            species={target.species}
            evaluation={evaluation}
          />
        </div>
      </details>

      <details className="group rounded-lg border border-slate-800">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
          <Icon.next
            className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <Icon.genealogy className="size-4 shrink-0" aria-hidden />
          Arbre complet
        </summary>
        <div className="border-t border-slate-800/60 px-3 py-3">
          <BreedingTree root={evaluation.root} />
        </div>
      </details>
    </div>
  );
}

function Section({
  icon: Glyph,
  title,
  note,
  children,
}: {
  icon: typeof Icon.cross;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-500">
        <Glyph className="size-4 shrink-0" aria-hidden />
        {title}
      </h2>
      {note && <p className="text-xs text-slate-500">{note}</p>}
      {children}
    </section>
  );
}

// --- La prochaine étape --------------------------------------------------------

/** Une seule action, celle qui fait avancer le plan au moindre coût. */
function NextStep({
  suggestion,
  target,
  level,
}: {
  suggestion: Suggestion;
  target: { name: string };
  /** Niveau visé du plan : celui qu'on prête à un bébé, tenu pour préparé. */
  level: number;
}) {
  return (
    <section className="rounded-lg border border-amber-500/40 bg-amber-500/6 p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-amber-300">
        <Icon.target className="size-4 shrink-0" aria-hidden />
        Prochaine étape suggérée
      </h2>
      <div className="mt-2 text-sm text-slate-200">
        {suggestion.kind === "done" && (
          <p>Cible obtenue : {target.name} est à l’étable.</p>
        )}
        {suggestion.kind === "info" && (
          <p className="flex flex-wrap items-center gap-2">
            {suggestion.message}
            <a
              href={`#${mountAnchor(suggestion.mount)}`}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              voir dans l’étable
            </a>
            <SexPicker mountId={suggestion.mount.id} />
          </p>
        )}
        {suggestion.kind === "breeds" && (
          <div className="space-y-2">
            {suggestion.crosses.length > 1 && (
              <p className="text-xs text-slate-500">
                {suggestion.crosses.length} couples prêts : un enclos
                d’accouplements. Enregistrez chaque résultat au fur et à mesure.
              </p>
            )}
            {suggestion.crosses.map((cross) => (
              <BreedAction key={cross.path} cross={cross} level={level} />
            ))}
          </div>
        )}
        {suggestion.kind === "clones" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              {suggestion.items.length > 1
                ? `${suggestion.items.length} clonages : un enclos. `
                : ""}
              Deux stériles se détruisent pour en rendre une, féconde, tirée au
              sort — même sexe, mêmes parents. Les survivantes partent dans le
              prochain lot à préparer, avant de recapturer ou de ré-accoupler.
            </p>
            {suggestion.items.map((item) => (
              <CloneAction key={item.slot.path} slot={item.slot} clone={item.clone} />
            ))}
          </div>
        )}
        {suggestion.kind === "captures" && (
          <CaptureBatch suggestion={suggestion} level={level} />
        )}
      </div>
    </section>
  );
}

function SexPicker({ mountId }: { mountId: string }) {
  return (
    <SexToggle value={null} onChange={(sex) => updateMount(mountId, { sex })} />
  );
}

/**
 * Un lot de captures : de quoi remplir un enclos, à ajouter au compte-gouttes
 * — chaque ajout recalcule le lot, et quand il est vide le plan passe à la
 * suite.
 */
function CaptureBatch({
  suggestion,
  level,
}: {
  suggestion: Extract<Suggestion, { kind: "captures" }>;
  /** Niveau visé du plan : une capture cochée ici est tenue pour préparée. */
  level: number;
}) {
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Capturer un enclos : {suggestion.total} monture
          {suggestion.total > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-slate-500">
          à l’état sauvage, puis à faire évoluer ensemble
          {suggestion.remaining > 0 &&
            ` — encore ${suggestion.remaining} après ce lot`}
        </span>
      </p>
      <ul className="flex flex-wrap gap-2">
        {suggestion.entries.map((entry) => (
          <li
            key={entry.variety.id}
            className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950/40 px-2 py-1.5"
          >
            <span className="w-7 shrink-0 text-right text-sm tabular-nums text-slate-200">
              {entry.count}×
            </span>
            <VarietyLink variety={entry.variety} />
            <SexNeedLabel need={entry} />
            <SexAddButtons
              need={entry}
              onAdd={(sex) =>
                addMount({ variety: entry.variety.id, sex, level })
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * « Accoupler A et B → C », et le formulaire du résultat réel. Dans une
 * étape, les parents sont déjà sur leurs cartes juste au-dessus : on ne garde
 * que le bébé attendu (`withParents` à `false`).
 */
function BreedAction({
  cross,
  level,
  withParents = true,
}: {
  cross: Cross;
  level: number;
  withParents?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [a, b] = cross.parents;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Accoupler</span>
        {withParents && (
          <>
            {a.mount && <MountTag mount={a.mount} note={a.potential && <span className="text-[10px] text-sky-300">porte {a.variety.name}</span>} />}
            <span className="text-slate-600">et</span>
            {b.mount && <MountTag mount={b.mount} note={b.potential && <span className="text-[10px] text-sky-300">porte {b.variety.name}</span>} />}
          </>
        )}
        <span className="text-slate-600">→</span>
        <VarietyLink variety={cross.child.variety} />
        <span className="text-xs tabular-nums text-slate-400">
          {formatChance(cross.chance)} de génération{" "}
          {cross.child.variety.generation}
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${BUTTON} h-7 text-xs`}
          >
            <Icon.baby className="size-3.5" aria-hidden />
            Accoupler
          </button>
        )}
      </div>
      {open && (
        <BreedingForm
          cross={cross}
          level={level}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Après l'accouplement en jeu : la variété et le sexe du bébé, et l'étable fait
 * le reste. Le bébé arrive tenu pour préparé, au niveau visé du plan — sa
 * préparation était déjà dans le coût restant, elle en sort.
 */
function BreedingForm({
  cross,
  level,
  onClose,
}: {
  cross: Cross;
  level: number;
  onClose: () => void;
}) {
  const catalog = useCatalog();
  const [a, b] = cross.parents;
  const [variety, setVariety] = useState<number | null>(cross.child.variety.id);
  const [sex, setSex] = useState<Sex | null>(null);
  const options = catalog.mounts.varieties.filter(
    (candidate) => candidate.species === cross.child.variety.species,
  );
  if (!a.mount || !b.mount) return null;
  const father = a.mount.sex === "female" ? b.mount : a.mount;
  const mother = father === a.mount ? b.mount : a.mount;

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-950/40 p-2 text-xs text-slate-400"
      onSubmit={(event) => {
        event.preventDefault();
        if (variety === null) return;
        recordBreeding(father.id, mother.id, variety, sex, level, cross.child.variety.id);
        onClose();
      }}
    >
      <Icon.baby className="size-3.5" aria-hidden />
      Bébé obtenu :
      <VarietySelect
        value={variety}
        options={options}
        onChange={setVariety}
        placeholder="Variété…"
        ariaLabel="Variété du bébé"
        className={`${SELECT} min-w-44`}
      />
      <SexToggle value={sex} onChange={setSex} />
      <button
        type="submit"
        disabled={variety === null}
        className={`${BUTTON} h-7 text-xs`}
      >
        <Icon.done className="size-3.5" aria-hidden />
        Enregistrer
      </button>
      <button
        type="button"
        onClick={onClose}
        className="text-slate-500 hover:text-slate-300"
      >
        Annuler
      </button>
      <span className="basis-full text-slate-600">
        Les deux parents deviennent stériles — en trop, matière à clonage. Le
        bébé rejoint l’étable possédé et préparé, avec ses parents et
        grands-parents réels ; sa préparation sort du coût restant. S’il n’est
        pas la variété visée, il servira ailleurs ou au clonage.
      </span>
    </form>
  );
}

/** « Cloner X avec Y », et le formulaire du résultat réel. */
function CloneAction({ slot, clone }: { slot: Slot; clone: ClonePlan }) {
  const catalog = useCatalog();
  const [open, setOpen] = useState(false);
  const [survivor, setSurvivor] = useState<string>(clone.keep.id);
  const partnerVariety = catalog.mounts.byId.get(clone.partner.variety);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Cloner</span>
        <MountTag mount={clone.keep} />
        <span className="text-slate-600">avec</span>
        <MountTag mount={clone.partner} />
        {clone.sacrifice && (
          <span className="text-xs text-slate-500">
            la partenaire ne sert à rien d’autre
          </span>
        )}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`${BUTTON} h-7 text-xs`}
          >
            <Icon.cross className="size-3.5" aria-hidden />
            Cloner
          </button>
        )}
      </div>
      {open && (
        <form
          className="flex flex-wrap items-center gap-3 rounded border border-slate-800 bg-slate-950/40 p-2 text-xs text-slate-400"
          onSubmit={(event) => {
            event.preventDefault();
            recordClone(
              survivor,
              survivor === clone.keep.id ? clone.partner.id : clone.keep.id,
            );
            setOpen(false);
          }}
        >
          Survivante :
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="survivor"
              checked={survivor === clone.keep.id}
              onChange={() => setSurvivor(clone.keep.id)}
              className="accent-amber-500"
            />
            {slot.variety.name}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="survivor"
              checked={survivor === clone.partner.id}
              onChange={() => setSurvivor(clone.partner.id)}
              className="accent-amber-500"
            />
            {partnerVariety?.name ?? "partenaire"}
          </label>
          <button type="submit" className={`${BUTTON} h-7 text-xs`}>
            <Icon.done className="size-3.5" aria-hidden />
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-slate-500 hover:text-slate-300"
          >
            Annuler
          </button>
          <span className="basis-full text-slate-600">
            L’autre disparaît de l’étable. La survivante est possédée, jauges à
            zéro : leur remise à niveau reste dans le coût restant jusqu’à ce
            que vous la déclariez préparée.
          </span>
        </form>
      )}
    </div>
  );
}

// --- Coût --------------------------------------------------------------------------

function Costs({ cost }: { cost: ReturnType<typeof estimateCost> }) {
  const fuelMissing = cost.missing.some((line) =>
    line.startsWith("Aucun carburant"),
  );
  return (
    <div className="space-y-2 rounded-lg border border-slate-800 p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums text-slate-100">
          {cost.complete ? (
            <Kamas value={cost.total} />
          ) : (
            <span className="text-base text-amber-500/80">coût incomplet</span>
          )}
        </span>
        {cost.complete && cost.meanTotal !== null && (
          <Tooltip
            content="Le même coût avec 1 / chance sans arrondi : un ordre de grandeur, là où le nombre probable arrondit chaque croisement à l’entier"
            className="cursor-help text-sm tabular-nums text-slate-400"
          >
            ≈ <Kamas value={cost.meanTotal} /> en moyenne
          </Tooltip>
        )}
        <span className="text-xs text-slate-500">
          {Math.round(cost.points).toLocaleString("fr-FR")} points de jauge à
          verser, par enclos de 10 montures, au carburant le moins cher de
          chaque jauge
        </span>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-300">
          Détail
        </summary>
        <table className="mt-2 w-full">
          <tbody className="text-slate-300">
            {cost.lines.map((line) => (
              <tr key={line.label} className="border-t border-slate-800/60">
                <td className="py-1.5">
                  {line.label}
                  <span className="block text-[11px] text-slate-600">
                    {line.detail}
                  </span>
                </td>
                <td className="py-1.5 text-right align-top">
                  {line.amount === null ? (
                    <span className="text-amber-500/80">incomplet</span>
                  ) : (
                    <Kamas value={line.amount} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-600">
          Une monture possédée est tenue pour préparée et ne coûte plus rien. Ni
          tentatives moyennes ni branches à refaire : ce chiffre est ce qu’il
          reste probablement à fabriquer, et bouge à chaque résultat réel.
        </p>
      </details>
      {!cost.complete && (
        <div className="space-y-1 text-xs">
          <ul className="list-disc space-y-0.5 pl-5 text-slate-500">
            {cost.missing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {fuelMissing && (
            <p className="text-slate-500">
              Les carburants se relèvent sur le{" "}
              <Link
                to={DASHBOARDS[0]!.to}
                className="text-amber-400 hover:text-amber-300"
              >
                tableau de bord des carburants
              </Link>
              .
            </p>
          )}
          {cost.unpriced.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3">
              <Link
                to={`/item/${item.id}`}
                data-item-name={item.name}
                className="flex min-w-0 items-center gap-2 text-slate-300 hover:text-amber-400"
              >
                <ItemIcon item={item} size={20} />
                <span className="truncate">{item.name}</span>
              </Link>
              <PriceField itemId={item.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Les croisements ------------------------------------------------------------------

function Step({
  planId,
  cross,
  evaluation,
  level,
  probable,
}: {
  planId: string;
  cross: Cross;
  evaluation: Evaluation;
  level: number;
  probable: boolean;
}) {
  const [a, b] = cross.parents;
  const [open, setOpen] = useState(false);
  const suggested =
    evaluation.suggestion.kind === "breeds" &&
    evaluation.suggestion.crosses.includes(cross);
  const odds = [
    `≈ ${formatAttempts(Math.round(meanAttempts(cross.chance) * 10) / 10)} tentatives en moyenne`,
    ...CONFIDENCE_LEVELS.map(
      (confidence) =>
        `${formatChance(confidence)} de chances : ${formatAttempts(attemptsFor(cross.chance, confidence))}`,
    ),
  ].join(" · ");

  return (
    <li
      className={`rounded-lg border ${suggested ? "border-amber-500/40" : "border-slate-800"}`}
    >
      {/* Une ligne, rien à ouvrir : ce qu'on a, ce qu'il manque, ce que ça
          donne, et le bouton quand c'est possible. Les montures se déclarent
          dans l'étable ou depuis la suggestion, pas ici. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">
          {cross.step}.
        </span>
        <StepCircle cross={cross} />
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <ParentSummary slot={a} />
          <span className="text-slate-600">+</span>
          <ParentSummary slot={b} />
          <span className="text-slate-600">→</span>
          <VarietyLink variety={cross.child.variety} />
          {!cross.exact && (
            <Tooltip
              content={`D’après les parents des deux montures, plusieurs variétés de génération ${cross.child.variety.generation} peuvent naître : ${cross.possibleTargets.map((candidate) => candidate.name).join(", ")}. Le jeu ne publie pas leur répartition.`}
              className="flex cursor-help items-center text-amber-500/80"
            >
              <Icon.warning className="size-3.5" aria-hidden />
            </Tooltip>
          )}
          {cross.recipeCount > 1 && (
            <RecipeSelect planId={planId} cross={cross} />
          )}
        </span>
        <span className="ml-auto flex items-center gap-3 text-xs tabular-nums text-slate-500">
          <Tooltip
            content={`${
              cross.chanceFromMounts
                ? "Chance de la génération cible, sur les niveaux des montures en place"
                : "Chance de la génération cible, au niveau visé du plan"
            }. ${odds}.`}
            className="flex cursor-help items-center gap-1"
          >
            <Icon.chance className="size-3.5" aria-hidden />
            {formatChance(cross.chance)}
          </Tooltip>
          {probable && (
            <Tooltip
              content={`1 / ${formatChance(cross.chance)} arrondi : ${plannedAttempts(cross.chance)} tentative${plannedAttempts(cross.chance) > 1 ? "s" : ""} à prévoir, autant de couples`}
              className="flex cursor-help items-center gap-1"
            >
              <Icon.attempts className="size-3.5" aria-hidden />×
              {evaluation.needs.get(cross.path)?.attempts ?? 0}
            </Tooltip>
          )}
          {cross.state === "ready" && !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`${BUTTON} h-7 text-xs`}
            >
              <Icon.baby className="size-3.5" aria-hidden />
              Accoupler
            </button>
          )}
        </span>
      </div>
      {open && cross.state === "ready" && (
        <div className="border-t border-slate-800/60 px-3 py-2">
          <BreedingForm cross={cross} level={level} onClose={() => setOpen(false)} />
        </div>
      )}
    </li>
  );
}

/**
 * Une monture déjà obtenue, à la place du croisement qui l'aurait produite :
 * sa recette, un cercle vert, et la monture elle-même.
 */
/**
 * Une entrée du journal, à sa couche : l'accouplement ou le clonage tel qu'il
 * a eu lieu, ce qu'il visait, ce qu'il a donné — et la monture si elle est
 * encore là. La branche a beau avoir disparu du plan recalculé, l'histoire
 * reste sous les yeux.
 */
function HistoryStep({ event, stable }: { event: JournalEvent; stable: readonly StableMount[] }) {
  const catalog = useCatalog();
  const variety = (id: number) => catalog.mounts.byId.get(id);
  const living = (snap: MountSnapshot) => stable.find((mount) => mount.id === snap.id);
  const chip = (snap: MountSnapshot) => {
    const mount = living(snap);
    if (mount) return <MountTag mount={mount} />;
    const v = variety(snap.variety);
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500">
        {v && <VarietyLink variety={v} className="text-slate-500" />}
        <SexGlyph sex={snap.sex} className="size-3" />
      </span>
    );
  };

  const baby = event.kind === "breeding" ? variety(event.baby.variety) : variety(event.survivor.variety);
  const intended = event.kind === "breeding" && event.intended !== null ? variety(event.intended) : undefined;
  const missed = event.kind === "breeding" && intended && intended.id !== event.baby.variety;
  const father = event.kind === "breeding" ? variety(event.father.variety) : variety(event.lost.variety);
  const mother = event.kind === "breeding" ? variety(event.mother.variety) : variety(event.survivor.variety);

  return (
    <li className="rounded-lg border border-slate-800/60 bg-slate-900/20">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm text-slate-500">
        <span className="w-6 shrink-0 text-right text-xs text-slate-600">✓</span>
        <StepCircle cross={null} done />
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {event.kind === "clone" && <span className="text-xs text-sky-300">clonage</span>}
          {father && <VarietyLink variety={father} className="text-slate-500" />}
          <span className="text-slate-700">{event.kind === "breeding" ? "+" : "avec"}</span>
          {mother && <VarietyLink variety={mother} className="text-slate-500" />}
          <span className="text-slate-700">→</span>
          {baby && <VarietyLink variety={baby} className={missed ? "text-amber-300" : ""} />}
          {missed && intended && (
            <Tooltip
              content={`Le croisement visait ${intended.name} : ce bébé n’est pas celui attendu, mais il porte les gènes de ses parents`}
              className="cursor-help text-[10px] text-amber-500/80"
            >
              visait {intended.name}
            </Tooltip>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {chip(event.kind === "breeding" ? event.baby : event.survivor)}
          <span className="text-[11px] text-slate-600">{formatRelativeDate(event.at)}</span>
          <Tooltip content="Retirer du journal (l’étable ne change pas)">
            <button
              type="button"
              onClick={() => forgetEvent(event.id)}
              aria-label="Retirer du journal"
              className="text-slate-700 hover:text-rose-400"
            >
              <Icon.delete className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
        </span>
      </div>
    </li>
  );
}

function DoneStep({ slot, recipe }: { slot: Slot; recipe: number }) {
  const catalog = useCatalog();
  const pair = slot.variety.recipes[Math.min(recipe, slot.variety.recipes.length - 1)];
  const parents = pair
    ? pair.map((id) => catalog.mounts.byId.get(id)).filter((v) => v !== undefined)
    : [];
  return (
    <li className="rounded-lg border border-slate-800/60 bg-slate-900/20">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm text-slate-500">
        <span className="w-6 shrink-0 text-right text-xs text-slate-600">✓</span>
        <StepCircle cross={null} done />
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {parents.map((parent, index) => (
            <Fragment key={parent.id}>
              {index > 0 && <span className="text-slate-700">+</span>}
              <VarietyLink variety={parent} className="text-slate-500" />
            </Fragment>
          ))}
          <span className="text-slate-700">→</span>
          <VarietyLink variety={slot.variety} />
        </span>
        {slot.mount && <MountTag mount={slot.mount} className="ml-auto" />}
      </div>
    </li>
  );
}

/**
 * Un parent dans le résumé d'une étape : la monture avec tout ce qu'on en
 * sait quand elle est là, la simple recette quand elle manque — c'est la
 * nudité de la recette qui dit le manque, pas une étiquette.
 */
function ParentSummary({ slot }: { slot: Slot }) {
  if (!slot.mount) return <VarietyLink variety={slot.variety} />;
  return (
    <MountTag
      mount={slot.mount}
      note={
        slot.potential && (
          <Tooltip
            content={`Née de ${slot.variety.name} : elle en porte les gènes et peut le donner — seconde chance`}
            className="cursor-help text-[10px] text-sky-300"
          >
            porte {slot.variety.name}
          </Tooltip>
        )
      }
    />
  );
}


function RecipeSelect({ planId, cross }: { planId: string; cross: Cross }) {
  const catalog = useCatalog();
  return (
    <select
      value={cross.recipeIndex}
      onChange={(event) =>
        chooseRecipe(planId, cross.path, Number(event.target.value))
      }
      className={SELECT}
    >
      {cross.child.variety.recipes.map(([first, second], index) => (
        <option key={index} value={index}>
          {index + 1}. {catalog.mounts.byId.get(first)?.name ?? first} +{" "}
          {catalog.mounts.byId.get(second)?.name ?? second}
        </option>
      ))}
    </select>
  );
}

