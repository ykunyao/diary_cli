import { Command } from 'commander';
import * as fs from 'fs/promises';
import chalk from 'chalk';
import { ensureNotesDir, getFullPath, getFilename, extractTags } from '../utils';
import { timezone } from '../config';

export function registerAdd(program: Command): void {
  const addCmd = program
    .command('add')
    .description('添加一条日记')
    .option('-m, --mood <emoji>', '心情标记 (如 😊😢😡😴)')
    .argument('<text...>', '日记内容');

  addCmd.action(async (textParts: string[]) => {
    const opts = addCmd.opts();
    await ensureNotesDir();

    // 校验心情值：必须是 emoji 或单字符，防止 -m oon 这种手滑
    if (opts.mood) {
      const moodVal = opts.mood as string;
      const isAsciiWord = /^[a-zA-Z]+$/.test(moodVal);
      if (isAsciiWord && moodVal.length > 1) {
        console.log(chalk.yellow(`⚠ 心情 "${moodVal}" 看起来不太对，是不是把 --mood 写成 -mood 了？`));
        console.log(chalk.gray('  正确用法: diary add --mood 😊 内容'));
        return;
      }
    }

    const content = textParts.join(' ');
    const filePath = getFullPath();
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: timezone });
    const prefix = opts.mood ? `${opts.mood} ` : '';
    const entry = `- ${prefix}${timestamp}\n  ${content}\n`;

    // 如果文件不存在，先写标题
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, `# ${getFilename()}\n\n`, 'utf-8');
    }

    // 追加写入：不回读旧内容，避免并发/中断时覆盖丢失已有日记
    await fs.appendFile(filePath, entry, 'utf-8');
    console.log(chalk.green('✓ 已记录'));
    console.log(chalk.gray(`  ${getFilename()}`));

    // 检测并显示标签
    const tags = extractTags(content);
    if (tags.length > 0) {
      console.log(chalk.gray(`  🏷 标签: ${tags.join(', ')}`));
    }
  });
}
