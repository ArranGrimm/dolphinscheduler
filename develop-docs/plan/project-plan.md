# SeaTunnel REST 插件项目计划

## 📌 项目概述

为 Apache DolphinScheduler 开发原生的 SeaTunnel REST 任务插件，实现通过 DolphinScheduler 调度平台提交和管控 SeaTunnel 数据同步任务。

**核心技术栈**:
- 后端: Java + SPI + HttpClient
- 前端: Vue 3 + TypeScript + Naive UI
- API: SeaTunnel REST API v2

---

## 一、开发阶段回顾

### ✅ 阶段一：后端插件骨架（已完成 - 2025-10-10）

**核心成果**:
- ✅ 创建 `dolphinscheduler-task-seatunnel-rest` 模块
- ✅ 实现 `SeaTunnelRestParameters`（参数模型）
- ✅ 实现 `SeaTunnelRestTask`（任务执行核心，333行）
- ✅ 实现提交/轮询/取消逻辑
- ✅ 使用 REST API v2 接口

**文件清单**:
- `SeaTunnelRestParameters.java` - 参数模型
- `SeaTunnelRestTask.java` - 任务执行主类
- `SeaTunnelRestTaskChannel.java` - 任务通道
- `SeaTunnelRestTaskChannelFactory.java` - SPI 工厂
- `SeaTunnelRestTaskException.java` - 自定义异常

### ✅ 阶段二：SPI 与运行期集成（已完成 - 2025-10-10）

**核心成果**:
- ✅ 编写 `SeaTunnelRestTaskChannel` 与 Factory
- ✅ 注册到 `META-INF/services/`
- ✅ 添加到 `dolphinscheduler-task-all` 打包依赖
- ✅ 编写单元测试和 Mock 测试
- ✅ 编写集成测试（环境变量配置）

**测试覆盖**:
- 参数验证测试
- HTTP 交互 Mock 测试（MockWebServer）
- 真实场景测试（FakeSource + JDBC Oracle）

### ✅ 阶段三：前端最小可用配置（已完成 - 2025-10-13）

**核心成果**:
- ✅ 创建 `use-seatunnel-rest.ts` 任务定义
- ✅ 创建字段定义（REST endpoint、Job Config、超时配置）
- ✅ 注册任务类型到 `task-type.ts`
- ✅ 实现 `format-data.ts` 数据映射
- ✅ 添加中英文国际化文本
- ✅ 端到端测试成功（FakeSource）

**关键修复**:
- Vite 配置环境变量加载问题
- `ui-setting` 路由重名冲突
- 创建 `.env.development` 配置

### 🔄 阶段四：前端高级表单与交互（进行中 - 2025-10-14）

**核心成果**:
- ✅ 创建自定义表单组件（task-forms/seatunnel-rest/）
- ✅ 实现 Tabs 分组（基础配置 + 高级配置）
- ✅ 实现 Source 连接器动态选择（简化版）
  - 集成 DS 数据源 API
  - 自动提取 JDBC 连接信息
  - 实时 JSON 预览（Monaco Editor）
  - 密码加密显示
- ✅ 实现左右分栏布局（60% 表单 + 40% JSON 预览）
- ✅ 修复布局和动画问题

**Source 简化设计**（基于实际使用反馈）:
- ❌ 移除数据源类型选择（自动推断）
- ✅ 保留数据源选择（核心功能）
- ❌ 移除查询模式选择（只保留 SQL）
- ❌ 移除数据库/表选择（由 SQL 决定）
- ✅ 保留 SQL 查询（核心功能）
- 📝 "输出表名" 改为 "Plugin Output"

**待完成**:
- ⏳ Sink 连接器动态选择（POSTGRESQL + ORACLE + DORIS）
- ⏳ Transform 支持
- ⏳ 完善表单验证

---

## 二、当前任务清单（优先级排序）

### 🎯 Phase 1: 前端功能完善（高优先级）

#### 1. ✅ Source 连接器（已完成）
- 数据源下拉选择
- 自动提取 JDBC 连接信息
- SQL 查询输入
- Plugin Output 配置

#### 2. ⏳ Sink 连接器（进行中）
**目标**: 支持 POSTGRESQL + ORACLE + DORIS 三种数据源

**JDBC Sink（PostgreSQL + Oracle）**:
- 数据源选择
- 自动提取连接信息
- 表名配置
- Primary Keys（CDC 场景）
- Plugin Input 关联

**Doris Sink**:
- 特殊处理：从 DS 数据源 JDBC URL 提取 fenodes
- 端口转换：9030 → 8030（Stream Load HTTP 端口）
- 数据库/表配置
- 用户名/密码
- Plugin Input 关联

**实现参考**:
```typescript
// Doris 端口转换逻辑
const jdbcUrl = "jdbc:mysql://192.168.1.100:9030/test"
const parsedUrl = parseJdbcUrl(jdbcUrl)
const fenodes = `${parsedUrl.host}:8030`  // 9030 → 8030
```

#### 3. ⏳ Transform 支持
- SQL Transform 配置
- Plugin Input/Output 关联
- SQL 编辑器（Monaco）

#### 4. ⏳ 完善表单验证
- 必填项校验
- 自定义规则（URL 格式、Plugin Input/Output 关联）
- 友好错误提示

---

### 🔧 Phase 2: 后端代码优化（中优先级）

根据 Code Review 建议，需要进行以下优化以提升生产级稳定性：

#### 1. ⏳ HTTP 客户端和 ObjectMapper 复用（性能优化）

**问题**: 
- 在 `pollJobStatus()` 循环中反复创建 `CloseableHttpClient` 和 `ObjectMapper`
- 这些是重量级对象，初始化涉及资源分配和类加载

**解决方案**:
```java
@Slf4j
public class SeaTunnelRestTask extends AbstractRemoteTask {
    private CloseableHttpClient httpClient;
    private static final ObjectMapper MAPPER = new ObjectMapper(); // 静态常量
    
    @Override
    public void init() {
        // 在 init 方法中创建 HttpClient 实例
        this.httpClient = createHttpClient();
    }
    
    // 在 submitJob() 和 pollJobStatus() 中复用 this.httpClient 和 MAPPER
}
```

**影响文件**: `SeaTunnelRestTask.java`

#### 2. ⏳ 轮询逻辑的健壮性增强

**问题**:
- `while(true)` 循环在某些边缘情况下可能永远无法退出
- 无超时机制：SeaTunnel 服务故障时可能无限期运行
- 连续失败处理不足：网络持续中断会导致无限轮询

**解决方案**:
```java
// 1. 增加轮询超时
long startTime = System.currentTimeMillis();
long maxRuntime = 3 * 24 * 60 * 60 * 1000; // 3天

// 2. 增加连续失败计数器
int failureCount = 0;
int maxFailures = 10;

while (true) {
    // 超时检查
    if (System.currentTimeMillis() - startTime > maxRuntime) {
        throw new SeaTunnelRestTaskException("Task exceeded maximum runtime");
    }
    
    try {
        // 查询状态
        // ...
        failureCount = 0; // 成功后重置计数器
    } catch (Exception e) {
        failureCount++;
        if (failureCount > maxFailures) {
            throw new SeaTunnelRestTaskException("Too many consecutive failures");
        }
    }
}
```

**影响文件**: `SeaTunnelRestTask.java`

#### 3. ⏳ 状态字符串硬编码问题（可维护性）

**问题**:
- 直接使用 `"FINISHED"`, `"FAILED"`, `"CANCELED"` 等魔法字符串
- 容易因拼写错误导致 Bug

**解决方案**:
```java
public enum SeaTunnelJobStatus {
    FINISHED,
    FAILED,
    CANCELED,
    CANCELLED, // 兼容两种拼写
    RUNNING,
    UNKNOWN;
    
    public static SeaTunnelJobStatus of(String status) {
        for (SeaTunnelJobStatus jobStatus : values()) {
            if (jobStatus.name().equalsIgnoreCase(status)) {
                return jobStatus;
            }
        }
        return UNKNOWN;
    }
}

// 在 pollJobStatus 中使用
SeaTunnelJobStatus status = SeaTunnelJobStatus.of(jobStatusStr);
switch (status) {
    case FINISHED:
        setExitStatusCode(TaskConstants.EXIT_CODE_SUCCESS);
        break;
    // ...
}
```

**影响文件**: 新建 `SeaTunnelJobStatus.java` + 修改 `SeaTunnelRestTask.java`

#### 4. ⏳ JSON 解析的空指针安全检查

**问题**:
- `jsonNode.get("jobId")` 如果不存在会返回 `null`
- 接着调用 `.asText()` 会导致 `NullPointerException`

**解决方案**:
```java
// 方式1: 使用 .has() 检查
if (!jsonNode.has("jobId")) {
    throw new SeaTunnelRestTaskException("JobId not found in response: " + responseBody);
}
String jobId = jsonNode.get("jobId").asText();

// 方式2: 使用 .path()（推荐）
String jobStatus = jsonNode.path("jobStatus").asText(); 
if (StringUtils.isEmpty(jobStatus)) {
    // 处理状态不存在的情况
}
```

**影响文件**: `SeaTunnelRestTask.java`

---

### 🧪 Phase 3: 测试与验证（中优先级）

#### 1. ⏳ 任务 Kill 功能端到端测试

**测试步骤**:
1. 运行一个需要较长时间的 SeaTunnel 任务
2. 在 DolphinScheduler 工作流实例页面点击"停止"
3. 观察任务日志，确认 `cancelApplication()` 被调用
4. 检查 SeaTunnel 端任务是否真的被取消

#### 2. ⏳ 边界条件与异常处理测试

**测试场景**:
- **无效输入**: 格式错误的 URL、非 JSON 字符串
- **外部服务异常**: SeaTunnel API 无法访问、返回 500 错误、非预期 JSON
- **任务快速失败/成功**: 立刻失败或成功的任务，插件能否迅速捕捉

---

### 📚 Phase 4: 文档与交付（低优先级）

#### 1. ⏳ 撰写部署与配置文档（面向运维人员）

**内容**:
- 如何构建包含插件的自定义 Docker 镜像（API, Worker, Master）
- `values.yaml` 配置示例（Helm Chart）
- 新配置项说明

#### 2. ⏳ 撰写用户使用手册（面向数据工程师）

**内容**:
- 带截图的分步指南
- 参数字段详细说明
- 常见配置示例（如"MySQL 到 Doris 数据同步"）

#### 3. ⏳ 更新项目状态文档

**内容**:
- 更新 `progress.md`
- 标记完成的 todos
- 准备功能演示

---

## 三、后端优化优先级评估

### 🔴 高优先级（建议立即采纳）

1. **HttpClient 和 ObjectMapper 复用** - 直接提升性能
2. **JSON 解析空指针检查** - 避免运行时崩溃

### 🟡 中优先级（建议近期完成）

3. **轮询超时机制** - 防止任务无限期运行
4. **状态枚举类** - 提升代码可维护性

### 🟢 低优先级（可选优化）

5. 日志截断/分页
6. 轮询退避策略

---

## 四、项目里程碑

| 里程碑 | 完成时间 | 状态 |
|--------|---------|------|
| 后端插件骨架 | 2025-10-10 | ✅ 完成 |
| SPI 注册与测试 | 2025-10-10 | ✅ 完成 |
| 前端最小可用配置 | 2025-10-13 | ✅ 完成 |
| 端到端联调成功 | 2025-10-13 | ✅ 完成 |
| Source 连接器（简化版） | 2025-10-14 | ✅ 完成 |
| Sink 连接器 | TBD | ⏳ 进行中 |
| Transform 支持 | TBD | 📋 待启动 |
| 后端优化 | TBD | 📋 待启动 |
| 完整测试 | TBD | 📋 待启动 |
| 文档交付 | TBD | 📋 待启动 |

---

## 五、技术决策记录

### 决策 1: 选择 Zeppelin 作为参考模板
**时间**: 2025-10-10  
**原因**: 
- Zeppelin 插件同样采用 REST API 交互
- 有完整的异步任务提交与轮询机制
- 代码结构清晰，易于理解和改造

### 决策 2: 支持两种配置方式
**时间**: 2025-10-10  
**原因**:
- **JSON 字符串方式**: 适合高级用户，灵活度高
- **结构化配置方式**: 适合前端可视化组件，便于表单验证

### 决策 3: 采用轮询而非 WebSocket
**时间**: 2025-10-10  
**原因**:
- SeaTunnel REST API v2 主要提供 HTTP 接口
- 轮询方式实现简单，可靠性高
- 符合 DolphinScheduler 其他远程任务插件的实现惯例

### 决策 4: 使用 SeaTunnel REST API v2
**时间**: 2025-10-10  
**原因**:
- v1 接口 (`/hazelcast/rest/maps/*`) 已淘汰
- v2 接口更简洁：`/submit-job`、`/job-info/:jobId`、`/stop-job`
- 符合 SeaTunnel 官方文档推荐

### 决策 5: 简化 Source 连接器配置
**时间**: 2025-10-14  
**原因**（基于实际使用反馈）:
- Oracle/PG 都用 Jdbc 连接器，无需用户选择类型
- SQL 模式比 Table 模式更可控，SeaTunnel 自动生成的 SQL 可能有问题
- 数据库/表可从数据源 URL 和 SQL 自动解析

---

## 六、下一步行动

### 🎯 立即执行（本周）

1. **实现 Sink 连接器**
   - JDBC Sink（PostgreSQL + Oracle）
   - Doris Sink（特殊处理 fenodes + 端口转换）

2. **实现 Transform 支持**
   - SQL Transform 配置
   - Plugin Input/Output 关联

### 📅 近期计划（本月）

3. **后端代码优化**
   - HttpClient 复用（高优先级）
   - JSON 解析安全检查（高优先级）
   - 轮询超时机制（中优先级）

4. **端到端测试**
   - Kill 功能测试
   - 边界条件测试

### 🔜 后续计划

5. **文档编写**
   - 部署配置文档
   - 用户使用手册

6. **项目交付**
   - 更新进度文档
   - 准备演示

---

**文档版本**: v1.0  
**创建时间**: 2025-10-14  
**最后更新**: 2025-10-14

