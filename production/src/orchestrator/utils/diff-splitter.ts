import type { DiffChunk } from "../../shared/types.js";

const GENERATED_PATTERNS = [
  /\/dist\//, /\/build\//, /\/node_modules\//,
  /\.(min\.js|bundle\.js|generated\.ts)$/,
  /protobuf.*\.ts$/, /\.pb\.ts$/,
];

const DOC_PATTERNS = [
  /\.md$/, /\.mdx$/, /\.txt$/,
  /\/docs\//, /\/CHANGELOG/i, /\/README/i,
];

const LOCKFILE_PATTERNS = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/,
];

function classifyFile(file: string, generatedFiles?: string[]): { isGenerated: boolean; isDoc: boolean; isLockfile: boolean } {
  return {
    isGenerated: GENERATED_PATTERNS.some(p => p.test(file)) || (generatedFiles?.includes(file) ?? false),
    isDoc: DOC_PATTERNS.some(p => p.test(file)),
    isLockfile: LOCKFILE_PATTERNS.some(p => p.test(file)),
  };
}

function countAddedLines(content: string): number {
  let count = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) count++;
  }
  return count;
}

function countDeletedLines(content: string): number {
  let count = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("-") && !line.startsWith("---")) count++;
  }
  return count;
}

/**
 * Split full diff text into per-file chunks.
 */
export function splitDiff(diffText: string, generatedFiles?: string[]): DiffChunk[] {
  const files = diffText.split(/^(?=diff --git )/m).filter(Boolean);
  const chunks: DiffChunk[] = [];

  for (const fileBlock of files) {
    const fileMatch = fileBlock.match(/diff --git a\/(\S+) b\/(\S+)/);
    if (!fileMatch) continue;
    const file = fileMatch[2];
    const { isGenerated, isDoc, isLockfile } = classifyFile(file, generatedFiles);
    const addedLines = countAddedLines(fileBlock);
    const deletedLines = countDeletedLines(fileBlock);

    chunks.push({ file, content: fileBlock.trim(), addedLines, deletedLines, isGenerated, isDoc, isLockfile });
  }

  return chunks;
}

/**
 * Split large chunks: files >300 effective added lines get split further.
 * Returns the original list if no chunk exceeds the threshold.
 */
export function splitLargeChunks(chunks: DiffChunk[], threshold = 300): DiffChunk[] {
  const result: DiffChunk[] = [];

  for (const chunk of chunks) {
    if (chunk.isGenerated || chunk.isDoc || chunk.isLockfile || chunk.addedLines <= threshold) {
      result.push(chunk);
      continue;
    }

    // Split by hunk boundaries (diff @@ hunk headers)
    const hunks = chunk.content.split(/(?=^@@ )/m).filter(Boolean);
    for (let i = 0; i < hunks.length; i++) {
      const hunkAdded = countAddedLines(hunks[i]);
      const hunkDeleted = countDeletedLines(hunks[i]);
      result.push({
        file: chunk.file,
        content: hunks[i].trim(),
        addedLines: hunkAdded,
        deletedLines: hunkDeleted,
        isGenerated: chunk.isGenerated,
        isDoc: chunk.isDoc,
        isLockfile: chunk.isLockfile,
      });
    }
  }

  return result;
}

/**
 * Calculate effective added lines (exclude generated/doc/lockfile).
 */
export function effectiveAddedLines(chunks: DiffChunk[]): number {
  return chunks
    .filter(c => !c.isGenerated && !c.isDoc && !c.isLockfile)
    .reduce((sum, c) => sum + c.addedLines, 0);
}
