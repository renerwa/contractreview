import { respData, respErr } from '@/shared/lib/resp';
import {
  preAnalyzeContract,
  type ContractPreAnalysisInput,
} from '@/shared/services/contract_pre_analysis';
import { getContractAccessContext } from '@/shared/services/contract_access';

type AnalyzeInput = ContractPreAnalysisInput;

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
    const access = await getContractAccessContext({
      createAnonymousSession: true,
    });

    const input = await parseInput(req);
    if (!input.content && !input.fileUrl) {
      return respErr('content or fileUrl is required');
    }

    const result = await preAnalyzeContract({
      userId: access.ownerUserId,
      sessionToken: access.sessionToken,
      input,
    });
    return respData(result);
  } catch (e: any) {
    console.log('contract pre-analysis failed:', e);
    return respErr(e.message || 'contract pre-analysis failed');
  }
}

/**
 * 解析请求体，提取合同内容或 URL
 */
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

/**
 * 从 FormData 中获取字符串值，确保非空且去空格
 */
function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (!value || typeof value !== 'string') return '';
  return value.trim();
}
