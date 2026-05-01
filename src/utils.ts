import * as fs from 'fs/promises';
import * as path from 'path';
import { notesDir, timezone } from './config';

// ========== Helpers ==========
export async function ensureNotesDir(): Promise<void> {
  await fs.mkdir(notesDir, { recursive: true });
}

export function getFilename(date?: string): string {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}.md`;
}

export function getFullPath(date?: string): string {
  return path.join(notesDir, getFilename(date));
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function extractTags(content: string): string[] {
  const matches = content.match(/#[\u4e00-\u9fa5\w]+/g);
  if (!matches) return [];
  return [...new Set(matches.map(t => t.slice(1)))];
}

/**
 * Parse a diary file into entry blocks.
 * Returns an array of entries; each entry has the index of the "- " timestamp line
 * and the list of body lines that belong to it.
 */
export interface EntryBlock {
  /** Line index of the "- " timestamp line within the file's lines array */
  timestampIdx: number;
  /** All lines that belong to this entry (including the timestamp line) */
  lines: string[];
}

export function parseEntries(lines: string[]): EntryBlock[] {
  const entries: EntryBlock[] = [];
  let currentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    // A top-level "- " line (not indented sub-list) starts a new entry
    if (trimmed.startsWith('- ') && !line.startsWith('  - ') && !line.startsWith('\t')) {
      if (currentStart >= 0) {
        entries.push({
          timestampIdx: currentStart,
          lines: lines.slice(currentStart, i),
        });
      }
      currentStart = i;
    }
  }
  // Last entry
  if (currentStart >= 0) {
    entries.push({
      timestampIdx: currentStart,
      lines: lines.slice(currentStart),
    });
  }
  return entries;
}

/**
 * Check if an entry (its joined lines text) contains the given tag.
 */
export function entryHasTag(entryLines: string[], tag: string): boolean {
  const text = entryLines.join('\n');
  return text.includes(`#${tag}`);
}
