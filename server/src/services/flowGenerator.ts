import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { FlowSpec, flowSpecSchema, validateFlowSpec } from "../../../shared/flow.js";

const DEFAULT_OPENAI_TIMEOUT_MS = 60000;
const INVALID_API_KEY_MESSAGE = "输入的 API key 不合法，请重新输入。";

export class InvalidOpenAIApiKeyError extends Error {
  constructor() {
    super(INVALID_API_KEY_MESSAGE);
    this.name = "InvalidOpenAIApiKeyError";
  }
}

const systemPrompt = `你是 Fireworks Tech Graph 风格的流程图结构化助手。把用户口语化中文流程描述转换为可画流程图的 JSON。
要求：
- 保留用户原语言，不翻译标签。
- 必须包含一个 start 节点和至少一个 end 节点。
- 普通动作使用 process，判断/如果/是否/通过不通过使用 decision。
- 节点标签尽量短，优先 3-10 个中文字符；长句应拆成多个 process 节点。
- decision 表示一个明确问题，出边必须至少包含两个分支。
- decision 的出边必须写 label，例如“是”“否”“通过”“不通过”；普通边的 label 使用 null。
- 优先生成像 Origin/draw.io 一样逻辑清楚的流程：一条清晰主干 + 必要分支，不要为了装饰增加节点。
- 主干步骤过长时要合并同类连续动作，建议总节点 6-14 个；只有用户明确给出复杂流程时才超过 18 个节点。
- 避免把所有步骤串成很深的单列长链；连续准备/校验/处理动作可以合并成阶段节点，异常和补充分支从 decision 旁路接回主干或结束。
- 避免交叉连线：不要让多个分支互相跳转；回退边只接回最近的合理步骤，不要跨越多个阶段。
- decision 后的肯定分支通常进入主干下一步，否定/异常/补充分支放到旁路后回到当前 decision 前后的合理节点。
- id 使用英文、数字、下划线或短横线。
- warnings 必须返回数组；没有警告时返回空数组。
- 不要输出 Markdown，只输出符合 schema 的 JSON。`;

const refinementPrompt = `你是流程图结构审校助手。你会收到用户原始流程描述，以及一个已经符合 schema 的流程图 JSON。
任务是在不改变业务语义的前提下润色这个 JSON，使它更适合在单个预览框中完整展示。
要求：
- 保留用户原语言，不翻译标签。
- 优先减少无意义节点和过深主干；合并连续且同类的普通动作。
- 保持一条清晰主干，必要分支从 decision 旁路接出，并就近回到主干或结束。
- 避免交叉连线和远距离回跳；不要让多个分支相互跳转。
- 总节点优先控制在 6-14 个；复杂流程也尽量不超过 18 个。
- 必须保留 start 节点、至少一个 end 节点、关键 decision 及其出边 label。
- 如果原流程已经清晰，只做极小调整。
- warnings 必须返回数组；没有警告时返回空数组。
- 不要输出 Markdown，只输出符合 schema 的 JSON。`;

function cleanEnv(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function openaiTimeoutMs(): number {
  const raw = Number(process.env.OPENAI_TIMEOUT_MS);
  return Number.isFinite(raw) && raw >= 3000 ? raw : DEFAULT_OPENAI_TIMEOUT_MS;
}

function slug(index: number): string {
  return `n${String(index).padStart(2, "0")}`;
}

function splitTranscript(transcript: string): string[] {
  return transcript
    .replace(/\r/g, "")
    .split(/(?:\n+|[。；;]|然后|接着|再|之后|最后|此外|同时)/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 24);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`OpenAI 调用超过 ${Math.round(timeoutMs / 1000)} 秒未响应。`)), timeoutMs);
    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}

function warningFromOpenAIError(error: unknown): string {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: number }).status) : undefined;
  const message = error instanceof Error ? error.message : "OpenAI 调用失败。";

  if (status === 401 || /incorrect api key|invalid api key|unauthorized/i.test(message)) {
    return "OpenAI 鉴权失败：请检查 OPENAI_API_KEY；如果使用 OpenAI 兼容服务，请同时配置 OPENAI_BASE_URL。已降级为本地规则解析草稿。";
  }

  if (status === 404 || /model/i.test(message)) {
    return "OpenAI 模型或接口不可用：请检查 OPENAI_MODEL，以及兼容服务是否支持 Responses API。已降级为本地规则解析草稿。";
  }

  if (/timeout|timed out|超过/i.test(message)) {
    return "OpenAI 接口响应超时，已降级为本地规则解析草稿。";
  }

  return `OpenAI 调用失败，已降级为本地规则解析草稿：${message}`;
}

function isInvalidOpenAIKeyError(error: unknown): boolean {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: number }).status) : undefined;
  const message = error instanceof Error ? error.message : "";
  return status === 401 || /incorrect api key|invalid api key|unauthorized/i.test(message);
}

async function refineFlowSpec(
  client: OpenAI,
  model: string,
  transcript: string,
  flow: FlowSpec,
  timeoutMs: number
): Promise<FlowSpec> {
  const response = await withTimeout(
    client.responses.parse({
      model,
      input: [
        { role: "system", content: refinementPrompt },
        {
          role: "user",
          content: JSON.stringify(
            {
              transcript,
              flow
            },
            null,
            2
          )
        }
      ],
      text: {
        format: zodTextFormat(flowSpecSchema, "flow_spec_refined")
      }
    }),
    Math.max(8000, Math.min(timeoutMs, 30000))
  );

  const refined = response.output_parsed;
  if (!refined) throw new Error("OpenAI 没有返回可解析的润色流程结构。");
  const parsed = flowSpecSchema.parse(refined);
  return {
    ...parsed,
    warnings: [...parsed.warnings, ...validateFlowSpec(parsed)]
  };
}

export function generateFallbackFlow(transcript: string, extraWarnings: string[] = []): FlowSpec {
  const parts = splitTranscript(transcript);
  const meaningful = parts.length ? parts : [transcript.trim() || "处理用户输入"];
  const nodes: FlowSpec["nodes"] = [
    { id: "start", type: "start", label: "开始" },
    ...meaningful.map((label, index) => ({
      id: slug(index + 1),
      type: /是否|如果|判断|通过|失败|成功|检查|审核|确认|满足|发现|若|否则|退款|异常/.test(label) ? "decision" : "process",
      label
    }) satisfies FlowSpec["nodes"][number]),
    { id: "end", type: "end", label: "结束" }
  ];

  const edges: FlowSpec["edges"] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const from = nodes[index];
    const to = nodes[index + 1];
    edges.push({
      id: `e${String(index + 1).padStart(2, "0")}`,
      from: from.id,
      to: to.id,
      label: from.type === "decision" ? "是" : null
    });
  }

  return {
    title: meaningful[0]?.slice(0, 24) || "自动流程图",
    nodes,
    edges,
    warnings: [
      ...extraWarnings,
      "未使用 OpenAI 结构化解析，当前结果为本地规则生成的草稿流程。"
    ]
  };
}

export async function generateFlowSpec(transcript: string, options: { apiKey?: string } = {}): Promise<FlowSpec> {
  const apiKey = cleanEnv(options.apiKey) || cleanEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) return generateFallbackFlow(transcript, ["未配置 OPENAI_API_KEY。"]);

  const baseURL = cleanEnv(process.env.OPENAI_BASE_URL);
  const timeout = openaiTimeoutMs();
  const client = new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout,
    maxRetries: 0
  });
  const model = cleanEnv(process.env.OPENAI_MODEL) || "gpt-4.1-mini";

  try {
    const response = await withTimeout(
      client.responses.parse({
        model,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: transcript }
        ],
        text: {
          format: zodTextFormat(flowSpecSchema, "flow_spec")
        }
      }),
      timeout + 2000
    );

    const parsed = response.output_parsed;
    if (!parsed) throw new Error("OpenAI 没有返回可解析的流程结构。");

    const flow = flowSpecSchema.parse(parsed);
    const validatedFlow = {
      ...flow,
      warnings: [...flow.warnings, ...validateFlowSpec(flow)]
    };

    try {
      return await refineFlowSpec(client, model, transcript, validatedFlow, timeout);
    } catch (refineError) {
      const message = refineError instanceof Error ? refineError.message : "OpenAI 润色失败。";
      return {
        ...validatedFlow,
        warnings: [...validatedFlow.warnings, `OpenAI 流程润色未完成，已使用初版结构：${message}`]
      };
    }
  } catch (error) {
    if (isInvalidOpenAIKeyError(error)) {
      throw new InvalidOpenAIApiKeyError();
    }
    return generateFallbackFlow(transcript, [warningFromOpenAIError(error)]);
  }
}
