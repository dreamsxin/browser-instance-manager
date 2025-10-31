/**
 * @typedef {Object} InstanceInfo
 * @property {string} id 实例ID
 * @property {import('playwright').Browser} browser 浏览器实例
 * @property {import('../modes/BaseMode.js').default} mode 模式处理器
 * @property {string} browserType 浏览器类型
 * @property {string} status 实例状态
 * @property {Date} launchTime 启动时间
 * @property {Date} lastActivity 最后活动时间
 * @property {Object} options 启动选项
 * @property {Object} metrics 指标数据
 * @property {number} metrics.pagesCreated 创建的页面数
 * @property {number} metrics.requestsMade 发出的请求数
 * @property {number} metrics.errors 错误数
 */

/**
 * @typedef {Object} InstanceMetrics
 * @property {number} pagesCreated 创建的页面数
 * @property {number} pagesClosed 关闭的页面数
 * @property {number} requestsMade 发出的请求数
 * @property {number} requestsFailed 失败的请求数
 * @property {number} errors 错误数
 * @property {number} totalMemory 总内存使用量
 * @property {number} averageResponseTime 平均响应时间
 * @property {Date} lastActivity 最后活动时间
 * @property {Object} performance 性能数据
 * @property {number[]} performance.launchTimes 启动时间记录
 * @property {number[]} performance.pageCreationTimes 页面创建时间记录
 * @property {number[]} performance.requestTimes 请求时间记录
 */

/**
 * @typedef {Object} LaunchOptions
 * @property {boolean} [headless] 是否无头模式
 * @property {string[]} [args] 浏览器参数
 * @property {number} [timeout] 超时时间
 * @property {Object} [viewport] 视图端口设置
 * @property {number} viewport.width 宽度
 * @property {number} viewport.height 高度
 * @property {string} [userAgent] 用户代理
 * @property {boolean} [ignoreHTTPSErrors] 是否忽略HTTPS错误
 * @property {boolean} [devtools] 是否打开开发者工具
 * @property {number} [slowMo] 慢动作延迟
 */

/**
 * @typedef {Object} ContextOptions
 * @property {Object} [viewport] 视图端口
 * @property {string} [userAgent] 用户代理
 * @property {boolean} [ignoreHTTPSErrors] 是否忽略HTTPS错误
 * @property {boolean} [javaScriptEnabled] 是否启用JavaScript
 * @property {boolean} [blockImages] 是否阻塞图片
 * @property {Object} [extraHTTPHeaders] 额外的HTTP头
 */

export default {};