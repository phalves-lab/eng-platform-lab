import { CalendarRange, DatabaseZap, Flag, Layers, SquareKanban, TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import { BoardSwitch } from '@/components/boards/board-switch'
import { CfdChart } from '@/components/boards/cfd-chart'
import { EpicList } from '@/components/boards/epic-list'
import { KanbanBoard } from '@/components/boards/kanban-board'
import { SprintChart } from '@/components/boards/sprint-chart'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { cfdSeries, resolveBoard, sprintSentence, sprintSeries } from '@/lib/boards'
import { formatDateTime } from '@/lib/labels'

export const metadata: Metadata = { title: 'Boards' }

const BASE_PATH = '/entregas/boards'

interface DeliveryBoardsProps {
  readonly searchParams: Promise<{ projeto?: string | string[] }>
}

const loadBoard = async (requested: string | string[] | undefined) => {
  try {
    const boards = await api.boards()
    const project = resolveBoard(requested, boards)
    if (!project) return { state: 'unavailable' as const }
    return { state: 'ready' as const, boards, board: await api.board(project) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return { state: 'unavailable' as const }
    throw error
  }
}

export default async function DeliveryBoardsPage({ searchParams }: DeliveryBoardsProps) {
  const { projeto } = await searchParams
  const result = await loadBoard(projeto)

  if (result.state !== 'ready') {
    return (
      <>
        <PageHeader
          title="Boards"
          description="O board de cada área, só de leitura, a partir do espelho do Jira."
        />
        <EmptyState
          icon={DatabaseZap}
          title="Os dados do Jira ainda não foram coletados"
          description="Rode o coletor do Jira no worker (npm run collect:jira) com a API ligada ao banco e recarregue a página."
        />
      </>
    )
  }

  const { boards, board } = result
  const open = board.columns
    .filter((column) => column.category !== 'done')
    .reduce((total, column) => total + column.items.length, 0)

  return (
    <>
      <PageHeader
        title="Boards"
        description={`Board de ${board.project}, só de leitura: nada aqui altera o Jira. ${open} itens abertos. Dados de ${formatDateTime(board.generatedAt)}.`}
        actions={<BoardSwitch basePath={BASE_PATH} current={board.project} boards={boards} />}
      />

      {board.unmappedStatuses.length ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-warning" aria-hidden />
              Status fora do workflow
            </CardTitle>
            <CardDescription>
              Estes status ficam em A fazer até entrarem em catalog/jira/workflow.yaml:{' '}
              {board.unmappedStatuses.map((item) => item.status).join(', ')}.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card className="min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SquareKanban className="size-4 text-primary" aria-hidden />
            Kanban
          </CardTitle>
          <CardDescription>
            Colunas do workflow. Em cada coluna, o item parado há mais tempo fica em cima.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KanbanBoard columns={board.columns} doneWindowDays={board.doneWindowDays} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="size-4 text-primary" aria-hidden />
              Fluxo cumulativo
            </CardTitle>
            <CardDescription>
              Itens em cada coluna ao fim de cada dia, nas últimas 8 semanas. Faixa que engorda é
              fila crescendo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CfdChart data={cfdSeries(board.cfd)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="size-4 text-primary" aria-hidden />
              Previsto e entregue
            </CardTitle>
            <CardDescription>
              Sprint ativa e as 3 anteriores. Previsto é o que estava na sprint no início.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {board.sprints.length ? (
              <>
                <SprintChart data={sprintSeries(board.sprints, board.project)} />
                <ul className="space-y-1.5 text-sm">
                  {board.sprints.map((sprint) => (
                    <li key={sprint.id}>
                      <span className="font-medium">{sprint.name}</span>
                      {sprint.state === 'active' ? ' (ativa)' : ''}:{' '}
                      <span className="text-muted-foreground">{sprintSentence(sprint)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState
                icon={CalendarRange}
                title="Nenhuma sprint iniciada"
                description="Quando o board tiver sprints, o previsto e o entregue aparecem aqui."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="size-4 text-primary" aria-hidden />
            Épicos
          </CardTitle>
          <CardDescription>
            Percentual de itens concluídos em cada épico. Épicos abertos primeiro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {board.epics.length ? (
            <EpicList epics={board.epics} />
          ) : (
            <EmptyState
              icon={Flag}
              title="Nenhum épico neste projeto"
              description="Épicos com itens ligados aparecem aqui com o progresso."
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
