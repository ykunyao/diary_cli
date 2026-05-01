import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import { ensureNotesDir, escapeHtml } from '../utils';
import { notesDir } from '../config';

export function registerExport(program: Command): void {
  program
    .command('export')
    .description('导出日记')
    .argument('[format]', '导出格式: md 或 html', 'md')
    .action(async (format: string) => {
      await ensureNotesDir();
      const files = await fs.readdir(notesDir);
      const diaryFiles = files
        .filter(f => f.endsWith('.md'))
        .sort(); // oldest first

      if (diaryFiles.length === 0) {
        console.log(chalk.yellow('还没有日记，用 diary add 写第一条吧~'));
        return;
      }

      if (format === 'md') {
        let output = '';
        for (let i = 0; i < diaryFiles.length; i++) {
          const file = diaryFiles[i];
          const content = await fs.readFile(path.join(notesDir, file), 'utf-8');
          output += content + '\n---\n';
          if (i < diaryFiles.length - 1) {
            output += '\n';
          }
        }
        const outPath = path.join(process.cwd(), 'diary-export.md');
        await fs.writeFile(outPath, output, 'utf-8');
        const stat = await fs.stat(outPath);
        console.log(chalk.green('✓ 已导出到 diary-export.md'));
        console.log(chalk.gray(`  文件大小: ${(stat.size / 1024).toFixed(1)} KB`));
      } else if (format === 'html') {
        let bodyHtml = '';
        for (const file of diaryFiles) {
          const date = file.replace('.md', '');
          const content = await fs.readFile(path.join(notesDir, file), 'utf-8');
          // Skip header line (# title)
          const lines = content.split('\n');
          const filtered = lines.filter((_l, i) => i !== 0 || !lines[0].startsWith('#'));
          const entryContent = filtered.join('\n').trim();
          bodyHtml += `<div class="day">\n<h2>${escapeHtml(date)}</h2>\n<pre>${escapeHtml(entryContent)}</pre>\n</div>\n`;
        }

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>日记导出 - Diary Export</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
.day { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.day h2 { color: #333; border-bottom: 2px solid #4CAF50; padding-bottom: 8px; }
pre { white-space: pre-wrap; font-family: inherit; line-height: 1.8; color: #555; }
</style>
</head>
<body>
<h1>📖 日记导出</h1>
<p>导出日期: ${escapeHtml(new Date().toLocaleString('zh-CN'))}</p>
${bodyHtml}
</body>
</html>`;

        const outPath = path.join(process.cwd(), 'diary-export.html');
        await fs.writeFile(outPath, html, 'utf-8');
        const stat = await fs.stat(outPath);
        console.log(chalk.green('✓ 已导出到 diary-export.html'));
        console.log(chalk.gray(`  文件大小: ${(stat.size / 1024).toFixed(1)} KB`));
      } else {
        console.log(chalk.red('格式错误，请使用 md 或 html'));
      }
    });
}
