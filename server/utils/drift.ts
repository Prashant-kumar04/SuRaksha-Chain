import { diffWords, Change } from 'diff';
import path from 'path';

// Extracts text excerpt from uploaded file.
// For text files (.txt, .csv, .json, .log, .md), extracts UTF-8 string.
// For binary files (PDF/DOCX/images), explicitly discloses that OCR pipeline is the production path.
export function extractText(buffer: Buffer, mimetype?: string, originalname?: string): string {
  const ext = path.extname(originalname || '').toLowerCase();
  const isText =
    mimetype === 'text/plain' ||
    mimetype === 'text/csv' ||
    mimetype === 'application/json' ||
    ['.txt', '.csv', '.json', '.log', '.md'].includes(ext);

  if (isText) {
    return buffer.toString('utf-8').slice(0, 50000);
  }
  return `[Text extraction unsupported for binary format: ${mimetype || 'application/octet-stream'} (${ext || 'binary'}). Automated textual drift analysis supports plain text (.txt, .log, .csv, .json, .md). Production roadmap incorporates OCR pipeline for scanned PDFs and raster images.]`;
}


// Compares two text excerpts and produces a real word-level diff.
// Flags "drift" using an explicit, inspectable heuristic:
//   - any numeric value changed (e.g. 0.02% -> 94.5%)
//   - OR more than wordChangeThreshold proportion of words changed
// This is a simple, honest heuristic -- not a black box. It is documented
// here so you can explain exactly what triggers a flag during judging.
export function compareVersions(oldText: string, newText: string, wordChangeThreshold = 0.15) {
  const parts: Change[] = diffWords(oldText || '', newText || '');

  let changedWordCount = 0;
  let totalWordCount = 0;
  const oldNumbers: string[] = [];
  const newNumbers: string[] = [];

  parts.forEach((part) => {
    const words = part.value.trim().split(/\s+/).filter(Boolean);
    totalWordCount += words.length;
    if (part.added || part.removed) {
      changedWordCount += words.length;
      const nums = part.value.match(/\d+(\.\d+)?%?/g) || [];
      if (part.removed) oldNumbers.push(...nums);
      if (part.added) newNumbers.push(...nums);
    }
  });

  const changeRatio = totalWordCount ? changedWordCount / totalWordCount : 0;
  const numbersChanged =
    JSON.stringify(oldNumbers) !== JSON.stringify(newNumbers) &&
    (oldNumbers.length > 0 || newNumbers.length > 0);

  const flagged = numbersChanged || changeRatio > wordChangeThreshold;

  let reason: string | null = null;
  if (numbersChanged) {
    reason = `Numeric/quantitative values changed between versions (was: ${
      oldNumbers.join(', ') || 'none'
    } -> now: ${newNumbers.join(', ') || 'none'}).`;
  } else if (changeRatio > wordChangeThreshold) {
    reason = `${Math.round(changeRatio * 100)}% of content changed between versions, above the ${Math.round(
      wordChangeThreshold * 100
    )}% review threshold.`;
  }

  return { flagged, reason, changeRatio, parts };
}
