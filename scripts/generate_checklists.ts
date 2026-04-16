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
    // 定义一个 AbortController 实例，用于取消请求
    // 这里假设 timeoutMs 是一个毫秒级的时间戳，用于设置请求超时时间
    // 如果 timeoutMs 是一个秒级的时间戳，需要乘以 1000 转换为毫秒级
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
        // 设置请求超时时间
        signal: controller.signal,
      });
      // 取消定时器，因为请求成功
      clearTimeout(timer);

      // 把响应体转换为字符串格式
      const raw = await res.text();
      // !res.ok：状态码不在 200~299 → 请求失败（404、500、401、403 等）
      if (!res.ok) {
        throw new Error(raw || `http error: ${res.status}`);
      }
      try {
        // 尝试解析 JSON 字符串，返回解析后的对象
        return JSON.parse(raw);
      } catch (_) {
        throw new Error(raw || 'invalid json response');
      }
    } catch (e: any) {
      // 取消定时器，因为请求失败
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

  // 从响应体中提取文本内容
  // 先访问 data ，再安全的访问 choices （通常是一个数组），使用 [0] 访问第一个元素
  // 最后访问 message 属性，再访问 content 属性，返回文本内容
  // 如果没有找到 content 属性，或者 content 属性不是字符串类型，抛出错误
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
  const controller = new AbortController();
  const timeoutMs = 600000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        // claude 模型响应非常慢（超过60秒）。在非流式（stream: false）模式下，Claude 必须全部写完才发回数据。中间网络层（网关或代理）看到 60 秒内没有任何数据传输，认为连接已经“死”了，于是主动断开了连接（Idle Timeout）。此时会抛出 fetch failed 错误。
        // 开启 stream: true 后，Claude 只要生成出第一个字，就会立刻发给脚本。因为连接中一直有数据在传输，中间的网关就不会认为连接“闲置”了，也就不会在 60 秒时强制断开。
        stream: true,
      }),
    });

    const contentType = String(res.headers.get('content-type') || '');
    const raw = await res.text();
    if (!res.ok) {
      throw new Error(raw || `http error: ${res.status}`);
    }

    // Some gateways may still return JSON even if stream=true.
    if (contentType.includes('application/json')) {
      const data = JSON.parse(raw);
      const text = data?.content?.find?.((b: any) => b?.type === 'text')?.text;
      if (!text || typeof text !== 'string') {
        throw new Error(
          data?.error?.message || data?.msg || 'invalid claude response'
        );
      }
      return text;
    }

    // SSE response: parse data: lines and accumulate text deltas.
    const text = extractTextFromClaudeSse(raw);
    if (!text) {
      throw new Error('empty claude sse response');
    }
    return text;
  } catch (e: any) {
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function extractTextFromClaudeSse(raw: string) {
  const lines = String(raw || '').split('\n');
  let out = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;
    let obj: any = null;
    try {
      obj = JSON.parse(payload);
    } catch (_) {
      continue;
    }
    const deltaText =
      obj?.delta?.text ||
      obj?.content_block?.text ||
      obj?.content?.find?.((b: any) => b?.type === 'text')?.text ||
      '';
    if (typeof deltaText === 'string' && deltaText) {
      out += deltaText;
    }
  }
  return out.trim();
}

async function fetchFromClaudeWithFallback(
  prompt: string,
  token: string,
  models: string[]
) {
  let lastError: any = null;
  for (const model of models) {
    try {
      const text = await fetchFromClaude(
        prompt,
        token,
        model,
        'https://api.kie.ai/claude/v1/messages'
      );
      return { model, text };
    } catch (e: any) {
      lastError = e;
      const msg = e?.message ? String(e.message) : '';
      if (msg.includes('being maintained')) {
        continue;
      }
      continue;
    }
  }
  throw lastError || new Error('claude request failed');
}

async function aggregateWithFallback({
  token,
  typeName,
  gpt5Draft,
  geminiDraft,
  claudeDraft,
}: {
  token: string;
  typeName: string;
  gpt5Draft: string;
  geminiDraft: string;
  claudeDraft: string;
}) {
  const aggPrompt = `
你是一位精通比较法学（Common Law & Civil Law）的国际商事合同架构专家。

我们针对【${typeName}】的通用结构化检查清单，分别使用了多个不同的大模型生成了草案。
请你对这些草案进行汇总、去重、整理和提炼，输出一份最完备、最准确的最终检查清单。

# Core Directives
1. 保持中立：不要偏袒甲乙任何一方。
2. 剥离地域性法律：不要引用任何特定国家（如美国、中国）的具体法律条文或默认商业习惯。
3. 聚焦“必须明确的维度”：列出该类合同在全球商业实践中，最容易产生纠纷、必须被明确定义的关键要素。
4. 分类需清晰合理，要素名称精炼，描述和提取指令要有可操作性。

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

# 草案三 (Claude)
${claudeDraft}
`;

  try {
    const res = await fetchFromClaudeWithFallback(aggPrompt, token, [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
    ]);
    return { provider: 'claude', model: res.model, text: res.text };
  } catch (_) {
    const text = await fetchFromOpenAICompat(
      aggPrompt,
      token,
      'gpt-5-2',
      'https://api.kie.ai/gpt-5-2/v1/chat/completions'
    );
    return { provider: 'openai-compat', model: 'gpt-5-2', text };
  }
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
  // 检查 token 是否包含非 ASCII 字符
  // 这里假设 token 是一个 ASCII 字符串，不包含中文字符
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

  // 先用第一个类型来测试一下
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
      let claudeDraft = '';
      try {
        console.log(`  - Claude...`);
        const res = await fetchFromClaudeWithFallback(basePrompt, token, [
          'claude-opus-4-6',
          'claude-sonnet-4-6',
        ]);
        claudeDraft = res.text;
        console.log(`  - Claude Draft (${res.model}): ${claudeDraft}`);
      } catch (e: any) {
        claudeDraft = '';
        console.log(
          `  - Claude Draft skipped: ${e?.message ? String(e.message) : 'error'}`
        );
      }

      // console.log(`  - Calling GPT-5-2...`);
      // const gpt5Draft = await fetchFromOpenAICompat(
      //   basePrompt,
      //   token,
      //   'gpt-5-2',
      //   'https://api.kie.ai/gpt-5-2/v1/chat/completions'
      // );
      // console.log(`  - GPT-5-2 Draft: ${gpt5Draft}`);

      // console.log(`  - Calling Gemini-3.1-Pro...`);
      // const geminiDraft = await fetchFromOpenAICompat(
      //   basePrompt,
      //   token,
      //   'gemini-3.1-pro-openai',
      //   'https://api.kie.ai/gemini-3.1-pro/v1/chat/completions'
      // );
      // console.log(`  - Gemini-3.1-Pro Draft: ${geminiDraft}`);

      // console.log(`  - Aggregating...`);
      // const aggregated = await aggregateWithFallback({
      //   token,
      //   typeName,
      //   gpt5Draft,
      //   geminiDraft,
      //   claudeDraft,
      // });
      // console.log(`  - Aggregated by ${aggregated.model}`);

      // let items: any[] = [];
      // try {
      //   items = extractJson(aggregated.text);
      // } catch (err) {
      //   console.error(
      //     `  - Failed to parse aggregated JSON for ${typeName}:`,
      //     err
      //   );
      //   continue;
      // }

      // if (Array.isArray(items) && items.length > 0) {
      //   console.log(`  - Inserting ${items.length} items to database...`);
      //   await db()
      //     .delete(contractReviewChecklist)
      //     .where(
      //       and(
      //         eq(contractReviewChecklist.contractTypeId, type.id),
      //         eq(contractReviewChecklist.signingPlace, 'global')
      //       )
      //     );

      //   const insertData = items.map((item, index) => ({
      //     id: getUuid(),
      //     contractTypeId: type.id,
      //     contractTypeName: type.nameZh,
      //     contractType: type.code,
      //     contractSubtype: '',
      //     signingPlace: 'global',
      //     userParty: null,
      //     itemCode: `CHK_${type.code}_${String(index + 1).padStart(3, '0')}`,
      //     itemTitle: item.element_name || 'Unnamed',
      //     itemDescription: `【${item.category || '未分类'}】\n描述：${item.description || ''}\n提取指令：${item.audit_focus || ''}`,
      //     severity: 'medium',
      //     weight: 50,
      //     sort: index,
      //     isRequired: true,
      //     isActive: true,
      //     createdAt: new Date(),
      //     updatedAt: new Date(),
      //   }));

      //   await db().insert(contractReviewChecklist).values(insertData);
      //   console.log(`  - Successfully saved checklists for ${typeName}.`);
      // } else {
      //   console.warn(`  - No items found in aggregated JSON for ${typeName}.`);
      // }
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
