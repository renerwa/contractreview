import { getUuid } from '@/shared/lib/hash';
import {
  createAnalysisResult,
  findLatestDocumentAnalysisResult,
} from '@/shared/models/analysis_result';
import { getAllConfigs } from '@/shared/models/config';
import { findDocumentById, updateDocumentById } from '@/shared/models/document';
import { canAccessDocument } from '@/shared/services/contract_access';

type MinerUTaskState = 'done' | 'pending' | 'running' | 'failed' | 'converting';

export type DocumentParsingStartResult = {
  taskId: string;
};

export type DocumentParsingQueryResult = {
  taskId: string;
  state: MinerUTaskState;
  errMsg: string;
  progress?: {
    extractedPages: number;
    totalPages: number;
    startTime: string;
  };
  analysisResultId?: string;
};

/**
 * 启动MinerU合同文档解析任务
 * @param fileUrl 合同文档文件 URL
 * @returns 解析任务 ID
 */
export async function startMinerUParseByUrl({
  fileUrl,
}: {
  fileUrl: string;
}): Promise<DocumentParsingStartResult> {
  const configs = await getAllConfigs();
  const token = String((configs as any).mineru_api_token || '').trim();
  const taskUrl = String((configs as any).mineru_extract_task_url || '').trim();
  if (!token) {
    throw new Error('mineru_api_token is not set');
  }
  if (!taskUrl) {
    throw new Error('mineru_extract_task_url is not set');
  }

  const resp = await fetch(taskUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      accept: '*/*',
    },
    body: JSON.stringify({
      url: fileUrl,
      model_version: 'vlm',
    }),
  });

  if (!resp.ok) {
    throw new Error(`mineru request failed with status ${resp.status}`);
  }

  const result = await resp.json();
  if (result?.code !== 0 || !result?.data?.task_id) {
    throw new Error(result?.msg || 'mineru create task failed');
  }

  return { taskId: String(result.data.task_id) };
}

/**
 * 查询MinerU合同文档解析任务状态并持久化结果
 * @param userId 用户 ID
 * @param documentId 文档 ID
 * @param taskId 解析任务 ID
 * @returns 解析任务状态、错误信息、进度、分析结果 ID
 */
export async function queryMinerUParseAndPersist({
  userId,
  sessionToken,
  documentId,
  taskId,
}: {
  userId: string;
  sessionToken?: string;
  documentId: string;
  taskId: string;
}): Promise<DocumentParsingQueryResult> {
  const configs = await getAllConfigs();
  const token = String((configs as any).mineru_api_token || '').trim();
  const taskUrl = String((configs as any).mineru_extract_task_url || '').trim();
  if (!token) {
    throw new Error('mineru_api_token is not set');
  }
  if (!taskUrl) {
    throw new Error('mineru_extract_task_url is not set');
  }

  const queryUrl = buildMinerUQueryUrl(taskUrl, taskId);
  const resp = await fetch(queryUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      accept: '*/*',
    },
  });

  if (!resp.ok) {
    throw new Error(`mineru request failed with status ${resp.status}`);
  }

  const result = await resp.json();
  if (result?.code !== 0 || !result?.data?.task_id) {
    throw new Error(result?.msg || 'mineru query task failed');
  }

  const state = String(result.data.state || '') as MinerUTaskState;
  const errMsg = String(result.data.err_msg || '');

  // 从MinerU合同文档解析任务结果中提取文件解析进度（如果有），包含已解析页数、总页数、开始时间等
  const progress = result.data.extract_progress
    ? {
        extractedPages: Number(
          result.data.extract_progress.extracted_pages || 0
        ),
        totalPages: Number(result.data.extract_progress.total_pages || 0),
        startTime: String(result.data.extract_progress.start_time || ''),
      }
    : undefined;

  // 如果解析任务状态不是 done，直接返回
  if (state !== 'done') {
    return { taskId, state, errMsg, progress };
  }

  // 如果解析任务状态是 done，从MinerU合同文档解析任务结果中提取文件解析结果压缩包（里面包含Markdown结果）
  const zipUrl = String(result.data.full_zip_url || '').trim();
  if (!zipUrl) {
    throw new Error('mineru result zip url is empty');
  }

  try {
    const markdownContent = await fetchFullMdFromMinerUZip(zipUrl);
    const analysisResultId = await persistMarkdownToAnalysisResult({
      userId,
      sessionToken,
      documentId,
      taskId,
      zipUrl,
      markdownContent,
    });
    return { taskId, state, errMsg, analysisResultId };
  } catch (e: any) {
    return {
      taskId,
      state: 'converting',
      errMsg: e?.message ? String(e.message) : 'download parse result failed',
    };
  }
}

function buildMinerUQueryUrl(createTaskUrl: string, taskId: string) {
  const raw = String(createTaskUrl || '').trim();
  if (!raw) {
    throw new Error('mineru task url is empty');
  }
  if (raw.includes('{task_id}')) {
    return raw.replaceAll('{task_id}', encodeURIComponent(taskId));
  }
  return `${raw.replace(/\/$/, '')}/${encodeURIComponent(taskId)}`;
}

/**
 * 持久化MinerU合同文档解析任务结果
 * @param userId 用户 ID
 * @param documentId 文档 ID
 * @param taskId 解析任务 ID
 * @param zipUrl 解析结果压缩包 URL
 * @param markdownContent 解析结果 Markdown 内容
 * @returns 分析结果 ID
 */
async function persistMarkdownToAnalysisResult({
  userId,
  sessionToken,
  documentId,
  taskId,
  zipUrl,
  markdownContent,
}: {
  userId: string;
  sessionToken?: string;
  documentId: string;
  taskId: string;
  zipUrl: string;
  markdownContent: string;
}) {
  const now = new Date();

  const doc = await findDocumentById(documentId);
  if (
    !canAccessDocument(doc, {
      user: null,
      ownerUserId: userId,
      sessionToken: sessionToken || '',
    })
  ) {
    throw new Error('document not found');
  }

  // 根据文档 ID 和用户 ID 查找最新分析结果版本号，在基础版本号上递增为新版本号
  const latest = await findLatestDocumentAnalysisResult(documentId, userId);
  const version = (latest?.version || 0) + 1;

  // 创建新的分析结果记录
  const analysisResult = await createAnalysisResult({
    id: getUuid(),
    documentId,
    userId,
    status: 'completed',
    version,
    markdownContent,
    summary: '',
    riskScore: null,
    riskLevel: null,
    riskItems: null,
    findings: JSON.stringify({
      stage: 'document_parsing',
      provider: 'mineru',
      taskId,
      zipUrl,
    }),
    modelProvider: 'mineru',
    modelName: 'vlm',
    createdAt: now,
    updatedAt: now,
  });

  // 更新文档元数据，记录解析任务状态和分析结果 ID
  const nextMetadata = mergeJson(doc.metadata, {
    documentParsing: {
      provider: 'mineru',
      taskId,
      zipUrl,
      state: 'done',
      analysisResultId: analysisResult.id,
      parsedAt: now.toISOString(),
    },
  });

  await updateDocumentById(documentId, {
    status: 'parsed',
    metadata: nextMetadata,
    updatedAt: now,
  });

  return analysisResult.id;
}

function mergeJson(raw: any, patch: Record<string, any>) {
  const base = safeParseJsonObject(raw);
  return JSON.stringify({ ...base, ...patch });
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

/**
 * 从文件解析结果压缩包（里面包含Markdown结果）中提取 full.md 文件
 * @param zipUrl 压缩包 URL
 * @returns Markdown 内容
 */
async function fetchFullMdFromMinerUZip(zipUrl: string) {
  const resp = await fetchWithRetry(zipUrl, { retries: 3, timeoutMs: 15000 });
  if (!resp.ok) {
    throw new Error(`fetch mineru zip failed with status ${resp.status}`);
  }
  const arrayBuffer = await resp.arrayBuffer();
  const zip = new Uint8Array(arrayBuffer);
  const file = await extractZipEntry(zip, (name) => name.endsWith('full.md'));
  const text = new TextDecoder('utf-8').decode(file).trim();
  if (!text) {
    throw new Error('empty markdown content from mineru zip');
  }
  return text;
}

async function extractZipEntry(
  zip: Uint8Array,
  match: (name: string) => boolean
) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocdOffset = findEndOfCentralDirectory(zip);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdEnd = cdOffset + cdSize;

  let cursor = cdOffset;
  const candidates: Array<{
    name: string;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    localHeaderOffset: number;
  }> = [];

  while (cursor < cdEnd) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x02014b50) break;

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const fileNameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);

    const nameStart = cursor + 46;
    const name = new TextDecoder('utf-8').decode(
      zip.subarray(nameStart, nameStart + fileNameLen)
    );

    if (match(normalizeZipPath(name))) {
      candidates.push({
        name,
        method,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
    }

    cursor = nameStart + fileNameLen + extraLen + commentLen;
  }

  if (!candidates.length) {
    throw new Error('full.md not found in mineru zip');
  }

  candidates.sort((a, b) => a.name.length - b.name.length);
  const entry = candidates[0]!;

  const localSig = view.getUint32(entry.localHeaderOffset, true);
  if (localSig !== 0x04034b50) {
    throw new Error('invalid zip local header');
  }
  const localFileNameLen = view.getUint16(entry.localHeaderOffset + 26, true);
  const localExtraLen = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart =
    entry.localHeaderOffset + 30 + localFileNameLen + localExtraLen;

  const compressed = zip.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) {
    return compressed;
  }
  if (entry.method === 8) {
    const inflated = await inflateRaw(compressed);
    return inflated;
  }
  throw new Error(`unsupported zip compression method: ${entry.method}`);
}

function normalizeZipPath(name: string) {
  return String(name || '').replaceAll('\\', '/');
}

function findEndOfCentralDirectory(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const sig = 0x06054b50;
  const maxBack = Math.min(zip.length, 0xffff + 22);
  for (let i = zip.length - 22; i >= zip.length - maxBack; i -= 1) {
    if (i < 0) break;
    if (view.getUint32(i, true) === sig) {
      return i;
    }
  }
  throw new Error('invalid zip: end of central directory not found');
}

async function inflateRaw(data: Uint8Array) {
  const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
  if (typeof DecompressionStreamCtor === 'function') {
    const copy = new Uint8Array(data);
    const stream = new Blob([copy.buffer])
      .stream()
      .pipeThrough(new DecompressionStreamCtor('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }

  const mod = await import('zlib');
  const input =
    typeof Buffer !== 'undefined' ? Buffer.from(data) : new Uint8Array(data);
  const inflated = mod.inflateRawSync(input as any);
  return new Uint8Array(inflated as any);
}

async function fetchWithRetry(
  url: string,
  {
    retries,
    timeoutMs,
  }: {
    retries: number;
    timeoutMs: number;
  }
) {
  let lastError: any = null;
  for (let i = 0; i <= retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return resp;
    } catch (e: any) {
      clearTimeout(timer);
      lastError = e;
      if (i >= retries) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastError || new Error('fetch failed');
}
