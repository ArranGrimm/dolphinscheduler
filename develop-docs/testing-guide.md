# SeaTunnel REST 插件测试指南

## 📋 概述

本指南介绍如何测试 DolphinScheduler 的 SeaTunnel REST 自定义任务插件。

## 🔧 前置准备

### 1. 安装依赖模块

首次测试前，需要先安装 DolphinScheduler 的内部依赖到本地 Maven 仓库：

```bash
cd dolphinscheduler

# 最小化安装（推荐，只安装必需模块）
mvn clean install -pl dolphinscheduler-spi,dolphinscheduler-task-plugin/dolphinscheduler-task-api -am -DskipTests -Dspotless.check.skip=true

# 完整安装（可选，安装所有模块，耗时较长）
mvn clean install -Prelease -Dmaven.test.skip=true -Dspotless.check.skip=true
```

**参数说明**：
- `-pl`: 指定要构建的模块
- `-am`: 同时构建依赖的模块
- `-DskipTests`: 跳过测试
- `-Dspotless.check.skip=true`: 跳过代码格式检查（避免格式错误导致失败）

## 🧪 运行测试

### 2. 单元测试（参数验证）

测试参数验证逻辑：

```bash
cd dolphinscheduler/dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest

# 运行所有测试
mvn test

# 只运行特定测试类
mvn test -Dtest=SeaTunnelRestTaskTest
```

### 3. Mock 测试（HTTP 交互模拟）

测试 HTTP 请求/响应逻辑，无需真实的 SeaTunnel 服务器：

```bash
cd dolphinscheduler/dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest

# 运行 Mock 测试
mvn test -Dtest=SeaTunnelRestTaskMockTest
```

**Mock 测试覆盖场景**：
- 参数验证
- HTTP 提交任务
- 任务状态轮询
- JDBC 配置序列化
- 真实 Oracle-to-Console 场景（使用脱敏数据）

### 4. 集成测试（连接真实服务）

连接真实的 SeaTunnel 服务器和数据库进行端到端测试。

#### 4.1 配置环境变量

创建 `test.env` 文件（基于 `test.env.example`）：

```bash
cd dolphinscheduler/dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest
cp test.env.example test.env
```

编辑 `test.env`，填入真实配置：

```properties
# SeaTunnel REST API
SEATUNNEL_REST_ENDPOINT=http://localhost:8080

# 数据库连接（用于真实测试）
ORACLE_URL=jdbc:oracle:thin:@//localhost:1521/ORCLCDB
ORACLE_USER=your_username
ORACLE_PASSWORD=your_password
ORACLE_QUERY=SELECT * FROM your_table WHERE ROWNUM <= 10
```

**⚠️ 注意**: `test.env` 已在 `.gitignore` 中，不会被提交到 Git。

#### 4.2 运行集成测试

```bash
cd dolphinscheduler/dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest

# 加载环境变量并运行集成测试
# Windows (PowerShell)
Get-Content test.env | ForEach-Object { if ($_ -match '^([^#].+?)=(.+)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }; mvn test -Dtest=SeaTunnelRestTaskIntegrationTest

# Linux/Mac
export $(cat test.env | grep -v '^#' | xargs) && mvn test -Dtest=SeaTunnelRestTaskIntegrationTest
```

**集成测试场景**：
- 提交 FakeSource 任务
- 提交真实 Oracle JDBC 任务
- 验证任务状态
- 测试任务取消

## 📦 编译打包

### 5. 编译插件模块

```bash
cd dolphinscheduler/dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest

# 编译并打包（跳过测试）
mvn clean package -DskipTests

# 编译并运行测试
mvn clean package
```

编译成功后，JAR 文件位于：
```
target/dolphinscheduler-task-seatunnel-rest-3.2.2.jar
```

### 6. 完整项目打包

```bash
cd dolphinscheduler

# 打包整个项目（包含所有插件）
mvn clean package -Prelease -DskipTests -Dspotless.check.skip=true
```

## 🔍 常见问题

### Q1: 找不到依赖模块？

```
Could not find artifact org.apache.dolphinscheduler:dolphinscheduler-spi:jar:3.2.2
```

**解决方案**: 运行前置准备中的依赖安装命令。

### Q2: Spotless 格式检查失败？

```
Failed to execute goal com.diffplug.spotless:spotless-maven-plugin:2.27.2:check
```

**解决方案**: 在命令中添加 `-Dspotless.check.skip=true`，或运行 `mvn spotless:apply` 自动修复格式。

### Q3: 集成测试跳过执行？

集成测试类默认使用 `@Disabled` 注解，需要手动移除注解后才能运行。

### Q4: 如何查看详细日志？

```bash
# 启用 Maven 调试模式
mvn test -X -Dtest=SeaTunnelRestTaskMockTest
```

## 📚 测试文件说明

| 文件 | 用途 |
|------|------|
| `SeaTunnelRestTaskTest.java` | 单元测试：参数验证 |
| `SeaTunnelRestTaskMockTest.java` | Mock 测试：HTTP 交互模拟 |
| `SeaTunnelRestTaskIntegrationTest.java` | 集成测试：连接真实服务 |
| `test.env.example` | 环境变量配置模板 |

## 🎯 推荐测试流程

1. **初次开发**: 运行单元测试 → Mock 测试
2. **功能验证**: 配置环境变量 → 运行集成测试
3. **打包部署**: 编译打包 → 部署到 Worker

## 📖 相关文档

- [详细设计文档](design/seatunnel自定义ds插件详细设计.md)
- [实施计划](plan/seat.plan.md)
- [开发进度](progress.md)
- [变更日志](changelog-2025-10-10.md)

