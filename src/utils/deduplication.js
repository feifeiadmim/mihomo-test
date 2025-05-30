/**
 * 节点去重工具
 */

/**
 * 节点去重选项
 * @typedef {Object} DeduplicationOptions
 * @property {string} strategy - 去重策略: 'full' (默认: 'full')
 * @property {boolean} keepFirst - 是否保留第一个重复节点
 * @property {boolean} caseSensitive - 名称比较是否区分大小写
 * @property {string} action - 重复处理动作: 'delete' | 'rename' (默认: 'delete')
 * @property {string} template - 重命名模板 (默认: '0 1 2 3 4 5 6 7 8 9')
 * @property {string} link - 连接符 (默认: '-')
 * @property {string} position - 编号位置: 'front' | 'back' (默认: 'back')
 */

/**
 * 去重策略枚举
 */
export const DeduplicationStrategy = {
  FULL: 'full'  // 完全匹配（所有关键字段）
};

/**
 * 重复处理动作枚举
 */
export const DuplicateAction = {
  DELETE: 'delete',  // 删除重复节点
  RENAME: 'rename'   // 重命名重复节点
};

/**
 * 字段标准化映射表
 * 统一不同来源使用的字段名称
 */
const FIELD_MAPPINGS = {
  // 加密方法字段统一
  encryption: ['method', 'cipher', 'encryption'],
  // 认证字段统一
  auth: ['password', 'auth', 'token'],
  // 服务器名称字段统一
  serverName: ['sni', 'serverName', 'server_name', 'host'],
  // 传输协议字段统一
  transport: ['network', 'transport', 'net']
};

/**
 * 标准化字段值
 * @param {any} value - 原始值
 * @param {string} type - 值类型
 * @returns {string|number|boolean} 标准化后的值
 */
function normalizeValue(value, type = 'string') {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'string':
      return String(value).toLowerCase().trim();
    case 'number':
      return Number(value) || 0;
    case 'boolean':
      return Boolean(value);
    case 'domain':
      // 域名标准化：转小写，移除末尾点，处理IDN
      return String(value).toLowerCase().replace(/\.$/, '').trim();
    case 'path':
      // 路径标准化：确保以/开头，移除末尾/
      const path = String(value).trim();
      if (!path) return '';
      return path.startsWith('/') ? path.replace(/\/$/, '') || '/' : '/' + path.replace(/\/$/, '');
    default:
      return String(value);
  }
}

/**
 * 获取标准化字段值
 * @param {Object} node - 节点对象
 * @param {string} fieldName - 字段名称
 * @param {any} defaultValue - 默认值
 * @param {string} type - 值类型
 * @returns {any} 标准化后的字段值
 */
function getStandardizedField(node, fieldName, defaultValue = '', type = 'string') {
  const mappings = FIELD_MAPPINGS[fieldName] || [fieldName];

  for (const mapping of mappings) {
    if (node[mapping] !== undefined && node[mapping] !== null) {
      return normalizeValue(node[mapping], type);
    }
  }

  return normalizeValue(defaultValue, type);
}

/**
 * 生成传输层配置的标准化键
 * @param {Object} node - 节点对象
 * @param {string} network - 网络类型
 * @returns {string[]} 传输层配置键数组
 */
function generateTransportKey(node, network) {
  const transportParts = [];
  const transport = node.transport || {};

  // 根据网络类型处理不同的传输层配置
  switch (network) {
    case 'ws':
    case 'websocket':
      transportParts.push(
        normalizeValue(transport.path || node.path || '', 'path'),
        normalizeValue(transport.host || node.host || '', 'domain')
      );
      // WebSocket Headers处理（转换为稳定的字符串）
      if (transport.headers || node.wsOpts?.headers) {
        const headers = transport.headers || node.wsOpts?.headers || {};
        const sortedHeaders = Object.keys(headers).sort().map(key =>
          `${normalizeValue(key)}:${normalizeValue(headers[key])}`
        ).join('|');
        transportParts.push(sortedHeaders);
      }
      break;

    case 'h2':
    case 'http':
      transportParts.push(
        normalizeValue(transport.path || node.path || '', 'path'),
        normalizeValue(transport.host || node.host || '', 'domain'),
        normalizeValue(transport.method || 'GET')
      );
      break;

    case 'grpc':
      transportParts.push(
        normalizeValue(transport.serviceName || node.serviceName || ''),
        normalizeValue(transport.authority || node.authority || '', 'domain')
      );
      break;

    case 'quic':
      transportParts.push(
        normalizeValue(transport.security || node.security || 'none'),
        normalizeValue(transport.key || node.key || ''),
        normalizeValue(transport.header?.type || node.header?.type || 'none')
      );
      break;
  }

  return transportParts.filter(part => part !== '');
}

/**
 * 节点去重主函数
 * @param {Object[]} nodes - 节点数组
 * @param {DeduplicationOptions} options - 去重选项
 * @returns {Object[]} 去重后的节点数组
 */
export function deduplicateNodes(nodes, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const {
    strategy = DeduplicationStrategy.FULL,
    keepFirst = true,
    caseSensitive = false
  } = options;

  const uniqueNodes = [];
  const seenKeys = new Set();

  for (const node of nodes) {
    const key = generateNodeKey(node, strategy, caseSensitive);

    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueNodes.push(node);
    } else if (!keepFirst) {
      // 如果不保留第一个，则替换已存在的节点
      const existingIndex = uniqueNodes.findIndex(n =>
        generateNodeKey(n, strategy, caseSensitive) === key
      );
      if (existingIndex !== -1) {
        uniqueNodes[existingIndex] = node;
      }
    }
  }

  return uniqueNodes;
}

/**
 * 生成节点的唯一标识键
 * @param {Object} node - 节点信息
 * @param {string} strategy - 去重策略
 * @param {boolean} caseSensitive - 是否区分大小写
 * @returns {string} 唯一标识键
 */
function generateNodeKey(node, strategy, caseSensitive = false) {
  if (!node) return '';

  // 只支持FULL策略
  return generateFullNodeKey(node);
}

/**
 * 生成完整的节点标识键（高精度去重，增强版）
 * @param {Object} node - 节点信息
 * @returns {string} 完整标识键
 */
function generateFullNodeKey(node) {
  const keyParts = [
    normalizeValue(node.server, 'domain'),  // 域名标准化
    normalizeValue(node.port, 'number'),    // 端口标准化
    normalizeValue(node.type)               // 协议类型标准化
  ];

  // 根据协议类型添加特定字段（使用标准化处理）
  switch (normalizeValue(node.type)) {
    case 'ss':
      // SS: 使用标准化字段处理
      keyParts.push(
        getStandardizedField(node, 'auth'),           // 统一password/auth字段
        getStandardizedField(node, 'encryption'),     // 统一method/cipher字段
        normalizeValue(node.plugin || 'none'),
        // 插件选项标准化处理
        node.pluginOpts ? JSON.stringify(node.pluginOpts) : ''
      );
      break;

    case 'ssr':
      // SSR: 使用标准化字段处理
      keyParts.push(
        getStandardizedField(node, 'auth'),           // 统一password/auth字段
        getStandardizedField(node, 'encryption'),     // 统一method/cipher字段
        normalizeValue(node.protocol || 'origin'),
        normalizeValue(node.obfs || 'plain'),
        normalizeValue(node.protocolParam || ''),
        normalizeValue(node.obfsParam || '')
      );
      break;

    case 'vmess':
      // VMess: 增强传输层和TLS处理
      const vmessNetwork = getStandardizedField(node, 'transport', 'tcp');
      keyParts.push(
        normalizeValue(node.uuid),
        normalizeValue(node.alterId || 0, 'number'),
        normalizeValue(node.cipher || node.security || 'auto'),
        vmessNetwork
      );

      // 使用增强的传输层处理
      const vmessTransportParts = generateTransportKey(node, vmessNetwork);
      keyParts.push(...vmessTransportParts);

      // TLS配置标准化
      if (node.tls) {
        keyParts.push(
          node.tls.enabled ? 'tls' : 'notls',
          normalizeValue(node.tls.serverName || '', 'domain'),
          normalizeValue(node.tls.alpn || ''),           // 新增ALPN支持
          normalizeValue(node.tls.fingerprint || '')     // 新增指纹支持
        );
      }
      break;

    case 'vless':
      // VLESS: 增强传输层和Reality/TLS处理
      const vlessNetwork = getStandardizedField(node, 'transport', 'tcp');
      keyParts.push(
        normalizeValue(node.uuid),
        normalizeValue(node.flow || 'none'),
        normalizeValue(node.encryption || 'none'),
        normalizeValue(node.headerType || ''),         // 新增headerType支持
        vlessNetwork
      );

      // 使用增强的传输层处理
      const vlessTransportParts = generateTransportKey(node, vlessNetwork);
      keyParts.push(...vlessTransportParts);

      // Reality配置优先处理
      if (node.reality) {
        keyParts.push(
          'reality',
          normalizeValue(node.reality.publicKey || ''),
          normalizeValue(node.reality.shortId || ''),
          getStandardizedField(node.reality, 'serverName', '', 'domain')
        );
      } else if (node.tls) {
        // TLS配置标准化
        keyParts.push(
          'tls',
          normalizeValue(node.tls.serverName || '', 'domain'),
          normalizeValue(node.tls.alpn || ''),
          normalizeValue(node.tls.fingerprint || '')
        );
      }
      break;

    case 'trojan':
      // Trojan: 增强SNI和传输层处理
      const trojanNetwork = getStandardizedField(node, 'transport', 'tcp');
      keyParts.push(
        getStandardizedField(node, 'auth'),           // 统一password字段
        trojanNetwork,
        getStandardizedField(node, 'serverName', '', 'domain')  // 统一SNI处理
      );

      // 使用增强的传输层处理
      const trojanTransportParts = generateTransportKey(node, trojanNetwork);
      keyParts.push(...trojanTransportParts);

      // TLS配置（Trojan默认使用TLS）
      if (node.tls) {
        keyParts.push(
          normalizeValue(node.tls.serverName || '', 'domain'),
          normalizeValue(node.tls.allowInsecure ? 'insecure' : 'secure'),
          normalizeValue(node.tls.alpn || ''),
          normalizeValue(node.tls.fingerprint || '')
        );
      }
      break;

    case 'hysteria':
      // Hysteria v1: 标准化处理，智能处理带宽配置
      keyParts.push(
        getStandardizedField(node, 'auth'),
        normalizeValue(node.protocol || 'udp'),
        normalizeValue(node.obfs || 'none'),
        getStandardizedField(node, 'serverName', '', 'domain')
        // 注意：故意不包含up/down带宽配置，因为它们通常不影响连接本质
      );
      break;

    case 'hysteria2':
      // Hysteria2: 标准化处理
      keyParts.push(
        getStandardizedField(node, 'auth'),
        getStandardizedField(node, 'serverName', '', 'domain'),
        normalizeValue(node.obfs?.type || 'none'),
        normalizeValue(node.obfs?.password || '')
        // 注意：故意不包含带宽配置
      );
      break;

    case 'tuic':
      // TUIC: 标准化处理
      keyParts.push(
        normalizeValue(node.uuid || ''),
        getStandardizedField(node, 'auth'),
        normalizeValue(node.version || 5, 'number'),
        normalizeValue(node.congestion || 'cubic'),
        normalizeValue(node.udpRelayMode || 'native')
      );
      break;

    case 'snell':
      // Snell: 标准化处理
      keyParts.push(
        getStandardizedField(node, 'auth'),
        normalizeValue(node.version || 'v3'),
        normalizeValue(node.obfs?.type || 'none'),
        normalizeValue(node.obfs?.host || '', 'domain'),
        normalizeValue(node.tls?.enabled ? 'tls' : 'notls')
      );
      break;

    default:
      // 未知协议：使用标准化字段处理
      keyParts.push(
        getStandardizedField(node, 'auth'),
        getStandardizedField(node, 'encryption'),
        normalizeValue(node.uuid || ''),
        getStandardizedField(node, 'transport', 'tcp')
      );
      break;
  }

  return keyParts.filter(part => part !== undefined && part !== null && part !== '').join(':');
}

/**
 * 生成编号字符串
 * @param {number} num - 数字
 * @param {string[]} template - 编号模板
 * @param {number} maxLen - 最大长度
 * @returns {string} 编号字符串
 */
function generateNumber(num, template, maxLen) {
  const str = num.toString();
  let result = '';

  for (const char of str) {
    const index = parseInt(char);
    result += template[index] || char;
  }

  return result.padStart(maxLen, template[0] || '0');
}

/**
 * 处理重复节点（重命名逻辑）
 * @param {Object[]} nodes - 节点数组
 * @param {Object} options - 处理选项
 * @returns {Object[]} 处理后的节点数组
 */
export function handleDuplicateNodes(nodes, options = {}) {
  const {
    action = DuplicateAction.DELETE,
    template = '0 1 2 3 4 5 6 7 8 9',
    link = '-',
    position = 'back'
  } = options;

  if (action === DuplicateAction.DELETE) {
    // 删除重复节点（原有逻辑）
    return deduplicateNodes(nodes, options);
  }

  if (action === DuplicateAction.RENAME) {
    // 重命名重复节点
    const numbers = template.split(' ');
    const counter = {};
    let maxLen = 0;

    // 统计重复次数
    nodes.forEach((node) => {
      const name = node.name || '';
      counter[name] = (counter[name] || 0) + 1;
      maxLen = Math.max(counter[name].toString().length, maxLen);
    });

    const increment = {};
    return nodes.map((node) => {
      const name = node.name || '';

      if (counter[name] > 1) {
        increment[name] = increment[name] || 1;
        const num = generateNumber(increment[name]++, numbers, maxLen);

        const newName = position === 'front' ?
          `${num}${link}${name}` :
          `${name}${link}${num}`;

        return {
          ...node,
          name: newName
        };
      }

      return node;
    });
  }

  return nodes;
}







/**
 * 查找重复的节点
 * @param {Object[]} nodes - 节点数组
 * @param {DeduplicationOptions} options - 查找选项
 * @returns {Object} 重复节点信息
 */
export function findDuplicateNodes(nodes, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return { duplicates: [], groups: [] };
  }

  const {
    strategy = DeduplicationStrategy.FULL,
    caseSensitive = false
  } = options;

  const groups = new Map();
  const duplicates = [];

  // 按键分组
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const key = generateNodeKey(node, strategy, caseSensitive);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push({ node, index: i });
  }

  // 找出重复的组
  const duplicateGroups = [];
  for (const [key, group] of groups.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        key,
        nodes: group,
        count: group.length
      });

      // 除了第一个节点外，其他都是重复的
      duplicates.push(...group.slice(1));
    }
  }

  return {
    duplicates: duplicates.map(item => item.index),
    groups: duplicateGroups,
    totalDuplicates: duplicates.length,
    uniqueCount: groups.size
  };
}

/**
 * 获取去重统计信息
 * @param {Object[]} originalNodes - 原始节点数组
 * @param {Object[]} deduplicatedNodes - 去重后的节点数组
 * @param {DeduplicationOptions} options - 去重选项
 * @returns {Object} 统计信息
 */
export function getDeduplicationStats(originalNodes, deduplicatedNodes, options = {}) {
  const duplicateInfo = findDuplicateNodes(originalNodes, options);

  return {
    original: originalNodes.length,
    deduplicated: deduplicatedNodes.length,
    removed: originalNodes.length - deduplicatedNodes.length,
    duplicateGroups: duplicateInfo.groups.length,
    totalDuplicates: duplicateInfo.totalDuplicates,
    strategy: options.strategy || DeduplicationStrategy.FULL
  };
}



/**
 * 按协议类型分组去重
 * @param {Object[]} nodes - 节点数组
 * @param {DeduplicationOptions} options - 去重选项
 * @returns {Object[]} 去重后的节点数组
 */
export function deduplicateByType(nodes, options = {}) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  // 按协议类型分组
  const typeGroups = new Map();
  for (const node of nodes) {
    const type = node.type || 'unknown';
    if (!typeGroups.has(type)) {
      typeGroups.set(type, []);
    }
    typeGroups.get(type).push(node);
  }

  // 对每个类型分别去重
  const deduplicatedNodes = [];
  for (const [type, typeNodes] of typeGroups.entries()) {
    const deduplicated = deduplicateNodes(typeNodes, options);
    deduplicatedNodes.push(...deduplicated);
  }

  return deduplicatedNodes;
}

/**
 * 自定义去重函数
 * @param {Object[]} nodes - 节点数组
 * @param {Function} keyGenerator - 自定义键生成函数
 * @param {boolean} keepFirst - 是否保留第一个
 * @returns {Object[]} 去重后的节点数组
 */
export function customDeduplicate(nodes, keyGenerator, keepFirst = true) {
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  if (typeof keyGenerator !== 'function') {
    throw new Error('keyGenerator 必须是一个函数');
  }

  const uniqueNodes = [];
  const seenKeys = new Set();

  for (const node of nodes) {
    try {
      const key = keyGenerator(node);

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueNodes.push(node);
      } else if (!keepFirst) {
        const existingIndex = uniqueNodes.findIndex(n => keyGenerator(n) === key);
        if (existingIndex !== -1) {
          uniqueNodes[existingIndex] = node;
        }
      }
    } catch (error) {
      console.error('自定义键生成函数执行失败:', error);
      // 如果键生成失败，保留该节点
      uniqueNodes.push(node);
    }
  }

  return uniqueNodes;
}