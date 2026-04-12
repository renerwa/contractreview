import { respData, respErr } from '@/shared/lib/resp';
import { findAnalysisResultById } from '@/shared/models/analysis_result';
import { findDocumentById } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';
import { queryMinerUParseAndPersist } from '@/shared/services/document_parsing';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    // 从请求体中获取文档 ID 和任务 ID
    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    const taskIdFromBody = String(body.taskId || '').trim();

    if (!documentId) {
      return respErr('documentId is required');
    }

    // 从数据库中查询文档信息，后面会从文档元数据中提取解析任务 ID
    const document = await findDocumentById(documentId);
    if (!document || document.userId !== user.id) {
      return respErr('document not found');
    }

    // 从文档元数据中提取解析任务 ID
    const metadata = safeParseJsonObject(document.metadata);
    const taskId =
      taskIdFromBody || String(metadata?.documentParsing?.taskId || '').trim();
    if (!taskId) {
      return respErr('taskId is required');
    }

    // 查询MinerU合同文档解析任务状态并持久化结果
    const result = await queryMinerUParseAndPersist({
      userId: user.id,
      documentId,
      taskId,
    });

    const markdownContent = result.analysisResultId
      ? await tryGetMarkdownContent(result.analysisResultId, user.id)
      : '';

    return respData({
      documentId,
      ...result,
      markdownContent,
    });
  } catch (e: any) {
    console.log('contract parse query failed:', e);
    return respErr(e.message || 'contract parse query failed');
  }
}

async function tryGetMarkdownContent(analysisResultId: string, userId: string) {
  try {
    const analysis = await findAnalysisResultById(analysisResultId);
    if (!analysis || analysis.userId !== userId) {
      return '';
    }
    return String(analysis.markdownContent || '');
  } catch (_) {
    return '';
  }
}

function safeParseJsonObject(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return {};
  } catch (_) {
    return {};
  }
}
