import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, parseEntries, extractTags } from '../utils';
import { notesDir } from '../config';

export function registerTags(program: Command): void {
  program
    .command('tags')
    .description('列出所有标签及使用次数')
    .action(async () => {
      await ensureNotesDir();
      const files = await fs.readdir(notesDir);
      const diaryFiles = files
        .filter(f => f.endsWith('.md'));

      if (diaryFiles.length === 0) {
        console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
        return;
      }

      const tagCount: Record<string, number> = {};

      for (const file of diaryFiles) {
        const filePath = path.join(notesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const entries = parseEntries(lines);

        for (const entry of entries) {
          const text = entry.lines.join('\n');
          const tags = extractTags(text);
          for (const tag of tags) {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          }
        }
      }

      if (Object.keys(tagCount).length === 0) {
        console.log(chalk.yellow('还没有标签，用 diary add 内容 #标签 来添加标签吧~'));
        return;
      }

      const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);

      console.log(chalk.cyan.bold('\n🏷 标签列表\n'));
      for (const [tag, count] of sorted) {
        console.log(`  ${chalk.yellow('#' + tag)}  ${chalk.gray(`${count} 条`)}`);
      }
      console.log();
    });
}
