import { spawn } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FlowEdge, FlowNode, FlowSpec } from "../../../shared/flow.js";
import type { DiagramScene } from "../../../shared/scene.js";
import { normalizeDiagramStyleId, type DiagramStyleId, type FireworksStyleId } from "../../../shared/styleProfile.js";

const SKILL_SCRIPT = "C:\\Users\\admin\\.codex\\skills\\fireworks-tech-graph-main\\scripts\\generate-from-template.py";
const PYTHON = "D:\\SoftWare\\Python\\python.exe";

type Port = "left" | "right" | "top" | "bottom";
type FlowKind = "control" | "read" | "write" | "data" | "async" | "feedback" | "neutral";

type TemplateNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  type_label?: string;
  sublabel?: string;
  fill?: string;
  stroke?: string;
  flat?: boolean;
  glow?: "blue" | "purple" | "green" | "orange";
  header_fill?: string;
  icon_fill?: string;
  icon_stroke?: string;
  line_stroke?: string;
  tags?: Array<{ label: string; fill: string; stroke: string; text_fill: string }>;
};

type TemplateArrow = {
  source: string;
  target: string;
  source_port: Port;
  target_port: Port;
  flow: FlowKind;
  label?: string;
  dashed?: boolean;
  label_style?: "badge" | "offset";
  route_points?: number[][];
  corridor_x?: number[];
  corridor_y?: number[];
  label_dx?: number;
  label_dy?: number;
};

export type TemplateData = {
  template_type: "flowchart";
  style: number;
  width: number;
  height: number;
  title: string;
  subtitle: string;
  style_overrides?: Record<string, unknown>;
  window_controls?: boolean;
  meta_center?: string;
  meta_right?: string;
  meta_fill?: string;
  blueprint_title_block?: {
    title: string;
    subtitle: string;
    center_caption: string;
    left_caption: string;
    right_caption: string;
    width: number;
    height: number;
    x: number;
    y: number;
  };
  containers: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    subtitle: string;
    stroke?: string;
    fill?: string;
    header_prefix?: string;
    side_label?: string;
    side_label_x?: number;
    side_label_anchor?: "start" | "middle" | "end";
    rx?: number;
  }>;
  nodes: TemplateNode[];
  arrows: TemplateArrow[];
  legend: Array<{ flow: FlowKind; label: string }>;
  legend_position: "bottom-left" | "bottom-right";
  legend_x?: number;
  legend_y: number;
  legend_box?: boolean;
  legend_box_fill?: string;
  footer: string;
};

type LayoutNode = FlowNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  lane: number;
};

type StyleRecipe = {
  subtitle: string;
  width: number;
  top: number;
  stepY: number;
  nodeW: number;
  nodeH: number;
  decisionW: number;
  decisionH: number;
  branchGap: number;
  colors: {
    fill: string;
    stroke: string;
    accent: string;
    altStroke: string;
    container: string;
    containerFill: string;
    decisionFill: string;
    startFill: string;
    endFill: string;
  };
  kinds: {
    start: string;
    process: string[];
    decision: string;
    end: string;
  };
  flat?: boolean;
  glow?: boolean;
  terminal?: boolean;
  folderEvery?: number;
  documentEvery?: number;
  legendPosition: "bottom-left" | "bottom-right";
  legendBox?: boolean;
};

const RECIPES: Record<Exclude<FireworksStyleId, 8>, StyleRecipe> = {
  1: {
    subtitle: "Flat icon flowchart with semantic cards, clear containers, and labeled decision paths",
    width: 1080,
    top: 128,
    stepY: 132,
    nodeW: 184,
    nodeH: 62,
    decisionW: 176,
    decisionH: 78,
    branchGap: 250,
    colors: {
      fill: "#ffffff",
      stroke: "#d1d5db",
      accent: "#2563eb",
      altStroke: "#f97316",
      container: "#dbeafe",
      containerFill: "#f8fbff",
      decisionFill: "#fff7ed",
      startFill: "#eff6ff",
      endFill: "#faf5ff"
    },
    kinds: { start: "user_avatar", process: ["rect", "double_rect", "document"], decision: "hexagon", end: "speech" },
    legendPosition: "bottom-left"
  },
  2: {
    subtitle: "Dark terminal flow with command surfaces, glow accents, and operational routing",
    width: 1120,
    top: 126,
    stepY: 142,
    nodeW: 194,
    nodeH: 68,
    decisionW: 188,
    decisionH: 82,
    branchGap: 270,
    colors: {
      fill: "#111827",
      stroke: "#334155",
      accent: "#a855f7",
      altStroke: "#38bdf8",
      container: "#334155",
      containerFill: "rgba(15,23,42,0.18)",
      decisionFill: "#1e1b4b",
      startFill: "#0f172a",
      endFill: "#0f172a"
    },
    kinds: { start: "speech", process: ["terminal", "double_rect", "rect"], decision: "hexagon", end: "speech" },
    glow: true,
    terminal: true,
    legendPosition: "bottom-right",
    legendBox: true
  },
  3: {
    subtitle: "Blueprint process drawing with tiered zones, engineering labels, and routing lanes",
    width: 1120,
    top: 124,
    stepY: 132,
    nodeW: 178,
    nodeH: 58,
    decisionW: 178,
    decisionH: 78,
    branchGap: 270,
    colors: {
      fill: "#0b3b5e",
      stroke: "#67e8f9",
      accent: "#fde047",
      altStroke: "#67e8f9",
      container: "#0ea5e9",
      containerFill: "none",
      decisionFill: "#0b3b5e",
      startFill: "#0b3b5e",
      endFill: "#0b3b5e"
    },
    kinds: { start: "rect", process: ["rect", "double_rect"], decision: "hexagon", end: "rect" },
    flat: true,
    legendPosition: "bottom-right",
    legendBox: true
  },
  4: {
    subtitle: "Notion-clean SOP flow with compact cards, quiet labels, and minimal arrows",
    width: 1040,
    top: 108,
    stepY: 116,
    nodeW: 220,
    nodeH: 76,
    decisionW: 172,
    decisionH: 76,
    branchGap: 250,
    colors: {
      fill: "#ffffff",
      stroke: "#e5e7eb",
      accent: "#3b82f6",
      altStroke: "#d1d5db",
      container: "#e5e7eb",
      containerFill: "none",
      decisionFill: "#ffffff",
      startFill: "#ffffff",
      endFill: "#ffffff"
    },
    kinds: { start: "rect", process: ["rect"], decision: "hexagon", end: "rect" },
    flat: true,
    legendPosition: "bottom-left"
  },
  5: {
    subtitle: "Glassmorphism process map with translucent panels, spacious layout, and presentation-grade contrast",
    width: 1160,
    top: 142,
    stepY: 148,
    nodeW: 208,
    nodeH: 74,
    decisionW: 200,
    decisionH: 88,
    branchGap: 300,
    colors: {
      fill: "rgba(255,255,255,0.12)",
      stroke: "rgba(255,255,255,0.28)",
      accent: "#c084fc",
      altStroke: "#60a5fa",
      container: "rgba(255,255,255,0.2)",
      containerFill: "rgba(255,255,255,0.05)",
      decisionFill: "rgba(192,132,252,0.16)",
      startFill: "rgba(255,255,255,0.12)",
      endFill: "rgba(255,255,255,0.12)"
    },
    kinds: { start: "speech", process: ["rect", "double_rect", "terminal"], decision: "hexagon", end: "speech" },
    glow: true,
    terminal: true,
    legendPosition: "bottom-left",
    legendBox: true
  },
  6: {
    subtitle: "Claude-style warm process architecture with side-labeled layers and restrained hierarchy",
    width: 1120,
    top: 132,
    stepY: 136,
    nodeW: 190,
    nodeH: 62,
    decisionW: 188,
    decisionH: 82,
    branchGap: 270,
    colors: {
      fill: "#fffcf7",
      stroke: "#d9d0c3",
      accent: "#d97757",
      altStroke: "#8c6f5a",
      container: "#ded8cf",
      containerFill: "none",
      decisionFill: "#f7ecda",
      startFill: "#e9f1fb",
      endFill: "#f7ecda"
    },
    kinds: { start: "rect", process: ["rect", "double_rect", "cylinder"], decision: "hexagon", end: "speech" },
    flat: true,
    legendPosition: "bottom-right",
    legendBox: true
  },
  7: {
    subtitle: "OpenAI-style precise flow with minimal surfaces, green accents, and clean control paths",
    width: 1080,
    top: 122,
    stepY: 128,
    nodeW: 188,
    nodeH: 60,
    decisionW: 178,
    decisionH: 78,
    branchGap: 260,
    colors: {
      fill: "#ffffff",
      stroke: "#dce5e3",
      accent: "#10a37f",
      altStroke: "#dce5e3",
      container: "#e2e8f0",
      containerFill: "none",
      decisionFill: "#ffffff",
      startFill: "#ffffff",
      endFill: "#ffffff"
    },
    kinds: { start: "rect", process: ["rect", "double_rect"], decision: "hexagon", end: "rect" },
    flat: true,
    legendPosition: "bottom-left"
  }
};

function runPython(args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || Buffer.concat(stdout).toString("utf8")));
    });
    child.stdin.end(input, "utf8");
  });
}

function isNegativeBranch(label: string | null | undefined): boolean {
  return /否|不|失败|异常|退回|拒绝|驳回|补充|缺/.test(label ?? "");
}

function isAsync(label: string | null | undefined): boolean {
  return /异步|通知|触发|消息|事件|并行|同时/.test(label ?? "");
}

function classifyFlow(edge: FlowEdge, from?: FlowNode): FlowKind {
  if (from?.type === "decision") return isNegativeBranch(edge.label) ? "feedback" : "control";
  if (isAsync(edge.label)) return "async";
  if (/数据|资料|文件|单号|发票|积分/.test(edge.label ?? "")) return "data";
  return "read";
}

function typeLabel(node: FlowNode): string {
  if (node.type === "start") return "START";
  if (node.type === "end") return "END";
  if (node.type === "decision") return "DECISION";
  return "PROCESS";
}

function nodeKind(node: FlowNode, index: number, recipe: StyleRecipe): string {
  if (node.type === "start") return recipe.kinds.start;
  if (node.type === "end") return recipe.kinds.end;
  if (node.type === "decision") return recipe.kinds.decision;
  if (recipe.folderEvery && index > 0 && index % recipe.folderEvery === 0) return "folder";
  if (recipe.documentEvery && index > 0 && index % recipe.documentEvery === 0) return "document";
  return recipe.kinds.process[index % recipe.kinds.process.length];
}

function visualTextLength(value: string): number {
  return Array.from(value).reduce((total, char) => total + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
}

function nodeSizeForLabel(node: FlowNode, recipe: StyleRecipe): { width: number; height: number } {
  const baseWidth = node.type === "decision" ? recipe.decisionW : recipe.nodeW;
  const baseHeight = node.type === "decision" ? recipe.decisionH : recipe.nodeH;
  const length = visualTextLength(node.label);
  const maxWidth = node.type === "decision" ? 286 : 326;
  const targetCharsPerLine = node.type === "decision" ? 13 : 18;
  const lines = Math.max(1, Math.ceil(length / targetCharsPerLine));
  const width = Math.min(maxWidth, Math.max(baseWidth, Math.ceil(Math.min(length, targetCharsPerLine) * 8.2 + 92)));
  const height = Math.max(baseHeight, baseHeight + Math.max(0, lines - 1) * 20);
  return { width, height };
}

function splitNodeLabel(label: string): { label: string; sublabel?: string } {
  const chars = Array.from(label.trim());
  if (chars.length <= 18) return { label };
  const splitAt = Math.min(18, Math.max(10, Math.ceil(chars.length / 2)));
  return {
    label: chars.slice(0, splitAt).join(""),
    sublabel: chars.slice(splitAt).join("")
  };
}

function flowDepths(flow: FlowSpec): Map<string, number> {
  const depths = new Map<string, number>();
  const start = flow.nodes.find((node) => node.type === "start") ?? flow.nodes[0];
  if (!start) return depths;
  depths.set(start.id, 0);
  const queue = [start.id];
  while (queue.length) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current) ?? 0;
    for (const edge of flow.edges.filter((item) => item.from === current)) {
      const nextDepth = currentDepth + 1;
      if (!depths.has(edge.to) || nextDepth < (depths.get(edge.to) ?? Infinity)) {
        depths.set(edge.to, nextDepth);
        queue.push(edge.to);
      }
    }
  }
  flow.nodes.forEach((node, index) => {
    if (!depths.has(node.id)) depths.set(node.id, index);
  });
  return depths;
}

function laneMap(flow: FlowSpec): Map<string, number> {
  const lanes = new Map<string, number>();
  for (const node of flow.nodes) lanes.set(node.id, 0);
  const byId = new Map(flow.nodes.map((node) => [node.id, node]));
  for (const edge of flow.edges) {
    const from = byId.get(edge.from);
    if (from?.type === "decision") lanes.set(edge.to, isNegativeBranch(edge.label) ? -1 : 1);
  }
  return lanes;
}

function isMostlyLinear(flow: FlowSpec): boolean {
  const inDegree = new Map(flow.nodes.map((node) => [node.id, 0]));
  const outDegree = new Map(flow.nodes.map((node) => [node.id, 0]));
  for (const edge of flow.edges) {
    outDegree.set(edge.from, (outDegree.get(edge.from) ?? 0) + 1);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }
  const branchingNodes = flow.nodes.filter((node) => (outDegree.get(node.id) ?? 0) > 1 || (inDegree.get(node.id) ?? 0) > 1);
  return flow.nodes.length >= 7 && branchingNodes.length <= 1;
}

function linearNodeOrder(flow: FlowSpec): string[] {
  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  const incoming = new Map(flow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string>();
  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || outgoing.has(edge.from)) continue;
    outgoing.set(edge.from, edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const start = flow.nodes.find((node) => node.type === "start") ?? flow.nodes.find((node) => (incoming.get(node.id) ?? 0) === 0) ?? flow.nodes[0];
  const ordered: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = start?.id;
  while (current && nodeIds.has(current) && !seen.has(current)) {
    ordered.push(current);
    seen.add(current);
    current = outgoing.get(current);
  }
  for (const node of flow.nodes) {
    if (!seen.has(node.id)) ordered.push(node.id);
  }
  return ordered;
}

function layoutLinearColumns(flow: FlowSpec, recipe: StyleRecipe): LayoutNode[] {
  const orderedIds = linearNodeOrder(flow);
  const byId = new Map(flow.nodes.map((node) => [node.id, node]));
  const columns = Math.min(3, Math.max(2, Math.ceil(orderedIds.length / 4)));
  const rowsPerColumn = Math.ceil(orderedIds.length / columns);
  const columnGap = Math.max(recipe.branchGap, recipe.nodeW + 86);
  const startX = Math.round((recipe.width - ((columns - 1) * columnGap + recipe.nodeW)) / 2);
  const rowStep = Math.max(112, recipe.stepY - 18);

  return orderedIds.flatMap((id, index) => {
    const node = byId.get(id);
    if (!node) return [];
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const visualRow = column % 2 === 1 ? rowsPerColumn - row - 1 : row;
    const { width, height } = nodeSizeForLabel(node, recipe);
    return [
      {
        ...node,
        lane: column,
        width,
        height,
        x: Math.round(startX + column * columnGap + (recipe.nodeW - width) / 2),
        y: recipe.top + visualRow * rowStep
      }
    ];
  });
}

function layoutNodes(flow: FlowSpec, recipe: StyleRecipe): LayoutNode[] {
  if (isMostlyLinear(flow) && flow.nodes.length >= 9) return layoutLinearColumns(flow, recipe);

  const depths = flowDepths(flow);
  const lanes = laneMap(flow);
  const centerX = recipe.width / 2;
  return flow.nodes.map((node, index) => {
    const lane = lanes.get(node.id) ?? 0;
    const { width, height } = nodeSizeForLabel(node, recipe);
    return {
      ...node,
      lane,
      width,
      height,
      x: Math.round(centerX - width / 2 + lane * recipe.branchGap),
      y: recipe.top + (depths.get(node.id) ?? index) * recipe.stepY
    };
  });
}

function port(from: LayoutNode, to: LayoutNode): Pick<TemplateArrow, "source_port" | "target_port"> {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) > Math.abs(dy)) {
    return { source_port: dx >= 0 ? "right" : "left", target_port: dx >= 0 ? "left" : "right" };
  }
  return { source_port: dy >= 0 ? "bottom" : "top", target_port: dy >= 0 ? "top" : "bottom" };
}

function nodeStyle(node: FlowNode, index: number, recipe: StyleRecipe): Pick<TemplateNode, "fill" | "stroke" | "flat" | "glow" | "header_fill" | "line_stroke" | "icon_fill" | "icon_stroke" | "tags"> {
  const c = recipe.colors;
  const glow = recipe.glow ? (node.type === "decision" ? "purple" : index % 3 === 0 ? "blue" : index % 3 === 1 ? "green" : "orange") : undefined;
  const tags = node.type === "decision" ? [{ label: "branch", fill: c.decisionFill, stroke: c.accent, text_fill: c.accent }] : undefined;
  if (node.type === "start") return { fill: c.startFill, stroke: c.accent, flat: recipe.flat, glow, icon_fill: c.startFill, icon_stroke: c.accent };
  if (node.type === "end") return { fill: c.endFill, stroke: c.accent, flat: recipe.flat, glow };
  if (node.type === "decision") return { fill: c.decisionFill, stroke: c.accent, flat: recipe.flat, glow, tags };
  return {
    fill: c.fill,
    stroke: index % 2 === 0 ? c.accent : c.stroke,
    flat: recipe.flat,
    glow,
    header_fill: recipe.terminal ? "rgba(255,255,255,0.12)" : undefined,
    line_stroke: c.accent
  };
}

function containersFor(styleId: Exclude<FireworksStyleId, 8>, recipe: StyleRecipe, width: number, height: number): TemplateData["containers"] {
  if (styleId === 6) {
    const bandHeight = Math.round((height - 190) / 3);
    return ["Input Layer", "Decision Layer", "Resolution Layer"].map((label, index) => ({
      x: 44,
      y: 112 + index * (bandHeight + 28),
      width: width - 88,
      height: bandHeight,
      label: "",
      side_label: label,
      side_label_x: 28,
      side_label_anchor: "start",
      subtitle: "",
      stroke: recipe.colors.container,
      fill: recipe.colors.containerFill
    }));
  }
  if (styleId === 4) {
    return [{ x: 24, y: 34, width: width - 48, height: height - 80, label: "", subtitle: "", stroke: recipe.colors.container, fill: "none", rx: 6 }];
  }
  return [
    {
      x: 40,
      y: 96,
      width: width - 80,
      height: height - 172,
      label: styleId === 3 ? "01 PROCESS FLOW" : styleId === 5 ? "PROCESS WORKSPACE" : "PROCESS FLOW",
      header_prefix: styleId === 3 ? "01" : undefined,
      subtitle: "",
      stroke: recipe.colors.container,
      fill: recipe.colors.containerFill
    }
  ];
}

function templateNode(node: LayoutNode, index: number, recipe: StyleRecipe): TemplateNode {
  const labelParts = splitNodeLabel(node.label);
  return {
    id: node.id,
    kind: nodeKind(node, index, recipe),
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    label: labelParts.label,
    sublabel: labelParts.sublabel,
    type_label: typeLabel(node),
    ...nodeStyle(node, index, recipe)
  };
}

function templateArrows(flow: FlowSpec, nodes: LayoutNode[], recipe: StyleRecipe): TemplateArrow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const flowById = new Map(flow.nodes.map((node) => [node.id, node]));
  const pairUseCount = new Map<string, number>();
  return flow.edges.flatMap((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const ports = port(from, to);
    const fromNode = flowById.get(edge.from);
    const pairKey = `${edge.from}:${edge.to}`;
    const useCount = pairUseCount.get(pairKey) ?? 0;
    pairUseCount.set(pairKey, useCount + 1);
    const laneDelta = to.lane - from.lane;
    const isFeedback = isNegativeBranch(edge.label) || to.y < from.y;
    const corridorOffset = 96 + useCount * 28;
    const corridorX =
      laneDelta !== 0
        ? Math.round(laneDelta > 0 ? Math.max(from.x + from.width, to.x + to.width) + corridorOffset : Math.min(from.x, to.x) - corridorOffset)
        : undefined;
    const corridorY = isFeedback && to.y < from.y ? Math.round(Math.min(from.y, to.y) - 44 - useCount * 18) : undefined;
    const arrow: TemplateArrow = {
      source: edge.from,
      target: edge.to,
      ...ports,
      flow: classifyFlow(edge, fromNode),
      ...(edge.label ? { label: edge.label, label_style: "badge" as const } : {}),
      ...(isNegativeBranch(edge.label) ? { dashed: true } : {}),
      ...(corridorX !== undefined ? { corridor_x: [corridorX] } : {}),
      ...(corridorY !== undefined ? { corridor_y: [corridorY] } : {}),
      label_dx: index % 2 === 1 ? 10 : -10,
      label_dy: isFeedback ? -14 : -8
    };
    return [arrow];
  });
}

function styleExtras(styleId: Exclude<FireworksStyleId, 8>, width: number, height: number): Partial<TemplateData> {
  if (styleId === 2) {
    return {
      window_controls: true,
      meta_center: "FIREWORKS PROCESS FLOW / v1.0",
      meta_right: "style-2-dark-terminal",
      meta_fill: "#64748b"
    };
  }
  if (styleId === 3) {
    return {
      blueprint_title_block: {
        title: "PROCESS MAP",
        subtitle: "FLOWCHART",
        center_caption: "BLUEPRINT STYLE 3",
        left_caption: "REV: 1.0",
        right_caption: "DWG: FLOW-001",
        width: 220,
        height: 76,
        x: width - 252,
        y: height - 96
      }
    };
  }
  if (styleId === 6) return { style_overrides: { title_align: "center" } };
  return {};
}

export function sceneToFireworksTemplate(flow: FlowSpec, _scene: DiagramScene, styleIdInput: DiagramStyleId): TemplateData {
  const styleId = normalizeDiagramStyleId(styleIdInput);
  const templateStyle = styleId === "origin" || styleId === 8 ? 1 : styleId;
  const recipe = RECIPES[templateStyle as Exclude<FireworksStyleId, 8>];
  const nodes = layoutNodes(flow, recipe);
  const bottom = Math.max(...nodes.map((node) => node.y + node.height), 560);
  const height = Math.max(680, bottom + 142);
  const arrows = templateArrows(flow, nodes, recipe);

  return {
    template_type: "flowchart",
    style: templateStyle,
    width: recipe.width,
    height,
    title: flow.title,
    subtitle: recipe.subtitle,
    ...styleExtras(templateStyle as Exclude<FireworksStyleId, 8>, recipe.width, height),
    containers: containersFor(templateStyle as Exclude<FireworksStyleId, 8>, recipe, recipe.width, height),
    nodes: nodes.map((node, index) => templateNode(node, index, recipe)),
    arrows,
    legend: [
      { flow: "read", label: "Process path" },
      { flow: "control", label: "Decision path" },
      { flow: "feedback", label: "Return / exception" },
      ...(arrows.some((arrow) => arrow.flow === "async") ? [{ flow: "async" as const, label: "Async trigger" }] : [])
    ],
    legend_position: recipe.legendPosition,
    legend_x: recipe.legendPosition === "bottom-right" ? recipe.width - 330 : undefined,
    legend_y: height - 94,
    legend_box: recipe.legendBox,
    legend_box_fill: templateStyle === 5 ? "rgba(15,23,42,0.68)" : templateStyle === 2 ? "rgba(15,23,42,0.72)" : templateStyle === 3 ? "#0b3552" : undefined,
    footer: ""
  };
}

export async function renderFireworksTemplateSvg(flow: FlowSpec, scene: DiagramScene, styleIdInput: unknown): Promise<string | null> {
  const styleId = normalizeDiagramStyleId(styleIdInput);
  if (styleId === "origin" || styleId === 8) return null;

  const outputDir = path.join(os.tmpdir(), "auto-diagram-fireworks");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${Date.now()}-${Math.random().toString(16).slice(2)}.svg`);
  const data = sceneToFireworksTemplate(flow, scene, styleId);

  try {
    await runPython([SKILL_SCRIPT, "flowchart", outputPath], JSON.stringify(data));
    return await readFile(outputPath, "utf8");
  } catch {
    return null;
  } finally {
    await unlink(outputPath).catch(() => undefined);
  }
}
