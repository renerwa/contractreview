import { getFileExtension } from '@/shared/lib/contract-file';
import { getUuid } from '@/shared/lib/hash';
import {
  createAnalysisResult,
  findLatestDocumentAnalysisResult,
} from '@/shared/models/analysis_result';
import {
  createDocument,
  findDocumentByFilePath,
  findDocumentById,
  updateDocumentById,
} from '@/shared/models/document';
import {
  analyzeContractSummary,
  parseContractToMarkdown,
} from '@/shared/services/contract';

export type ContractPreAnalysisInput = {
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
 * 预分析合同内容，将合同内容解析为 Markdown 格式并分析摘要摘要
 * @param userId 用户 ID
 * @param input 合同预分析输入(包含合同内容/文件 URL)
 * @returns 合同预分析结果
 */
export async function preAnalyzeContract({
  userId,
  input,
}: {
  userId: string;
  input: ContractPreAnalysisInput;
}) {
  const now = new Date();
  // 解析合同内容或URL的合同文档（传了 content 就解析 content，否则解析 fileUrl）为Markdown格式
  const resolved = await resolveContractContent({
    userId,
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

  // 根据解析后的Markdown内容，分析合同摘要
  const summaryResult = await analyzeContractSummary({
    contractContent: resolved.markdownContent,
  });

  // 根据文档ID查询最新分析结果的版本号，版本号加1作为新分析结果的版本号
  const latestResult = await findLatestDocumentAnalysisResult(
    resolved.documentId,
    userId
  );
  const version = (latestResult?.version || 0) + 1;

  // 创建新的分析结果
  // 分析状态设为 completed
  // 分析版本号设为最新版本号加1
  // 分析内容设为解析后的Markdown内容
  // 分析摘要设为分析结果的摘要
  // 分析风险分数设为 null
  // 分析风险等级设为 null
  // 分析风险项目设为 null
  // 分析发现设设为 JSON 字符串，包含关键点、签约地国家、签约地城市
  const analysisResult = await createAnalysisResult({
    id: getUuid(),
    documentId: resolved.documentId,
    userId,
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

  await updateDocumentById(resolved.documentId, {
    status: 'analyzed',
    contractType: summaryResult.contractType || input.contractType || '',
    contractSubtype: summaryResult.contractSubtype || '',
    userParty: summaryResult.userParty || input.userParty || '',
    signingPlace:
      [summaryResult.signingPlaceCountry, summaryResult.signingPlaceCity]
        .filter(Boolean)
        .join(', ') ||
      input.signingPlace ||
      '',
    sourceLanguage: summaryResult.language || '',
    focusPoints: input.focusPoints || '',
    updatedAt: now,
  });

  const document = await findDocumentById(resolved.documentId);

  return {
    document,
    analysisResult,
    summary: summaryResult,
  };
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

    // 如果是 Markdown 格式，直接返回内容
    // 如果不是 Markdown 格式，解析为 Markdown 格式
    const markdownContent =
      format.toLowerCase() === 'markdown'
        ? content
        : await parseContractToMarkdown({ contractContent: content });

    return { documentId: ensuredDocumentId, markdownContent };
  }

  // 如果没传 content，就根据 fileUrl 查询是否存在匹配的文档
  // 如果存在，返回该文档的 ID
  // 如果不存在，则抛出错误
  const ensuredDocumentId = await ensureDocumentForFileUrl({
    userId,
    documentId,
    fileUrl,
    now,
  });

  // 从合同文档URL获取合同内容
  // 如果是 Markdown 格式，直接返回内容
  // 如果不是 Markdown 格式，解析为 Markdown 格式
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
  if (documentId) {
    const existingDocument = await findDocumentById(documentId);
    if (!existingDocument || existingDocument.userId !== userId) {
      throw new Error('document not found');
    }
    return documentId;
  }

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
    if (existingDocument.filePath !== fileUrl) {
      await updateDocumentById(documentId, {
        filePath: fileUrl,
        updatedAt: now,
      });
    }
    return documentId;
  }

  const document = await findDocumentByFilePath(fileUrl);
  if (!document || document.userId !== userId) {
    throw new Error('document not found');
  }
  return document.id;
}

/**
 * 从合同文档URL获取合同内容
 * @param fileUrl 合同文档URL
 * @returns 合同内容
 */
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

/**
 * 从合同文档URL获取合同文件名
 * @param fileUrl 合同文档URL
 * @returns 合同文件名
 */
function getFileNameFromUrl(fileUrl: string) {
  try {
    const url = new URL(fileUrl);
    const pathname = url.pathname || '';
    const name = pathname.split('/').pop() || '';
    // 解码 URL 编码的文件名
    return decodeURIComponent(name);
  } catch (_) {
    const raw = String(fileUrl || '').split('?')[0] || '';
    return raw.split('/').pop() || '';
  }
}
