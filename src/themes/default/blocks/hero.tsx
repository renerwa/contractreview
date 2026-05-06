'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowRight, FileText, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { Link, useRouter } from '@/core/i18n/navigation';
import { Button } from '@/shared/components/ui/button';
import { Highlighter } from '@/shared/components/ui/highlighter';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { Section } from '@/shared/types/blocks/landing';

import { SocialAvatars } from './social-avatars';

export function Hero({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState('upload');
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState('');
  const [uploadedDocumentId, setUploadedDocumentId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsingHint, setParsingHint] = useState('');
  const [preAnalyzing, setPreAnalyzing] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadCard = section.upload_card ?? {};

  const tabUpload = uploadCard.tab_upload ?? 'Upload';
  const tabPasteText = uploadCard.tab_paste_text ?? 'Paste Text';
  const uploadTitle = uploadCard.upload_title ?? 'Upload your contract';
  const uploadHint =
    uploadCard.upload_hint ?? 'Click to upload or drag and drop your file here';
  const uploadAcceptedHint =
    uploadCard.upload_accepted_hint ?? 'PDF, DOCX, TXT';
  const pastePlaceholder =
    uploadCard.paste_placeholder ?? 'Paste your contract text here...';
  const ctaText =
    uploadCard.cta_title ?? section.buttons?.[0]?.title ?? 'Free Risk Scan';

  const highlightText = section.highlight_text ?? '';
  let texts = null;
  if (highlightText) {
    texts = section.title?.split(highlightText, 2);
  }

  const handleOpenFile = () => {
    if (uploading || parsing || preAnalyzing) {
      return;
    }
    fileInputRef.current?.click();
  };

  const uploadContractFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch('/api/contracts/upload', {
      method: 'POST',
      body: formData,
    });
    if (!resp.ok) {
      throw new Error(`request failed with status ${resp.status}`);
    }
    const result = await resp.json();
    if (result.code !== 0) {
      throw new Error(result.message || 'upload failed');
    }
    const document = result.data?.document;
    const fileInfo = result.data?.file;
    return {
      documentId: String(document?.id || ''),
      fileUrl: String(fileInfo?.url || document?.filePath || ''),
      fileName: String(fileInfo?.name || document?.fileName || file.name || ''),
    };
  };

  const handleSelectedFile = async (file: File) => {
    setFileName(file.name);
    setUploading(true);
    setUploadedDocumentId('');
    setUploadedFileUrl('');

    try {
      const uploaded = await uploadContractFile(file);
      setFileName(uploaded.fileName);
      setUploadedDocumentId(uploaded.documentId);
      setUploadedFileUrl(uploaded.fileUrl);
      toast.success('Uploaded');
    } catch (e: any) {
      toast.error(e?.message || 'upload failed');
      setFileName('');
      setUploadedDocumentId('');
      setUploadedFileUrl('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    void handleSelectedFile(selectedFile);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const selectedFile = event.dataTransfer.files?.[0];
    if (!selectedFile) return;
    void handleSelectedFile(selectedFile);
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const requestData = async <T,>(
    url: string,
    init: RequestInit
  ): Promise<T> => {
    const resp = await fetch(url, init);
    if (!resp.ok) {
      throw new Error(`request failed with status ${resp.status}`);
    }
    const json = await resp.json();
    if (json.code !== 0) {
      throw new Error(json.message || 'request failed');
    }
    return json.data as T;
  };

  const startParseTask = async () => {
    if (!uploadedDocumentId || !uploadedFileUrl) {
      throw new Error('Please upload a contract file first');
    }
    const data = await requestData<{
      taskId: string;
      documentId: string;
      fileUrl: string;
    }>('/api/contracts/parse/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        documentId: uploadedDocumentId,
        fileUrl: uploadedFileUrl,
      }),
    });
    return data;
  };

  const runPreAnalysis = async ({
    content,
    format,
    documentId,
    fileUrl,
  }: {
    content: string;
    format: 'text' | 'markdown';
    documentId: string;
    fileUrl: string;
  }) => {
    const data = await requestData<{
      document: any;
      analysisResult: any;
      summary: any;
    }>('/api/contracts/pre-analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        format,
        contractType: '',
        userParty: '',
        signingPlace: '',
        focusPoints: '',
        documentId,
        fileUrl,
      }),
    });
    return data;
  };

  const hasContractInput =
    Boolean(uploadedDocumentId && uploadedFileUrl) ||
    Boolean(pastedText.trim());
  const canScan = hasContractInput && !uploading && !parsing && !preAnalyzing;

  const handleScan = async () => {
    if (!canScan) {
      toast.error('Please upload a contract file or paste contract text first');
      return;
    }

    try {
      setParsingHint('');
      setPreAnalyzing(false);

      if (tab === 'upload') {
        toast.info(
          'Contract analysis can take a little longer for complex files. We will keep preparing it in your contract workspace.'
        );
        setParsing(true);
        setParsingHint('Starting parse task...');
        const started = await startParseTask();
        let readyMarkdown = '';

        for (let attempt = 0; attempt < 5; attempt += 1) {
          await sleep(2000);
          const data = await requestData<{
            taskId: string;
            state: string;
            errMsg?: string;
            progress?: {
              extractedPages: number;
              totalPages: number;
              startTime: string;
            };
            analysisResultId?: string;
            markdownContent?: string;
          }>('/api/contracts/parse/query', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              documentId: started.documentId,
              taskId: started.taskId,
            }),
          });

          if (data.state === 'failed') {
            throw new Error(String(data.errMsg || 'parse failed'));
          }

          if (data.progress?.totalPages) {
            setParsingHint(
              `Analyzing contract... (${data.progress.extractedPages}/${data.progress.totalPages})`
            );
          } else {
            setParsingHint('Analyzing contract...');
          }

          if (
            String(data.state) === 'done' &&
            String(data.markdownContent || '').trim()
          ) {
            readyMarkdown = String(data.markdownContent || '').trim();
            break;
          }
        }

        if (readyMarkdown) {
          setParsing(false);
          setPreAnalyzing(true);
          await runPreAnalysis({
            content: readyMarkdown,
            format: 'markdown',
            documentId: started.documentId,
            fileUrl: started.fileUrl,
          });
          setPreAnalyzing(false);
          toast.success(
            'Contract pre-analysis is ready. Opening your workspace.'
          );
          router.push(`/contracts/${started.documentId}`);
          return;
        }

        setParsing(false);
        toast.info(
          'Contract analysis is still running. Opening your workspace so you can continue there.'
        );
        router.push(`/contracts/${started.documentId}`);
        return;
      }

      const text = pastedText.trim();
      setPreAnalyzing(true);
      const data = await runPreAnalysis({
        content: text,
        format: 'text',
        documentId: '',
        fileUrl: '',
      });
      setPreAnalyzing(false);
      toast.success('Contract pre-analysis is ready. Opening your workspace.');
      router.push(`/contracts/${String(data.document?.id || '')}`);
    } catch (e: any) {
      setParsing(false);
      setPreAnalyzing(false);
      setParsingHint('');
      toast.error(e?.message || 'analysis failed');
    }
  };

  return (
    <section
      id={section.id}
      className={cn(
        `pt-24 pb-12 md:pt-36 md:pb-16`,
        section.className,
        className
      )}
    >
      {section.announcement && (
        <Link
          href={section.announcement.url || ''}
          target={section.announcement.target || '_self'}
          className="hover:bg-background dark:hover:border-t-border bg-muted group mx-auto mb-8 flex w-fit items-center gap-4 rounded-full border p-1 pl-4 shadow-md shadow-zinc-950/5 transition-colors duration-300 dark:border-t-white/5 dark:shadow-zinc-950"
        >
          <span className="text-foreground text-sm">
            {section.announcement.title}
          </span>
          <span className="dark:border-background block h-4 w-0.5 border-l bg-white dark:bg-zinc-700"></span>

          <div className="bg-background group-hover:bg-muted size-6 overflow-hidden rounded-full duration-500">
            <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
              <span className="flex size-6">
                <ArrowRight className="m-auto size-3" />
              </span>
              <span className="flex size-6">
                <ArrowRight className="m-auto size-3" />
              </span>
            </div>
          </div>
        </Link>
      )}

      <div className="relative mx-auto max-w-6xl px-4">
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          <div className="text-center lg:pt-12 lg:text-left">
            {texts && texts.length > 0 ? (
              <h1 className="text-foreground text-4xl font-semibold text-balance sm:text-6xl">
                {texts[0]}
                <Highlighter action="underline" color="#FF9800">
                  {highlightText}
                </Highlighter>
                {texts[1]}
              </h1>
            ) : (
              <h1 className="text-foreground text-4xl font-semibold text-balance sm:text-6xl">
                {section.title}
              </h1>
            )}

            <p
              className="text-muted-foreground mt-8 text-lg text-balance"
              dangerouslySetInnerHTML={{ __html: section.description ?? '' }}
            />

            {section.tip && (
              <p
                className="text-muted-foreground mt-6 block text-sm"
                dangerouslySetInnerHTML={{ __html: section.tip ?? '' }}
              />
            )}

            {section.show_avatars && (
              <div className="mt-6">
                <SocialAvatars tip={section.avatars_tip || ''} />
              </div>
            )}
          </div>

          <div className="bg-background/80 border-border/70 rounded-2xl border p-4 shadow-xl backdrop-blur sm:p-6">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="upload"
                  disabled={uploading || parsing || preAnalyzing}
                >
                  {tabUpload}
                </TabsTrigger>
                <TabsTrigger
                  value="paste"
                  disabled={uploading || parsing || preAnalyzing}
                >
                  {tabPasteText}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === 'upload' ? (
              <div className="mt-5">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleOpenFile}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleOpenFile();
                    }
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    'group border-border bg-muted/40 hover:bg-muted/70 relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition',
                    dragActive && 'border-primary bg-primary/5',
                    (uploading || parsing || preAnalyzing) &&
                      'cursor-not-allowed opacity-70'
                  )}
                >
                  {(uploading || parsing || preAnalyzing) && (
                    <div className="bg-background/60 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl backdrop-blur-sm">
                      <Loader2 className="text-primary size-6 animate-spin" />
                      <div className="text-foreground text-sm font-medium">
                        {uploading
                          ? 'Uploading contract...'
                          : parsing
                            ? parsingHint || 'Parsing document...'
                            : 'Analyzing contract...'}
                      </div>
                    </div>
                  )}
                  <Upload className="text-primary mb-5 size-12" />
                  <h3 className="text-foreground text-xl font-semibold">
                    {uploadTitle}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm">
                    {uploadHint}
                  </p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {uploadAcceptedHint}
                  </p>
                  {fileName && (
                    <div className="bg-background text-foreground mt-4 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-sm">
                      {uploading ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <FileText className="size-4 shrink-0" />
                      )}
                      <span className="truncate">{fileName}</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <Textarea
                  value={pastedText}
                  onChange={(event) => setPastedText(event.target.value)}
                  placeholder={pastePlaceholder}
                  className="min-h-[260px] resize-none"
                />
              </div>
            )}

            <Button
              className={cn(
                'mt-6 h-11 w-full text-base',
                !canScan && 'cursor-not-allowed opacity-50'
              )}
              aria-disabled={!canScan}
              onClick={handleScan}
            >
              {parsing ? 'Parsing...' : preAnalyzing ? 'Analyzing...' : ctaText}
            </Button>
          </div>
        </div>
      </div>

      {section.background_image?.src && (
        <div className="absolute inset-0 -z-10 hidden h-full w-full overflow-hidden md:block">
          <div className="from-background/80 via-background/80 to-background absolute inset-0 z-10 bg-gradient-to-b" />
          <Image
            src={section.background_image.src}
            alt={section.background_image.alt || ''}
            className="object-cover opacity-60 blur-[0px]"
            fill
            loading="lazy"
            sizes="(max-width: 768px) 0vw, 100vw"
            quality={70}
            unoptimized={section.background_image.src.startsWith('http')}
          />
        </div>
      )}
    </section>
  );
}
