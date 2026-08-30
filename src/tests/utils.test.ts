import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEntries, extractTags, parseDateArg, tzNow, getFilename } from '../utils';
import { timezone } from '../config';

function setTz(tz: string): void {
  (timezone as string) = tz;
}

// ========== parseEntries ==========

test('parseEntries: 解析多条目，缩进子列表不拆分条目', () => {
  const lines = [
    '# 2026-05-01.md',
    '',
    '- 2026/5/1 15:33:16',
    '  第一条内容',
    '- 😊 2026/5/1 15:59:18',
    '  心情条目',
    '  - 子列表项',
    '- 2026/5/1 16:00:00',
    '  第三条',
  ];
  const entries = parseEntries(lines);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].timestampIdx, 2);
  assert.equal(entries[1].timestampIdx, 4);
  assert.equal(entries[2].timestampIdx, 7);
  // 心情条目的子列表归属同一条目
  assert.deepEqual(entries[1].lines, [
    '- 😊 2026/5/1 15:59:18',
    '  心情条目',
    '  - 子列表项',
  ]);
});

test('parseEntries: 心情前缀条目与普通条目同等识别', () => {
  const entries = parseEntries(['- 😔 2026/5/1 16:14:20', '  内容']);
  assert.equal(entries.length, 1);
});

test('parseEntries: 空文件返回空数组', () => {
  assert.deepEqual(parseEntries(['', '']), []);
});

// ========== extractTags ==========

test('extractTags: 提取中文/英文标签并去重', () => {
  assert.deepEqual(extractTags('学了 Rust #学习 #Rust #学习'), ['学习', 'Rust']);
});

test('extractTags: 无标签返回空数组', () => {
  assert.deepEqual(extractTags('没有标签的内容'), []);
});

// ========== parseDateArg ==========

test('parseDateArg: 解析标准与短格式日期', () => {
  assert.deepEqual(parseDateArg('2026-05-01'), new Date(2026, 4, 1));
  assert.deepEqual(parseDateArg('2026-5-1'), new Date(2026, 4, 1));
});

test('parseDateArg: 拒绝错误格式', () => {
  assert.equal(parseDateArg('abc'), null);
  assert.equal(parseDateArg('2026/05/01'), null);
  assert.equal(parseDateArg('2026-13-01'), null);
  assert.equal(parseDateArg('2026-02-31'), null); // 不存在的日期，new Date 会滚动成 3 月
  assert.equal(parseDateArg(''), null);
});

// ========== tzNow / getFilename（时区一致性） ==========

test('tzNow: 同一 UTC 时刻在不同时区对应正确的本地日期', () => {
  // 2026-08-30 20:00 UTC = 上海 8/31 04:00，檀香山 8/30 10:00
  const utc = new Date('2026-08-30T20:00:00Z');
  setTz('Asia/Shanghai');
  assert.equal(getFilename(tzNow(utc)), '2026-08-31.md');
  setTz('Pacific/Honolulu');
  assert.equal(getFilename(tzNow(utc)), '2026-08-30.md');
  setTz('Asia/Shanghai'); // 还原默认
});
