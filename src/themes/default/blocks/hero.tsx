'use client';

import { ChangeEvent, DragEvent, useRef, useState } from 'react';

import Image from 'next/image';
import { ArrowRight, FileText, Upload } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { Button } from '@/shared/components/ui/button';
import { Highlighter } from '@/shared/components/ui/highlighter';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
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
  const [tab, setTab] = useState('upload');
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState('');
  const [pastedText, setPastedText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadCard = section.upload_card ?? {};
  const partyOptions = Array.isArray(uploadCard.party_options)
    ? uploadCard.party_options
    : [
        { value: 'party_a', label: 'Party A' },
        { value: 'party_b', label: 'Party B' },
      ];
  const defaultParty = partyOptions[0]?.value || 'party_a';
  const [party, setParty] = useState(defaultParty);

  const tabUpload = uploadCard.tab_upload ?? 'Upload';
  const tabPasteText = uploadCard.tab_paste_text ?? 'Paste Text';
  const uploadTitle = uploadCard.upload_title ?? 'Upload your contract';
  const uploadHint =
    uploadCard.upload_hint ?? 'Click to upload or drag and drop your file here';
  const uploadAcceptedHint = uploadCard.upload_accepted_hint ?? 'PDF, DOCX, TXT';
  const iAmLabel = uploadCard.i_am_label ?? 'I am';
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
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }
    setFileName(selectedFile.name);
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
    if (!selectedFile) {
      return;
    }
    setFileName(selectedFile.name);
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
                <TabsTrigger value="upload">{tabUpload}</TabsTrigger>
                <TabsTrigger value="paste">{tabPasteText}</TabsTrigger>
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
                    'group border-border bg-muted/40 hover:bg-muted/70 flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition',
                    dragActive && 'border-primary bg-primary/5'
                  )}
                >
                  <Upload className="text-primary mb-5 size-12" />
                  <h3 className="text-foreground text-xl font-semibold">
                    {uploadTitle}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm">{uploadHint}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {uploadAcceptedHint}
                  </p>
                  {fileName && (
                    <div className="bg-background text-foreground mt-4 inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-sm">
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{fileName}</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
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

            <div className="mt-5 flex items-center gap-3">
              <span className="text-muted-foreground text-sm">{iAmLabel}:</span>
              <RadioGroup
                value={party}
                onValueChange={setParty}
                className="flex flex-wrap gap-4"
              >
                {partyOptions.map(
                  (option: { label?: string; value?: string }, idx: number) => {
                    if (!option?.value || !option?.label) {
                      return null;
                    }
                    return (
                      <label
                        key={`${option.value}-${idx}`}
                        className="text-foreground flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <RadioGroupItem value={option.value} />
                        <span>{option.label}</span>
                      </label>
                    );
                  }
                )}
              </RadioGroup>
            </div>

            <Button className="mt-6 h-11 w-full text-base">{ctaText}</Button>
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
