/**
 * Les métiers qui fabriquent quelque chose, en cartes : un clic ouvre le
 * tableau de bord du métier.
 *
 * Seuls les métiers producteurs sont là — les *mages modifient sans fabriquer,
 * ils n'auraient aucune ligne à montrer. « Base » est le métier de personne :
 * ce sont les recettes que tout le monde peut faire.
 */
import { Link } from 'react-router-dom'
import JobIcon from '../components/JobIcon'
import { useCatalog } from '../data/catalogContext'
import type { Job } from '../domain/types'
import { Icon } from '../lib/icons'
import { jobPath } from '../lib/pages'

export default function JobsPage() {
  const catalog = useCatalog()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
          <Icon.job className="size-5 shrink-0 text-amber-400" aria-hidden />
          Métiers
        </h1>
        <p className="text-sm text-slate-500">
          Un tableau de bord par métier : chaque recette face à son prix HDV, filtrable par
          niveau, type, coût et nombre d'ingrédients.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {catalog.jobs.map((job) => (
          <JobCard key={job.id} job={job} count={catalog.recipesByJob.get(job.id)?.length ?? 0} />
        ))}
      </div>
    </div>
  )
}

function JobCard({ job, count }: { job: Job; count: number }) {
  return (
    <Link
      to={jobPath(job)}
      className="group flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4 hover:border-slate-700 hover:bg-slate-900"
    >
      <JobIcon job={job} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-200 group-hover:text-amber-400">
          {job.name}
        </span>
        <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <Icon.recipe className="size-3" aria-hidden />
          {count} recette{count > 1 ? 's' : ''}
        </span>
      </span>
    </Link>
  )
}
