<!-- e001c1a9-67eb-40a7-9c66-f40215eb56ee fd923b86-efbd-49f3-b4d1-0cb217547fbb -->
# DolphinScheduler SeaTunnel 插件实施计划

## 阶段一：后端插件骨架

- 在 `dolphinscheduler-task-plugin` 内新建 `dolphinscheduler-task-seatunnel-rest` 模块，复制 `pom.xml` 依赖结构并按需精简，确保打包后可被 Worker 自动扫描。
- 定义 `SeaTunnelRestParameters`（继承 `AbstractParameters`），映射 `env/source/transform/sink` 结构，放置于 `org.apache.dolphinscheduler.plugin.task.seatunnel.rest.params`。
- 实现 `SeaTunnelRestTask`（继承 `AbstractTask`），拆分 `init/handle/cancel`，在 `handle` 中准备提交 JSON、调用 `/submit-job` 接口并轮询状态；引入可配置的 `SeaTunnelRestApiClient`，集中处理 HTTP、超时与错误重试。

## 阶段二：SPI 与运行期集成

- 编写 `SeaTunnelRestTaskChannel` 与 `SeaTunnelRestTaskChannelFactory`，注册至 `resources/META-INF/services/org.apache.dolphinscheduler.plugin.task.api.TaskChannelFactory`。
- 在 `dolphinscheduler-task-plugin` 的根 `pom.xml` 与上级聚合 `pom.xml` 添加新模块引用，更新 `dolphinscheduler-dist` 相关打包脚本以包含插件。
- 提供基础单元测试（Mock SeaTunnel REST API），覆盖参数校验、任务提交成功/失败、取消逻辑，并在 `dolphinscheduler-standalone-server` 中通过本地配置验证 Worker 加载流程。

## 阶段三：前端最小可用配置

- 在 `dolphinscheduler-ui/src/views/projects/task/components/task-seatunnel-rest` 创建 `SeaTunnelRestNode.vue`，复用 DS 任务弹窗框架，实现 JSON 文本域输入/预览，并与后端参数字段对齐。
- 将新任务类型注册到前端路由与任务类型常量中（如 `task-type.ts`、`taskNodes/index.ts`），确保 DAG 画布可添加 SeaTunnel（REST）节点。
- 通过接口联调确认前端保存/加载 JSON 正常，Worker 能执行硬编码模板任务。

## 阶段四：前端高级表单与交互

- 引入 Pinia Store（`useSeaTunnelRestNodeStore.ts`），统一管理 `env/source/transform/sink` 状态，确保序列化一致。
- 实现组件拆分：`PipelineBuilder.vue`、`ConnectorListView.vue`、`ConnectorCard.vue`、`DynamicConnectorForm.vue`，支持添加/删除/排序连接器，实时同步 JSON 预览（采用 Monaco Editor 格式化展示）。
- 对接 DS 数据源中心（如需），封装连接器 Schema 元数据，以配置驱动渲染；补充表单校验与交互提示。

## 阶段五：文档、配置与交付

- 在 `progress.md`、`project-status.md` 记录阶段性成果（中文），撰写 `docs/seatunnel-rest-plugin.md` 说明部署、参数配置与常见问题。
- 编写端到端联调手册，覆盖 SeaTunnel REST API 地址配置、Worker 启动参数、测试示例 DAG。
- 评估性能与可靠性：增加状态轮询退避策略、日志截断/分页，确保大任务场景稳定。

### To-dos

- [x] 搭建后端插件模块与参数模型，提交/轮询 SeaTunnel 作业 ✅ (2025-10-10)
- [x] 完成 SPI 注册、依赖聚合与打包配置，补充后端测试 ✅ (2025-10-10)
- [ ] 编译测试插件模块，修复可能的编译错误
- [ ] 部署到 DolphinScheduler Worker 测试环境，验证插件加载
- [ ] 实现最小可用的前端 SeaTunnel 任务配置弹窗并联调
- [ ] 扩展高级表单、动态连接器与 JSON 预览交互
- [ ] 更新 project-status，撰写部署联调文档

### 重要更新 (2025-10-10)

**✅ 已完成**:
- 后端插件核心代码实现（5个核心类 + 测试类）
- 使用 REST API v2 接口（而非已淘汰的 v1）
- SPI 注册配置完成
- 添加到 `dolphinscheduler-task-all` 打包依赖

**🔧 已修正**:
- 修正了 REST API 路径，从 v1 的 `/hazelcast/rest/maps/*` 更新为 v2 的 `/*` 接口
  - 提交任务：`POST /submit-job`
  - 查询状态：`GET /job-info/:jobId`
  - 停止任务：`POST /stop-job`

