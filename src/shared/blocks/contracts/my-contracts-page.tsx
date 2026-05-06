import moment from 'moment';
import { getLocale, getTranslations } from 'next-intl/server';

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
import {
  DocumentWithReviewMeta,
  getUserDocumentsWithReviewMeta,
} from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';

export async function MyContractsPage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const locale = await getLocale();
  const t = await getTranslations('common.contracts.my_contracts');
  const documents = await getUserDocumentsWithReviewMeta({
    userId: user.id,
    limit: 100,
    page: 1,
  });

  const stats = documents.reduce(
    (
      acc: { total: number; inProgress: number; completed: number },
      item: DocumentWithReviewMeta
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
  const latestDocument = documents[0];
  const latestUpdatedAt = latestDocument
    ? formatDate(latestDocument.updatedAt || latestDocument.createdAt, locale)
    : '-';

  return (
    <div className="from-background via-background to-muted/35 min-h-screen bg-gradient-to-b">
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-24 pb-10 md:space-y-7 md:pt-32">
        <section className="relative overflow-hidden rounded-[28px] border border-border/60 bg-background/78 px-6 py-7 shadow-lg backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 md:px-8 md:py-9">
          <div className="from-primary/12 via-primary/0 absolute inset-x-0 top-0 h-32 bg-gradient-to-b to-transparent" />
          <div className="absolute -top-16 -right-10 size-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 left-10 size-44 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-400/10" />
          <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div className="space-y-4">
              <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-500">
                {t('hero.badge')}
              </Badge>
              <div className="space-y-2.5">
                <h1 className="text-3xl font-semibold tracking-tight motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 md:text-4xl">
                  {t('title')}
                </h1>
                <p className="text-muted-foreground max-w-2xl text-sm leading-7 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 md:text-base">
                  {t('description')}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <HeroMetaCard
                title={t('hero.latest_activity')}
                value={latestUpdatedAt}
                description={t('hero.latest_activity_description')}
              />
              <HeroMetaCard
                title={t('hero.workspace_status')}
                value={t('hero.workspace_status_value', {
                  inProgress: stats.inProgress,
                  completed: stats.completed,
                })}
                description={t('hero.workspace_status_description')}
              />
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-3">
          <StatCard title={t('stats.total')} value={String(stats.total)} accent="neutral" />
          <StatCard title={t('stats.in_progress')} value={String(stats.inProgress)} accent="amber" />
          <StatCard title={t('stats.completed')} value={String(stats.completed)} accent="emerald" />
        </div>

        <Card className="border-border/70 bg-background/88 overflow-hidden shadow-lg backdrop-blur-sm">
          <CardHeader className="border-border/60 bg-muted/16 border-b pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <CardTitle className="text-xl tracking-tight">{t('workspace.title')}</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6">
                  {t('workspace.description')}
                </CardDescription>
              </div>
              <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                <WorkspaceChip label={t('stats.total')} value={String(stats.total)} />
                <WorkspaceChip label={t('stats.in_progress')} value={String(stats.inProgress)} />
                <WorkspaceChip label={t('stats.completed')} value={String(stats.completed)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {documents.length === 0 ? (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                <div className="space-y-2">
                  <div className="text-lg font-medium">{t('empty.title')}</div>
                  <p className="text-muted-foreground max-w-md text-sm leading-6">
                    {t('empty.description')}
                  </p>
                </div>
                <Button asChild>
                  <Link href="/">{t('empty.action')}</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/60 bg-muted/10 hover:bg-muted/10">
                      <TableHead className="h-11 w-[30%] px-6">{t('table.contract')}</TableHead>
                      <TableHead className="h-11 w-[13%]">{t('table.status')}</TableHead>
                      <TableHead className="h-11 w-[29%]">{t('table.review_insights')}</TableHead>
                      <TableHead className="h-11 w-[12%]">{t('table.contract_type')}</TableHead>
                      <TableHead className="h-11 w-[12%]">{t('table.updated_at')}</TableHead>
                      <TableHead className="h-12 px-6 text-right">{t('table.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((item: DocumentWithReviewMeta) => (
                      <TableRow
                        key={item.id}
                        className="group border-border/60 hover:bg-muted/12 transition-colors"
                      >
                        <TableCell className="max-w-[320px] px-6 py-4 align-top">
                          <div className="flex items-start gap-3 whitespace-normal transition-transform duration-200 group-hover:translate-x-0.5">
                            <div className={getDocumentIconTone(item.fileName, item.fileType)}>
                              <DocumentTypeIcon
                                fileName={item.fileName}
                                fileType={item.fileType}
                              />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="font-medium break-all">
                                {item.fileName || t('table.untitled_contract')}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                #{item.id.slice(0, 8).toUpperCase()}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <Badge
                            variant="outline"
                            className={getStatusBadgeTone(String(item.status || 'uploaded'))}
                          >
                            {getStatusLabel(String(item.status || 'uploaded'), t)}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <ReviewInsightsCell item={item} t={t} />
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <span className="text-sm">{item.contractType || '-'}</span>
                        </TableCell>
                        <TableCell className="py-4 align-top">
                          <span className="text-muted-foreground text-sm">
                            {formatDate(item.updatedAt || item.createdAt, locale)}
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right align-top">
                          <Button asChild size="sm" variant="outline" className="rounded-full px-4 transition-all duration-200 group-hover:border-primary/30 group-hover:bg-primary/5">
                            <Link href={`/contracts/${item.id}`}>{t('table.open')}</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeroMetaCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="border-border/60 bg-background/72 rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition-all duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-700 hover:-translate-y-0.5 hover:shadow-md">
      <div className="text-muted-foreground text-[11px] font-medium tracking-[0.16em] uppercase">
        {title}
      </div>
      <div className="mt-2 text-base font-semibold tracking-tight">{value}</div>
      <div className="text-muted-foreground mt-2 text-xs leading-5">{description}</div>
    </div>
  );
}

function WorkspaceChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/70 bg-background/85 rounded-full border px-3 py-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      {label} · {value}
    </div>
  );
}

function DocumentTypeIcon({
  fileName,
  fileType,
}: {
  fileName: string | null | undefined;
  fileType: string | null | undefined;
}) {
  const normalized = getDocumentKind(fileName, fileType);

  if (normalized === 'pdf') {
    return <PdfBrandIcon />;
  }

  if (normalized === 'word') {
    return <WordBrandIcon />;
  }

  if (normalized === 'txt') {
    return <TxtBrandIcon />;
  }

  return <GenericBrandIcon />;
}

function ReviewInsightsCell({
  item,
  t,
}: {
  item: DocumentWithReviewMeta;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const reviewMeta = item.latestAnalysisResult;
  const reviewStatus = String(reviewMeta?.status || '');
  const isCompleted = reviewStatus === 'completed';
  const hasReviewResult = reviewMeta && isCompleted;

  // 核心逻辑：列表页的审核结果摘要只对“正式审核已完成”的合同展示，其他状态统一收口为占位符，避免用户误以为已有正式结果
  if (!hasReviewResult) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  const riskLevel = getRiskLevelLabel(reviewMeta.riskLevel, t);
  const riskLevelTone = getRiskLevelTone(reviewMeta.riskLevel);
  const cardTone = getReviewCardTone(reviewMeta.riskLevel);
  const riskScore =
    typeof reviewMeta.riskScore === 'number' ? String(reviewMeta.riskScore) : '-';
  const hasStructuredRiskItems = reviewMeta.riskItemCount > 0;

  return (
    <div
      className={`w-full min-w-[220px] min-h-[116px] rounded-xl border p-3 text-sm shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-md ${cardTone}`}
    >
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={riskLevelTone} variant="secondary">
            {riskLevel}
          </Badge>
          <div className="font-medium">
            {hasStructuredRiskItems
              ? t('review_insights.risk_count', { count: reviewMeta.riskItemCount })
              : t('review_insights.no_structured_risk')}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="text-muted-foreground text-xs">
            {t('review_insights.risk_score_label')}
          </div>
          <div className="text-right">
            <div className="text-foreground text-xl font-semibold tracking-tight transition-transform duration-300 group-hover:scale-[1.03]">
              {riskScore}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <MiniMetricPill
            label={t('review_insights.high_risk_short')}
            value={reviewMeta.highRiskCount}
            tone="high"
          />
          <MiniMetricPill
            label={t('review_insights.medium_risk_short')}
            value={reviewMeta.mediumRiskCount}
            tone="medium"
          />
          <MiniMetricPill
            label={t('review_insights.low_risk_short')}
            value={reviewMeta.lowRiskCount}
            tone="low"
          />
        </div>
      </div>
    </div>
  );
}

function MiniMetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'high' | 'medium' | 'low';
}) {
  const toneClass =
    tone === 'high'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'medium'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700';

  return (
    <div className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
      {label} {value}
    </div>
  );
}

function StatCard({
  title,
  value,
  accent = 'neutral',
}: {
  title: string;
  value: string;
  accent?: 'neutral' | 'amber' | 'emerald';
}) {
  const accentClass =
    accent === 'amber'
      ? 'from-amber-500/10 to-amber-500/0 border-amber-200/70 dark:border-amber-400/20'
      : accent === 'emerald'
        ? 'from-emerald-500/10 to-emerald-500/0 border-emerald-200/70 dark:border-emerald-400/20'
        : 'from-primary/10 to-primary/0 border-border/70';

  return (
    <Card className={`bg-background/92 border shadow-sm backdrop-blur-sm transition-all duration-300 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500 hover:-translate-y-1 hover:shadow-md ${accentClass}`}>
      <CardContent className="p-5">
        <div className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
          {title}
        </div>
        <div className="mt-2.5 text-3xl font-semibold tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function WordBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="3" fill="url(#word-bg)" />
      <path d="M8 8.5L9.2 15L11 10.6L12.8 15L14 8.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.1 6.8H17.4" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="word-bg" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563EB" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PdfBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="3" fill="url(#pdf-bg)" />
      <path d="M8.6 15.2V8.8H11C12.2 8.8 13 9.5 13 10.5C13 11.5 12.2 12.2 11 12.2H10.1V15.2" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.2 8.8H15.4C16.7 8.8 17.5 9.7 17.5 12C17.5 14.3 16.7 15.2 15.4 15.2H14.2V8.8Z" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.3 6.7H17.3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="pdf-bg" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EF4444" />
          <stop offset="1" stopColor="#DC2626" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function TxtBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="3" fill="url(#txt-bg)" />
      <path d="M8.4 9H15.6" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.4 12H15.6" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.4 15H13.2" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M14.8 6.7H17.2" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
      <defs>
        <linearGradient id="txt-bg" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#64748B" />
          <stop offset="1" stopColor="#475569" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function GenericBrandIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none">
      <rect x="5" y="3" width="14" height="18" rx="3" fill="url(#generic-bg)" />
      <path d="M8.7 9H15.3" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.7 12H15.3" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M8.7 15H12.8" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <defs>
        <linearGradient id="generic-bg" x1="5" y1="3" x2="19" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8" />
          <stop offset="1" stopColor="#64748B" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function getStatusBadgeTone(status: string) {
  switch (status) {
    case 'reviewed':
      return 'rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] tracking-wide text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300';
    case 'reviewing':
    case 'review_setup_ready':
    case 'analyzed':
      return 'rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-[11px] tracking-wide text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300';
    case 'review_failed':
    case 'non_contract':
      return 'rounded-full border-red-200 bg-red-50 px-3 py-1 text-[11px] tracking-wide text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300';
    default:
      return 'rounded-full border-border/70 bg-background/85 px-3 py-1 text-[11px] tracking-wide text-muted-foreground';
  }
}

function getStatusLabel(status: string, t?: Awaited<ReturnType<typeof getTranslations>>) {
  switch (status) {
    case 'uploaded':
      return t ? t('status.uploaded') : 'Uploaded';
    case 'parsing':
      return t ? t('status.parsing') : 'Parsing';
    case 'parsed':
      return t ? t('status.parsed') : 'Parsed';
    case 'analyzed':
      return t ? t('status.analyzed') : 'Analyzed';
    case 'review_setup_ready':
      return t ? t('status.review_setup_ready') : 'Review setup';
    case 'reviewing':
      return t ? t('status.reviewing') : 'Reviewing';
    case 'reviewed':
      return t ? t('status.reviewed') : 'Reviewed';
    case 'review_failed':
      return t ? t('status.review_failed') : 'Review failed';
    case 'non_contract':
      return t ? t('status.non_contract') : 'Not a contract';
    default:
      return t ? t('status.uploaded') : 'Uploaded';
  }
}

function getRiskLevelLabel(
  level: string | null | undefined,
  t: Awaited<ReturnType<typeof getTranslations>>
) {
  switch (String(level || '').trim().toLowerCase()) {
    case 'high':
      return t('risk_level.high');
    case 'medium':
      return t('risk_level.medium');
    case 'low':
      return t('risk_level.low');
    default:
      return '-';
  }
}

function getRiskLevelTone(level: string | null | undefined) {
  switch (String(level || '').trim().toLowerCase()) {
    case 'high':
      return 'border-red-200 bg-red-50 text-red-700 shadow-none';
    case 'medium':
      return 'border-amber-200 bg-amber-50 text-amber-700 shadow-none';
    case 'low':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600 shadow-none';
  }
}

function getReviewCardTone(level: string | null | undefined) {
  switch (String(level || '').trim().toLowerCase()) {
    case 'high':
      return 'border-red-200/90 bg-gradient-to-br from-red-50 via-background to-background';
    case 'medium':
      return 'border-amber-200/90 bg-gradient-to-br from-amber-50 via-background to-background';
    case 'low':
      return 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-background to-background';
    default:
      return 'border-border/60 bg-gradient-to-br from-slate-50 via-background to-background';
  }
}

function getDocumentKind(
  fileName: string | null | undefined,
  fileType: string | null | undefined
) {
  const normalizedType = String(fileType || '').trim().toLowerCase();
  const normalizedName = String(fileName || '').trim().toLowerCase();

  if (
    normalizedType.includes('pdf') ||
    normalizedName.endsWith('.pdf')
  ) {
    return 'pdf';
  }

  if (
    normalizedType.includes('word') ||
    normalizedType.includes('doc') ||
    normalizedName.endsWith('.doc') ||
    normalizedName.endsWith('.docx')
  ) {
    return 'word';
  }

  if (
    normalizedType.includes('text') ||
    normalizedType.includes('txt') ||
    normalizedName.endsWith('.txt')
  ) {
    return 'txt';
  }

  return 'generic';
}

function getDocumentIconTone(
  fileName: string | null | undefined,
  fileType: string | null | undefined
) {
  const kind = getDocumentKind(fileName, fileType);

  if (kind === 'pdf') {
    return 'relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 shadow-sm transition-transform duration-200 group-hover:scale-[1.04]';
  }

  if (kind === 'word') {
    return 'relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700 shadow-sm transition-transform duration-200 group-hover:scale-[1.04]';
  }

  if (kind === 'txt') {
    return 'relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition-transform duration-200 group-hover:scale-[1.04]';
  }

  return 'relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-muted-foreground shadow-sm transition-transform duration-200 group-hover:scale-[1.04]';
}

function formatDate(date: Date | string | null | undefined, locale: string) {
  if (!date) return '-';
  return moment(date).locale(locale).format('YYYY-MM-DD HH:mm');
}
