import type { FlowNodeType } from "./flow.js";

export const diagramStyleIds = ["origin", 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type DiagramStyleId = (typeof diagramStyleIds)[number];
export type FireworksStyleId = Exclude<DiagramStyleId, "origin">;

export type NodeVisualStyle = {
  fill: string;
  stroke: string;
  text: string;
  width: number;
  height: number;
  radius: number;
  strokeWidth: number;
};

export type StyleProfile = {
  id: DiagramStyleId;
  name: string;
  description: string;
  dark: boolean;
  canvas: {
    background: string;
    grid: string;
    accent?: string;
  };
  typography: {
    fontFamily: string;
    titleFamily: string;
    fontSize: number;
    labelSize: number;
    titleSize: number;
    textColor: string;
    secondaryText: string;
  };
  nodes: Record<FlowNodeType, NodeVisualStyle>;
  edges: {
    stroke: string;
    label: string;
    labelBackground: string;
    labelBackgroundOpacity: number;
    width: number;
    arrowSize: "small" | "medium";
    dash?: string;
  };
  effects: {
    shadow: boolean;
    glow: boolean;
    glass: boolean;
    blueprintGrid: boolean;
    titleDivider: boolean;
  };
  spacing: {
    rankSep: number;
    nodeSep: number;
    marginX: number;
    marginY: number;
  };
};

const sans =
  '"Helvetica Neue", Helvetica, Arial, "PingFang SC", "Microsoft YaHei", "Microsoft JhengHei", "SimHei", sans-serif';
const systemSans =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Microsoft JhengHei", "SimHei", sans-serif';
const mono = '"SF Mono", "Fira Code", Menlo, "Cascadia Code", "Microsoft YaHei", "SimHei", monospace';
const serif = 'Georgia, "Times New Roman", "PingFang SC", "Microsoft YaHei", serif';

function nodes(base: {
  processFill: string;
  processStroke: string;
  processText: string;
  decisionFill: string;
  decisionStroke: string;
  decisionText: string;
  startFill: string;
  startStroke: string;
  startText: string;
  endFill: string;
  endStroke: string;
  endText: string;
  radius: number;
  strokeWidth?: number;
}): Record<FlowNodeType, NodeVisualStyle> {
  const strokeWidth = base.strokeWidth ?? 1.8;
  return {
    start: {
      fill: base.startFill,
      stroke: base.startStroke,
      text: base.startText,
      width: 168,
      height: 58,
      radius: 29,
      strokeWidth
    },
    end: {
      fill: base.endFill,
      stroke: base.endStroke,
      text: base.endText,
      width: 168,
      height: 58,
      radius: 29,
      strokeWidth
    },
    process: {
      fill: base.processFill,
      stroke: base.processStroke,
      text: base.processText,
      width: 228,
      height: 78,
      radius: base.radius,
      strokeWidth
    },
    decision: {
      fill: base.decisionFill,
      stroke: base.decisionStroke,
      text: base.decisionText,
      width: 158,
      height: 118,
      radius: 0,
      strokeWidth
    }
  };
}

export const diagramStyles: Record<DiagramStyleId, StyleProfile> = {
  origin: {
    id: "origin",
    name: "Origin",
    description: "Simple draw.io-like prototype style.",
    dark: false,
    canvas: { background: "#ffffff", grid: "#ffffff", accent: "#6b7280" },
    typography: {
      fontFamily: systemSans,
      titleFamily: systemSans,
      fontSize: 14,
      labelSize: 12,
      titleSize: 20,
      textColor: "#111827",
      secondaryText: "#6b7280"
    },
    nodes: nodes({
      processFill: "#ffffff",
      processStroke: "#6b7280",
      processText: "#111827",
      decisionFill: "#ffffff",
      decisionStroke: "#6b7280",
      decisionText: "#111827",
      startFill: "#ffffff",
      startStroke: "#6b7280",
      startText: "#111827",
      endFill: "#ffffff",
      endStroke: "#6b7280",
      endText: "#111827",
      radius: 8,
      strokeWidth: 1.4
    }),
    edges: {
      stroke: "#6b7280",
      label: "#374151",
      labelBackground: "#ffffff",
      labelBackgroundOpacity: 1,
      width: 1.5,
      arrowSize: "small"
    },
    effects: { shadow: false, glow: false, glass: false, blueprintGrid: false, titleDivider: false },
    spacing: { rankSep: 96, nodeSep: 96, marginX: 56, marginY: 64 }
  },
  1: {
    id: 1,
    name: "Flat Icon",
    description: "Clean white docs style with colorful semantic nodes.",
    dark: false,
    canvas: { background: "#ffffff", grid: "#eef2f7", accent: "#2563eb" },
    typography: {
      fontFamily: sans,
      titleFamily: sans,
      fontSize: 14,
      labelSize: 12,
      titleSize: 26,
      textColor: "#111827",
      secondaryText: "#6b7280"
    },
    nodes: nodes({
      processFill: "#ffffff",
      processStroke: "#d1d5db",
      processText: "#111827",
      decisionFill: "#fff7ed",
      decisionStroke: "#f97316",
      decisionText: "#7c2d12",
      startFill: "#eff6ff",
      startStroke: "#2563eb",
      startText: "#1e3a8a",
      endFill: "#fef2f2",
      endStroke: "#dc2626",
      endText: "#7f1d1d",
      radius: 10
    }),
    edges: {
      stroke: "#2563eb",
      label: "#6b7280",
      labelBackground: "#ffffff",
      labelBackgroundOpacity: 0.94,
      width: 2.1,
      arrowSize: "medium"
    },
    effects: { shadow: true, glow: false, glass: false, blueprintGrid: false, titleDivider: false },
    spacing: { rankSep: 116, nodeSep: 112, marginX: 64, marginY: 74 }
  },
  2: {
    id: 2,
    name: "Dark Terminal",
    description: "Developer-friendly dark terminal palette.",
    dark: true,
    canvas: { background: "#0f172a", grid: "#1e293b", accent: "#38bdf8" },
    typography: {
      fontFamily: mono,
      titleFamily: mono,
      fontSize: 14,
      labelSize: 12,
      titleSize: 26,
      textColor: "#e2e8f0",
      secondaryText: "#94a3b8"
    },
    nodes: nodes({
      processFill: "#111827",
      processStroke: "#334155",
      processText: "#e2e8f0",
      decisionFill: "#1e1b4b",
      decisionStroke: "#a855f7",
      decisionText: "#ede9fe",
      startFill: "#082f49",
      startStroke: "#38bdf8",
      startText: "#e0f2fe",
      endFill: "#451a03",
      endStroke: "#f97316",
      endText: "#ffedd5",
      radius: 10,
      strokeWidth: 1.7
    }),
    edges: {
      stroke: "#a855f7",
      label: "#cbd5e1",
      labelBackground: "#0f172a",
      labelBackgroundOpacity: 0.92,
      width: 2.2,
      arrowSize: "medium"
    },
    effects: { shadow: false, glow: true, glass: false, blueprintGrid: false, titleDivider: false },
    spacing: { rankSep: 116, nodeSep: 112, marginX: 64, marginY: 74 }
  },
  3: {
    id: 3,
    name: "Blueprint",
    description: "Blueprint grid for formal technical documents.",
    dark: true,
    canvas: { background: "#082f49", grid: "#0ea5e9", accent: "#67e8f9" },
    typography: {
      fontFamily: mono,
      titleFamily: mono,
      fontSize: 13,
      labelSize: 11,
      titleSize: 25,
      textColor: "#e0f2fe",
      secondaryText: "#bae6fd"
    },
    nodes: nodes({
      processFill: "#0b3b5e",
      processStroke: "#67e8f9",
      processText: "#e0f2fe",
      decisionFill: "#123a56",
      decisionStroke: "#fde047",
      decisionText: "#fef9c3",
      startFill: "#06354f",
      startStroke: "#38bdf8",
      startText: "#e0f2fe",
      endFill: "#3b1d37",
      endStroke: "#fb7185",
      endText: "#ffe4e6",
      radius: 8,
      strokeWidth: 1.6
    }),
    edges: {
      stroke: "#67e8f9",
      label: "#e0f2fe",
      labelBackground: "#082f49",
      labelBackgroundOpacity: 0.9,
      width: 2,
      arrowSize: "medium"
    },
    effects: { shadow: false, glow: false, glass: false, blueprintGrid: true, titleDivider: false },
    spacing: { rankSep: 120, nodeSep: 116, marginX: 64, marginY: 78 }
  },
  4: {
    id: 4,
    name: "Notion Clean",
    description: "Quiet minimal style for notes and SOPs.",
    dark: false,
    canvas: { background: "#ffffff", grid: "#f3f4f6", accent: "#3b82f6" },
    typography: {
      fontFamily: systemSans,
      titleFamily: systemSans,
      fontSize: 14,
      labelSize: 11,
      titleSize: 20,
      textColor: "#111827",
      secondaryText: "#6b7280"
    },
    nodes: nodes({
      processFill: "#f9fafb",
      processStroke: "#e5e7eb",
      processText: "#111827",
      decisionFill: "#ffffff",
      decisionStroke: "#d1d5db",
      decisionText: "#111827",
      startFill: "#f9fafb",
      startStroke: "#d1d5db",
      startText: "#111827",
      endFill: "#f9fafb",
      endStroke: "#d1d5db",
      endText: "#111827",
      radius: 5,
      strokeWidth: 1.4
    }),
    edges: {
      stroke: "#3b82f6",
      label: "#6b7280",
      labelBackground: "#ffffff",
      labelBackgroundOpacity: 0.96,
      width: 1.8,
      arrowSize: "small"
    },
    effects: { shadow: false, glow: false, glass: false, blueprintGrid: false, titleDivider: true },
    spacing: { rankSep: 112, nodeSep: 104, marginX: 60, marginY: 70 }
  },
  5: {
    id: 5,
    name: "Glassmorphism",
    description: "Dark presentation style with translucent panels.",
    dark: true,
    canvas: { background: "#0f172a", grid: "#334155", accent: "#c084fc" },
    typography: {
      fontFamily: sans,
      titleFamily: sans,
      fontSize: 14,
      labelSize: 12,
      titleSize: 27,
      textColor: "#f8fafc",
      secondaryText: "#cbd5e1"
    },
    nodes: nodes({
      processFill: "rgba(255,255,255,0.12)",
      processStroke: "rgba(255,255,255,0.28)",
      processText: "#f8fafc",
      decisionFill: "rgba(192,132,252,0.16)",
      decisionStroke: "#c084fc",
      decisionText: "#f5f3ff",
      startFill: "rgba(96,165,250,0.18)",
      startStroke: "#60a5fa",
      startText: "#eff6ff",
      endFill: "rgba(251,146,60,0.16)",
      endStroke: "#fb923c",
      endText: "#fff7ed",
      radius: 18,
      strokeWidth: 1.5
    }),
    edges: {
      stroke: "#c084fc",
      label: "#e2e8f0",
      labelBackground: "rgba(15,23,42,0.76)",
      labelBackgroundOpacity: 1,
      width: 2.1,
      arrowSize: "medium"
    },
    effects: { shadow: true, glow: true, glass: true, blueprintGrid: false, titleDivider: false },
    spacing: { rankSep: 120, nodeSep: 116, marginX: 68, marginY: 78 }
  },
  6: {
    id: 6,
    name: "Claude Official",
    description: "Warm cream palette for polished docs.",
    dark: false,
    canvas: { background: "#f8f6f3", grid: "#ebe5dd", accent: "#d97757" },
    typography: {
      fontFamily: sans,
      titleFamily: sans,
      fontSize: 14,
      labelSize: 11,
      titleSize: 24,
      textColor: "#141413",
      secondaryText: "#6b6257"
    },
    nodes: nodes({
      processFill: "#fffcf7",
      processStroke: "#d9d0c3",
      processText: "#141413",
      decisionFill: "#fff7ed",
      decisionStroke: "#d97757",
      decisionText: "#633621",
      startFill: "#f4efe7",
      startStroke: "#8c6f5a",
      startText: "#3f352c",
      endFill: "#f9eee8",
      endStroke: "#d97757",
      endText: "#633621",
      radius: 11,
      strokeWidth: 1.6
    }),
    edges: {
      stroke: "#d97757",
      label: "#6b6257",
      labelBackground: "#f8f6f3",
      labelBackgroundOpacity: 0.96,
      width: 2,
      arrowSize: "medium"
    },
    effects: { shadow: false, glow: false, glass: false, blueprintGrid: false, titleDivider: true },
    spacing: { rankSep: 116, nodeSep: 110, marginX: 64, marginY: 74 }
  },
  7: {
    id: 7,
    name: "OpenAI Official",
    description: "Minimal white style with green accents.",
    dark: false,
    canvas: { background: "#ffffff", grid: "#f1f5f9", accent: "#10a37f" },
    typography: {
      fontFamily: systemSans,
      titleFamily: systemSans,
      fontSize: 14,
      labelSize: 12,
      titleSize: 24,
      textColor: "#0d0d0d",
      secondaryText: "#6e6e80"
    },
    nodes: nodes({
      processFill: "#ffffff",
      processStroke: "#e5e5e5",
      processText: "#0d0d0d",
      decisionFill: "#ffffff",
      decisionStroke: "#10a37f",
      decisionText: "#0d0d0d",
      startFill: "#ffffff",
      startStroke: "#10a37f",
      startText: "#0d0d0d",
      endFill: "#ffffff",
      endStroke: "#71717a",
      endText: "#0d0d0d",
      radius: 8,
      strokeWidth: 1.5
    }),
    edges: {
      stroke: "#10a37f",
      label: "#6e6e80",
      labelBackground: "#ffffff",
      labelBackgroundOpacity: 0.96,
      width: 1.8,
      arrowSize: "medium"
    },
    effects: { shadow: false, glow: false, glass: false, blueprintGrid: false, titleDivider: true },
    spacing: { rankSep: 116, nodeSep: 108, marginX: 64, marginY: 72 }
  },
  8: {
    id: 8,
    name: "Dark Luxury",
    description: "Deep black canvas with champagne-gold accents.",
    dark: true,
    canvas: { background: "#0a0a0a", grid: "#1a1a1a", accent: "#d4a574" },
    typography: {
      fontFamily: systemSans,
      titleFamily: serif,
      fontSize: 13,
      labelSize: 10,
      titleSize: 23,
      textColor: "#f5f0eb",
      secondaryText: "#a39787"
    },
    nodes: nodes({
      processFill: "#111111",
      processStroke: "#a78bfa",
      processText: "#f5f0eb",
      decisionFill: "#111111",
      decisionStroke: "#d4a574",
      decisionText: "#e8c49a",
      startFill: "#111111",
      startStroke: "#5a9e6f",
      startText: "#f5f0eb",
      endFill: "#111111",
      endStroke: "#f87171",
      endText: "#f5f0eb",
      radius: 6,
      strokeWidth: 1.5
    }),
    edges: {
      stroke: "#d4a574",
      label: "#a39787",
      labelBackground: "#0a0a0a",
      labelBackgroundOpacity: 0.9,
      width: 2,
      arrowSize: "medium"
    },
    effects: { shadow: false, glow: true, glass: false, blueprintGrid: false, titleDivider: false },
    spacing: { rankSep: 120, nodeSep: 116, marginX: 68, marginY: 78 }
  }
};

export const defaultDiagramStyleId: DiagramStyleId = "origin";
export const defaultStyleProfile = diagramStyles[defaultDiagramStyleId];

export const styleOptions = diagramStyleIds
  .filter((id) => id !== 8)
  .map((id) => ({
    id,
    name: diagramStyles[id].name,
    description: diagramStyles[id].description,
    dark: diagramStyles[id].dark,
    accent: diagramStyles[id].canvas.accent ?? diagramStyles[id].edges.stroke,
    background: diagramStyles[id].canvas.background
  }));

export function isDiagramStyleId(value: unknown): value is DiagramStyleId {
  return (typeof value === "number" || value === "origin") && diagramStyleIds.includes(value as DiagramStyleId);
}

export function normalizeDiagramStyleId(value: unknown): DiagramStyleId {
  if (value === "origin") return "origin";
  const numeric = typeof value === "string" ? Number(value) : value;
  return isDiagramStyleId(numeric) ? numeric : defaultDiagramStyleId;
}

export function getStyleProfile(styleId: unknown = defaultDiagramStyleId): StyleProfile {
  return diagramStyles[normalizeDiagramStyleId(styleId)];
}

export function styleForNodeType(type: FlowNodeType, profile = defaultStyleProfile) {
  return profile.nodes[type];
}
