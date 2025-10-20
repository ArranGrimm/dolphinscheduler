# SeaTunnel Sink 选项梳理（PostgreSQL / Oracle / Doris）

**版本**: v1.1  
**创建时间**: 2025-10-15  
**最后更新**: 2025-10-20

---

## 1. 编写背景

当前自定义的 SeaTunnel REST 任务在前端提供了 Source、Transform、Sink 的可视化配置。随着 Sink 功能扩展，需要对官方文档中大量参数进行筛选，明确：

- 业务侧“必须”提供给用户的基础参数
- 可作为“高级选项”开放的参数
- 参数之间的互斥/依赖关系（如 `query` 与 `table`）

本梳理面向 **PostgreSQL / Oracle JDBC Sink** 与 **Doris Sink**，重点覆盖与前端表单直接相关的配置项，为后续 UI 设计和后端参数映射提供依据。

---

## 2. 官方参考文档

- [SeaTunnel JDBC Sink — Oracle](../seatunnel-docs/Oracle-sink.md)
- [SeaTunnel JDBC Sink — PostgreSQL](../seatunnel-docs/PostgreSql-sink.md)
- [SeaTunnel Doris Sink](../seatunnel-docs/Doris-sink.md)

原始文档参数众多，此处仅提炼与我们场景相关的核心部分。

---

## 3. 共性选项与参数策略

### 3.1 通用基础选项

| 选项 | 适用 Sink | 是否必填 | 建议位置 | 说明 |
|------|-----------|----------|----------|------|
| `plugin_input` | 全部 | 是 | 基础 | 绑定上游 Source/Transform 输出标识 |
| `datasource` 选择器 | 全部 | 是 | 基础 | 通过 DS 管理加载，自动填充连接信息 |
| `url` / `driver` / `username` / `password` | JDBC / Doris | 自动填充 | 基础（只读回显） | 由数据源下拉框驱动，表单中展示但不可编辑 |

> 说明：在 UI 中，`url/driver/username/password` 由数据源选择自动写入，只需在 JSON 中生成即可，无需用户手动输入。

### 3.2 高级选项共性

| 选项 | 适用 Sink | 默认值 | 依赖/互斥 | 说明 |
|------|-----------|--------|-----------|------|
| `batch_size` / `batch_interval_ms` | JDBC | 1000 / 1000 | 无 | 批量写入调优，仅在性能调试时开放 |
| `is_exactly_once` | JDBC | false | 开启后需配置 XA 相关参数 | Oracle/PostgreSQL 支持 XA；默认关闭 |
| `enable_upsert` | JDBC | true | 依赖 `primary_keys` | 仅在写入模式优化时调整 |
| `schema_save_mode` / `data_save_mode` | JDBC / Doris | CREATE/APPEND | 无 | 对应同步前的表结构/数据处理策略 |
| `primary_keys` | JDBC | 空 | 与 `generate_sink_sql` 关联 | 开启 Upsert 或生成 SQL 时可选 |

---

## 4. PostgreSQL 与 Oracle（JDBC Sink）

### 4.1 基础选项（必填）

| 选项 | 说明 | 备注 |
|------|------|------|
| `plugin_input` | 上游数据来源 | 保持现有实现 |
| `datasource` | 选择 DS 管理的数据源 | 自动注入连接信息 |
| `database` / `table` | 目标库表，自动生成 SQL 时使用 | 与 `query` 互斥，但保留 |
| `query` | 自定义写入 SQL | **推荐 Oracle 场景使用**，执行效率更高 |

> **互斥逻辑**：`query` 与 `database/table` 互斥。若用户填写 `query`，需禁用 `database/table`，反之亦然。当前实现需增加前端校验。

### 4.2 高级选项（可选）

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `generate_sink_sql` | false | 当采用 `database/table` 时生成标准 INSERT/UPDATE 语句，可与 `primary_keys` 配合 |
| `primary_keys` | [] | 指定主键列表，用于 Upsert/CDC |
| `batch_size` / `batch_interval_ms` | 1000 | 批量写入调优 |
| `connection_check_timeout_sec` | 30 | 连接校验超时时间 |
| `max_retries` | 0 | 批量失败重试次数 |
| `is_exactly_once` | false | 启动 XA 事务，需要 `xa_data_source_class_name`，默认不暴露 |
| `enable_upsert` | true | CDC 场景保持默认即可 |
| `schema_save_mode` / `data_save_mode` | CREATE / APPEND | 与表结构/数据存在关系 |

> **保留策略**：为了保持界面简洁，建议基础面板仅保留 `database`、`table`、`query`；其余选项置于高级面板。根据团队反馈，`is_exactly_once`、`schema_save_mode`、`custom_sql` 等选项因复杂度高或职责不清，**不在 UI 中提供**，但保留 `enable_upsert` 和 `data_save_mode` 以支持性能调优和数据覆盖策略。

### 4.3 Oracle 特殊说明

- 当使用 `table` 选项生成 SQL 时，官方实现会生成 `MERGE` 语句，适合 CDC/upsert，但对纯批量迁移性能较弱。
- 因此需要在 UI 上明确提示：**Oracle 推荐使用自定义 `query`** 以获得更高吞吐。
- 保留 `table` 输入是为了兼容简单场景（生成标准 SQL），并与 PostgreSQL 行为一致。

---

## 5. Doris Sink

### 5.1 基础选项（必填）

| 选项 | 说明 | UI 指引 |
|------|------|---------|
| `plugin_input` | 上游数据来源 | 与 JDBC 相同 |
| `datasource` | Doris 数据源 | 自动解析 JDBC 地址，转换 fenodes |
| `fenodes` | Doris HTTP 地址 | 由 `url` 自动生成，支持手动调整 |
| `database` / `table` | 目标库表 | 基础输入 |
| `username` / `password` | 认证信息 | 显示掩码 |

> 选项 `url` / `driver` 可隐藏，仅用于解析 fenodes。

### 5.2 高级选项（可选）

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `sink.label-prefix` | 空 | Doris 2PC 模式标签，批量写入时建议用户配置 |
| `sink.enable-2pc` | false | 开启两阶段提交，需配合 `sink.label-prefix` |
| `sink.enable-delete` | false | Doris Unique 模型批量删除 |
| `doris.config` | 空对象 | 用于指定导入格式（CSV/JSON）等，需要以 Key-Value 方式输入 |
| `sink.max-retries` | 3 | 写入失败重试 |
| `sink.buffer-size` / `sink.buffer-count` / `doris.batch.size` | 256KB / 3 / 1024 | 性能调优 |
| `case_sensitive` | true | 控制大小写是否保留 |
| `schema_save_mode` / `data_save_mode` | CREATE / APPEND | 与 JDBC 类似 |

> Doris 参数相对较多，基础面板仅保留必填项；高级面板可按分组呈现：事务与2PC、导入格式、性能调优、表结构策略等。

---

## 6. UI 结构建议

| 面板 | 项目 | 说明 |
|------|------|------|
| 基础配置 | - 数据源选择（自动填充连接信息）<br/>- Plugin Input<br/>- `database`/`table`（JDBC）<br/>- `query`（JDBC，自定义 SQL）<br/>- `generate_sink_sql`（JDBC）<br/>- `fenodes` / `database` / `table` / `username`（Doris） | 主要均与业务语义直接相关的必填项 |
| 高级配置 | - 批量参数（`batch_size` 等）<br/>- 表结构策略（schema/data save mode）<br/>- Upsert/主键配置<br/>- Doris 事务与导入格式选项 | 细分 Tab 下的折叠面板呈现 |

### 交互关键点

1. **互斥关系提示**：当用户填写 `query` 时，禁用 `database/table`，并给出提示文字，反之亦然。
2. **联动写入**：数据源选择后立即调用 `setValues` 更新表单模型，确保 JSON 预览一致。
3. **高级面板默认折叠**：避免一次性展示全部调优选项，减少表单压迫感。

---

## 7. 后续行动

- [x] 在前端实现 `query` 与 `database/table` 的互斥逻辑，并提供提示文案（特别是 Oracle 性能建议）。
- [x] 新增 Oracle/PG 高级选项分组组件，实现 `enable_upsert` 和 `data_save_mode` 选项。
- [x] 新增 Doris 高级选项分组组件，支持导入格式、2PC 相关输入。
- [x] 根据本梳理更新 `project-plan.md` 中 Frontend Phase 的细化任务。
- [ ] 与后端确认新增参数的传输格式，尤其是 `doris.config`（Key-Value）等字段是否需要额外处理。

---

> **备注**：本文档将随实际实现持续调整，建议在新增或下线参数时同步更新。
