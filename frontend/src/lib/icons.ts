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
  ChevronsUp,
  CircleAlert,
  Coins,
  Hammer,
  History,
  ImageOff,
  Layers3,
  LoaderCircle,
  Minus,
  Package,
  PackageCheck,
  Scale,
  ScrollText,
  Search,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Weight,
} from 'lucide-react'

export const Icon = {
  /** Identité de l'app : peser achat contre craft. */
  app: Scale,
  back: ArrowLeft,

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
} as const
