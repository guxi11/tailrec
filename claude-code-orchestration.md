# Claude Code 外部编排与上下文控制

## 核心问题

Claude Code 单会话处理多 task 时：
- 所有工具调用历史累积在上下文中
- 每轮 API 调用重发完整 messages 数组（O(n²) input tokens）
- compaction 自动触发但有损且不可控
- 注意力随上下文膨胀而稀释，后期 task 质量下降

## Claude Code 原生 Task 处理机制

```
TaskCreate → 全部 in-memory
TaskUpdate(in_progress) → 在同一会话中执行
所有中间产物（文件读取、工具调用、失败重试）留在上下文
→ 不会自动为每个 task 启 subagent
→ 不会自动加载下一个 task 的相关上下文
```

## 外部编排方案

### 架构

```
用户输入 → 编排脚本 → claude -p (单次调用, 带工具)
                              ↓
                         AI 执行 task + 输出结果
                              ↓
                         编排脚本提取摘要/状态
                              ↓
               拼接: 下一个 task 的卡片上下文 + 状态摘要 → 下一轮
```

### 卡片法上下文组装

```
speckit output/
├── cards/                    # 最小知识单元（200-800 token/张）
│   ├── ui/
│   │   ├── login-form.spec.md
│   │   └── dashboard-layout.spec.md
│   ├── api/
│   │   ├── auth-endpoint.spec.md
│   │   └── user-crud.spec.md
│   ├── types/
│   │   ├── user.schema.ts
│   │   └── session.schema.ts
│   └── constraints/
│       └── auth-flow.constraint.md
├── tasks/
│   └── task-003.md           # 声明 depends_on cards
└── state/
    ├── completed.json        # 已完成 task 的产出摘要
    └── decisions.json        # 跨 task 架构决策
```

Task 文件声明依赖卡片：

```yaml
# task-003.md
id: implement-login-api
cards:
  - api/auth-endpoint.spec.md
  - types/user.schema.ts
  - types/session.schema.ts
  - constraints/auth-flow.constraint.md
prior_output:
  - task-001.summary
```

### 执行流

```bash
# 1. collector subagent：组装上下文
context=$(claude -p "
读取 tasks/task-003.md 的 cards 字段，
收集所有引用的卡片内容，
加上 state/decisions.json，
输出合并后的上下文块" --allowedTools "Read")

# 2. executor：带精确上下文执行
claude -p "
$context
---
任务：实现 task-003
输出要求：
1. 代码变更
2. 更新 state/completed.json（本 task 摘要，<100字）
3. 如有架构决策，追加到 state/decisions.json
" --allowedTools "Edit,Write,Bash(npm test)"
```

### 权限处理

```bash
# 预授权，避免交互阻塞
claude -p "..." --allowedTools "Edit,Write,Bash(npm test),Bash(git *)"

# 或全放开（仅限 CI）
claude -p "..." --dangerously-skip-permissions
```

## 成本对比（10 task，Sonnet 定价）

假设：system 5k tokens，每 task 卡片 3k tokens，每 task 5 轮工具调用各增 3k tokens

| | 单会话 | 隔离会话 |
|---|---|---|
| 总输入 tokens | ~4,000k | ~850k |
| 缓存命中率 | ~85% | ~70% |
| Input 费用 | ~$2.82 | ~$0.94 |
| Output 费用 | ~$0.75 | ~$0.75 |
| **总计** | **~$3.57** | **~$1.69** |
| 增长曲线 | O(n²) | O(n) |
| Task 10 质量 | 注意力稀释 | 恒定 |

task 数翻倍时，单会话成本 ×4，隔离方案成本 ×2。

## 缓存利用

- Anthropic prompt cache 基于前缀匹配，TTL 5 分钟
- 单会话内：天然命中（前缀稳定追加），缓存率 ~85%
- 跨会话：前缀分叉后不命中
- 优化：不变内容（system prompt、规则）放最前面，变化内容放后面

## 隔离方案 vs 单会话

| 维度 | 单会话 | 隔离编排 |
|---|---|---|
| 上下文膨胀 | compaction 有损不可控 | 每轮精确装载 |
| 跨 task 一致性 | 靠窗口硬扛 | decisions.json 显式传递 |
| 失败恢复 | 从头来 | 重跑单个 task |
| 并行执行 | 不支持 | 无依赖 task 可并发 |
| 成本 | O(n²) | O(n) |
| 工程成本 | 零（开箱即用） | 需写编排逻辑 |

## 设计要点

1. **卡片粒度**：一张卡片 = agent 单次能消化的最小完整单元（200-800 token）
2. **状态传递**：只传 decisions.json + 前置 task summary，不传完整历史
3. **collector 价值**：不只拼接，还做关联发现（补充隐式依赖卡片）
4. **本质**：agent 从"有状态长会话"变为"无状态函数 + 外部状态管理"

## name

  deckhand.

  - "Deck" = the deck of context cards you assemble per task
  - "Hand" = what gets dealt to the agent each call
  - Double meaning: a deckhand orchestrates work on deck (the orchestrator
  dispatching isolated tasks)
  - CLI-friendly: deckhand run task-003, deckhand collect, deckhand status
  - Captures the core metaphor: stateless workers receiving precisely dealt
  hands of context
