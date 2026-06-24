import dagre from "dagre";
import type { FlowSpec, LayoutResult, PositionedNode } from "./flow.js";
import { defaultStyleProfile, getStyleProfile, styleForNodeType, type DiagramStyleId, type StyleProfile } from "./styleProfile.js";

function edgeAnchor(from: PositionedNode, to: PositionedNode) {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return {
      start: { x: dx >= 0 ? from.x + from.width : from.x, y: fromCenter.y },
      end: { x: dx >= 0 ? to.x : to.x + to.width, y: toCenter.y }
    };
  }

  return {
    start: { x: fromCenter.x, y: dy >= 0 ? from.y + from.height : from.y },
    end: { x: toCenter.x, y: dy >= 0 ? to.y : to.y + to.height }
  };
}

function edgePoints(from: PositionedNode, to: PositionedNode): Array<{ x: number; y: number }> {
  const { start, end } = edgeAnchor(from, to);

  if (Math.abs(start.x - end.x) < 8) return [start, end];
  if (Math.abs(start.y - end.y) < 8) return [start, end];

  const midY = start.y + (end.y - start.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

function visualTextLength(value: string): number {
  return Array.from(value).reduce((total, char) => total + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0);
}

function nodeSize(node: FlowSpec["nodes"][number], profile: StyleProfile): { width: number; height: number } {
  const style = styleForNodeType(node.type, profile);
  const length = visualTextLength(node.label);
  const maxWidth = node.type === "decision" ? 290 : 340;
  const targetCharsPerLine = node.type === "decision" ? 14 : 18;
  const lines = Math.max(1, Math.ceil(length / targetCharsPerLine));
  const width = Math.min(maxWidth, Math.max(style.width, Math.ceil(Math.min(length, targetCharsPerLine) * 8 + 98)));
  const height = Math.max(style.height, style.height + Math.max(0, lines - 1) * 18);
  return { width, height };
}

type LayoutDirection = "TB" | "LR";

function buildLayout(flow: FlowSpec, profile: StyleProfile, rankdir: LayoutDirection): LayoutResult {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir,
    ranksep: profile.spacing.rankSep,
    nodesep: profile.spacing.nodeSep,
    marginx: profile.spacing.marginX,
    marginy: profile.spacing.marginY
  });

  for (const node of flow.nodes) {
    graph.setNode(node.id, nodeSize(node, profile));
  }

  const nodeIds = new Set(flow.nodes.map((node) => node.id));
  for (const edge of flow.edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) graph.setEdge(edge.from, edge.to);
  }

  dagre.layout(graph);

  const nodes: PositionedNode[] = flow.nodes.map((node) => {
    const graphNode = graph.node(node.id);
    const size = nodeSize(node, profile);
    const width = graphNode?.width ?? size.width;
    const height = graphNode?.height ?? size.height;
    return {
      ...node,
      width,
      height,
      x: Math.round((graphNode?.x ?? width / 2) - width / 2),
      y: Math.round((graphNode?.y ?? height / 2) - height / 2)
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = flow.edges
    .filter((edge) => byId.has(edge.from) && byId.has(edge.to))
    .map((edge) => ({
      ...edge,
      points: edgePoints(byId.get(edge.from)!, byId.get(edge.to)!)
    }));

  const right = Math.max(...nodes.map((node) => node.x + node.width), profile.spacing.marginX * 2);
  const bottom = Math.max(...nodes.map((node) => node.y + node.height), profile.spacing.marginY * 2);

  return {
    width: Math.ceil(right + profile.spacing.marginX),
    height: Math.ceil(bottom + profile.spacing.marginY),
    nodes,
    edges
  };
}

function layoutScore(layout: LayoutResult): number {
  const ratio = layout.width / Math.max(layout.height, 1);
  const targetRatio = 16 / 10;
  const ratioPenalty = Math.abs(Math.log(ratio / targetRatio)) * 1000;
  const heightPenalty = Math.max(0, layout.height - 920) * 2;
  const widthPenalty = Math.max(0, layout.width - 1800) * 0.7;
  return ratioPenalty + heightPenalty + widthPenalty + layout.width * layout.height * 0.00005;
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

function orderLinearNodes(flow: FlowSpec): string[] {
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

function buildColumnLayout(flow: FlowSpec, profile: StyleProfile): LayoutResult {
  const orderedIds = orderLinearNodes(flow);
  const byId = new Map(flow.nodes.map((node) => [node.id, node]));
  const columns = Math.min(3, Math.max(2, Math.ceil(orderedIds.length / 4)));
  const rowsPerColumn = Math.ceil(orderedIds.length / columns);
  const columnWidth = Math.max(300, Math.max(...flow.nodes.map((node) => nodeSize(node, profile).width)) + profile.spacing.nodeSep);
  const rowHeight = Math.max(132, Math.max(...flow.nodes.map((node) => nodeSize(node, profile).height)) + profile.spacing.rankSep * 0.55);

  const nodes: PositionedNode[] = orderedIds.flatMap((id, index) => {
    const node = byId.get(id);
    if (!node) return [];
    const size = nodeSize(node, profile);
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const isReverseColumn = column % 2 === 1;
    const visualRow = isReverseColumn ? rowsPerColumn - row - 1 : row;
    return [
      {
        ...node,
        width: size.width,
        height: size.height,
        x: Math.round(profile.spacing.marginX + column * columnWidth + (columnWidth - size.width) / 2),
        y: Math.round(profile.spacing.marginY + visualRow * rowHeight)
      }
    ];
  });

  const byPositionedId = new Map(nodes.map((node) => [node.id, node]));
  const edges = flow.edges
    .filter((edge) => byPositionedId.has(edge.from) && byPositionedId.has(edge.to))
    .map((edge) => ({
      ...edge,
      points: edgePoints(byPositionedId.get(edge.from)!, byPositionedId.get(edge.to)!)
    }));

  const right = Math.max(...nodes.map((node) => node.x + node.width), profile.spacing.marginX * 2);
  const bottom = Math.max(...nodes.map((node) => node.y + node.height), profile.spacing.marginY * 2);

  return {
    width: Math.ceil(right + profile.spacing.marginX),
    height: Math.ceil(bottom + profile.spacing.marginY),
    nodes,
    edges
  };
}

export function layoutFlow(flow: FlowSpec, styleId?: DiagramStyleId): LayoutResult {
  const profile: StyleProfile = getStyleProfile(styleId);
  const topDown = buildLayout(flow, profile, "TB");
  const canWrapIntoColumns = topDown.height > 920 && isMostlyLinear(flow);
  if (!canWrapIntoColumns) return topDown;

  const columnLayout = buildColumnLayout(flow, profile);
  return layoutScore(columnLayout) < layoutScore(topDown) ? columnLayout : topDown;
}
