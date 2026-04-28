'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  CheckCircle2,
  FileSearch,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { useRouter } from '@/core/i18n/navigation';
import { useAppContext } from '@/shared/contexts/app';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Progress } from '@/shared/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';

type DetailResponse = {
  document: any;
  analysisResult: any;
  summary: {
    contractType?: string;
    contractSubtype?: string;
    language?: string;
    isContract?: boolean;
    nonContractReason?: string;
    signingPlace?: string;
    summary?: string;
    userParty?: string;
    keyPoints?: string[];
  } | null;
  parseProgress?: {
    extractedPages?: number;
    totalPages?: number;
  };
};

const STEP_ITEMS = ['Upload', 'Extract', 'Pre-analysis', 'Review setup'];

const PERSPECTIVE_OPTIONS = [
  { value: 'neutral', labelKey: 'neutral' },
  { value: 'buyer', labelKey: 'buyer' },
  { value: 'seller', labelKey: 'seller' },
  { value: 'employer', labelKey: 'employer' },
  { value: 'employee', labelKey: 'employee' },
  { value: 'service-provider', labelKey: 'service_provider' },
  { value: 'service-recipient', labelKey: 'service_recipient' },
];

export function ContractDetailPage({
  documentId,
  locale,
}: {
  documentId: string;
  locale: string;
}) {
  const t = useTranslations('common.contracts.detail');
  const router = useRouter();
  const { user, setIsShowSignModal, setSignModalCallbackUrl } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [perspective, setPerspective] = useState('neutral');
  const [signingPlace, setSigningPlace] = useState('');
  const [focusPoints, setFocusPoints] = useState('');
  const [outputLanguage, setOutputLanguage] = useState(
    locale.toLowerCase().startsWith('zh') ? 'Chinese' : 'English'
  );

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!documentId) return;
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const resp = await fetch('/api/contracts/detail', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId }),
        });
        if (!resp.ok) {
          throw new Error(`request failed with status ${resp.status}`);
        }

        const json = await resp.json();
        if (json.code !== 0) {
          throw new Error(json.message || 'load contract detail failed');
        }

        const data = json.data as DetailResponse;
        setDetail(data);
        setPerspective(String(data.document?.userParty || 'neutral') || 'neutral');
        setSigningPlace(
          String(data.document?.signingPlace || data.summary?.signingPlace || '')
        );
        setFocusPoints(String(data.document?.focusPoints || ''));
      } catch (e: any) {
        toast.error(e?.message || 'load contract detail failed');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [documentId]
  );

  useEffect(() => {
    void loadDetail(false);
  }, [loadDetail]);

  useEffect(() => {
    const status = String(detail?.document?.status || '');
    if (!['uploaded', 'parsing', 'parsed'].includes(status)) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadDetail(true);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [detail?.document?.status, loadDetail, detail?.analysisResult?.id]);

  useEffect(() => {
    const shouldClaim =
      !!user &&
      !!detail?.document?.id &&
      !!detail?.document?.userId &&
      detail.document.userId !== user.id;
    if (!shouldClaim || claiming) {
      return;
    }

    const run = async () => {
      setClaiming(true);
      try {
        const resp = await fetch('/api/contracts/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId }),
        });
        if (!resp.ok) {
          throw new Error(`request failed with status ${resp.status}`);
        }
        const json = await resp.json();
        if (json.code !== 0) {
          throw new Error(json.message || 'claim contract failed');
        }
        await loadDetail(true);
      } catch (e: any) {
        toast.error(e?.message || 'claim contract failed');
      } finally {
        setClaiming(false);
      }
    };

    void run();
  }, [claiming, detail?.document?.id, detail?.document?.userId, documentId, loadDetail, user]);

  const currentStep = useMemo(() => {
    const status = String(detail?.document?.status || '');
    if (status === 'reviewed' || status === 'review_failed' || status === 'reviewing') {
      return 4;
    }
    if (status === 'review_setup_ready') return 4;
    if (status === 'analyzed') return 4;
    if (status === 'non_contract') return 3;
    if (status === 'parsed') return 3;
    if (status === 'parsing') return 2;
    return 1;
  }, [detail?.document?.status]);

  const progressValue = currentStep * 25;
  const summary = detail?.summary;
  const fileName = String(detail?.document?.fileName || t('fallback.document_name'));
  const currentStatusText = getStatusText(detail?.document?.status, t);
  const startFullReview = useCallback(async () => {
    if (!detail?.document?.id || !user) {
      return;
    }

    try {
      const resp = await fetch('/api/contracts/review/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId: detail.document.id,
          analysisResultId: detail.analysisResult?.id,
          contractType:
            detail.document.contractType || summary?.contractType || '',
          signingPlace: signingPlace || detail.document.signingPlace || '',
          perspective,
          focusPoints,
          outputLanguage,
          contractMarkdown:
            detail.analysisResult?.markdownContent || '',
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.code !== 0) {
        throw new Error(json.message || 'start contract review failed');
      }

      toast.success(t('toast.start_review_success'));
      router.push(`/contracts/${detail.document.id}/result`);
    } catch (e: any) {
      toast.error(e?.message || t('toast.start_review_failed'));
    }
  }, [
    detail?.analysisResult?.id,
    detail?.analysisResult?.markdownContent,
    detail?.document?.contractType,
    detail?.document?.id,
    detail?.document?.signingPlace,
    focusPoints,
    outputLanguage,
    perspective,
    router,
    signingPlace,
    summary?.contractType,
    user,
  ]);

  const handleSaveAndContinue = async () => {
    if (!detail?.document?.id || saving) {
      return;
    }

    setSaving(true);
    try {
      if (user && detail.document.userId !== user.id) {
        const claimResp = await fetch('/api/contracts/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ documentId: detail.document.id }),
        });
        const claimJson = await claimResp.json();
        if (!claimResp.ok || claimJson.code !== 0) {
          throw new Error(claimJson.message || 'claim contract failed');
        }
      }

      const resp = await fetch('/api/contracts/review-setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId: detail.document.id,
          perspective,
          signingPlace,
          focusPoints,
          outputLanguage,
        }),
      });
      if (!resp.ok) {
        throw new Error(`request failed with status ${resp.status}`);
      }

      const json = await resp.json();
      if (json.code !== 0) {
        throw new Error(json.message || 'save review setup failed');
      }

      setPreparing(true);
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      setPreparing(false);
      await loadDetail(true);

      if (!user) {
        setSignModalCallbackUrl(`/contracts/${documentId}`);
        setIsShowSignModal(true);
        toast.info(t('toast.sign_in_required'));
        return;
      }

      toast.success(t('toast.save_and_start_success'));
      await startFullReview();
    } catch (e: any) {
      setPreparing(false);
      toast.error(e?.message || t('toast.save_review_setup_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Card>
          <CardContent className="flex min-h-[240px] items-center justify-center gap-3">
            <Loader2 className="size-5 animate-spin" />
            <span>{t('loading.workspace')}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 pb-10 md:pt-32">
      <Card className="border-border/70 bg-background/95">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="size-4" />
                <CardTitle className="text-xl">{fileName}</CardTitle>
                {refreshing && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
                {claiming && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
              </div>
              <CardDescription>{currentStatusText}</CardDescription>
            </div>
            <Badge variant="outline">{String(detail?.document?.status || 'uploaded')}</Badge>
          </div>
          <div className="space-y-3">
            <Progress value={progressValue} />
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              {STEP_ITEMS.map((step, index) => (
                <div
                  key={step}
                  className={index + 1 <= currentStep ? 'font-medium text-foreground' : ''}
                >
                  {index + 1}. {step}
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="mt-6">
        {preparing ? (
          <Card>
            <CardContent className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="text-primary size-10 animate-pulse" />
              <div className="space-y-2">
                <div className="text-lg font-semibold">{t('preparing.title')}</div>
                <p className="text-muted-foreground max-w-xl text-sm">
                  {t('preparing.description')}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : detail?.document?.status === 'non_contract' ? (
          <Card>
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center">
              <div className="bg-muted flex size-16 items-center justify-center rounded-full">
                <FileSearch className="size-8" />
              </div>
              <div className="space-y-2">
                <div className="text-xl font-semibold">
                  {t('non_contract.title')}
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  {summary?.nonContractReason ||
                    summary?.summary ||
                    t('non_contract.description')}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => window.location.assign(`/${locale}`)}>
                  {t('non_contract.upload_another')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.location.assign(`/${locale}#paste-contract-text`)
                  }
                >
                  {t('non_contract.paste_instead')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : ['uploaded', 'parsing', 'parsed'].includes(
            String(detail?.document?.status || '')
          ) ? (
          <Card>
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center">
              <div className="bg-primary/10 flex size-16 items-center justify-center rounded-full">
                <Sparkles className="text-primary size-8 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="text-xl font-semibold">
                  {t('parsing.title')}
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  {t('parsing.description')}
                </p>
              </div>
              {detail?.parseProgress?.totalPages ? (
                <div className="text-muted-foreground text-sm">
                  {t('parsing.progress', {
                    extracted: detail.parseProgress.extractedPages || 0,
                    total: detail.parseProgress.totalPages || 0,
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : ['reviewing', 'reviewed', 'review_failed'].includes(
            String(detail?.document?.status || '')
          ) ? (
          <Card>
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-5 text-center">
              <div className="bg-primary/10 flex size-16 items-center justify-center rounded-full">
                <ShieldCheck className="text-primary size-8" />
              </div>
              <div className="space-y-2">
                <div className="text-xl font-semibold">
                  {detail?.document?.status === 'reviewed'
                    ? t('review_state.reviewed_title')
                    : detail?.document?.status === 'review_failed'
                      ? t('review_state.failed_title')
                      : t('review_state.reviewing_title')}
                </div>
                <p className="text-muted-foreground max-w-2xl">
                  {detail?.document?.status === 'reviewed'
                    ? t('review_state.reviewed_description')
                    : detail?.document?.status === 'review_failed'
                      ? t('review_state.failed_description')
                      : t('review_state.reviewing_description')}
                </p>
              </div>
              <Button onClick={() => router.push(`/contracts/${documentId}/result`)}>
                {t('review_state.open_result')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-primary size-4" />
                  <CardTitle>{t('summary_card.title')}</CardTitle>
                </div>
                <CardDescription>
                  {t('summary_card.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoItem
                    label={t('summary_fields.contract_type')}
                    value={summary?.contractType || t('fallback.pending')}
                  />
                  <InfoItem
                    label={t('summary_fields.language')}
                    value={summary?.language || t('fallback.pending')}
                  />
                  <InfoItem
                    label={t('summary_fields.signing_place')}
                    value={summary?.signingPlace || t('fallback.not_identified')}
                  />
                  <InfoItem
                    label={t('summary_fields.review_stance')}
                    value={summary?.userParty || t('perspective_options.neutral')}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">{t('summary_fields.summary')}</div>
                  <div className="text-muted-foreground rounded-lg border bg-muted/20 p-4 text-sm leading-6">
                    {summary?.summary || t('fallback.summary_unavailable')}
                  </div>
                </div>

                {!!summary?.keyPoints?.length && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{t('summary_fields.key_points')}</div>
                    <div className="flex flex-wrap gap-2">
                      {summary.keyPoints.map((item) => (
                        <Badge key={item} variant="secondary">
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('setup_card.title')}</CardTitle>
                <CardDescription>
                  {t('setup_card.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t('setup_fields.review_perspective')}</div>
                  <Select value={perspective} onValueChange={setPerspective}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t('setup_fields.review_perspective_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {PERSPECTIVE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {t(`perspective_options.${option.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">{t('setup_fields.signing_country')}</div>
                  <Input
                    value={signingPlace}
                    onChange={(event) => setSigningPlace(event.target.value)}
                    placeholder={t('setup_fields.signing_country_placeholder')}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">{t('setup_fields.output_language')}</div>
                  <Input
                    value={outputLanguage}
                    onChange={(event) => setOutputLanguage(event.target.value)}
                    placeholder={t('setup_fields.output_language_placeholder')}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">{t('setup_fields.focus_areas')}</div>
                  <Textarea
                    value={focusPoints}
                    onChange={(event) => setFocusPoints(event.target.value)}
                    placeholder={t('setup_fields.focus_areas_placeholder')}
                    className="min-h-[140px]"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={handleSaveAndContinue}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t('setup_actions.preparing_review')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" />
                      {t('setup_actions.start_full_review')}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value || '-'}</div>
    </div>
  );
}

function getStatusText(
  status: string | undefined,
  t: ReturnType<typeof useTranslations<'common.contracts.detail'>>
) {
  switch (status) {
    case 'parsing':
      return t('status_text.parsing');
    case 'parsed':
      return t('status_text.parsed');
    case 'analyzed':
    case 'review_setup_ready':
      return t('status_text.analyzed');
    case 'reviewing':
      return t('status_text.reviewing');
    case 'reviewed':
      return t('status_text.reviewed');
    case 'review_failed':
      return t('status_text.review_failed');
    case 'non_contract':
      return t('status_text.non_contract');
    default:
      return t('status_text.default');
  }
}
