import { and, desc, eq } from 'drizzle-orm';

import { document } from '@/config/db/schema';
import { db } from '@/core/db';

export type Document = typeof document.$inferSelect;
export type NewDocument = typeof document.$inferInsert;
export type UpdateDocument = Partial<Omit<NewDocument, 'id' | 'createdAt'>>;

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
  const [result] = await db().select().from(document).where(eq(document.id, id));
  return result;
}

export async function findDocumentByFilePath(filePath: string) {
  const [result] = await db()
    .select()
    .from(document)
    .where(eq(document.filePath, filePath))
    .limit(1);
  return result;
}

export async function updateDocumentById(id: string, updateDocument: UpdateDocument) {
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
