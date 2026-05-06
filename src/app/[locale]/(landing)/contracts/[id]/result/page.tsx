import { setRequestLocale } from 'next-intl/server';

import { ContractResultPage } from '@/shared/blocks/contracts/contract-result-page';

export default async function ContractResultRoute({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  return <ContractResultPage documentId={id} />;
}
