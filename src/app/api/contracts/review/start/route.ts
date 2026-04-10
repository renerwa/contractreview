import { AITaskStatus, AIMediaType } from '@/extensions/ai';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { findAnalysisResultById, findLatestDocumentAnalysisResult, createAnalysisResult } from '@/shared/models/analysis_result';
import { createAITask, NewAITask } from '@/shared/models/ai_task';
import { getContractReviewChecklistsWithFallback } from '@/shared/models/contract_review_checklist';
import { findDocumentById, updateDocumentById } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const documentId = String(body.documentId || '');
    const analysisResultId = String(body.analysisResultId || '');
    const contractType = String(body.contractType || '').trim();
    const signingPlace = String(body.signingPlace || '').trim();
    const perspective = String(body.perspective || body.userParty || '').trim();
    const focusPoints = String(body.focusPoints || '').trim();
    const contractMarkdown = String(body.contractMarkdown || body.markdownContent || '');

    if (!documentId) {
      return respErr('documentId is required');
    }
    if (!contractType) {
      return respErr('contractType is required');
    }
    if (!perspective) {
      return respErr('perspective is required');
    }

    const document = await findDocumentById(documentId);
    if (!document || document.userId !== user.id) {
      return respErr('document not found');
    }

    let markdownContent = contractMarkdown;
    let summary = '';
    if (analysisResultId) {
      const prev = await findAnalysisResultById(analysisResultId);
      if (!prev || prev.userId !== user.id || prev.documentId !== documentId) {
        return respErr('analysisResult not found');
      }
      markdownContent = prev.markdownContent || markdownContent;
      summary = prev.summary || '';
    }
    if (!markdownContent) {
      return respErr('contractMarkdown is required');
    }

    const { checklists, resolvedSigningPlace } =
      await getContractReviewChecklistsWithFallback({
        contractType,
        signingPlace,
      });
    if (!checklists || checklists.length === 0) {
      return respErr('no review checklist found for this contractType');
    }

    const latest = await findLatestDocumentAnalysisResult(documentId, user.id);
    const version = (latest?.version || 0) + 1;
    const now = new Date();

    const reviewAnalysisResult = await createAnalysisResult({
      id: getUuid(),
      documentId,
      userId: user.id,
      status: 'processing',
      version,
      markdownContent,
      summary,
      riskScore: null,
      riskLevel: null,
      riskItems: null,
      findings: JSON.stringify({
        stage: 'review',
        contractType,
        signingPlace,
        resolvedSigningPlace,
        perspective,
        focusPoints,
        checklistCount: checklists.length,
      }),
      modelProvider: 'openrouter',
      modelName: '',
      createdAt: now,
      updatedAt: now,
    });

    await updateDocumentById(documentId, {
      contractType,
      userParty: perspective,
      signingPlace: signingPlace || document.signingPlace || '',
      focusPoints: focusPoints || document.focusPoints || '',
      updatedAt: now,
    });

    const taskOptions = {
      scene: 'contract-review',
      documentId,
      analysisResultId: reviewAnalysisResult.id,
      contractType,
      signingPlace,
      resolvedSigningPlace,
      perspective,
      focusPoints,
    };

    const model = String(body.model || '').trim() || 'openai/gpt-4o-mini';
    const newTask: NewAITask = {
      id: getUuid(),
      userId: user.id,
      mediaType: AIMediaType.TEXT,
      provider: 'openrouter',
      model,
      prompt: `contract-review:${reviewAnalysisResult.id}`,
      options: JSON.stringify(taskOptions),
      status: AITaskStatus.PENDING,
      costCredits: 0,
      scene: 'contract-review',
    };

    await createAITask(newTask);

    return respData({
      taskId: newTask.id,
      status: newTask.status,
      analysisResultId: reviewAnalysisResult.id,
      documentId,
    });
  } catch (e: any) {
    console.log('contract review start failed:', e);
    return respErr(e.message || 'contract review start failed');
  }
}
