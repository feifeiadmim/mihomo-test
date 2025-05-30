/**
 * 字段优先级管理系统
 * 根据字段对连接的重要性进行分级，优化去重精准度
 */

/**
 * 字段重要性等级
 */
export const FieldPriority = {
  CRITICAL: 1,    // 关键字段 - 必须匹配，决定节点身份
  HIGH: 2,        // 高优先级 - 强烈影响连接成功率
  MEDIUM: 3,      // 中优先级 - 影响连接质量和性能
  LOW: 4,         // 低优先级 - 轻微影响，可忽略差异
  IGNORE: 5       // 忽略字段 - 完全不参与去重
};

/**
 * 通用字段优先级配置
 */
const COMMON_FIELD_PRIORITIES = {
  // 基础连接字段 - 关键
  server: FieldPriority.CRITICAL,
  port: FieldPriority.CRITICAL,
  type: FieldPriority.CRITICAL,
  
  // 认证字段 - 关键
  password: FieldPriority.CRITICAL,
  uuid: FieldPriority.CRITICAL,
  username: FieldPriority.CRITICAL,
  
  // 加密和协议字段 - 高优先级
  method: FieldPriority.HIGH,
  cipher: FieldPriority.HIGH,
  encryption: FieldPriority.HIGH,
  
  // 传输层字段 - 高优先级
  network: FieldPriority.HIGH,
  protocol: FieldPriority.HIGH,
  
  // TLS相关字段 - 高优先级
  'tls.enabled': FieldPriority.HIGH,
  'tls.serverName': FieldPriority.HIGH,
  
  // 传输层路径 - 中优先级
  'transport.path': FieldPriority.MEDIUM,
  'transport.host': FieldPriority.MEDIUM,
  'transport.serviceName': FieldPriority.MEDIUM,
  
  // 安全相关 - 中优先级
  'tls.skipCertVerify': FieldPriority.MEDIUM,
  'tls.allowInsecure': FieldPriority.MEDIUM,
  
  // 性能相关字段 - 低优先级
  alterId: FieldPriority.LOW,
  flow: FieldPriority.LOW,
  
  // 带宽和性能 - 忽略
  up: FieldPriority.IGNORE,
  down: FieldPriority.IGNORE,
  bandwidth: FieldPriority.IGNORE,
  
  // 元数据字段 - 忽略
  name: FieldPriority.IGNORE,
  tag: FieldPriority.IGNORE,
  remarks: FieldPriority.IGNORE
};

/**
 * 协议特定字段优先级配置
 */
const PROTOCOL_FIELD_PRIORITIES = {
  ss: {
    // Shadowsocks 特定优先级
    password: FieldPriority.CRITICAL,
    method: FieldPriority.CRITICAL,      // SS的加密方法是关键
    plugin: FieldPriority.HIGH,          // 插件影响连接
    pluginOpts: FieldPriority.MEDIUM,    // 插件选项
    
    // SS特有字段优先级
    obfs: FieldPriority.HIGH,
    obfsParam: FieldPriority.MEDIUM
  },
  
  ssr: {
    // ShadowsocksR 特定优先级
    password: FieldPriority.CRITICAL,
    method: FieldPriority.CRITICAL,
    protocol: FieldPriority.CRITICAL,    // SSR协议是关键
    obfs: FieldPriority.CRITICAL,        // SSR混淆是关键
    
    // SSR参数
    protocolParam: FieldPriority.MEDIUM,
    obfsParam: FieldPriority.MEDIUM
  },
  
  vmess: {
    // VMess 特定优先级
    uuid: FieldPriority.CRITICAL,
    network: FieldPriority.HIGH,         // 传输协议很重要
    
    // VMess特有字段
    alterId: FieldPriority.LOW,          // alterId影响较小
    cipher: FieldPriority.MEDIUM,        // 加密方法中等重要
    
    // 传输层配置
    'transport.path': FieldPriority.HIGH,     // WebSocket路径很重要
    'transport.host': FieldPriority.HIGH,     // Host头很重要
    'transport.serviceName': FieldPriority.HIGH, // gRPC服务名很重要
    
    // TLS配置
    'tls.enabled': FieldPriority.HIGH,
    'tls.serverName': FieldPriority.MEDIUM
  },
  
  vless: {
    // VLESS 特定优先级
    uuid: FieldPriority.CRITICAL,
    encryption: FieldPriority.HIGH,      // VLESS加密设置
    flow: FieldPriority.HIGH,            // VLESS flow控制重要
    network: FieldPriority.HIGH,
    
    // 传输层配置
    'transport.path': FieldPriority.HIGH,
    'transport.host': FieldPriority.HIGH,
    'transport.serviceName': FieldPriority.HIGH,
    
    // Reality配置
    'reality.enabled': FieldPriority.HIGH,
    'reality.publicKey': FieldPriority.CRITICAL,
    'reality.shortId': FieldPriority.MEDIUM
  },
  
  trojan: {
    // Trojan 特定优先级
    password: FieldPriority.CRITICAL,
    network: FieldPriority.HIGH,
    
    // 传输层配置
    'transport.path': FieldPriority.HIGH,
    'transport.host': FieldPriority.HIGH,
    
    // TLS配置（Trojan默认TLS）
    'tls.serverName': FieldPriority.MEDIUM,
    'tls.skipCertVerify': FieldPriority.LOW
  },
  
  hysteria: {
    // Hysteria v1 特定优先级
    password: FieldPriority.CRITICAL,
    auth: FieldPriority.CRITICAL,
    protocol: FieldPriority.HIGH,        // UDP协议设置
    obfs: FieldPriority.HIGH,            // 混淆重要
    
    // 性能相关 - 忽略
    up: FieldPriority.IGNORE,
    down: FieldPriority.IGNORE,
    
    // TLS配置
    'tls.serverName': FieldPriority.MEDIUM,
    'tls.skipCertVerify': FieldPriority.LOW
  },
  
  hysteria2: {
    // Hysteria2 特定优先级
    password: FieldPriority.CRITICAL,
    auth: FieldPriority.CRITICAL,
    
    // 混淆配置
    'obfs.type': FieldPriority.HIGH,
    'obfs.password': FieldPriority.HIGH,
    
    // 性能相关 - 忽略
    up: FieldPriority.IGNORE,
    down: FieldPriority.IGNORE,
    bandwidth: FieldPriority.IGNORE,
    
    // TLS配置
    'tls.serverName': FieldPriority.MEDIUM
  },
  
  tuic: {
    // TUIC 特定优先级
    uuid: FieldPriority.CRITICAL,
    password: FieldPriority.CRITICAL,
    version: FieldPriority.HIGH,         // TUIC版本重要
    
    // 连接配置
    congestion: FieldPriority.MEDIUM,    // 拥塞控制中等重要
    udpRelayMode: FieldPriority.MEDIUM,  // UDP中继模式
    
    // 性能相关
    heartbeat: FieldPriority.LOW,
    reduceRtt: FieldPriority.LOW,
    
    // TLS配置
    'tls.serverName': FieldPriority.MEDIUM,
    'tls.skipCertVerify': FieldPriority.LOW
  },
  
  snell: {
    // Snell 特定优先级
    password: FieldPriority.CRITICAL,
    version: FieldPriority.HIGH,         // Snell版本重要
    
    // 混淆配置
    'obfs.type': FieldPriority.HIGH,
    'obfs.host': FieldPriority.MEDIUM,
    
    // TLS配置
    'tls.enabled': FieldPriority.HIGH,
    'tls.serverName': FieldPriority.MEDIUM
  }
};

/**
 * 获取字段的优先级
 * @param {string} fieldPath - 字段路径
 * @param {string} protocol - 协议类型
 * @returns {number} 字段优先级
 */
export function getFieldPriority(fieldPath, protocol = null) {
  // 1. 首先检查协议特定配置
  if (protocol && PROTOCOL_FIELD_PRIORITIES[protocol]) {
    const protocolPriorities = PROTOCOL_FIELD_PRIORITIES[protocol];
    if (fieldPath in protocolPriorities) {
      return protocolPriorities[fieldPath];
    }
  }
  
  // 2. 检查通用字段配置
  if (fieldPath in COMMON_FIELD_PRIORITIES) {
    return COMMON_FIELD_PRIORITIES[fieldPath];
  }
  
  // 3. 根据字段名称模式推断优先级
  if (fieldPath.includes('password') || fieldPath.includes('uuid') || fieldPath.includes('auth')) {
    return FieldPriority.CRITICAL;
  }
  
  if (fieldPath.includes('tls') || fieldPath.includes('transport') || fieldPath.includes('network')) {
    return FieldPriority.HIGH;
  }
  
  if (fieldPath.includes('obfs') || fieldPath.includes('cipher') || fieldPath.includes('method')) {
    return FieldPriority.HIGH;
  }
  
  if (fieldPath.includes('bandwidth') || fieldPath.includes('speed') || fieldPath.includes('name')) {
    return FieldPriority.IGNORE;
  }
  
  // 4. 默认为中等优先级
  return FieldPriority.MEDIUM;
}

/**
 * 根据优先级过滤字段
 * @param {Object} node - 节点对象
 * @param {number} maxPriority - 最大优先级（包含）
 * @returns {Array} 符合优先级的字段路径列表
 */
export function getFieldsByPriority(node, maxPriority = FieldPriority.MEDIUM) {
  const fields = [];
  const protocol = node.type;
  
  // 递归获取所有字段路径
  function getFieldPaths(obj, prefix = '') {
    const paths = [];
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      paths.push(fullPath);
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...getFieldPaths(value, fullPath));
      }
    }
    return paths;
  }
  
  const allPaths = getFieldPaths(node);
  
  // 过滤符合优先级的字段
  for (const path of allPaths) {
    const priority = getFieldPriority(path, protocol);
    if (priority <= maxPriority) {
      fields.push({
        path,
        priority,
        value: getNestedValue(node, path)
      });
    }
  }
  
  // 按优先级排序
  return fields.sort((a, b) => a.priority - b.priority);
}

/**
 * 获取嵌套对象的值
 * @param {Object} obj - 对象
 * @param {string} path - 字段路径
 * @returns {any} 字段值
 */
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let value = obj;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * 生成基于优先级的去重键
 * @param {Object} node - 节点对象
 * @param {number} maxPriority - 最大优先级
 * @returns {string} 去重键
 */
export function generatePriorityBasedKey(node, maxPriority = FieldPriority.MEDIUM) {
  const priorityFields = getFieldsByPriority(node, maxPriority);
  
  const keyParts = priorityFields.map(field => {
    const value = field.value;
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  });
  
  return keyParts.join(':');
}
