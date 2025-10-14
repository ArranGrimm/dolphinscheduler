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

import { defineComponent, ref, reactive, computed, watch, onMounted } from 'vue'
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
  NElement
} from 'naive-ui'
import { PlusCircleOutlined } from '@vicons/antd'
import Monaco from '@/components/monaco-editor'
import type { INodeData } from '../../types'
import type {
  SeaTunnelConfigModel,
  SourceConnector,
  SinkConnector
} from './types'
import { generateJsonPreview, validateConfig } from './utils'
import styles from './index.module.scss'

export default defineComponent({
  name: 'SeaTunnelRestForm',
  props: {
    model: {
      type: Object as () => INodeData,
      required: true
    },
    readonly: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:model'],
  setup(props, { expose, emit }) {
    const formRef = ref()

    const configModel = reactive<SeaTunnelConfigModel>({
      restEndpoint: props.model.restEndpoint || '',
      connectTimeout: props.model.connectTimeout || 60000,
      socketTimeout: props.model.socketTimeout || 60000,
      pollInterval: props.model.pollInterval || 10000,
      env: {
        'job.mode': 'BATCH'
      },
      sources: [],
      transforms: [],
      sinks: [],
      showAdvancedOptions: false
    })

    const jsonPreview = computed(() => {
      return generateJsonPreview(configModel)
    })

    watch(
      () => [
        configModel.restEndpoint,
        configModel.connectTimeout,
        configModel.socketTimeout,
        configModel.pollInterval,
        jsonPreview.value
      ],
      () => {
        const updatedModel = {
          ...props.model,
          restEndpoint: configModel.restEndpoint,
          connectTimeout: configModel.connectTimeout,
          socketTimeout: configModel.socketTimeout,
          pollInterval: configModel.pollInterval,
          jobConfig: jsonPreview.value
        }
        emit('update:model', updatedModel)
      },
      { deep: true }
    )

    onMounted(() => {
      if (props.model.jobConfig) {
        try {
          const config = JSON.parse(props.model.jobConfig)
          if (config.env) configModel.env = config.env
          if (config.source) configModel.sources = config.source
          if (config.transform) configModel.transforms = config.transform
          if (config.sink) configModel.sinks = config.sink
        } catch (unusedError) {
          // Invalid JSON, use default config
        }
      }
    })

    const addSource = () => {
      configModel.sources.push({
        plugin_name: 'Jdbc',
        datasourceId: 0,
        datasourceType: 'POSTGRESQL',
        queryMode: 'table',
        plugin_output: `source_${configModel.sources.length + 1}`
      } as SourceConnector)
    }

    const removeSource = (index: number) => {
      configModel.sources.splice(index, 1)
    }

    const addSink = () => {
      configModel.sinks.push({
        plugin_name: 'Jdbc',
        datasourceId: 0,
        datasourceType: 'POSTGRESQL',
        plugin_input: configModel.sources[0]?.plugin_output || 'source_1',
        database: '',
        table: ''
      } as SinkConnector)
    }

    const removeSink = (index: number) => {
      configModel.sinks.splice(index, 1)
    }

    const validate = async () => {
      const result = validateConfig(configModel)
      if (!result.valid) {
        return false
      }
      return true
    }

    expose({ validate })

    return () => (
      <NElement tag='div' class={styles['seatunnel-rest-form']}>
        {/* 左侧：表单区域 (58%) */}
        <NElement tag='div' class={styles['form-section']}>
          <NForm ref={formRef} model={configModel} disabled={props.readonly}>
            <NTabs type='line' animated>
              {/* 基础配置 Tab */}
              <NTabPane name='basic' tab='基础配置'>
                <NSpace vertical size='large'>
                  {/* REST 端点 */}
                  <NFormItem
                    label='SeaTunnel REST 端点'
                    path='restEndpoint'
                    required
                  >
                    <NInput
                      v-model:value={configModel.restEndpoint}
                      placeholder='http://localhost:8080'
                    />
                  </NFormItem>

                  {/* Env 配置 */}
                  <NCard title='Env 配置' size='small'>
                    <NFormItem label='Job Mode'>
                      <NInput
                        v-model:value={configModel.env['job.mode']}
                        placeholder='BATCH'
                      />
                    </NFormItem>
                  </NCard>

                  {/* Source 配置 */}
                  <NCard title='Source 配置' size='small'>
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
                                  <NFormItem label='输出表名' required>
                                    <NInput
                                      v-model:value={source.plugin_output}
                                      placeholder='source_1'
                                    />
                                  </NFormItem>
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

                  {/* Sink 配置 */}
                  <NCard title='Sink 配置' size='small'>
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
                            disabled={props.readonly}
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
                              暂无 Sink 配置,请点击右上角按钮添加
                            </NText>
                          </NSpace>
                        ) : (
                          <NSpace vertical>
                            {configModel.sinks.map((sink, index) => (
                              <NCard key={index} size='small'>
                                <NSpace vertical>
                                  <NFormItem label='输入表名' required>
                                    <NInput
                                      v-model:value={sink.plugin_input}
                                      placeholder='source_1'
                                    />
                                  </NFormItem>
                                  {sink.plugin_name === 'Jdbc' && (
                                    <NFormItem label='目标表'>
                                      <NInput
                                        v-model:value={sink.table}
                                        placeholder='target_table'
                                      />
                                    </NFormItem>
                                  )}
                                  <NButton
                                    size='small'
                                    onClick={() => removeSink(index)}
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
                </NSpace>
              </NTabPane>

              {/* 高级配置 Tab */}
              <NTabPane name='advanced' tab='高级配置'>
                <NSpace vertical size='large'>
                  <NCollapse>
                    <NCollapseItem title='连接与轮询配置' name='connection'>
                      <NSpace vertical>
                        <NFormItem label='连接超时 (ms)'>
                          <NInputNumber
                            v-model:value={configModel.connectTimeout}
                            min={1000}
                            max={3600000}
                            style={{ width: '100%' }}
                          />
                        </NFormItem>
                        <NFormItem label='Socket 超时 (ms)'>
                          <NInputNumber
                            v-model:value={configModel.socketTimeout}
                            min={1000}
                            max={3600000}
                            style={{ width: '100%' }}
                          />
                        </NFormItem>
                        <NFormItem label='轮询间隔 (ms)'>
                          <NInputNumber
                            v-model:value={configModel.pollInterval}
                            min={1000}
                            max={60000}
                            style={{ width: '100%' }}
                          />
                        </NFormItem>
                      </NSpace>
                    </NCollapseItem>
                  </NCollapse>
                </NSpace>
              </NTabPane>
            </NTabs>
          </NForm>
        </NElement>

        {/* 右侧：JSON 预览区域 (42%) */}
        <NElement tag='div' class={styles['preview-section']}>
          <NText strong class={styles['preview-title']}>
            JSON 预览（实时生成）
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
