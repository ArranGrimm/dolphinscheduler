# SeaTunnel REST 任务前端实现详细设计

## 1. 概述

本文档详细描述 SeaTunnel REST 任务类型的前端增强实现，基于现有的最小可用版本进行功能升级。

## 2. 技术栈

### 2.1 已有依赖（无需添加新包）
- **UI 组件**: Naive UI 2.33.5
  - `n-tabs`: 基础/高级选项分组
  - `n-collapse`: 可折叠面板
  - `n-select`: 下拉选择
  - `n-input`: 文本输入
  - `n-input-number`: 数字输入
  - `n-form`: 表单验证
- **代码编辑器**: Monaco Editor 0.34.0 (JSON 预览)
- **状态管理**: Pinia 2.0.22
- **工具库**: Lodash 4.17.21

## 3. 数据源集成

### 3.1 DolphinScheduler 数据源 API

#### 获取数据源列表
```typescript
// 来自 @/service/modules/data-source
queryDataSourceList(params: TypeReq): Promise<DataSource[]>

// 请求
GET /datasources/list?type=POSTGRESQL&testFlag=0

// 响应
[
  {
    id: 1,
    name: "pg_prod_db",
    type: "POSTGRESQL",
    ...
  }
]
```

#### 获取数据库列表
```typescript
getDatasourceDatabasesById(datasourceId: number): Promise<string[]>

// 请求
GET /datasources/databases?datasourceId=1

// 响应
["public", "testdb", "proddb"]
```

#### 获取表列表
```typescript
getDatasourceTablesById(datasourceId: number, database: string): Promise<string[]>

// 请求
GET /datasources/tables?datasourceId=1&database=public

// 响应
["users", "orders", "products"]
```

### 3.2 支持的数据源类型

根据调研结果（`import_info.md`），限制范围为：

```typescript
const SEATUNNEL_DATASOURCE_TYPES = {
  SOURCE: ['POSTGRESQL', 'ORACLE'],
  SINK: ['POSTGRESQL', 'ORACLE', 'DORIS']
}

const DATASOURCE_TYPE_MAP = {
  POSTGRESQL: { id: 1, code: 'POSTGRESQL' },
  ORACLE: { id: 5, code: 'ORACLE' },
  DORIS: { id: 23, code: 'DORIS' }
}
```

## 4. 表单结构设计

### 4.1 整体布局（左右分栏）

```
┌─────────────────────────────────────────────┐
│  SeaTunnel REST 任务配置                      │
├───────────────────┬─────────────────────────┤
│                   │                         │
│   表单区域         │    JSON 预览区域         │
│   (60%)           │    (40%)                │
│                   │                         │
│  ┌─────────────┐  │  ┌──────────────────┐  │
│  │ 基础配置 Tab │  │  │   Monaco Editor   │  │
│  ├─────────────┤  │  │   (只读模式)       │  │
│  │ 高级配置 Tab │  │  │                   │  │
│  └─────────────┘  │  │   敏感信息加密显示  │  │
│                   │  │   password: ***   │  │
│                   │  └──────────────────┘  │
└───────────────────┴─────────────────────────┘
```

### 4.2 基础配置 Tab

#### Env 环境配置（可折叠）
```typescript
{
  job: {
    mode: 'BATCH' | 'STREAMING', // 必填，默认 BATCH
    name: string  // 可选，自动生成
  },
  execution: {
    parallelism: number  // 可选，默认 1
  }
}
```

#### Source 配置（动态多连接器）- **简化版**
```typescript
interface SourceConfig {
  plugin_name: 'Jdbc' // 固定值
  datasourceId: number // 从 DS 数据源中选择（必填，仅限 POSTGRESQL + ORACLE）
  datasourceType: 'POSTGRESQL' | 'ORACLE' // 数据源类型（自动推断，不需要用户选择）
  
  // JDBC 连接信息（从数据源自动提取）
  url?: string // 自动生成：jdbc:postgresql://host:port/db 或 jdbc:oracle:thin:@host:port:db
  driver?: string // 自动设置：org.postgresql.Driver 或 oracle.jdbc.OracleDriver
  user?: string // 从数据源自动提取
  password?: string // 从数据源自动提取
  
  // SQL 查询（唯一的查询方式）
  query: string // SQL 查询语句（必填）
  
  // Plugin Output（必填）
  plugin_output: string // 输出名称，供后续 Transform/Sink 引用
}
```

**简化说明**（基于实际使用反馈）：
1. ❌ **移除数据源类型选择** - Oracle/PG 都用 Jdbc 连接器，自动推断即可
2. ✅ **保留数据源选择** - 核心功能，通过 DS 数据源管理获取连接信息
3. ❌ **移除查询模式选择** - 只保留 SQL 模式，SeaTunnel 自动生成的 SQL 可能有问题
4. ❌ **移除数据库选择** - 从数据源 URL 自动解析
5. ❌ **移除表选择** - 由 SQL 决定
6. ✅ **保留 SQL 查询** - 核心功能，用户自定义 SQL 更可控
7. 📝 **输出名称改名** - 从"输出表名"改为"Plugin Output"，符合 SeaTunnel 术语

#### Transform 配置（可选，暂时只支持 SQL）
```typescript
interface TransformConfig {
  plugin_name: 'Sql'
  plugin_input: string // 关联 source 的 plugin_output
  plugin_output: string // 输出表名
  query: string // SQL 转换语句
}
```

#### Sink 配置（动态多连接器）
```typescript
type SinkConfig =
  | {
      plugin_name: 'Jdbc'
      datasourceId: number
      datasourceType: 'POSTGRESQL' | 'ORACLE'
      plugin_input: string
      url?: string
      driver?: string
      user?: string
      password?: string
      database?: string
      table?: string
      primary_keys?: string[]
      generate_sink_sql?: boolean
      enable_upsert?: boolean
      data_save_mode?: 'APPEND_DATA' | 'DROP_DATA' | 'ERROR_WHEN_DATA_EXISTS'
    }
  | {
      plugin_name: 'Doris'
      datasourceId: number
      datasourceType: 'DORIS'
      plugin_input: string
      url?: string
      fenodes?: string
      database?: string
      table?: string
      username?: string
      password?: string
      'sink.enable-2pc'?: boolean
      'sink.label-prefix'?: string
      // 性能调优参数 (待补充)
      'sink.buffer-size'?: number
      'sink.buffer-count'?: number
      'doris.batch.size'?: number
      'doris.config'?: Record<string, any>
    }
```

### 4.3 高级配置 Tab

#### Source 高级选项（可折叠）
```typescript
{
  // 并行控制
  parallelism?: number, // 单独控制此 Source 的并发数
  
  // 并行分片
  partition_column?: string, // 仅支持一列，必须属于支持的拆分数据类型（最好是数字类型）
  
  // 拆分策略
  'split.size'?: number, // 控制并发任务的粒度（行数），默认 8096
  
  // 批量设置
  fetch_size?: number // JDBC 驱动层面的性能调优，默认 5000
}
```

#### Sink 高级选项（可折叠）
```typescript
{
  // 批量写入
  batch_size?: number,
  batch_interval_ms?: number,
  
  // CDC 与数据写入策略
  enable_upsert?: boolean, // default: true
  data_save_mode?: 'APPEND_DATA' | 'DROP_DATA' | 'ERROR_WHEN_DATA_EXISTS', // default: APPEND_DATA

  // Doris 专属
  'sink.enable-2pc'?: boolean, // default: false
  'sink.label-prefix'?: string,

  // Doris 性能调优 (待补充)
  'sink.buffer-size'?: number,
  'sink.buffer-count'?: number,
  'doris.batch.size'?: number,
  'doris.config'?: Record<string, any>
}
```

## 5. 核心功能实现

### 5.1 动态连接器管理

#### Source 连接器组件（简化版实现）
```typescript
// task-forms/seatunnel-rest/index.tsx
import { queryDataSourceList, queryDataSource } from '@/service/modules/data-source'

// 加载数据源列表
const loadSourceDatasources = async () => {
  try {
    loadingDatasources.value = true
    const result = await queryDataSourceList({
      type: 'POSTGRESQL,ORACLE', // 仅支持这两种类型
      testFlag: 0
    })
    sourceDatasourceOptions.value = result.map((ds) => ({
      label: ds.name,
      value: ds.id,
      type: ds.type
    }))
  } finally {
    loadingDatasources.value = false
  }
}

// 当数据源改变时，自动提取 JDBC 连接信息
const onSourceDatasourceChange = async (
  source: SourceConnector,
  datasourceId: number
) => {
  const selectedDs = sourceDatasourceOptions.value.find(
    (ds) => ds.value === datasourceId
  )
  if (selectedDs) {
    source.datasourceType = selectedDs.type // 自动推断类型
    
    try {
      const dsDetail = await queryDataSource(datasourceId)
      
      if (dsDetail) {
        // 构造 JDBC URL
        let jdbcUrl = ''
        if (selectedDs.type === 'POSTGRESQL') {
          jdbcUrl = `jdbc:postgresql://${dsDetail.host}:${dsDetail.port}/${dsDetail.database}`
          source.driver = 'org.postgresql.Driver'
        } else if (selectedDs.type === 'ORACLE') {
          jdbcUrl = `jdbc:oracle:thin:@${dsDetail.host}:${dsDetail.port}:${dsDetail.database}`
          source.driver = 'oracle.jdbc.OracleDriver'
        }
        
        source.url = jdbcUrl
        source.user = dsDetail.userName
        source.password = dsDetail.password
      }
    } catch (unusedError) {
      // 获取数据源详情失败，静默忽略
    }
  }
}
```

#### 表单与弹窗的交互契约 (新架构)

随着插件与 DolphinScheduler 原生表单体系的深度集成，原有的 `expose({ validate, setValues, getValues })` 模式已被废弃，取而代之的是一套更原生、更健壮的 `widget` 架构。

- **统一入口 (`use-seatunnel-rest.ts`)**: 所有表单元素的定义，包括“任务名称”、“工作组”等标准字段和我们自定义的 `jobConfig` 配置区域，都被统一收敛在 `use-seatunnel-rest.ts` 文件中。
- **组件即 Widget**: 自定义的复杂表单 `SeaTunnelRestForm` 不再是一个独立的、需要手动管理的组件，而是作为一个 `widget` 被注册到 `jobConfig` 字段上。
  ```typescript
  // in use-seatunnel-rest.ts
  {
    type: 'custom',
    field: 'jobConfig',
    span: 24,
    widget: h(SeaTunnelRestForm) // 将自定义组件渲染为 VNode
  }
  ```
- **响应式数据流 (`provide/inject`)**: 父组件 `detail.tsx` 通过 `provide('model', model)` 将整个任务节点的响应式数据模型 `model` 提供出来。`SeaTunnelRestForm` 则通过 `inject('model')` 获取并直接与 `model.jobConfig` 进行双向数据绑定。这套机制取代了原有的 `setValues` 和 `getValues`，使得数据同步更加高效和自动化。
- **无缝集成**: 这种架构使得我们的自定义任务可以无缝复用 DolphinScheduler 的所有标准字段（如前置任务、超时告警、自定义参数等）和通用的表单校验、布局逻辑，极大地提升了集成度和可维护性。

**UI 表单结构**：
```
┌──────────────────────────────────────┐
│ Source #1                      [删除] │
├──────────────────────────────────────┤
│ 数据源: [下拉选择 PostgreSQL/Oracle] │
│ SQL 查询: [多行文本输入框]             │
│ Plugin Output: [source_1]            │
└──────────────────────────────────────┘
```

#### Sink 连接器组件
```typescript
// components/SinkConnector.tsx
// 类似 Source，但支持 DORIS 类型
// Doris 需要特殊处理 fenodes 字段
```

### 5.2 数据源持久化与工作流导入/导出兼容性

**问题**: `jobConfig` 在保存时若只包含 `url`, `user` 等具体连接信息，会导致工作流导入/导出后，因环境变化而失效，同时也丢失了与数据源中心的关联。

**解决方案 (最终实现)**:
采用“**前端存 ID，运行时解析**”的模式，并解决前端异步加载导致的回显失败问题。

1.  **修改存储逻辑**: 通过 `generateStorageJson` 工具函数，在 `watch` 监听器中生成只包含 `datasourceId` 的精简版 `jobConfig` JSON，用于持久化到 `model.jobConfig` 中。
2.  **修改加载逻辑 (`setValues`)**:
    - 在 `onMounted` hook 中，使用 `await Promise.all()` 强制等待 `loadSourceDatasources()` 和 `loadSinkDatasources()` 两个异步函数执行完毕，确保数据源下拉框的 `options` 列表已准备就绪。
    - 引入 `datasourcesLoaded` 状态标记，在 `watch(() => model.jobConfig)` 监听器中，确保只有在数据源列表加载完成后，才执行后续的 `jobConfig` 解析和表单赋值操作。
    - 这样从根本上保证了“数据准备先于数据回显”，彻底解决了因时序竞争导致的回显失败问题。
3.  **修改预览逻辑 (`generateJsonPreview`)**:
    - 预览时调用 `generateSeaTunnelEngineConfig(model, true)`，生成一份脱敏后的、不含 `datasourceId` 的**运行时**配置，让用户清晰地看到即将提交给 SeaTunnel 引擎的最终配置。

### 5.3 JSON 预览与密码加密

#### JSON 生成器
```typescript
// utils/json-generator.ts
import { cloneDeep } from 'lodash'

export function generateSeaTunnelConfig(model: any): string {
  const config = {
    env: model.env,
    source: model.sources.map(maskSensitiveFields),
    transform: model.transforms,
    sink: model.sinks.map(maskSensitiveFields)
  }
  
  return JSON.stringify(config, null, 2)
}

function maskSensitiveFields(connector: any) {
  const masked = cloneDeep(connector)
  const sensitiveKeys = ['password', 'username'] // 根据需要扩展
  
  sensitiveKeys.forEach(key => {
    if (masked[key]) {
      masked[key] = '***'  // 在预览中显示为星号
    }
  })
  
  return masked
}
```

#### Monaco Editor 集成
```typescript
// components/JsonPreview.tsx
import { defineComponent, watchEffect, ref } from 'vue'
import * as monaco from 'monaco-editor'

export default defineComponent({
  props: {
    value: String
  },
  setup(props) {
    const editorRef = ref(null)
    let editor: monaco.editor.IStandaloneCodeEditor | null = null
    
    watchEffect(() => {
      if (editor && props.value) {
        editor.setValue(props.value)
      }
    })
    
    onMounted(() => {
      editor = monaco.editor.create(editorRef.value!, {
        value: props.value || '',
        language: 'json',
        theme: 'vs-dark',
        readOnly: true,  // 只读模式
        minimap: { enabled: false },
        automaticLayout: true
      })
    })
    
    return { editorRef }
  }
})
```

### 5.4 表单验证

#### 验证规则
```typescript
// 使用 Naive UI 的表单验证
const formRules = {
  restEndpoint: {
    required: true,
    message: '请输入 SeaTunnel REST 端点',
    trigger: ['blur', 'input']
  },
  sources: {
    required: true,
    message: '至少需要一个 Source 连接器',
    validator: (rule: any, value: any) => {
      return value && value.length > 0
    }
  },
  sinks: {
    required: true,
    message: '至少需要一个 Sink 连接器',
    validator: (rule: any, value: any) => {
      return value && value.length > 0
    }
  }
}
```

## 6. 文件结构

```
dolphinscheduler-ui/src/views/projects/task/components/node/
├── detail.tsx                         # 根据任务类型选择表单组件
├── detail-modal.tsx                   # 弹窗载体，支持自定义宽度
├── task-forms/
│   └── seatunnel-rest/
│       ├── index.tsx                  # 主表单组件（基础/高级配置 + JSON 预览）
│       ├── index.module.scss          # 表单样式（左右分栏布局）
│       ├── types.ts                   # 配置模型与表单类型定义
│       └── utils.ts                   # JDBC 解析、JSON 生成、校验工具函数
├── tasks/
│   └── use-seatunnel-rest.ts          # 任务初始模型（通用字段）
└── format-data.ts                     # 前端 -> 后端 taskParams 格式化
```

---

## 7. 实施步骤

### Phase 1: 基础增强
- ✅ 创建设计文档
- ✅ 创建 Tabs 分组（基础/高级）
- ✅ 实现 Source 连接器动态选择（简化版：数据源 + SQL + Plugin Output）
- ✅ 集成数据源 API（`queryDataSourceList` + `queryDataSource`）

### Phase 2: JSON 预览
- ✅ 创建 JSON 预览组件（Monaco Editor）
- ✅ 密码加密显示（user/password -> `***`）
- ✅ 实时同步配置（`watchEffect` 监听模型变化）

### Phase 3: 高级功能
- ✅ Sink 连接器动态选择（PostgreSQL / Oracle / Doris）
- ✅ Transform 支持（Sql 编辑 + 输入输出关联）
- ✅ 表单核心校验（Source/Sink/Transform 必填检查）

### Phase 4: 架构重构与功能集成
- ✅ **架构重构**: 废弃 `expose` 模式，采用 `widget` + `provide/inject` 方案，融入 DS 原生表单体系。
- ✅ **标准字段集成**: 无缝集成任务名称、工作组、前置任务、自定义参数等所有标准字段。
- ✅ **修复核心 Bug**: 解决了因架构问题导致的"点击取消节点消失"的严重 Bug。
- ✅ **数据源持久化与回显**: 修复了异步加载导致的数据源回显失败问题。
- ✅ **性能优化**: 解决了 SQL 输入框实时输入时导致的全局重渲染和 API 重复调用的问题。
- ✅ **Source 高级选项**: 新增 `parallelism`, `partition_column`, `split.size`, `fetch_size` 四个高级选项，与 Sink 高级选项保持一致的折叠面板样式。

### Phase 5: UI/UX 优化与左侧栏配置
- ✅ **表单布局优化**: 调整通用输入框（任务名称、工作组等）宽度为半宽，优化视觉平衡。
- ✅ **区块背景色**: 为 Env、Source、Transform、Sink 配置卡片添加背景色区分，提升层次感。
- ✅ **删除按钮位置**: 调整 Source/Transform/Sink 动态卡片的删除按钮至右下角。
- ✅ **JSON 预览区域**: 优化标题垂直对齐，使 Monaco 编辑器高度动态填充可用空间。
- ✅ **任务分组与图标**: 修改后端 YAML 配置 (`task-type-config.yaml`)，将 `SEATUNNEL_REST` 从"数据集成"移至"通用组件"分组；添加 CSS 配置 (`dag.module.scss`) 使左侧任务栏正确显示自定义图标。

### Phase 6: 测试与文档
- ✅ **端到端测试**: 完成了核心的 Jdbc-to-Jdbc 数据同步流程和任务停止功能的测试。
- ✅ **文档更新**: 根据最终实现更新所有设计与计划文档。

---

## 8. 注意事项

### 8.1 现有项目规范
- 文档使用中文 [[memory:6502987]]

### 8.2 数据源映射

#### JDBC 连接器（Oracle/PostgreSQL）
- DS 数据源中的 `url`、`username`、`password` → SeaTunnel 的 `url`、`username`、`password`
- 自动识别 `driver`：
  - PostgreSQL: `org.postgresql.Driver`
  - Oracle: `oracle.jdbc.OracleDriver`

#### Doris 连接器
- DS 中 Doris 数据源存储为 JDBC 格式（当作 MySQL）：`jdbc:mysql://host:9030/dbname`
- SeaTunnel Doris Sink 需要 `fenodes: "host:8030"`（Stream Load HTTP 端口）
- **端口转换逻辑**：
  ```typescript
  // 从 DS 数据源中获取
  const jdbcUrl = "jdbc:mysql://192.168.1.100:9030/test"
  
  // 解析并转换
  const parsedUrl = parseJdbcUrl(jdbcUrl)
  const fenodes = `${parsedUrl.host}:8030`  // 9030 → 8030
  
  // 最终配置
  {
    plugin_name: "Doris",
    fenodes: "192.168.1.100:8030",
    database: "test",
    table: "sink_table",
    username: "root",
    password: "***"
  }
  ```

### 8.3 敏感信息处理
- 在 JSON 预览中：`password: "***"`
- 在实际提交时：使用原始值
- 使用 `cloneDeep` 避免修改原始对象

## 9. API 清单

### DolphinScheduler 数据源 API
```typescript
// 获取数据源列表
queryDataSourceList({ type: 'POSTGRESQL', testFlag: 0 })

// 获取数据库列表
getDatasourceDatabasesById(datasourceId)

// 获取表列表
getDatasourceTablesById(datasourceId, database)

// 获取表字段
getDatasourceTableColumnsById(datasourceId, database, tableName)
```

## 10. 待确认问题

1. ✅ DS 数据源 API - 已确认
2. ✅ 敏感信息处理 - JSON 预览显示 ***
3. 🔲 Doris 数据源是否需要扩展 DS 数据源类型
4. 🔲 Transform 是否只支持 SQL，还是需要支持其他类型

---

## 11. 实施进度摘要

|| 阶段 | 目标 | 状态 |
|------|------|------|
| Phase 1 | 基础增强：Tabs、Source 简化、数据源集成 | ✅ 已完成 |
| Phase 2 | JSON 预览：Monaco + 密码掩码 + 实时同步 | ✅ 已完成 |
| Phase 3 | 高级功能：Sink（JDBC + Doris）、Transform、校验 | ✅ 已完成 |
| Phase 4 | 架构重构与功能集成 | ✅ 已完成 |
| Phase 5 | UI/UX 优化与左侧栏配置 | ✅ 已完成 |
| Phase 6 | 端到端测试与文档 | ✅ 已完成 |

---

**文档版本**: v1.7
**创建时间**: 2025-10-13
**最后更新**: 2025-10-27
**变更记录**:
- v1.7 (2025-10-27): 新增 Phase 5（UI/UX 优化与左侧栏配置），补充 Source 高级选项的最终参数列表，更新实施进度摘要。
- v1.6 (2025-10-24): 重写"表单与弹窗的交互契约"，以反映从 `expose` 到 `widget` + `provide/inject` 的核心架构变更。更新实施步骤和进度摘要以匹配最终交付状态。
- v1.5 (2025-10-20): 明确数据源持久化方案的最终实现，阐述通过 async/await 解决回显时序问题的具体逻辑。
- v1.4 (2025-10-16): 补充 Doris 性能调优参数，增加数据源持久化设计方案。
- v1.3 (2025-10-16): 根据最终实现，更新 Sink 连接器的高级选项定义。
- v1.2 (2025-10-15): Sink/Transform 支持落地，校验与 JSON 生成更新
- v1.1 (2025-10-14): 简化 Source 配置，更新文件结构与实施进度
- v1.0 (2025-10-13): 初始版本

