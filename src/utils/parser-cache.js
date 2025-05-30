/**
 * 解析器缓存优化模块
 * 提升解析性能，减少重复计算和正则编译
 */

/**
 * 正则表达式缓存管理器
 */
export class RegexCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100; // 最大缓存数量
  }

  /**
   * 获取缓存的正则表达式
   * @param {string} pattern - 正则模式
   * @param {string} flags - 正则标志
   * @returns {RegExp} 正则表达式对象
   */
  get(pattern, flags = '') {
    const key = `${pattern}:${flags}`;
    
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // 检查缓存大小
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的缓存项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    const regex = new RegExp(pattern, flags);
    this.cache.set(key, regex);
    return regex;
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.hitCount / (this.hitCount + this.missCount) || 0
    };
  }
}

/**
 * 解析结果缓存管理器
 */
export class ParseCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 1000; // 最大缓存数量
    this.ttl = 5 * 60 * 1000; // 5分钟TTL
  }

  /**
   * 生成缓存键
   * @param {string} url - 代理URL
   * @returns {string} 缓存键
   */
  getCacheKey(url) {
    // 使用简单的哈希算法生成键
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
  }

  /**
   * 获取缓存的解析结果
   * @param {string} url - 代理URL
   * @returns {Object|null} 解析结果
   */
  get(url) {
    const key = this.getCacheKey(url);
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    // 检查TTL
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  /**
   * 设置缓存
   * @param {string} url - 代理URL
   * @param {Object} result - 解析结果
   */
  set(url, result) {
    const key = this.getCacheKey(url);
    
    // 检查缓存大小
    if (this.cache.size >= this.maxSize) {
      // 删除最旧的缓存项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      result: JSON.parse(JSON.stringify(result)), // 深拷贝避免引用问题
      timestamp: Date.now()
    });
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl
    };
  }
}

/**
 * 对象池管理器
 * 减少对象创建和GC压力
 */
export class ObjectPool {
  constructor() {
    this.pools = new Map();
  }

  /**
   * 获取对象池
   * @param {string} type - 对象类型
   * @returns {Array} 对象池
   */
  getPool(type) {
    if (!this.pools.has(type)) {
      this.pools.set(type, []);
    }
    return this.pools.get(type);
  }

  /**
   * 获取对象
   * @param {string} type - 对象类型
   * @returns {Object} 对象实例
   */
  acquire(type) {
    const pool = this.getPool(type);
    return pool.pop() || this.createObject(type);
  }

  /**
   * 释放对象
   * @param {string} type - 对象类型
   * @param {Object} obj - 对象实例
   */
  release(type, obj) {
    // 清理对象
    this.cleanObject(obj);
    
    const pool = this.getPool(type);
    if (pool.length < 50) { // 限制池大小
      pool.push(obj);
    }
  }

  /**
   * 创建新对象
   * @param {string} type - 对象类型
   * @returns {Object} 新对象
   */
  createObject(type) {
    switch (type) {
      case 'node':
        return {};
      case 'transport':
        return {};
      case 'tls':
        return {};
      default:
        return {};
    }
  }

  /**
   * 清理对象
   * @param {Object} obj - 对象实例
   */
  cleanObject(obj) {
    for (const key in obj) {
      delete obj[key];
    }
  }

  /**
   * 获取池统计
   */
  getStats() {
    const stats = {};
    for (const [type, pool] of this.pools.entries()) {
      stats[type] = pool.length;
    }
    return stats;
  }
}

/**
 * 高性能解析器基类
 */
export class CachedParser {
  constructor(name) {
    this.name = name;
    this.regexCache = new RegexCache();
    this.parseCache = new ParseCache();
    this.objectPool = new ObjectPool();
    this.stats = {
      parseCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalTime: 0
    };
  }

  /**
   * 获取缓存的正则表达式
   * @param {string} pattern - 正则模式
   * @param {string} flags - 正则标志
   * @returns {RegExp} 正则表达式
   */
  getRegex(pattern, flags) {
    return this.regexCache.get(pattern, flags);
  }

  /**
   * 缓存解析方法
   * @param {string} url - 代理URL
   * @returns {Object|null} 解析结果
   */
  cachedParse(url) {
    const startTime = Date.now();
    this.stats.parseCount++;

    // 尝试从缓存获取
    const cached = this.parseCache.get(url);
    if (cached) {
      this.stats.cacheHits++;
      return cached;
    }

    this.stats.cacheMisses++;

    // 执行实际解析
    const result = this.doParse(url);
    
    // 缓存结果
    if (result) {
      this.parseCache.set(url, result);
    }

    this.stats.totalTime += Date.now() - startTime;
    return result;
  }

  /**
   * 实际解析方法（子类实现）
   * @param {string} url - 代理URL
   * @returns {Object|null} 解析结果
   */
  doParse(url) {
    throw new Error('doParse method must be implemented');
  }

  /**
   * 获取对象实例
   * @param {string} type - 对象类型
   * @returns {Object} 对象实例
   */
  acquireObject(type) {
    return this.objectPool.acquire(type);
  }

  /**
   * 释放对象实例
   * @param {string} type - 对象类型
   * @param {Object} obj - 对象实例
   */
  releaseObject(type, obj) {
    this.objectPool.release(type, obj);
  }

  /**
   * 清理缓存
   */
  cleanup() {
    this.parseCache.cleanup();
  }

  /**
   * 获取性能统计
   */
  getStats() {
    return {
      parser: this.name,
      parseCount: this.stats.parseCount,
      cacheHitRate: this.stats.cacheHits / this.stats.parseCount || 0,
      avgParseTime: this.stats.totalTime / this.stats.parseCount || 0,
      regexCache: this.regexCache.getStats(),
      parseCache: this.parseCache.getStats(),
      objectPool: this.objectPool.getStats()
    };
  }
}

// 全局缓存实例
export const globalRegexCache = new RegexCache();
export const globalParseCache = new ParseCache();
export const globalObjectPool = new ObjectPool();

// 定期清理过期缓存
setInterval(() => {
  globalParseCache.cleanup();
}, 60000); // 每分钟清理一次
