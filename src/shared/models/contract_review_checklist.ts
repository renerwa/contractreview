import { and, asc, eq, or } from 'drizzle-orm';

import { contractReviewChecklist, contractType } from '@/config/db/schema';
import { db } from '@/core/db';

export type ContractReviewChecklist = typeof contractReviewChecklist.$inferSelect;
export type NewContractReviewChecklist =
  typeof contractReviewChecklist.$inferInsert;
export type UpdateContractReviewChecklist = Partial<
  Omit<NewContractReviewChecklist, 'id' | 'createdAt'>
>;

async function resolveContractTypeIdByCode(code: string) {
  const resolved = String(code || '').trim();
  if (!resolved) return '';

  const rows = await db()
    .select({ id: contractType.id })
    .from(contractType)
    .where(eq(contractType.code, resolved))
    .limit(1);

  return rows[0]?.id || '';
}

/**
 * 获取合同审核检查列表
 * @param contractType 合同类型
 * @param contractTypeId 合同类型ID
 * @param signingPlace 签名地点
 * @param isActive 是否激活
 * @returns 合同审核检查列表
 */
export async function getContractReviewChecklists({
  contractType,
  contractTypeId,
  signingPlace,
  isActive = true,
}: {
  contractType: string;
  contractTypeId?: string;
  signingPlace?: string;
  isActive?: boolean;
}) {
  const resolvedSigningPlace = String(signingPlace || '').trim();
  const resolvedContractTypeId =
    String(contractTypeId || '').trim() || (await resolveContractTypeIdByCode(contractType));

  const typePredicate = resolvedContractTypeId
    ? or(
        eq(contractReviewChecklist.contractTypeId, resolvedContractTypeId),
        eq(contractReviewChecklist.contractType, contractType)
      )
    : eq(contractReviewChecklist.contractType, contractType);

  const result = await db()
    .select()
    .from(contractReviewChecklist)
    .where(
      and(
        typePredicate,
        resolvedSigningPlace
          ? eq(contractReviewChecklist.signingPlace, resolvedSigningPlace)
          : undefined,
        eq(contractReviewChecklist.isActive, isActive)
      )
    )
    .orderBy(asc(contractReviewChecklist.sort));

  return result;
}

/**
 * 获取合同审核检查列表，根据合同类型和签名地点
 * @param contractType 合同类型
 * @param contractTypeId 合同类型ID
 * @param signingPlace 签名地点
 * @returns 合同审核检查列表
 */
export async function getContractReviewChecklistsWithFallback({
  contractType,
  contractTypeId,
  signingPlace,
}: {
  contractType: string;
  contractTypeId?: string;
  signingPlace?: string;
}) {
  const resolvedSigningPlace = String(signingPlace || '').trim();
  if (resolvedSigningPlace) {
    const byPlace = await getContractReviewChecklists({
      contractType,
      contractTypeId,
      signingPlace: resolvedSigningPlace,
    });
    if (byPlace.length > 0) {
      return { checklists: byPlace, resolvedSigningPlace };
    }
  }

  const byType = await getContractReviewChecklists({
    contractType,
    contractTypeId,
  });
  if (byType.length > 0) {
    return { checklists: byType, resolvedSigningPlace: '' };
  }

  return { checklists: [], resolvedSigningPlace: resolvedSigningPlace || '' };
}
