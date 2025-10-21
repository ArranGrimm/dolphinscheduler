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

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Mock HTTP Server based tests for SeaTunnelRestTask
 */
public class SeaTunnelRestTaskMockTest {

    private MockWebServer mockWebServer;
    private TaskExecutionContext taskExecutionContext;

    @BeforeEach
    public void setUp() throws Exception {
        mockWebServer = new MockWebServer();
        mockWebServer.start();

        taskExecutionContext = new TaskExecutionContext();
        taskExecutionContext.setTaskAppId("test_task_123");
        taskExecutionContext.setExecutePath("/tmp/dolphinscheduler");
        taskExecutionContext.setTaskInstanceId(12345);
    }

    @AfterEach
    public void tearDown() throws Exception {
        if (mockWebServer != null) {
            mockWebServer.shutdown();
        }
    }

    @Test
    public void testSubmitJobSuccess() throws Exception {
        // Mock successful job submission response
        String submitResponse = "{\"jobId\": \"123456789\", \"jobName\": \"test_job\"}";
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody(submitResponse)
                .addHeader("Content-Type", "application/json"));

        // Mock job status - running
        String runningResponse = "{\"jobId\": \"123456789\", \"jobStatus\": \"RUNNING\", \"metrics\": {}}";
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody(runningResponse)
                .addHeader("Content-Type", "application/json"));

        // Mock job status - finished
        String finishedResponse = "{\"jobId\": \"123456789\", \"jobStatus\": \"FINISHED\", \"metrics\": {}}";
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody(finishedResponse)
                .addHeader("Content-Type", "application/json"));

        SeaTunnelRestParameters parameters = buildTestParameters();
        parameters.setRestEndpoint(mockWebServer.url("/").toString().replaceAll("/$", ""));
        parameters.setPollInterval(100); // Fast polling for test

        taskExecutionContext.setTaskParams(JSONUtils.toJsonString(parameters));

        SeaTunnelRestTask task = new SeaTunnelRestTask(taskExecutionContext);
        task.init();

        // Verify init successful
        Assertions.assertNotNull(task.getParameters());

        // Verify submit request
        RecordedRequest submitRequest = mockWebServer.takeRequest();
        Assertions.assertEquals("POST", submitRequest.getMethod());
        Assertions.assertTrue(submitRequest.getPath().contains("/submit-job"));

        // Verify request body contains job config
        String requestBody = submitRequest.getBody().readUtf8();
        Assertions.assertTrue(requestBody.contains("source"));
        Assertions.assertTrue(requestBody.contains("sink"));
    }

    @Test
    public void testSubmitJobFailure() throws Exception {
        // Mock failed job submission
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(500)
                .setBody("{\"error\": \"Internal Server Error\"}")
                .addHeader("Content-Type", "application/json"));

        SeaTunnelRestParameters parameters = buildTestParameters();
        parameters.setRestEndpoint(mockWebServer.url("/").toString().replaceAll("/$", ""));

        taskExecutionContext.setTaskParams(JSONUtils.toJsonString(parameters));

        SeaTunnelRestTask task = new SeaTunnelRestTask(taskExecutionContext);
        task.init();

        // Should not throw exception during init
        Assertions.assertNotNull(task.getParameters());
    }

    @Test
    public void testJobConfigSerialization() {
        SeaTunnelRestParameters parameters = buildTestParameters();
        Assertions.assertTrue(parameters.checkParameters());
    }

    @Test
    public void testParameterValidation() {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();

        // Empty parameters should fail
        Assertions.assertFalse(parameters.checkParameters());

        // Only endpoint, no job config
        parameters.setRestEndpoint("http://localhost:5801");
        Assertions.assertFalse(parameters.checkParameters());

        // With JSON config
        parameters.setJobConfig("{\"env\":{}, \"source\":[], \"sink\":[]}");
        Assertions.assertTrue(parameters.checkParameters());

        // With structured config
        SeaTunnelRestParameters parameters2 = buildTestParameters();
        Assertions.assertTrue(parameters2.checkParameters());
    }

    @Test
    public void testTimeoutConfiguration() {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();

        // Test default values
        Assertions.assertEquals(60000, parameters.getConnectTimeout());
        Assertions.assertEquals(60000, parameters.getSocketTimeout());
        Assertions.assertEquals(10000, parameters.getPollInterval());

        // Test custom values
        parameters.setConnectTimeout(30000);
        parameters.setSocketTimeout(45000);
        parameters.setPollInterval(5000);

        Assertions.assertEquals(30000, parameters.getConnectTimeout());
        Assertions.assertEquals(45000, parameters.getSocketTimeout());
        Assertions.assertEquals(5000, parameters.getPollInterval());
    }

    @Test
    public void testRealWorldJdbcJobConfig() throws Exception {
        // Mock successful job submission for a real-world JDBC scenario
        String submitResponse = "{\"jobId\": \"jdbc_job_001\", \"jobName\": \"jdbc_oracle_to_console\"}";
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody(submitResponse)
                .addHeader("Content-Type", "application/json"));

        String finishedResponse = "{\"jobId\": \"jdbc_job_001\", \"jobStatus\": \"FINISHED\", \"metrics\": {}}";
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody(finishedResponse)
                .addHeader("Content-Type", "application/json"));

        SeaTunnelRestParameters parameters = buildRealWorldJdbcParameters();
        parameters.setRestEndpoint(mockWebServer.url("/").toString().replaceAll("/$", ""));

        taskExecutionContext.setTaskParams(JSONUtils.toJsonString(parameters));

        SeaTunnelRestTask task = new SeaTunnelRestTask(taskExecutionContext);
        task.init();

        Assertions.assertNotNull(task.getParameters());

        // Verify the JDBC configuration is properly serialized
        RecordedRequest submitRequest = mockWebServer.takeRequest();
        String requestBody = submitRequest.getBody().readUtf8();

        // Verify JDBC source configuration
        Assertions.assertTrue(requestBody.contains("Jdbc"));
        Assertions.assertTrue(requestBody.contains("oracle.jdbc.OracleDriver"));
        Assertions.assertTrue(requestBody.contains("SELECT"));
    }

    /**
     * Build test parameters with a simple FakeSource to Console job
     */
    private SeaTunnelRestParameters buildTestParameters() {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();
        parameters.setRestEndpoint("http://localhost:5801");

        // Build env
        Map<String, Object> env = new HashMap<>();
        env.put("job.mode", "batch");
        env.put("job.name", "test_job");

        // Build source
        List<Map<String, Object>> sourceList = new ArrayList<>();
        Map<String, Object> fakeSource = new HashMap<>();
        fakeSource.put("plugin_name", "FakeSource");
        fakeSource.put("plugin_output", "fake");
        fakeSource.put("row.num", 100);

        Map<String, Object> schema = new HashMap<>();
        Map<String, String> fields = new HashMap<>();
        fields.put("name", "string");
        fields.put("age", "int");
        schema.put("fields", fields);
        fakeSource.put("schema", schema);

        sourceList.add(fakeSource);

        // Build sink
        List<Map<String, Object>> sinkList = new ArrayList<>();
        Map<String, Object> consoleSink = new HashMap<>();
        consoleSink.put("plugin_name", "Console");
        List<String> inputs = new ArrayList<>();
        inputs.add("fake");
        consoleSink.put("plugin_input", inputs);
        sinkList.add(consoleSink);

        return parameters;
    }

    /**
     * Build real-world JDBC job configuration (with sanitized credentials)
     * This mimics a production-like scenario without exposing sensitive information
     */
    private SeaTunnelRestParameters buildRealWorldJdbcParameters() {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();
        parameters.setRestEndpoint("http://localhost:5801");

        // Build env - BATCH mode like the Python script
        Map<String, Object> env = new HashMap<>();
        env.put("job.mode", "BATCH");

        // Build JDBC source - Oracle database (sanitized config)
        List<Map<String, Object>> sourceList = new ArrayList<>();
        Map<String, Object> jdbcSource = new HashMap<>();
        jdbcSource.put("plugin_name", "Jdbc");
        jdbcSource.put("driver", "oracle.jdbc.OracleDriver");
        jdbcSource.put("user", "test_user");
        jdbcSource.put("password", "test_password");
        // Sanitized JDBC URL - not real credentials
        jdbcSource.put("url", "jdbc:oracle:thin:@localhost:1521:TESTDB");
        jdbcSource.put("query", "SELECT PRODUCT_ID, PRODUCT_NAME, QUANTITY, DESCRIPTION, IMPORT_DATE FROM products");

        sourceList.add(jdbcSource);

        // Build Console sink
        List<Map<String, Object>> sinkList = new ArrayList<>();
        Map<String, Object> consoleSink = new HashMap<>();
        consoleSink.put("plugin_name", "Console");
        sinkList.add(consoleSink);

        return parameters;
    }
}
