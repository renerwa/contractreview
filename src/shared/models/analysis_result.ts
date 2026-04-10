import { and, desc, eq } from 'drizzle-orm';

import { analysisResult } from '@/config/db/schema';
import { db } from '@/core/db';

export type AnalysisResult = typeof analysisResult.$inferSelect;
export type NewAnalysisResult = typeof analysisResult.$inferInsert;
export type UpdateAnalysisResult = Partial<
  Omit<NewAnalysisResult, 'id' | 'createdAt'>
>;

/**
 * 创建合同分析结果
 * @param newAnalysisResult 合同分析结果
 * @returns 创建的合同分析结果
 */
export async function createAnalysisResult(newAnalysisResult: NewAnalysisResult) {
  const [result] = await db()
    .insert(analysisResult)
    .values(newAnalysisResult)
    .returning();
  return result;
}

export async function findAnalysisResultById(id: string) {
  const [result] = await db()
    .select()
    .from(analysisResult)
    .where(eq(analysisResult.id, id));
  return result;
}

/**
 * 根据合同文档ID和用户ID查询合同文档的最新分析结果
 * @param documentId 合同文档ID
 * @param userId 用户ID
 * @returns 合同文档的最新分析结果
 */
export async function findLatestDocumentAnalysisResult(
  documentId: string,
  userId: string
) {
  // 根据documentId和userId查询合同文档的最新分析结果
  const [result] = await db()
    .select()
    .from(analysisResult)
    .where(
      and(
        eq(analysisResult.documentId, documentId),
        eq(analysisResult.userId, userId)
      )
    )
    .orderBy(desc(analysisResult.version), desc(analysisResult.createdAt))
    .limit(1);
  return result;
}

export async function updateAnalysisResultById(
  id: string,
  updateData: UpdateAnalysisResult
) {
  const [result] = await db()
    .update(analysisResult)
    .set(updateData)
    .where(eq(analysisResult.id, id))
    .returning();
  return result;
}
