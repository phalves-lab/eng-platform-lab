import type { ReleaseBranches, User } from '@lab/contracts'
import { KeyRound, PackageOpen } from 'lucide-react'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ReleaseFilters } from '@/components/releases/release-filters'
import { ReleaseGenerate } from '@/components/releases/release-generate'
import { ReleasePreview, ReleasePreviewSkeleton } from '@/components/releases/release-preview'
import {
  ReleaseTrackingSection,
  ReleaseTrackingSkeleton,
} from '@/components/releases/release-tracking'
import { Card, CardContent } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { canWriteReleases } from '@/lib/release-write'
import { commonBranches, type ReleaseSearchParams, resolveSelection, sidesOf } from '@/lib/releases'
import { releasesApi } from '@/lib/releases-api'

export const metadata: Metadata = { title: 'Releases' }

interface ReleasesProps {
  readonly searchParams: Promise<ReleaseSearchParams>
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

const roleOf = async (): Promise<User['role'] | null> => {
  try {
    return (await api.me()).role
  } catch (error) {
    if (error instanceof ApiError) return null
    throw error
  }
}

const DESCRIPTION =
  'Prévia do que entra na próxima release: PRs mergeados desde o último corte, agrupados por ticket, com SQL, ENV, checks e alertas. Líder ou admin gera a release a partir de um plano conferido antes de qualquer escrita no GitHub.'

export default async function ReleasesPage({ searchParams }: ReleasesProps) {
  const params = await searchParams
  const [projects, role] = await Promise.all([releasesApi.projects(), roleOf()])
  const selection = resolveSelection(params, projects)
  const canWrite = canWriteReleases(role)

  if (!selection) {
    return (
      <>
        <PageHeader title="Releases" description={DESCRIPTION} />
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
      <PageHeader
        title="Releases"
        description={DESCRIPTION}
        actions={
          <ReleaseGenerate
            canWrite={canWrite}
            project={project.id}
            side={side}
            source={source}
            target={target}
          />
        }
      />
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
      <Suspense key={`tracking:${project.id}`} fallback={<ReleaseTrackingSkeleton />}>
        <ReleaseTrackingSection project={project.id} canWrite={canWrite} />
      </Suspense>
    </>
  )
}
