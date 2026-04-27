import { setRequestLocale } from 'next-intl/server';

import { ContractDetailPage } from '@/shared/blocks/contracts/contract-detail-page';

export default async function ContractDetailRoute({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <ContractDetailPage documentId={id} locale={locale} />;
}
