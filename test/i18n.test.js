// 英文版：对照表格式、变量一致；英文内容能和中文叠起来加载
import test from 'node:test';
import assert from 'node:assert/strict';
import { check, WEB_FILES } from '../scripts/i18n-check.mjs';
import { loadContent } from '../server/content.js';

test('英文对照表：变量和中文一致', () => {
  const { bad } = check(WEB_FILES());
  assert.deepEqual(bad, [], '英文里的 {变量} 要和中文原文一致');
});

test('英文内容能加载（content/en 叠在中文上）', () => {
  assert.doesNotThrow(() => loadContent(undefined, 'en'));
});
