import { escapeXml, safeFilename } from "../render/xml.js";
import dagre from "dagre";
import { inflateRawSync, inflateSync } from "node:zlib";

type MermaidDirection = "TD" | "TB" | "BT" | "LR" | "RL";

type ParsedMermaidNode = {
  id: string;
  label: string;
  shape: "process" | "decision" | "terminator";
};

type ParsedMermaidEdge = {
  id: string;
  from: string;
  to: string;
  label: string | null;
};

type DrawioNode = {
  id: string;
  value: string;
};

type DrawioEdge = {
  source: string;
  target: string;
  value: string;
};

type DrawioLayoutNode = ParsedMermaidNode & {
  x: number;
  y: number;
  width: number;
  height: number;
};

type DrawioLayoutEdge = ParsedMermaidEdge & {
  points: Array<{ x: number; y: number }>;
};

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function attr(xml: string, name: string): string {
  const match = xml.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function normalizeId(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return cleaned || fallback;
}

function stripLabelQuotes(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'" || quote === "`") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseNodeToken(token: string, index: number): ParsedMermaidNode {
  const trimmed = token.trim();
  const patterns: Array<{ regex: RegExp; shape: ParsedMermaidNode["shape"] }> = [
    { regex: /^([a-zA-Z0-9_-]+)\{\{(.+?)\}\}$/, shape: "decision" },
    { regex: /^([a-zA-Z0-9_-]+)\{(.+?)\}$/, shape: "decision" },
    { regex: /^([a-zA-Z0-9_-]+)\(\((.+?)\)\)$/, shape: "terminator" },
    { regex: /^([a-zA-Z0-9_-]+)\((.+?)\)$/, shape: "terminator" },
    { regex: /^([a-zA-Z0-9_-]+)\["(.+?)"\]$/, shape: "process" },
    { regex: /^([a-zA-Z0-9_-]+)\['(.+?)'\]$/, shape: "process" },
    { regex: /^([a-zA-Z0-9_-]+)\[(.+?)\]$/, shape: "process" }
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern.regex);
    if (match) return { id: normalizeId(match[1], `n${index}`), label: stripLabelQuotes(match[2]), shape: pattern.shape };
  }

  return { id: normalizeId(trimmed, `n${index}`), label: trimmed, shape: "process" };
}

function parseEdgeLine(line: string): { fromToken: string; toToken: string; label: string | null } | null {
  const compactLabel = line.match(/^(.+?)\s*-->\s*\|(.+?)\|\s*(.+)$/);
  if (compactLabel) {
    return { fromToken: compactLabel[1], toToken: compactLabel[3], label: compactLabel[2].trim() || null };
  }

  const spacedLabel = line.match(/^(.+?)\s*--\s+(.+?)\s+-->\s*(.+)$/);
  if (spacedLabel) {
    return { fromToken: spacedLabel[1], toToken: spacedLabel[3], label: spacedLabel[2].trim() || null };
  }

  const pipeBeforeArrow = line.match(/^(.+?)\s*--\s*\|(.+?)\|\s*--?>?\s*(.+)$/);
  if (pipeBeforeArrow) {
    return { fromToken: pipeBeforeArrow[1], toToken: pipeBeforeArrow[3], label: pipeBeforeArrow[2].trim() || null };
  }

  const unlabeled = line.match(/^(.+?)\s*(?:-->|---)\s*(.+)$/);
  if (unlabeled) {
    return { fromToken: unlabeled[1], toToken: unlabeled[2], label: null };
  }

  return null;
}

function parseMermaid(mermaid: string): { direction: MermaidDirection; nodes: ParsedMermaidNode[]; edges: ParsedMermaidEdge[] } {
  const nodes = new Map<string, ParsedMermaidNode>();
  const edges: ParsedMermaidEdge[] = [];
  const lines = mermaid
    .replace(/\r/g, "")
    .split(/[\n;]/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  const header = lines[0]?.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/i);
  const direction = (header?.[1]?.toUpperCase() as MermaidDirection | undefined) ?? "TD";

  for (const line of lines.slice(header ? 1 : 0)) {
    const edgeMatch = parseEdgeLine(line);
    if (edgeMatch) {
      const from = parseNodeToken(edgeMatch.fromToken, nodes.size + 1);
      const to = parseNodeToken(edgeMatch.toToken, nodes.size + 2);
      nodes.set(from.id, { ...from, ...(nodes.get(from.id) ?? {}) });
      nodes.set(to.id, { ...to, ...(nodes.get(to.id) ?? {}) });
      edges.push({
        id: `e${edges.length + 1}`,
        from: from.id,
        to: to.id,
        label: edgeMatch.label
      });
      continue;
    }

    const node = parseNodeToken(line, nodes.size + 1);
    nodes.set(node.id, node);
  }

  return { direction, nodes: Array.from(nodes.values()), edges };
}

function nodeStyle(shape: ParsedMermaidNode["shape"]): string {
  if (shape === "decision") return "rhombus;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#6b7280;fontColor=#111827;";
  const arcSize = shape === "terminator" ? 50 : 12;
  return `rounded=1;whiteSpace=wrap;html=1;arcSize=${arcSize};fillColor=#ffffff;strokeColor=#6b7280;fontColor=#111827;`;
}

function nodeSize(shape: ParsedMermaidNode["shape"]) {
  if (shape === "decision") return { width: 150, height: 110 };
  if (shape === "terminator") return { width: 170, height: 68 };
  return { width: 190, height: 72 };
}

function layoutMermaid(parsed: ReturnType<typeof parseMermaid>): {
  nodes: DrawioLayoutNode[];
  edges: DrawioLayoutEdge[];
  width: number;
  height: number;
} {
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  const rankdir = parsed.direction === "TD" ? "TB" : parsed.direction;
  graph.setGraph({
    rankdir,
    nodesep: 90,
    edgesep: 42,
    ranksep: 115,
    marginx: 70,
    marginy: 70,
    acyclicer: "greedy",
    ranker: "network-simplex"
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of parsed.nodes) {
    const size = nodeSize(node.shape);
    graph.setNode(node.id, size);
  }

  for (const edge of parsed.edges) {
    graph.setEdge(edge.from, edge.to, { id: edge.id }, edge.id);
  }

  dagre.layout(graph);

  const nodes = parsed.nodes.map((node) => {
    const size = nodeSize(node.shape);
    const positioned = graph.node(node.id) as { x?: number; y?: number } | undefined;
    const x = Math.round((positioned?.x ?? size.width / 2 + 70) - size.width / 2);
    const y = Math.round((positioned?.y ?? size.height / 2 + 70) - size.height / 2);
    return { ...node, ...size, x, y };
  });

  const edges = parsed.edges.map((edge) => {
    const positioned = graph.edge(edge.from, edge.to, edge.id) as { points?: Array<{ x: number; y: number }> } | undefined;
    return {
      ...edge,
      points: (positioned?.points ?? []).map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
    };
  });

  const nodeBounds = nodes.reduce(
    (bounds, node) => ({
      minX: Math.min(bounds.minX, node.x),
      minY: Math.min(bounds.minY, node.y),
      maxX: Math.max(bounds.maxX, node.x + node.width),
      maxY: Math.max(bounds.maxY, node.y + node.height)
    }),
    { minX: 0, minY: 0, maxX: 800, maxY: 500 }
  );

  return {
    nodes,
    edges,
    width: Math.ceil(Math.max(800, nodeBounds.maxX + 90)),
    height: Math.ceil(Math.max(500, nodeBounds.maxY + 90))
  };
}

function edgeGeometry(points: Array<{ x: number; y: number }>): string {
  const waypoints = points.slice(1, -1);
  if (!waypoints.length) return '<mxGeometry relative="1" as="geometry" />';
  return `<mxGeometry relative="1" as="geometry"><Array as="points">${waypoints
    .map((point) => `<mxPoint x="${point.x}" y="${point.y}" />`)
    .join("")}</Array></mxGeometry>`;
}

export function mermaidToDrawio(mermaid: string) {
  const parsed = parseMermaid(mermaid);
  if (!parsed.nodes.length) throw new Error("未解析到 Mermaid 节点。");

  const layout = layoutMermaid(parsed);
  const cells: string[] = ['<mxCell id="0" />', '<mxCell id="1" parent="0" />'];

  layout.nodes.forEach((node) => {
    cells.push(
      `<mxCell id="${escapeXml(node.id)}" value="${escapeXml(node.label)}" style="${nodeStyle(node.shape)}" vertex="1" parent="1"><mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry" /></mxCell>`
    );
  });

  layout.edges.forEach((edge) => {
    cells.push(
      `<mxCell id="${escapeXml(edge.id)}" value="${escapeXml(edge.label ?? "")}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;endArrow=block;strokeColor=#6b7280;fontColor=#374151;" edge="1" parent="1" source="${escapeXml(edge.from)}" target="${escapeXml(edge.to)}">${edgeGeometry(edge.points)}</mxCell>`
    );
  });

  const drawio = `<mxfile host="AutoDiagram" agent="auto-diagram" version="0.3.0">
  <diagram id="mermaid" name="Mermaid Import">
    <mxGraphModel dx="${layout.width}" dy="${layout.height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${layout.width}" pageHeight="${layout.height}" background="#ffffff" math="0" shadow="0">
      <root>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

  return {
    drawio,
    filename: `${safeFilename(parsed.nodes[0]?.label ?? "mermaid")}.drawio`,
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.edges.length,
    warnings: parsed.edges.length ? [] : ["未解析到连线，仅转换了节点。"]
  };
}

function decodeDataUrl(input: string): { mime: string; bytes: Buffer; text: string } | null {
  const match = input.match(/^data:([^;,]+)?(?:;[^,]*)?,([\s\S]+)$/i);
  if (!match) return null;
  const header = input.slice(0, input.indexOf(","));
  const mime = (match[1] || "").toLowerCase();
  const payload = match[2];
  const bytes = header.includes(";base64") ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { mime, bytes, text: bytes.toString("utf8") };
}

function decodePossibleDiagramPayload(value: string): string {
  const payload = decodeXmlEntities(value).trim();
  if (!payload) return "";
  if (payload.includes("<mxGraphModel") || payload.includes("<mxfile")) return payload;

  const candidates = [payload];
  try {
    candidates.push(decodeURIComponent(payload));
  } catch {
    // Keep the original payload if it is not URI encoded.
  }

  for (const candidate of candidates) {
    try {
      const inflated = inflateRawSync(Buffer.from(candidate, "base64")).toString("utf8");
      try {
        return decodeURIComponent(inflated);
      } catch {
        return inflated;
      }
    } catch {
      // Not a compressed diagrams.net payload.
    }
  }

  return payload;
}

function extractXmlFromText(input: string): string | null {
  const decoded = decodeXmlEntities(input);
  const mxfile = decoded.match(/<mxfile\b[\s\S]*?<\/mxfile>/i);
  if (mxfile) return mxfile[0];
  const graphModel = decoded.match(/<mxGraphModel\b[\s\S]*?<\/mxGraphModel>/i);
  if (graphModel) return graphModel[0];

  const contentAttr = input.match(/\bcontent="([^"]+)"/i);
  if (contentAttr) {
    const content = decodePossibleDiagramPayload(contentAttr[1]);
    if (content.includes("<mxfile") || content.includes("<mxGraphModel")) return content;
  }

  return null;
}

function extractPngTextChunks(bytes: Buffer): string[] {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 12 || !bytes.subarray(0, 8).equals(pngSignature)) return [];

  const chunks: string[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const separator = data.indexOf(0);
      const text = data.subarray(separator + 1).toString("utf8");
      chunks.push(text);
    }

    if (type === "zTXt") {
      const separator = data.indexOf(0);
      const compressed = data.subarray(separator + 2);
      try {
        chunks.push(inflateSync(compressed).toString("utf8"));
      } catch {
        // Ignore non-standard text chunks.
      }
    }

    if (type === "iTXt") {
      const keywordEnd = data.indexOf(0);
      const compressionFlag = data[keywordEnd + 1];
      const languageEnd = data.indexOf(0, keywordEnd + 3);
      const translatedEnd = data.indexOf(0, languageEnd + 1);
      const textBytes = data.subarray(translatedEnd + 1);
      try {
        chunks.push(compressionFlag === 1 ? inflateSync(textBytes).toString("utf8") : textBytes.toString("utf8"));
      } catch {
        // Ignore non-standard text chunks.
      }
    }

    offset = dataEnd + 4;
  }
  return chunks;
}

export function extractDrawioXmlFromImage(input: string): string {
  const dataUrl = decodeDataUrl(input);
  if (dataUrl?.mime.includes("png")) {
    for (const chunk of extractPngTextChunks(dataUrl.bytes)) {
      const decoded = decodePossibleDiagramPayload(chunk);
      const xml = extractXmlFromText(decoded);
      if (xml) return xml;
    }
    const rawText = dataUrl.bytes.toString("latin1");
    const xml = extractXmlFromText(rawText);
    if (xml) return xml;
  }

  const imageText = dataUrl ? dataUrl.text : input;
  const directXml = extractXmlFromText(imageText);
  if (directXml) return directXml;

  throw new Error("未在图片中找到 Draw.io 嵌入数据。请从 draw.io/diagrams.net 导出 PNG 或 SVG，并勾选包含图表副本。普通截图无法还原结构。");
}

function expandDrawioXml(drawio: string): string {
  const xmlParts = [drawio];
  const diagrams = drawio.match(/<diagram\b[\s\S]*?<\/diagram>/gi) ?? [];
  for (const diagram of diagrams) {
    const inner = diagram.replace(/^<diagram\b[^>]*>/i, "").replace(/<\/diagram>$/i, "").trim();
    if (inner.includes("<mxGraphModel")) continue;
    const decoded = decodePossibleDiagramPayload(inner);
    if (decoded.includes("<mxGraphModel")) xmlParts.push(decoded);
  }
  return xmlParts.join("\n");
}

function parseDrawioCells(drawio: string): { nodes: DrawioNode[]; edges: DrawioEdge[] } {
  const expandedDrawio = expandDrawioXml(drawio);
  const cells = expandedDrawio.match(/<mxCell\b[\s\S]*?(?:<\/mxCell>|\/>)/g) ?? [];
  const nodes: DrawioNode[] = [];
  const edges: DrawioEdge[] = [];

  for (const cell of cells) {
    const id = attr(cell, "id");
    const value = attr(cell, "value");
    const vertex = attr(cell, "vertex") === "1";
    const edge = attr(cell, "edge") === "1";
    if (vertex && id) nodes.push({ id, value: value || id });
    if (edge) {
      const source = attr(cell, "source");
      const target = attr(cell, "target");
      if (source && target) edges.push({ source, target, value });
    }
  }

  return { nodes, edges };
}

export function drawioToMermaid(drawio: string) {
  const parsed = parseDrawioCells(drawio);
  if (!parsed.nodes.length) throw new Error("未解析到 Draw.io 节点。请上传包含嵌入图表数据的 draw.io PNG/SVG。");

  const nodeIds = new Set(parsed.nodes.map((node) => node.id));
  const lines = ["flowchart TD"];
  for (const node of parsed.nodes) {
    lines.push(`  ${normalizeId(node.id, "node")}["${node.value.replace(/"/g, '\\"')}"]`);
  }
  for (const edge of parsed.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    const source = normalizeId(edge.source, "source");
    const target = normalizeId(edge.target, "target");
    lines.push(edge.value ? `  ${source} -->|${edge.value}| ${target}` : `  ${source} --> ${target}`);
  }

  return {
    mermaid: lines.join("\n"),
    filename: "drawio-flow.mmd",
    nodeCount: parsed.nodes.length,
    edgeCount: parsed.edges.length,
    warnings: parsed.edges.length ? [] : ["未解析到连线，仅转换了节点。"]
  };
}

export function drawioImageToMermaid(image: string) {
  return drawioToMermaid(extractDrawioXmlFromImage(image));
}
