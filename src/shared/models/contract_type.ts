import { asc, eq } from 'drizzle-orm';

import { envConfigs } from '@/config';
import { db } from '@/core/db';

export type CanonicalContractType = {
  code: string;
  nameEn: string;
  nameZh: string;
  usageScene: string;
};

async function loadContractTypeTable(): Promise<any> {
  if (envConfigs.database_provider === 'mysql') {
    return (await import('@/config/db/schema.mysql')).contractType as any;
  }

  if (['sqlite', 'turso', 'd1'].includes(envConfigs.database_provider)) {
    return (await import('@/config/db/schema.sqlite')).contractType as any;
  }

  return (await import('@/config/db/schema.postgres')).contractType as any;
}

export async function getCanonicalContractTypes(): Promise<CanonicalContractType[]> {
  const table = await loadContractTypeTable();
  if (!table) return [];

  const rows = await db()
    .select({
      code: table.code,
      nameEn: table.nameEn,
      nameZh: table.nameZh,
      usageScene: table.usageScene,
      sort: table.sort,
    })
    .from(table)
    .where(eq(table.isActive, true))
    .orderBy(asc(table.sort), asc(table.code));

  return (rows || [])
    .map((r: any) => ({
      code: String(r.code || '').trim(),
      nameEn: String(r.nameEn || '').trim(),
      nameZh: String(r.nameZh || '').trim(),
      usageScene: String(r.usageScene || '').trim(),
    }))
    .filter((r: CanonicalContractType) => Boolean(r.code));
}
