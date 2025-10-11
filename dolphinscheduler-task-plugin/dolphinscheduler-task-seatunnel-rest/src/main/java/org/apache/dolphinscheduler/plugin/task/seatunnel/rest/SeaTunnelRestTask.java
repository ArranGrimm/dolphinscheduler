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
import org.apache.dolphinscheduler.plugin.task.api.parameters.AbstractParameters;

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
    private String seaTunnelJobId;

    protected SeaTunnelRestTask(TaskExecutionContext taskExecutionContext) {
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
        log.info("Initialize SeaTunnel REST task params: {}", JSONUtils.toPrettyJsonString(seaTunnelRestParameters));
    }

    @Override
    public void handle(TaskCallBack taskCallBack) throws TaskException {
        try {
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
        Map<String, Object> jobConfigMap = buildJobConfig();
        String jobConfigJson = JSONUtils.toJsonString(jobConfigMap);

        log.info("Submitting SeaTunnel job to: {}", submitUrl);
        log.info("Job config: {}", jobConfigJson);

        try (CloseableHttpClient httpClient = createHttpClient()) {
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
                ObjectMapper mapper = new ObjectMapper();
                JsonNode jsonNode = mapper.readTree(responseBody);
                String jobId = jsonNode.get("jobId").asText();

                if (StringUtils.isEmpty(jobId)) {
                    throw new SeaTunnelRestTaskException("JobId not found in submit response: " + responseBody);
                }

                return jobId;
            }
        }
    }

    /**
     * Build job config map from parameters
     *
     * @return job config map
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> buildJobConfig() {
        Map<String, Object> config = new HashMap<>();

        // If jobConfig JSON string is provided, use it directly
        if (StringUtils.isNotEmpty(seaTunnelRestParameters.getJobConfig())) {
            return (Map<String, Object>) JSONUtils.parseObject(seaTunnelRestParameters.getJobConfig(), Map.class);
        }

        // Otherwise build from structured parameters
        if (seaTunnelRestParameters.getEnv() != null) {
            config.put("env", seaTunnelRestParameters.getEnv());
        }

        if (seaTunnelRestParameters.getSource() != null) {
            config.put("source", seaTunnelRestParameters.getSource());
        }

        if (seaTunnelRestParameters.getTransform() != null && !seaTunnelRestParameters.getTransform().isEmpty()) {
            config.put("transform", seaTunnelRestParameters.getTransform());
        }

        if (seaTunnelRestParameters.getSink() != null) {
            config.put("sink", seaTunnelRestParameters.getSink());
        }

        return config;
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

        while (true) {
            try (CloseableHttpClient httpClient = createHttpClient()) {
                HttpGet httpGet = new HttpGet(jobInfoUrl);

                try (CloseableHttpResponse response = httpClient.execute(httpGet)) {
                    int statusCode = response.getStatusLine().getStatusCode();
                    String responseBody = EntityUtils.toString(response.getEntity(), StandardCharsets.UTF_8);

                    if (statusCode != HttpStatus.SC_OK) {
                        log.warn("Query job status failed with status {}: {}", statusCode, responseBody);
                        Thread.sleep(pollInterval);
                        continue;
                    }

                    // Parse job status
                    ObjectMapper mapper = new ObjectMapper();
                    JsonNode jsonNode = mapper.readTree(responseBody);

                    if (jsonNode.has("jobId") && jsonNode.get("jobId").asText().isEmpty()) {
                        log.warn("Job {} not found, may not be started yet", seaTunnelJobId);
                        Thread.sleep(pollInterval);
                        continue;
                    }

                    String jobStatus = jsonNode.get("jobStatus").asText();
                    log.info("SeaTunnel job {} status: {}", seaTunnelJobId, jobStatus);

                    // Log metrics if available
                    if (jsonNode.has("metrics")) {
                        JsonNode metrics = jsonNode.get("metrics");
                        log.info("Job metrics: {}", metrics.toString());
                    }

                    // Check if job finished
                    if ("FINISHED".equalsIgnoreCase(jobStatus)) {
                        setExitStatusCode(TaskConstants.EXIT_CODE_SUCCESS);
                        log.info("SeaTunnel job {} finished successfully", seaTunnelJobId);
                        break;
                    } else if ("FAILED".equalsIgnoreCase(jobStatus)) {
                        setExitStatusCode(TaskConstants.EXIT_CODE_FAILURE);
                        String errorMsg =
                                jsonNode.has("errorMsg") ? jsonNode.get("errorMsg").asText() : "Unknown error";
                        log.error("SeaTunnel job {} failed: {}", seaTunnelJobId, errorMsg);
                        throw new SeaTunnelRestTaskException("SeaTunnel job failed: " + errorMsg);
                    } else if ("CANCELED".equalsIgnoreCase(jobStatus) || "CANCELLED".equalsIgnoreCase(jobStatus)) {
                        setExitStatusCode(TaskConstants.EXIT_CODE_KILL);
                        log.warn("SeaTunnel job {} was cancelled", seaTunnelJobId);
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

        try (CloseableHttpClient httpClient = createHttpClient()) {
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
