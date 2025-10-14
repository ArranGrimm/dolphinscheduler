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

/**
 * SeaTunnel 连接器类型定义
 */

// 支持的数据源类型
export type DatasourceType = 'POSTGRESQL' | 'ORACLE' | 'DORIS'

// Env 配置
export interface EnvConfig {
  'job.mode'?: 'BATCH' | 'STREAMING'
  'job.name'?: string
  'execution.parallelism'?: number
  [key: string]: any
}

// Source 连接器配置（简化版）
export interface SourceConnector {
  plugin_name: 'Jdbc'
  datasourceId: number
  datasourceType: DatasourceType // 从数据源自动推断
  query: string // SQL 查询
  plugin_output: string // 输出表名
  // JDBC 连接信息（从数据源自动提取）
  url?: string
  driver?: string
  user?: string
  password?: string
  // 高级选项（可选）
  partition_column?: string
  partition_num?: number
  partition_lower_bound?: number
  partition_upper_bound?: number
  'split.size'?: number
  fetch_size?: number
  connection_check_timeout_sec?: number
}

// Transform SQL 配置
export interface TransformConnector {
  plugin_name: 'Sql'
  plugin_input: string
  plugin_output: string
  query: string
}

// Sink 连接器基础配置
export interface SinkConnectorBase {
  datasourceId: number
  datasourceType: DatasourceType
  plugin_input: string
  url?: string
  driver?: string
  user?: string
  password?: string
  database?: string
  table?: string
}

// Sink JDBC 配置
export interface SinkJdbcConnector extends SinkConnectorBase {
  plugin_name: 'Jdbc'
  datasourceType: 'POSTGRESQL' | 'ORACLE'
  primary_keys?: string[]
  generate_sink_sql?: boolean
}

// Sink Doris 配置
export interface SinkDorisConnector extends SinkConnectorBase {
  plugin_name: 'Doris'
  datasourceType: 'DORIS'
  fenodes?: string // 从 DS 数据源 URL 解析并转换端口
  username?: string
}

// Sink 高级选项
export interface SinkAdvancedOptions {
  batch_size?: number
  batch_interval_ms?: number
  is_exactly_once?: boolean
  enable_upsert?: boolean
  schema_save_mode?:
    | 'CREATE_SCHEMA_WHEN_NOT_EXIST'
    | 'RECREATE_SCHEMA'
    | 'ERROR_WHEN_SCHEMA_NOT_EXIST'
    | 'IGNORE'
  data_save_mode?:
    | 'APPEND_DATA'
    | 'DROP_DATA'
    | 'CUSTOM_PROCESSING'
    | 'ERROR_WHEN_DATA_EXISTS'
}

// Sink 完整配置
export type SinkConnector = (SinkJdbcConnector | SinkDorisConnector) &
  Partial<SinkAdvancedOptions>

// SeaTunnel 完整配置模型
export interface SeaTunnelConfigModel {
  // 基础配置
  restEndpoint: string
  connectTimeout: number
  socketTimeout: number
  pollInterval: number

  // Env 配置
  env: EnvConfig

  // 连接器配置
  sources: SourceConnector[]
  transforms: TransformConnector[]
  sinks: SinkConnector[]

  // 是否显示高级配置
  showAdvancedOptions: boolean
}

// 数据源信息（从 DS API 获取）
export interface DataSourceInfo {
  id: number
  name: string
  type: string
  connectionParams: {
    address?: string
    jdbcUrl?: string
    database?: string
    [key: string]: any
  }
}

// JDBC URL 解析结果
export interface ParsedJdbcUrl {
  protocol: string
  host: string
  port: number
  database?: string
}
