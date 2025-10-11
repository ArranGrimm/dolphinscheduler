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

import org.apache.dolphinscheduler.plugin.task.api.model.ResourceInfo;
import org.apache.dolphinscheduler.plugin.task.api.parameters.AbstractParameters;

import org.apache.commons.lang3.StringUtils;

import java.util.Collections;
import java.util.List;
import java.util.Map;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import lombok.extern.slf4j.Slf4j;

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
     * env config as Map for flexibility
     */
    private Map<String, Object> env;

    /**
     * source connectors config
     */
    private List<Map<String, Object>> source;

    /**
     * transform connectors config
     */
    private List<Map<String, Object>> transform;

    /**
     * sink connectors config
     */
    private List<Map<String, Object>> sink;

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
        if (StringUtils.isEmpty(this.jobConfig) && 
            (this.env == null || this.source == null || this.sink == null)) {
            log.error("SeaTunnel job configuration is incomplete");
            return false;
        }

        return true;
    }

    @Override
    public List<ResourceInfo> getResourceFilesList() {
        return Collections.emptyList();
    }
}
