import { and, eq } from 'drizzle-orm';

import { analysisResult } from '@/config/db/schema';
import { db } from '@/core/db';
import { respData, respErr } from '@/shared/lib/resp';
import { findDocumentById, updateDocumentById } from '@/shared/models/document';
import { getContractAccessContext, canAccessDocument } from '@/shared/services/contract_access';

export async function POST(req: Request) {
  try {
    const access = await getContractAccessContext();
    if (!access.user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    if (!documentId) {
      return respErr('documentId is required');
    }

    const document = await findDocumentById(documentId);
    if (!canAccessDocument(document, access)) {
      return respErr('document not found');
    }

    if (!document) {
      return respErr('document not found');
    }

    if (document.userId === access.user.id) {
      return respData({ document, claimed: false });
    }

    const now = new Date();
    const updatedDocument = await updateDocumentById(documentId, {
      userId: access.user.id,
      updatedAt: now,
    });

    await db()
      .update(analysisResult)
      .set({
        userId: access.user.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(analysisResult.documentId, documentId),
          eq(analysisResult.userId, document.userId)
        )
      );

    return respData({
      document: updatedDocument,
      claimed: true,
    });
  } catch (e: any) {
    console.log('claim contract failed:', e);
    return respErr(e.message || 'claim contract failed');
  }
}
