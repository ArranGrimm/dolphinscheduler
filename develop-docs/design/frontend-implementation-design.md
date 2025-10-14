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

#### Source 配置（动态多连接器）
```typescript
interface SourceConfig {
  plugin_name: 'Jdbc' // 固定值，后端根据数据源类型自动确定
  datasourceId: number // 从 DS 数据源中选择（必填）
  datasourceType: 'POSTGRESQL' | 'ORACLE' // 数据源类型（必填）
  
  // 表选择模式（二选一）
  queryMode: 'table' | 'sql'
  
  // 模式1: 直接选择表
  database?: string // 数据库名（自动填充或选择）
  table?: string // 表名（下拉选择）
  
  // 模式2: 自定义 SQL
  query?: string // SQL 查询（文本框）
  
  // 输出表名（必填）
  plugin_output: string
}
```

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
interface SinkConfig {
  plugin_name: 'Jdbc' | 'Doris'
  datasourceId: number
  datasourceType: 'POSTGRESQL' | 'ORACLE' | 'DORIS'
  
  // Jdbc 特有
  database?: string
  table?: string
  primary_keys?: string[] // CDC 场景
  
  // Doris 特有
  fenodes?: string // 自动从数据源配置中提取
  username?: string
  password?: string
  
  plugin_input: string // 关联 source/transform 的 plugin_output
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
  
  // CDC 设置
  is_exactly_once?: boolean,
  enable_upsert?: boolean,
  schema_save_mode?: 'CREATE_SCHEMA_WHEN_NOT_EXIST' | 'RECREATE_SCHEMA' | ...,
  data_save_mode?: 'APPEND_DATA' | 'DROP_DATA' | ...
}
```

## 5. 核心功能实现

### 5.1 动态连接器管理

#### Source 连接器组件
```typescript
// components/SourceConnector.tsx
import { defineComponent, ref } from 'vue'
import { useDatasource } from '@/views/projects/task/components/node/fields/use-datasource'

export default defineComponent({
  props: {
    modelValue: Object,
    index: Number
  },
  setup(props, { emit }) {
    const model = ref({
      datasourceType: null,
      datasourceId: null,
      queryMode: 'table',
      database: null,
      table: null,
      query: null,
      plugin_output: `source_${props.index + 1}`
    })
    
    // 使用现有的 useDatasource hook
    const datasourceFields = useDatasource(model, {
      supportedDatasourceType: ['POSTGRESQL', 'ORACLE']
    })
    
    // 当选择数据源后，自动加载数据库列表
    const onDatasourceChange = async () => {
      if (model.value.datasourceId) {
        const databases = await getDatasourceDatabasesById(model.value.datasourceId)
        // ...
      }
    }
    
    return { model, datasourceFields, onDatasourceChange }
  }
})
```

#### Sink 连接器组件
```typescript
// components/SinkConnector.tsx
// 类似 Source，但支持 DORIS 类型
// Doris 需要特殊处理 fenodes 字段
```

### 5.2 JSON 预览与密码加密

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

### 5.3 表单验证

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
├── tasks/
│   ├── use-seatunnel-rest.ts         # 现有文件（保持最小配置）
│   └── use-seatunnel-rest-enhanced.ts # 新增：增强版配置
├── fields/
│   ├── use-seatunnel-rest.ts         # 现有文件
│   └── use-seatunnel-connector.ts    # 新增：连接器字段定义
└── components/
    └── seatunnel/                     # 新增目录
        ├── SourceConnector.tsx        # Source 连接器组件
        ├── SinkConnector.tsx          # Sink 连接器组件
        ├── TransformEditor.tsx        # Transform 编辑器
        ├── JsonPreview.tsx            # JSON 预览组件
        ├── ConnectorList.tsx          # 连接器列表管理
        └── types.ts                   # 类型定义
```

## 7. 实施步骤

### Phase 1: 基础增强（优先）
1. ✅ 创建设计文档
2. 🔲 创建 Tabs 分组（基础/高级）
3. 🔲 实现 Source 连接器动态选择
4. 🔲 实现 Sink 连接器动态选择
5. 🔲 集成数据源 API

### Phase 2: JSON 预览
1. 🔲 创建 JSON 预览组件
2. 🔲 实现密码加密显示
3. 🔲 实现实时同步

### Phase 3: 高级功能
1. 🔲 添加 Transform 支持
2. 🔲 完善表单验证
3. 🔲 添加连接器模板

### Phase 4: 优化与测试
1. 🔲 性能优化
2. 🔲 用户体验优化
3. 🔲 端到端测试

## 8. 注意事项

### 8.1 现有项目规范
- 使用 Bun 安装依赖（不使用 npm）[[memory:6281299]]
- 使用 DaisyUI 颜色、Heroicons 图标、ApexCharts 图表 [[memory:8826200]]
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

**文档版本**: v1.0  
**创建时间**: 2025-10-13  
**最后更新**: 2025-10-13

