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
  // 并行分片
  partition_column?: string,
  partition_num?: number,
  partition_lower_bound?: number,
  partition_upper_bound?: number,
  
  // 拆分策略
  'split.size'?: number,
  
  // 批量设置
  fetch_size?: number,
  connection_check_timeout_sec?: number
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

**UI 表单结构**：
```

#### 表单与弹窗的交互契约

- DolphinScheduler 原生弹窗会在初始化时调用 `setValues(model)`，在提交前调用 `getValues()`，并执行 `validate()`。
- 自定义表单必须实现并通过 `expose({ validate, setValues, getValues })` 暴露这三个方法，才能与原生流程保持一致。
- `setValues` 负责写入基础配置与 `jobConfig` 中的 Source/Transform/Sink 列表；`getValues` 则返回带有最新 `jobConfig` 的 `INodeData`（使用最终 JSON 字符串）。
- 在 `detail.tsx` 中通过 `ref={setFormInstance}` 将自定义表单实例存入 `formRef`，避免影响原生 `Form` 组件的行为。
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

**问题**: 当前 `jobConfig` 在保存时丢失 `datasourceId`，导致工作流导入/导出后无法回显数据源。

**解决方案 (设计优化)**:
1. **修改存储逻辑 (`getValues`)**: 生成的 `jobConfig` JSON 中必须保留 `datasourceId`，同时移除 `password` 等衍生信息。
2. **修改加载逻辑 (`setValues`)**: 表单初始化时，优先读取 `datasourceId`，并根据它重新触发数据源详情查询，填充表单。
3. **分离“存储配置”与“提交配置”**: 确保用于持久化和用于运行时提交的配置分离，解决兼容性问题。

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

### Phase 4: 优化与测试
- ✅ 用户体验优化（自适应布局、移除动画、Flex 溢出修复）
- ⏳ 性能优化（渲染性能、懒加载等，如有需要）
- ⏳ 端到端测试

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

| 阶段 | 目标 | 状态 |
|------|------|------|
| Phase 1 | 基础增强：Tabs、Source 简化、数据源集成 | ✅ 已完成 |
| Phase 2 | JSON 预览：Monaco + 密码掩码 + 实时同步 | ✅ 已完成 |
| Phase 3 | 高级功能：Sink（JDBC + Doris）、Transform、校验 | ✅ 已完成 |
| Phase 4 | 优化与测试：体验优化、性能、端到端测试 | 🚧 进行中（体验 ✅，测试 ⏳） |

---

**文档版本**: v1.4  
**创建时间**: 2025-10-13  
**最后更新**: 2025-10-16  
**变更记录**:
- v1.4 (2025-10-16): 补充 Doris 性能调优参数，增加数据源持久化设计方案。
- v1.3 (2025-10-16): 根据最终实现，更新 Sink 连接器的高级选项定义。
- v1.2 (2025-10-15): Sink/Transform 支持落地，校验与 JSON 生成更新
- v1.1 (2025-10-14): 简化 Source 配置，更新文件结构与实施进度
- v1.0 (2025-10-13): 初始版本

