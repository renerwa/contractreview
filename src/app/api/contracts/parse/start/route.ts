import { respData, respErr } from '@/shared/lib/resp';
import {
  findDocumentByFilePath,
  findDocumentById,
  updateDocumentById,
} from '@/shared/models/document';
import {
  canAccessDocument,
  getContractAccessContext,
} from '@/shared/services/contract_access';
import { startMinerUParseByUrl } from '@/shared/services/document_parsing';

export async function POST(req: Request) {
  try {
    const access = await getContractAccessContext();

    const body = await req.json();
    const documentId = String(body.documentId || '').trim();
    const fileUrl = String(body.fileUrl || body.url || '').trim();

    if (!documentId && !fileUrl) {
      return respErr('documentId or fileUrl is required');
    }

    const document = documentId
      ? await findDocumentById(documentId)
      : await findDocumentByFilePath(fileUrl);

    if (!canAccessDocument(document, access)) {
      return respErr('document not found');
    }

    const url = fileUrl || String(document.filePath || '').trim();
    if (!url) {
      return respErr('fileUrl is required');
    }

    const { taskId } = await startMinerUParseByUrl({ fileUrl: url });

    // 更新数据库记录，记录解析任务 ID、开始时间、文件 URL、状态为待处理
    const now = new Date();
    await updateDocumentById(document.id, {
      status: 'parsing',
      metadata: mergeJson(document.metadata, {
        documentParsing: {
          provider: 'mineru',
          taskId,
          state: 'pending',
          fileUrl: url,
          startedAt: now.toISOString(),
        },
      }),
      updatedAt: now,
    });

    return respData({
      taskId,
      documentId: document.id,
      fileUrl: url,
    });
  } catch (e: any) {
    console.log('contract parse start failed:', e);
    return respErr(e.message || 'contract parse start failed');
  }
}

/**
 * 合并 JSON 字符串
 * @param raw 原始 JSON 字符串
 * @param patch 要合并的 JSON 对象
 * @returns 合并后的 JSON 字符串
 */
function mergeJson(raw: any, patch: Record<string, any>) {
  const base = safeParseJsonObject(raw);
  return JSON.stringify({ ...base, ...patch });
}

/**
 * 安全解析 JSON 字符串为对象
 * @param raw 原始 JSON 字符串
 * @returns 解析后的 JSON 对象
 */
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
