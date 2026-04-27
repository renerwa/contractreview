import { findLatestDocumentAnalysisResult } from '@/shared/models/analysis_result';
import { findDocumentById } from '@/shared/models/document';
import { respData, respErr } from '@/shared/lib/resp';
import {
  canAccessDocument,
  getContractAccessContext,
  safeParseJsonObject,
} from '@/shared/services/contract_access';
import { preAnalyzeContract } from '@/shared/services/contract_pre_analysis';
import { queryMinerUParseAndPersist } from '@/shared/services/document_parsing';

export async function POST(req: Request) {
  try {
    const access = await getContractAccessContext();
    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    if (!documentId) {
      return respErr('documentId is required');
    }

    let document = await findDocumentById(documentId);
    if (!canAccessDocument(document, access)) {
      return respErr('document not found');
    }

    let latestAnalysisResult = await findLatestDocumentAnalysisResult(
      documentId,
      String(document?.userId || access.ownerUserId)
    );
    let parseProgress: Record<string, any> | undefined;

    const metadata = safeParseJsonObject(document?.metadata);
    const taskId = String(metadata?.documentParsing?.taskId || '').trim();
    if (document?.status === 'parsing' && taskId) {
      const parseResult = await queryMinerUParseAndPersist({
        userId: String(document?.userId || access.ownerUserId),
        sessionToken: access.sessionToken,
        documentId,
        taskId,
      });
      parseProgress = parseResult.progress;
      document = await findDocumentById(documentId);
      latestAnalysisResult = await findLatestDocumentAnalysisResult(
        documentId,
        String(document?.userId || access.ownerUserId)
      );
    }

    if (document?.status === 'parsed' && latestAnalysisResult?.markdownContent) {
      await preAnalyzeContract({
        userId: String(document?.userId || access.ownerUserId),
        sessionToken: access.sessionToken,
        input: {
          content: latestAnalysisResult.markdownContent,
          format: 'markdown',
          contractType: document.contractType || '',
          userParty: document.userParty || '',
          signingPlace: document.signingPlace || '',
          focusPoints: document.focusPoints || '',
          documentId,
          fileUrl: String(document.filePath || ''),
        },
      });
      document = await findDocumentById(documentId);
      latestAnalysisResult = await findLatestDocumentAnalysisResult(
        documentId,
        String(document?.userId || access.ownerUserId)
      );
    }

    return respData({
      document,
      analysisResult: latestAnalysisResult || null,
      summary: buildSummary(document, latestAnalysisResult),
      parseProgress,
    });
  } catch (e: any) {
    console.log('contract detail query failed:', e);
    return respErr(e.message || 'contract detail query failed');
  }
}

function buildSummary(document: any, analysisResult: any) {
  if (!document && !analysisResult) {
    return null;
  }

  const findings = safeParseJsonObject(analysisResult?.findings);
  return {
    isContract:
      typeof findings?.isContract === 'boolean'
        ? findings.isContract
        : String(document?.status || '') !== 'non_contract',
    nonContractReason: String(findings?.nonContractReason || ''),
    contractType: String(document?.contractType || ''),
    contractSubtype: String(document?.contractSubtype || ''),
    language: String(document?.sourceLanguage || ''),
    signingPlace: String(document?.signingPlace || ''),
    signingPlaceCountry: String(findings?.signingPlaceCountry || ''),
    signingPlaceCity: String(findings?.signingPlaceCity || ''),
    userParty: String(document?.userParty || ''),
    summary: String(analysisResult?.summary || ''),
    keyPoints: Array.isArray(findings?.keyPoints)
      ? findings.keyPoints.map((item: any) => String(item)).filter(Boolean)
      : [],
  };
}
