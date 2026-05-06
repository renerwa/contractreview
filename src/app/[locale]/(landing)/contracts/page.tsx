import { setRequestLocale } from 'next-intl/server';

import { MyContractsPage } from '@/shared/blocks/contracts/my-contracts-page';

export default async function MyContractsRoute({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MyContractsPage />;
}
