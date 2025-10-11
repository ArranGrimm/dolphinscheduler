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
    2.  **任务提交**: 调用 SeaTunnel Server 的 `/submit-job` 等 REST API，将任务提交到 SeaTunnel 集群。
    3.  **状态追踪**: 通过轮询机制，使用 SeaTunnel REST API 查询异步任务的实时状态 (RUNNING, FINISHED, FAILED)。
    4.  **日志汇报**: 从 SeaTunnel REST 接口获取任务执行日志，并输出到 DS 的任务日志中。
    5.  **结果上报**: 根据 SeaTunnel 任务的最终状态，向 DS Master 汇报成功或失败。

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
2.  **[前端]** Vue 组件根据用户操作，生成一份完整的 SeaTunnel 任务配置 JSON。
3.  **[DS Core]** 用户保存工作流，DS 将此 JSON 作为任务参数，存入数据库。
4.  **[DS Core]** 工作流运行时，DS Master 将该任务及参数(JSON)分发给 Worker。
5.  **[后端]** Worker 上的 SeaTunnel REST 插件被唤醒，接收到这份 JSON。
6.  **[后端]** 插件解析 JSON，调用 SeaTunnel REST API 提交任务。
7.  **[后端]** 插件轮询 SeaTunnel REST API 获取状态和日志，并向 DS Master 汇报。

### **4. 前端组件详细设计 (`SeaTunnelRestNode.vue`)**

本节详细定义 SeaTunnel REST 任务节点的配置弹窗组件，它将是你放弃 React Demo 后，用 Vue 重写的核心。

#### **4.1 技术选型**

  * **UI 库**: `Naive UI` (与 DS 保持一致)。
  * **状态管理**: `Pinia` (用于管理复杂的表单状态)。
  * **代码编辑器**: `Monaco Editor` (用于 SQL 等代码片段的编写)。

#### **4.2 UI 布局与核心功能**

采用左右分栏布局，完全复刻你原有设计中的精华。

  * **左侧 (PipelineBuilder)**: 可视化流水线构建区域。
      * **Env 配置**: 一个独立的卡片，用于配置 `job.name` 等环境参数。
      * **Source/Transform/Sink 区域**: 三个独立的列表区域，用户可以点击“+”号从预设的连接器列表中选择并添加配置卡片。
  * **右侧 (ConfigPreview)**: 只读的 JSON 预览区域，实时根据左侧的表单变化，生成并美化展示最终将提交的 JSON 配置，方便用户调试和确认。

#### **4.3 组件拆分方案**

  * **`SeaTunnelRestNode.vue`**: 根组件，负责整体布局、弹窗的显示/隐藏逻辑，以及与 DS 的数据交互（加载/保存 JSON）。
  * **`PipelineBuilder.vue`**: 左侧流水线构建器，管理三个 `ConnectorListView`。
  * **`ConnectorListView.vue`**: 连接器列表，负责管理一个阶段（Source/Transform/Sink）的所有连接器卡片，处理添加、删除、排序逻辑。
  * **`ConnectorCard.vue`**: 单个连接器配置卡片，包含标题、操作按钮（删除、折叠），并动态加载核心表单。
  * **`DynamicConnectorForm.vue`**: **核心动态表单组件**。它接收一个预定义的 Schema（描述了连接器有哪些参数、类型、标签、默认值等），然后动态渲染出对应的 `Naive UI` 表单项。表单项通过 `n-collapse` 或 `n-tabs` 分为“基础”和“高级”选项。

#### **4.4 状态管理 (Pinia)**

创建一个 `useSeaTunnelRestNodeStore`，其 state 结构严格映射最终的 SeaTunnel JSON 结构，例如：

```typescript
{
  env: { 'job.name': 'default_job' },
  source: [/* an array of source connector configs */],
  transform: [/* ... */],
  sink: [/* ... */]
}
```

所有表单组件都通过这个 store 进行数据的双向绑定，确保数据源的唯一和一致性。

### **5. 后端插件详细设计 (Java)**

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

  * **`init()` 方法**: 在任务开始执行时调用，用于初始化任务，最重要的是**反序列化 JSON 参数**。
    ```java
    @Override
    public void init() {
        this.parameters = JSONUtils.parseObject(taskProps.getTaskParams(), SeaTunnelRestParameters.class);
        // ...
    }
    ```
  * **`handle()` 方法**: 实现核心的“**提交并轮询**”逻辑。
    1.  **构建 Payload**: 从 `this.parameters` 中构建出将要提交给 SeaTunnel API 的完整 JSON Body。
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

#### **5.3 SPI 集成**

创建 `SeaTunnelRestTaskChannel` 和 `SeaTunnelRestTaskChannelFactory`，并通过在 `resources/META-INF/services` 中配置，将插件注册到 DS 的任务体系中。

### **6. 开发实施路线图**

建议采用分阶段、由后到前的策略进行开发：

1.  **阶段一：后端核心逻辑验证**

      * **任务**: 开发基础的 `SeaTunnelRestTask.java`。在代码中硬编码一个可执行的 SeaTunnel 配置 JSON。
      * **目标**: 跑通“提交任务 -\> 轮询状态 -\> 正确返回成功/失败”的核心流程。确保与 SeaTunnel API 的交互没有问题。

2.  **阶段二：前后端初步打通**

      * **任务**:
          * 后端：实现 `SeaTunnelRestParameters.java` 和参数反序列化逻辑。
          * 前端：在 DS UI 中创建最简单的 `SeaTunnelRestNode.vue`，只包含一个 `textarea`。
      * **目标**: 能够在前端 `textarea` 中粘贴完整的 JSON，保存后，后端插件能正确接收并执行。

3.  **阶段三：前端富交互界面开发**

      * **任务**: 集中精力开发 `SeaTunnelRestNode.vue` 及其子组件，实现设计稿中的所有可视化配置功能。
      * **目标**: 交付一个用户体验优秀的配置界面，它能正确地生成符合预期的 JSON 字符串。

4.  **阶段四：端到端集成与优化**

      * **任务**: 联调前后端，修复 Bug，优化体验。
      * **目标**: 交付一个功能完整、稳定可靠的 SeaTunnel 原生任务插件。
      * **可选优化**: 实现前端动态获取可选的连接器列表、从 DS 数据源中心获取连接信息等高级功能。

-----

这份文档结合了你的远见和集成的现实，希望能为你接下来的开发工作提供清晰的指引。祝你开发顺利！