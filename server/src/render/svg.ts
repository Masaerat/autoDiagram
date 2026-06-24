import type { LayoutResult } from "../../../shared/flow.js";
import type { DiagramScene, DiagramSceneNode, ScenePoint } from "../../../shared/scene.js";
import { flowToScene } from "../../../shared/scenePipeline.js";
import { defaultDiagramStyleId, getStyleProfile, type DiagramStyleId, type StyleProfile } from "../../../shared/styleProfile.js";
import { escapeXml } from "./xml.js";

type TextLine = { text: string; y: number };

function pathFromPoints(points: ScenePoint[]): string {
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function isCssColor(value: string): boolean {
  return value.startsWith("#");
}

function markerId(styleId: DiagramStyleId): string {
  return `arrow-${styleId}`;
}

function textLines(text: string, maxChars: number): TextLine[] {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return [{ text: normalized, y: 0 }];

  const lines: string[] = [];
  let cursor = normalized;
  while (cursor.length > maxChars && lines.length < 2) {
    let splitAt = cursor.lastIndexOf(" ", maxChars);
    if (splitAt < Math.floor(maxChars * 0.55)) splitAt = maxChars;
    lines.push(cursor.slice(0, splitAt).trim());
    cursor = cursor.slice(splitAt).trim();
  }
  if (cursor) lines.push(cursor.length > maxChars ? `${cursor.slice(0, maxChars - 1)}...` : cursor);

  const startY = -((lines.length - 1) * 8);
  return lines.map((line, index) => ({ text: line, y: startY + index * 18 }));
}

function renderTextBlock(node: DiagramSceneNode, profile: StyleProfile): string {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2 + 5;
  const maxChars = Math.max(6, Math.floor((node.w - 30) / 13));
  const lines = textLines(node.text, maxChars);
  return lines
    .map(
      (line) =>
        `<text x="${cx}" y="${cy + line.y}" text-anchor="middle" class="node-label" fill="${node.style.text_color}">${escapeXml(line.text)}</text>`
    )
    .join("\n  ");
}

function renderNode(node: DiagramSceneNode, profile: StyleProfile): string {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const strokeWidth = node.style.line_weight_pt;
  const filter =
    profile.id === "origin" ? "" : profile.effects.shadow ? ' filter="url(#shadowSoft)"' : profile.effects.glow ? ' filter="url(#nodeGlow)"' : "";
  const stroke = node.style.line;
  const fill = node.style.fill;
  const shapeClass = node.flowType === "decision" ? "node node-decision" : "node";
  const commonText = renderTextBlock(node, profile);

  if (node.type === "decision_diamond") {
    const points = [`${cx},${node.y}`, `${node.x + node.w},${cy}`, `${cx},${node.y + node.h}`, `${node.x},${cy}`].join(" ");
    return `<polygon points="${points}" class="${shapeClass}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filter} />\n  ${commonText}`;
  }

  const accent =
    profile.id === 7 && node.flowType !== "end"
      ? `\n  <rect x="${node.x}" y="${node.y}" width="4" height="${node.h}" rx="2" fill="${profile.canvas.accent}" />`
      : "";

  return `<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${node.style.rounding_px}" class="${shapeClass}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"${filter} />${accent}\n  ${commonText}`;
}

function labelPosition(points: ScenePoint[]) {
  const middleIndex = Math.max(0, Math.floor((points.length - 1) / 2));
  const a = points[middleIndex];
  const b = points[middleIndex + 1] ?? points[middleIndex];
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  const horizontal = Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
  return {
    x,
    y,
    dx: horizontal ? 0 : 10,
    dy: horizontal ? -9 : 0,
    anchor: horizontal ? "middle" : "start"
  };
}

function renderEdgeLabels(scene: DiagramScene, profile: StyleProfile): string {
  return scene.edges
    .filter((edge) => edge.text)
    .map((edge) => {
      const label = edge.text ?? "";
      const pos = labelPosition(edge.points);
      const width = Math.max(34, label.length * 13 + 12);
      const x = pos.anchor === "middle" ? pos.x + pos.dx - width / 2 : pos.x + pos.dx - 6;
      const y = pos.y + pos.dy - 16;
      const bg =
        profile.id === "origin"
          ? ""
          : `<rect x="${x}" y="${y}" width="${width}" height="20" rx="5" fill="${profile.edges.labelBackground}" opacity="${profile.edges.labelBackgroundOpacity}" />\n  `;
      return `${bg}<text x="${pos.x + pos.dx}" y="${pos.y + pos.dy - 2}" text-anchor="${pos.anchor}" class="edge-label">${escapeXml(label)}</text>`;
    })
    .join("\n  ");
}

function renderDefs(profile: StyleProfile): string {
  const markerSize = profile.edges.arrowSize === "small" ? { width: 8, height: 6, refX: 7, refY: 3, points: "0 0, 8 3, 0 6" } : { width: 10, height: 7, refX: 9, refY: 3.5, points: "0 0, 10 3.5, 0 7" };
  const defs = [
    "  <defs>",
    `    <marker id="${markerId(profile.id)}" markerWidth="${markerSize.width}" markerHeight="${markerSize.height}" refX="${markerSize.refX}" refY="${markerSize.refY}" orient="auto">`,
    `      <polygon points="${markerSize.points}" fill="${profile.edges.stroke}" />`,
    "    </marker>"
  ];

  if (profile.effects.shadow) {
    defs.push(
      '    <filter id="shadowSoft" x="-20%" y="-20%" width="140%" height="160%">',
      '      <feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#0f172a" flood-opacity="0.14" />',
      "    </filter>"
    );
  }

  if (profile.effects.glow) {
    defs.push(
      '    <filter id="nodeGlow" x="-25%" y="-25%" width="150%" height="150%">',
      `      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="${profile.canvas.accent ?? profile.edges.stroke}" flood-opacity="0.26" />`,
      "    </filter>"
    );
  }

  if (profile.id === 5) {
    defs.push(
      '    <radialGradient id="glassGlow" cx="28%" cy="10%" r="85%">',
      '      <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.38" />',
      '      <stop offset="48%" stop-color="#1d4ed8" stop-opacity="0.12" />',
      '      <stop offset="100%" stop-color="#0f172a" stop-opacity="0" />',
      "    </radialGradient>"
    );
  }

  if (profile.id === 8) {
    defs.push(
      '    <radialGradient id="luxGlow" cx="50%" cy="42%" r="40%">',
      '      <stop offset="0%" stop-color="#d4a574" stop-opacity="0.06" />',
      '      <stop offset="100%" stop-color="#d4a574" stop-opacity="0" />',
      "    </radialGradient>"
    );
  }

  defs.push("  </defs>");
  return defs.join("\n");
}

function renderCanvas(profile: StyleProfile, width: number, height: number): string {
  const base = [`  <rect class="canvas" x="0" y="0" width="${width}" height="${height}" fill="${profile.canvas.background}" />`];
  if (profile.effects.blueprintGrid) {
    base.push(
      `  <path d="M 0 0 H ${width} M 0 0 V ${height}" stroke="none" />`,
      `  <g opacity="0.16">`,
      ...Array.from({ length: Math.ceil(width / 32) + 1 }, (_, index) => `    <line x1="${index * 32}" y1="0" x2="${index * 32}" y2="${height}" stroke="${profile.canvas.grid}" stroke-width="1" />`),
      ...Array.from({ length: Math.ceil(height / 32) + 1 }, (_, index) => `    <line x1="0" y1="${index * 32}" x2="${width}" y2="${index * 32}" stroke="${profile.canvas.grid}" stroke-width="1" />`),
      "  </g>"
    );
  }
  if (profile.id === 5) base.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#glassGlow)" />`);
  if (profile.id === 8) base.push(`  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#luxGlow)" />`);
  return base.join("\n");
}

function renderTitle(scene: DiagramScene, profile: StyleProfile): string {
  if (profile.id === "origin") return "";
  const leftAligned = profile.effects.titleDivider || profile.id === 8;
  const x = leftAligned ? 48 : scene.page.width / 2;
  const anchor = leftAligned ? "start" : "middle";
  const y = profile.id === 4 ? 42 : 52;
  const divider = profile.effects.titleDivider
    ? `\n  <line x1="48" y1="${y + 20}" x2="${scene.page.width - 48}" y2="${y + 20}" stroke="${profile.nodes.process.stroke}" stroke-width="1" opacity="0.72" />`
    : "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="title">${escapeXml(scene.metadata.title)}</text>${divider}`;
}

function renderStyles(profile: StyleProfile): string {
  const glassNode = profile.effects.glass ? " backdrop-filter: blur(12px);" : "";
  return `  <style>
    text { font-family: ${profile.typography.fontFamily}; }
    .title { font-family: ${profile.typography.titleFamily}; font-size: ${profile.typography.titleSize}px; font-weight: 700; fill: ${profile.typography.textColor}; }
    .node {${glassNode} }
    .node-decision { stroke-linejoin: round; }
    .node-label { font-size: ${profile.typography.fontSize}px; font-weight: 700; dominant-baseline: middle; }
    .edge { fill: none; stroke: ${profile.edges.stroke}; stroke-width: ${profile.edges.width}; marker-end: url(#${markerId(profile.id)}); stroke-linecap: round; stroke-linejoin: round; }
    .edge-label { fill: ${profile.edges.label}; font-size: ${profile.typography.labelSize}px; font-weight: 700; dominant-baseline: middle; }
  </style>`;
}

export function renderSceneSvg(scene: DiagramScene, styleId?: DiagramStyleId): string {
  const profile = getStyleProfile(styleId ?? scene.metadata.style_profile);
  const width = Math.ceil(scene.page.width);
  const height = Math.ceil(scene.page.height);
  const edgeLabels = renderEdgeLabels(scene, profile);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(scene.metadata.title)}">
${renderDefs(profile)}
${renderStyles(profile)}
${renderCanvas(profile, width, height)}
  ${renderTitle(scene, profile)}
  ${scene.edges.map((edge) => `<path d="${pathFromPoints(edge.points)}" class="edge"${profile.edges.dash ? ` stroke-dasharray="${profile.edges.dash}"` : ""} />`).join("\n  ")}
  ${scene.nodes.map((node) => renderNode(node, profile)).join("\n  ")}
  ${edgeLabels}
</svg>`;
}

export function renderSvg(layout: LayoutResult): string {
  return renderSceneSvg(
    flowToScene(
      {
        title: "流程图",
        nodes: layout.nodes.map((node) => ({ id: node.id, type: node.type, label: node.label })),
        edges: layout.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label })),
        warnings: []
      },
      defaultDiagramStyleId
    )
  );
}
