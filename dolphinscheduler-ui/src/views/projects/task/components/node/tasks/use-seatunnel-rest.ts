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

import { reactive, defineAsyncComponent, h } from 'vue'
import * as Fields from '../fields/index'
import type { IJsonItem, INodeData, ITaskData } from '../types'

const SeaTunnelRestForm = defineAsyncComponent(
  () => import('../task-forms/seatunnel-rest')
)

export function useSeaTunnelRest({
  projectCode,
  from = 0,
  readonly,
  data
}: {
  projectCode: number
  from?: number
  readonly?: boolean
  data?: ITaskData
}) {
  const model = reactive({
    name: '',
    taskType: 'SEATUNNEL_REST',
    flag: 'YES',
    description: '',
    timeoutFlag: false,
    localParams: [],
    environmentCode: null,
    failRetryInterval: 1,
    failRetryTimes: 0,
    workerGroup: 'default',
    delayTime: 0,
    timeout: 30,
    timeoutNotifyStrategy: ['WARN'],
    restEndpoint: '',
    jobConfig: '',
    connectTimeout: 60000,
    socketTimeout: 60000,
    pollInterval: 10000
  } as INodeData)

  return {
    json: [
      { ...Fields.useName(from), span: 12 },
      {
        type: 'custom', // <- 明确指定类型为 'custom'
        span: 12,
        widget: h('div') // <- 渲染一个空的、因此不可见的 div 元素
      },
      ...Fields.useTaskDefinition({ projectCode, from, readonly, data, model }),
      { ...Fields.useRunFlag(), span: 12 },
      Fields.useDescription(),
      { ...Fields.useTaskPriority(), span: 12 },
      { ...Fields.useWorkerGroup(projectCode), span: 12 },
      { ...Fields.useEnvironmentName(model, !data?.id), span: 12 },
      ...Fields.useTaskGroup(model, projectCode).map((field) => ({
        ...field,
        span: 12
      })),
      ...Fields.useFailed(),
      Fields.useDelayTime(model),
      ...Fields.useTimeoutAlarm(model),
      {
        type: 'input',
        field: 'restEndpoint',
        name: 'SeaTunnel REST Endpoint',
        span: 12,
        props: {
          placeholder: 'http://localhost:8080'
        },
        validate: {
          trigger: ['input', 'blur'],
          required: true
        }
      },
      {
        type: 'custom', // <- 明确指定类型为 'custom'
        span: 12,
        widget: h('div') // <- 渲染一个空的、因此不可见的 div 元素
      },
      {
        type: 'input-number',
        field: 'connectTimeout',
        name: 'Connect Timeout (ms)',
        span: 8,
        props: {
          min: 1000
        }
      },
      {
        type: 'input-number',
        field: 'socketTimeout',
        name: 'Socket Timeout (ms)',
        span: 8,
        props: {
          min: 1000
        }
      },
      {
        type: 'input-number',
        field: 'pollInterval',
        name: 'Poll Interval (ms)',
        span: 8,
        props: {
          min: 1000
        }
      },
      {
        type: 'custom',
        field: 'jobConfig',
        span: 24,
        widget: h(SeaTunnelRestForm)
      },
      {
        ...Fields.usePreTasks(), // <- 使用扩展运算符(...)来继承它的所有原有属性
        span: 12
      }
    ] as IJsonItem[],
    model
  }
}
