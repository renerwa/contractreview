import { createAnalysisResult, findLatestDocumentAnalysisResult } from '@/shared/models/analysis_result';
import { createDocument, findDocumentByFilePath, findDocumentById, updateDocumentById } from '@/shared/models/document';
import { getUserInfo } from '@/shared/models/user';
import { getFileExtension } from '@/shared/lib/contract-file';
import { getUuid } from '@/shared/lib/hash';
import { respData, respErr } from '@/shared/lib/resp';
import { analyzeContractSummary, parseContractToMarkdown } from '@/shared/services/contract';

type AnalyzeInput = {
  content: string;
  format: string;
  contractType: string;
  userParty: string;
  signingPlace: string;
  focusPoints: string;
  documentId: string;
  fileUrl: string;
};

/**
 * 合同初步分析接口
 *
 * 功能：
 * 1) 支持直接传入合同内容（纯文本 / Markdown）
 * 2) 或传入已上传好的合同文件 URL（前端应先调用 /api/contracts/upload 拿到 url + documentId）
 *
 * 返回：
 * - document：更新后的 documents 记录
 * - analysisResult：写入 analysis_results 的记录（包含 markdownContent 与 summary 等）
 * - summary：概要分析结构化结果（类型/语言/签约地/重点摘要）
 *
 * 注意：
 * - 当前仅支持从 URL 读取“文本类文件”（txt/md 等）。PDF/DOCX 等需要你先在前端或后端做提取后，再以 content 方式传入。
 */
export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const input = await parseInput(req);
    if (!input.content && !input.fileUrl) {
      return respErr('content or fileUrl is required');
    }

    const now = new Date();
    const resolved = await resolveContractContent({
      userId: user.id,
      documentId: input.documentId,
      fileUrl: input.fileUrl,
      content: input.content,
      format: input.format,
      contractType: input.contractType,
      userParty: input.userParty,
      signingPlace: input.signingPlace,
      focusPoints: input.focusPoints,
      now,
    });

    if (!resolved.documentId) {
      return respErr('documentId is required');
    }

    // 分析合同摘要，获取合同类型、语言、签约地、重点摘要等信息
    const summaryResult = await analyzeContractSummary({
      contractContent: resolved.markdownContent,
    });

    // 查询合同文档的最新分析结果，根据版本号递增
    const latestResult = await findLatestDocumentAnalysisResult(
      resolved.documentId,
      user.id
    );
    const version = (latestResult?.version || 0) + 1;

    // 在analysis_results表中创建新的分析结果
    const analysisResult = await createAnalysisResult({
      id: getUuid(),
      documentId: resolved.documentId,
      userId: user.id,
      status: 'completed',
      version,
      markdownContent: resolved.markdownContent,
      summary: summaryResult.summary,
      riskScore: null,
      riskLevel: null,
      riskItems: null,
      findings: JSON.stringify({
        keyPoints: summaryResult.keyPoints,
        signingPlaceCountry: summaryResult.signingPlaceCountry,
        signingPlaceCity: summaryResult.signingPlaceCity,
      }),
      modelProvider: 'openrouter',
      modelName: '',
      createdAt: now,
      updatedAt: now,
    });

    // 更新documents表，将状态设置为analyzed
    await updateDocumentById(resolved.documentId, {
      status: 'analyzed',
      contractType: summaryResult.contractType || input.contractType || '',
      contractSubtype: summaryResult.contractSubtype || '',
      userParty: summaryResult.userParty || input.userParty || '',
      signingPlace:
        [summaryResult.signingPlaceCountry, summaryResult.signingPlaceCity]
          .filter(Boolean)
          .join(', ') || input.signingPlace || '',
      sourceLanguage: summaryResult.language || '',
      focusPoints: input.focusPoints || '',
      updatedAt: now,
    });

    const document = await findDocumentById(resolved.documentId);

    return respData({
      document,
      analysisResult,
      summary: summaryResult,
    });
  } catch (e: any) {
    console.log('contract pre-analysis failed:', e);
    return respErr(e.message || 'contract pre-analysis failed');
  }
}

async function parseInput(req: Request): Promise<AnalyzeInput> {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    return {
      content: getFormString(formData, 'content'),
      format: getFormString(formData, 'format') || 'text',
      contractType: getFormString(formData, 'contractType'),
      userParty: getFormString(formData, 'userParty'),
      signingPlace: getFormString(formData, 'signingPlace'),
      focusPoints: getFormString(formData, 'focusPoints'),
      documentId: getFormString(formData, 'documentId'),
      fileUrl:
        getFormString(formData, 'fileUrl') ||
        getFormString(formData, 'contractUrl') ||
        getFormString(formData, 'url'),
    };
  }

  const body = await req.json();
  return {
    content: String(body.content || ''),
    format: String(body.format || 'text'),
    contractType: String(body.contractType || ''),
    userParty: String(body.userParty || ''),
    signingPlace: String(body.signingPlace || ''),
    focusPoints: String(body.focusPoints || ''),
    documentId: String(body.documentId || ''),
    fileUrl: String(body.fileUrl || body.contractUrl || body.url || ''),
  };
}

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!value || typeof value !== 'string') return '';
  return value.trim();
}

/**
 * 解析合同内容或URL的合同文档为Markdown格式
 * 如果传了documentId确保确保合同文档存在，如果没有传documentId，根据合同文档URL查询是否存在匹配的文档
 * 如果存在，返回该文档的ID
 * 如果不存在，则抛出错误
 * @param userId 用户ID
 * @param documentId 合同文档ID
 * @param fileUrl 合同文件URL
 * @param content 合同内容
 * @param format 合同格式
 * @param contractType 合同类型
 * @param userParty 合同用户角色
 * @param signingPlace 合同签约地
 * @param focusPoints 合同关注点
 * @param now 当前时间
 * @returns 解析后的合同内容
 */
async function resolveContractContent({
  userId,
  documentId,
  fileUrl,
  content,
  format,
  contractType,
  userParty,
  signingPlace,
  focusPoints,
  now,
}: {
  userId: string;
  documentId: string;
  fileUrl: string;
  content: string;
  format: string;
  contractType: string;
  userParty: string;
  signingPlace: string;
  focusPoints: string;
  now: Date;
}): Promise<{ documentId: string; markdownContent: string }> {
  // 如果直接提供了合同内容，确保合同文档存在并解析为Markdown格式
  if (content) {
    const ensuredDocumentId = await ensureDocumentForInlineContent({
      userId,
      documentId,
      content,
      contractType,
      userParty,
      signingPlace,
      focusPoints,
      now,
    });

    // 解析合同内容为Markdown格式
    const markdownContent =
      format.toLowerCase() === 'markdown'
        ? content
        : await parseContractToMarkdown({ contractContent: content });

    return { documentId: ensuredDocumentId, markdownContent };
  }

  // 如果没有直接提供合同内容，确保提供的合同文档URL存在
  const ensuredDocumentId = await ensureDocumentForFileUrl({
    userId,
    documentId,
    fileUrl,
    now,
  });

  // 解析合同内容为Markdown格式
  const text = await fetchTextFromUrl(fileUrl);
  const isMarkdown =
    getFileExtension(getFileNameFromUrl(fileUrl)) === 'md' ||
    getFileExtension(getFileNameFromUrl(fileUrl)) === 'markdown';

  const markdownContent = isMarkdown
    ? text
    : await parseContractToMarkdown({ contractContent: text });

  return { documentId: ensuredDocumentId, markdownContent };
}

/**
 * 如果传了documentId确保合同文档存在，如果没有传documentId，根据合同内容和元数据创建一个新的合同文档
 * @param userId 用户ID
 * @param documentId 合同文档ID
 * @param content 合同内容
 * @param contractType 合同类型
 * @param userParty 合同用户角色
 * @param signingPlace 合同签约地
 * @param focusPoints 合同关注点
 * @param now 当前时间
 * @returns 确保后的合同文档ID
 */
async function ensureDocumentForInlineContent({
  userId,
  documentId,
  content,
  contractType,
  userParty,
  signingPlace,
  focusPoints,
  now,
}: {
  userId: string;
  documentId: string;
  content: string;
  contractType: string;
  userParty: string;
  signingPlace: string;
  focusPoints: string;
  now: Date;
}) {
  // 如果传了documentId，确保文档存在并属于当前用户
  if (documentId) {
    const existingDocument = await findDocumentById(documentId);
    if (!existingDocument || existingDocument.userId !== userId) {
      throw new Error('document not found');
    }
    return documentId;
  }

  // 如果没有传documentId，根据合同内容和元数据创建一个新的合同文档
  const inlineDocument = await createDocument({
    id: getUuid(),
    userId,
    status: 'uploaded',
    filePath: 'inline://content',
    fileName: `inline-contract-${Date.now()}.txt`,
    fileType: 'text/plain',
    fileSize: content.length,
    storageProvider: 'inline',
    contractType,
    userParty,
    signingPlace,
    focusPoints,
    createdAt: now,
    updatedAt: now,
  });

  return inlineDocument.id;
}

/**
 * 如果传了documentId确保合同文档存在，如果没有传documentId，根据合同文档URL查询是否存在匹配的文档
 * 如果存在，返回该文档的ID
 * 如果不存在，则抛出错误
 * @param userId 用户ID
 * @param documentId 合同文档ID
 * @param fileUrl 合同文档URL
 * @param now 当前时间
 * @returns 确保后的合同文档ID
 */
async function ensureDocumentForFileUrl({
  userId,
  documentId,
  fileUrl,
  now,
}: {
  userId: string;
  documentId: string;
  fileUrl: string;
  now: Date;
}) {
  if (documentId) {
    const existingDocument = await findDocumentById(documentId);
    if (!existingDocument || existingDocument.userId !== userId) {
      throw new Error('document not found');
    }
    // 如果根据documentId查询到的文档路径与fileUrl不同，更新文档路径并返回documentId
    if (existingDocument.filePath !== fileUrl) {
      await updateDocumentById(documentId, { filePath: fileUrl, updatedAt: now });
    }
    return documentId;
  }

  // 如果没有传documentId，则根据fileUrl在数据库中查询是否存在匹配的文档
  // 如果存在，返回该文档的ID
  // 如果不存在，则抛出错误
  const document = await findDocumentByFilePath(fileUrl);
  if (!document || document.userId !== userId) {
    throw new Error('document not found');
  }
  return document.id;
}

async function fetchTextFromUrl(fileUrl: string) {
  const fileName = getFileNameFromUrl(fileUrl);
  const ext = getFileExtension(fileName);
  const allowed = ['md', 'markdown', 'txt', 'csv', 'json', 'xml', 'html'];
  if (!allowed.includes(ext)) {
    throw new Error(
      'unsupported fileUrl type for direct pre-analysis, please send contract content instead'
    );
  }

  const resp = await fetch(fileUrl);
  if (!resp.ok) {
    throw new Error('fetch fileUrl failed');
  }
  const text = await resp.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('empty file content');
  }
  return trimmed;
}

function getFileNameFromUrl(fileUrl: string) {
  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname || '';
    const name = pathname.split('/').pop() || '';
    return decodeURIComponent(name);
  } catch (_) {
    const raw = String(fileUrl || '').split('?')[0] || '';
    return raw.split('/').pop() || '';
  }
}
