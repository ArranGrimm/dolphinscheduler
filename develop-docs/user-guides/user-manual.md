# SeaTunnel REST 插件使用手册

**文档版本**: v1.0  
**创建时间**: 2025-10-27  
**目标读者**: 数据工程师、业务开发人员

---

## 📋 概述

SeaTunnel REST 插件是 DolphinScheduler 的原生任务插件，支持通过可视化界面配置 SeaTunnel 数据同步任务。本文档将指导您如何使用该插件完成各种数据集成场景。

**核心优势**:
- ✅ **可视化配置**: 无需手写复杂 JSON，通过表单即可配置数据同步
- ✅ **数据源集成**: 复用 DolphinScheduler 数据源中心，统一管理连接信息
- ✅ **参数化支持**: 支持项目级别参数和自定义参数，轻松切换环境
- ✅ **完整的任务生命周期**: 提交、监控、停止、日志查看一站式管理

---

## 1. 快速开始

### 1.1 创建第一个数据同步任务（5分钟）

本示例演示如何创建一个简单的 PostgreSQL 表到表的数据同步任务。

#### 步骤 1: 创建工作流

1. 登录 DolphinScheduler UI
2. 进入目标项目
3. 点击 **工作流定义** → **创建工作流**
4. 输入工作流名称，例如 `pg_to_pg_sync`

**【截图位置】**: 创建工作流界面

#### 步骤 2: 添加 SeaTunnel REST 任务

1. 从左侧任务栏 **"通用组件"** 分组，找到 **SeaTunnel REST** 任务
2. 拖拽到画布中央
3. 双击任务节点打开配置弹窗

**【截图位置】**: DAG 画布与任务列表

#### 步骤 3: 配置任务基本信息

在弹窗的上半部分，填写标准任务信息：

- **节点名称**: `sync_users_table`
- **运行标志**: 正常
- **Worker 分组**: default
- **SeaTunnel REST Endpoint**: `${SEATUNNEL_REST_ENDPOINT}` (使用项目级别参数)

**提示**: 如果您还未配置 `SEATUNNEL_REST_ENDPOINT` 参数，请参考[部署指南](./deployment-guide.md#4-配置项目级别参数)。

**【截图位置】**: 任务基本信息配置

#### 步骤 4: 配置 Source（数据源）

在 **"迁移任务配置"** 选项卡中：

1. **Env 配置** 区域:
   - 任务模式: `BATCH`
   - 全局并行度: `4`
   - 迁移任务名称: `${system.task.definition.name}` (自动使用当前任务名)

2. **Source 配置** 区域:
   - 点击 **"添加 Source"** 按钮
   - 数据源: 选择 `pg_source` (需预先在数据源中心创建)
   - SQL 查询: 
     ```sql
     SELECT id, name, email, create_time 
     FROM users 
     WHERE create_time >= '2024-01-01'
     ```
   - Plugin Output: `source_users` (给这个 Source 的输出命名，供下游引用)

**【截图位置】**: Source 配置表单

#### 步骤 5: 配置 Sink（目标端）

继续向下滚动到 **Sink 配置** 区域：

1. 点击 **"添加 Sink"** 按钮
2. 填写配置:
   - 数据源: 选择 `pg_target` (目标数据库)
   - Plugin Input: 选择 `source_users` (关联上游 Source 的输出)
   - 数据库: `target_db`
   - 表名: `users_copy`

**【截图位置】**: Sink 配置表单

#### 步骤 6: 预览与保存

1. 查看右侧 **JSON 预览** 区域，确认生成的配置符合预期
2. 点击 **"确认"** 按钮保存任务配置
3. 点击画布上方的 **"保存"** 按钮保存工作流
4. 点击 **"上线"** 按钮发布工作流

**【截图位置】**: JSON 预览区域

#### 步骤 7: 运行任务

1. 点击 **"运行"** 按钮，选择 **"立即执行"**
2. 进入 **工作流实例** 页面查看执行状态
3. 点击任务节点查看日志
4. 等待任务执行完成（状态变为绿色 ✅）

**【截图位置】**: 工作流实例页面与任务日志

#### 步骤 8: 验证结果

连接到目标数据库，检查数据是否同步成功：

```sql
SELECT COUNT(*) FROM target_db.users_copy;
-- 应该看到与源表相同的记录数
```

---

## 2. 核心概念

### 2.1 任务配置结构

一个完整的 SeaTunnel REST 任务包含以下部分：

```
┌─────────────────────────────────────┐
│ 通用配置 (DolphinScheduler 标准)     │
│ - 节点名称、Worker分组、超时告警等  │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ SeaTunnel REST Endpoint             │
│ - 指向 SeaTunnel 服务的 REST API     │
└─────────────────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ 迁移任务配置 (Job Config)           │
│  ├─ Env: 环境配置                   │
│  ├─ Source: 数据源(可多个)          │
│  ├─ Transform: 数据转换(可选)       │
│  └─ Sink: 目标端(可多个)            │
└─────────────────────────────────────┘
```

### 2.2 Source、Transform、Sink 的关系

```
┌─────────┐      ┌───────────┐      ┌──────┐
│ Source  │─────→│ Transform │─────→│ Sink │
│ (数据源) │      │ (可选转换)│      │(目标)│
└─────────┘      └───────────┘      └──────┘
     ↓                 ↓                ↓
plugin_output    plugin_input    plugin_input
                 plugin_output
```

- **Source**: 数据的来源（数据库表、文件等），每个 Source 需要定义一个 `plugin_output` 作为输出标识
- **Transform**: 可选的数据转换步骤（SQL 转换），需要指定 `plugin_input`（输入来源）和 `plugin_output`（输出标识）
- **Sink**: 数据的目标端（数据库表、数据仓库等），需要指定 `plugin_input` 关联上游数据

### 2.3 Plugin Output 与 Plugin Input

**Plugin Output** 是每个 Source 或 Transform 的"输出名称"，类似于给一张中间结果表命名。

**Plugin Input** 是 Transform 或 Sink 的"输入来源"，用于关联上游的输出。

**示例**:
```
Source 1: plugin_output = "orders_2024"
Source 2: plugin_output = "products"
Transform 1: plugin_input = "orders_2024", plugin_output = "enriched_orders"
Sink 1: plugin_input = "enriched_orders"
Sink 2: plugin_input = "products"
```

### 2.4 项目级别参数

项目级别参数是在项目维度定义的全局变量，可以在工作流中通过 `${参数名}` 引用。

**使用场景**:
- **环境切换**: 开发/测试/生产环境的 SeaTunnel 地址不同
- **配置复用**: 多个工作流共享相同的配置项

**配置方法**:
1. 进入项目 → 项目管理 → 项目参数
2. 创建参数，例如 `SEATUNNEL_REST_ENDPOINT`
3. 在任务配置中使用 `${SEATUNNEL_REST_ENDPOINT}`

---

## 3. 配置指南

### 3.1 Env 配置

Env 配置控制 SeaTunnel 任务的全局行为。

| 字段 | 说明 | 可选值 | 默认值 | 建议 |
|------|------|--------|--------|------|
| 任务模式 | 任务运行模式 | BATCH / STREAMING | BATCH | 离线批量用 BATCH，实时同步用 STREAMING |
| 全局并行度 | 任务的并发数 | 1~32 | 4 | 根据数据量调整，建议 4~8 |
| 迁移任务名称 | SeaTunnel 端显示的任务名 | 任意字符串 | `${system.task.definition.name}` | 使用内置变量自动命名 |

### 3.2 Source 配置

#### 3.2.1 基础配置

| 字段 | 说明 | 是否必填 | 示例 |
|------|------|----------|------|
| 数据源 | 从数据源中心选择 | 是 | `pg_source` |
| SQL 查询 | 数据查询语句 | 是 | `SELECT * FROM users WHERE active = true` |
| Plugin Output | 输出标识名称 | 是 | `active_users` |

**SQL 编写技巧**:
- ✅ 推荐使用 `SELECT` 明确指定字段，避免 `SELECT *`
- ✅ 添加 `WHERE` 条件过滤不需要的数据，减少传输量
- ✅ 对于增量同步，使用时间字段过滤：`WHERE update_time >= '${last_sync_time}'`
- ❌ 避免复杂的子查询，会影响性能

#### 3.2.2 高级选项

点击 **"高级选项"** 展开面板，可配置性能调优参数：

| 字段 | 说明 | 默认值 | 适用场景 |
|------|------|--------|----------|
| 并行度 | 此 Source 的并发数 | 继承全局 | 某个 Source 数据量特别大时单独调整 |
| 分区列 | 用于并行拆分的列 | 无 | 大表并行读取，推荐使用数字类型主键 |
| 分片大小 | 每个分片的行数 | 8096 | 控制并发任务的粒度 |
| 拉取大小 | JDBC 批量拉取行数 | 5000 | 提高网络传输效率 |

**性能调优示例**:

**场景**: 同步一张 1 亿行的大表

```
并行度: 8
分区列: id (主键)
分片大小: 100000
拉取大小: 10000
```

这样 SeaTunnel 会自动将表拆分为 8 个并发任务，每个任务处理约 1250 万行数据。

### 3.3 Transform 配置（可选）

Transform 用于在数据传输过程中进行 SQL 转换。

| 字段 | 说明 | 是否必填 | 示例 |
|------|------|----------|------|
| Plugin Input | 关联上游输出 | 是 | 选择 `source_orders` |
| SQL 查询 | 转换逻辑（SQL） | 是 | `SELECT *, price * quantity AS total FROM source_orders` |
| Plugin Output | 转换后的输出名 | 是 | `orders_with_total` |

**使用场景**:
- 字段计算（如上例的 `price * quantity`）
- 字段重命名
- 数据过滤（`WHERE` 条件）
- 多表关联（`JOIN`，但需注意性能）

**限制**:
- Transform 只支持 SQL 类型（Sql plugin）
- SQL 中引用的表名必须是上游的 `plugin_output`
- 不支持复杂的嵌套子查询

### 3.4 Sink 配置

Sink 支持三种数据源类型：**PostgreSQL**、**Oracle**、**Doris**。

#### 3.4.1 JDBC Sink（PostgreSQL / Oracle）

**基础配置**:

| 字段 | 说明 | 是否必填 | 示例 |
|------|------|----------|------|
| 数据源 | 从数据源中心选择 | 是 | `pg_target` |
| Plugin Input | 关联上游输出 | 是 | 选择 `source_users` |
| 数据库 | 目标数据库名 | 是 | `warehouse` |
| 表名 | 目标表名 | 是 | `dim_users` |

**高级选项**:

| 字段 | 说明 | 默认值 | 适用场景 |
|------|------|--------|----------|
| 启用 Upsert | 根据主键更新或插入 | false | CDC 场景、增量更新 |
| 数据保存模式 | 数据存在时的处理策略 | APPEND_DATA | 选择覆盖/追加/报错 |

**数据保存模式说明**:
- `APPEND_DATA`: 追加数据（默认）
- `DROP_DATA`: 清空表后写入
- `ERROR_WHEN_DATA_EXISTS`: 表有数据时报错

**Oracle Sink 特别说明**:

Oracle 使用 `table` 模式时会生成 `MERGE` 语句，适合 CDC 但性能较低。对于大批量数据迁移，**强烈建议**留空 `table` 字段，改为在"高级选项"中手动编写高性能的 `INSERT` 语句。

#### 3.4.2 Doris Sink

Doris 是高性能分析型数据库，适合大数据量的实时写入。

**基础配置**:

| 字段 | 说明 | 是否必填 | 示例 |
|------|------|----------|------|
| 数据源 | 选择 Doris 数据源(MySQL类型) | 是 | `doris_warehouse` |
| Plugin Input | 关联上游输出 | 是 | 选择 `source_orders` |
| 数据库 | Doris 数据库名 | 是 | `ods` |
| 表名 | Doris 表名 | 是 | `ods_orders` |

**高级选项**:

| 字段 | 说明 | 默认值 | 适用场景 |
|------|------|--------|----------|
| 启用 2PC | 两阶段提交，保证精确一次 | false | 对数据一致性要求极高的场景 |
| 标签前缀 | 2PC 模式的标签前缀 | 空 | 开启 2PC 时必填 |

**注意事项**:
- Doris 数据源在 DolphinScheduler 中配置为 MySQL 类型，端口为 `9030`（FE Query Port）
- 插件会自动将 `9030` 转换为 `8030`（FE HTTP Port）用于 Stream Load
- 建议提前在 Doris 中创建好目标表

---

## 4. 典型场景示例

### 4.1 场景 1: PostgreSQL → PostgreSQL 全量迁移

**需求**: 将生产库的 `users` 表完整迁移到数据仓库。

**配置**:

1. **Env**:
   - 任务模式: `BATCH`
   - 全局并行度: `4`

2. **Source**:
   - 数据源: `pg_prod`
   - SQL查询: `SELECT * FROM users`
   - Plugin Output: `source_users`

3. **Sink**:
   - 数据源: `pg_warehouse`
   - Plugin Input: `source_users`
   - 数据库: `dw`
   - 表名: `dim_users`
   - 数据保存模式: `DROP_DATA` (先清空再写入)

**【配置截图位置】**: 全量迁移配置示例

---

### 4.2 场景 2: Oracle → Doris 实时同步

**需求**: 将 Oracle 的订单表增量同步到 Doris 数仓，用于实时分析。

**配置**:

1. **Env**:
   - 任务模式: `STREAMING`
   - 全局并行度: `8`

2. **Source**:
   - 数据源: `oracle_erp`
   - SQL查询: 
     ```sql
     SELECT * FROM orders 
     WHERE update_time >= TO_TIMESTAMP('${last_sync_time}', 'YYYY-MM-DD HH24:MI:SS')
     ```
   - Plugin Output: `incremental_orders`
   - 高级选项:
     - 并行度: `8`
     - 分区列: `order_id`
     - 拉取大小: `10000`

3. **Sink**:
   - 数据源: `doris_dw`
   - Plugin Input: `incremental_orders`
   - 数据库: `ods`
   - 表名: `ods_orders`
   - 高级选项:
     - 启用 2PC: `true`
     - 标签前缀: `ods_orders_sync`

**调度配置**:
- 调度周期: 每小时
- 自定义参数: `last_sync_time` = `${system.task.start.time}`

**【配置截图位置】**: 实时同步配置示例

---

### 4.3 场景 3: 多源合并 + 数据转换

**需求**: 从两个 PostgreSQL 表读取数据，进行 JOIN 后写入 Doris。

**配置**:

1. **Env**:
   - 任务模式: `BATCH`
   - 全局并行度: `4`

2. **Source 1 (订单表)**:
   - 数据源: `pg_prod`
   - SQL查询: `SELECT order_id, user_id, amount, order_time FROM orders WHERE order_time >= '2024-01-01'`
   - Plugin Output: `source_orders`

3. **Source 2 (用户表)**:
   - 数据源: `pg_prod`
   - SQL查询: `SELECT user_id, user_name, city FROM users`
   - Plugin Output: `source_users`

4. **Transform (关联两表)**:
   - Plugin Input: `source_orders` (主表)
   - SQL查询:
     ```sql
     SELECT 
       o.order_id,
       o.user_id,
       u.user_name,
       u.city,
       o.amount,
       o.order_time
     FROM source_orders o
     LEFT JOIN source_users u ON o.user_id = u.user_id
     ```
   - Plugin Output: `enriched_orders`

5. **Sink**:
   - 数据源: `doris_dw`
   - Plugin Input: `enriched_orders`
   - 数据库: `dw`
   - 表名: `fact_orders`

**注意**:
- Transform 的 SQL 中，`source_orders` 和 `source_users` 是上游 Source 的 `plugin_output`
- JOIN 操作会在 SeaTunnel 引擎中执行，注意数据量不要过大

**【配置截图位置】**: 多源合并配置示例

---

## 5. 最佳实践

### 5.1 性能调优

#### 5.1.1 合理设置并行度

| 数据量级 | 推荐全局并行度 | Source 并行度 |
|---------|---------------|--------------|
| < 10 万行 | 1~2 | 无需单独设置 |
| 10 万 ~ 100 万行 | 4 | 无需单独设置 |
| 100 万 ~ 1000 万行 | 8 | 可适当增加到 8~16 |
| > 1000 万行 | 16 | 16~32，并配置分区列 |

#### 5.1.2 使用分区列加速读取

**适用场景**: 大表（> 1000 万行）

**配置示例**:
```
分区列: id (数字类型主键)
分片大小: 100000
拉取大小: 10000
```

**原理**: SeaTunnel 会自动计算 `id` 的最小值和最大值，然后拆分为多个区间并行读取。

#### 5.1.3 优化 SQL 查询

- ✅ **选择必要的字段**: `SELECT id, name, email` 而不是 `SELECT *`
- ✅ **添加过滤条件**: `WHERE create_time >= '2024-01-01'`
- ✅ **避免复杂计算**: 将复杂逻辑放到 Transform 中
- ✅ **使用索引字段**: WHERE 条件尽量使用有索引的列

### 5.2 参数化配置

#### 5.2.1 环境切换

**问题**: 同一个工作流需要在开发、测试、生产环境运行。

**解决方案**: 使用项目级别参数

**配置**:

| 环境 | 项目参数 |
|------|---------|
| 开发 | `SEATUNNEL_REST_ENDPOINT=http://seatunnel-dev:5801` |
| 测试 | `SEATUNNEL_REST_ENDPOINT=http://seatunnel-test:5801` |
| 生产 | `SEATUNNEL_REST_ENDPOINT=http://seatunnel-prod:5801` |

**使用**:
在任务配置中使用 `${SEATUNNEL_REST_ENDPOINT}`，部署到不同项目时自动适配。

#### 5.2.2 动态时间范围

**场景**: 每天同步前一天的订单数据

**配置**:

1. 在任务的"自定义参数"中定义:
   - 参数名: `sync_date`
   - 方向: IN
   - 数据类型: VARCHAR
   - 默认值: `${system.biz.date}` (DolphinScheduler 内置变量，格式 yyyyMMdd)

2. 在 SQL 中使用:
   ```sql
   SELECT * FROM orders 
   WHERE TO_CHAR(order_time, 'YYYYMMDD') = '${sync_date}'
   ```

**内置变量参考**:
- `${system.biz.date}`: 业务日期 (yyyyMMdd)
- `${system.biz.curdate}`: 当前日期 (yyyyMMdd)
- `${system.task.definition.name}`: 当前任务名称
- `${system.task.start.time}`: 任务开始时间 (yyyy-MM-dd HH:mm:ss)

### 5.3 监控与日志

#### 5.3.1 查看任务日志

1. 进入 **工作流实例** 页面
2. 点击目标任务节点
3. 选择 **查看日志** 标签

**关键日志内容**:
```
[INFO] Submitting SeaTunnel job to http://seatunnel:5801/submit-job
[INFO] SeaTunnel job submitted successfully, jobId: 123456789
[INFO] Polling job status...
[INFO] Job status: RUNNING
[INFO] Job status: FINISHED
[INFO] Task completed successfully
```

#### 5.3.2 监控任务状态

**任务状态说明**:

| 状态 | 图标 | 说明 | 操作 |
|------|------|------|------|
| 等待中 | ⏸️ | 任务在队列中等待 | 等待资源释放 |
| 运行中 | 🔵 | 任务正在执行 | 可点击"停止" |
| 成功 | ✅ | 任务执行成功 | 查看日志确认数据 |
| 失败 | ❌ | 任务执行失败 | 查看日志排查问题 |
| 停止 | ⏹️ | 任务被手动停止 | 确认是否需要重跑 |

#### 5.3.3 任务停止

如果任务长时间运行或配置错误，可以手动停止：

1. 进入 **工作流实例** 页面
2. 找到运行中的任务
3. 点击 **停止** 按钮
4. 确认停止操作

**注意**: 停止操作会同时终止 DolphinScheduler 任务和 SeaTunnel Job。

### 5.4 错误处理

#### 5.4.1 常见错误及解决方案

| 错误信息 | 原因 | 解决方案 |
|---------|------|----------|
| `restEndpoint is empty` | 未配置 REST API 地址 | 配置项目级别参数 `SEATUNNEL_REST_ENDPOINT` |
| `Datasource not found` | 数据源被删除或重命名 | 检查数据源中心，重新选择数据源 |
| `Connection timeout` | 无法连接 SeaTunnel | 检查网络和 SeaTunnel 服务状态 |
| `Table not found` | 目标表不存在 | 提前在目标数据库创建表 |
| `Invalid SQL syntax` | SQL 语法错误 | 检查 SQL 语句，可在数据库客户端先测试 |
| `Out of memory` | 数据量过大导致内存不足 | 减小并行度或增加 SeaTunnel 资源 |

#### 5.4.2 数据一致性保障

**问题**: 任务执行失败后，如何保证数据不重复？

**方案 1**: 使用 Upsert 模式（JDBC Sink）
```
启用 Upsert: true
```
这样即使任务重跑，也会根据主键更新而不是插入重复数据。

**方案 2**: 使用 `DROP_DATA` 模式
```
数据保存模式: DROP_DATA
```
每次执行前先清空目标表，适合全量同步场景。

**方案 3**: 手动清理后重跑
失败后先手动清理目标表的数据，再重新运行任务。

---

## 6. 进阶技巧

### 6.1 复杂数据转换

#### 6.1.1 字段映射与重命名

```sql
SELECT 
  user_id AS id,
  CONCAT(first_name, ' ', last_name) AS full_name,
  UPPER(email) AS email_normalized,
  CAST(created_at AS DATE) AS reg_date
FROM source_users
```

#### 6.1.2 数据过滤与清洗

```sql
SELECT 
  order_id,
  user_id,
  amount
FROM source_orders
WHERE amount > 0                    -- 过滤无效订单
  AND user_id IS NOT NULL           -- 过滤空用户
  AND order_status = 'COMPLETED'    -- 只要已完成订单
```

#### 6.1.3 聚合计算

```sql
SELECT 
  user_id,
  DATE(order_time) AS order_date,
  COUNT(*) AS order_count,
  SUM(amount) AS total_amount
FROM source_orders
GROUP BY user_id, DATE(order_time)
```

### 6.2 多 Sink 场景

**场景**: 一份数据同时写入多个目标

**配置**:
1. 创建 1 个 Source
2. 创建多个 Sink，每个 Sink 的 `plugin_input` 都指向同一个 Source 的 `plugin_output`

**示例**:
```
Source: plugin_output = "orders_data"
  ↓
  ├─ Sink 1: plugin_input = "orders_data" → PostgreSQL
  ├─ Sink 2: plugin_input = "orders_data" → Doris
  └─ Sink 3: plugin_input = "orders_data" → Kafka
```

### 6.3 工作流编排

#### 6.3.1 串行任务

**场景**: 先同步用户表，再同步订单表（依赖用户表）

**配置**:
1. 创建任务 A: 同步用户表
2. 创建任务 B: 同步订单表
3. 在任务 B 的配置中，**前置任务** 选择任务 A

#### 6.3.2 并行任务

**场景**: 同时同步多张独立的表

**配置**:
创建多个 SeaTunnel REST 任务，不设置前置任务依赖，它们会并行执行。

---

## 7. 常见问题 FAQ

### Q1: 任务一直卡在 "RUNNING" 状态怎么办？

**A**: 可能原因：
1. SeaTunnel 服务假死 → 重启 SeaTunnel 服务
2. 数据量过大导致执行缓慢 → 查看 SeaTunnel 日志确认进度
3. 网络问题导致轮询失败 → 检查 Worker 到 SeaTunnel 的网络

### Q2: 如何查看 SeaTunnel 端的任务日志？

**A**: 
```bash
# 进入 SeaTunnel 安装目录
cd /opt/seatunnel

# 查看任务日志
tail -f logs/seatunnel-engine-server.log
```

### Q3: Doris Sink 报错 "8030 端口拒绝连接"？

**A**: 
- 检查 Doris FE 的 HTTP Server 是否启动（8030 端口）
- 检查防火墙规则
- 确认在 DolphinScheduler 数据源中配置的是 `9030` 端口（不是 8030）

### Q4: 如何实现增量同步？

**A**: 
使用时间字段过滤 + 自定义参数：
```sql
SELECT * FROM orders 
WHERE update_time > '${last_sync_time}'
```

在工作流调度中，可以使用 DolphinScheduler 的调度变量来传递上次同步时间。

### Q5: 能否在同一个任务中同步多张表？

**A**: 
可以！添加多个 Source 和多个 Sink 即可。每个 Source 对应一张源表，每个 Sink 对应一张目标表。

### Q6: Transform 支持哪些 SQL 语法？

**A**: 
支持标准 SQL（SELECT、WHERE、JOIN、GROUP BY 等），具体取决于 SeaTunnel 使用的 SQL 引擎（Apache Calcite）。复杂的窗口函数或特定数据库方言可能不支持。

### Q7: 如何查看生成的 JSON 配置？

**A**: 
在任务配置弹窗的右侧有 **JSON 预览** 区域，实时显示根据表单生成的 SeaTunnel 配置。

### Q8: 数据源中心的密码会暴露吗？

**A**: 
不会。任务日志和 JSON 预览中的密码会自动脱敏显示为 `***`。

---

## 8. 附录

### 8.1 支持的数据源类型

| 数据源 | Source 支持 | Sink 支持 | 说明 |
|-------|------------|----------|------|
| PostgreSQL | ✅ | ✅ | JDBC 连接器 |
| Oracle | ✅ | ✅ | JDBC 连接器 |
| Doris | ❌ | ✅ | Stream Load 方式 |

### 8.2 字段类型映射参考

**PostgreSQL → Doris**:

| PostgreSQL | Doris |
|-----------|-------|
| INTEGER | INT |
| BIGINT | BIGINT |
| VARCHAR(n) | VARCHAR(n) |
| TEXT | STRING |
| TIMESTAMP | DATETIME |
| DECIMAL(p,s) | DECIMAL(p,s) |

**Oracle → PostgreSQL**:

| Oracle | PostgreSQL |
|--------|-----------|
| NUMBER(p,s) | NUMERIC(p,s) |
| VARCHAR2(n) | VARCHAR(n) |
| CLOB | TEXT |
| TIMESTAMP | TIMESTAMP |
| DATE | DATE |

### 8.3 DolphinScheduler 内置变量

| 变量名 | 示例值 | 说明 |
|-------|--------|------|
| `${system.biz.date}` | `20241027` | 业务日期 |
| `${system.biz.curdate}` | `20241027` | 当前日期 |
| `${system.task.definition.name}` | `sync_users` | 任务定义名称 |
| `${system.task.instance.id}` | `123456` | 任务实例 ID |
| `${system.task.start.time}` | `2024-10-27 10:00:00` | 任务开始时间 |

---

## 9. 相关文档

- [部署指南](./deployment-guide.md) - 如何部署 SeaTunnel REST 插件
- [SeaTunnel 官方文档](https://seatunnel.apache.org/) - SeaTunnel 引擎文档
- [DolphinScheduler 官方文档](https://dolphinscheduler.apache.org/) - DolphinScheduler 使用文档

---

**文档反馈**: 如发现文档错误、遗漏或需要补充的场景，请及时反馈并更新。

**祝您使用愉快！** 🎉

