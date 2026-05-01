import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir } from '../utils';
import { parseEntries, entryHasTag } from '../utils';
import { notesDir } from '../config';

export function registerList(program: Command): void {
  const listCmd = program
    .command('list')
    .description('列出所有日记文件')
    .option('-t, --tag <tag>', '按标签筛选');

  listCmd.action(async () => {
    const opts = listCmd.opts();
    await ensureNotesDir();
    const files = await fs.readdir(notesDir);
    const diaries = files
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();

    if (diaries.length === 0) {
      console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
      return;
    }

    if (opts.tag) {
      // Filter by tag — show only files that have entries with this tag
      const tag = opts.tag as string;
      console.log(chalk.cyan.bold(`\n📖 标签 #${tag} 的日记\n`));

      let totalMatches = 0;
      for (const file of diaries) {
        const filePath = path.join(notesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const entries = parseEntries(lines);
        const matchingEntries = entries.filter(e => entryHasTag(e.lines, tag));

        if (matchingEntries.length > 0) {
          const date = file.replace('.md', '');
          console.log(`  ${chalk.white(date)}  ${chalk.gray(`(${matchingEntries.length} 条)`)}`);
          totalMatches += matchingEntries.length;
        }
      }

      if (totalMatches === 0) {
        console.log(chalk.yellow(`没有找到包含标签 #${tag} 的日记`));
      } else {
        console.log(chalk.gray(`\n  共 ${totalMatches} 条`));
      }
    } else {
      console.log(chalk.cyan.bold('📖 日记列表\n'));
      for (const file of diaries) {
        const filePath = path.join(notesDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n').filter((l: string) => l.trim());
        const count = lines.length - (lines[0]?.startsWith('#') ? 1 : 0);
        const date = file.replace('.md', '');
        console.log(`  ${chalk.white(date)}  ${chalk.gray(`(${count} 条)`)}`);
      }
    }
  });
}
