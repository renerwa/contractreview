import { findDocumentById, updateDocumentById } from '@/shared/models/document';
import { respData, respErr } from '@/shared/lib/resp';
import {
  canAccessDocument,
  getContractAccessContext,
  withContractAccessMetadata,
} from '@/shared/services/contract_access';

export async function POST(req: Request) {
  try {
    const access = await getContractAccessContext();
    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    if (!documentId) {
      return respErr('documentId is required');
    }

    const document = await findDocumentById(documentId);
    if (!canAccessDocument(document, access)) {
      return respErr('document not found');
    }

    const perspective = String(
      body.perspective || body.userParty || 'neutral'
    ).trim();
    const signingPlace = String(body.signingPlace || '').trim();
    const focusPoints = String(body.focusPoints || '').trim();
    const outputLanguage = String(body.outputLanguage || '').trim();
    const now = new Date();

    const updated = await updateDocumentById(documentId, {
      status: 'review_setup_ready',
      userParty: perspective,
      signingPlace,
      focusPoints,
      metadata: withContractAccessMetadata(document?.metadata, {
        sessionToken: access.sessionToken,
        accessMode: access.isAnonymous ? 'anonymous' : 'user',
        reviewSetup: {
          perspective,
          signingPlace,
          outputLanguage,
          focusPoints,
          savedAt: now.toISOString(),
        },
      }),
      updatedAt: now,
    });

    return respData({
      document: updated,
      reviewSetup: {
        perspective,
        signingPlace,
        outputLanguage,
        focusPoints,
      },
    });
  } catch (e: any) {
    console.log('save review setup failed:', e);
    return respErr(e.message || 'save review setup failed');
  }
}
