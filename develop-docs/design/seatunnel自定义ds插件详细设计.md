好的，我们来整合一下你最初的《SeaTunnel Web UI - 作业系统设计规范》和你后续的开发路线决策，为你量身打造一份详细的、面向 **DolphinScheduler 原生插件** 的设计文档。

这份新文档将继承你原有设计的优秀理念，并将其适配到 DolphinScheduler 的插件体系中，作为你接下来开发的行动蓝图。

-----

## **DolphinScheduler-SeaTunnel REST 原生任务插件详细设计文档**

### **1. 概述与目标**

#### **1.1 项目目标**

本项目旨在为 Apache DolphinScheduler (DS) 开发一个原生的 SeaTunnel REST 任务插件。该插件允许用户在 DS 的可视化工作流定义界面中，以一种直观、高效的方式创建、配置和调度 SeaTunnel 数据同步任务，并通过 SeaTunnel Server 提供的 REST 接口提交与管控作业，从而将 SeaTunnel 的数据集成能力无缝融入到企业现有的统一调度平台中。

#### **1.2 设计原则**

  * **原生集成**: 插件应作为 DS 的一等公民，遵循其插件开发规范，无缝集成到 DS 的前后端体系中。
  * **体验优先**: 提供比原生 SeaTunnel UI 更丰富的交互和引导，降低用户配置复杂数据同步任务的门槛。
  * **职责清晰**: 插件专注于 SeaTunnel 任务的“定义”和“执行”，而调度、依赖、告警、权限等能力则完全复用 DolphinScheduler 的现有体系。

### **2. 核心概念释义 (适配 DS 体系)**

为了与 DS 的概念保持一致，我们重新定义以下核心概念：

1.  **任务定义 (Job Definition)**

      * **定义**: 它不再是一个独立的实体，而是指存储在 DolphinScheduler **特定任务节点** 中的 **JSON 配置**。这个 JSON 完整描述了一个 SeaTunnel 任务的 `env`, `source`, `transform`, 和 `sink`。
      * **载体**: DS 工作流定义中的一个“SeaTunnel（REST）”类型的任务节点。

2.  **任务实例 (Job Instance)**

      * **定义**: 指 DolphinScheduler 中一个“SeaTunnel”任务节点的一次**具体执行记录**。
      * **载体**: DS【工作流实例】页面中的一个具体的任务实例。其日志、状态（成功、失败、运行中）、起止时间等均由 DS 进行管理。

### **3. 系统架构设计**

本插件由紧密协作的**后端插件**和**前端组件**两部分构成。

#### **3.1 后端插件 (Java Task Plugin)**

  * **位置**: DolphinScheduler Worker 服务的插件目录。
  * **技术栈**: Java, SPI (Service Provider Interface)。
  * **核心职责**:
    1.  **参数解析**: 接收从 DS Master 传递过来的任务配置 JSON。
    2.  **数据源解析 (运行时)**: 在 Worker 端，根据任务参数中的 `datasourceId`，向 Master 节点请求或在本地解析出完整的数据库连接信息。
    3.  **任务提交**: 调用 SeaTunnel Server 的 `/submit-job` 等 REST API，将任务提交到 SeaTunnel 集群。
    4.  **状态追踪**: 通过轮询机制，使用 SeaTunnel REST API 查询异步任务的实时状态 (RUNNING, FINISHED, FAILED)。
    5.  **日志汇报**: 从 SeaTunnel REST 接口获取任务执行日志，并输出到 DS 的任务日志中。
    6.  **结果上报**: 根据 SeaTunnel 任务的最终状态，向 DS Master 汇报成功或失败。

#### **3.2 前端组件 (Vue UI Component)**

  * **位置**: DolphinScheduler UI 项目的源码中。
  * **技术栈**: Vue 3, Naive UI, Pinia。
  * **核心职责**:
    1.  **提供配置界面**: 当用户在 DAG 画布上双击 SeaTunnel（REST）节点时，渲染一个功能丰富的配置弹窗。
    2.  **引导式配置**: 以可视化的方式引导用户构建 `source`, `transform`, `sink` 流水线。
    3.  **生成配置JSON**: 将用户在界面上的所有配置实时或在保存时，序列化成符合 SeaTunnel 规范的 JSON 字符串。
    4.  **数据持久化**: 将生成的 JSON 传递给 DS，由 DS 负责将其与工作流定义一同保存到数据库。

#### **3.3 数据交互流程**

1.  **[前端]** 用户在 DS 界面的 SeaTunnel（REST）节点配置组件中进行可视化操作。
2.  **[前端]** Vue 组件根据用户操作，生成一份包含 `datasourceId` 的**精简版** SeaTunnel 任务配置 JSON。
3.  **[DS Core]** 用户保存工作流，DS 将此 JSON 作为任务参数，存入数据库。
4.  **[DS Core]** 工作流运行时，DS Master 读取任务参数，并通过 `SeaTunnelRestParameters.getResources()` 方法得知任务依赖的数据源 ID。
5.  **[DS Core]** Master 节点根据数据源 ID，从元数据中查询完整的连接信息，连同其他任务参数一起打包，分发给 Worker。
6.  **[后端]** Worker 上的 SeaTunnel REST 插件被唤醒，接收到包含**完整数据源信息**的参数。
7.  **[后端]** 插件解析参数，调用 SeaTunnel REST API 提交任务。
8.  **[后端]** 插件轮询 SeaTunnel REST API 获取状态和日志，并向 DS Master 汇报。

### **4. 前端组件设计**

前端组件采用 Vue 3 + TypeScript + Naive UI 技术栈，实现可视化配置界面。

**详细设计文档**: 请参考 [`frontend-implementation-design.md`](./frontend-implementation-design.md)

**核心特性**:
- 左右分栏布局（60% 表单 + 40% JSON 预览）
- Tabs 分组（基础配置 + 高级配置）
- 动态连接器管理（Source/Transform/Sink）
- 实时 JSON 预览（Monaco Editor）
- 数据源集成（自动提取 JDBC 连接信息）
- 密码加密显示

### **5. 后端插件详细设计**

#### **5.1 参数模型 (`SeaTunnelRestParameters.java`)**

这是一个 POJO (Plain Old Java Object)，用于反序列化从前端传递过来的 JSON。其结构应与前端 Pinia store 的结构保持一致。建议使用 `Jackson` 或 `Gson` 库进行处理。

```java
public class SeaTunnelRestParameters extends AbstractParameters {
    // 使用 Map<String, Object> 或具体的 POJO
    private Map<String, Object> env;
    private List<Map<String, Object>> source;
    private List<Map<String, Object>> transform;
    private List<Map<String, Object>> sink;
    // ... getters and setters
}
```

#### **5.2 任务主类 (`SeaTunnelRestTask.java`)**

继承自 `AbstractTask`，是插件的核心逻辑实现。

  * **`init()` 方法**: 在任务开始执行时调用，用于初始化任务。核心步骤包括：
    * 1. 反序列化 JSON 参数为 `SeaTunnelRestParameters` 对象。
    * 2. 调用 `parameters.generateExtendedContext()` 方法，传入 Master 准备好的 `ResourceParametersHelper`，生成包含完整运行时配置的 `SeaTunnelRestTaskExecutionContext`。
  * **`handle()` 方法**: 实现核心的“**提交并轮询**”逻辑。
    1.  **获取配置**: 从 `init()` 阶段生成的 `ExecutionContext` 中直接获取已准备好的、完整的 SeaTunnel 配置 Map。
    2.  **提交任务**: 使用 `HttpClient` 调用 SeaTunnel 的 `/submit-job` REST API。获取返回的 `seatunnelJobId`。
    3.  **设置 AppId**: 调用 `setAppIds(seatunnelJobId)`，这样在 DS 的 UI 上就能看到这个外部任务的 ID。
    4.  **进入轮询循环**:
        ```java
        while (true) {
            // 调用 SeaTunnel REST 状态查询 API
            String status = querySeaTunnelJobStatus(seatunnelJobId);
            if ("FINISHED".equals(status)) {
                setExitStatusCode(TaskConstants.EXIT_CODE_SUCCESS);
                break;
            } else if ("FAILED".equals(status) || "CANCELLED".equals(status)) {
                setExitStatusCode(TaskConstants.EXIT_CODE_FAILURE);
                break;
            }
            // 延时，比如 Thread.sleep(10000);
        }
        ```
    5.  **日志处理**: 在轮询过程中或任务结束后，调用 SeaTunnel REST 的日志 API，将关键日志通过 `logger.info()` 输出。

#### **5.3 数据源处理机制 (核心设计)**

本插件严格遵循 DolphinScheduler 的“Master准备资源，Worker使用资源”的设计模式，以实现安全、高效的数据源信息获取。

  * **`SeaTunnelRestParameters.java` (资源声明与处理中心)**
    * **`getResources()`**: 此方法是插件与 Master 节点沟通的桥梁。它负责解析前端传入的精简版 `jobConfig` JSON，提取出所有 `source` 和 `sink` 中配置的 `datasourceId`，并将其注册到 `ResourceParametersHelper` 中。这相当于向 Master 声明：“此任务需要这些数据源的详细信息”。
    * **`generateExtendedContext(ResourceParametersHelper helper)`**: 此方法在 Worker 节点上被调用。它接收一个已经由 Master 填充了数据源信息的 `helper` 对象。方法内部会：
      1. 再次解析 `jobConfig`。
      2. 遍历 `source` 和 `sink`，根据 `datasourceId` 从 `helper` 中取出预先准备好的 `DataSourceParameters`。
      3. 调用 Worker 端的 `DataSourceUtils.buildConnectionParams(dbType, connectionParams)` 将连接参数字符串解析为结构化的 `BaseConnectionParam` 对象。
      4. 将 `BaseConnectionParam` 中的 `url`, `user`, `password` 等信息填充回 `jobConfig` 中，生成一份可以直接提交给 SeaTunnel 引擎的、完整的运行时配置。
      5. 将这份完整配置存入 `SeaTunnelRestTaskExecutionContext` 对象并返回。

  * **`SeaTunnelRestTaskExecutionContext.java` (数据容器)**
    * 这是一个简单的 POJO，其唯一职责就是存放由 `generateExtendedContext` 方法生成的、可以直接提交运行的 `jobConfig` Map。

  * **`SeaTunnelRestTask.java` (任务执行器)**
    * 它的职责被大大简化。在 `init()` 阶段，它只调用 `parameters.generateExtendedContext()` 来获取一个“开箱即用”的上下文。在 `handle()` 阶段，它直接从上下文中取出最终的 `jobConfig` 进行提交，完全不关心数据源信息是如何被查询和填充的。

#### **5.4 SPI 集成**

创建 `SeaTunnelRestTaskChannel` 和 `SeaTunnelRestTaskChannelFactory`，并通过在 `resources/META-INF/services` 中配置，将插件注册到 DS 的任务体系中。

### **6. 开发实施路线图**

**当前状态**: 阶段三已完成，正在进行阶段四（后端重构）

详细的项目计划和任务追踪，请参考 [`project-plan.md`](../plan/project-plan.md)

**已完成阶段**:
- ✅ 阶段一：后端核心逻辑验证（2025-10-10）
- ✅ 阶段二：前后端初步打通（2025-10-13）
- ✅ 阶段三：前端高级功能开发（2025-10-16）

**当前任务**:
- ⏳ 后端数据源逻辑重构（进行中）
- ⏳ Doris Sink 高级选项增强
- ⏳ 端到端测试

---

**文档版本**: v1.3
**创建时间**: 2025-10-10
**最后更新**: 2025-10-20
**变更记录**:
- v1.3 (2025-10-20): 同步项目最新状态，保持版本一致性。
- v1.2 (2025-10-18): 新增并详细阐述了基于“Master准备，Worker使用”模式的后端数据源处理机制。更新了数据交互流程和任务主类的设计描述。
- v1.1 (2025-10-14): 精简前端设计部分，添加链接到详细文档，更新开发路线图
- v1.0 (2025-10-10): 初始版本