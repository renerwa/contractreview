/**
 * 生成合同审核检查列表
 * 运行（确保在项目根目录下Windows PowerShell 里这样跑）：$env:KIE_API_KEY="你的token"
npx tsx scripts/with-env.ts --env=.env.development npx tsx scripts/generate_checklists.ts 
 */

import { pathToFileURL } from 'url';
import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { contractReviewChecklist, contractType } from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

async function fetchJsonWithRetry(
  url: string,
  {
    token,
    body,
    retries,
    timeoutMs,
  }: {
    token: string;
    body: any;
    retries: number;
    timeoutMs: number;
  }
) {
  let lastError: any = null;
  for (let i = 0; i <= retries; i += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const raw = await res.text();
      if (!res.ok) {
        throw new Error(raw || `http error: ${res.status}`);
      }
      try {
        return JSON.parse(raw);
      } catch (_) {
        throw new Error(raw || 'invalid json response');
      }
    } catch (e: any) {
      clearTimeout(timer);
      lastError = e;
      if (i >= retries) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 800 * (i + 1)));
    }
  }
  throw lastError || new Error('request failed');
}

async function fetchFromOpenAICompat(
  prompt: string,
  token: string,
  model: string,
  apiUrl: string
) {
  const data = await fetchJsonWithRetry(apiUrl, {
    token,
    retries: 2,
    timeoutMs: 60000,
    body: {
      model,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        },
      ],
      reasoning_effort: 'high',
      stream: false,
    },
  });

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error(
      data?.error?.message || data?.msg || 'invalid openai-compat response'
    );
  }
  return content;
}

async function fetchFromClaude(
  prompt: string,
  token: string,
  model: string,
  apiUrl: string
) {
  const data = await fetchJsonWithRetry(apiUrl, {
    token,
    retries: 3,
    timeoutMs: 150000,
    body: {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    },
  });

  const text = data?.content?.find?.((b: any) => b?.type === 'text')?.text;
  if (!text || typeof text !== 'string') {
    throw new Error(
      data?.error?.message || data?.msg || 'invalid claude response'
    );
  }
  return text;
}

/**
 * 提取并解析 JSON，容错处理可能包含的 Markdown 代码块
 */
function extractJson(text: string): any[] {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const startIdx = cleaned.indexOf('[');
  const endIdx = cleaned.lastIndexOf(']');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return JSON.parse(cleaned.substring(startIdx, endIdx + 1));
  }
  return JSON.parse(cleaned);
}

/**
 * 生成合同审核检查列表
 */
export async function generateChecklists() {
  console.log('Starting checklist generation...');
  const token = String(process.env.KIE_API_KEY || '').trim();
  if (!token) {
    console.error('Missing KIE_API_KEY in env');
    return;
  }
  if (/[^\x20-\x7e]/.test(token)) {
    console.error(
      'Invalid KIE_API_KEY: contains non-ASCII characters. Please set it to a real token (no Chinese characters).'
    );
    return;
  }

  // 1. 获取所有合同类型
  let types = await db()
    .select()
    .from(contractType)
    .where(eq(contractType.isActive, true))
    .orderBy(contractType.sort);
  console.log(`Found ${types.length} contract types.`);

  // 先用一个测试类型
  types = [types[0]];

  for (const type of types) {
    const typeName = `${type.nameZh} (${type.nameEn})`;
    console.log(`Processing: ${typeName}`);

    const basePrompt = `
# Role
你是一位精通比较法学（Common Law & Civil Law）的国际商事合同架构专家。

# Task
我正在开发一个面向全球用户(主要是欧美用户)的 AI 合同审查 SaaS 系统。请你为【${typeName}】生成一份“跨法系、无特定立场”的通用结构化检查清单（Universal Checklist）。

# Core Directives
1. 保持中立：不要偏袒甲乙任何一方。
2. 剥离地域性法律：不要引用任何特定国家（如美国、中国）的具体法律条文或默认商业习惯。
3. 聚焦“必须明确的维度”：列出该类合同在全球商业实践中，最容易产生纠纷、必须被明确定义的关键要素。

# Output Requirements
请直接输出合法的 JSON 数组，方便系统后台解析入库。不要包含 Markdown 代码块标记（\`\`\`json）以外的任何文本。
结构如下：
[
  {
    "category": "条款分类（如：核心义务、违约责任、争议解决）",
    "element_name": "核心要素名称（如：保密信息的除外情形）",
    "description": "这个要素为什么在全球商业实践中都极其重要（简要说明）",
    "audit_focus": "中立的提取指令（例如：提取合同中关于哪些信息不属于保密的具体定义。提取违约责任的计算方式。）"
  }
]`;

    try {
      console.log(`  - Calling GPT-5-2...`);
      const gpt5Draft = await fetchFromOpenAICompat(
        basePrompt,
        token,
        'gpt-5-2',
        'https://api.kie.ai/gpt-5-2/v1/chat/completions'
      );
      console.log(`  - GPT-5-2 Draft: ${gpt5Draft}`);

      console.log(`  - Calling Gemini-3.1-Pro...`);
      const geminiDraft = await fetchFromOpenAICompat(
        basePrompt,
        token,
        'gemini-3.1-pro-openai',
        'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions'
      );
      console.log(`  - Gemini-3.1-Pro Draft: ${geminiDraft}`);

      console.log(`  - Claude-Opus-4-6...`);
      const claudeDraft = await fetchFromClaude(
        basePrompt,
        token,
        'claude-opus-4-6',
        'https://api.kie.ai/claude/v1/messages'
      );
      console.log(`  - Claude-Opus-4-6 Draft: ${claudeDraft}`);

      console.log(`  - Aggregating with Claude-Opus-4-6...`);
      const aggPrompt = `
你是一位精通比较法学（Common Law & Civil Law）的国际商事合同架构专家。

我们针对【${typeName}】的通用结构化检查清单，分别使用了三个不同的大模型生成了三份草案。
请你对这三份草案进行汇总、去重、整理和提炼，输出一份最完备、最准确的最终检查清单。

# Core Directives
1. 保持中立：不要偏袒甲乙任何一方。
2. 剥离地域性法律：不要引用任何特定国家（如美国、中国）的具体法律条文或默认商业习惯。
3. 聚焦“必须明确的维度”：列出该类合同在全球商业实践中，最容易产生纠纷、必须被明确定义的关键要素。
4. 综合三份草案的优点，分类需清晰合理，要素名称精炼，描述和提取指令要有可操作性。

# Output Requirements
请直接输出合法的 JSON 数组，方便系统后台解析入库。不要包含 Markdown 代码块标记（\`\`\`json）以外的任何文本。
结构如下：
[
  {
    "category": "条款分类（如：核心义务、违约责任、争议解决）",
    "element_name": "核心要素名称（如：保密信息的除外情形）",
    "description": "这个要素为什么在全球商业实践中都极其重要（简要说明）",
    "audit_focus": "中立的提取指令（例如：提取合同中关于哪些信息不属于保密的具体定义。提取违约责任的计算方式。）"
  }
]

# 草案一 (GPT-5-2)
${gpt5Draft}

# 草案二 (Gemini-3.1-Pro)
${geminiDraft}

# 草案三 (Claude-Opus-4-6)
${claudeDraft}
`;
      const finalRes = await fetchFromClaude(
        aggPrompt,
        token,
        'claude-opus-4-6',
        'https://api.kie.ai/claude/v1/messages'
      );

      let items: any[] = [];
      try {
        items = extractJson(finalRes);
      } catch (err) {
        console.error(
          `  - Failed to parse aggregated JSON for ${typeName}:`,
          err
        );
        continue;
      }

      if (Array.isArray(items) && items.length > 0) {
        console.log(`  - Inserting ${items.length} items to database...`);
        await db()
          .delete(contractReviewChecklist)
          .where(
            and(
              eq(contractReviewChecklist.contractTypeId, type.id),
              eq(contractReviewChecklist.signingPlace, 'global')
            )
          );

        const insertData = items.map((item, index) => ({
          id: getUuid(),
          contractTypeId: type.id,
          contractTypeName: type.nameZh,
          contractType: type.code,
          contractSubtype: '',
          signingPlace: 'global',
          userParty: null,
          itemCode: `CHK_${type.code}_${String(index + 1).padStart(3, '0')}`,
          itemTitle: item.element_name || 'Unnamed',
          itemDescription: `【${item.category || '未分类'}】\n描述：${item.description || ''}\n提取指令：${item.audit_focus || ''}`,
          severity: 'medium',
          weight: 50,
          sort: index,
          isRequired: true,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await db().insert(contractReviewChecklist).values(insertData);
        console.log(`  - Successfully saved checklists for ${typeName}.`);
      } else {
        console.warn(`  - No items found in aggregated JSON for ${typeName}.`);
      }
    } catch (e) {
      console.error(`  - Error processing ${typeName}:`, e);
    }
  }

  console.log('Finished checklist generation.');
}

// Allow running directly via tsx/ts-node
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateChecklists()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
