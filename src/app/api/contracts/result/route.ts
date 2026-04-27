import { findAnalysisResultById } from '@/shared/models/analysis_result';
import { findDocumentById } from '@/shared/models/document';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { safeParseJsonObject } from '@/shared/services/contract_access';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    const analysisResultId = String(body.analysisResultId || '').trim();

    if (!documentId) {
      return respErr('documentId is required');
    }

    const document = await findDocumentById(documentId);
    if (!document || document.userId !== user.id) {
      return respErr('document not found');
    }

    const metadata = safeParseJsonObject(document.metadata);
    const targetAnalysisId =
      analysisResultId ||
      String(metadata?.contractAccess?.reviewTask?.analysisResultId || '').trim();

    const analysisResult = targetAnalysisId
      ? await findAnalysisResultById(targetAnalysisId)
      : null;

    return respData({
      document,
      analysisResult,
      reviewTask: metadata?.contractAccess?.reviewTask || null,
      reviewSetup: metadata?.contractAccess?.reviewSetup || null,
    });
  } catch (e: any) {
    console.log('contract result query failed:', e);
    return respErr(e.message || 'contract result query failed');
  }
}
