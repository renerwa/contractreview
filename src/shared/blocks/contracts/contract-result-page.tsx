'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Download,
  FileWarning,
  Loader2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/components/ui/accordion';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Separator } from '@/shared/components/ui/separator';

type ResultPayload = {
  document: any;
  analysisResult: any;
  reviewTask: {
    taskId?: string;
    analysisResultId?: string;
    status?: string;
  } | null;
  reviewSetup: {
    perspective?: string;
    signingPlace?: string;
    outputLanguage?: string;
    focusPoints?: string;
  } | null;
};

export function ContractResultPage({ documentId }: { documentId: string }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [report, setReport] = useState<any>(null);

  const loadResult = useCallback(
    async (silent = false) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const resp = await fetch('/api/contracts/result', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId }),
        });
        const json = await resp.json();
        if (!resp.ok || json.code !== 0) {
          throw new Error(json.message || 'load review result failed');
        }

        const data = json.data as ResultPayload;
        setResult(data);

        const taskId = String(data.reviewTask?.taskId || '').trim();
        if (taskId) {
          const queryResp = await fetch('/api/contracts/review/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ taskId }),
          });
          const queryJson = await queryResp.json();
          if (queryResp.ok && queryJson.code === 0) {
            if (queryJson.data?.analysisResult) {
              setResult((prev) =>
                prev
                  ? {
                      ...prev,
                      analysisResult: queryJson.data.analysisResult,
                    }
                  : prev
              );
            }
            setReport(queryJson.data?.report || null);
          }
        }
      } catch (e: any) {
        toast.error(e?.message || 'load review result failed');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [documentId]
  );

  useEffect(() => {
    void loadResult(false);
  }, [loadResult]);

  useEffect(() => {
    const status = String(result?.analysisResult?.status || '');
    const taskStatus = String(result?.reviewTask?.status || '');
    if (
      ['completed', 'failed'].includes(status) ||
      ['SUCCESS', 'FAILED'].includes(taskStatus)
    ) {
      return;
    }

    const taskId = String(result?.reviewTask?.taskId || '').trim();
    if (!taskId) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadResult(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [
    loadResult,
    result?.analysisResult?.status,
    result?.reviewTask?.status,
    result?.reviewTask?.taskId,
  ]);

  const parsedRiskItems = useMemo(() => {
    try {
      return JSON.parse(String(result?.analysisResult?.riskItems || '{}'));
    } catch (_) {
      return {};
    }
  }, [result?.analysisResult?.riskItems]);

  const riskDetails =
    report?.review_details || parsedRiskItems?.review_details || [];
  const additionalRisks =
    report?.additional_critical_risks ||
    parsedRiskItems?.additional_critical_risks ||
    [];
  const findings = useMemo(() => {
    try {
      return JSON.parse(String(result?.analysisResult?.findings || '{}'));
    } catch (_) {
      return {};
    }
  }, [result?.analysisResult?.findings]);
  const reportOverview = report?.overview || findings?.report?.overview || {};
  const totalRiskScore = Number(
    reportOverview?.total_risk_score ?? result?.analysisResult?.riskScore ?? 0
  );
  const keyConclusion =
    String(reportOverview?.summary || '').trim() ||
    String(result?.analysisResult?.summary || '').trim();
  const combinedRiskItems = [...riskDetails, ...additionalRisks];
  const riskCounts = useMemo(() => {
    return combinedRiskItems.reduce(
      (acc: { high: number; medium: number; low: number }, item: any) => {
        const normalized = String(
          item?.status ||
            item?.risk_level ||
            item?.severity ||
            item?.level ||
            ''
        )
          .trim()
          .toLowerCase();

        if (normalized === 'high') acc.high += 1;
        else if (normalized === 'medium') acc.medium += 1;
        else if (normalized === 'low') acc.low += 1;

        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );
  }, [combinedRiskItems]);
  const highCount = riskCounts.high;
  const mediumCount = riskCounts.medium;
  const lowCount = riskCounts.low;

  const handlePrint = () => {
    window.print();
  };

  if (loading && !result) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Card>
          <CardContent className="flex min-h-[260px] items-center justify-center gap-3">
            <Loader2 className="size-5 animate-spin" />
            <span>Loading review result...</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  const reviewStatus = String(result?.analysisResult?.status || '');
  const documentName = String(
    result?.document?.fileName || 'Contract document'
  );
  const reportNumber = String(result?.analysisResult?.id || documentId)
    .slice(0, 12)
    .toUpperCase();
  const riskLevel = String(result?.analysisResult?.riskLevel || 'processing');
  const generatedAt = String(
    report?.generated_at ||
      findings?.generatedAt ||
      result?.analysisResult?.updatedAt ||
      result?.analysisResult?.createdAt ||
      ''
  );
  const title =
    reviewStatus === 'completed'
      ? 'Contract review result'
      : reviewStatus === 'failed'
        ? 'Contract review failed'
        : 'Review in progress';

  return (
    <div className="contract-report-page mx-auto max-w-6xl px-4 pt-24 pb-10 md:pt-32">
      <section className="contract-report-print-header hidden print:block">
        <div className="space-y-2">
          <div className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
            AI Contract Review Report
          </div>
          <h1 className="text-3xl font-semibold text-slate-950">
            Contract review report
          </h1>
          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            <div>Report number: {reportNumber}</div>
            <div>Document: {documentName}</div>
            <div>Generated at: {generatedAt || 'Generated on demand'}</div>
            <div>
              Overall risk:{' '}
              {String(result?.analysisResult?.riskLevel || 'Processing')}
            </div>
            <div>
              Total risk score:{' '}
              {Number.isFinite(totalRiskScore) ? totalRiskScore : '-'}
            </div>
            <div>
              Output language:{' '}
              {String(result?.reviewSetup?.outputLanguage || '-')}
            </div>
          </div>
        </div>
      </section>

      <div className="print:hidden">
        <Card className="border-border/70 from-background via-background to-muted/30 overflow-hidden bg-gradient-to-br shadow-sm">
          <CardHeader className="gap-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-primary/10 text-primary border-primary/15 flex size-11 items-center justify-center rounded-2xl border">
                    <ShieldAlert className="size-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
                      Contract Review Console
                    </div>
                    <CardTitle className="text-2xl tracking-tight">
                      {title}
                    </CardTitle>
                  </div>
                  {refreshing && (
                    <Loader2 className="text-muted-foreground size-4 animate-spin" />
                  )}
                </div>

                <CardDescription className="max-w-2xl text-sm leading-6">
                  {reviewStatus === 'completed'
                    ? 'Your full contract review is ready.'
                    : reviewStatus === 'failed'
                      ? 'The review did not complete successfully.'
                      : 'We are generating the full legal review for your contract.'}
                </CardDescription>

                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant="outline"
                    className="rounded-full px-3 py-1 text-[11px] tracking-wide uppercase"
                  >
                    {riskLevel.toUpperCase()}
                  </Badge>
                  <span className="border-border/70 bg-background rounded-full border px-3 py-1">
                    Report #{reportNumber}
                  </span>
                  <span className="border-border/70 bg-background rounded-full border px-3 py-1">
                    {documentName}
                  </span>
                  <span className="border-border/70 bg-background rounded-full border px-3 py-1">
                    {generatedAt || 'Generated on demand'}
                  </span>
                </div>
              </div>

              <div className="grid min-w-[260px] gap-3 sm:grid-cols-2 lg:grid-cols-1 lg:justify-items-end">
                <Button
                  onClick={handlePrint}
                  disabled={reviewStatus !== 'completed'}
                  className="h-11 rounded-xl px-5"
                >
                  <Download className="size-4" />
                  Print
                </Button>
                <div className="border-border/70 bg-background/85 rounded-2xl border p-4 text-sm backdrop-blur-sm lg:max-w-[280px]">
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="text-primary size-4" />
                    Review snapshot
                  </div>
                  <p className="text-muted-foreground mt-2 leading-6">
                    Structured for legal teams: overall risk first, then
                    clause-level findings and revision suggestions.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                title="Risk score"
                value={
                  Number.isFinite(totalRiskScore) ? String(totalRiskScore) : '-'
                }
                accent="score"
              />
              <SummaryCard
                title="Overall risk"
                value={riskLevel}
                accent={riskLevel}
              />
              <SummaryCard
                title="High risk"
                value={String(highCount)}
                accent="high"
              />
              <SummaryCard
                title="Medium risk"
                value={String(mediumCount)}
                accent="medium"
              />
              <SummaryCard
                title="Low risk"
                value={String(lowCount)}
                accent="low"
              />
            </div>

            <div className="border-border/70 bg-background/85 rounded-2xl border p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ArrowUpRight className="text-primary size-4" />
                Key conclusion
              </div>
              <p className="text-muted-foreground mt-3 text-sm leading-7">
                {keyConclusion || 'The review summary is being generated.'}
              </p>
            </div>
          </CardHeader>
        </Card>
      </div>

      <section className="hidden print:block">
        <div className="grid gap-4 md:grid-cols-5">
          <PrintSummaryCard
            title="Risk score"
            value={
              Number.isFinite(totalRiskScore) ? String(totalRiskScore) : '-'
            }
          />
          <PrintSummaryCard
            title="Overall risk"
            value={String(result?.analysisResult?.riskLevel || 'Processing')}
          />
          <PrintSummaryCard title="High risk" value={String(highCount)} />
          <PrintSummaryCard title="Medium risk" value={String(mediumCount)} />
          <PrintSummaryCard title="Low risk" value={String(lowCount)} />
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">
            Key conclusion
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-700">
            {keyConclusion || 'The review summary is being generated.'}
          </p>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px] print:grid-cols-1">
        <Card className="border-border/70 bg-background/95 shadow-sm print:border-slate-200 print:shadow-none">
          <CardHeader>
            <CardTitle>Risk details</CardTitle>
            <CardDescription>
              Risks are ordered from highest priority to lowest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviewStatus !== 'completed' ? (
              <div className="text-muted-foreground flex min-h-[320px] flex-col items-center justify-center gap-3 text-sm">
                <Loader2 className="size-5 animate-spin" />
                <p>
                  Review is still running. This page will refresh automatically.
                </p>
              </div>
            ) : combinedRiskItems.length === 0 ? (
              <div className="text-muted-foreground flex min-h-[220px] flex-col items-center justify-center gap-3 text-sm">
                <FileWarning className="size-5" />
                <p>No structured risk items are available yet.</p>
              </div>
            ) : (
              <Accordion
                type="single"
                collapsible
                className="w-full print:hidden"
              >
                {combinedRiskItems.map((item: any, index: number) => {
                  const titleText = String(
                    item?.issue_title ||
                      item?.checklist_item ||
                      item?.risk_title ||
                      item?.title ||
                      `Risk ${index + 1}`
                  );
                  const level = String(
                    item?.status ||
                      item?.risk_level ||
                      item?.severity ||
                      item?.level ||
                      'unknown'
                  );
                  const conclusion = String(
                    item?.issue_description ||
                      item?.conclusion ||
                      item?.risk_description ||
                      item?.summary ||
                      ''
                  );
                  const originalText = String(
                    item?.original_text_quote ||
                      item?.original_text ||
                      item?.contract_excerpt ||
                      item?.excerpt ||
                      ''
                  );
                  const description = String(
                    item?.issue_description ||
                      item?.risk_description ||
                      item?.analysis ||
                      ''
                  );
                  const suggestion = String(
                    item?.modification_suggestion ||
                      item?.suggestion ||
                      item?.revision_suggestion ||
                      item?.recommendation ||
                      ''
                  );

                  return (
                    <AccordionItem
                      key={`${titleText}-${index}`}
                      value={`risk-${index}`}
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex w-full flex-col items-start gap-3 pr-4 text-left">
                          <div className="flex items-center gap-3">
                            <RiskLevelDot level={level} />
                            <span className="font-medium">{titleText}</span>
                            <Badge
                              variant="secondary"
                              className="rounded-full px-2.5 py-0.5 tracking-wide uppercase"
                            >
                              {level}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground text-sm leading-6">
                            {conclusion || 'No summary available.'}
                          </p>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-4 pt-1">
                        <RiskSection
                          title="Original text"
                          content={originalText}
                        />
                        <RiskSection
                          title="Risk explanation"
                          content={description || conclusion}
                        />
                        <RiskSection
                          title="Suggested revision"
                          content={suggestion}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}

            {reviewStatus === 'completed' && combinedRiskItems.length > 0 ? (
              <div className="hidden space-y-5 print:block">
                {combinedRiskItems.map((item: any, index: number) => {
                  const titleText = String(
                    item?.issue_title ||
                      item?.checklist_item ||
                      item?.risk_title ||
                      item?.title ||
                      `Risk ${index + 1}`
                  );
                  const level = String(
                    item?.status ||
                      item?.risk_level ||
                      item?.severity ||
                      item?.level ||
                      'unknown'
                  );
                  const conclusion = String(
                    item?.issue_description ||
                      item?.conclusion ||
                      item?.risk_description ||
                      item?.summary ||
                      ''
                  );
                  const originalText = String(
                    item?.original_text_quote ||
                      item?.original_text ||
                      item?.contract_excerpt ||
                      item?.excerpt ||
                      ''
                  );
                  const description = String(
                    item?.issue_description ||
                      item?.risk_description ||
                      item?.analysis ||
                      ''
                  );
                  const suggestion = String(
                    item?.modification_suggestion ||
                      item?.suggestion ||
                      item?.revision_suggestion ||
                      item?.recommendation ||
                      ''
                  );

                  return (
                    <div
                      key={`print-risk-${index}`}
                      className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-5"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <h3 className="text-base font-semibold text-slate-950">
                          {titleText}
                        </h3>
                        <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium tracking-wide text-slate-700 uppercase">
                          {level}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {conclusion || 'No summary available.'}
                      </p>
                      <div className="mt-4 grid gap-4">
                        <PrintSection
                          title="Original text"
                          content={originalText}
                        />
                        <PrintSection
                          title="Risk explanation"
                          content={description || conclusion}
                        />
                        <PrintSection
                          title="Suggested revision"
                          content={suggestion}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-background/95 shadow-sm print:border-slate-200 print:shadow-none">
          <CardHeader>
            <CardTitle>Report context</CardTitle>
            <CardDescription>
              The report includes the summary and review preferences used for
              this run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-border/70 bg-muted/20 rounded-2xl border p-4">
              <div className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">
                Context snapshot
              </div>
              <div className="text-muted-foreground mt-2 text-sm leading-6">
                The exported report includes the contract summary and the review
                settings used for this review run.
              </div>
            </div>
            <ContextItem
              label="Contract summary"
              value={String(result?.analysisResult?.summary || '')}
            />
            <Separator />
            <ContextItem
              label="Perspective"
              value={String(
                result?.reviewSetup?.perspective ||
                  result?.document?.userParty ||
                  'neutral'
              )}
            />
            <ContextItem
              label="Signing country"
              value={String(
                result?.reviewSetup?.signingPlace ||
                  result?.document?.signingPlace ||
                  ''
              )}
            />
            <ContextItem
              label="Output language"
              value={String(result?.reviewSetup?.outputLanguage || '')}
            />
            <ContextItem
              label="Focus areas"
              value={String(
                result?.reviewSetup?.focusPoints ||
                  result?.document?.focusPoints ||
                  ''
              )}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: string;
}) {
  const accentClass =
    accent === 'high'
      ? 'from-red-500/12 to-red-500/3 border-red-500/20'
      : accent === 'medium'
        ? 'from-amber-500/12 to-amber-500/3 border-amber-500/20'
        : accent === 'low'
          ? 'from-emerald-500/12 to-emerald-500/3 border-emerald-500/20'
          : accent === 'score'
            ? 'from-sky-500/12 to-sky-500/3 border-sky-500/20'
            : 'from-primary/12 to-primary/3 border-primary/20';

  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-5 shadow-sm ${accentClass}`}
    >
      <div className="text-muted-foreground text-[11px] font-medium tracking-[0.16em] uppercase">
        {title}
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {value || '-'}
      </div>
    </div>
  );
}

function RiskSection({ title, content }: { title: string; content: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-muted-foreground bg-muted/20 rounded-lg border p-3 text-sm leading-6">
        {content || 'Not available.'}
      </div>
    </div>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        {label}
      </div>
      <div className="text-sm leading-6">{value || '-'}</div>
    </div>
  );
}

function RiskLevelDot({ level }: { level: string }) {
  const className = level.toLowerCase().includes('high')
    ? 'bg-red-500 shadow-red-500/40'
    : level.toLowerCase().includes('medium')
      ? 'bg-amber-500 shadow-amber-500/40'
      : level.toLowerCase().includes('low')
        ? 'bg-emerald-500 shadow-emerald-500/40'
        : 'bg-slate-400 shadow-slate-400/40';

  return (
    <span
      className={`inline-flex size-2.5 rounded-full shadow-[0_0_0_4px] ${className}`}
    />
  );
}

function PrintSummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {title}
      </div>
      <div className="mt-2 text-xl font-semibold text-slate-950">
        {value || '-'}
      </div>
    </div>
  );
}

function PrintSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </div>
      <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-7 whitespace-pre-wrap text-slate-700">
        {content || 'Not available.'}
      </div>
    </div>
  );
}
