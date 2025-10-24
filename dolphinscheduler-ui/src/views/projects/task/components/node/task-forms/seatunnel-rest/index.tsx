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

import {
  defineComponent,
  ref,
  reactive,
  computed,
  watch,
  onMounted,
  inject
} from 'vue'
import {
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NButton,
  NSpace,
  NCard,
  NCollapse,
  NCollapseItem,
  NIcon,
  NText,
  NElement,
  NSelect,
  NSwitch,
  NDynamicInput
} from 'naive-ui'
import { PlusCircleOutlined } from '@vicons/antd'
import Monaco from '@/components/monaco-editor'
import type {
  SeaTunnelConfigModel,
  SourceConnector,
  SinkConnector,
  TransformConnector,
  SinkDorisConnector,
  SinkJdbcConnector
} from './types'
import {
  generateJsonPreview,
  validateConfig,
  convertDorisPort,
  extractJdbcUrl,
  generateStorageJson
} from './utils'
import styles from './index.module.scss'
import {
  queryDataSourceList,
  queryDataSource
} from '@/service/modules/data-source'
import { INodeData } from '../../types'

export default defineComponent({
  name: 'SeaTunnelRestForm',
  props: {
    readonly: {
      type: Boolean,
      default: false
    }
  },
  setup(props, { expose }) {
    const formRef = ref()
    const model = inject('model') as INodeData

    const configModel = reactive<SeaTunnelConfigModel>({
      env: {
        'job.mode': 'BATCH',
        parallelism: 4,
        'job.name': '${system.task.definition.name}'
      },
      sources: [],
      transforms: [],
      sinks: [],
      showAdvancedOptions: false
    })

    // 数据源相关状态（简化版）
    const sourceDatasourceOptions = ref<any[]>([]) // Source 数据源（ORACLE + POSTGRESQL）
    const sinkDatasourceOptions = ref<any[]>([]) // Sink 数据源（ORACLE + POSTGRESQL + DORIS）
    const loadingDatasources = ref(false)
    const loadingSinkDatasources = ref(false)
    const datasourcesLoaded = ref(false) // <--- 添加这一行

    const pluginOutputOptions = computed(() => {
      const options: { label: string; value: string }[] = []
      configModel.sources.forEach((source) => {
        if (source.plugin_output) {
          options.push({
            label: `${source.plugin_output}`,
            value: source.plugin_output
          })
        }
      })
      configModel.transforms.forEach((transform) => {
        if (transform.plugin_output) {
          options.push({
            label: `${transform.plugin_output}`,
            value: transform.plugin_output
          })
        }
      })
      return options
    })

    const getTransformInputOptions = (currentTransformIndex: number) => {
      const options: { label: string; value: string }[] = []

      // 1. 添加所有 Source 的输出
      configModel.sources.forEach((source) => {
        if (source.plugin_output) {
          options.push({
            label: source.plugin_output,
            value: source.plugin_output
          })
        }
      })

      // 2. 只添加在当前 Transform 以外的其他 Transform 的输出
      configModel.transforms.forEach((transform, index) => {
        if (index !== currentTransformIndex && transform.plugin_output) {
          options.push({
            label: transform.plugin_output,
            value: transform.plugin_output
          })
        }
      })

      return options
    }

    const jsonPreview = computed(() => {
      return generateJsonPreview(configModel)
    })

    watch(
      configModel,
      () => {
        const newJobConfig = generateStorageJson(configModel)
        // Prevent infinite loops by checking if the value has actually changed
        if (model && newJobConfig !== model.jobConfig) {
          model.jobConfig = newJobConfig
        }
      },
      { deep: true }
    )

    // 加载 Source 数据源（ORACLE + POSTGRESQL）
    const loadSourceDatasources = async () => {
      if (loadingDatasources.value) return
      loadingDatasources.value = true
      try {
        const [pgList, oracleList] = await Promise.all([
          queryDataSourceList({ type: 'POSTGRESQL' }),
          queryDataSourceList({ type: 'ORACLE' })
        ])

        sourceDatasourceOptions.value = [
          ...(pgList || []).map((ds: any) => ({
            label: `${ds.name} (PostgreSQL)`,
            value: ds.id,
            type: 'POSTGRESQL',
            ...ds
          })),
          ...(oracleList || []).map((ds: any) => ({
            label: `${ds.name} (Oracle)`,
            value: ds.id,
            type: 'ORACLE',
            ...ds
          }))
        ]
      } catch (unusedError) {
        sourceDatasourceOptions.value = []
      } finally {
        loadingDatasources.value = false
      }
    }

    const loadSinkDatasources = async () => {
      if (loadingSinkDatasources.value) return
      loadingSinkDatasources.value = true
      try {
        const [pgList, oracleList, dorisList] = await Promise.all([
          queryDataSourceList({ type: 'POSTGRESQL' }),
          queryDataSourceList({ type: 'ORACLE' }),
          queryDataSourceList({ type: 'DORIS' })
        ])

        sinkDatasourceOptions.value = [
          ...(pgList || []).map((ds: any) => ({
            label: `${ds.name} (PostgreSQL)`,
            value: ds.id,
            type: 'POSTGRESQL',
            ...ds
          })),
          ...(oracleList || []).map((ds: any) => ({
            label: `${ds.name} (Oracle)`,
            value: ds.id,
            type: 'ORACLE',
            ...ds
          })),
          ...(dorisList || []).map((ds: any) => ({
            label: `${ds.name} (Doris)`,
            value: ds.id,
            type: 'DORIS',
            ...ds
          }))
        ]
      } catch (unusedError) {
        sinkDatasourceOptions.value = []
      } finally {
        loadingSinkDatasources.value = false
      }
    }

    onMounted(async () => {
      // Load datasources first
      await Promise.all([loadSourceDatasources(), loadSinkDatasources()])
      datasourcesLoaded.value = true
      // Then parse the initial value from the injected model
      if (model) {
        setValues(model.jobConfig || '{}')
      }
    })

    const addSource = () => {
      configModel.sources.push({
        plugin_name: 'Jdbc',
        datasourceId: null,
        datasourceType: 'POSTGRESQL',
        query: '',
        plugin_output: `source_${configModel.sources.length + 1}`,
        fetch_size: 5000
      })
    }

    // 当数据源改变时，自动更新数据源类型并提取 JDBC 连接信息
    const onSourceDatasourceChange = async (
      source: SourceConnector,
      datasourceId: number
    ) => {
      const selectedDs = sourceDatasourceOptions.value.find(
        (ds) => ds.value === datasourceId
      )
      if (selectedDs) {
        source.datasourceType = selectedDs.type

        try {
          // 获取数据源详细信息
          const dsDetail = await queryDataSource(datasourceId)

          // 提取 JDBC 连接信息
          if (dsDetail) {
            // 构造 JDBC URL
            let jdbcUrl = ''
            if (selectedDs.type === 'POSTGRESQL') {
              jdbcUrl = `jdbc:postgresql://${dsDetail.host}:${dsDetail.port}/${dsDetail.database}`
              source.driver = 'org.postgresql.Driver'
            } else if (selectedDs.type === 'ORACLE') {
              // Oracle URL 格式: jdbc:oracle:thin:@host:port:sid 或 jdbc:oracle:thin:@host:port/service
              jdbcUrl = `jdbc:oracle:thin:@${dsDetail.host}:${dsDetail.port}:${dsDetail.database}`
              source.driver = 'oracle.jdbc.OracleDriver'
            }

            source.url = jdbcUrl
            source.user = dsDetail.userName
            source.password = dsDetail.password
          }
        } catch (unusedError) {
          // 获取数据源详情失败，忽略错误
        }
      }
    }

    const removeSource = (index: number) => {
      configModel.sources.splice(index, 1)
    }

    const addTransform = () => {
      const defaultInput = pluginOutputOptions.value[0]?.value || ''
      configModel.transforms.push({
        plugin_name: 'Sql',
        plugin_input: defaultInput,
        plugin_output: `transform_${configModel.transforms.length + 1}`,
        query: ''
      } as TransformConnector)
    }

    const removeTransform = (index: number) => {
      configModel.transforms.splice(index, 1)
    }

    const addSink = () => {
      const defaultInput = pluginOutputOptions.value[0]?.value || ''
      configModel.sinks.push({
        plugin_name: 'Jdbc',
        datasourceId: null,
        datasourceType: 'POSTGRESQL',
        plugin_input: defaultInput,
        database: '',
        table: '',
        url: '',
        driver: '',
        user: '',
        password: '',
        query: '',
        generate_sink_sql: true,
        primary_keys: [],
        batch_size: 1000,
        batch_interval_ms: 1000,
        max_retries: 3,
        enable_upsert: false,
        data_save_mode: 'APPEND_DATA'
      } as SinkConnector)
    }

    const onSinkDatasourceChange = async (
      sink: SinkConnector,
      datasourceId: number
    ) => {
      const selectedDs = sinkDatasourceOptions.value.find(
        (ds) => ds.value === datasourceId
      )
      if (!selectedDs) {
        sink.datasourceType = 'POSTGRESQL'
        sink.plugin_name = 'Jdbc'
        sink.datasourceId = null
        return
      }

      sink.datasourceType = selectedDs.type
      sink.datasourceId = datasourceId

      try {
        const dsDetail = await queryDataSource(datasourceId)
        let connectionParams: Record<string, any> | undefined
        const connectionParamsRaw = dsDetail?.connectionParams

        if (connectionParamsRaw) {
          if (typeof connectionParamsRaw === 'string') {
            try {
              connectionParams = JSON.parse(connectionParamsRaw)
            } catch (unusedError) {
              connectionParams = undefined
            }
          } else {
            connectionParams = connectionParamsRaw
          }
        }

        const connectionJdbcUrl = connectionParams
          ? extractJdbcUrl(connectionParams)
          : ''
        const fallbackUrl = convertToJdbcUrl(dsDetail, selectedDs.type)
        const jdbcUrl = connectionJdbcUrl || dsDetail?.jdbcUrl || fallbackUrl

        if (selectedDs.type === 'POSTGRESQL') {
          sink.plugin_name = 'Jdbc'
          sink.driver = 'org.postgresql.Driver'
          sink.url =
            jdbcUrl ||
            `jdbc:postgresql://${dsDetail.host || ''}:${dsDetail.port || ''}/${
              dsDetail.database || ''
            }`
          sink.user = dsDetail.userName
          sink.password = dsDetail.password
          // --- FIX: Respect query mode ---
          if (!(sink as SinkJdbcConnector).query) {
            sink.database =
              connectionParams?.database || dsDetail.database || ''
          }
          // --- END FIX ---
        } else if (selectedDs.type === 'ORACLE') {
          sink.plugin_name = 'Jdbc'
          sink.driver = 'oracle.jdbc.OracleDriver'
          sink.url =
            jdbcUrl ||
            `jdbc:oracle:thin:@${dsDetail.host || ''}:${dsDetail.port || ''}:${
              dsDetail.database || ''
            }`
          sink.user = dsDetail.userName
          sink.password = dsDetail.password
          // --- FIX: Respect query mode ---
          if (!(sink as SinkJdbcConnector).query) {
            sink.database =
              connectionParams?.database || dsDetail.database || ''
          }
          // --- END FIX ---
        } else if (selectedDs.type === 'DORIS') {
          sink.plugin_name = 'Doris'
          sink.driver = ''
          sink.url = jdbcUrl || fallbackUrl
          const fenodes = convertDorisPort(sink.url || '')
          ;(sink as SinkDorisConnector).fenodes = fenodes || ''
          sink.database = connectionParams?.database || dsDetail.database || ''
          sink.table = sink.table || ''
          ;(sink as SinkDorisConnector).username =
            connectionParams?.username || dsDetail.userName || ''
          sink.user = connectionParams?.username || dsDetail.userName || ''
          sink.password = dsDetail.password
        }
      } catch (unusedError) {
        // ignore
      }
    }

    const removeSink = (index: number) => {
      configModel.sinks.splice(index, 1)
    }

    watch(
      pluginOutputOptions,
      (options) => {
        const values = options.map((item) => item.value)
        const fallback = values[0] || ''
        configModel.transforms.forEach((transform) => {
          if (!values.includes(transform.plugin_input)) {
            transform.plugin_input = fallback
          }
        })
        configModel.sinks.forEach((sink) => {
          if (!values.includes(sink.plugin_input)) {
            sink.plugin_input = fallback
          }
        })
      },
      { deep: true, immediate: true }
    )

    const assignArray = <T extends Record<string, any>>(
      target: T[],
      source: T[]
    ) => {
      target.splice(0, target.length, ...source.map((item) => ({ ...item })))
    }

    const setValues = (jobConfigStr: string) => {
      if (jobConfigStr) {
        try {
          const parsed = JSON.parse(jobConfigStr)
          configModel.env = parsed.env || {
            'job.mode': 'BATCH',
            parallelism: 4,
            'job.name': '${system.task.definition.name}'
          }
          const sourcesWithDefaults = (parsed.source || []).map((s: any) => ({
            ...s,
            fetch_size: s.fetch_size ?? 5000
          }))
          assignArray(configModel.sources, sourcesWithDefaults)
          assignArray(configModel.transforms, parsed.transform || [])
          assignArray(configModel.sinks, parsed.sink || [])

          // 触发数据源详情的重新加载
          configModel.sources.forEach((s) => {
            if (s.datasourceId) {
              onSourceDatasourceChange(s, s.datasourceId)
            }
          })
          configModel.sinks.forEach((s) => {
            if (s.datasourceId) {
              onSinkDatasourceChange(s, s.datasourceId)
            }
          })
        } catch (unusedError) {
          assignArray(configModel.sources, [])
          assignArray(configModel.transforms, [])
          assignArray(configModel.sinks, [])
        }
      } else {
        assignArray(configModel.sources, [])
        assignArray(configModel.transforms, [])
        assignArray(configModel.sinks, [])
        configModel.env = { 'job.mode': 'BATCH' }
      }
    }

    watch(
      () => model?.jobConfig,
      (newVal) => {
        // This watch handles external updates to the jobConfig string.
        // It's crucial for initializing the form and for handling undo/redo or programmatic changes.
        if (!datasourcesLoaded.value) {
          return
        }
        // --- START FIX ---
        // Only call setValues if the external value is different from the internal state.
        // This breaks the feedback loop where internal changes trigger a full re-render.
        if (newVal !== generateStorageJson(configModel)) {
          setValues(newVal || '{}')
        }
        // --- END FIX ---
      }
    )

    const validate = async () => {
      const result = validateConfig(configModel)
      if (!result.valid) {
        return result
      }
      return { valid: true, errors: [] }
    }

    expose({ validate })

    return () => (
      <NElement tag='div' class={styles['seatunnel-rest-form']}>
        {/* 左侧：表单区域 (58%) */}
        <NElement tag='div' class={styles['form-section']}>
          <NForm ref={formRef} model={configModel} disabled={props.readonly}>
            <NTabs type='line' animated>
              {/* 基础配置 Tab */}
              <NTabPane name='basic' tab='迁移任务配置'>
                <NSpace vertical size='large'>
                  {/* Env 配置 */}
                  <NCard
                    title='Env 配置'
                    size='small'
                    class={styles['config-card']}
                  >
                    <NFormItem label='任务模式' path='job.mode'>
                      <NSelect
                        options={[
                          { label: 'BATCH', value: 'BATCH' },
                          { label: 'STREAM', value: 'STREAMING' }
                        ]}
                        v-model:value={configModel.env['job.mode']}
                        style='width: 25%'
                      />
                    </NFormItem>
                    <NFormItem
                      label='全局并行度'
                      path='parallelism'
                      // label-placement='left'
                    >
                      <NInputNumber
                        v-model:value={configModel.env.parallelism}
                        min={1}
                        placeholder='1'
                        style='width: 25%'
                      />
                    </NFormItem>
                    <NFormItem
                      label='迁移任务名称'
                      path='job.name'
                      // label-placement='left'
                    >
                      <NInput
                        v-model:value={configModel.env['job.name']}
                        placeholder='${system.task.definition.name}'
                        style='width: 50%'
                      />
                    </NFormItem>
                  </NCard>

                  {/* Source 配置 */}
                  <NCard
                    title='Source 配置'
                    size='small'
                    class={styles['config-card']}
                  >
                    {{
                      header: () => (
                        <NSpace
                          justify='space-between'
                          align='center'
                          class={styles['card-header']}
                        >
                          <NText>Source 配置</NText>
                          <NButton
                            size='small'
                            onClick={addSource}
                            disabled={props.readonly}
                          >
                            {{
                              icon: () => (
                                <NIcon>
                                  <PlusCircleOutlined />
                                </NIcon>
                              ),
                              default: () => '添加 Source'
                            }}
                          </NButton>
                        </NSpace>
                      ),
                      default: () =>
                        configModel.sources.length === 0 ? (
                          <NSpace class={styles.placeholder}>
                            <NText depth='3'>
                              暂无 Source 配置，请点击右上角按钮添加
                            </NText>
                          </NSpace>
                        ) : (
                          <NSpace vertical>
                            {configModel.sources.map((source, index) => (
                              <NCard key={index} size='small'>
                                <NSpace vertical>
                                  <NFormItem label='数据源' required>
                                    <NSelect
                                      v-model:value={source.datasourceId}
                                      options={sourceDatasourceOptions.value}
                                      placeholder='选择数据源'
                                      loading={loadingDatasources.value}
                                      disabled={props.readonly}
                                      onUpdateValue={(value: number) =>
                                        onSourceDatasourceChange(source, value)
                                      }
                                      filterable
                                    />
                                  </NFormItem>
                                  <NFormItem label='SQL 查询' required>
                                    <NInput
                                      v-model:value={source.query}
                                      type='textarea'
                                      placeholder='SELECT * FROM your_table WHERE ...'
                                      rows={4}
                                      disabled={props.readonly}
                                    />
                                  </NFormItem>
                                  <NFormItem label='Plugin Output' required>
                                    <NInput
                                      v-model:value={source.plugin_output}
                                      placeholder='source_1'
                                      disabled={props.readonly}
                                    />
                                  </NFormItem>
                                </NSpace>
                                <NCollapse>
                                  <NCollapseItem
                                    title='高级选项'
                                    name={`source-advanced-${index}`}
                                  >
                                    <NSpace vertical>
                                      <NFormItem label='并行度'>
                                        <NInputNumber
                                          v-model:value={source.parallelism}
                                          min={1}
                                          placeholder='如不填写默认使用Env中的并行度'
                                          style={{ width: '100%' }}
                                        />
                                      </NFormItem>
                                      <NFormItem label='分区列'>
                                        <NInput
                                          v-model:value={
                                            source.partition_column
                                          }
                                          placeholder='仅支持一列, 必须属于支持的拆分数据类型(最好是数字类型)'
                                        />
                                      </NFormItem>
                                      <NFormItem label='分片大小'>
                                        <NInputNumber
                                          v-model:value={source['split.size']}
                                          min={1}
                                          placeholder='8096'
                                          style={{ width: '100%' }}
                                        />
                                      </NFormItem>
                                      <NFormItem label='拉取大小'>
                                        <NInputNumber
                                          v-model:value={source.fetch_size}
                                          min={1}
                                          placeholder='5000'
                                          style={{ width: '100%' }}
                                        />
                                      </NFormItem>
                                    </NSpace>
                                  </NCollapseItem>
                                </NCollapse>
                                <NSpace justify='end'>
                                  <NButton
                                    size='small'
                                    onClick={() => removeSource(index)}
                                    disabled={props.readonly}
                                  >
                                    删除
                                  </NButton>
                                </NSpace>
                              </NCard>
                            ))}
                          </NSpace>
                        )
                    }}
                  </NCard>

                  {/* Transform 配置 */}
                  <NCard
                    title='Transform 配置'
                    size='small'
                    class={styles['config-card']}
                  >
                    {{
                      header: () => (
                        <NSpace
                          justify='space-between'
                          align='center'
                          class={styles['card-header']}
                        >
                          <NText>Transform 配置</NText>
                          <NButton
                            size='small'
                            onClick={addTransform}
                            disabled={
                              props.readonly ||
                              pluginOutputOptions.value.length === 0
                            }
                          >
                            {{
                              icon: () => (
                                <NIcon>
                                  <PlusCircleOutlined />
                                </NIcon>
                              ),
                              default: () => '添加 Transform'
                            }}
                          </NButton>
                        </NSpace>
                      ),
                      default: () =>
                        configModel.transforms.length === 0 ? (
                          <NSpace class={styles.placeholder}>
                            <NText depth='3'>
                              暂无 Transform 配置，请在 Source 配置完成后添加
                            </NText>
                          </NSpace>
                        ) : (
                          <NSpace vertical>
                            {configModel.transforms.map((transform, index) => (
                              <NCard key={index} size='small'>
                                <NSpace vertical>
                                  <NFormItem label='输入 Plugin' required>
                                    <NSelect
                                      v-model:value={transform.plugin_input}
                                      options={getTransformInputOptions(index)}
                                      placeholder='选择输入 Plugin'
                                      disabled={
                                        props.readonly ||
                                        pluginOutputOptions.value.length === 0
                                      }
                                    />
                                  </NFormItem>
                                  <NFormItem label='Plugin Output' required>
                                    <NInput
                                      v-model:value={transform.plugin_output}
                                      placeholder={`transform_${index + 1}`}
                                      disabled={props.readonly}
                                    />
                                  </NFormItem>
                                  <NFormItem label='SQL 查询' required>
                                    <NInput
                                      v-model:value={transform.query}
                                      type='textarea'
                                      rows={4}
                                      placeholder='SELECT * FROM ...'
                                      disabled={props.readonly}
                                    />
                                  </NFormItem>
                                  <NSpace justify='end'>
                                    <NButton
                                      size='small'
                                      onClick={() => removeTransform(index)}
                                      disabled={props.readonly}
                                    >
                                      删除
                                    </NButton>
                                  </NSpace>
                                </NSpace>
                              </NCard>
                            ))}
                          </NSpace>
                        )
                    }}
                  </NCard>

                  {/* Sink 配置 */}
                  <NCard
                    title='Sink 配置'
                    size='small'
                    class={styles['config-card']}
                  >
                    {{
                      header: () => (
                        <NSpace
                          justify='space-between'
                          align='center'
                          class={styles['card-header']}
                        >
                          <NText>Sink 配置</NText>
                          <NButton
                            size='small'
                            onClick={addSink}
                            disabled={
                              props.readonly ||
                              pluginOutputOptions.value.length === 0
                            }
                          >
                            {{
                              icon: () => (
                                <NIcon>
                                  <PlusCircleOutlined />
                                </NIcon>
                              ),
                              default: () => '添加 Sink'
                            }}
                          </NButton>
                        </NSpace>
                      ),
                      default: () =>
                        configModel.sinks.length === 0 ? (
                          <NSpace class={styles.placeholder}>
                            <NText depth='3'>
                              暂无 Sink 配置，请先完成 Source/Transform 配置
                            </NText>
                          </NSpace>
                        ) : (
                          <NSpace vertical>
                            {configModel.sinks.map((sink, index) => {
                              const isDoris = sink.plugin_name === 'Doris'
                              const dorisSink = sink as SinkDorisConnector
                              return (
                                <NCard key={index} size='small'>
                                  <NSpace vertical>
                                    <NFormItem label='数据源' required>
                                      <NSelect
                                        v-model:value={sink.datasourceId}
                                        options={sinkDatasourceOptions.value}
                                        placeholder='选择数据源'
                                        loading={loadingSinkDatasources.value}
                                        disabled={props.readonly}
                                        onUpdateValue={(value: number) =>
                                          onSinkDatasourceChange(sink, value)
                                        }
                                        filterable
                                      />
                                    </NFormItem>
                                    <NFormItem label='输入 Plugin' required>
                                      <NSelect
                                        v-model:value={sink.plugin_input}
                                        options={pluginOutputOptions.value}
                                        placeholder='选择输入 Plugin'
                                        disabled={
                                          props.readonly ||
                                          pluginOutputOptions.value.length === 0
                                        }
                                      />
                                    </NFormItem>
                                    {!isDoris && (
                                      <>
                                        <NFormItem
                                          label='目标数据库'
                                          path={`sinks[${index}].database`}
                                        >
                                          <NInput
                                            v-model:value={sink.database}
                                            placeholder='target_database'
                                            disabled={
                                              props.readonly || !!sink.query
                                            }
                                            onUpdateValue={(value: string) => {
                                              if (value) sink.query = ''
                                            }}
                                          />
                                        </NFormItem>
                                        <NFormItem
                                          label='目标表'
                                          required
                                          path={`sinks[${index}].table`}
                                        >
                                          <NInput
                                            v-model:value={sink.table}
                                            placeholder='target_table'
                                            disabled={
                                              props.readonly || !!sink.query
                                            }
                                            onUpdateValue={(value: string) => {
                                              if (value) sink.query = ''
                                            }}
                                          />
                                        </NFormItem>
                                        <NFormItem
                                          label='自定义写入 SQL'
                                          path={`sinks[${index}].query`}
                                        >
                                          <NInput
                                            v-model:value={sink.query}
                                            type='textarea'
                                            placeholder='INSERT INTO target_table (col1, col2) VALUES (?, ?)'
                                            rows={4}
                                            disabled={
                                              props.readonly ||
                                              !!sink.database ||
                                              !!sink.table
                                            }
                                            onUpdateValue={(value: string) => {
                                              if (value) {
                                                sink.database = ''
                                                sink.table = ''
                                              }
                                            }}
                                          />
                                          {sink.datasourceType === 'ORACLE' && (
                                            <NText
                                              depth='3'
                                              class={styles['field-tip']}
                                            >
                                              提示：对于 Oracle
                                              数据同步，使用自定义 SQL
                                              通常能获得比自动生成更好的写入性能。
                                            </NText>
                                          )}
                                        </NFormItem>
                                        <NCollapse>
                                          <NCollapseItem
                                            title='高级选项'
                                            name={`sink-advanced-${index}`}
                                          >
                                            <NSpace vertical>
                                              <NFormItem label='生成 Sink SQL'>
                                                <NSwitch
                                                  v-model:value={
                                                    sink.generate_sink_sql
                                                  }
                                                />
                                              </NFormItem>
                                              <NFormItem label='主键'>
                                                <NDynamicInput
                                                  v-model:value={
                                                    sink.primary_keys
                                                  }
                                                  placeholder='输入主键字段名'
                                                />
                                              </NFormItem>
                                              <NFormItem label='批次大小'>
                                                <NInputNumber
                                                  v-model:value={
                                                    sink.batch_size
                                                  }
                                                  min={1}
                                                  style={{ width: '100%' }}
                                                />
                                              </NFormItem>
                                              <NFormItem label='批次间隔 (ms)'>
                                                <NInputNumber
                                                  v-model:value={
                                                    sink.batch_interval_ms
                                                  }
                                                  min={1}
                                                  style={{ width: '100%' }}
                                                />
                                              </NFormItem>
                                              <NFormItem label='最大重试次数'>
                                                <NInputNumber
                                                  v-model:value={
                                                    sink.max_retries
                                                  }
                                                  min={0}
                                                  style={{ width: '100%' }}
                                                />
                                              </NFormItem>
                                              <NFormItem label='开启 Upsert'>
                                                <NSwitch
                                                  v-model:value={
                                                    sink.enable_upsert
                                                  }
                                                />
                                              </NFormItem>
                                              <NFormItem label='数据保存模式'>
                                                <NSelect
                                                  v-model:value={
                                                    sink.data_save_mode
                                                  }
                                                  options={[
                                                    {
                                                      label:
                                                        '追加数据 (APPEND_DATA)',
                                                      value: 'APPEND_DATA'
                                                    },
                                                    {
                                                      label:
                                                        '清空数据 (DROP_DATA)',
                                                      value: 'DROP_DATA'
                                                    },
                                                    {
                                                      label:
                                                        '数据存在时报错 (ERROR_WHEN_DATA_EXISTS)',
                                                      value:
                                                        'ERROR_WHEN_DATA_EXISTS'
                                                    }
                                                  ]}
                                                  placeholder='选择数据保存模式'
                                                />
                                              </NFormItem>
                                            </NSpace>
                                          </NCollapseItem>
                                        </NCollapse>
                                      </>
                                    )}
                                    {isDoris && (
                                      <>
                                        <NFormItem label='Fenodes' required>
                                          <NInput
                                            v-model:value={dorisSink.fenodes}
                                            placeholder='host:8030'
                                            disabled={props.readonly}
                                          />
                                        </NFormItem>
                                        <NFormItem label='数据库' required>
                                          <NInput
                                            v-model:value={sink.database}
                                            placeholder='doris_database'
                                            disabled={props.readonly}
                                          />
                                        </NFormItem>
                                        <NFormItem label='目标表' required>
                                          <NInput
                                            v-model:value={sink.table}
                                            placeholder='doris_table'
                                            disabled={props.readonly}
                                          />
                                        </NFormItem>
                                        <NFormItem label='用户名'>
                                          <NInput
                                            v-model:value={dorisSink.username}
                                            placeholder='doris_user'
                                            disabled={props.readonly}
                                          />
                                        </NFormItem>
                                        <NCollapse>
                                          <NCollapseItem
                                            title='高级选项'
                                            name={`sink-advanced-doris-${index}`}
                                          >
                                            <NSpace vertical>
                                              <NFormItem label='开启 2PC'>
                                                <NSwitch
                                                  v-model:value={
                                                    dorisSink['sink.enable-2pc']
                                                  }
                                                />
                                              </NFormItem>
                                              <NFormItem
                                                label='标签前缀 (sink.label-prefix)'
                                                path='sink.label-prefix'
                                              >
                                                <NInput
                                                  v-model:value={
                                                    (
                                                      dorisSink as SinkDorisConnector
                                                    )['sink.label-prefix']
                                                  }
                                                  placeholder='请输入'
                                                />
                                              </NFormItem>
                                              <NFormItem
                                                label='最大重试次数 (sink.max-retries)'
                                                path='sink.max-retries'
                                              >
                                                <NInputNumber
                                                  v-model:value={
                                                    (
                                                      dorisSink as SinkDorisConnector
                                                    )['sink.max-retries']
                                                  }
                                                  min={0}
                                                  placeholder='请输入'
                                                />
                                              </NFormItem>
                                              <NFormItem
                                                label='批次大小 (doris.batch.size)'
                                                path='doris.batch.size'
                                              >
                                                <NInputNumber
                                                  v-model:value={
                                                    (
                                                      dorisSink as SinkDorisConnector
                                                    )['doris.batch.size']
                                                  }
                                                  min={0}
                                                  placeholder='请输入'
                                                />
                                              </NFormItem>
                                              <NFormItem
                                                label='缓冲区大小 (sink.buffer-size)'
                                                path='sink.buffer-size'
                                              >
                                                <NInputNumber
                                                  v-model:value={
                                                    (
                                                      dorisSink as SinkDorisConnector
                                                    )['sink.buffer-size']
                                                  }
                                                  min={0}
                                                  placeholder='请输入'
                                                />
                                              </NFormItem>
                                              <NFormItem
                                                label='缓冲区数量 (sink.buffer-count)'
                                                path='sink.buffer-count'
                                              >
                                                <NInputNumber
                                                  v-model:value={
                                                    (
                                                      dorisSink as SinkDorisConnector
                                                    )['sink.buffer-count']
                                                  }
                                                  min={0}
                                                  placeholder='请输入'
                                                />
                                              </NFormItem>
                                              <NFormItem
                                                label='自定义配置 (doris.config)'
                                                path='doris.config'
                                              >
                                                <NDynamicInput
                                                  v-model:value={
                                                    (
                                                      dorisSink as SinkDorisConnector
                                                    )['doris.config']
                                                  }
                                                  preset='pair'
                                                  key-placeholder='请输入Key'
                                                  value-placeholder='请输入Value'
                                                />
                                              </NFormItem>
                                            </NSpace>
                                          </NCollapseItem>
                                        </NCollapse>
                                      </>
                                    )}
                                    <NSpace justify='end'>
                                      <NButton
                                        size='small'
                                        onClick={() => removeSink(index)}
                                        disabled={props.readonly}
                                      >
                                        删除
                                      </NButton>
                                    </NSpace>
                                  </NSpace>
                                </NCard>
                              )
                            })}
                          </NSpace>
                        )
                    }}
                  </NCard>
                </NSpace>
              </NTabPane>
            </NTabs>
          </NForm>
        </NElement>

        {/* 右侧：JSON 预览区域 (42%) */}
        <NElement tag='div' class={styles['preview-section']}>
          <NText strong class={styles['preview-title']}>
            JSON 预览
          </NText>
          <NElement tag='div' class={styles['preview-editor']}>
            <Monaco
              v-model:value={jsonPreview.value}
              language='json'
              options={{
                readOnly: true,
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true
              }}
            />
          </NElement>
        </NElement>
      </NElement>
    )
  }
})

function convertToJdbcUrl(detail: any, type: string): string {
  if (!detail) return ''
  if (type === 'POSTGRESQL') {
    return `jdbc:postgresql://${detail.host || ''}:${detail.port || ''}/${
      detail.database || ''
    }`
  }
  if (type === 'ORACLE') {
    return `jdbc:oracle:thin:@${detail.host || ''}:${detail.port || ''}:${
      detail.database || ''
    }`
  }
  if (type === 'DORIS') {
    return `jdbc:mysql://${detail.host || ''}:${detail.port || ''}/${
      detail.database || ''
    }`
  }
  return ''
}
