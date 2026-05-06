import { respData, respErr } from '@/shared/lib/resp';
import { findAnalysisResultById } from '@/shared/models/analysis_result';
import { findDocumentById } from '@/shared/models/document';
import {
  canAccessDocument,
  getContractAccessContext,
} from '@/shared/services/contract_access';
import { queryMinerUParseAndPersist } from '@/shared/services/document_parsing';

export async function POST(req: Request) {
  try {
    const access = await getContractAccessContext();

    // 从请求体中获取文档 ID 和任务 ID
    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    const taskIdFromBody = String(body.taskId || '').trim();

    if (!documentId) {
      return respErr('documentId is required');
    }

    // 从数据库中查询文档信息，后面会从文档元数据中提取解析任务 ID
    const document = await findDocumentById(documentId);
    if (!canAccessDocument(document, access)) {
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
      userId: document.userId,
      sessionToken: access.sessionToken,
      documentId,
      taskId,
    });

    const markdownContent = result.analysisResultId
      ? await tryGetMarkdownContent(result.analysisResultId)
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

async function tryGetMarkdownContent(analysisResultId: string) {
  try {
    const analysis = await findAnalysisResultById(analysisResultId);
    if (!analysis) {
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
