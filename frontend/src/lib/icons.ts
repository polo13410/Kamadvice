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
  Boxes,
  Check,
  ChevronDown,
  ChevronsUp,
  Clock,
  CircleAlert,
  CircleSlash,
  Coins,
  Compass,
  Filter,
  Fuel,
  Gauge,
  Hammer,
  Heart,
  History,
  ImageOff,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Minus,
  Package,
  PackageCheck,
  PackageX,
  RotateCcw,
  Ruler,
  ScrollText,
  Search,
  Share2,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Weight,
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
  /** Calibre d'un extrait, du minuscule au gigantesque. */
  size: Ruler,
  /** Points de jauge rendus par un extrait. */
  points: Zap,
  /** Palier de jauge à atteindre pour maxer. */
  target: Target,
  /** Meilleure option de son groupe. */
  best: Trophy,

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
  /** Copier le lien de la page courante. */
  share: Share2,
  /** Action accomplie, le temps qu'on s'en aperçoive. */
  done: Check,

  // Tri
  sortAsc: ArrowUp,
  sortDesc: ArrowDown,
  /** Annuler un tri et revenir au classement par défaut. */
  sortReset: RotateCcw,
} as const
