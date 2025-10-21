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

package org.apache.dolphinscheduler.plugin.task.seatunnel.rest;

import org.apache.dolphinscheduler.common.utils.JSONUtils;
import org.apache.dolphinscheduler.plugin.datasource.api.utils.DataSourceUtils;
import org.apache.dolphinscheduler.plugin.datasource.api.utils.PasswordUtils;
import org.apache.dolphinscheduler.plugin.task.api.enums.ResourceType;
import org.apache.dolphinscheduler.plugin.task.api.model.ResourceInfo;
import org.apache.dolphinscheduler.plugin.task.api.parameters.AbstractParameters;
import org.apache.dolphinscheduler.plugin.task.api.parameters.resource.DataSourceParameters;
import org.apache.dolphinscheduler.plugin.task.api.parameters.resource.ResourceParametersHelper;
import org.apache.dolphinscheduler.spi.datasource.BaseConnectionParam;
import org.apache.dolphinscheduler.spi.enums.DbType;

import org.apache.commons.lang3.StringUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import lombok.extern.slf4j.Slf4j;

import com.fasterxml.jackson.core.type.TypeReference;

@Getter
@Setter
@ToString
@Slf4j
public class SeaTunnelRestParameters extends AbstractParameters {

    /**
     * SeaTunnel Server REST endpoint
     * e.g. http://localhost:5801
     */
    private String restEndpoint;

    /**
     * SeaTunnel job config JSON
     * Contains env, source, transform, sink configurations
     */
    private String jobConfig;

    /**
     * Connection timeout in milliseconds
     */
    private int connectTimeout = 60000;

    /**
     * Socket read timeout in milliseconds
     */
    private int socketTimeout = 60000;

    /**
     * Poll interval in milliseconds when checking job status
     */
    private int pollInterval = 10000;

    @Override
    public boolean checkParameters() {
        if (StringUtils.isEmpty(this.restEndpoint)) {
            log.error("SeaTunnel REST endpoint is empty");
            return false;
        }

        // Check if either jobConfig JSON or structured config (env/source/sink) is provided
        if (StringUtils.isEmpty(this.jobConfig)) {
            log.error("SeaTunnel job configuration is incomplete");
            return false;
        }

        return true;
    }

    @Override
    public ResourceParametersHelper getResources() {
        // --- [MASTER DEBUG] 确认 getResources() 被调用 ---
        log.info("--- [MASTER NODE] Entering getResources(). jobConfig is: {}", jobConfig);
        ResourceParametersHelper resources = super.getResources();
        if (StringUtils.isEmpty(jobConfig)) {
            return resources;
        }

        Map<String, Object> jobConfigMap = JSONUtils.parseObject(jobConfig, new TypeReference<Map<String, Object>>() {
        });
        if (jobConfigMap == null) {
            return resources;
        }

        extractDatasourceIds(jobConfigMap.get("source"), resources);
        extractDatasourceIds(jobConfigMap.get("sink"), resources);

        return resources;
    }

    @Override
    public List<ResourceInfo> getResourceFilesList() {
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private void extractDatasourceIds(Object connectorsObj, ResourceParametersHelper resources) {
        if (connectorsObj == null || !(connectorsObj instanceof List)) {
            return;
        }
        List<Map<String, Object>> connectors = (List<Map<String, Object>>) connectorsObj;
        for (Map<String, Object> connector : connectors) {
            Object datasourceIdObj = connector.get("datasourceId");
            if (datasourceIdObj != null) {
                int datasourceId = Integer.parseInt(String.valueOf(datasourceIdObj));
                if (datasourceId != 0) {
                    resources.put(ResourceType.DATASOURCE, datasourceId);
                    // --- [MASTER DEBUG] 确认数据源ID被注册 ---
                    log.info("--- [MASTER NODE] Found and registered datasourceId: {}", datasourceId);
                }
            }
        }
    }

    public SeaTunnelRestTaskExecutionContext generateExtendedContext(ResourceParametersHelper resourceParametersHelper) {
        if (StringUtils.isEmpty(jobConfig)) {
            throw new SeaTunnelRestTaskException("Job config is empty");
        }

        Map<String, Object> jobConfigMap =
                JSONUtils.parseObject(jobConfig, new TypeReference<Map<String, Object>>() {
                });

        if (jobConfigMap == null) {
            throw new SeaTunnelRestTaskException("Parsed job config is null");
        }

        enrichConnectors(jobConfigMap.get("source"), resourceParametersHelper);
        enrichConnectors(jobConfigMap.get("sink"), resourceParametersHelper);
        return new SeaTunnelRestTaskExecutionContext(jobConfigMap);
    }

    @SuppressWarnings("unchecked")
    private void enrichConnectors(Object connectorsObj, ResourceParametersHelper resourceParametersHelper) {
        if (connectorsObj == null || !(connectorsObj instanceof List)) {
            return;
        }
        List<Map<String, Object>> connectors = (List<Map<String, Object>>) connectorsObj;
        for (Map<String, Object> connector : connectors) {
            enrichConnectorWithDatasource(connector, resourceParametersHelper);
        }
    }

    private void enrichConnectorWithDatasource(Map<String, Object> connector,
                                               ResourceParametersHelper resourceParametersHelper) {
        Object datasourceIdObj = connector.get("datasourceId");
        if (datasourceIdObj == null) {
            return;
        }

        int datasourceId = Integer.parseInt(String.valueOf(datasourceIdObj));
        if (datasourceId == 0) {
            return;
        }
        DataSourceParameters dataSourceParameters = (DataSourceParameters) resourceParametersHelper
                .getResourceParameters(ResourceType.DATASOURCE, datasourceId);
        if (dataSourceParameters == null) {
            // Re-throw exception here as this is a critical failure on the worker side
            throw new SeaTunnelRestTaskException(
                    String.format("Datasource %d not found in ResourceParametersHelper", datasourceId));
        }

        BaseConnectionParam baseConnectionParam =
                (BaseConnectionParam) DataSourceUtils.buildConnectionParams(dataSourceParameters.getType(),
                        dataSourceParameters.getConnectionParams());

        if (baseConnectionParam == null) {
            throw new SeaTunnelRestTaskException(
                    String.format("Failed to build connection parameters for datasource %d", datasourceId));
        }

        connector.put("user", baseConnectionParam.getUser());
        connector.put("password", PasswordUtils.decodePassword(baseConnectionParam.getPassword()));
        connector.put("url", baseConnectionParam.getJdbcUrl());

        DbType dbType = dataSourceParameters.getType();
        switch (dbType) {
            case POSTGRESQL:
                connector.put("driver", "org.postgresql.Driver");
                break;
            case ORACLE:
                connector.put("driver", "oracle.jdbc.OracleDriver");
                break;
            case DORIS:
                String jdbcUrl = baseConnectionParam.getJdbcUrl();
                String[] parts = jdbcUrl.split("//");
                if (parts.length > 1) {
                    String hostAndPort = parts[1].split("/")[0];
                    String host = hostAndPort.split(":")[0];
                    connector.put("fenodes", host + ":8030");
                }
                connector.put("username", baseConnectionParam.getUser());
                connector.remove("user");
                break;
            default:
                break;
        }
    }
}
