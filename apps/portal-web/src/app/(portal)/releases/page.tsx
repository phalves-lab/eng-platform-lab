import type { ReleaseBranches } from '@lab/contracts'
import { KeyRound, PackageOpen, Rocket } from 'lucide-react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ReleaseFilters } from '@/components/releases/release-filters'
import { ReleasePreview, ReleasePreviewSkeleton } from '@/components/releases/release-preview'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { commonBranches, type ReleaseSearchParams, resolveSelection, sidesOf } from '@/lib/releases'
import { releasesApi } from '@/lib/releases-api'

export const metadata: Metadata = { title: 'Releases' }

interface ReleasesProps {
  readonly searchParams: Promise<ReleaseSearchParams>
}

function GenerateButton() {
  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Button disabled aria-describedby="generate-release-hint">
              <Rocket aria-hidden />
              Gerar release
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Em breve (LAB-53)</TooltipContent>
      </Tooltip>
      <span id="generate-release-hint" className="text-xs text-muted-foreground">
        Em breve (LAB-53)
      </span>
    </div>
  )
}

const loadBranches = async (
  project: string,
  sides: ('front' | 'back')[],
): Promise<{ branches: string[] | null; error: ApiError | null }> => {
  try {
    const lists: ReleaseBranches[] = await Promise.all(
      sides.map((side) => releasesApi.branches(project, side)),
    )
    return { branches: commonBranches(lists.map((list) => list.branches)), error: null }
  } catch (error) {
    if (error instanceof ApiError) return { branches: null, error }
    throw error
  }
}

export default async function ReleasesPage({ searchParams }: ReleasesProps) {
  const params = await searchParams
  const projects = await releasesApi.projects()
  const selection = resolveSelection(params, projects)

  const header = (
    <PageHeader
      title="Releases"
      description="Prévia do que entra na próxima release: PRs mergeados desde o último corte, agrupados por ticket, com SQL, ENV, checks e alertas. Nada é escrito no GitHub."
      actions={<GenerateButton />}
    />
  )

  if (!selection) {
    return (
      <>
        {header}
        <EmptyState
          icon={PackageOpen}
          title="Nenhum projeto cadastrado"
          description="Cadastre um projeto em catalog/releases/*.yaml para ver a prévia da release."
        />
      </>
    )
  }

  const { project, side, source, target } = selection
  const sides = side === 'both' ? sidesOf(project) : [side]
  const { branches, error } = await loadBranches(project.id, sides)

  return (
    <>
      {header}
      <Card>
        <CardContent>
          <ReleaseFilters
            projects={projects}
            projectId={project.id}
            side={side}
            source={source}
            target={target}
            branches={branches}
          />
        </CardContent>
      </Card>
      {error ? (
        <EmptyState
          icon={KeyRound}
          title={
            error.status === 503
              ? 'GitHub indisponível para o portal'
              : 'Não foi possível ler as branches'
          }
          description={error.message}
        />
      ) : (
        <Suspense
          key={`${project.id}:${side}:${source}:${target}`}
          fallback={<ReleasePreviewSkeleton />}
        >
          <ReleasePreview project={project.id} side={side} source={source} target={target} />
        </Suspense>
      )}
    </>
  )
}
