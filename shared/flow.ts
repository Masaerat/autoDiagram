import { z } from "zod";
import type { DiagramStyleId } from "./styleProfile.js";

export const flowNodeTypes = ["start", "end", "process", "decision"] as const;

export const flowNodeSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  type: z.enum(flowNodeTypes),
  label: z.string().min(1).max(120)
});

export const flowEdgeSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(80).nullable()
});

export const flowSpecSchema = z.object({
  title: z.string().min(1).max(80),
  nodes: z.array(flowNodeSchema).min(2).max(80),
  edges: z.array(flowEdgeSchema).max(160),
  warnings: z.array(z.string())
});

export type FlowNodeType = (typeof flowNodeTypes)[number];
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type FlowEdge = z.infer<typeof flowEdgeSchema>;
export type FlowSpec = z.infer<typeof flowSpecSchema>;

export type PositionedNode = FlowNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PositionedEdge = FlowEdge & {
  points: Array<{ x: number; y: number }>;
};

export type LayoutResult = {
  width: number;
  height: number;
  nodes: PositionedNode[];
  edges: PositionedEdge[];
};

export type RendererMode = "svg_drawio";

export type ReviewCategory =
  | "topology"
  | "scene_organization"
  | "layout_density"
  | "edge_routing"
  | "text_readability"
  | "style_consistency";

export type ReviewSeverity = "blocking" | "important" | "polish";

export type ReviewFinding = {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  message: string;
  targetId?: string;
};

export type SceneIteration = {
  round: number;
  score: number;
  findings: ReviewFinding[];
  previewSvg: string;
};

export type GenerateFlowResponse = {
  jobId: string;
  rendererMode: RendererMode;
  style: {
    id: DiagramStyleId;
    name: string;
  };
  flow: FlowSpec;
  scene: {
    title: string;
    nodeCount: number;
    edgeCount: number;
    score: number;
  };
  iterations: SceneIteration[];
  preview: {
    svg: string;
    pngDataUrl?: string;
  };
  downloads: {
    drawio: { filename: string; content: string };
    svg: { filename: string; content: string };
    png?: { filename: string; dataUrl: string };
  };
  warnings: string[];
};

export function validateFlowSpec(flow: FlowSpec): string[] {
  const warnings: string[] = [];
  const ids = new Set<string>();

  for (const node of flow.nodes) {
    if (ids.has(node.id)) warnings.push(`节点 id 重复: ${node.id}`);
    ids.add(node.id);
  }

  const startNodes = flow.nodes.filter((node) => node.type === "start");
  if (startNodes.length !== 1) warnings.push("流程需要且只能有一个开始节点。");
  if (!flow.nodes.some((node) => node.type === "end")) warnings.push("流程至少需要一个结束节点。");

  for (const edge of flow.edges) {
    if (!ids.has(edge.from)) warnings.push(`连线 ${edge.id} 的起点不存在: ${edge.from}`);
    if (!ids.has(edge.to)) warnings.push(`连线 ${edge.id} 的终点不存在: ${edge.to}`);
  }

  const start = startNodes[0];
  if (start) {
    const reachable = new Set<string>([start.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of flow.edges) {
        if (reachable.has(edge.from) && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          changed = true;
        }
      }
    }
    for (const node of flow.nodes) {
      if (!reachable.has(node.id)) warnings.push(`节点不可从开始节点到达: ${node.label}`);
    }
  }

  for (const node of flow.nodes.filter((item) => item.type === "decision")) {
    const outgoing = flow.edges.filter((edge) => edge.from === node.id);
    if (outgoing.length < 2) warnings.push(`判断节点“${node.label}”建议至少有两条出边。`);
    if (outgoing.some((edge) => !edge.label)) warnings.push(`判断节点“${node.label}”的出边建议标注条件。`);
  }

  return warnings;
}
