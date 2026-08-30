import * as fs from 'fs/promises';
import * as path from 'path';
import { notesDir, timezone } from './config';

// ========== Helpers ==========
export async function ensureNotesDir(): Promise<void> {
  await fs.mkdir(notesDir, { recursive: true });
}

/**
 * 返回"配置时区的当前挂钟时间"对应的伪 Date。
 * Date 的字段方法（getFullYear/getDay/setDate…）都按系统时区取值，
 * 先把当前时刻换算到配置时区，之后所有日期字段判断都和用户配置一致。
 */
export function tzNow(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? '00';
  // 无时区后缀的 ISO 串按本地时区解析，恰好得到"配置时区挂钟"的伪 Date
  return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`);
}

/**
 * 解析用户输入的日期参数（YYYY-MM-DD）为本地零点的 Date。
 * 不用 new Date(str)：ISO 日期串按 UTC 解析，在西边时区会偏一天。
 * 月/日允许 1-2 位；格式错误或日期不存在（如 2026-02-31）返回 null。
 */
export function parseDateArg(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  // new Date 会把 2026-02-31 滚动成 3 月，这里拦下来
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * 处理命令的日期参数：无参数返回"今天"（配置时区），有参数则解析。
 * 非法输入返回 null，由调用方提示错误。
 */
export function resolveDateArg(dateStr?: string): Date | null {
  if (!dateStr) return tzNow();
  return parseDateArg(dateStr);
}

export function getFilename(date?: Date): string {
  const d = date ?? tzNow();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}.md`;
}

export function getFullPath(date?: Date): string {
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
