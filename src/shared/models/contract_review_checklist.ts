import { and, asc, eq } from 'drizzle-orm';

import { contractReviewChecklist } from '@/config/db/schema';
import { db } from '@/core/db';

export type ContractReviewChecklist = typeof contractReviewChecklist.$inferSelect;
export type NewContractReviewChecklist =
  typeof contractReviewChecklist.$inferInsert;
export type UpdateContractReviewChecklist = Partial<
  Omit<NewContractReviewChecklist, 'id' | 'createdAt'>
>;

/**
 * 获取合同审核检查列表
 * @param contractType 合同类型
 * @param signingPlace 签名地点
 * @param isActive 是否激活
 * @returns 合同审核检查列表
 */
export async function getContractReviewChecklists({
  contractType,
  signingPlace,
  isActive = true,
}: {
  contractType: string;
  signingPlace?: string;
  isActive?: boolean;
}) {
  const resolvedSigningPlace = String(signingPlace || '').trim();

  const result = await db()
    .select()
    .from(contractReviewChecklist)
    .where(
      and(
        eq(contractReviewChecklist.contractType, contractType),
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
 * @param signingPlace 签名地点
 * @returns 合同审核检查列表
 */
export async function getContractReviewChecklistsWithFallback({
  contractType,
  signingPlace,
}: {
  contractType: string;
  signingPlace?: string;
}) {
  const resolvedSigningPlace = String(signingPlace || '').trim();
  if (resolvedSigningPlace) {
    const byPlace = await getContractReviewChecklists({
      contractType,
      signingPlace: resolvedSigningPlace,
    });
    if (byPlace.length > 0) {
      return { checklists: byPlace, resolvedSigningPlace };
    }
  }

  const byType = await getContractReviewChecklists({
    contractType,
  });
  if (byType.length > 0) {
    return { checklists: byType, resolvedSigningPlace: '' };
  }

  return { checklists: [], resolvedSigningPlace: resolvedSigningPlace || '' };
}
