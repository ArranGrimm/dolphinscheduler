# SeaTunnel REST 插件部署指南

**文档版本**: v1.0  
**创建时间**: 2025-10-27  
**目标读者**: 运维工程师、DevOps、系统管理员

---

## 📋 概述

本文档指导运维人员如何将 SeaTunnel REST 任务插件部署到 DolphinScheduler 集群中。插件支持 Docker 和 Kubernetes 两种部署方式。

---

## 1. 前置条件

### 1.1 版本要求

| 组件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| DolphinScheduler | 3.2.0 | 3.2.2 | 本插件基于 3.2.2 开发 |
| SeaTunnel | 2.3.3 | 2.3.5 | 需要启用 REST API |
| Java | 8 | 11 | Worker 和 API Server 运行环境 |
| PostgreSQL/MySQL | 5.7+ | 8.0+ | DolphinScheduler 元数据库 |

### 1.2 网络要求

确保以下网络连通性：

```
┌─────────────────┐      HTTP      ┌──────────────────┐
│ DS Worker       │ ──────────────> │ SeaTunnel Server │
│ (插件运行位置)   │   REST API     │ (Port 5801)      │
└─────────────────┘                 └──────────────────┘
        │
        │ JDBC
        ▼
┌─────────────────┐
│ 数据源           │
│ (PG/Oracle/Doris)│
└─────────────────┘
```

**端口清单**:
- SeaTunnel REST API: `5801` (默认)
- DolphinScheduler API: `12345` (默认)
- 数据源端口: 根据实际情况配置

---

## 2. 插件文件准备

### 2.1 编译插件

如果您从源码编译（假设您已获取包含插件的 DolphinScheduler 源码）：

```bash
# 进入 DolphinScheduler 项目根目录
cd dolphinscheduler

# 编译整个项目（包含插件）
mvn clean package -Dmaven.test.skip=true

# 插件 JAR 位置
# dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest/target/dolphinscheduler-task-seatunnel-rest-{version}.jar
```

### 2.2 使用预构建包

如果您使用预构建的 DolphinScheduler 发行版（已包含插件）：

```bash
# 解压发行版
tar -zxvf apache-dolphinscheduler-3.2.2-bin.tar.gz
cd apache-dolphinscheduler-3.2.2-bin

# 检查插件是否存在
ls -l libs/plugin/task/seatunnel-rest/
# 应该看到: dolphinscheduler-task-seatunnel-rest-{version}.jar
```

---

## 3. 部署方式

### 3.1 Standalone 模式部署（开发/测试环境）

**适用场景**: 快速验证、本地开发

#### 步骤 1: 启动 SeaTunnel 服务

```bash
# 假设 SeaTunnel 已安装在 /opt/seatunnel
cd /opt/seatunnel

# 启动 SeaTunnel 集群
bash bin/seatunnel-cluster.sh

# 验证服务
curl http://localhost:5801/hazelcast/rest/maps/system-monitoring-information
```

#### 步骤 2: 配置 DolphinScheduler

编辑 `standalone-server/conf/application.yaml`（如果需要自定义配置）:

```yaml
# 无需特殊配置，插件会自动加载
```

#### 步骤 3: 启动 DolphinScheduler Standalone Server

```bash
cd apache-dolphinscheduler-3.2.2-bin

# 启动 Standalone Server
bash bin/dolphinscheduler-daemon.sh start standalone-server

# 查看日志确认插件加载
tail -f standalone-server/logs/dolphinscheduler-standalone.log | grep -i seatunnel

# 应该看到类似日志:
# Load task plugin: seatunnel_rest
```

#### 步骤 4: 验证部署

1. 访问 DolphinScheduler UI: `http://localhost:12345/dolphinscheduler/ui`
2. 登录（默认: admin/dolphinscheduler123）
3. 创建工作流 → 拖拽任务到画布 → 查看任务类型列表
4. 确认"通用组件"分组下有 **SeaTunnel REST** 任务

---

### 3.2 Docker Compose 部署（推荐）

**适用场景**: 生产环境快速部署、容器化环境

#### 准备 docker-compose.yml

```yaml
version: '3.8'

services:
  # PostgreSQL 元数据库
  dolphinscheduler-postgresql:
    image: postgres:13
    environment:
      POSTGRES_USER: root
      POSTGRES_PASSWORD: root
      POSTGRES_DB: dolphinscheduler
    volumes:
      - dolphinscheduler-postgresql:/var/lib/postgresql/data
    networks:
      - dolphinscheduler

  # SeaTunnel 服务
  seatunnel:
    image: apache/seatunnel:2.3.5
    command: /opt/seatunnel/bin/seatunnel-cluster.sh
    ports:
      - "5801:5801"
    networks:
      - dolphinscheduler
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5801/hazelcast/rest/maps/system-monitoring-information"]
      interval: 30s
      timeout: 10s
      retries: 3

  # DolphinScheduler Master
  dolphinscheduler-master:
    image: apache/dolphinscheduler:3.2.2  # 使用包含插件的自定义镜像
    environment:
      DATABASE_TYPE: postgresql
      DATABASE_HOST: dolphinscheduler-postgresql
      DATABASE_PORT: 5432
      DATABASE_USERNAME: root
      DATABASE_PASSWORD: root
      DATABASE_DATABASE: dolphinscheduler
      REGISTRY_TYPE: zookeeper
      REGISTRY_ZOOKEEPER_CONNECT_STRING: dolphinscheduler-zookeeper:2181
    depends_on:
      - dolphinscheduler-postgresql
      - dolphinscheduler-zookeeper
    networks:
      - dolphinscheduler

  # DolphinScheduler Worker
  dolphinscheduler-worker:
    image: apache/dolphinscheduler:3.2.2  # 使用包含插件的自定义镜像
    environment:
      DATABASE_TYPE: postgresql
      DATABASE_HOST: dolphinscheduler-postgresql
      DATABASE_PORT: 5432
      DATABASE_USERNAME: root
      DATABASE_PASSWORD: root
      DATABASE_DATABASE: dolphinscheduler
      REGISTRY_TYPE: zookeeper
      REGISTRY_ZOOKEEPER_CONNECT_STRING: dolphinscheduler-zookeeper:2181
    depends_on:
      - dolphinscheduler-postgresql
      - dolphinscheduler-zookeeper
    networks:
      - dolphinscheduler

  # DolphinScheduler API Server
  dolphinscheduler-api:
    image: apache/dolphinscheduler:3.2.2  # 使用包含插件的自定义镜像
    ports:
      - "12345:12345"
    environment:
      DATABASE_TYPE: postgresql
      DATABASE_HOST: dolphinscheduler-postgresql
      DATABASE_PORT: 5432
      DATABASE_USERNAME: root
      DATABASE_PASSWORD: root
      DATABASE_DATABASE: dolphinscheduler
      REGISTRY_TYPE: zookeeper
      REGISTRY_ZOOKEEPER_CONNECT_STRING: dolphinscheduler-zookeeper:2181
    depends_on:
      - dolphinscheduler-postgresql
      - dolphinscheduler-zookeeper
    networks:
      - dolphinscheduler

  # Zookeeper (注册中心)
  dolphinscheduler-zookeeper:
    image: zookeeper:3.8
    environment:
      ZOO_4LW_COMMANDS_WHITELIST: srvr,ruok,wchs,cons
    networks:
      - dolphinscheduler

networks:
  dolphinscheduler:
    driver: bridge

volumes:
  dolphinscheduler-postgresql:
```

#### 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f dolphinscheduler-worker

# 确认插件加载
docker-compose exec dolphinscheduler-worker ls /opt/dolphinscheduler/libs/plugin/task/seatunnel-rest/
```

---

### 3.3 Kubernetes (Helm) 部署

**适用场景**: 生产环境、云原生部署

#### 步骤 1: 准备自定义镜像（如果官方镜像不包含插件）

创建 `Dockerfile`:

```dockerfile
FROM apache/dolphinscheduler:3.2.2

# 复制插件到指定目录
COPY dolphinscheduler-task-seatunnel-rest-*.jar /opt/dolphinscheduler/libs/plugin/task/seatunnel-rest/

# 确保权限正确
RUN chown -R dolphinscheduler:dolphinscheduler /opt/dolphinscheduler/libs/plugin/task/seatunnel-rest/
```

构建并推送镜像:

```bash
docker build -t your-registry/dolphinscheduler:3.2.2-seatunnel .
docker push your-registry/dolphinscheduler:3.2.2-seatunnel
```

#### 步骤 2: 准备 Helm Values

创建 `values-custom.yaml`:

```yaml
# 使用包含插件的自定义镜像
image:
  registry: "your-registry"
  repository: "dolphinscheduler"
  tag: "3.2.2-seatunnel"

# PostgreSQL 配置
postgresql:
  enabled: true
  postgresqlUsername: root
  postgresqlPassword: root
  postgresqlDatabase: dolphinscheduler

# Zookeeper 配置
zookeeper:
  enabled: true
  fourlwCommandsWhitelist: "srvr,ruok,wchs,cons"

# Worker 配置
worker:
  replicas: 2
  resources:
    limits:
      memory: "4Gi"
      cpu: "2"
    requests:
      memory: "2Gi"
      cpu: "1"

# Master 配置
master:
  replicas: 2

# API Server 配置
api:
  replicas: 2
  service:
    type: LoadBalancer
    port: 12345
```

#### 步骤 3: 部署 DolphinScheduler

```bash
# 添加 DolphinScheduler Helm Repo
helm repo add dolphinscheduler https://dolphinscheduler.apache.org/helm-chart
helm repo update

# 创建命名空间
kubectl create namespace dolphinscheduler

# 安装
helm install dolphinscheduler dolphinscheduler/dolphinscheduler \
  --namespace dolphinscheduler \
  --values values-custom.yaml

# 查看部署状态
kubectl get pods -n dolphinscheduler

# 查看 Worker 日志确认插件加载
kubectl logs -n dolphinscheduler -l app.kubernetes.io/component=worker | grep -i seatunnel
```

#### 步骤 4: 部署 SeaTunnel（可选，如果不在同一集群）

如果 SeaTunnel 独立部署：

```bash
# 假设使用 StatefulSet 部署 SeaTunnel
kubectl apply -f seatunnel-statefulset.yaml
```

---

## 4. 配置项目级别参数

SeaTunnel REST 插件使用"项目级别参数"来管理 SeaTunnel REST API 的地址，支持跨环境复用工作流定义。

### 4.1 配置步骤

1. 登录 DolphinScheduler UI
2. 进入目标项目 → **项目管理** → **项目参数**
3. 点击"创建参数"
4. 填写参数信息：
   - **参数名称**: `SEATUNNEL_REST_ENDPOINT`
   - **参数值**: `http://seatunnel:5801` (根据实际情况填写)
   - **描述**: SeaTunnel REST API 地址

### 4.2 不同环境的配置示例

**开发环境**:
```
SEATUNNEL_REST_ENDPOINT=http://localhost:5801
```

**Kubernetes 环境**:
```
SEATUNNEL_REST_ENDPOINT=http://seatunnel-service.seatunnel-namespace.svc.cluster.local:5801
```

**生产环境（域名）**:
```
SEATUNNEL_REST_ENDPOINT=http://seatunnel-prod.example.com:5801
```

---

## 5. 配置数据源

### 5.1 添加数据源

1. 登录 DolphinScheduler UI
2. 进入 **数据源中心**
3. 点击"创建数据源"

#### PostgreSQL 数据源示例

- **数据源类型**: PostgreSQL
- **数据源名称**: `pg_source`
- **IP/主机名**: `192.168.1.100`
- **端口**: `5432`
- **用户名**: `postgres`
- **密码**: `***`
- **数据库名**: `testdb`
- **其他参数**: 留空

#### Oracle 数据源示例

- **数据源类型**: Oracle
- **数据源名称**: `oracle_prod`
- **IP/主机名**: `192.168.1.200`
- **端口**: `1521`
- **用户名**: `system`
- **密码**: `***`
- **数据库名**: `ORCL`
- **JDBC 连接参数**: 留空

#### Doris 数据源示例

- **数据源类型**: MySQL (Doris 使用 MySQL 协议)
- **数据源名称**: `doris_warehouse`
- **IP/主机名**: `192.168.1.300`
- **端口**: `9030` (FE Query Port)
- **用户名**: `root`
- **密码**: `***`
- **数据库名**: `warehouse`

**重要提示**: 插件会自动将 Doris 的 9030 端口转换为 8030 端口用于 Stream Load。

---

## 6. 验证部署

### 6.1 检查插件是否加载

#### 方法 1: 查看日志

```bash
# Standalone 模式
tail -f standalone-server/logs/dolphinscheduler-standalone.log | grep -i "seatunnel"

# Docker 模式
docker-compose logs dolphinscheduler-worker | grep -i "seatunnel"

# Kubernetes 模式
kubectl logs -n dolphinscheduler -l app.kubernetes.io/component=worker | grep -i "seatunnel"
```

**期望输出**:
```
[INFO] Load task plugin: seatunnel_rest
[INFO] Register task plugin: SEATUNNEL_REST
```

#### 方法 2: 检查插件文件

```bash
# Standalone 模式
ls -lh libs/plugin/task/seatunnel-rest/

# Docker 模式
docker-compose exec dolphinscheduler-worker ls -lh /opt/dolphinscheduler/libs/plugin/task/seatunnel-rest/

# Kubernetes 模式
kubectl exec -n dolphinscheduler <worker-pod-name> -- ls -lh /opt/dolphinscheduler/libs/plugin/task/seatunnel-rest/
```

### 6.2 创建测试任务

1. 登录 DolphinScheduler UI
2. 创建项目（如果没有）
3. 创建工作流
4. 从左侧任务栏 **"通用组件"** 分组拖拽 **SeaTunnel REST** 任务到画布
5. 配置测试任务（使用 FakeSource）:

```json
{
  "env": {
    "job.mode": "BATCH"
  },
  "source": [
    {
      "plugin_name": "FakeSource",
      "result_table_name": "fake_data",
      "row.num": 10,
      "schema": {
        "fields": {
          "id": "int",
          "name": "string"
        }
      }
    }
  ],
  "sink": [
    {
      "plugin_name": "Console",
      "source_table_name": "fake_data"
    }
  ]
}
```

6. 保存并上线工作流
7. 运行工作流
8. 查看任务日志，确认任务提交到 SeaTunnel 并成功执行

---

## 7. 故障排查

### 7.1 插件未加载

**现象**: 任务列表中没有 SeaTunnel REST 任务

**排查步骤**:
```bash
# 1. 检查插件 JAR 是否存在
ls libs/plugin/task/seatunnel-rest/

# 2. 检查 JAR 文件权限
ls -l libs/plugin/task/seatunnel-rest/

# 3. 查看启动日志
grep -i "seatunnel" logs/dolphinscheduler-worker.log

# 4. 检查 SPI 配置
jar -tf libs/plugin/task/seatunnel-rest/dolphinscheduler-task-seatunnel-rest-*.jar | grep META-INF/services
```

**解决方案**:
- 确保 JAR 文件完整且未损坏
- 确保文件权限正确（644 或 755）
- 重启 Worker 服务

### 7.2 无法连接 SeaTunnel

**现象**: 任务提交失败，日志显示 `Connection refused` 或 `timeout`

**排查步骤**:
```bash
# 1. 检查 SeaTunnel 服务是否运行
curl http://<seatunnel-host>:5801/hazelcast/rest/maps/system-monitoring-information

# 2. 测试网络连通性（从 Worker 容器/节点）
telnet <seatunnel-host> 5801

# 3. 检查防火墙规则
# ...
```

**解决方案**:
- 确保 SeaTunnel 服务正常运行
- 检查网络策略和防火墙配置
- 验证 `SEATUNNEL_REST_ENDPOINT` 参数配置正确

### 7.3 数据源连接失败

**现象**: 任务运行失败，日志显示数据库连接错误

**排查步骤**:
```bash
# 1. 在 DolphinScheduler 数据源中心测试连接

# 2. 检查 Worker 到数据源的网络连通性
# (从 Worker 容器/节点执行)
telnet <datasource-host> <port>

# 3. 检查数据库用户权限
# ...
```

**解决方案**:
- 在数据源中心测试连接
- 检查网络和防火墙
- 验证数据库用户权限

### 7.4 任务运行卡住

**现象**: 任务长时间处于 `RUNNING` 状态

**排查步骤**:
```bash
# 1. 查看 DolphinScheduler Worker 日志
tail -f logs/dolphinscheduler-worker.log

# 2. 查看 SeaTunnel 任务状态
curl http://<seatunnel-host>:5801/hazelcast/rest/maps/running-job/<job-id>

# 3. 查看 SeaTunnel 日志
tail -f seatunnel/logs/seatunnel-engine-server.log
```

**解决方案**:
- 检查 SeaTunnel 任务日志，定位具体错误
- 如果是资源不足，调整 SeaTunnel 集群资源
- 如果是死锁，重启 SeaTunnel 服务

### 7.5 常见错误码

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `restEndpoint is empty` | 未配置项目级别参数 | 配置 `SEATUNNEL_REST_ENDPOINT` |
| `Invalid jobConfig JSON` | JSON 格式错误 | 检查 JSON 语法 |
| `Datasource not found` | 数据源被删除 | 重新创建数据源 |
| `Connection timeout` | 网络不通或 SeaTunnel 服务未启动 | 检查网络和服务状态 |
| `Authentication failed` | 数据库用户名或密码错误 | 检查数据源配置 |

---

## 8. 性能调优建议

### 8.1 Worker 资源配置

根据任务并发量调整 Worker 资源：

```yaml
# Docker Compose
services:
  dolphinscheduler-worker:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
        reservations:
          cpus: '2'
          memory: 4G
```

### 8.2 SeaTunnel 集群配置

调整 SeaTunnel 的并行度和资源：

```yaml
# seatunnel-config.yaml
seatunnel:
  engine:
    backup-count: 1
    print-execution-info-interval: 60
    slot-service:
      dynamic-slot: true
    checkpoint:
      interval: 10000
      timeout: 60000
```

### 8.3 数据库连接池

对于高频数据同步任务，建议在数据源中配置连接池参数。

---

## 9. 安全建议

1. **密码管理**: 使用 DolphinScheduler 的数据源中心统一管理数据库密码
2. **网络隔离**: 将 SeaTunnel 和数据源部署在受保护的网络区域
3. **权限控制**: 为不同环境使用不同的数据库用户，遵循最小权限原则
4. **日志脱敏**: 任务日志中的密码会自动脱敏显示为 `***`

---

## 10. 升级指南

### 从旧版本升级

1. 备份当前配置和数据
2. 停止所有服务
3. 替换插件 JAR 文件
4. 启动服务并验证
5. 检查现有工作流是否正常运行

---

## 11. 支持与反馈

如遇到部署问题，请检查：
1. 本文档的"故障排查"章节
2. DolphinScheduler 官方文档
3. SeaTunnel 官方文档

---

**文档维护**: 如发现文档错误或需要补充内容，请及时更新本文档。

