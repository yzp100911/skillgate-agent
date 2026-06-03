/**
 * xCrab 持久化记忆系统
 * 基于 SQLite 的三层记忆存储
 * - short: 短期记忆，仅当前对话有效
 * - mid: 中期记忆，跨会话持久化，自动摘要压缩
 * - long: 长期记忆，重要事实，不会自动清理
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SQLiteStore } from './sqlite-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class MemoryStore {
  /**
   * @param {object} [options]
   * @param {string} [options.dbPath] - SQLite 文件路径
   * @param {number} [options.maxMidMemories] - 中期记忆上限，超过后触发衰减
   */
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.resolve(__dirname, '..', '..', 'memory', 'memories.db');
    this.maxMidMemories = options.maxMidMemories || 100;
    this._changeCount = 0;
    this._db = new SQLiteStore(this.dbPath);
    this._migrateFromJson();
  }

  /**
   * 从旧版 JSON 文件迁移数据
   */
  _migrateFromJson() {
    const oldFile = path.resolve(__dirname, '..', '..', 'memory', 'memories.json');
    if (!fs.existsSync(oldFile)) return;

    try {
      const raw = fs.readFileSync(oldFile, 'utf-8');
      const data = JSON.parse(raw);

      if (data.memories && Array.isArray(data.memories)) {
        for (const m of data.memories) {
          this._db.upsert(m.key, m.value, {
            category: m.category || 'general',
            level: 'mid',
          });
        }
        console.log(`  📦 已从 memories.json 迁移 ${data.memories.length} 条记忆`);
      }

      if (data.conversations && Array.isArray(data.conversations)) {
        for (const c of data.conversations) {
          this._db.saveConversationSummary(c.summary || '(迁移摘要)');
        }
      }

      // 重命名旧文件，避免重复迁移
      fs.renameSync(oldFile, oldFile + '.bak');
      console.log('  📦 旧版 memories.json 已备份为 memories.json.bak');
    } catch (err) {
      console.error(`  ⚠️ 记忆迁移失败: ${err.message}`);
    }
  }

  /**
   * 存储一条记忆
   * @param {string} key - 键名
   * @param {string} value - 内容
   * @param {string} [category] - 分类
   * @param {string} [level] - 层级: short|mid|long
   */
  save(key, value, category = 'general', level = 'mid') {
    this._db.upsert(key, value, { category, level });
    this._changeCount++;
    if (this._changeCount % 10 === 0) {
      this._autoDecay();
    }
  }

  /**
   * 读取一条记忆
   * @param {string} key
   * @returns {string|null}
   */
  load(key) {
    return this._db.load(key);
  }

  /**
   * 删除一条记忆
   */
  remove(key) {
    this._db.remove(key);
  }

  /**
   * 获取所有记忆
   * @returns {Array}
   */
  getAll() {
    return this._db.getAll();
  }

  /**
   * 搜索相关记忆
   * @param {string} query
   * @returns {Array}
   */
  search(query) {
    return this._db.search(query);
  }

  /**
   * 带评分的搜索，返回结果附带 relevance 字段 (0-1)
   * @param {string} query
   * @returns {Array}
   */
  searchWithScore(query) {
    return this._db.searchWithScore(query);
  }

  /**
   * 按层级获取记忆
   * @param {string} level
   * @param {number} limit
   * @returns {Array}
   */
  getByLevel(level, limit = 100) {
    return this._db.getByLevel(level, limit);
  }

  /**
   * 检查 key 是否存在（不触发 access_count 自增）
   * @param {string} key
   * @returns {boolean}
   */
  exists(key) {
    return this._db.exists(key);
  }

  /**
   * 保存对话摘要
   * @param {string} summary
   */
  saveConversationSummary(summary) {
    this._db.saveConversationSummary(summary);
  }

  /**
   * 获取最近的对话摘要
   * @param {number} limit
   * @returns {string[]}
   */
  getRecentSummaries(limit = 5) {
    return this._db.getRecentSummaries(limit);
  }

  /**
   * 自动衰减：当中期记忆超过上限时，按重要性评分选择衰减对象
   */
  _autoDecay() {
    try {
      const mids = this._db.getByLevel('mid', this.maxMidMemories + 10);
      if (mids.length <= this.maxMidMemories) return;

      // 按衰减分数升序排列（分数最低的最应该被衰减）
      const scored = mids.map(m => ({
        ...m,
        _decayScore: this._calculateDecayScore(m),
      }));
      scored.sort((a, b) => a._decayScore - b._decayScore);

      // 动态衰减数量：过剩量的 10%，至少 5 条，最多 15 条
      const excess = mids.length - this.maxMidMemories;
      const decayCount = Math.max(5, Math.min(15, excess, Math.ceil(mids.length * 0.1)));
      const toArchive = scored.slice(0, decayCount);

      // 分离低价值和中等价值记忆
      const lowValue = toArchive.filter(m => m._decayScore < 5);
      const midValue = toArchive.filter(m => m._decayScore >= 5);

      // 低价值记忆直接丢弃
      for (const m of lowValue) {
        this._db.remove(m.key);
      }

      // 中等价值记忆压缩为归档摘要
      if (midValue.length > 0) {
        const summaryParts = midValue.map(m => `${m.key}(${m.category})`);
        const summaryText = summaryParts.join(', ') + ' 等 ' + midValue.length + ' 条记忆';

        for (const m of midValue) {
          this._db.remove(m.key);
        }

        this._db.upsert(`_archive_${Date.now()}`, `[归档] ${summaryText}`, {
          category: 'archive',
          level: 'long',
        });
      }
    } catch {
      // 衰减失败不阻塞业务
    }
  }

  /**
   * 计算记忆的衰减优先级分数（分数越低越应该被衰减）
   */
  _calculateDecayScore(memory) {
    const categoryWeights = { user_info: 10, preference: 6, fact: 4, general: 2 };
    const accessWeight = Math.log10((memory.access_count || 0) + 1) * 4;
    const categoryWeight = categoryWeights[memory.category] || 2;
    const daysSinceUpdate = (Date.now() - (memory.updated_at || 0)) / (1000 * 60 * 60 * 24);
    const agePenalty = Math.max(0, 1 - daysSinceUpdate / 30) * 3;
    const lengthBonus = Math.min((memory.value?.length || 0) / 100, 3);
    return accessWeight + categoryWeight + agePenalty + lengthBonus;
  }

  /**
   * 计算单条记忆的重要性分数（用于 prompt 注入排序）
   */
  _calculateImportance(memory) {
    const levelWeights = { long: 10, mid: 5, short: 1 };
    const categoryWeights = { user_info: 8, preference: 6, fact: 5, general: 2, archive: 1 };
    const levelScore = levelWeights[memory.level] || 2;
    const categoryScore = categoryWeights[memory.category] || 2;
    const accessScore = Math.log10((memory.access_count || 0) + 1) * 3;
    const daysSinceUpdate = (Date.now() - (memory.updated_at || 0)) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - daysSinceUpdate / 90) * 2;
    return levelScore + categoryScore + accessScore + recencyScore;
  }

  /**
   * 从记忆列表中选出应注入 prompt 的记忆
   * - long 级记忆全部保留
   * - 其余按重要性分数排序，取 top N
   */
  _rankedSelection(memories, maxCount = 30) {
    const longs = memories.filter(m => m.level === 'long');
    const others = memories.filter(m => m.level !== 'long' && m.level !== 'short');

    const scored = others.map(m => ({
      ...m,
      _importance: this._calculateImportance(m),
    }));
    scored.sort((a, b) => b._importance - a._importance);

    const remainingSlots = Math.max(0, maxCount - longs.length);
    const selected = [...longs, ...scored.slice(0, remainingSlots)];

    // 按 level 优先级排序（long 在前），同 level 按 importance 降序
    selected.sort((a, b) => {
      const levelOrder = { long: 0, mid: 1, short: 2 };
      const la = levelOrder[a.level] ?? 1;
      const lb = levelOrder[b.level] ?? 1;
      if (la !== lb) return la - lb;
      return (b._importance || 0) - (a._importance || 0);
    });

    return selected;
  }

  /**
   * 将记忆格式化为 system prompt 可用的文本
   * @returns {string}
   */
  formatForPrompt() {
    const parts = [];
    const allMemories = this._db.getAll();

    const selected = this._rankedSelection(allMemories, 30);
    if (selected.length > 0) {
      parts.push('## 关于用户的记忆');
      for (const m of selected) {
        const tag = m.level === 'long' ? ' [长期]' : '';
        parts.push(`  ${m.key}: ${m.value}${tag}`);
      }
    }

    const summaries = this.getRecentSummaries();
    if (summaries.length > 0) {
      parts.push('\n## 历史对话摘要');
      for (const s of summaries) {
        parts.push(`  - ${s}`);
      }
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this._db) {
      this._db.close();
    }
  }
}
