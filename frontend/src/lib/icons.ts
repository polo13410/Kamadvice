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
  ChevronDown,
  ChevronsUp,
  CircleAlert,
  Coins,
  Fuel,
  Gauge,
  Hammer,
  History,
  ImageOff,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Minus,
  Package,
  PackageCheck,
  RotateCcw,
  Ruler,
  Scale,
  ScrollText,
  Search,
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
  /** Identité de l'app : peser achat contre craft. */
  app: Scale,
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

  // Métier
  recipe: ScrollText,
  craft: Hammer,
  price: Coins,
  usedIn: Boxes,
  history: History,
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

  // Actions
  delete: Trash2,

  // Tri
  sortAsc: ArrowUp,
  sortDesc: ArrowDown,
  /** Annuler un tri et revenir au classement par défaut. */
  sortReset: RotateCcw,
} as const
