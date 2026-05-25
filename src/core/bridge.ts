// Inter-session bridge — spawns backend -p to generate handoff for next task

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import type { TailrecConfig } from "../config/index.js";

const BRIDGE_SYSTEM_PROMPT = `You are a session handoff summarizer. Given a completed task and its session context, extract:
1. Key decisions made during this task
2. Tips/gotchas for the person working on the next task
3. Relevant state changes (files created, APIs defined, schemas modified)

Be concise — this will be injected as context for the next task. Focus on actionable information.
Output as markdown with sections: ## Decisions, ## Tips, ## State Changes`;

export interface BridgeInput {
  completedTask: string;
  nextTaskSlug: string;  // actual slug of the next task directory
  sessionSummary: string;
  planSlug: string;
}

export const runBridge = async (
  input: BridgeInput,
  config: TailrecConfig,
  backend: string,
): Promise<{ inputMdPath: string }> => {
  const userPrompt = `## Completed Task\n${input.completedTask}\n\n## Session Context\n${input.sessionSummary}\n\n## Next Task\n${input.nextTaskSlug}\n\nGenerate a handoff summary for the next task.`;
  const prompt = `${BRIDGE_SYSTEM_PROMPT}\n\n${userPrompt}`;

  const text = await runBackendPrint(backend, config.bridge_model, prompt);

  // Write to next task's input.md using the explicit slug (not derived from content)
  const inputMdPath = join(config.cards_dir, "plans", input.planSlug, "tasks", input.nextTaskSlug, "input.md");
  const dir = dirname(inputMdPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const frontmatter = `---
type: task
title: "Handoff → ${input.nextTaskSlug}"
shared: false
description: "Context handoff from '${input.completedTask}' to '${input.nextTaskSlug}'"
---

`;
  writeFileSync(inputMdPath, frontmatter + text);

  return { inputMdPath };
};

const runBackendPrint = (backend: string, model: string, prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const isMac = process.platform === "darwin";
    const args = ["-p", prompt, "--model", model];

    const scriptArgs = isMac
      ? ["-q", "/dev/null", backend, ...args]
      : ["-qc", [backend, ...args].map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" "), "/dev/null"];

    const proc = spawn("script", scriptArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    let settled = false;
    proc.stdout!.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr!.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      if (!settled) { settled = true; reject(new Error(`bridge timed out after 60s\nstdout: ${stdout}\nstderr: ${stderr}`)); }
    }, 60_000);

    proc.on("error", (e) => { clearTimeout(timer); if (!settled) { settled = true; reject(e); } });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error(`${backend} -p exited ${code}: ${stderr}`));
      else resolve(stdout.trim());
    });
  });
