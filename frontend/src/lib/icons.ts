/**
 * Vocabulaire d'icônes de l'app.
 *
 * Passer par cette table plutôt que d'importer Lucide directement dans chaque
 * vue garantit qu'un même concept — un craft, un prix, une recette — porte la
 * même icône partout, et permet d'en changer une en un seul endroit.
 *
 * Usage : `<Icon.craft className="size-4" />`
 */
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpToLine,
  Baby,
  Ban,
  Boxes,
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Copy,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CircleAlert,
  CircleSlash,
  Coins,
  Compass,
  Dices,
  Dna,
  Egg,
  Filter,
  FlaskConical,
  Fuel,
  Gauge,
  GitFork,
  Hammer,
  Heart,
  HeartOff,
  History,
  ImageOff,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Mars,
  Milestone,
  Minus,
  Package,
  PackageCheck,
  PackageX,
  PawPrint,
  Pin,
  PinOff,
  Plus,
  Radio,
  Receipt,
  Repeat,
  RotateCcw,
  Ruler,
  ScrollText,
  Search,
  Share2,
  SkipForward,
  SlidersHorizontal,
  Store,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Users,
  Venus,
  WandSparkles,
  Weight,
  X,
  Zap,
} from 'lucide-react'

export const Icon = {
  back: ArrowLeft,
  /** Ouverture d'un menu déroulant. */
  dropdown: ChevronDown,

  // Catalogue
  item: Package,
  category: Layers3,
  type: Tag,
  level: ChevronsUp,
  pods: Weight,
  search: Search,
  /** Restriction posée sur une liste. */
  filter: Filter,

  // Métier
  recipe: ScrollText,
  craft: Hammer,
  price: Coins,
  usedIn: Boxes,
  history: History,
  /** Instant d'un relevé, par opposition à son journal. */
  time: Clock,
  /** Item épinglé par l'utilisateur. Rempli quand il l'est, vide sinon. */
  favorite: Heart,
  /** Ingrédient déjà en stock, écarté du coût. */
  inStock: PackageCheck,

  // Tableaux de bord (carburants d'enclos)
  /** Un tableau de bord de l'app. */
  dashboard: LayoutDashboard,
  /** Carburant d'enclos : les extraits. */
  fuel: Fuel,
  /** Jauge d'enclos à remplir : mangeoire, abreuvoir, dragofesse… */
  gauge: Gauge,
  /** Calibre d'un carburant, du minuscule au gigantesque. */
  size: Ruler,
  /** Famille d'un carburant : extrait, philtre, potion, élixir. */
  family: FlaskConical,
  /** Plafond de jauge au-delà duquel un carburant ne remplit plus. */
  cap: ArrowUpToLine,
  /** Un métier du joueur, et son niveau. */
  job: Briefcase,
  /** Points de jauge rendus par un carburant. */
  points: Zap,
  /** Palier de jauge à atteindre pour maxer. */
  target: Target,
  /** Meilleure option de son groupe. */
  best: Trophy,

  // Élevage des montures
  /** Le tableau de bord d'élevage : un plan, un œuf à couver. */
  breeding: Egg,
  /** Une monture, quelle que soit l'espèce. */
  mount: PawPrint,
  /** Généalogie d'une variété : parents et ancêtres. */
  genealogy: Dna,
  /** Un croisement : deux parents, un bébé. */
  cross: GitFork,
  /** Génération d'une variété. */
  generation: Milestone,
  /** Sexe d'une monture. */
  male: Mars,
  female: Venus,
  /** Bébé obtenu d'un croisement. */
  baby: Baby,
  /** Probabilité, tentatives : ce qui dépend du hasard. */
  chance: Dices,
  /** Nombre de tentatives. */
  attempts: Repeat,
  /** Un plan sauvegardé. */
  plan: ClipboardList,
  /** Réglages d'un plan : niveau visé, points, makina. */
  settings: SlidersHorizontal,
  /** Coût total d'un plan. */
  cost: Receipt,
  /** Étape faite / prête / en cours / en attente / bloquée. */
  stepDone: CircleCheck,
  stepReady: CircleCheck,
  stepProgress: CircleDot,
  stepWaiting: CircleDashed,
  stepBlocked: Ban,
  /** Monture stérile : elle a déjà reproduit. */
  sterile: HeartOff,
  /** Ajouter : un plan, une monture. */
  add: Plus,
  /** Dupliquer une monture de l'étable. */
  duplicate: Copy,

  // Fréquentation
  /** Navigateurs connectés en ce moment. */
  online: Radio,
  /** Navigateurs distincts passés sur l'app. */
  visitors: Users,

  // Variations de valeur
  gain: TrendingUp,
  loss: TrendingDown,
  flat: Minus,

  // États
  loading: LoaderCircle,
  error: CircleAlert,
  warning: TriangleAlert,
  missingImage: ImageOff,
  /** Valeur sans objet : elle n'existe pas, elle n'est pas seulement inconnue. */
  none: CircleSlash,
  /** Adresse qui ne mène à rien : on est perdu, pas en panne. */
  notFound: Compass,
  /** Identifiant d'item absent du catalogue. */
  missingItem: PackageX,

  // Actions
  delete: Trash2,
  /** Épingler un écran : il remonte en tête de sa liste. Rempli quand il l'est. */
  pin: Pin,
  unpin: PinOff,
  /** Copier le lien de la page courante. */
  share: Share2,
  /** Action accomplie, le temps qu'on s'en aperçoive. */
  done: Check,
  /** Fermer une fenêtre. */
  close: X,

  // Remplissage assisté des prix
  /** L'assistant lui-même : il fait le tour des prix pour vous. */
  wizard: WandSparkles,
  /** Un hôtel de vente, là où on relève les prix. */
  hdv: Store,
  /** Étape précédente / suivante. */
  previous: ChevronLeft,
  next: ChevronRight,
  /** Passer un prix sans le saisir. */
  skip: SkipForward,
  /** Nom copié dans le presse-papiers. */
  copied: ClipboardCheck,

  // Tri
  sortAsc: ArrowUp,
  sortDesc: ArrowDown,
  /** Annuler un tri et revenir au classement par défaut. */
  sortReset: RotateCcw,
} as const
