import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

import { Configs, getAllConfigs } from '@/shared/models/config';

export type ContractReviewStatus = 'High' | 'Medium' | 'Low' | 'Pass' | 'Missing';

export interface ContractReviewReport {
  overview: {
    summary: string;
    total_risk_score: number;
  };
  review_details: Array<{
    checklist_item: string;
    status: ContractReviewStatus;
    issue_description: string;
    original_text_quote: string;
    modification_suggestion: string;
  }>;
  additional_critical_risks: Array<{
    issue_title: string;
    status: Exclude<ContractReviewStatus, 'Pass' | 'Missing'>;
    issue_description: string;
    original_text_quote: string;
    modification_suggestion: string;
  }>;
}

export async function generateContractReviewReport({
  contractMarkdown,
  contractType,
  perspective,
  signingPlace,
  focusPoints,
  checklist,
  model,
  configs,
}: {
  contractMarkdown: string;
  contractType: string;
  perspective: string;
  signingPlace?: string;
  focusPoints?: string;
  checklist: Array<{
    itemTitle?: string | null;
    itemDescription?: string | null;
    itemCode?: string | null;
    severity?: string | null;
    weight?: number | null;
  }>;
  model?: string;
  configs?: Configs;
}): Promise<ContractReviewReport> {
  const appConfigs = configs || (await getAllConfigs());
  const openrouterApiKey = appConfigs.openrouter_api_key;
  if (!openrouterApiKey) {
    throw new Error('openrouter_api_key is not set');
  }

  const openrouter = createOpenRouter({
    apiKey: openrouterApiKey,
    baseURL: appConfigs.openrouter_base_url || undefined,
  });

  const reviewModel =
    model || appConfigs.contract_review_model || 'openai/gpt-4o-mini';

  const jurisdictionOrDefault = String(signingPlace || '').trim() || 'United States';
  const focus = String(focusPoints || '').trim();
  const checklistJsonString = JSON.stringify(
    checklist.map((c) => ({
      item_code: c.itemCode || '',
      item_title: c.itemTitle || '',
      item_description: c.itemDescription || '',
      severity: c.severity || '',
      weight: typeof c.weight === 'number' ? c.weight : null,
    }))
  );

  const systemPrompt = `# Role
你是一位拥有15年经验的顶尖商业律师。你精通各类商业合同的审查，具备极其敏锐的风险嗅觉和严密的逻辑。

# Task
你的任务是根据我提供的【合同检查清单】，站在特定的【审查立场】，审查我输入的【合同正文】。
你需要输出一份极其详细、结构化的合同审查报告，直击商业风险，并提供可操作的修改建议。

# Context Variables
- 合同类型：${contractType}
- 审查立场：请严格代表【${perspective}】的利益，最大化规避该方的风险。
- 适用法律/签署地：${jurisdictionOrDefault}

# Core Rules
1. 严格基于清单：你的基础审查必须基于 <checklist> 中提供的维度。逐项检查，不要遗漏。
2. 杜绝幻觉：必须基于 <contract_document> 中实际存在的文本进行分析。如果某项清单要求在合同中完全没有体现，请明确指出状态为 "Missing"。
3. 重大风险兜底原则：在严格执行 <checklist> 审查之外，如果你凭借专业的法律知识，在合同中发现了不在清单涵盖范围内的其他实质性风险，请将其提取出来作为额外风险报告。你可以报告 High、Medium 和 Low 级别的风险。但是，严禁报告单纯的错别字、标点错误、排版瑕疵或纯粹的文字润色建议。你指出的任何级别额外风险，必须与法律权利、义务分配、违约责任或商业利益直接相关。
4. 风险定级标准：
   - "High"：直接导致严重经济损失、核心权利丧失或严重违约责任的条款。
   - "Medium"：条款表述模糊易生歧义，或责任分配略微不公，存在一定商业风险。
   - "Low"：格式瑕疵、常规性通知条款或轻微的权利义务不对等。
   - "Pass"：完美保护了【${perspective}】利益的条款。

# Output Format (Strict JSON)
你必须直接输出合法的 JSON 格式，绝不能包含任何 Markdown 标记（如 \`\`\`json）、开场白或结束语。`;

  const userPrompt = `${focus ? `<user_focus_points>\n${focus}\n</user_focus_points>\n\n` : ''}<checklist>\n${checklistJsonString}\n</checklist>\n\n<contract_document>\n${contractMarkdown}\n</contract_document>\n\n请严格按以下 JSON 结构输出：\n{\n  \"overview\": {\n    \"summary\": \"对这份合同整体风险的简短总结（不超过100字）\",\n    \"total_risk_score\": 10\n  },\n  \"review_details\": [\n    {\n      \"checklist_item\": \"对应 <checklist> 中的检查项名称\",\n      \"status\": \"High/Medium/Low/Pass/Missing\",\n      \"issue_description\": \"具体的风险分析或问题描述。如果是 Pass，说明为什么没问题。\",\n      \"original_text_quote\": \"精准提取引起风险的合同原文片段（如果是 Missing 则留空）\",\n      \"modification_suggestion\": \"针对立场的具体修改意见，或者可以直接替换的条款文本\"\n    }\n  ],\n  \"additional_critical_risks\": [\n    {\n      \"issue_title\": \"额外风险的简短名称\",\n      \"status\": \"High/Medium/Low\",\n      \"issue_description\": \"为什么这是一个风险\",\n      \"original_text_quote\": \"原文引用\",\n      \"modification_suggestion\": \"修改建议\"\n    }\n  ]\n}\n`;

  const { text } = await generateText({
    model: openrouter.chat(reviewModel),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.2,
  });

  const report = parseJsonObject(text) as ContractReviewReport;
  if (!report || !report.overview || !Array.isArray(report.review_details)) {
    throw new Error('invalid contract review response');
  }

  return report;
}

export function calcRiskLevelFromReport(report: ContractReviewReport) {
  const score = Number(report?.overview?.total_risk_score ?? 0);
  if (Number.isFinite(score)) {
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    if (score >= 1) return 'low';
    return 'pass';
  }
  const statuses = [
    ...(report.review_details || []).map((i) => i.status),
    ...(report.additional_critical_risks || []).map((i) => i.status),
  ];
  if (statuses.includes('High')) return 'high';
  if (statuses.includes('Medium')) return 'medium';
  if (statuses.includes('Low')) return 'low';
  return 'pass';
}

function parseJsonObject(text: string): Record<string, any> {
  const raw = String(text || '').trim();
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

  throw new Error('invalid json response');
}
