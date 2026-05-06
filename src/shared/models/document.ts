import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { analysisResult, document } from '@/config/db/schema';

export type Document = typeof document.$inferSelect;
export type NewDocument = typeof document.$inferInsert;
export type UpdateDocument = Partial<Omit<NewDocument, 'id' | 'createdAt'>>;
type AnalysisResultRecord = typeof analysisResult.$inferSelect;

export type DocumentWithReviewMeta = Document & {
  latestAnalysisResult: {
    id: string;
    status: string;
    riskScore: number | null;
    riskLevel: string | null;
    riskItemCount: number;
    highRiskCount: number;
    mediumRiskCount: number;
    lowRiskCount: number;
    updatedAt: Date;
  } | null;
};

/**
 * 创建合同文档
 * @param newDocument 合同文档数据
 * @returns 创建的合同文档
 */
export async function createDocument(newDocument: NewDocument) {
  const [result] = await db().insert(document).values(newDocument).returning();
  return result;
}

/**
 * 根据ID查找合同文档
 * @param id 合同文档ID
 * @returns 合同文档
 */
export async function findDocumentById(id: string) {
  const [result] = await db()
    .select()
    .from(document)
    .where(eq(document.id, id));
  return result;
}
/**
 * 根据文件路径查找合同文档
 * @param filePath 合同文档文件路径
 * @returns 合同文档
 */
export async function findDocumentByFilePath(filePath: string) {
  const [result] = await db()
    .select()
    .from(document)
    .where(eq(document.filePath, filePath))
    .limit(1);
  return result;
}

export async function updateDocumentById(
  id: string,
  updateDocument: UpdateDocument
) {
  const [result] = await db()
    .update(document)
    .set(updateDocument)
    .where(eq(document.id, id))
    .returning();
  return result;
}

export async function getUserDocuments({
  userId,
  status,
  limit = 30,
  page = 1,
}: {
  userId: string;
  status?: string;
  limit?: number;
  page?: number;
}) {
  const result = await db()
    .select()
    .from(document)
    .where(
      and(
        eq(document.userId, userId),
        status ? eq(document.status, status) : undefined
      )
    )
    .orderBy(desc(document.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  return result;
}

export async function getUserDocumentsWithReviewMeta({
  userId,
  status,
  limit = 30,
  page = 1,
}: {
  userId: string;
  status?: string;
  limit?: number;
  page?: number;
}): Promise<DocumentWithReviewMeta[]> {
  const documents = await getUserDocuments({
    userId,
    status,
    limit,
    page,
  });

  if (documents.length === 0) {
    return [];
  }

  const documentIds = documents.map((item: Document) => item.id);
  const analysisResults = await db()
    .select()
    .from(analysisResult)
    .where(
      and(
        eq(analysisResult.userId, userId),
        inArray(analysisResult.documentId, documentIds)
      )
    )
    .orderBy(desc(analysisResult.version), desc(analysisResult.createdAt));

  const latestAnalysisByDocumentId = new Map<string, AnalysisResultRecord>();
  for (const item of analysisResults) {
    if (!latestAnalysisByDocumentId.has(item.documentId)) {
      latestAnalysisByDocumentId.set(item.documentId, item);
    }
  }

  return documents.map((item: Document) => {
    // 核心逻辑：列表页审核摘要必须跟“合同正式审核完成”保持同一业务口径，
    // 只有文档主状态为 reviewed 时，才允许挂载正式审核结果，避免把预分析或其他已完成分析误显示成正式审核卡片。
    const latestAnalysis =
      String(item.status || '') === 'reviewed'
        ? latestAnalysisByDocumentId.get(item.id)
        : undefined;
    const riskMeta = getRiskMeta(latestAnalysis?.riskItems);

    return {
      ...item,
      latestAnalysisResult: latestAnalysis
        ? {
            id: latestAnalysis.id,
            status: latestAnalysis.status,
            riskScore: latestAnalysis.riskScore,
            riskLevel: latestAnalysis.riskLevel,
            riskItemCount: riskMeta.total,
            highRiskCount: riskMeta.high,
            mediumRiskCount: riskMeta.medium,
            lowRiskCount: riskMeta.low,
            updatedAt: latestAnalysis.updatedAt,
          }
        : null,
    };
  });
}

function getRiskMeta(rawRiskItems: string | null | undefined) {
  if (!rawRiskItems) {
    return { total: 0, high: 0, medium: 0, low: 0 };
  }

  try {
    const parsed = JSON.parse(rawRiskItems);
    const reviewDetails = Array.isArray(parsed?.review_details)
      ? parsed.review_details
      : [];
    const additionalCriticalRisks = Array.isArray(parsed?.additional_critical_risks)
      ? parsed.additional_critical_risks
      : [];
    const combinedRiskItems = [...reviewDetails, ...additionalCriticalRisks];

    const levelCounts = combinedRiskItems.reduce(
      (acc: { high: number; medium: number; low: number }, item: any) => {
        const normalized = String(
          item?.status || item?.risk_level || item?.severity || item?.level || ''
        )
          .trim()
          .toLowerCase();

        if (normalized === 'high') acc.high += 1;
        else if (normalized === 'medium') acc.medium += 1;
        else if (normalized === 'low') acc.low += 1;

        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );

    // 核心逻辑：列表页摘要卡片与结果页保持同一统计口径，统一基于合并后的风险项做总数与分级统计
    return {
      total: combinedRiskItems.length,
      high: levelCounts.high,
      medium: levelCounts.medium,
      low: levelCounts.low,
    };
  } catch (_) {
    return { total: 0, high: 0, medium: 0, low: 0 };
  }
}
