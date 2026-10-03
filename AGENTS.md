# AGENTS.md

## Product Source of Truth

1. `docs/INVENTORY_APP_V0.1_DESIGN_FREEZE.md` 是当前产品规则最高优先级来源。
2. 如果需求、代码或其他文档与 Design Freeze 冲突，先记录到 `OPEN_QUESTIONS.md`，不要自行改变产品规则。
3. 新增功能不得擅自突破 V0.1 Scope。
4. 所有对核心产品规则的修改都必须同步更新 Design Freeze，而不能只修改代码。

## Frozen Inventory Rules

1. 不得自行取消 Item / Batch / Transaction 三层数据结构。
2. 不得直接修改库存 quantity 而不留下对应库存流水。
3. 不得把 Reminder 和 RestockItem 合并。
4. 不得自动删除过期库存。
5. 不得为了实现方便改变 FEFO 规则。
6. 不得将背景流水改成首页主要卡片。
7. 保质期状态与库存状态不得合并成一个字段或一个状态机。
8. 剩余天数、临期状态、库存状态等派生数据不得作为主事实重复保存。

## Architecture Rules

1. 页面不得直接承担跨多个 Collection 的复杂业务逻辑。
2. 涉及 Batch 修改、Transaction 创建、Reminder 更新、RestockItem 更新的业务操作，必须作为完整业务动作放在 Service 层或云函数中。
3. 云数据库是库存事实主数据源；本地 Storage 只用于缓存、UI 状态、最近搜索、草稿等。
4. 所有用户私有数据必须按当前微信用户身份隔离。
5. 高风险写操作优先使用云函数和数据库事务；如平台能力不足，必须设计幂等 ID、失败补偿或回滚策略。

## Development Workflow

1. 如果需求存在未定义边界，应记录到 `OPEN_QUESTIONS.md`，而不是自行作出产品决定。
2. 每完成一个 Phase，都必须按照 Design Freeze 中的验收场景进行检查。
3. 实现顺序优先遵循 `IMPLEMENTATION_PLAN.md`。
4. 修改小程序页面、样式和工具代码时，优先在 `miniprogram/` 内变更。
5. 保持 `project.config.json` 在仓库根目录，微信开发者工具应打开仓库根目录。
6. 不要把开发者本地私有配置扩散到公共配置中，`project.private.config.json` 仅用于本地工具偏好。
