import { AITaskStatus } from '@/extensions/ai';
import { respData, respErr } from '@/shared/lib/resp';
import { findAnalysisResultById, updateAnalysisResultById } from '@/shared/models/analysis_result';
import { findAITaskById, updateAITaskById } from '@/shared/models/ai_task';
import { getContractReviewChecklistsWithFallback } from '@/shared/models/contract_review_checklist';
import { findDocumentById, updateDocumentById } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';
import { withContractAccessMetadata } from '@/shared/services/contract_access';
import { calcRiskLevelFromReport, generateContractReviewReport } from '@/shared/services/contract_review';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const { taskId } = await req.json();
    if (!taskId) {
      return respErr('taskId is required');
    }

    const task = await findAITaskById(String(taskId));
    if (!task) {
      return respErr('task not found');
    }
    if (task.userId !== user.id) {
      return respErr('no permission');
    }

    const options = safeParse(task.options);
    const analysisResultId = String(options.analysisResultId || '');
    const documentId = String(options.documentId || '');
    const contractType = String(options.contractType || '');
    const signingPlace = String(options.signingPlace || '');
    const perspective = String(options.perspective || '');
    const focusPoints = String(options.focusPoints || '');

    if (!analysisResultId || !documentId) {
      return respErr('invalid task options');
    }

    if (task.status === AITaskStatus.SUCCESS && task.taskResult) {
      const analysisResult = await findAnalysisResultById(analysisResultId);
      return respData({
        task,
        analysisResult,
        report: safeParse(task.taskResult),
      });
    }

    if (task.status === AITaskStatus.FAILED) {
      const analysisResult = await findAnalysisResultById(analysisResultId);
      return respData({
        task,
        analysisResult,
        report: task.taskResult ? safeParse(task.taskResult) : null,
      });
    }

    if (task.status === AITaskStatus.PROCESSING) {
      const analysisResult = await findAnalysisResultById(analysisResultId);
      return respData({ task, analysisResult });
    }

    await updateAITaskById(task.id, { status: AITaskStatus.PROCESSING });
    task.status = AITaskStatus.PROCESSING;

    const document = await findDocumentById(documentId);
    if (!document || document.userId !== user.id) {
      await updateAITaskById(task.id, {
        status: AITaskStatus.FAILED,
        taskResult: JSON.stringify({ error: 'document not found' }),
      });
      return respErr('document not found');
    }

    const analysisResult = await findAnalysisResultById(analysisResultId);
    if (!analysisResult || analysisResult.userId !== user.id) {
      await updateAITaskById(task.id, {
        status: AITaskStatus.FAILED,
        taskResult: JSON.stringify({ error: 'analysisResult not found' }),
      });
      return respErr('analysisResult not found');
    }

    const { checklists, resolvedSigningPlace } =
      await getContractReviewChecklistsWithFallback({
        contractType: contractType || document.contractType || '',
        signingPlace: signingPlace || document.signingPlace || '',
      });
    if (!checklists || checklists.length === 0) {
      await updateAITaskById(task.id, {
        status: AITaskStatus.FAILED,
        taskResult: JSON.stringify({ error: 'no review checklist found' }),
      });
      return respErr('no review checklist found');
    }

    try {
      const report = await generateContractReviewReport({
        contractMarkdown: analysisResult.markdownContent,
        contractType: contractType || document.contractType || '',
        perspective,
        signingPlace: signingPlace || resolvedSigningPlace || document.signingPlace || '',
        focusPoints,
        checklist: checklists,
        model: task.model || undefined,
      });

      const riskScore = Number(report?.overview?.total_risk_score ?? 0);
      const riskLevel = calcRiskLevelFromReport(report);
      const now = new Date();

      await updateAnalysisResultById(analysisResultId, {
        status: 'completed',
        riskScore: Number.isFinite(riskScore) ? riskScore : null,
        riskLevel,
        riskItems: JSON.stringify({
          review_details: report.review_details,
          additional_critical_risks: report.additional_critical_risks,
        }),
        findings: JSON.stringify({
          report,
          checklistMeta: {
            contractType: contractType || document.contractType || '',
            signingPlace: signingPlace || document.signingPlace || '',
            resolvedSigningPlace,
            checklistCount: checklists.length,
          },
          generatedAt: now.toISOString(),
        }),
        updatedAt: now,
      });

      await updateAITaskById(task.id, {
        status: AITaskStatus.SUCCESS,
        taskResult: JSON.stringify(report),
        updatedAt: now,
      });
      await updateDocumentById(documentId, {
        status: 'reviewed',
        metadata: withContractAccessMetadata(document.metadata, {
          reviewTask: {
            taskId: task.id,
            analysisResultId,
            status: AITaskStatus.SUCCESS,
            finishedAt: now.toISOString(),
          },
        }),
        updatedAt: now,
      });

      const updatedAnalysisResult = await findAnalysisResultById(analysisResultId);

      return respData({
        task: { ...task, status: AITaskStatus.SUCCESS },
        analysisResult: updatedAnalysisResult,
        report,
      });
    } catch (e: any) {
      const now = new Date();
      await updateAnalysisResultById(analysisResultId, {
        status: 'failed',
        findings: JSON.stringify({
          error: e?.message || 'contract review failed',
          failedAt: now.toISOString(),
        }),
        updatedAt: now,
      });
      await updateAITaskById(task.id, {
        status: AITaskStatus.FAILED,
        taskResult: JSON.stringify({ error: e?.message || 'contract review failed' }),
        updatedAt: now,
      });
      await updateDocumentById(documentId, {
        status: 'review_failed',
        metadata: withContractAccessMetadata(document.metadata, {
          reviewTask: {
            taskId: task.id,
            analysisResultId,
            status: AITaskStatus.FAILED,
            finishedAt: now.toISOString(),
          },
        }),
        updatedAt: now,
      });
      return respErr(e?.message || 'contract review failed');
    }
  } catch (e: any) {
    console.log('contract review query failed:', e);
    return respErr(e.message || 'contract review query failed');
  }
}

function safeParse(input: any) {
  if (!input || typeof input !== 'string') return {};
  try {
    return JSON.parse(input);
  } catch (_) {
    return {};
  }
}
