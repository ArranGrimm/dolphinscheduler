# SeaTunnel REST 任务插件开发进度

## 项目概述

为 Apache DolphinScheduler 开发原生的 SeaTunnel REST 任务插件，允许用户通过 DolphinScheduler 调度平台提交和管控 SeaTunnel 数据同步任务。

## 开发阶段

### ✅ 阶段一：项目准备与骨架搭建 (已完成)

**完成时间**: 2025-10-10

**完成内容**:
1. ✅ 调研并选定任务插件开发模板
   - 选择 `dolphinscheduler-task-zeppelin` 作为参考骨架
   - 分析了 HTTP、Dinky、MLflow 等多个插件的实现方式
   - 确定采用 REST API 交互 + 轮询状态的实现方案

2. ✅ 创建插件模块骨架
   - 目录：`dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest`
   - 完成包结构规划：`org.apache.dolphinscheduler.plugin.task.seatunnel.rest`
   - 创建 Maven POM 配置

3. ✅ 实现核心类文件
   - `SeaTunnelRestParameters.java` - 参数模型
   - `SeaTunnelRestTask.java` - 任务执行主类
   - `SeaTunnelRestTaskChannel.java` - 任务通道
   - `SeaTunnelRestTaskChannelFactory.java` - 任务工厂（SPI 入口）
   - `SeaTunnelRestTaskException.java` - 自定义异常
   - SPI 注册文件：`META-INF/services/org.apache.dolphinscheduler.plugin.task.api.TaskChannelFactory`

4. ✅ 实现核心功能
   - REST API 交互（提交任务、查询状态、取消任务）
   - 任务状态轮询机制
   - 超时配置支持
   - 日志输出与错误处理

5. ✅ 完善测试体系 (2025-10-11 更新)
   - `SeaTunnelRestTaskTest.java` - 基础参数验证测试
   - `SeaTunnelRestTaskMockTest.java` - Mock HTTP 测试
     * FakeSource 场景测试
     * **JDBC Oracle 真实场景测试**（使用脱敏数据）
     * 超时配置测试
     * 序列化/反序列化测试
   - `SeaTunnelRestTaskIntegrationTest.java` - 集成测试（通过环境变量配置）
     * FakeSource 到 Console
     * JDBC Oracle 到 Console（真实数据库）
   - 安全性保护
     * 默认禁用（`@Disabled` 注解）
     * 敏感数据通过命令行环境变量设置
     * 不保存任何配置文件到代码库

## 技术实现细节

### 依赖配置
```xml
- dolphinscheduler-task-api (核心API)
- dolphinscheduler-spi (SPI支持)
- httpclient/httpcore (HTTP通信)
- commons-collections4 (工具类)
```

### API 端点设计 (REST API v2)
- 提交任务：`POST /submit-job`
- 查询状态：`GET /job-info/{jobId}`
- 取消任务：`POST /stop-job`

**注意**: 已从 v1 接口路径 `/hazelcast/rest/maps/*` 迁移到 v2 标准路径

### 参数模型设计
```java
{
  "restEndpoint": "http://localhost:5801",  // SeaTunnel Server 地址
  "jobConfig": "{}",                        // JSON 格式配置（可选）
  "env": {},                                // 环境配置（可选）
  "source": [],                             // Source 连接器列表（可选）
  "transform": [],                          // Transform 转换列表（可选）
  "sink": [],                               // Sink 连接器列表（可选）
  "connectTimeout": 60000,                  // 连接超时（毫秒）
  "socketTimeout": 60000,                   // 读取超时（毫秒）
  "pollInterval": 10000                     // 轮询间隔（毫秒）
}
```

### 核心逻辑流程
1. **初始化阶段** (`init()`)
   - 反序列化任务参数
   - 验证配置完整性

2. **任务提交阶段** (`submitJob()`)
   - 构建 SeaTunnel 作业配置
   - 调用 REST API 提交任务
   - 获取并保存 jobId

3. **状态轮询阶段** (`pollJobStatus()`)
   - 定期查询任务状态
   - 输出任务指标信息
   - 判断任务最终状态（FINISHED/FAILED/CANCELLED）

4. **任务取消** (`cancelApplication()`)
   - 调用停止任务 API
   - 处理取消响应

## 待完成事项

### 🔄 阶段二：集成测试与优化 (进行中)

**完成时间**: 2025-10-11

**完成内容**:
1. ✅ 在 `dolphinscheduler-task-plugin/pom.xml` 中注册新模块
2. ✅ 更新 `dolphinscheduler-task-all/pom.xml` 添加依赖
3. ✅ 解决编译依赖问题（Maven 依赖安装）
4. ✅ 编写完整的测试体系
   - 单元测试（参数验证）
   - Mock 测试（HTTP 交互）
   - 集成测试（真实服务连接）
5. ✅ 清理冗余脚本和文档
   - 删除多余的 `.cmd` 脚本文件
   - 整合测试文档为统一的 `testing-guide.md`
6. ⏳ 部署到 DolphinScheduler Worker 测试环境
7. ⏳ 进行端到端集成测试（连接真实 SeaTunnel Server）
8. ⏳ 性能优化与错误处理增强

### 📋 阶段三：前端界面开发 (待启动)

**计划内容**:
1. ⏳ 在 DolphinScheduler UI 中创建任务配置组件
2. ⏳ 实现可视化配置界面
   - 左侧：Pipeline Builder（env/source/transform/sink 配置）
   - 右侧：JSON 预览面板
3. ⏳ 实现动态表单组件
4. ⏳ 集成 Pinia 状态管理
5. ⏳ 前后端联调

### 🎯 阶段四：文档与发布 (待启动)

**计划内容**:
1. ⏳ 编写用户使用文档
2. ⏳ 编写开发者文档
3. ⏳ 准备示例配置
4. ⏳ 发布插件

## 关键决策记录

### 决策 1：选择 Zeppelin 作为参考模板
**时间**: 2025-10-10  
**原因**: 
- Zeppelin 插件同样采用 REST API 交互
- 有完整的异步任务提交与轮询机制
- 代码结构清晰，易于理解和改造

### 决策 2：支持两种配置方式
**时间**: 2025-10-10  
**原因**:
- **JSON 字符串方式**：适合高级用户，灵活度高
- **结构化配置方式**：适合前端可视化组件，便于表单验证

### 决策 3：采用轮询而非 WebSocket
**时间**: 2025-10-10  
**原因**:
- SeaTunnel REST API v2 主要提供 HTTP 接口
- 轮询方式实现简单，可靠性高
- 符合 DolphinScheduler 其他远程任务插件的实现惯例

### 决策 4：使用 SeaTunnel REST API v2
**时间**: 2025-10-10  
**修正原因**:
- v1 接口 (`/hazelcast/rest/maps/*`) 已淘汰
- v2 接口更简洁：直接使用 `/submit-job`、`/job-info/:jobId`、`/stop-job`
- 符合 SeaTunnel 官方文档推荐的最新实践

## 文件清单

### 源代码文件
```
dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest/
├── pom.xml
├── src/
│   ├── main/
│   │   ├── java/org/apache/dolphinscheduler/plugin/task/seatunnel/rest/
│   │   │   ├── SeaTunnelRestParameters.java
│   │   │   ├── SeaTunnelRestTask.java
│   │   │   ├── SeaTunnelRestTaskChannel.java
│   │   │   ├── SeaTunnelRestTaskChannelFactory.java
│   │   │   └── SeaTunnelRestTaskException.java
│   │   └── resources/
│   │       └── META-INF/services/
│   │           └── org.apache.dolphinscheduler.plugin.task.api.TaskChannelFactory
│   └── test/
│       └── java/org/apache/dolphinscheduler/plugin/task/seatunnel/
│           └── SeaTunnelRestTaskTest.java
```

### 文档文件
```
dolphinscheduler/develop-docs/
├── design/
│   └── seatunnel自定义ds插件详细设计.md
├── plan/
│   └── seat.plan.md
├── seatunnel-docs/
│   └── rest-api-v2.md (SeaTunnel REST API 文档)
├── progress.md (本文档)
├── testing-guide.md (测试指南)
└── changelog-2025-10-10.md (变更日志)
```

### 测试文件
```
dolphinscheduler-task-plugin/dolphinscheduler-task-seatunnel-rest/
└── src/test/java/org/apache/dolphinscheduler/plugin/task/seatunnel/rest/
    ├── SeaTunnelRestTaskTest.java (单元测试：参数验证)
    ├── SeaTunnelRestTaskMockTest.java (Mock 测试：HTTP 交互模拟)
    └── SeaTunnelRestTaskIntegrationTest.java (集成测试：需要设置环境变量)
```

## 下一步行动

1. **立即执行**：
   - 运行 Mock 测试验证插件功能
   - 熟悉 Maven 测试命令（参考 `testing-guide.md`）

2. **本周计划**：
   - 完整编译打包插件模块
   - 部署到 DolphinScheduler Worker 测试环境
   - 运行集成测试（连接真实 SeaTunnel Server）

3. **后续计划**：
   - 启动前端组件开发
   - 实现可视化配置界面
   - 编写用户使用文档

## 备注

- 当前代码基于 DolphinScheduler 3.2.2 版本开发
- SeaTunnel REST API 版本：v2
- 开发分支：`seatunnel_dev_3.2.2`

