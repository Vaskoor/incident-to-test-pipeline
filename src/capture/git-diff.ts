// src/capture/git-diff.ts — extract the code change that caused the incident
import type { GitDiffResult } from "../types.js";

const FUNCTION_RE = /^[+ ]\s*(?:export\s+)?(?:async\s+)?(?:function|def|class)\s+(\w+)/gm;
const METHOD_RE = /^[+ ]\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(/gm;

/** Parse a unified git diff into a structured result. */
export function parseGitDiff(diffText: string, commit: string, author: string): GitDiffResult {
  const files: GitDiffResult["changedFiles"] = [];
  const parts = diffText.split(/^diff --git /m).filter(Boolean);

  for (const part of parts) {
    const pathMatch = part.match(/^a\/(.+?)\s+b\//);
    const path = pathMatch ? pathMatch[1] : "unknown";
    const lines = part.split("\n");
    let additions = 0, deletions = 0;
    const changedFunctions = new Set<string>();

    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
        for (const m of line.matchAll(FUNCTION_RE)) changedFunctions.add(m[1]);
        for (const m of line.matchAll(METHOD_RE)) if (m[1] !== "if" && m[1] !== "for" && m[1] !== "while" && m[1] !== "switch") changedFunctions.add(m[1]);
      }
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    files.push({ path, additions, deletions, changedFunctions: [...changedFunctions] });
  }

  const summary = `${files.length} file(s) changed, ${files.reduce((s,f)=>s+f.additions,0)} insertion(s), ${files.reduce((s,f)=>s+f.deletions,0)} deletion(s)`;
  return { commit, author, changedFiles: files, summary };
}

/** Identify the most likely culprit file (most changed lines). */
export function findCulpritFile(result: GitDiffResult): GitDiffResult["changedFiles"][0] | null {
  if (result.changedFiles.length === 0) return null;
  return result.changedFiles.reduce((max, f) =>
    (f.additions + f.deletions) > (max.additions + max.deletions) ? f : max
  );
}
