/**
 * 代理节点转换工具主入口
 */

// 首先导入兼容性修复
import './utils/index.js';

import { parseProxyUrls as parseUrls, generateProxyUrls, parseBase64Subscription } from './parsers/index.js';
import { FormatConverter } from './converters/index.js';
import { deduplicateNodes as deduplicateNodesUtil, handleDuplicateNodes } from './utils/deduplication.js';
import { FilterManager, regionFilter, typeFilter, regexFilter, uselessFilter, FilterTypes } from './utils/filters.js';
import { buildRegex, RegexSorter, RegexRenamer } from './utils/regex.js';
import { globalParserRegistry } from './core/parser-registry.js';
import { ProcessorChain, FilterProcessor, DeduplicationProcessor, SortProcessor, RenameProcessor } from './core/processor-chain.js';
import { globalProducerRegistry } from './core/producer-registry.js';
import { StreamProcessor, ConcurrencyController, ResourceCache, PerformanceMonitor } from './utils/performance.js';
import { renameNodes as renameNodesUtil, detectRegion } from './utils/rename.js';
import { OutputFormats, ProxyTypes } from './types.js';

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
      ...options
    };

    // 初始化新架构组件
    this.parserRegistry = globalParserRegistry;
    this.producerRegistry = globalProducerRegistry;
    this.processorChain = new ProcessorChain();

    // 性能优化组件
    this.streamProcessor = new StreamProcessor();
    this.concurrencyController = new ConcurrencyController(this.options.concurrencyLimit);
    this.cache = new ResourceCache();
    this.performanceMonitor = new PerformanceMonitor();
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

      // 检查缓存
      if (this.options.enableCaching) {
        const cacheKey = `parse:${JSON.stringify({ input: typeof input === 'string' ? input.substring(0, 100) : input, format })}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.log('🎯 使用缓存结果');
          return cached;
        }
      }

      // 使用新的解析器注册表
      const nodes = this.parserRegistry.parse(input);

      // 缓存结果
      if (this.options.enableCaching && nodes.length > 0) {
        const cacheKey = `parse:${JSON.stringify({ input: typeof input === 'string' ? input.substring(0, 100) : input, format })}`;
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
      // 检查缓存
      if (this.options.enableCaching) {
        const cacheKey = `produce:${platform}:${JSON.stringify(nodes.slice(0, 5))}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
          console.log('🎯 使用生产缓存结果');
          return cached;
        }
      }

      // 使用新的生产器注册表
      const result = this.producerRegistry.produce(nodes, platform, options);

      // 缓存结果
      if (this.options.enableCaching && result) {
        const cacheKey = `produce:${platform}:${JSON.stringify(nodes.slice(0, 5))}`;
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
   * 流式处理大量节点 (性能优化)
   * @param {Object[]} nodes - 节点数组
   * @param {Function} processor - 处理函数
   * @param {Object} options - 选项
   * @returns {Promise<Object[]>} 处理后的节点数组
   */
  async processLargeDataset(nodes, processor, options = {}) {
    if (!this.options.streamProcessing || nodes.length < 1000) {
      // 小数据集直接处理
      return await processor(nodes);
    }

    const endMonitor = this.performanceMonitor.startOperation('streamProcess');

    try {
      console.log(`🌊 启用流式处理，节点数量: ${nodes.length}`);

      const result = await this.streamProcessor.processLargeDataset(
        nodes,
        processor,
        {
          ...options,
          progressCallback: (progress) => {
            console.log(`📊 处理进度: ${progress.percentage}% (${progress.current}/${progress.total})`);
          }
        }
      );

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

      // 统计地区
      const region = detectRegion(node.name, node.server);
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
    this.performanceMonitor = new PerformanceMonitor();
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

// 导出所有模块
export * from './parsers/index.js';
export * from './converters/index.js';
export * from './utils/index.js';
export * from './types.js';

// 默认导出
export default ProxyConverter;
