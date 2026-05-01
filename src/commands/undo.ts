import { Command } from 'commander';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { ensureNotesDir, getFullPath, getFilename, parseEntries } from '../utils';

export function registerUndo(program: Command): void {
  program
    .command('undo')
    .description('撤销今天的最后 N 条日记')
    .argument('[count]', '要撤销的条目数，默认 1', '1')
    .action(async (countStr: string) => {
      await ensureNotesDir();
      const count = parseInt(countStr, 10);

      if (isNaN(count) || count < 1) {
        console.log(chalk.red('请输入有效的数字（≥1）'));
        return;
      }

      const filePath = getFullPath();
      const filename = getFilename();

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        console.log(chalk.yellow(`今天（${filename}）还没有日记`));
        return;
      }

      const lines = content.split('\n');
      const entries = parseEntries(lines);

      if (entries.length === 0) {
        console.log(chalk.yellow(`今天（${filename}）还没有日记条目`));
        return;
      }

      const toRemove = Math.min(count, entries.length);
      const removed = entries.slice(entries.length - toRemove);

      // Show what will be removed
      console.log(chalk.yellow(`\n⚠ 将撤销 ${toRemove} 条日记：\n`));
      for (const entry of removed) {
        const tsLine = entry.lines[0].trimStart();
        const bodyPreview = entry.lines.slice(1).find(l => l.trim())?.trim().slice(0, 60) || '';
        console.log(chalk.gray(`  ${tsLine}`));
        if (bodyPreview) {
          console.log(chalk.gray(`    ${bodyPreview}${bodyPreview.length >= 60 ? '...' : ''}`));
        }
        console.log();
      }

      // Rebuild the file without the removed entries
      const remainingEntries = entries.slice(0, entries.length - toRemove);
      const headerLines: string[] = [];
      // Keep lines before the first entry (header, blank lines)
      if (entries.length > 0) {
        for (let i = 0; i < entries[0].timestampIdx; i++) {
          headerLines.push(lines[i]);
        }
      } else {
        // Shouldn't reach here since we checked entries.length > 0
        headerLines.push(...lines.filter(l => l.startsWith('#') || l === ''));
      }

      const newContent = [
        ...headerLines,
        ...remainingEntries.flatMap(e => e.lines),
      ].join('\n');

      // Ensure trailing newline
      const finalContent = newContent.endsWith('\n') ? newContent : newContent + '\n';
      await fs.writeFile(filePath, finalContent, 'utf-8');

      console.log(chalk.green(`✓ 已撤销 ${toRemove} 条日记`));
    });
}
