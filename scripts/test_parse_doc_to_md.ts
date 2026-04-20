import { pathToFileURL } from 'url';

type OpenAICompatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: { message?: string };
  msg?: string;
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const out: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--model') {
      out.model = String(args[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--api') {
      out.api = String(args[i + 1] || '');
      i += 1;
      continue;
    }
    if (a === '--key') {
      out.key = String(args[i + 1] || '');
      i += 1;
      continue;
    }
    if (a.startsWith('--')) {
      continue;
    }
    positionals.push(a);
  }

  return { flags: out, positionals };
}

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

function buildPrompt() {
  return [
    '你是一个“严格保真”的合同文档解析器。',
    '',
    '任务：把我提供的 PDF/DOC/DOCX 合同文档内容解析为 Markdown。',
    '',
    '强制要求（必须全部遵守）：',
    '1) 严格按照原文输出：不得改写、不得润色、不得补全、不得总结。',
    '2) 不得新增任何原文不存在的文字，也不得删除任何原文文字。',
    '3) 不得根据常识修正错别字/格式/日期/金额/名称，必须原样保留。',
    '4) 仅允许做“结构化排版”的转换：标题/段落/列表/表格等，用 Markdown 表达；内容必须逐字一致。',
    '5) 不要输出任何解释、免责声明、前言或后记，只输出 Markdown 正文。',
    '',
    '输出：直接输出 Markdown（不要包裹 ```）。',
  ].join('\n');
}

async function parseDocToMarkdown({
  token,
  fileUrl,
  model,
  apiUrl,
}: {
  token: string;
  fileUrl: string;
  model: string;
  apiUrl: string;
}) {
  const prompt = buildPrompt();
  const data = (await fetchJsonWithRetry(apiUrl, {
    token,
    retries: 1,
    timeoutMs: 10 * 60 * 1000,
    body: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: fileUrl } },
          ],
        },
      ],
      reasoning_effort: 'high',
      stream: false,
    },
  })) as OpenAICompatResponse;

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error(
      data?.error?.message || data?.msg || 'invalid openai-compat response'
    );
  }
  return content.trim();
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv);
  const fileUrl = String(positionals[0] || '').trim();
  if (!fileUrl) {
    throw new Error('Missing fileUrl. Usage: npx tsx scripts/test_parse_doc_to_md.ts <fileUrl> [--model gpt-5-2]');
  }

  const token = String(flags.key || process.env.KIE_API_KEY || '').trim();
  if (!token) {
    throw new Error('Missing KIE_API_KEY env or --key');
  }
  if (/[^\x20-\x7e]/.test(token)) {
    throw new Error('Invalid KIE_API_KEY: contains non-ASCII characters');
  }

  const model = String(flags.model || 'gpt-5-2').trim();
  const apiUrl = String(
    flags.api || `https://api.kie.ai/${model}/v1/chat/completions`
  ).trim();

  const markdown = await parseDocToMarkdown({ token, fileUrl, model, apiUrl });
  process.stdout.write(markdown);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e?.message ? String(e.message) : e);
    process.exit(1);
  });
}

