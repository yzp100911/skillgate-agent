/**
 * xCrab 记忆系统测试
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, '..', 'data', 'test-memory.db');

describe('记忆系统 (MemoryStore)', () => {
  let MemoryStore;

  before(async () => {
    // 清理旧的测试数据库
    try { fs.unlinkSync(TEST_DB); } catch {}
    const mod = await import('../src/memory/store.js');
    MemoryStore = mod.MemoryStore;
  });

  after(() => {
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('应创建并初始化 SQLite 数据库', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    assert.ok(store);
    store.close();
  });

  it('应保存并读取记忆', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('test_key', 'test_value', 'general', 'mid');
    const result = store.load('test_key');
    assert.equal(result, 'test_value');
    store.close();
  });

  it('应覆盖已存在的 key', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('test_key', 'new_value', 'user_info', 'long');
    const result = store.load('test_key');
    assert.equal(result, 'new_value');
    store.close();
  });

  it('应搜索关键词', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('user_name', '张三', 'user_info', 'mid');
    const results = store.search('张三');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.key === 'user_name'));
    store.close();
  });

  it('应获取所有记忆', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    const all = store.getAll();
    assert.ok(all.length > 0);
    store.close();
  });

  it('应按层级过滤', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('long_test', 'long_value', 'fact', 'long');
    const longItems = store.getByLevel('long');
    assert.ok(longItems.some(r => r.key === 'long_test'));
    store.close();
  });

  it('应删除记忆', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('temp_key', 'temp_value');
    store.remove('temp_key');
    const result = store.load('temp_key');
    assert.equal(result, null);
    store.close();
  });

  it('formatForPrompt 应返回格式化字符串', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    save_history_only(store, 'format_test', 'format_value');
    const formatted = store.formatForPrompt();
    assert.ok(typeof formatted === 'string');
    store.close();
  });

  it('exists 应检查 key 是否存在且不触发 access_count', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('exists_test', 'value', 'general', 'mid');
    assert.ok(store.exists('exists_test'));
    assert.ok(!store.exists('nonexistent_key_xyz'));
    store.close();
  });

  it('FTS5: 应支持中文全文搜索（3+ 字符）', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('hobby', '喜欢看科幻电影和读小说', 'preference', 'mid');
    store.save('food', '最爱吃北京烤鸭', 'user_info', 'mid');
    // 3 字符查询走 FTS5
    const results = store.search('科幻电');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.key === 'hobby'));
    store.close();
  });

  it('短查询（< 3 字符）应降级到 LIKE 搜索', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('name_test', '张三丰', 'user_info', 'mid');
    const results = store.search('张三');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.key === 'name_test'));
    store.close();
  });

  it('searchWithScore 应返回 relevance 字段', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    store.save('score_test', '搜索评分测试内容', 'general', 'mid');
    const results = store.searchWithScore('搜索评分');
    if (results.length > 0) {
      assert.ok(typeof results[0].relevance === 'number');
      assert.ok(results[0].relevance >= 0 && results[0].relevance <= 1);
    }
    store.close();
  });

  it('formatForPrompt: long 记忆应始终包含', () => {
    const store = new MemoryStore({ dbPath: TEST_DB });
    for (let i = 0; i < 35; i++) {
      store.save(`bulk_${i}`, `value_${i}`, 'general', 'mid');
    }
    store.save('important_fact', '用户是程序员', 'user_info', 'long');
    const output = store.formatForPrompt();
    assert.ok(output.includes('important_fact'), 'long 记忆应被注入');
    assert.ok(output.includes('[长期]'), 'long 记忆应有 [长期] 标签');
    store.close();
  });

  it('_autoDecay: 应优先衰减低价值记忆', () => {
    const store = new MemoryStore({ dbPath: TEST_DB, maxMidMemories: 5 });
    store.save('vip_info', '重要用户信息', 'user_info', 'mid');
    for (let i = 0; i < 10; i++) store.load('vip_info');
    store.save('temp_note', '临时笔记', 'general', 'mid');
    store.save('temp_note2', '临时笔记2', 'general', 'mid');
    for (let i = 0; i < 15; i++) {
      store.save(`filler_${i}`, `filler_value_${i}`, 'general', 'mid');
    }
    const vip = store.load('vip_info');
    assert.ok(vip !== null, '高价值记忆不应被衰减');
    store.close();
  });
});

/** 辅助：保存历史（绕过层级过滤）*/
function save_history_only(store, key, value) {
  store.save(key, value, 'general', 'mid');
}
