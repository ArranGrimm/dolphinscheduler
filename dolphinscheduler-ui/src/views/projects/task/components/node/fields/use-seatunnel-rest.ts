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
import { useI18n } from 'vue-i18n'
import { useCustomParams } from '.'
import type { IJsonItem } from '../types'

export function useSeaTunnelRest(model: { [field: string]: any }): IJsonItem[] {
  const { t } = useI18n()

  return [
    {
      type: 'input',
      field: 'restEndpoint',
      name: t('project.node.seatunnel_rest_endpoint'),
      props: {
        placeholder: t('project.node.seatunnel_rest_endpoint_tips')
      },
      validate: {
        trigger: ['input', 'blur'],
        required: true,
        validator(validate: any, value: string) {
          if (!value) {
            return new Error(t('project.node.seatunnel_rest_endpoint_tips'))
          }
        }
      }
    },
    {
      type: 'editor',
      field: 'jobConfig',
      name: t('project.node.seatunnel_job_config'),
      span: 24,
      validate: {
        trigger: ['input', 'trigger'],
        required: true,
        validator(validate: any, value: string) {
          if (!value) {
            return new Error(t('project.node.seatunnel_job_config_tips'))
          }
        }
      }
    },
    {
      type: 'input-number',
      field: 'connectTimeout',
      name: t('project.node.connect_timeout'),
      span: 12,
      props: {
        min: 1000,
        max: 3600000
      },
      value: 60000
    },
    {
      type: 'input-number',
      field: 'socketTimeout',
      name: t('project.node.socket_timeout'),
      span: 12,
      props: {
        min: 1000,
        max: 3600000
      },
      value: 60000
    },
    {
      type: 'input-number',
      field: 'pollInterval',
      name: t('project.node.poll_interval'),
      span: 12,
      props: {
        min: 1000,
        max: 60000
      },
      value: 10000
    },
    ...useCustomParams({ model, field: 'localParams', isSimple: false })
  ]
}
