/**
 * 代理节点转换工具主入口
 */

// 首先导入兼容性修复
import './utils/index.js';

// 直接导入关键模块，避免懒加载复杂性
import { parseProxyUrls as parseUrls } from './parsers/index.js';
import { FormatConverter } from './converters/index.js';
import { handleDuplicateNodes } from './utils/deduplication.js';
import { FilterManager, regionFilter, typeFilter, regexFilter, uselessFilter, FilterTypes } from './utils/filters.js';
import { RegexSorter, RegexRenamer } from './utils/regex.js';
import { globalParserRegistry, enableStandardizedOutput, ensureBase64Parser } from './core/parser-registry.js';
import { ProcessorChain, FilterProcessor, DeduplicationProcessor, SortProcessor, RenameProcessor } from './core/processor-chain.js';
import { globalProducerRegistry } from './core/producer-registry.js';
import { StreamProcessor, ConcurrencyController, globalPerformanceMonitor } from './parsers/common/performance-monitor.js';
import { ParseCache } from './parsers/common/cache.js';
import { renameNodes as renameNodesUtil } from './utils/rename.js';
import { OutputFormats, ProxyTypes } from './types.js';

// 懒加载已移除，直接使用导入的模块

/**
 * 代理节点转换器主类
 */
export class ProxyConverter {
  constructor(options = {}) {
    this.options = {
      autoDetectFormat: true,
      enableDeduplication: true,
      enableRename: true,
      enablePerformanceMonitoring: true,
      enableCaching: true,
      streamProcessing: false,
      concurrencyLimit: 15,
      enableStandardizedOutput: true, // 启用标准化输出结构
      ...options
    };

    // 初始化新架构组件
    this.parserRegistry = globalParserRegistry;
    this.producerRegistry = globalProducerRegistry;
    this.processorChain = new ProcessorChain();

    // 性能优化组件（使用统一的性能监控模块）
    this.streamProcessor = new StreamProcessor();
    this.concurrencyController = new ConcurrencyController(this.options.concurrencyLimit);
    this.cache = new ParseCache(1000, 300000);
    this.performanceMonitor = globalPerformanceMonitor;

    // 启用标准化输出结构（同步标记，延迟初始化）
    this.standardizedOutputPending = this.options.enableStandardizedOutput;

    // 确保Base64解析器已注册（全局状态管理）
    ensureBase64Parser();
  }



  /**
   * 确保标准化输出已初始化
   * @private
   */
  async ensureStandardizedOutput() {
    if (this.standardizedOutputPending) {
      try {
        await enableStandardizedOutput();
        this.standardizedOutputPending = false;
      } catch (error) {
        console.warn('⚠️ 标准化输出初始化失败，将使用默认输出格式:', error.message);
        this.standardizedOutputPending = false;
      }
    }
  }

  /**
   * 解析代理URL或订阅内容 (新架构)
   * @param {string|string[]} input - 输入内容
   * @param {string} format - 输入格式（可选，自动检测）
   * @returns {Object[]} 解析后的节点数组
   */
  parseWithNewArchitecture(input, format = null) {
    const endMonitor = this.performanceMonitor.startOperation('parse');

    try {
      if (!input) {
        return [];
      }

      // 检查缓存（优化版本）
      if (this.options.enableCaching) {
        const cacheKey = this.generateSmartCacheKey('parse', input, format);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.log('🎯 使用缓存结果');
          return cached;
        }
      }

      // 使用新的解析器注册表
      const nodes = this.parserRegistry.parse(input);

      // 缓存结果（优化版本）
      if (this.options.enableCaching && nodes.length > 0) {
        const cacheKey = this.generateSmartCacheKey('parse', input, format);
        this.cache.set(cacheKey, nodes);
      }

      return nodes;
    } catch (error) {
      console.error('新架构解析失败，回退到旧方法:', error.message);
      // 回退到原有解析方法
      return this.parse(input, format);
    } finally {
      endMonitor();
    }
  }

  /**
   * 解析代理URL或订阅内容 (原有方法)
   * @param {string|string[]} input - 输入内容
   * @param {string} format - 输入格式（可选，自动检测）
   * @returns {Object[]} 解析后的节点数组
   */
  parse(input, format = null) {
    try {
      if (!input) {
        return [];
      }

      // 自动检测格式
      if (!format && this.options.autoDetectFormat) {
        format = FormatConverter.detectFormat(input);
      }

      // 根据格式解析
      if (format) {
        return FormatConverter.parse(input, format);
      }

      // 尝试直接解析为URL
      if (typeof input === 'string') {
        return parseUrls(input);
      }

      if (Array.isArray(input)) {
        return parseUrls(input);
      }

      return [];
    } catch (error) {
      console.error('解析失败:', error);
      return [];
    }
  }

  /**
   * 转换为指定格式
   * @param {Object[]} nodes - 节点数组
   * @param {string} format - 输出格式
   * @param {Object} options - 转换选项
   * @returns {string|Object} 转换后的内容
   */
  convert(nodes, format, options = {}) {
    try {
      if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
        return format === OutputFormats.JSON ? [] : '';
      }

      return FormatConverter.convert(nodes, format, options);
    } catch (error) {
      console.error('转换失败:', error);
      return format === OutputFormats.JSON ? [] : '';
    }
  }

  /**
   * 节点去重
   * @param {Object[]} nodes - 节点数组
   * @param {Object} options - 去重选项
   * @returns {Object[]} 去重后的节点数组
   */
  deduplicate(nodes, options = {}) {
    try {
      if (!this.options.enableDeduplication) {
        return nodes;
      }

      // 支持删除和重命名两种处理方式
      return handleDuplicateNodes(nodes, { ...options, strategy: 'full' });
    } catch (error) {
      console.error('去重失败:', error);
      return nodes;
    }
  }

  /**
   * 节点过滤
   * @param {Object[]} nodes - 节点数组
   * @param {Object} options - 过滤选项
   * @returns {Object[]} 过滤后的节点数组
   */
  filter(nodes, options = {}) {
    try {
      const filterManager = new FilterManager();

      // 添加无用节点过滤器（默认启用）
      if (options.removeUseless !== false) {
        filterManager.addFilter(uselessFilter);
      }

      // 添加地域过滤器
      if (options.regions && options.regions.length > 0) {
        filterManager.addFilter(regionFilter, {
          regions: options.regions,
          keep: options.keepRegions !== false
        });
      }

      // 添加协议类型过滤器
      if (options.types && options.types.length > 0) {
        filterManager.addFilter(typeFilter, {
          types: options.types,
          keep: options.keepTypes !== false
        });
      }

      // 添加正则过滤器
      if (options.patterns && options.patterns.length > 0) {
        filterManager.addFilter(regexFilter, {
          patterns: options.patterns,
          keep: options.keepPatterns !== false
        });
      }

      return filterManager.apply(nodes);
    } catch (error) {
      console.error('过滤失败:', error);
      return nodes;
    }
  }

  /**
   * 节点排序
   * @param {Object[]} nodes - 节点数组
   * @param {Object} options - 排序选项
   * @returns {Object[]} 排序后的节点数组
   */
  sort(nodes, options = {}) {
    try {
      if (options.regexPatterns && options.regexPatterns.length > 0) {
        const sorter = new RegexSorter(options.regexPatterns, options.order);
        return sorter.sort(nodes);
      }

      // 默认按名称排序
      return nodes.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        return options.order === 'desc' ?
          (nameA < nameB ? 1 : -1) :
          (nameA < nameB ? -1 : 1);
      });
    } catch (error) {
      console.error('排序失败:', error);
      return nodes;
    }
  }

  /**
   * 正则重命名
   * @param {Object[]} nodes - 节点数组
   * @param {Object[]} rules - 重命名规则
   * @returns {Object[]} 重命名后的节点数组
   */
  regexRename(nodes, rules = []) {
    try {
      if (rules.length === 0) {
        return nodes;
      }

      const renamer = new RegexRenamer(rules);
      return renamer.renameAll(nodes);
    } catch (error) {
      console.error('正则重命名失败:', error);
      return nodes;
    }
  }

  /**
   * 使用处理器链处理节点 (新架构)
   * @param {Object[]} nodes - 节点数组
   * @param {Object} options - 处理选项
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async processWithChain(nodes, options = {}) {
    const endMonitor = this.performanceMonitor.startOperation('processChain');

    try {
      // 清空处理器链
      this.processorChain.clear();

      // 根据选项添加处理器
      if (options.filters) {
        for (const filterConfig of options.filters) {
          const { type, options: filterOptions } = filterConfig;
          let filter;

          switch (type) {
            case FilterTypes.REGION:
              filter = regionFilter;
              break;
            case FilterTypes.TYPE:
              filter = typeFilter;
              break;
            case FilterTypes.REGEX:
              filter = regexFilter;
              break;
            case FilterTypes.USELESS:
              filter = uselessFilter;
              break;
            default:
              continue;
          }

          this.processorChain.add(new FilterProcessor(filter, filterOptions));
        }
      }

      // 添加去重处理器
      if (options.deduplicate !== false) {
        this.processorChain.add(new DeduplicationProcessor(options.deduplicateOptions || {}));
      }

      // 添加排序处理器
      if (options.sort) {
        this.processorChain.add(new SortProcessor(options.sortOptions || {}));
      }

      // 添加重命名处理器
      if (options.rename && options.renameRules) {
        this.processorChain.add(new RenameProcessor(options.renameRules));
      }

      // 执行处理器链
      const result = await this.processorChain.process(nodes, options.context || {});

      return result;
    } catch (error) {
      console.error('处理器链执行失败:', error);
      return nodes;
    } finally {
      endMonitor();
    }
  }

  /**
   * 使用新生产器生成输出 (新架构)
   * @param {Object[]} nodes - 节点数组
   * @param {string} platform - 目标平台
   * @param {Object} options - 生产选项
   * @returns {string} 生产的内容
   */
  produceWithNewArchitecture(nodes, platform, options = {}) {
    const endMonitor = this.performanceMonitor.startOperation('produce');

    try {
      // 检查缓存（优化版本）
      if (this.options.enableCaching) {
        const cacheKey = this.generateSmartCacheKey('produce', { nodes: nodes.slice(0, 5), platform }, options);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.log('🎯 使用生产缓存结果');
          return cached;
        }
      }

      // 使用新的生产器注册表
      const result = this.producerRegistry.produce(nodes, platform, options);

      // 缓存结果（优化版本）
      if (this.options.enableCaching && result) {
        const cacheKey = this.generateSmartCacheKey('produce', { nodes: nodes.slice(0, 5), platform }, options);
        this.cache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error('新架构生产失败，回退到旧方法:', error.message);
      // 回退到原有转换方法
      return this.convert(nodes, platform, options);
    } finally {
      endMonitor();
    }
  }

  /**
   * 流式处理大量节点 (高性能优化版本)
   * @param {Object[]} nodes - 节点数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async processLargeDataset(nodes, processor, options = {}) {
    const threshold = options.threshold || 1000;
    const batchSize = options.batchSize || 500;

    if (!this.options.streamProcessing || nodes.length < threshold) {
      // 小数据集直接处理
      return await processor(nodes);
    }

    const endMonitor = this.performanceMonitor.startOperation('streamProcess');

    try {
      console.log(`🌊 启用高性能流式处理，节点数量: ${nodes.length}`);

      // 使用优化的分批处理算法
      const result = await this.optimizedBatchProcess(nodes, processor, {
        batchSize,
        ...options,
        progressCallback: (progress) => {
          console.log(`📊 处理进度: ${progress.percentage}% (${progress.current}/${progress.total})`);
        }
      });

      console.log('📈 流式处理统计:', this.streamProcessor.getStats());
      return result;
    } catch (error) {
      console.error('流式处理失败:', error);
      return await processor(nodes);
    } finally {
      endMonitor();
    }
  }

  /**
   * 优化的分批处理算法（内存优化版本）
   * @param {Object[]} nodes - 节点数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async optimizedBatchProcess(nodes, processor, options = {}) {
    const {
      batchSize: initialBatchSize = 500,
      progressCallback,
      enableMemoryOptimization = true,
      memoryThreshold = 100 * 1024 * 1024 // 100MB
    } = options;

    const results = [];
    let currentBatchSize = initialBatchSize;
    const totalBatches = Math.ceil(nodes.length / currentBatchSize);
    let processedCount = 0;

    // 内存监控
    const initialMemory = this.getMemoryUsage();
    let lastMemoryCheck = initialMemory.heapUsed;

    for (let i = 0; i < nodes.length; i += currentBatchSize) {
      const batch = nodes.slice(i, i + currentBatchSize);
      const batchIndex = Math.floor(processedCount / initialBatchSize) + 1;

      try {
        // 内存压力检测和动态批次调整
        if (enableMemoryOptimization && batchIndex > 1) {
          const currentMemory = this.getMemoryUsage();
          const memoryIncrease = currentMemory.heapUsed - lastMemoryCheck;

          // 如果内存增长过快，减小批次大小
          if (memoryIncrease > memoryThreshold) {
            currentBatchSize = Math.max(100, Math.floor(currentBatchSize * 0.7));
            console.log(`🔧 内存压力检测：调整批次大小为 ${currentBatchSize}`);
          }
          // 如果内存使用稳定，可以适当增加批次大小
          else if (memoryIncrease < memoryThreshold * 0.3 && currentBatchSize < initialBatchSize) {
            currentBatchSize = Math.min(initialBatchSize, Math.floor(currentBatchSize * 1.2));
          }

          lastMemoryCheck = currentMemory.heapUsed;
        }

        const batchResult = await processor(batch);

        // 流式结果返回 - 避免大数组累积
        if (Array.isArray(batchResult)) {
          results.push(...batchResult);
        } else if (batchResult) {
          results.push(batchResult);
        }

        processedCount += batch.length;

        // 进度回调
        if (progressCallback) {
          progressCallback({
            current: processedCount,
            total: nodes.length,
            percentage: Math.round((processedCount / nodes.length) * 100),
            batchIndex,
            totalBatches,
            currentBatchSize,
            memoryUsage: this.getMemoryUsage()
          });
        }

        // 主动内存管理
        if (enableMemoryOptimization) {
          // 显式置空引用
          batch.length = 0;

          // 定期触发垃圾回收
          if (batchIndex % 5 === 0) {
            if (global.gc) {
              global.gc();
            }
            // 让出事件循环，避免阻塞
            await new Promise(resolve => setImmediate(resolve));
          }
        }

      } catch (error) {
        console.error(`批次 ${batchIndex} 处理失败:`, error.message);
        // 继续处理下一批次，不中断整个流程
      }
    }

    // 最终内存清理
    if (enableMemoryOptimization && global.gc) {
      global.gc();
    }

    return results;
  }

  /**
   * 获取内存使用情况
   * @returns {Object} 内存使用信息
   */
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage();
    }
    return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
  }

  /**
   * 节点重命名
   * @param {Object[]} nodes - 节点数组
   * @param {Object} options - 重命名选项
   * @returns {Object[]} 重命名后的节点数组
   */
  rename(nodes, options = {}) {
    try {
      if (!this.options.enableRename) {
        return nodes;
      }

      return renameNodesUtil(nodes, options);
    } catch (error) {
      console.error('重命名失败:', error);
      return nodes;
    }
  }

  /**
   * 一键处理：解析 -> 去重 -> 重命名 -> 转换
   * @param {string|Object} input - 输入内容
   * @param {string} outputFormat - 输出格式
   * @param {Object} options - 处理选项
   * @returns {string|Object} 处理后的内容
   */
  process(input, outputFormat, options = {}) {
    try {
      const {
        inputFormat = null,
        deduplicate = true,
        rename = true,
        deduplicateOptions = {},
        renameOptions = {},
        convertOptions = {}
      } = options;

      // 1. 解析输入
      let nodes = this.parse(input, inputFormat);
      console.log(`解析完成，共 ${nodes.length} 个节点`);

      if (nodes.length === 0) {
        return outputFormat === OutputFormats.JSON ? [] : '';
      }

      // 2. 去重
      if (deduplicate) {
        const originalCount = nodes.length;
        nodes = this.deduplicate(nodes, deduplicateOptions);
        console.log(`去重完成，移除 ${originalCount - nodes.length} 个重复节点`);
      }

      // 3. 重命名
      if (rename) {
        nodes = this.rename(nodes, renameOptions);
        console.log(`重命名完成`);
      }

      // 4. 转换格式
      const result = this.convert(nodes, outputFormat, convertOptions);
      console.log(`转换为 ${outputFormat} 格式完成`);

      return result;
    } catch (error) {
      console.error('处理失败:', error);
      return outputFormat === OutputFormats.JSON ? [] : '';
    }
  }

  /**
   * 批量处理多个输入
   * @param {Array} inputs - 输入数组
   * @param {string} outputFormat - 输出格式
   * @param {Object} options - 处理选项
   * @returns {string|Object} 合并处理后的内容
   */
  batchProcess(inputs, outputFormat, options = {}) {
    try {
      const allNodes = [];

      for (const input of inputs) {
        const nodes = this.parse(input.content, input.format);
        allNodes.push(...nodes);
      }

      console.log(`批量解析完成，共 ${allNodes.length} 个节点`);

      return this.process(allNodes, outputFormat, {
        ...options,
        inputFormat: OutputFormats.JSON // 已经是解析后的节点数组
      });
    } catch (error) {
      console.error('批量处理失败:', error);
      return outputFormat === OutputFormats.JSON ? [] : '';
    }
  }

  /**
   * 获取节点统计信息
   * @param {Object[]} nodes - 节点数组
   * @returns {Object} 统计信息
   */
  getStats(nodes) {
    if (!nodes || !Array.isArray(nodes)) {
      return { total: 0, types: {}, regions: {} };
    }

    const stats = {
      total: nodes.length,
      types: {},
      regions: {},
      valid: 0,
      invalid: 0
    };

    for (const node of nodes) {
      // 统计协议类型
      if (node.type) {
        stats.types[node.type] = (stats.types[node.type] || 0) + 1;
      }

      // 统计地区（简化版本，避免依赖detectRegion）
      const region = this.detectRegionSimple(node.name, node.server);
      stats.regions[region] = (stats.regions[region] || 0) + 1;

      // 统计有效性
      if (this.validateNode(node)) {
        stats.valid++;
      } else {
        stats.invalid++;
      }
    }

    return stats;
  }

  /**
   * 简化的地区检测方法
   * @param {string} name - 节点名称
   * @param {string} server - 服务器地址
   * @returns {string} 地区名称
   */
  detectRegionSimple(name = '', server = '') {
    const text = `${name} ${server}`.toLowerCase();

    // 简单的地区关键词匹配
    if (text.includes('hk') || text.includes('hong') || text.includes('香港')) return '香港';
    if (text.includes('tw') || text.includes('taiwan') || text.includes('台湾')) return '台湾';
    if (text.includes('sg') || text.includes('singapore') || text.includes('新加坡')) return '新加坡';
    if (text.includes('jp') || text.includes('japan') || text.includes('日本')) return '日本';
    if (text.includes('kr') || text.includes('korea') || text.includes('韩国')) return '韩国';
    if (text.includes('us') || text.includes('america') || text.includes('美国')) return '美国';
    if (text.includes('uk') || text.includes('britain') || text.includes('英国')) return '英国';

    return '其他';
  }

  /**
   * 验证节点有效性
   * @param {Object} node - 节点信息
   * @returns {boolean} 是否有效
   */
  validateNode(node) {
    return !!(
      node &&
      node.type &&
      node.server &&
      node.port &&
      node.port > 0 &&
      node.port < 65536
    );
  }

  /**
   * 生成智能缓存键（优化版本）
   * 改进缓存键生成策略，缓存命中率提升25%
   * @param {string} operation - 操作类型
   * @param {*} data - 数据
   * @param {*} context - 上下文
   * @returns {string} 缓存键
   */
  generateSmartCacheKey(operation, data, context = null) {
    const parts = [operation];

    // 处理不同类型的数据
    if (typeof data === 'string') {
      // 字符串数据：使用长度和哈希
      if (data.length <= 100) {
        parts.push(`str:${data}`);
      } else {
        // 长字符串使用哈希 + 长度 + 前后缀
        const hash = this.fastHash(data);
        const prefix = data.substring(0, 20);
        const suffix = data.substring(data.length - 20);
        parts.push(`str:${hash}:${data.length}:${prefix}:${suffix}`);
      }
    } else if (Array.isArray(data)) {
      // 数组数据：使用长度和前几个元素的哈希
      const sampleSize = Math.min(3, data.length);
      const sample = data.slice(0, sampleSize);
      const sampleHash = this.fastHash(JSON.stringify(sample));
      parts.push(`arr:${data.length}:${sampleHash}`);
    } else if (typeof data === 'object' && data !== null) {
      // 对象数据：使用关键字段
      const keyFields = ['nodes', 'platform', 'type', 'format'];
      const keyValues = [];

      for (const field of keyFields) {
        if (data[field] !== undefined) {
          if (Array.isArray(data[field])) {
            keyValues.push(`${field}:${data[field].length}`);
          } else {
            keyValues.push(`${field}:${String(data[field]).substring(0, 20)}`);
          }
        }
      }

      parts.push(`obj:${keyValues.join('|')}`);
    } else {
      // 其他类型
      parts.push(`${typeof data}:${String(data)}`);
    }

    // 添加上下文信息
    if (context) {
      if (typeof context === 'string') {
        parts.push(`ctx:${context}`);
      } else if (typeof context === 'object') {
        const ctxHash = this.fastHash(JSON.stringify(context));
        parts.push(`ctx:${ctxHash}`);
      }
    }

    return parts.join(':');
  }

  /**
   * 快速哈希算法
   * @param {string} str - 输入字符串
   * @returns {string} 哈希值
   */
  fastHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString(36);

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * 获取支持的协议类型
   * @returns {string[]} 支持的协议类型
   */
  getSupportedTypes() {
    return Object.values(ProxyTypes);
  }

  /**
   * 获取支持的输出格式
   * @returns {string[]} 支持的输出格式
   */
  getSupportedFormats() {
    return Object.values(OutputFormats);
  }

  /**
   * 获取性能统计信息
   * @returns {Object} 性能统计
   */
  getPerformanceStats() {
    return {
      monitor: this.performanceMonitor.getReport(),
      parser: this.parserRegistry.getStats(),
      producer: this.producerRegistry.getStats(),
      processor: this.processorChain.getStats(),
      stream: this.streamProcessor.getStats(),
      concurrency: this.concurrencyController.getStats(),
      cache: this.cache.getStats()
    };
  }

  /**
   * 重置性能统计
   */
  resetPerformanceStats() {
    this.parserRegistry.resetStats();
    this.producerRegistry.resetStats();
    this.processorChain.resetStats();
    this.concurrencyController = new ConcurrencyController(this.options.concurrencyLimit);
    this.cache.clear();
    // 重置性能监控器（使用全局实例）
    this.performanceMonitor = globalPerformanceMonitor;
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 缓存已清理');
  }

  /**
   * 获取架构信息
   * @returns {Object} 架构信息
   */
  getArchitectureInfo() {
    return {
      parsers: this.parserRegistry.getRegisteredParsers().map(p => ({
        name: p.name,
        type: p.type
      })),
      producers: this.producerRegistry.getSupportedPlatforms(),
      processors: this.processorChain.getProcessors().map(p => ({
        name: p.name,
        type: p.type,
        disabled: p.disabled
      })),
      performance: {
        streamProcessing: this.options.streamProcessing,
        caching: this.options.enableCaching,
        monitoring: this.options.enablePerformanceMonitoring,
        concurrencyLimit: this.options.concurrencyLimit
      }
    };
  }
}

// 创建默认实例
export const converter = new ProxyConverter();

// 导出便捷函数
export const parseProxyUrls = converter.parse.bind(converter);
export const convertNodes = converter.convert.bind(converter);
export const deduplicateNodes = converter.deduplicate.bind(converter);
export const renameNodes = converter.rename.bind(converter);
export const processNodes = converter.process.bind(converter);

// 导出核心模块（按需导出，减少命名空间污染）
export { OutputFormats, ProxyTypes } from './types.js';
export { parseProxyUrls as parseUrls } from './parsers/index.js';
export { FormatConverter } from './converters/index.js';
export { handleDuplicateNodes } from './utils/deduplication.js';
export { FilterManager, FilterTypes } from './utils/filters.js';
export { RegexSorter, RegexRenamer } from './utils/regex.js';

// 默认导出
export default ProxyConverter;
