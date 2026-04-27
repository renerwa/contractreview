import moment from 'moment';
import { getLocale } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { Empty } from '@/shared/blocks/common';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { Document, getUserDocuments } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';

export async function MyContractsPage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const locale = await getLocale();
  const documents = await getUserDocuments({
    userId: user.id,
    limit: 100,
    page: 1,
  });

  const stats = documents.reduce(
    (
      acc: { total: number; inProgress: number; completed: number },
      item: Document
    ) => {
      acc.total += 1;
      if (
        [
          'reviewing',
          'review_setup_ready',
          'analyzed',
          'parsing',
          'parsed',
          'uploaded',
        ].includes(String(item.status || ''))
      ) {
        acc.inProgress += 1;
      }
      if (String(item.status || '') === 'reviewed') {
        acc.completed += 1;
      }
      return acc;
    },
    { total: 0, inProgress: 0, completed: 0 }
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">My Contracts</h1>
        <p className="text-muted-foreground max-w-2xl text-sm leading-6">
          Review all contracts in your workspace, track their current status,
          and open the corresponding review detail page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Total contracts" value={String(stats.total)} />
        <StatCard title="In progress" value={String(stats.inProgress)} />
        <StatCard title="Completed" value={String(stats.completed)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contract workspace</CardTitle>
          <CardDescription>
            Open any contract to continue pre-analysis, review setup, or inspect
            the final review result.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed text-center">
              <div className="space-y-2">
                <div className="text-lg font-medium">No contracts yet</div>
                <p className="text-muted-foreground max-w-md text-sm leading-6">
                  Upload your first contract from the landing page to start
                  parsing, pre-analysis, and the full review workflow.
                </p>
              </div>
              <Button asChild>
                <Link href="/">Upload your first contract</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contract type</TableHead>
                  <TableHead>Updated at</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((item: Document) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[280px]">
                      <div className="space-y-1 whitespace-normal">
                        <div className="font-medium">
                          {item.fileName || 'Untitled contract'}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          #{item.id.slice(0, 8).toUpperCase()}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="rounded-full px-2.5 py-0.5"
                      >
                        {getStatusLabel(String(item.status || 'uploaded'))}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {item.contractType || '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatDate(item.updatedAt || item.createdAt, locale)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/contracts/${item.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="border-border/70 bg-background/95 shadow-sm">
      <CardContent className="p-6">
        <div className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
          {title}
        </div>
        <div className="mt-3 text-3xl font-semibold tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'parsing':
      return 'Parsing';
    case 'parsed':
      return 'Parsed';
    case 'analyzed':
      return 'Analyzed';
    case 'review_setup_ready':
      return 'Review setup';
    case 'reviewing':
      return 'Reviewing';
    case 'reviewed':
      return 'Reviewed';
    case 'review_failed':
      return 'Review failed';
    case 'non_contract':
      return 'Not a contract';
    default:
      return 'Uploaded';
  }
}

function formatDate(date: Date | string | null | undefined, locale: string) {
  if (!date) return '-';
  return moment(date).locale(locale).format('YYYY-MM-DD HH:mm');
}
