/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  ParsedJdbcUrl,
  SeaTunnelConfigModel,
  SourceConnector,
  SinkConnector
} from './types'

/**
 * 解析 JDBC URL
 * 支持格式：
 * - jdbc:postgresql://host:port/database
 * - jdbc:oracle:thin:@host:port:sid
 * - jdbc:mysql://host:port/database (Doris 在 DS 中存储为 MySQL 格式)
 */
export function parseJdbcUrl(jdbcUrl: string): ParsedJdbcUrl | null {
  if (!jdbcUrl) return null

  try {
    // PostgreSQL: jdbc:postgresql://host:port/database
    const pgMatch = jdbcUrl.match(
      /jdbc:postgresql:\/\/([^:]+):(\d+)(?:\/(.+))?/
    )
    if (pgMatch) {
      return {
        protocol: 'postgresql',
        host: pgMatch[1],
        port: parseInt(pgMatch[2]),
        database: pgMatch[3]
      }
    }

    // MySQL/Doris: jdbc:mysql://host:port/database
    const mysqlMatch = jdbcUrl.match(/jdbc:mysql:\/\/([^:]+):(\d+)(?:\/(.+))?/)
    if (mysqlMatch) {
      return {
        protocol: 'mysql',
        host: mysqlMatch[1],
        port: parseInt(mysqlMatch[2]),
        database: mysqlMatch[3]
      }
    }

    // Oracle: jdbc:oracle:thin:@host:port:sid
    // 或 jdbc:oracle:thin:@host:port/service_name
    const oracleMatch = jdbcUrl.match(/jdbc:oracle:thin:@([^:]+):(\d+)[:/](.+)/)
    if (oracleMatch) {
      return {
        protocol: 'oracle',
        host: oracleMatch[1],
        port: parseInt(oracleMatch[2]),
        database: oracleMatch[3]
      }
    }

    return null
  } catch (unusedError) {
    // Failed to parse JDBC URL
    return null
  }
}

/**
 * 从 DS 数据源配置中提取 JDBC URL
 */
export function extractJdbcUrl(connectionParams: any): string | null {
  // DS 数据源可能存储在 address 或 jdbcUrl 字段
  return connectionParams?.address || connectionParams?.jdbcUrl || null
}

/**
 * 转换 Doris 端口：9030 (MySQL协议) -> 8030 (HTTP Stream Load)
 */
export function convertDorisPort(jdbcUrl: string): string | null {
  const parsed = parseJdbcUrl(jdbcUrl)
  if (!parsed) return null

  // Doris 的 Stream Load 使用 HTTP 端口 8030
  return `${parsed.host}:8030`
}

/**
 * 生成 SeaTunnel 配置 JSON（用于提交到 SeaTunnel 引擎）
 * @param model 表单数据模型
 * @param maskSensitive 是否脱敏密码等字段（用于UI预览）
 * @returns 提交给 SeaTunnel 的配置对象
 */
export function generateSeaTunnelEngineConfig(
  model: SeaTunnelConfigModel,
  maskSensitive = false
): any {
  const config: any = {}

  // Env 配置
  if (model.env && Object.keys(model.env).length > 0) {
    config.env = { ...model.env }
  }

  // Source 配置（简化版 - 只支持 SQL 查询）
  if (model.sources && model.sources.length > 0) {
    config.source = model.sources.map((s) => {
      const source: any = {
        plugin_name: s.plugin_name,
        query: s.query,
        plugin_output: s.plugin_output
      }

      // JDBC 连接信息
      if (s.url) source.url = s.url
      if (s.driver) source.driver = s.driver
      if (s.user) {
        source.user = maskSensitive ? '***' : s.user
      }
      if (s.password) {
        source.password = maskSensitive ? '***' : s.password
      }

      // 移除 datasourceId，因为它不是 SeaTunnel 引擎的配置项
      delete source.datasourceId

      // 高级选项（可选）
      if (s.partition_column) source.partition_column = s.partition_column
      if (s.partition_num) source.partition_num = s.partition_num
      if (s['split.size']) source['split.size'] = s['split.size']
      if (s.fetch_size) source.fetch_size = s.fetch_size
      if (s.connection_check_timeout_sec)
        source.connection_check_timeout_sec = s.connection_check_timeout_sec

      return source
    })
  }

  // Transform 配置
  if (model.transforms && model.transforms.length > 0) {
    config.transform = model.transforms.map((t) => ({
      plugin_name: t.plugin_name,
      plugin_input: t.plugin_input,
      plugin_output: t.plugin_output,
      query: t.query
    }))
  }

  // Sink 配置
  if (model.sinks && model.sinks.length > 0) {
    config.sink = model.sinks.map((s) => {
      const sink: any = {
        plugin_name: s.plugin_name,
        plugin_input: s.plugin_input
      }

      if (s.url) sink.url = s.url
      if (s.driver) sink.driver = s.driver
      if (s.plugin_name === 'Jdbc' && s.user) {
        sink.user = maskSensitive ? '***' : s.user
      }
      if (s.plugin_name === 'Doris' && (s as any).username) {
        sink.username = maskSensitive ? '***' : (s as any).username
      }
      if (s.password) {
        sink.password = maskSensitive ? '***' : s.password
      }

      // 移除 datasourceId
      delete sink.datasourceId

      if (s.database) sink.database = s.database
      if (s.table) sink.table = s.table

      if (s.plugin_name === 'Jdbc') {
        // --- FIX: Add missing query field inside the type guard ---
        if (s.query) sink.query = s.query
        // --- END FIX ---
        if ((s as any).primary_keys) sink.primary_keys = (s as any).primary_keys
        if ((s as any).generate_sink_sql !== undefined) {
          sink.generate_sink_sql = (s as any).generate_sink_sql
        }
      }

      if (s.plugin_name === 'Doris') {
        const dorisSink = s as any
        if (dorisSink.fenodes) sink.fenodes = dorisSink.fenodes
      }

      if (s.batch_size) sink.batch_size = s.batch_size
      if (s.batch_interval_ms) sink.batch_interval_ms = s.batch_interval_ms
      if (s.is_exactly_once !== undefined)
        sink.is_exactly_once = s.is_exactly_once
      if (s.enable_upsert !== undefined) sink.enable_upsert = s.enable_upsert
      if (s.schema_save_mode) sink.schema_save_mode = s.schema_save_mode
      if (s.data_save_mode) sink.data_save_mode = s.data_save_mode

      return sink
    })
  }

  return config
}

/**
 * 生成用于存储在 DolphinScheduler 数据库中的 jobConfig JSON
 * @param model 表单数据模型
 * @returns 存储用的配置对象，保留 datasourceId，移除衍生字段
 */
export function generateStorageConfig(model: SeaTunnelConfigModel): any {
  const config: any = {}

  if (model.env && Object.keys(model.env).length > 0) {
    config.env = { ...model.env }
  }

  // 只保留核心和用户手动输入的字段
  const keepKeys = [
    'plugin_name',
    'datasourceId',
    'query',
    'plugin_output',
    'plugin_input',
    'database',
    'table',
    'primary_keys',
    'generate_sink_sql',
    'enable_upsert',
    'data_save_mode',
    'batch_size',
    'batch_interval_ms',
    'max_retries',
    'sink.enable-2pc',
    'sink.label-prefix',
    'doris.batch.size',
    'sink.buffer-size',
    'sink.buffer-count',
    'doris.config'
  ]

  const simplifyConnector = (connector: SourceConnector | SinkConnector) => {
    const simple: Record<string, any> = {}
    for (const key of keepKeys) {
      if (key in connector) {
        const value = (connector as any)[key]

        // FIX: Exclude empty 'table' and 'primary_keys' from stored config
        if (key === 'table' && value === '') {
          continue
        }
        if (
          key === 'primary_keys' &&
          Array.isArray(value) &&
          value.length === 0
        ) {
          continue
        }

        simple[key] = value
      }
    }
    return simple
  }

  if (model.sources && model.sources.length > 0) {
    config.source = model.sources.map(simplifyConnector)
  }

  if (model.transforms && model.transforms.length > 0) {
    config.transform = model.transforms // Transform 不涉及数据源，直接复制
  }

  if (model.sinks && model.sinks.length > 0) {
    config.sink = model.sinks.map(simplifyConnector)
  }

  return config
}

/**
 * 生成格式化的 JSON 字符串（用于预览）
 * @description 预览时显示最全的信息，包括 datasourceId 和脱敏后的连接详情
 */
export function generateJsonPreview(model: SeaTunnelConfigModel): string {
  // 直接调用引擎配置生成函数，并启用脱敏
  const previewConfig = generateSeaTunnelEngineConfig(model, true)
  return JSON.stringify(previewConfig, null, 2)
}

/**
 * 生成最终提交到 DS 后端存储的 JSON 字符串
 */
export function generateStorageJson(model: SeaTunnelConfigModel): string {
  const config = generateStorageConfig(model)
  return JSON.stringify(config)
}

/**
 * 验证配置完整性
 */
export function validateConfig(model: SeaTunnelConfigModel): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // 检查至少有一个 Source
  if (!model.sources || model.sources.length === 0) {
    errors.push('至少需要配置一个 Source 连接器')
  }

  // 检查至少有一个 Sink
  if (!model.sinks || model.sinks.length === 0) {
    errors.push('至少需要配置一个 Sink 连接器')
  }

  // 检查 Source 配置完整性（简化版）
  model.sources?.forEach((source, index) => {
    if (source.datasourceId === null || source.datasourceId === undefined) {
      errors.push(`Source ${index + 1}: 必须选择数据源`)
    }
    if (!source.query || source.query.trim() === '') {
      errors.push(`Source ${index + 1}: 必须输入 SQL 查询`)
    }
    if (!source.plugin_output || source.plugin_output.trim() === '') {
      errors.push(`Source ${index + 1}: 必须指定 Plugin Output`)
    }
  })

  // 检查 Sink 配置完整性
  model.sinks?.forEach((sink, index) => {
    if (!sink.plugin_input) {
      errors.push(`Sink ${index + 1}: 缺少输入 Plugin`)
    }

    if (sink.datasourceId === null || sink.datasourceId === undefined) {
      errors.push(`Sink ${index + 1}: 必须选择数据源`)
    }

    if (sink.plugin_name === 'Jdbc') {
      if (!sink.table || sink.table.trim() === '') {
        errors.push(`Sink ${index + 1}: 必须指定目标表`)
      }
    } else if (sink.plugin_name === 'Doris') {
      const dorisSink = sink as any
      if (!dorisSink.fenodes || dorisSink.fenodes.trim() === '') {
        errors.push(`Sink ${index + 1}: Doris 必须指定 fenodes`)
      }
      if (!sink.table || sink.table.trim() === '') {
        errors.push(`Sink ${index + 1}: Doris 必须指定目标表`)
      }
    }
  })

  model.transforms?.forEach((transform, index) => {
    if (!transform.plugin_input) {
      errors.push(`Transform ${index + 1}: 必须指定输入 Plugin`)
    }
    if (!transform.plugin_output || transform.plugin_output.trim() === '') {
      errors.push(`Transform ${index + 1}: 必须指定输出 Plugin`)
    }
    if (!transform.query || transform.query.trim() === '') {
      errors.push(`Transform ${index + 1}: 必须输入 SQL 查询`)
    }
  })

  return {
    valid: errors.length === 0,
    errors
  }
}
