import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

import { Configs, getAllConfigs } from '@/shared/models/config';
import {
  CanonicalContractType,
  getCanonicalContractTypes,
} from '@/shared/models/contract_type';

export interface ContractSummary {
  isContract: boolean;
  nonContractReason: string;
  contractType: string;
  contractSubtype: string;
  language: string;
  signingPlaceCountry: string;
  signingPlaceCity: string;
  userParty: string;
  summary: string;
  keyPoints: string[];
}
/**
 * 解析合同内容为Markdown格式
 * @param contractContent 合同内容
 * @param model 模型名称
 * @param configs 配置项
 * @returns 解析后的Markdown格式合同内容
 */
export async function parseContractToMarkdown({
  contractContent,
  model,
  configs,
}: {
  contractContent: string;
  model?: string;
  configs?: Configs;
}) {
  const appConfigs = configs || (await getAllConfigs());
  const openrouterApiKey = appConfigs.openrouter_api_key;
  if (!openrouterApiKey) {
    throw new Error('openrouter_api_key is not set');
  }

  const openrouter = createOpenRouter({
    apiKey: openrouterApiKey,
    baseURL: appConfigs.openrouter_base_url || undefined,
  });

  const parserModel =
    model || appConfigs.contract_parser_model || 'openai/gpt-4o-mini';
  const systemPrompt = `# Role
你是一个极其严谨的专业法律文档解析系统。你的唯一任务是将用户提供的合同文档精确、无损地转换为Markdown格式。

# Core Rules (绝对不可违反)
1. 绝对忠于原文：必须做到“一字不改、一字不落”。严禁任何形式的总结、润色、缩写或扩写。
2. 保留原有错误：如果原文中有错别字、语病或标点错误，必须原样保留，绝不允许自作主张进行“纠错”。
3. 严禁幻觉：绝不要基于上下文猜测或补充文档中没有的条款。你是一个没有主观意识的转换工具。

# Formatting Rules
1. 标题层级：使用正确的Markdown层级（#，##，### 等）精准还原合同的章节结构。
2. 列表与编号：保留合同原本的有序列表（1., 2., 3. 或 A., B., C. 等）和无序列表。
3. 表格处理：将文档中的表格精确转换为标准Markdown表格。如果表格极为复杂（如嵌套单元格），请尽可能用Markdown表达清楚，不要丢失任何单元格内的数据。
4. 特殊符号：保留所有的法律特殊符号、印章标记或签名占位符（如：[签字处]、[公司印章]）。
5. 去掉无关内容：合同中可能包含一些与法律相关的内容，如合同的页眉、页脚、页码等。请在转换为Markdown时，去掉这些内容。
6. 语言保持：保持和原文档一致的语言，不要翻译。

# Output Format
直接输出Markdown代码。不需要任何寒暄，不需要解释你的工作过程，结尾也不要加任何总结词。`;

  const { text } = await generateText({
    model: openrouter.chat(parserModel),
    system: systemPrompt,
    prompt: `请将下面的合同内容转为Markdown：\n\n${contractContent}`,
    temperature: 0,
  });

  const markdown = text.trim();
  if (!markdown) {
    throw new Error('contract parsing failed: empty markdown');
  }

  return markdown;
}

/**
 * 调用AI模型，分析合同概要
 * @param contractContent 合同内容
 * @param model 模型名称
 * @param configs 配置项
 * @returns 合同概要分析结果，包含是否为合同、合同类型、子类型、语言、签约地国家、签约地城市、用户角色、摘要、重点
 */
export async function analyzeContractSummary({
  contractContent,
  model,
  configs,
}: {
  contractContent: string;
  model?: string;
  configs?: Configs;
}): Promise<ContractSummary> {
  const appConfigs = configs || (await getAllConfigs());
  const openrouterApiKey = appConfigs.openrouter_api_key;
  if (!openrouterApiKey) {
    throw new Error('openrouter_api_key is not set');
  }

  const openrouter = createOpenRouter({
    apiKey: openrouterApiKey,
    baseURL: appConfigs.openrouter_base_url || undefined,
  });

  const summaryModel =
    model || appConfigs.contract_summary_model || 'openai/gpt-4o-mini';

  const contractTypes = await getCanonicalContractTypes();
  const canonicalTypeCodes = contractTypes.map((t) => t.code).filter(Boolean);

  const { text } = await generateText({
    model: openrouter.chat(summaryModel),
    system: `你是资深合同分析助手。你要基于用户提供的合同内容，输出结构化的合同概要分析。你必须严格按指定JSON结构输出，不要输出Markdown，不要输出解释文本。`,
    prompt: `请分析以下合同内容，并返回JSON：
{
  "isContract": true,
  "nonContractReason": "如果不是合同，解释为什么它不是合同；如果是合同则为空字符串",
  "contractType": "合同类型（需要归一化：如果属于下方给定类型之一，必须严格输出该类型的 code；否则才输出一个新的类型名称）",
  "contractSubtype": "更细分子类型，没有就空字符串",
  "language": "文档主要语言（如 English、Spanish）",
  "signingPlaceCountry": "签约地国家，没有明确则空字符串",
  "signingPlaceCity": "签约地城市，没有明确则空字符串",
  "userParty": "如果文档可判断上传用户更可能是甲方/乙方/雇主/雇员/买方/卖方则写，否则空字符串",
  "summary": "100-220字的合同重点摘要",
  "keyPoints": ["重点1", "重点2", "重点3"]
}

要求：
1. 仅输出JSON对象，不要代码块标记。
2. 先判断这是不是一份合同：如果内容明显不是合同、协议、条款文本、法律约束文件，则 isContract=false，nonContractReason 解释原因。
3. 如果 isContract=false，则 contractType、contractSubtype、signingPlaceCountry、signingPlaceCity、userParty 可为空，summary 应简要解释该文档内容，keyPoints 返回 1-3 条。
4. 如果 isContract=true，则 keyPoints返回3-8条，短句表达。
5. 信息不确定时填空字符串，不要编造。
6. 合同类型归一化规则（非常重要）：
   - 你将获得一份 <allowed_contract_types> 列表，每一项包含 code/nameEn/nameZh/usageScene。
   - 如果合同属于其中某一种类型，你必须将 contractType 输出为该类型的 code（完全一致，包括大小写与符号）。
   - 只有当合同明确不属于列表中的任何类型时，contractType 才能输出其他类型名称（尽量英文短名称，如 "Partnership Agreement"）。
7. 你输出的 contractType 禁止是 allowed_contract_types 中 code/nameEn/nameZh 的“近似写法”，要么严格用 code，要么输出一个不在列表中的新类型名称。

<allowed_contract_types>
${JSON.stringify(contractTypes)}
</allowed_contract_types>

合同内容如下：
${contractContent}`,
    temperature: 0.1,
  });

  const parsed = parseJsonObject(text);
  const normalizedContractType = normalizeContractType(
    String(parsed.contractType || ''),
    contractTypes
  );
  const contractTypeFinal =
    normalizedContractType || String(parsed.contractType || '');

  return {
    isContract:
      typeof parsed.isContract === 'boolean'
        ? parsed.isContract
        : String(parsed.isContract || '')
            .trim()
            .toLowerCase() !== 'false',
    nonContractReason: String(parsed.nonContractReason || ''),
    contractType: contractTypeFinal,
    contractSubtype: String(parsed.contractSubtype || ''),
    language: String(parsed.language || ''),
    signingPlaceCountry: String(parsed.signingPlaceCountry || ''),
    signingPlaceCity: String(parsed.signingPlaceCity || ''),
    userParty: String(parsed.userParty || ''),
    summary: String(parsed.summary || ''),
    keyPoints: Array.isArray(parsed.keyPoints)
      ? parsed.keyPoints.map((item: any) => String(item)).filter(Boolean)
      : [],
  };
}

function normalizeContractType(
  raw: string,
  canonical: CanonicalContractType[]
): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  const byCode = canonical.find(
    (t) => t.code.toLowerCase() === value.toLowerCase()
  );
  if (byCode) return byCode.code;

  const byNameEn = canonical.find(
    (t) => t.nameEn.toLowerCase() === value.toLowerCase()
  );
  if (byNameEn) return byNameEn.code;

  const byNameZh = canonical.find(
    (t) => t.nameZh.toLowerCase() === value.toLowerCase()
  );
  if (byNameZh) return byNameZh.code;

  const collapsed = value.replace(/\s+/g, ' ').toLowerCase();
  const byPrefix = canonical.find((t) => {
    const codePrefix = `${t.code.toLowerCase()} `;
    return (
      collapsed === t.code.toLowerCase() || collapsed.startsWith(codePrefix)
    );
  });
  if (byPrefix) return byPrefix.code;

  return value;
}

function parseJsonObject(text: string): Record<string, any> {
  const raw = text.trim();
  try {
    return JSON.parse(raw);
  } catch (_) {}

  const codeBlockMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch?.[1]) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch (_) {}
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch (_) {}
  }

  throw new Error('invalid contract summary json response');
}
