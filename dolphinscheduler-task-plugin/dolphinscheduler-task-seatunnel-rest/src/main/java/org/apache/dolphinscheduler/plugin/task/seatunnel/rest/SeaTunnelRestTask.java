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
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied,
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.dolphinscheduler.plugin.task.seatunnel.rest;

import org.apache.dolphinscheduler.common.utils.JSONUtils;
import org.apache.dolphinscheduler.plugin.task.api.AbstractRemoteTask;
import org.apache.dolphinscheduler.plugin.task.api.TaskCallBack;
import org.apache.dolphinscheduler.plugin.task.api.TaskConstants;
import org.apache.dolphinscheduler.plugin.task.api.TaskException;
import org.apache.dolphinscheduler.plugin.task.api.TaskExecutionContext;
import org.apache.dolphinscheduler.plugin.task.api.model.Property;
import org.apache.dolphinscheduler.plugin.task.api.parameters.AbstractParameters;
import org.apache.dolphinscheduler.plugin.task.api.utils.ParameterUtils;

import org.apache.commons.lang3.StringUtils;
import org.apache.http.HttpStatus;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.apache.http.util.EntityUtils;

import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Slf4j
public class SeaTunnelRestTask extends AbstractRemoteTask {

    private final TaskExecutionContext taskExecutionContext;
    private SeaTunnelRestParameters seaTunnelRestParameters;
    private SeaTunnelRestTaskExecutionContext seaTunnelRestTaskExecutionContext;
    private String seaTunnelJobId;
    private CloseableHttpClient httpClient;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public SeaTunnelRestTask(TaskExecutionContext taskExecutionContext) {
        super(taskExecutionContext);
        this.taskExecutionContext = taskExecutionContext;
    }

    @Override
    public void init() {
        final String taskParams = taskExecutionContext.getTaskParams();
        this.seaTunnelRestParameters = JSONUtils.parseObject(taskParams, SeaTunnelRestParameters.class);
        if (this.seaTunnelRestParameters == null || !this.seaTunnelRestParameters.checkParameters()) {
            throw new SeaTunnelRestTaskException("SeaTunnel REST task params is not valid");
        }
        this.httpClient = createHttpClient();
    }

    @Override
    public void handle(TaskCallBack taskCallBack) throws TaskException {
        try {
            // Get the variable map from the task execution context
            Map<String, Property> paramsMap = taskExecutionContext.getPrepareParamsMap();

            // Replace placeholders in restEndpoint and jobConfig
            String endpoint = ParameterUtils.convertParameterPlaceholders(seaTunnelRestParameters.getRestEndpoint(),
                    ParameterUtils.convert(paramsMap));
            String jobConfig = ParameterUtils.convertParameterPlaceholders(seaTunnelRestParameters.getJobConfig(),
                    ParameterUtils.convert(paramsMap));

            // Update the parameters object with the resolved values
            seaTunnelRestParameters.setRestEndpoint(endpoint);
            seaTunnelRestParameters.setJobConfig(jobConfig);

            this.seaTunnelRestTaskExecutionContext =
                    seaTunnelRestParameters.generateExtendedContext(taskExecutionContext.getResourceParametersHelper());
            log.info("Initialize SeaTunnel REST task params: {}",
                    JSONUtils.toPrettyJsonString(seaTunnelRestParameters));

            // Submit job to SeaTunnel server
            this.seaTunnelJobId = submitJob();

            if (StringUtils.isEmpty(seaTunnelJobId)) {
                throw new SeaTunnelRestTaskException("Submit SeaTunnel job failed: jobId is empty");
            }

            // Set app id for DolphinScheduler UI display
            setAppIds(seaTunnelJobId);
            log.info("SeaTunnel job submitted successfully, jobId: {}", seaTunnelJobId);

            // Poll job status until finished
            pollJobStatus();

        } catch (Exception e) {
            setExitStatusCode(TaskConstants.EXIT_CODE_FAILURE);
            log.error("SeaTunnel REST task failed", e);
            throw new TaskException("Execute SeaTunnel REST task failed", e);
        }
    }

    @Override
    public void submitApplication() throws TaskException {
        // Already handled in handle() method
    }

    @Override
    public void trackApplicationStatus() throws TaskException {
        // Already handled in handle() method
    }

    /**
     * Submit SeaTunnel job via REST API v2
     *
     * @return jobId returned from SeaTunnel server
     * @throws Exception if submission fails
     */
    private String submitJob() throws Exception {
        String submitUrl = seaTunnelRestParameters.getRestEndpoint() + "/submit-job";

        // Build job config JSON
        Map<String, Object> jobConfigMap = seaTunnelRestTaskExecutionContext.getJobConfig();
        String jobConfigJson = JSONUtils.toJsonString(jobConfigMap);

        log.info("Submitting SeaTunnel job to: {}", submitUrl);
        log.debug("Job config: {}", jobConfigJson);

        try {
            HttpPost httpPost = new HttpPost(submitUrl);
            httpPost.setHeader("Content-Type", "application/json");

            StringEntity entity = new StringEntity(jobConfigJson, ContentType.APPLICATION_JSON);
            httpPost.setEntity(entity);

            try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String responseBody = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);

                log.info("Submit response status: {}, body: {}", statusCode, responseBody);

                if (statusCode != HttpStatus.SC_OK) {
                    throw new SeaTunnelRestTaskException(
                            String.format("Submit job failed with status %d: %s", statusCode, responseBody));
                }

                // Parse jobId from response
                JsonNode jsonNode = MAPPER.readTree(responseBody);
                String jobId = jsonNode.path("jobId").asText();

                if (StringUtils.isEmpty(jobId)) {
                    throw new SeaTunnelRestTaskException("JobId not found in submit response: " + responseBody);
                }

                return jobId;
            }
        } finally {
            // No need to close httpClient here as it's managed by the class
        }
    }

    /**
     * Poll job status until it finishes (success/failure/cancel)
     * Using REST API v2
     *
     * @throws Exception if polling fails
     */
    private void pollJobStatus() throws Exception {
        String jobInfoUrl = seaTunnelRestParameters.getRestEndpoint() +
                "/job-info/" + seaTunnelJobId;

        int pollInterval = seaTunnelRestParameters.getPollInterval();
        long startTime = System.currentTimeMillis();
        long maxRuntimeMillis = 3 * 24 * 60 * 60 * 1000; // 3 days
        int failureCount = 0;
        int maxFailures = 10;

        while (true) {
            if (System.currentTimeMillis() - startTime > maxRuntimeMillis) {
                throw new SeaTunnelRestTaskException("Task exceeded maximum runtime of 3 days");
            }

            try {
                HttpGet httpGet = new HttpGet(jobInfoUrl);

                try (CloseableHttpResponse response = httpClient.execute(httpGet)) {
                    int statusCode = response.getStatusLine().getStatusCode();
                    String responseBody = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);

                    if (statusCode != HttpStatus.SC_OK) {
                        log.warn("Query job status failed with status {}: {}", statusCode, responseBody);
                        failureCount++;
                        if (failureCount > maxFailures) {
                            throw new SeaTunnelRestTaskException(
                                    "Query job status failed for " + maxFailures + " consecutive times");
                        }
                        Thread.sleep(pollInterval);
                        continue;
                    }

                    // Reset failure count on success
                    failureCount = 0;

                    // Parse job status
                    JsonNode jsonNode = MAPPER.readTree(responseBody);

                    if (jsonNode.path("jobId").asText().isEmpty()) {
                        log.warn("Job {} not found, may not be started yet", seaTunnelJobId);
                        Thread.sleep(pollInterval);
                        continue;
                    }

                    String jobStatus = jsonNode.path("jobStatus").asText();
                    if (StringUtils.isEmpty(jobStatus)) {
                        log.warn("Job status is empty in response: {}", responseBody);
                        Thread.sleep(pollInterval);
                        continue;
                    }
                    log.info("SeaTunnel job {} status: {}", seaTunnelJobId, jobStatus);

                    // Log metrics if available
                    if (jsonNode.has("metrics")) {
                        JsonNode metrics = jsonNode.get("metrics");
                        log.info("Job metrics: {}", metrics.toString());
                    }

                    // Check if job finished
                    SeaTunnelJobStatus jobStatusEnum = SeaTunnelJobStatus.of(jobStatus);
                    switch (jobStatusEnum) {
                        case FINISHED:
                            setExitStatusCode(TaskConstants.EXIT_CODE_SUCCESS);
                            log.info("SeaTunnel job {} finished successfully", seaTunnelJobId);
                            return; // Exit loop
                        case FAILED:
                            setExitStatusCode(TaskConstants.EXIT_CODE_FAILURE);
                            String errorMsg = jsonNode.path("errorMsg").asText("Unknown error");
                            log.error("SeaTunnel job {} failed: {}", seaTunnelJobId, errorMsg);
                            throw new SeaTunnelRestTaskException("SeaTunnel job failed: " + errorMsg);
                        case CANCELED:
                        case CANCELLED:
                            setExitStatusCode(TaskConstants.EXIT_CODE_KILL);
                            log.warn("SeaTunnel job {} was cancelled", seaTunnelJobId);
                            return; // Exit loop
                        case RUNNING:
                            // Continue polling
                            break;
                        default:
                            log.warn("Unknown job status: {}", jobStatus);
                            break;
                    }

                    // Sleep before next poll
                    Thread.sleep(pollInterval);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new SeaTunnelRestTaskException("Job polling interrupted", e);
            }
        }
    }

    /**
     * Create HTTP client with configured timeouts
     *
     * @return CloseableHttpClient
     */
    private CloseableHttpClient createHttpClient() {
        RequestConfig requestConfig = RequestConfig.custom()
                .setConnectTimeout(seaTunnelRestParameters.getConnectTimeout())
                .setSocketTimeout(seaTunnelRestParameters.getSocketTimeout())
                .build();

        return HttpClients.custom()
                .setDefaultRequestConfig(requestConfig)
                .build();
    }

    @Override
    public AbstractParameters getParameters() {
        return seaTunnelRestParameters;
    }

    @Override
    public void cancelApplication() throws TaskException {
        if (StringUtils.isEmpty(seaTunnelJobId)) {
            log.warn("JobId is empty, cannot cancel job");
            return;
        }

        String stopJobUrl = seaTunnelRestParameters.getRestEndpoint() +
                "/stop-job";

        log.info("Trying to cancel SeaTunnel job: {}", seaTunnelJobId);

        try {
            HttpPost httpPost = new HttpPost(stopJobUrl);
            httpPost.setHeader("Content-Type", "application/json");

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("jobId", seaTunnelJobId);
            requestBody.put("isStopWithSavePoint", false);

            StringEntity entity = new StringEntity(
                    JSONUtils.toJsonString(requestBody),
                    ContentType.APPLICATION_JSON);
            httpPost.setEntity(entity);

            try (CloseableHttpResponse response = httpClient.execute(httpPost)) {
                int statusCode = response.getStatusLine().getStatusCode();
                String responseBody = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);

                log.info("Cancel job response status: {}, body: {}", statusCode, responseBody);

                if (statusCode == HttpStatus.SC_OK) {
                    log.info("SeaTunnel job {} cancelled successfully", seaTunnelJobId);
                } else {
                    log.warn("Cancel job may have failed: {}", responseBody);
                }
            }
        } catch (Exception e) {
            log.error("Failed to cancel SeaTunnel job: " + seaTunnelJobId, e);
            throw new TaskException("Cancel SeaTunnel job failed", e);
        }
    }

    @Override
    public List<String> getApplicationIds() throws TaskException {
        return seaTunnelJobId != null ? Collections.singletonList(seaTunnelJobId) : Collections.emptyList();
    }
}
