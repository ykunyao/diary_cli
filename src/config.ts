import { readFileSync } from 'fs';
import { writeFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ========== Config ==========
export const CONFIG_PATH = path.join(os.homedir(), '.diaryrc.json');

export interface DiaryConfig {
  notesDir: string;
  timezone: string;
  editor: string;
}

export let notesDir: string;
export let timezone: string;
export let editorCmd: string;

export function loadConfigSync(): void {
  const defaults: DiaryConfig = {
    notesDir: path.join(__dirname, '..', 'notes'),
    timezone: 'Asia/Shanghai',
    editor: 'auto',
  };
  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const merged = { ...defaults, ...parsed };
    notesDir = merged.notesDir;
    timezone = merged.timezone;
    editorCmd = merged.editor;
  } catch {
    notesDir = defaults.notesDir;
    timezone = defaults.timezone;
    editorCmd = defaults.editor;
  }
}

export async function saveConfig(config: DiaryConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfig(): DiaryConfig {
  return { notesDir, timezone, editor: editorCmd };
}
