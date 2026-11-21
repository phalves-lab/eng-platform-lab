import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ReviewerLoad } from '@lab/contracts'

export function ReviewerLoadTable({ reviewers }: { readonly reviewers: ReviewerLoad[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pessoa</TableHead>
            <TableHead className="text-right">Reviews</TableHead>
            <TableHead className="text-right">PRs</TableHead>
            <TableHead className="text-right">Comentários</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviewers.map((load) => (
            <TableRow key={load.reviewer}>
              <TableCell className="font-medium">{load.reviewer}</TableCell>
              <TableCell className="text-right tabular-nums">{load.reviews}</TableCell>
              <TableCell className="text-right tabular-nums">{load.pullRequests}</TableCell>
              <TableCell className="text-right tabular-nums">{load.comments}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
