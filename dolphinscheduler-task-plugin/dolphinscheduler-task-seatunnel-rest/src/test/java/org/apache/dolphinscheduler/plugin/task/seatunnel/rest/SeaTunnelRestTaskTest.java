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
import org.apache.dolphinscheduler.plugin.task.api.TaskExecutionContext;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

public class SeaTunnelRestTaskTest {

    @Test
    public void testBuildJobConfig() {
        TaskExecutionContext taskExecutionContext = new TaskExecutionContext();
        taskExecutionContext.setTaskAppId("9527");
        taskExecutionContext.setExecutePath("/home");

        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();
        parameters.setRestEndpoint("http://localhost:5801");

        // Test with jobConfig JSON (valid)
        parameters.setJobConfig("{\"env\":{\"job.name\":\"test_job\"}, \"source\":[], \"sink\":[]}");

        taskExecutionContext.setTaskParams(JSONUtils.toJsonString(parameters));

        Assertions.assertTrue(parameters.checkParameters());
    }

    @Test
    public void testParametersValidation() {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();

        // Test without rest endpoint
        Assertions.assertFalse(parameters.checkParameters());

        // Test with rest endpoint but no config
        parameters.setRestEndpoint("http://localhost:5801");
        Assertions.assertFalse(parameters.checkParameters());

        // Test with json config
        parameters.setJobConfig("{\"env\":{}, \"source\":[], \"sink\":[]}");
        Assertions.assertTrue(parameters.checkParameters());
    }

    @Test
    public void testStructuredConfig() {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();
        parameters.setRestEndpoint("http://localhost:5801");

        // Set up structured config (env, source, sink)
        Map<String, Object> env = new HashMap<>();
        env.put("job.name", "test_job");

        List<Map<String, Object>> source = new ArrayList<>();
        Map<String, Object> fakeSource = new HashMap<>();
        fakeSource.put("plugin_name", "FakeSource");
        fakeSource.put("result_table_name", "fake");
        source.add(fakeSource);

        List<Map<String, Object>> sink = new ArrayList<>();
        Map<String, Object> consoleSink = new HashMap<>();
        consoleSink.put("plugin_name", "Console");
        consoleSink.put("source_table_name", "fake");
        sink.add(consoleSink);

        // Validation should pass with complete structured config
        Assertions.assertTrue(parameters.checkParameters());
    }
}
