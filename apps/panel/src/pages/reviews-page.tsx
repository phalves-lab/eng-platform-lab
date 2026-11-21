import type { PanelDataset } from '@lab/eng-metrics/contract'
import { UsersRound } from 'lucide-react'
import { ReviewerLoadChart } from '@/components/charts'
import { EmptyState } from '@/components/empty-state'
import { navItem } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDecimal } from '@/lib/format'

const TOP_PAIRS = 10

export const ReviewsPage = ({ dataset }: { readonly dataset: PanelDataset }) => {
  const { reviewers, pairs, windowDays } = dataset.metrics
  const page = navItem('reviews')

  if (!reviewers.length)
    return (
      <div className="space-y-6">
        <PageHeader title={page.title} description={page.description} />
        <EmptyState
          icon={UsersRound}
          title="Nenhuma review humana na janela"
          description="Com um revisor só, o laboratório roda com 0 aprovações obrigatórias. Veja o exemplo com time de 8 para o painel com volume."
        />
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader title={page.title} description={page.description} />

      <Card>
        <CardHeader>
          <CardTitle>Carga por pessoa</CardTitle>
          <CardDescription>
            Reviews e comentários nos últimos {windowDays} dias. Olhe os dois juntos: muita review
            com pouco comentário pode ser aprovação no automático.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewerLoadChart reviewers={reviewers} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quem segura o processo</CardTitle>
            <CardDescription>Ordenado por reviews feitas.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pessoa</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                  <TableHead className="text-right">PRs</TableHead>
                  <TableHead className="text-right">Comentários por review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewers.map((load) => (
                  <TableRow key={load.reviewer}>
                    <TableCell className="font-medium">{load.reviewer}</TableCell>
                    <TableCell className="text-right tabular-nums">{load.reviews}</TableCell>
                    <TableCell className="text-right tabular-nums">{load.pullRequests}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDecimal(load.comments / load.reviews)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quem revisa quem</CardTitle>
            <CardDescription>
              Pares mais frequentes. Concentração alta num par vira ponto único de conhecimento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Autor</TableHead>
                  <TableHead>Revisor</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairs.slice(0, TOP_PAIRS).map((pair) => (
                  <TableRow key={`${pair.author}-${pair.reviewer}`}>
                    <TableCell>{pair.author}</TableCell>
                    <TableCell>{pair.reviewer}</TableCell>
                    <TableCell className="text-right tabular-nums">{pair.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
