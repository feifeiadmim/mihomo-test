/**
 * 解析器注册管理系统
 * 借鉴Sub-Store的ParserRegistry设计，支持插件化解析器管理
 */

/**
 * 解析器基类
 */
export class BaseParser {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }

  /**
   * 测试是否能解析该内容
   * @param {string} content - 要测试的内容
   * @returns {boolean} 是否能解析
   */
  test(content) {
    throw new Error('Parser test method must be implemented');
  }

  /**
   * 解析内容
   * @param {string} content - 要解析的内容
   * @returns {Object[]} 解析后的节点数组
   */
  parse(content) {
    throw new Error('Parser parse method must be implemented');
  }
}

/**
 * 解析器注册管理器
 */
export class ParserRegistry {
  constructor() {
    this.parsers = [];
    this.lastParser = null; // 缓存上次成功的解析器
    this.stats = {
      totalAttempts: 0,
      successfulParses: 0,
      cacheHits: 0
    };
  }

  /**
   * 注册解析器
   * @param {BaseParser} parser - 解析器实例
   */
  register(parser) {
    if (!(parser instanceof BaseParser)) {
      throw new Error('Parser must extend BaseParser');
    }
    
    this.parsers.push(parser);
    console.log(`📝 注册解析器: ${parser.name} (${parser.type})`);
  }

  /**
   * 尝试解析内容
   * @param {string} content - 要解析的内容
   * @returns {Object[]} 解析后的节点数组
   */
  parse(content) {
    this.stats.totalAttempts++;

    if (!content || typeof content !== 'string') {
      throw new Error('Invalid content for parsing');
    }

    // 优先使用上次成功的解析器（性能优化）
    if (this.lastParser && this.tryParse(this.lastParser, content)) {
      this.stats.cacheHits++;
      this.stats.successfulParses++;
      return this.lastParser.parse(content);
    }

    // 遍历所有解析器
    for (const parser of this.parsers) {
      if (parser === this.lastParser) continue; // 跳过已尝试的

      if (this.tryParse(parser, content)) {
        this.lastParser = parser;
        this.stats.successfulParses++;
        return parser.parse(content);
      }
    }

    throw new Error(`No suitable parser found for content type`);
  }

  /**
   * 尝试使用解析器解析
   * @param {BaseParser} parser - 解析器
   * @param {string} content - 内容
   * @returns {boolean} 是否能解析
   */
  tryParse(parser, content) {
    try {
      return parser.test(content);
    } catch (error) {
      console.warn(`⚠️ 解析器 ${parser.name} 测试失败:`, error.message);
      return false;
    }
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalAttempts > 0 ? 
        (this.stats.successfulParses / this.stats.totalAttempts * 100).toFixed(2) + '%' : '0%',
      cacheHitRate: this.stats.totalAttempts > 0 ? 
        (this.stats.cacheHits / this.stats.totalAttempts * 100).toFixed(2) + '%' : '0%'
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulParses: 0,
      cacheHits: 0
    };
  }

  /**
   * 获取所有注册的解析器
   * @returns {BaseParser[]} 解析器数组
   */
  getRegisteredParsers() {
    return [...this.parsers];
  }

  /**
   * 按类型获取解析器
   * @param {string} type - 解析器类型
   * @returns {BaseParser[]} 指定类型的解析器数组
   */
  getParsersByType(type) {
    return this.parsers.filter(parser => parser.type === type);
  }

  /**
   * 清空所有解析器
   */
  clear() {
    this.parsers = [];
    this.lastParser = null;
    this.resetStats();
  }
}

/**
 * VMess解析器
 */
export class VMessParser extends BaseParser {
  constructor() {
    super('VMess Parser', 'vmess');
  }

  test(content) {
    return content.includes('vmess://') || 
           (content.includes('"v"') && content.includes('"ps"'));
  }

  parse(content) {
    const nodes = [];
    
    // 处理vmess://链接
    const vmessLinks = content.match(/vmess:\/\/[A-Za-z0-9+/=]+/g) || [];
    for (const link of vmessLinks) {
      try {
        const decoded = JSON.parse(atob(link.replace('vmess://', '')));
        nodes.push({
          name: decoded.ps || 'VMess节点',
          server: decoded.add,
          port: parseInt(decoded.port),
          type: 'vmess',
          uuid: decoded.id,
          alterId: parseInt(decoded.aid) || 0,
          cipher: decoded.scy || 'auto',
          network: decoded.net || 'tcp',
          tls: decoded.tls === 'tls' ? { enabled: true } : { enabled: false }
        });
      } catch (error) {
        console.warn('⚠️ VMess解析失败:', error.message);
      }
    }

    return nodes;
  }
}

/**
 * Trojan解析器
 */
export class TrojanParser extends BaseParser {
  constructor() {
    super('Trojan Parser', 'trojan');
  }

  test(content) {
    return content.includes('trojan://');
  }

  parse(content) {
    const nodes = [];
    const trojanLinks = content.match(/trojan:\/\/[^\s\n]+/g) || [];
    
    for (const link of trojanLinks) {
      try {
        const url = new URL(link);
        nodes.push({
          name: decodeURIComponent(url.hash.slice(1)) || 'Trojan节点',
          server: url.hostname,
          port: parseInt(url.port) || 443,
          type: 'trojan',
          password: url.username,
          sni: url.searchParams.get('sni') || url.hostname
        });
      } catch (error) {
        console.warn('⚠️ Trojan解析失败:', error.message);
      }
    }

    return nodes;
  }
}

/**
 * Shadowsocks解析器
 */
export class ShadowsocksParser extends BaseParser {
  constructor() {
    super('Shadowsocks Parser', 'ss');
  }

  test(content) {
    return content.includes('ss://');
  }

  parse(content) {
    const nodes = [];
    const ssLinks = content.match(/ss:\/\/[^\s\n]+/g) || [];
    
    for (const link of ssLinks) {
      try {
        const url = new URL(link);
        const auth = atob(url.username);
        const [method, password] = auth.split(':');
        
        nodes.push({
          name: decodeURIComponent(url.hash.slice(1)) || 'SS节点',
          server: url.hostname,
          port: parseInt(url.port),
          type: 'ss',
          method: method,
          password: password
        });
      } catch (error) {
        console.warn('⚠️ SS解析失败:', error.message);
      }
    }

    return nodes;
  }
}

/**
 * Base64订阅解析器
 */
export class Base64Parser extends BaseParser {
  constructor() {
    super('Base64 Parser', 'base64');
    this.subParsers = [
      new VMessParser(),
      new TrojanParser(), 
      new ShadowsocksParser()
    ];
  }

  test(content) {
    // 检查是否为Base64编码
    try {
      const decoded = atob(content.trim());
      return decoded.includes('://') || decoded.includes('"v"');
    } catch {
      return false;
    }
  }

  parse(content) {
    try {
      const decoded = atob(content.trim());
      const lines = decoded.split('\n').filter(line => line.trim());
      
      const allNodes = [];
      for (const line of lines) {
        for (const parser of this.subParsers) {
          if (parser.test(line)) {
            const nodes = parser.parse(line);
            allNodes.push(...nodes);
            break;
          }
        }
      }
      
      return allNodes;
    } catch (error) {
      throw new Error(`Base64解析失败: ${error.message}`);
    }
  }
}

// 创建全局解析器注册表
export const globalParserRegistry = new ParserRegistry();

// 注册默认解析器
globalParserRegistry.register(new VMessParser());
globalParserRegistry.register(new TrojanParser());
globalParserRegistry.register(new ShadowsocksParser());
globalParserRegistry.register(new Base64Parser());
