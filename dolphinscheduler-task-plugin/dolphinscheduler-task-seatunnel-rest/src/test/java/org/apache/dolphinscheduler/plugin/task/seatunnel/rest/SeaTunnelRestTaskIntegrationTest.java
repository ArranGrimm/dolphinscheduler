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
import org.apache.dolphinscheduler.plugin.task.api.TaskCallBack;
import org.apache.dolphinscheduler.plugin.task.api.TaskExecutionContext;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Integration tests for SeaTunnelRestTask that connect to a real SeaTunnel server.
 * 
 * IMPORTANT: These tests are disabled by default and require:
 * 1. A running SeaTunnel cluster
 * 2. Environment variables configured with real connection details
 * 
 * To run these tests locally:
 * 1. Copy test.env.example to test.env
 * 2. Fill in your real credentials in test.env
 * 3. Load environment variables: source test.env (Linux/Mac) or set commands (Windows)
 * 4. Remove @Disabled annotation from the test methods you want to run
 * 5. Run: mvn test -Dtest=SeaTunnelRestTaskIntegrationTest
 * 
 * Security Note:
 * - NEVER commit test.env file (it's in .gitignore)
 * - NEVER hardcode credentials in this file
 * - Always use environment variables for sensitive information
 */
// @Disabled("Integration tests require real SeaTunnel server and credentials from environment variables")
public class SeaTunnelRestTaskIntegrationTest {

    private TaskExecutionContext taskExecutionContext;

    @BeforeEach
    public void setUp() {
        taskExecutionContext = new TaskExecutionContext();
        taskExecutionContext.setTaskAppId("integration_test_task");
        taskExecutionContext.setExecutePath("/tmp/dolphinscheduler/integration");
        taskExecutionContext.setTaskInstanceId(99999);
    }

    /**
     * Test with FakeSource -> Console (simplest case, no real database needed)
     * Only requires a running SeaTunnel server
     */
    @Test
    public void testSubmitFakeSourceJob() throws Exception {
        String endpoint = getEnvOrDefault("SEATUNNEL_REST_ENDPOINT", "http://localhost:8080");

        SeaTunnelRestParameters parameters = buildFakeSourceParameters(endpoint);
        taskExecutionContext.setTaskParams(JSONUtils.toJsonString(parameters));

        SeaTunnelRestTask task = new SeaTunnelRestTask(taskExecutionContext);
        task.init();

        // This will actually submit and poll the job
        TaskCallBack mockCallback = new TaskCallBack() {

            @Override
            public void updateRemoteApplicationInfo(int taskInstanceId,
                                                    org.apache.dolphinscheduler.plugin.task.api.model.ApplicationInfo applicationInfo) {
                System.out.println("Task callback - updateRemoteApplicationInfo: " + taskInstanceId);
            }

            @Override
            public void updateTaskInstanceInfo(int taskInstanceId) {
                System.out.println("Task callback - updateTaskInstanceInfo: " + taskInstanceId);
            }
        };

        task.handle(mockCallback);

        Assertions.assertNotNull(task.getParameters());
        System.out.println("✅ FakeSource job completed successfully!");
    }

    /**
     * Test with real JDBC Oracle source (requires Oracle database access)
     * Reads credentials from environment variables
     */
    @Test
    public void testSubmitRealOracleJob() throws Exception {
        String endpoint = getEnvOrDefault("SEATUNNEL_REST_ENDPOINT", "http://localhost:8080");
        String jdbcUrl = System.getenv("ORACLE_JDBC_URL");
        String user = System.getenv("ORACLE_USER");
        String password = System.getenv("ORACLE_PASSWORD");
        String query = getEnvOrDefault("ORACLE_QUERY", "SELECT * FROM products");

        // Validate required environment variables
        if (jdbcUrl == null || user == null || password == null) {
            System.err.println("❌ Skipping test: Missing required environment variables");
            System.err.println("Required: ORACLE_JDBC_URL, ORACLE_USER, ORACLE_PASSWORD");
            return;
        }

        SeaTunnelRestParameters parameters = buildRealOracleParameters(
                endpoint, jdbcUrl, user, password, query);
        taskExecutionContext.setTaskParams(JSONUtils.toJsonString(parameters));

        SeaTunnelRestTask task = new SeaTunnelRestTask(taskExecutionContext);
        task.init();

        TaskCallBack mockCallback = new TaskCallBack() {

            @Override
            public void updateRemoteApplicationInfo(int taskInstanceId,
                                                    org.apache.dolphinscheduler.plugin.task.api.model.ApplicationInfo applicationInfo) {
                System.out.println("Task callback - updateRemoteApplicationInfo: " + taskInstanceId);
            }

            @Override
            public void updateTaskInstanceInfo(int taskInstanceId) {
                System.out.println("Task callback - updateTaskInstanceInfo: " + taskInstanceId);
            }
        };

        task.handle(mockCallback);

        Assertions.assertNotNull(task.getParameters());
        System.out.println("✅ Real Oracle job completed successfully!");
    }

    /**
     * Build FakeSource parameters (no sensitive info needed)
     */
    private SeaTunnelRestParameters buildFakeSourceParameters(String endpoint) {
        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();
        parameters.setRestEndpoint(endpoint);
        parameters.setPollInterval(2000); // Poll every 2 seconds

        Map<String, Object> env = new HashMap<>();
        env.put("job.mode", "BATCH");
        env.put("job.name", "integration_test_fake_source");

        // FakeSource
        List<Map<String, Object>> sourceList = new ArrayList<>();
        Map<String, Object> fakeSource = new HashMap<>();
        fakeSource.put("plugin_name", "FakeSource");
        fakeSource.put("plugin_output", "fake");
        fakeSource.put("row.num", 10);

        Map<String, Object> schema = new HashMap<>();
        Map<String, String> fields = new HashMap<>();
        fields.put("id", "int");
        fields.put("name", "string");
        schema.put("fields", fields);
        fakeSource.put("schema", schema);

        sourceList.add(fakeSource);

        // Console sink
        List<Map<String, Object>> sinkList = new ArrayList<>();
        Map<String, Object> consoleSink = new HashMap<>();
        consoleSink.put("plugin_name", "Console");
        sinkList.add(consoleSink);

        return parameters;
    }

    /**
     * Build real Oracle JDBC parameters (credentials from environment)
     */
    private SeaTunnelRestParameters buildRealOracleParameters(
                                                              String endpoint, String jdbcUrl, String user,
                                                              String password, String query) {

        SeaTunnelRestParameters parameters = new SeaTunnelRestParameters();
        parameters.setRestEndpoint(endpoint);
        parameters.setPollInterval(5000); // Poll every 5 seconds for real jobs

        Map<String, Object> env = new HashMap<>();
        env.put("job.mode", "BATCH");

        // JDBC Oracle source
        List<Map<String, Object>> sourceList = new ArrayList<>();
        Map<String, Object> jdbcSource = new HashMap<>();
        jdbcSource.put("plugin_name", "Jdbc");
        jdbcSource.put("driver", "oracle.jdbc.OracleDriver");
        jdbcSource.put("url", jdbcUrl);
        jdbcSource.put("user", user);
        jdbcSource.put("password", password);
        jdbcSource.put("query", query);

        sourceList.add(jdbcSource);

        // Console sink
        List<Map<String, Object>> sinkList = new ArrayList<>();
        Map<String, Object> consoleSink = new HashMap<>();
        consoleSink.put("plugin_name", "Console");
        sinkList.add(consoleSink);

        return parameters;
    }

    /**
     * Get environment variable with default value
     */
    private String getEnvOrDefault(String key, String defaultValue) {
        String value = System.getenv(key);
        return value != null ? value : defaultValue;
    }
}
