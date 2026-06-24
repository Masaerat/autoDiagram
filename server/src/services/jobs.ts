import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FlowSpec, RendererMode, SceneIteration } from "../../../shared/flow.js";
import type { DiagramScene } from "../../../shared/scene.js";
import { flowToScene, sceneSummary } from "../../../shared/scenePipeline.js";
import { getStyleProfile, normalizeDiagramStyleId, type DiagramStyleId } from "../../../shared/styleProfile.js";
import { renderSceneDrawio } from "../render/drawio.js";
import { renderFireworksTemplateSvg } from "../render/fireworksTemplate.js";
import { renderSceneSvg } from "../render/svg.js";
import { safeFilename } from "../render/xml.js";

export type FlowJob = {
  jobId: string;
  rendererMode: RendererMode;
  styleId: DiagramStyleId;
  flow: FlowSpec;
  scene: DiagramScene;
  svg: string;
  iterations: SceneIteration[];
  warnings: string[];
};

function exportsRoot(): string {
  if (process.env.JOB_OUTPUT_DIR) return path.resolve(process.env.JOB_OUTPUT_DIR);
  return path.join(os.tmpdir(), "auto-diagram-exports");
}

export function jobDir(jobId: string): string {
  return path.join(exportsRoot(), jobId);
}

function jobPath(jobId: string): string {
  return path.join(jobDir(jobId), "job.json");
}

async function writeJob(job: FlowJob): Promise<void> {
  await mkdir(jobDir(job.jobId), { recursive: true });
  await writeFile(jobPath(job.jobId), JSON.stringify(job, null, 2), "utf8");
  await writeFile(path.join(jobDir(job.jobId), "scene.json"), JSON.stringify(job.scene, null, 2), "utf8");
}

export async function readJob(jobId: string): Promise<FlowJob | null> {
  const file = jobPath(jobId);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as FlowJob;
}

export function buildDownloads(job: FlowJob) {
  const base = safeFilename(job.flow.title);
  const svg = job.svg || renderSceneSvg(job.scene, job.styleId);
  const drawio = renderSceneDrawio(job.scene, job.flow.title, job.styleId);
  return {
    drawio: { filename: `${base}.drawio`, content: drawio },
    svg: { filename: `${base}.svg`, content: svg }
  };
}

export function jobResponse(job: FlowJob) {
  const style = getStyleProfile(job.styleId);
  const svg = job.svg || renderSceneSvg(job.scene, style.id);
  return {
    jobId: job.jobId,
    rendererMode: job.rendererMode,
    style: { id: style.id, name: style.name },
    flow: job.flow,
    scene: sceneSummary(job.scene),
    iterations: job.iterations,
    preview: { svg },
    downloads: buildDownloads(job),
    warnings: job.warnings
  };
}

export async function createFlowJob(flow: FlowSpec, warnings: string[], styleId?: unknown): Promise<FlowJob> {
  const normalizedStyleId = normalizeDiagramStyleId(styleId);
  const scene = flowToScene(flow, normalizedStyleId);
  const svg = (await renderFireworksTemplateSvg(flow, scene, normalizedStyleId)) ?? renderSceneSvg(scene, normalizedStyleId);
  const job: FlowJob = {
    jobId: randomUUID(),
    rendererMode: "svg_drawio",
    styleId: normalizedStyleId,
    flow,
    scene,
    svg,
    iterations: [],
    warnings
  };
  await writeJob(job);
  return job;
}
