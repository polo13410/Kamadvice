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
import { BUTTON, FIELD_TABLE } from "../components/Adorned";
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
  VarietyIconPicker,
} from "../components/MountVariety";
import NotFound from "../components/NotFound";
import NumberInput from "../components/NumberInput";
import PriceField from "../components/PriceField";
import StablePanel, { mountAnchor } from "../components/StablePanel";
import { Tooltip } from "../components/Tooltip";
import { setBreederLevel, useBreederLevel } from "../data/breeder";
import { useCatalog } from "../data/catalogContext";
import { useIgnored } from "../data/ignored";
import {
  addMount,
  forgetEvent,
  prepareMount,
  recordBreeding,
  recordClone,
  updateMount,
  useJournal,
  useStable,
  type JournalEvent,
  type MountSnapshot,
} from "../data/inventory";
import { FEED_EXTRACT_NAME, varietyName } from "../data/mounts";
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
  enclosuresFor,
  estimateCost,
  estimateTime,
  evaluatePlan,
  meanAttempts,
  plannedAttempts,
  possibleOffspring,
  theoreticalPlan,
  type ClonePlan,
  type Cross,
  type Evaluation,
  type Plan,
  type Sex,
  type Slot,
  type StableMount,
  type Suggestion,
  type TimeEstimate,
} from "../domain/breeding";
import type { Catalog } from "../domain/types";
import {
  formatAttempts,
  formatChance,
  formatDuration,
  formatRelativeDate,
} from "../lib/format";
import { Icon } from "../lib/icons";
import { BREEDING_PATH, DASHBOARDS } from "../lib/pages";

const SELECT = `${FIELD_TABLE} w-auto text-left`;

export default function PlanPage() {
  const { planId } = useParams();
  const stored = usePlan(planId);
  const catalog = useCatalog();
  // Le niveau d'éleveur est celui du joueur, pas du plan : il vient du
  // navigateur et se pose dans les réglages au moment d'évaluer.
  const breederLevel = useBreederLevel();
  const plan = useMemo(
    () =>
      stored && { ...stored, settings: { ...stored.settings, breederLevel } },
    [breederLevel, stored],
  );
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
  const feedExtract = useMemo(
    () => catalog.items.find((item) => item.name === FEED_EXTRACT_NAME),
    [catalog.items],
  );

  const evaluation = useMemo(
    () => evaluatePlan(catalog.mounts, plan, stable),
    [catalog.mounts, plan, stable],
  );
  const cost = useMemo(
    () => estimateCost(catalog, evaluation, plan.settings, prices, ignored),
    [catalog, evaluation, plan.settings, prices, ignored],
  );
  const time = useMemo(
    () => estimateTime(xp, evaluation, plan.settings),
    [xp, evaluation, plan.settings],
  );
  const toCapture = useMemo(() => captures(evaluation), [evaluation]);
  const ranks = useMemo(() => ancestorRows(evaluation), [evaluation]);
  /**
   * Les étapes : la liste complète des croisements de la recette théorique,
   * par couches et dans un ordre qui ne bouge pas. Chacune est ce que le
   * plan en fait aujourd'hui — à croiser, obtenue (cochée), à cloner, ou
   * plus nécessaire parce qu'une monture plus haut couvre la branche.
   */
  const steps = useMemo(() => {
    const theoretical = evaluatePlan(
      catalog.mounts,
      { ...theoreticalPlan(target.id, plan.settings), recipes: plan.recipes },
      [],
    );
    const byPath = new Map(evaluation.slots.map((slot) => [slot.path, slot]));
    type Entry =
      | {
          depth: number;
          path: string;
          number: number;
          kind: "cross";
          cross: Cross;
        }
      | {
          depth: number;
          path: string;
          number: number;
          kind: "owned";
          slot: Slot;
        }
      | {
          depth: number;
          path: string;
          number: number;
          kind: "clone";
          slot: Slot;
        }
      | {
          depth: number;
          path: string;
          number: number;
          kind: "covered";
          slot: Slot;
        };
    return theoretical.crosses.map((planned): Entry => {
      const base = {
        depth: planned.child.depth,
        path: planned.path,
        number: planned.step,
      };
      const slot = byPath.get(planned.path);
      if (slot?.cross) return { ...base, kind: "cross", cross: slot.cross };
      if (slot?.mount) return { ...base, kind: "owned", slot };
      if (slot?.clone) return { ...base, kind: "clone", slot };
      return { ...base, kind: "covered", slot: planned.child };
    });
  }, [catalog.mounts, evaluation, plan.recipes, plan.settings, target]);
  const history = useMemo(() => {
    const species = (id: number) => catalog.mounts.byId.get(id)?.species;
    return journal
      .filter(
        (event) =>
          species(
            event.kind === "breeding"
              ? event.baby.variety
              : event.survivor.variety,
          ) === target.species,
      )
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [catalog.mounts, journal, target]);
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
            l’enclos à chaque changement.
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
          {
            icon: Icon.time,
            label:
              time.mounts === 0
                ? "rien à préparer"
                : `${formatDuration(time.seconds)} de préparation`,
          },
        ]}
      >
        <Tooltip content="Oublie les recettes imposées à la main">
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
        <Tooltip content="Niveau auquel chaque parent est monté avant de reproduire : +0,15 % de chance par niveau.">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.level className="size-4" aria-hidden />
            Niveau cible des montures
            <NumberInput
              value={settings.targetLevel}
              min={1}
              max={200}
              onChange={(level) => setTargetLevel(plan.id, xp, level)}
              className="w-20"
              ariaLabel="Niveau cible des montures"
            />
          </label>
        </Tooltip>
        <Icon.linked className="size-4 shrink-0 text-slate-600" aria-hidden />
        <Tooltip content="Points de mangeoire versés à une monture pour être préparée à l'accouplement.">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            {feedExtract ? (
              <ItemIcon item={feedExtract} size={24} />
            ) : (
              <>
                <Icon.gauge className="size-4" aria-hidden />
                Mangeoire
              </>
            )}
            <NumberInput
              value={settings.feedPoints}
              format="grouped"
              onChange={(points) => setFeedPoints(plan.id, xp, points)}
              className="w-28"
              ariaLabel="Points de mangeoire"
            />
            <span className="text-xs text-slate-600">pts</span>
          </label>
        </Tooltip>
        <FilterDivider />
        <Tooltip content="Détermine le nombre d'enclos disponibles pour l'élevage">
          <label className="flex h-9 items-center gap-2 text-sm text-slate-400">
            <Icon.breeding className="size-4" aria-hidden />
            Niveau éleveur
            <NumberInput
              value={settings.breederLevel}
              min={1}
              max={200}
              onChange={setBreederLevel}
              className="w-20"
              ariaLabel="Niveau éleveur"
            />
            <span className="text-xs text-slate-600">
              {enclosuresFor(settings.breederLevel)} enclos
            </span>
          </label>
        </Tooltip>
        <FilterDivider />
        <FilterToggle
          icon={Icon.wizard}
          label="Optimakina"
          checked={settings.optimakina}
          onChange={(optimakina) => updateSettings(plan.id, { optimakina })}
          tip="Rajoute 10% de probabilité pour atteindre la génération cible sur tout les accouplements (prix basé sur l'optimakina la moins chere et superieure au niveau du croisement)"
        />
        <FilterDivider />
        <FilterToggle
          icon={Icon.attempts}
          label="Prendre en compte les probabilités"
          checked={settings.probable}
          onChange={(probable) => updateSettings(plan.id, { probable })}
          tip="Prend en compte les probabilités d'atteindre la génération cible dans les accouplements"
        />
      </FilterBar>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={Icon.cost} title="Coût et temps restants probables">
          <Costs cost={cost} time={time} />
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
                  {totalToCapture} monture
                  {totalToCapture > 1 ? "s " : " "}
                  en tout
                  {settings.probable
                    ? ` (≈ ${formatAttempts(Math.round(evaluation.meanCaptures * 10) / 10)})`
                    : ""}
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
                          addMount({ variety: entry.variety.id, sex })
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
                  Total
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
                                addMount({ variety: entry.variety.id, sex })
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

      <Section icon={Icon.cross} title="Étapes" note="">
        {steps.length === 0 ? (
          <p className="rounded-lg border border-slate-800 p-3 text-sm text-slate-500">
            Aucun croisement : tout s’obtient par capture.
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
                        : `${ancestorRank(entry.depth).toLowerCase()}`}
                    </li>
                  )}
                  {entry.kind === "cross" ? (
                    <Step
                      planId={plan.id}
                      cross={entry.cross}
                      evaluation={evaluation}
                      probable={settings.probable}
                    />
                  ) : entry.kind === "clone" ? (
                    <CloneStep number={entry.number} slot={entry.slot} />
                  ) : (
                    <DoneStep
                      number={entry.number}
                      slot={entry.slot}
                      recipe={plan.recipes[entry.path] ?? 0}
                      covered={entry.kind === "covered"}
                    />
                  )}
                </Fragment>
              );
            })}
          </ol>
        )}
      </Section>

      {history.length > 0 && (
        <details className="group rounded-lg border border-slate-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
            <Icon.next
              className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
              aria-hidden
            />
            <Icon.history className="size-4 shrink-0" aria-hidden />
            Journal
            <span className="font-normal normal-case tracking-normal text-slate-600">
              {history.length} accouplement{history.length > 1 ? "s" : ""} et
              clonage{history.length > 1 ? "s" : ""} enregistrés
            </span>
          </summary>
          <ol className="space-y-2 border-t border-slate-800/60 px-3 py-3">
            {history.map((event) => (
              <HistoryStep key={event.id} event={event} stable={stable} />
            ))}
          </ol>
        </details>
      )}

      <details className="group rounded-lg border border-slate-800">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
          <Icon.next
            className="size-3.5 shrink-0 text-slate-600 transition-transform group-open:rotate-90"
            aria-hidden
          />
          <Icon.mount className="size-4 shrink-0" aria-hidden />
          Enclos
          <span className="font-normal normal-case tracking-normal text-slate-600">
            {
              stable.filter(
                (mount) =>
                  catalog.mounts.byId.get(mount.variety)?.species ===
                  target.species,
              ).length
            }{" "}
            utiles
            {evaluation.surplus.length > 0 &&
              `, ${evaluation.surplus.length} en trop`}
          </span>
        </summary>
        <div className="border-t border-slate-800/60 px-3 py-3">
          <StablePanel
            mounts={stable}
            species={target.species}
            evaluation={evaluation}
            preparedLevel={settings.targetLevel}
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
  /** Niveau visé du plan : préparer une monture l'y monte. */
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
            <p className="text-xs text-slate-500">
              {suggestion.couples.length > 1
                ? `${suggestion.couples.length} couples préparés — enregistrez chaque résultat.`
                : "Un couple préparé — enregistrez le résultat."}
            </p>
            {suggestion.couples.map((couple) => (
              <BreedAction
                key={`${couple.cross.path}:${couple.parents[0].id}`}
                cross={couple.cross}
                parents={couple.parents}
              />
            ))}
            {suggestion.pending.length > 0 && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {suggestion.pending.length} monture
                {suggestion.pending.length > 1 ? "s" : ""} pas encore préparée
                {suggestion.pending.length > 1 ? "s" : ""} :
                <PrepareAll
                  mounts={suggestion.pending}
                  level={level}
                  label="préparer maintenant"
                />
              </p>
            )}
          </div>
        )}
        {suggestion.kind === "prepare" && (
          <PrepareBatch enclosures={suggestion.enclosures} level={level} />
        )}
        {suggestion.kind === "clones" && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              {suggestion.items.length > 1
                ? `${suggestion.items.length} clonages. `
                : ""}
              La survivante est tirée au sort et revient féconde, au niveau 1.
            </p>
            {suggestion.items.map((item) => (
              <CloneAction
                key={item.slot.path}
                slot={item.slot}
                clone={item.clone}
              />
            ))}
          </div>
        )}
        {suggestion.kind === "captures" && (
          <CaptureBatch suggestion={suggestion} />
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

/** Marque préparées toutes ces montures d'un coup, montées au niveau visé. */
function PrepareAll({
  mounts,
  level,
  label,
}: {
  mounts: readonly StableMount[];
  level: number;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        for (const mount of mounts) prepareMount(mount.id, level);
      }}
      className={`${BUTTON} h-7 text-xs`}
    >
      <Icon.done className="size-3.5" aria-hidden />
      {label}
    </button>
  );
}

/**
 * Les enclos à préparer : les montures fécondes du plan dont les jauges sont
 * à faire — captures, bébés, survivantes de clonage —, dix par enclos. Une à
 * une, ou toutes.
 */
function PrepareBatch({
  enclosures,
  level,
}: {
  enclosures: readonly (readonly StableMount[])[];
  level: number;
}) {
  const mounts = enclosures.flat();
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Préparer{" "}
          {enclosures.length > 1 ? `${enclosures.length} enclos` : "l’enclos"} :{" "}
          {mounts.length} monture{mounts.length > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-slate-500">
          mangeoire jusqu’au niveau {level}, puis les trois jauges
        </span>
        <PrepareAll mounts={mounts} level={level} label="Toutes préparées" />
      </p>
      {enclosures.map((group, index) => (
        <div key={index} className="space-y-1">
          {enclosures.length > 1 && (
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Enclos {index + 1}
            </p>
          )}
          <ul className="flex flex-wrap gap-2">
            {group.map((mount) => (
              <li key={mount.id} className="flex items-center gap-2">
                <MountTag mount={mount} />
                <button
                  type="button"
                  onClick={() => prepareMount(mount.id, level)}
                  className={`${BUTTON} h-7 text-xs`}
                >
                  <Icon.done className="size-3.5" aria-hidden />
                  Préparée
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Un lot de captures : de quoi porter à cinq les couples possibles, à
 * ajouter au compte-gouttes — chaque ajout recalcule le lot, les sexes
 * demandés avec, et quand il est vide le plan passe à la suite. Un sexe
 * n'est imposé que si une monture d'en face attend un partenaire.
 */
function CaptureBatch({
  suggestion,
}: {
  suggestion: Extract<Suggestion, { kind: "captures" }>;
}) {
  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          Capturer {suggestion.total} monture
          {suggestion.total > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-slate-500">
          pour {suggestion.target} couples
          {suggestion.couples > 0
            ? ` (${suggestion.couples} déjà possible${suggestion.couples > 1 ? "s" : ""})`
            : ""}
          {suggestion.remaining > 0 &&
            ` — ${suggestion.remaining} de plus ensuite`}
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
              onAdd={(sex) => addMount({ variety: entry.variety.id, sex })}
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
  parents,
  withParents = true,
}: {
  cross: Cross;
  /** Le couple précis : les montures en place du croisement, ou une paire de leur réserve. */
  parents?: [StableMount, StableMount];
  withParents?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [a, b] = cross.parents;
  const couple =
    parents ?? (a.mount && b.mount ? ([a.mount, b.mount] as const) : null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Accoupler</span>
        {withParents && couple && (
          <>
            <MountTag
              mount={couple[0]}
              note={
                a.potential && (
                  <span className="text-[10px] text-sky-300">
                    porte {a.variety.name}
                  </span>
                )
              }
            />
            <span className="text-slate-600">et</span>
            <MountTag
              mount={couple[1]}
              note={
                b.potential && (
                  <span className="text-[10px] text-sky-300">
                    porte {b.variety.name}
                  </span>
                )
              }
            />
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
      {open && couple && (
        <BreedingForm
          cross={cross}
          parents={couple}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Après l'accouplement en jeu : la variété et le sexe du bébé, et l'étable fait
 * le reste. Le bébé arrive au niveau 1, à préparer avec le prochain enclos.
 */
function BreedingForm({
  cross,
  parents,
  onClose,
}: {
  cross: Cross;
  parents: readonly [StableMount, StableMount];
  onClose: () => void;
}) {
  const catalog = useCatalog();
  const [a, b] = parents;
  const [variety, setVariety] = useState<number | null>(cross.child.variety.id);
  const [sex, setSex] = useState<Sex | null>(null);
  // Ce que le couple peut donner, d'après les deux arbres : la génération
  // visée d'abord, puis ce qui naît en dessous. « Autre » déplie toute
  // l'espèce, au cas où le jeu surprendrait.
  const [all, setAll] = useState(false);
  const possible = useMemo(
    () => possibleOffspring(catalog.mounts, parents),
    [catalog.mounts, parents],
  );
  const targeted = possible.filter(
    (candidate) => candidate.generation === cross.child.variety.generation,
  );
  const others = possible.filter(
    (candidate) => candidate.generation !== cross.child.variety.generation,
  );
  const species = catalog.mounts.varieties.filter(
    (candidate) => candidate.species === cross.child.variety.species,
  );
  const chosen =
    variety === null ? undefined : catalog.mounts.byId.get(variety);
  const father = a.sex === "female" ? b : a;
  const mother = father === a ? b : a;

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-950/40 p-2 text-xs text-slate-400"
      onSubmit={(event) => {
        event.preventDefault();
        if (variety === null) return;
        recordBreeding(
          father.id,
          mother.id,
          variety,
          sex,
          1,
          cross.child.variety.id,
        );
        onClose();
      }}
    >
      <Icon.baby className="size-3.5" aria-hidden />
      Bébé obtenu :
      {all ? (
        <VarietyIconPicker
          value={variety}
          options={species}
          onChange={setVariety}
          size={24}
        />
      ) : (
        <>
          <VarietyIconPicker
            value={variety}
            options={targeted}
            onChange={setVariety}
          />
          {others.length > 0 && (
            <>
              <span className="h-5 w-px bg-slate-700" aria-hidden />
              <VarietyIconPicker
                value={variety}
                options={others}
                onChange={setVariety}
                size={22}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => setAll(true)}
            className="text-slate-500 hover:text-slate-300"
          >
            autre…
          </button>
        </>
      )}
      {chosen && (
        <span className="inline-flex items-center gap-1.5 text-slate-200">
          {chosen.name}
          <span className="text-slate-500">G{chosen.generation}</span>
        </span>
      )}
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
        {all
          ? "Toute l’espèce. "
          : `${possible.length} sortie${possible.length > 1 ? "s" : ""} possible${possible.length > 1 ? "s" : ""} d’après les deux arbres. `}
        Les parents deviennent stériles ; le bébé arrive au niveau 1, à
        préparer.
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
            L’autre disparaît ; la survivante redevient féconde, au niveau 1, à
            préparer.
          </span>
        </form>
      )}
    </div>
  );
}

// --- Coût --------------------------------------------------------------------------

function Costs({
  cost,
  time,
}: {
  cost: ReturnType<typeof estimateCost>;
  time: TimeEstimate;
}) {
  const fuelMissing = cost.missing.some((line) =>
    line.startsWith("Aucun carburant"),
  );
  const waves = time.waves
    .map(
      (wave) =>
        `${wave.mounts} monture${wave.mounts > 1 ? "s" : ""} en ${formatDuration(wave.seconds)}`,
    )
    .join(",\n");
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
            content="Avec 1 / chance sans arrondi"
            className="cursor-help text-sm tabular-nums text-slate-400"
          >
            ≈ <Kamas value={cost.meanTotal} /> en moyenne
          </Tooltip>
        )}
        {time.mounts > 0 && (
          <Tooltip
            content={`${time.mounts} monture${time.mounts > 1 ? "s" : ""} à préparer en ${time.waves.length} vague${time.waves.length > 1 ? "s" : ""} dans ${time.enclosures} enclos :\n ${waves}.`}
            className="inline-flex cursor-help items-center gap-1 text-xl font-semibold tabular-nums text-slate-300"
          >
            <Icon.time className="size-4 text-slate-500" aria-hidden />
            {formatDuration(time.seconds)}
          </Tooltip>
        )}
        <span className="text-xs text-slate-500">
          {Math.round(cost.points).toLocaleString("fr-FR")} points de jauge à
          verser, au carburant le moins cher
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
  probable,
}: {
  planId: string;
  cross: Cross;
  evaluation: Evaluation;
  probable: boolean;
}) {
  const [a, b] = cross.parents;
  const [open, setOpen] = useState(false);
  const suggested =
    evaluation.suggestion.kind === "breeds" &&
    evaluation.suggestion.couples.some((couple) => couple.cross === cross);
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
              content={`Plusieurs variétés de génération ${cross.child.variety.generation} possibles : ${cross.possibleTargets.map((candidate) => candidate.name).join(", ")}`}
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
            content={`Chance de la génération cible${cross.chanceFromMounts ? "" : ", au niveau cible"} — ${odds}`}
            className="flex cursor-help items-center gap-1"
          >
            <Icon.chance className="size-3.5" aria-hidden />
            {formatChance(cross.chance)}
          </Tooltip>
          {probable && (
            <Tooltip
              content={`${plannedAttempts(cross.chance)} couple${plannedAttempts(cross.chance) > 1 ? "s" : ""} à prévoir (1 / chance, arrondi)`}
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
      {open && cross.state === "ready" && a.mount && b.mount && (
        <div className="border-t border-slate-800/60 px-3 py-2">
          <BreedingForm
            cross={cross}
            parents={[a.mount, b.mount]}
            onClose={() => setOpen(false)}
          />
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
function HistoryStep({
  event,
  stable,
}: {
  event: JournalEvent;
  stable: readonly StableMount[];
}) {
  const catalog = useCatalog();
  const variety = (id: number) => catalog.mounts.byId.get(id);
  const living = (snap: MountSnapshot) =>
    stable.find((mount) => mount.id === snap.id);
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

  const baby =
    event.kind === "breeding"
      ? variety(event.baby.variety)
      : variety(event.survivor.variety);
  const intended =
    event.kind === "breeding" && event.intended !== null
      ? variety(event.intended)
      : undefined;
  const missed =
    event.kind === "breeding" && intended && intended.id !== event.baby.variety;
  const father =
    event.kind === "breeding"
      ? variety(event.father.variety)
      : variety(event.lost.variety);
  const mother =
    event.kind === "breeding"
      ? variety(event.mother.variety)
      : variety(event.survivor.variety);

  return (
    <li className="rounded-lg border border-slate-800/60 bg-slate-900/20">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm text-slate-500">
        <span className="w-6 shrink-0 text-right text-xs text-slate-600">
          ✓
        </span>
        <StepCircle cross={null} done />
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {event.kind === "clone" && (
            <span className="text-xs text-sky-300">clonage</span>
          )}
          {father && (
            <VarietyLink variety={father} className="text-slate-500" />
          )}
          <span className="text-slate-700">
            {event.kind === "breeding" ? "+" : "avec"}
          </span>
          {mother && (
            <VarietyLink variety={mother} className="text-slate-500" />
          )}
          <span className="text-slate-700">→</span>
          {baby && (
            <VarietyLink
              variety={baby}
              className={missed ? "text-amber-300" : ""}
            />
          )}
          {missed && intended && (
            <Tooltip
              content={`Le croisement visait ${intended.name}`}
              className="cursor-help text-[10px] text-amber-500/80"
            >
              visait {intended.name}
            </Tooltip>
          )}
        </span>
        <span className="ml-auto flex items-center gap-3">
          {chip(event.kind === "breeding" ? event.baby : event.survivor)}
          <span className="text-[11px] text-slate-600">
            {formatRelativeDate(event.at)}
          </span>
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

/**
 * Une étape cochée : la monture est à l'étable — ou, `covered`, une monture
 * plus haut dans l'arbre rend la branche inutile.
 */
function DoneStep({
  number,
  slot,
  recipe,
  covered = false,
}: {
  number: number;
  slot: Slot;
  recipe: number;
  covered?: boolean;
}) {
  const catalog = useCatalog();
  const pair =
    slot.variety.recipes[Math.min(recipe, slot.variety.recipes.length - 1)];
  const parents = pair
    ? pair
        .map((id) => catalog.mounts.byId.get(id))
        .filter((v) => v !== undefined)
    : [];
  return (
    <li
      className={`rounded-lg border border-slate-800/60 bg-slate-900/20 ${covered ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm text-slate-500">
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-600">
          {number}.
        </span>
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
        {covered && (
          <span className="ml-auto text-xs text-slate-600">
            couverte par une monture plus haut
          </span>
        )}
      </div>
    </li>
  );
}

/** Une étape que le plan règle par un clonage plutôt qu'un croisement. */
function CloneStep({ number, slot }: { number: number; slot: Slot }) {
  return (
    <li className="rounded-lg border border-slate-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">
          {number}.
        </span>
        <Icon.duplicate className="size-4 shrink-0 text-sky-400" aria-hidden />
        <span className="text-xs text-slate-500">Par clonage :</span>
        {slot.clone && <CloneAction slot={slot} clone={slot.clone} />}
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
            content={`Née de ${slot.variety.name} : peut le donner à nouveau`}
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
