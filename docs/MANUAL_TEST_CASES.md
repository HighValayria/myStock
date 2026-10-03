# 物有数 V0.1 全阶段测试流程

> 文件建议路径：`docs/MANUAL_TEST_CASES.md`  
> 适用版本：V0.1  
> 适用对象：开发者 / Codex / 手工验收  
> 目标：确保每个 Phase 完成后都能独立验收，并在后续阶段持续执行必要回归测试。

---

# 0. 测试原则

本项目测试分为三类：

1. **Domain / Service 自动化测试**：针对 Item、Batch、Transaction、FEFO、Reminder 等核心业务规则，优先通过单元测试或可重复执行的逻辑测试覆盖。
2. **云端集成测试**：针对 CloudBase / 云数据库 / 云函数 / Repository / Service 的数据一致性与用户隔离。
3. **手工 UI 验收测试**：在微信开发者工具或真实设备中按用户路径操作，验证页面、交互和业务结果是否一致。

所有 Phase 完成后，至少执行：

- 本 Phase 新增测试；
- 与本 Phase 有直接依赖关系的历史回归测试；
- 核心库存闭环回归：增加、消耗、编辑、FEFO、临期、低库存、零库存、待补货。

---

# 1. 测试环境约定

建议准备三个环境：

```text
dev     开发环境
test    集成测试环境
prod    正式环境
```

V0.1 开发阶段优先使用 `dev`。

测试前确认：

- 微信开发者工具可正常运行；
- 云开发环境已初始化；
- 当前测试用户已登录；
- 云数据库权限规则已生效；
- 测试用户数据可清空或使用独立测试账号；
- 测试数据不与正式用户数据混用。

---

# 2. 测试数据基准

## 2.1 分类

```text
食品
护肤品
日化用品
其他
```

## 2.2 位置

```text
家
├─ 厨房
│  └─ 冰箱
│     ├─ 冷藏室
│     └─ 冷冻室
└─ 浴室
   └─ 浴室柜
```

## 2.3 标准物品

### A. 蒙牛牛奶

```text
分类：食品
规格：250ml
单位：盒
默认位置：冷藏室
低库存阈值：2
临期阈值：7天
```

### B. 冷冻鸡腿

```text
分类：食品
规格：500g
单位：包
默认位置：冷冻室
低库存阈值：2
临期阈值：14天
```

### C. 洗发水

```text
分类：日化用品
规格：500ml
单位：瓶
默认位置：浴室柜
低库存阈值：1
```

---

# 3. Phase 0：工程初始化与云开发基础设施

## 3.1 目标

验证：

- 小程序工程可以正常运行；
- TypeScript 正常工作；
- CloudBase / 云开发连接成功；
- 用户身份可以获取；
- 云数据库可读写；
- Repository / Service 分层存在；
- 不同用户数据默认隔离；
- 基础错误处理可用。

## TC-P0-001 小程序启动

前置：项目已导入微信开发者工具。

步骤：

1. 编译项目；
2. 打开首页；
3. 切换到底部各 Tab；
4. 重新编译；
5. 关闭后重新打开。

预期：

- 无编译错误；
- 无白屏；
- 首页、库存、分析、提醒、设置五个一级页面均可访问；
- 控制台无持续性异常报错。

## TC-P0-002 云开发初始化

步骤：

1. 启动小程序；
2. 触发一次基础云环境初始化；
3. 调用测试云函数；
4. 读取测试 Collection。

预期：

- 云环境初始化成功；
- 云函数返回正常；
- 云数据库连接成功；
- 不暴露敏感配置。

## TC-P0-003 当前用户身份

步骤：

1. 用户 A 打开小程序；
2. 获取当前用户上下文；
3. 写入一条测试记录；
4. 检查数据库记录归属。

预期：

- 可以识别当前用户；
- 测试记录具有用户归属；
- 业务层可以限定“当前用户数据”。

## TC-P0-004 用户数据隔离

前置：用户 A 和用户 B 均可进入测试环境。

步骤：

1. 用户 A 创建测试 Item；
2. 用户 B 打开库存列表；
3. 用户 B 尝试通过普通查询读取用户 A 数据；
4. 用户 B 尝试直接访问已知记录 ID。

预期：

- 用户 B 看不到用户 A 数据；
- 非授权读取被拒绝或返回空；
- 非授权修改被拒绝。

## TC-P0-005 Repository 分层约束

检查代码：

- 页面不直接承担复杂多 Collection 写入；
- 核心库存业务通过 Service 调用；
- 数据访问通过 Repository；
- 用户权限逻辑不散落在页面层。

预期：

```text
Page → Service → Repository → Cloud Database / Cloud Function
```

结构成立。

---

# 4. Phase 1：数据层与核心库存 Domain

## 4.1 目标

验证：

- Category / Item / Batch / Transaction / Location / Reminder / RestockItem / Settings 数据模型；
- 增加库存；
- 批次合并；
- FEFO；
- 库存修正；
- 派生状态；
- 基础提醒重算。

## TC-P1-001 创建 Item

步骤：

1. 创建“蒙牛牛奶”；
2. 填写分类、规格、单位、默认位置、低库存阈值；
3. 保存；
4. 从 Repository 读取。

预期：

- Item 仅保存稳定属性；
- 不错误保存某一次购买的批次属性；
- `createdAt / updatedAt` 正确；
- 当前用户归属正确。

## TC-P1-002 新增第一个 Batch

步骤：

1. 为牛奶增加 6 盒；
2. 位置：冷藏室；
3. 购买日期：2026-10-03；
4. 到期日期：2026-10-20；
5. 保存。

预期：

- 新建 1 个 Batch；
- `quantity = 6`；
- 生成 1 条 `ADD` Transaction；
- 当前库存汇总为 6。

## TC-P1-003 相同批次自动合并

前置：

```text
牛奶
2026-10-03购买
冷藏室
2026-10-20到期
数量6
```

步骤：

1. 再增加 3 盒；
2. 购买日期、位置、到期日完全一致。

预期：

- 不创建第二个 Batch；
- 原 Batch 数量变为 9；
- 新增 1 条 `ADD +3` Transaction。

## TC-P1-004 不同到期日不得合并

步骤：

1. 已有牛奶 Batch A，位置冷藏室，到期日 10/20；
2. 再增加牛奶 3 盒；
3. 到期日设为 10/25。

预期：

- 新建 Batch B；
- A 与 B 分开存在；
- 总库存正确汇总。

## TC-P1-005 不同位置不得合并

步骤：

1. 已有同日期牛奶 Batch；
2. 再增加同日期牛奶；
3. 存放位置改为另一个位置。

预期：

- 新建 Batch；
- 不与旧 Batch 合并。

## TC-P1-006 FEFO 单批次消耗

前置：

```text
牛奶 6盒
单一 Batch
```

步骤：

1. 消耗 2 盒。

预期：

- Batch 数量变为 4；
- 生成 `CONSUME -2`；
- 总库存为 4。

## TC-P1-007 FEFO 多批次消耗

前置：

```text
Batch A：2盒，10/05到期
Batch B：5盒，10/20到期
```

步骤：

1. 消耗 3 盒。

预期：

```text
Batch A：0
Batch B：4
```

流水至少能表达：

```text
A -2
B -1
```

且最早到期批次优先消耗。

## TC-P1-008 消耗超过库存

前置：当前总库存 4 盒。

步骤：

1. 尝试消耗 6 盒。

预期：

- 操作失败；
- 库存数量不变化；
- 不产生部分错误流水；
- 返回明确错误提示。

## TC-P1-009 库存修正减少

前置：

```text
系统库存：8
实际盘点：6
```

步骤：

1. 执行库存修正到 6。

预期：

- 生成 `ADJUST -2`；
- Batch 数量正确；
- 不静默覆盖库存。

## TC-P1-010 库存修正增加

前置：

```text
系统库存：4
实际盘点：6
```

步骤：

1. 修正到 6。

预期：

- 生成 `ADJUST +2`；
- 当前库存为 6。

## TC-P1-011 保质期状态：正常

前置：

```text
临期阈值：7天
剩余：10天
```

预期：`expiryStatus = NORMAL`

## TC-P1-012 保质期状态：临期

前置：

```text
阈值：7天
剩余：5天
```

预期：`expiryStatus = EXPIRING`

## TC-P1-013 保质期状态：已过期

前置：到期日早于当前日期。

预期：

- `expiryStatus = EXPIRED`
- 库存数量不自动变为 0。

## TC-P1-014 库存状态：正常

前置：

```text
库存：5
低库存阈值：2
```

预期：`stockStatus = NORMAL`

## TC-P1-015 库存状态：低库存

前置：

```text
库存：2
低库存阈值：2
```

预期：`stockStatus = LOW`

## TC-P1-016 库存状态：零库存

前置：库存为 0。

预期：`stockStatus = ZERO`

---

# 5. Phase 2：增加 / 消耗 / 编辑完整闭环

## 5.1 目标

验证三大核心用户操作可以通过 UI 完整完成。

## TC-P2-001 首页进入新增物品

步骤：

1. 首页点击“增加”；
2. 选择“新物品”；
3. 创建蒙牛牛奶；
4. 填写库存信息；
5. 保存。

预期：

- 页面流程顺畅；
- Item / Batch / ADD Transaction 均正确创建；
- 返回后库存页可见。

## TC-P2-002 首页增加已有物品

步骤：

1. 首页点击“增加”；
2. 选择“已有物品”；
3. 搜索牛奶；
4. 增加 3 盒；
5. 保存。

预期：

- 不重复创建 Item；
- 正确创建或合并 Batch；
- 新增 ADD 流水。

## TC-P2-003 最近使用快速增加

步骤：

1. 连续对某物品进行操作；
2. 再次点击增加；
3. 查看最近使用列表。

预期：

- 最近操作物品优先出现；
- 点击后快速进入增加表单。

## TC-P2-004 首页消耗

步骤：

1. 首页点击“消耗”；
2. 搜索牛奶；
3. 输入数量 2；
4. 确认。

预期：

- 按 FEFO 扣减；
- 页面显示成功；
- 总库存同步更新。

## TC-P2-005 消耗失败提示

步骤：

1. 输入超过库存的消耗量；
2. 提交。

预期：

- 显示清晰失败原因；
- 不发生库存变化；
- 不产生错误流水。

## TC-P2-006 编辑 Item 属性

步骤：

1. 首页点击“编辑”；
2. 选择牛奶；
3. 修改备注或低库存阈值；
4. 保存。

预期：

- Item 更新；
- 库存数量不变化；
- 不错误产生库存流水。

## TC-P2-007 编辑 Batch 属性

步骤：

1. 进入物品详情；
2. 选择某个批次；
3. 修改存放位置或到期日；
4. 保存。

预期：

- Batch 更新；
- Reminder 重新计算；
- Item 不被错误修改。

## TC-P2-008 编辑数量

步骤：

1. 当前库存为 5；
2. 编辑数量为 4；
3. 保存。

预期：

- 生成 `ADJUST -1`；
- 库存变为 4；
- 不直接静默覆盖。

## TC-P2-009 撤销最近操作

步骤：

1. 执行一次增加或消耗；
2. 点击撤销；
3. 查看库存与流水。

预期：

- 库存恢复；
- 历史可追溯；
- 不破坏其他批次。

---

# 6. Phase 3：首页与库存浏览

## 6.1 目标

验证首页摘要、背景流水、搜索、筛选、排序、列表 / 表格与详情页。

## TC-P3-001 首页重要提醒

准备：

- 1 个临期物品；
- 1 个低库存物品。

步骤：

1. 打开首页。

预期：

- 重要提醒区域正确展示；
- 信息不被背景流水遮挡。

## TC-P3-002 背景流水展示

准备多个库存物品。

步骤：

1. 打开首页；
2. 观察背景流水；
3. 等待轮播。

预期：

- 背景流水不是独立主要卡片；
- 信息弱化展示；
- 不遮挡增加 / 消耗 / 编辑；
- 内容来自真实库存数据；
- 动画不过快、不影响操作。

## TC-P3-003 背景流水点击跳转

步骤：

1. 点击某条背景流水物品。

预期：

- 跳转对应物品详情；
- 无误跳。

## TC-P3-004 库存搜索

步骤：

1. 输入“牛奶”；
2. 输入品牌关键字；
3. 清空搜索。

预期：

- 正确过滤；
- 清空后恢复全量。

## TC-P3-005 分类筛选

步骤：

1. 选择“食品”。

预期：仅展示食品类 Item。

## TC-P3-006 位置筛选

步骤：

1. 选择“冷冻室”。

预期：展示至少有一个有效 Batch 在冷冻室的物品。

## TC-P3-007 保质期状态筛选

分别选择：正常、临期、已过期。

预期：结果与动态计算状态一致。

## TC-P3-008 库存状态筛选

分别选择：正常、低库存、零库存。

预期：结果正确。

## TC-P3-009 最近到期排序

准备多个不同到期日 Batch。

预期：Item 依据其最近有效到期日期排序。

## TC-P3-010 表格模式

步骤：

1. 切换表格模式；
2. 横向滑动；
3. 查看关键字段。

预期可看到：

- 名称
- 规格
- 数量
- 单位
- 位置
- 最近到期
- 剩余天数
- 保质期状态
- 库存状态

## TC-P3-011 物品详情聚合

步骤：

1. 打开多批次物品。

预期：

- 当前库存 = 所有有效 Batch 数量之和；
- 批次信息分开显示；
- 最近流水正确；
- 增加 / 消耗 / 编辑入口可用。

---

# 7. Phase 4：提醒系统与待补货

## 7.1 目标

验证 Reminder 生命周期与 RestockItem 独立存在。

## TC-P4-001 首次进入临期

前置：

```text
阈值7天
某 Batch 从8天进入7天
```

预期：

- 创建 `EXPIRING / ACTIVE` Reminder；
- 不重复创建多条同轮提醒。

## TC-P4-002 查看提醒

步骤：

1. 打开提醒详情。

预期：

```text
ACTIVE → READ
```

条件仍存在时提醒仍可在提醒中心看到。

## TC-P4-003 忽略临期提醒

步骤：

1. 对临期提醒点击忽略；
2. 日期继续从 7 天变为 6 天、5 天。

预期：

```text
status = DISMISSED
```

本轮不重复创建提醒。

## TC-P4-004 临期条件解除

步骤：

1. 修改到期日，使物品重新进入安全区。

预期：`Reminder → RESOLVED`

## TC-P4-005 临期再次进入新周期

步骤：

1. 上一轮 Reminder 已 RESOLVED；
2. 后续再次进入临期区间。

预期：

- 创建新的 Reminder；
- 不复用已经结束的旧周期。

## TC-P4-006 临期转已过期

步骤：

1. 物品原为临期；
2. 时间推进至已过期。

预期：

```text
EXPIRING → RESOLVED
EXPIRED → ACTIVE
```

## TC-P4-007 已过期库存仍保留

步骤：

1. 查看过期物品；
2. 不执行任何消耗或丢弃。

预期：

- 物品仍保留；
- quantity 不自动清零；
- 系统只提示。

## TC-P4-008 低库存提醒

前置：

```text
阈值2
库存从3降为2
```

预期：`LOW_STOCK ACTIVE`

## TC-P4-009 忽略低库存

步骤：

1. 忽略低库存提醒；
2. 库存继续从 2 降为 1。

预期：同一低库存周期不重复产生新提醒。

## TC-P4-010 低库存条件解除

步骤：

1. 库存补充到 5。

预期：`LOW_STOCK → RESOLVED`

## TC-P4-011 再次跌破低库存阈值

步骤：

1. 库存恢复正常后；
2. 再次降至 2。

预期：新建新一轮 LOW_STOCK 提醒。

## TC-P4-012 零库存提醒

步骤：

1. 将某 Item 消耗至 0。

预期：

- `ZERO_STOCK ACTIVE`；
- 提供是否加入待补货。

## TC-P4-013 加入待补货

步骤：

1. 零库存时选择加入待补货。

预期：

```text
RestockItem.status = NEEDED
```

Reminder 与 RestockItem 均存在，但职责不同。

## TC-P4-014 拒绝加入待补货

步骤：

1. 某 Item 归零；
2. 选择“不加入”或叉掉。

预期：

- 本轮不重复询问；
- 不创建 NEEDED。

## TC-P4-015 补货后自动完成待补货

前置：`RestockItem = NEEDED`

步骤：

1. 为该 Item 增加库存。

预期：

```text
ZERO_STOCK → RESOLVED
RestockItem → PURCHASED
```

---

# 8. Phase 5：分析页

## 8.1 目标

验证统计逻辑正确，不对异构单位做错误聚合。

## TC-P5-001 分类 SKU 占比

准备：

```text
食品 Item：4
日化 Item：2
护肤 Item：2
```

预期：

```text
食品 50%
日化 25%
护肤 25%
```

按 Item / SKU 数统计，不按“盒 + 瓶 + 包”的总件数混加。

## TC-P5-002 临期分布

准备不同状态数据：

```text
已过期
0-7天
8-30天
30天以上
```

预期：

- 各区间数量正确；
- 与详情页派生状态一致。

## TC-P5-003 库存趋势

步骤：

1. 连续执行 ADD / CONSUME；
2. 查看近 30 天趋势。

预期：

- 趋势能够反映库存变化；
- 时间排序正确；
- 无未来时间或重复异常点。

## TC-P5-004 库存价值

前置：有填写购买价格的 Batch。

预期：

- 有价格时可统计；
- 无价格记录不被错误当成 0 元参与平均值误导；
- UI 对缺失价格有明确说明。

## TC-P5-005 空数据分析页

前置：数据库无库存。

预期：

- 图表不崩溃；
- 显示空状态；
- 不出现 NaN、Infinity、异常百分比。

---

# 9. Phase 6：Excel / JSON 数据管理

## 9.1 目标

验证 Excel 导出、标准 Excel 导入、JSON 完整备份、JSON 恢复、数据校验和 schemaVersion。

## TC-P6-001 Excel 导出

步骤：

1. 准备多个分类、多批次数据；
2. 导出 Excel；
3. 打开文件。

预期：

- 字段完整；
- 中文正常；
- 日期格式正确；
- 多批次不丢失；
- 数量正确。

## TC-P6-002 标准 Excel 导入

准备标准模板。

步骤：

1. 填写 3 条合法库存记录；
2. 导入；
3. 预览；
4. 确认。

预期：

- Item / Batch 正确生成；
- 不重复创建已有 Item（依据既定匹配规则）；
- 导入结果可追溯；
- 错误行不影响合法行或按既定事务策略整体回滚。

## TC-P6-003 Excel 缺失必填字段

步骤：

1. 删除物品名称；
2. 导入。

预期：

- 阻止错误记录进入正式数据库；
- 明确指出错误位置。

## TC-P6-004 Excel 非法数量

步骤：

1. 数量填入文本或负数；
2. 导入。

预期：

- 校验失败；
- 不写入错误 Batch。

## TC-P6-005 JSON 完整导出

步骤：

1. 导出完整备份。

预期文件包含：

```text
schemaVersion
exportedAt
categories
items
batches
transactions
locations
reminders
restockItems
settings
```

## TC-P6-006 JSON 恢复

步骤：

1. 导出备份；
2. 清空测试用户数据；
3. 恢复备份。

预期：

- 所有主要数据恢复；
- Item / Batch 引用关系正常；
- Transaction 历史存在；
- Reminder / Restock 状态恢复；
- Settings 恢复。

## TC-P6-007 不兼容 schemaVersion

步骤：

1. 修改备份版本为未知高版本；
2. 尝试恢复。

预期：

- 不直接导入；
- 明确提示版本不兼容；
- 原数据不受影响。

## TC-P6-008 损坏 JSON

步骤：

1. 删除必要字段或破坏 JSON；
2. 尝试恢复。

预期：

- 校验失败；
- 不发生半恢复状态。

---

# 10. Phase 7：测试、错误处理与发布准备

## 10.1 目标

完成系统级回归、边界条件、性能、真机体验与发布前检查。

## TC-P7-001 完整核心闭环

执行：

```text
创建 Item
→ 增加 Batch A
→ 增加 Batch B
→ 消耗
→ FEFO
→ 编辑属性
→ 修正库存
→ 进入低库存
→ 归零
→ 加入待补货
→ 再次购买
```

预期：整个链路无错误，所有数据状态一致。

## TC-P7-002 换设备恢复

步骤：

1. 设备 A 创建库存；
2. 关闭；
3. 同一微信用户在设备 B 打开；
4. 刷新数据。

预期：

- 云端数据全部可见；
- 不依赖设备 A 本地 Storage。

## TC-P7-003 网络失败：读取

步骤：

1. 模拟断网；
2. 打开库存页。

预期：

- 不崩溃；
- 显示明确网络异常；
- 若有缓存，可展示并标记为缓存数据；
- 不伪装为最新数据。

## TC-P7-004 网络失败：写入

步骤：

1. 填写增加库存表单；
2. 提交时断网。

预期：

- 用户知道保存失败；
- 不出现“UI 显示成功但云端没写入”的假成功；
- 不重复产生双写。

## TC-P7-005 重复提交

步骤：

1. 快速连续点击“保存”两次。

预期：

- 只执行一次有效业务写入；
- 不重复生成 Batch / Transaction。

## TC-P7-006 云函数部分失败

模拟：

```text
Batch 更新成功
Transaction 写入失败
```

预期：

- 使用事务时整体回滚；
- 若不支持事务，则补偿机制恢复一致性；
- 最终不出现无流水库存变化。

## TC-P7-007 删除空物品

前置：所有 Batch.quantity = 0。

步骤：

1. 删除 Item；
2. 二次确认。

预期：

- 删除成功；
- 不影响其他 Item；
- 历史数据处理符合既定规则。

## TC-P7-008 删除仍有库存物品

前置：quantity > 0。

步骤：

1. 尝试删除。

预期：

- 禁止直接删除；
- 引导先修正 / 丢弃库存。

## TC-P7-009 过期物品不可自动删除

步骤：

1. 创建已过期库存；
2. 刷新、重启、重新登录。

预期：

- 物品仍存在；
- 仅状态和提醒变化。

## TC-P7-010 大数据量列表

准备：

```text
Item >= 500
Batch >= 2000
Transaction >= 5000
```

步骤：

1. 打开库存；
2. 搜索；
3. 筛选；
4. 排序；
5. 打开详情。

预期：

- 无明显卡死；
- 查询可接受；
- 必要时分页 / 分批加载；
- 不一次加载全部历史流水。

## TC-P7-011 背景流水性能

步骤：

1. 首页持续停留；
2. 观察背景流水动画；
3. 同时点击操作按钮。

预期：

- 动画不阻塞交互；
- 无明显掉帧；
- 不持续触发高频云查询。

## TC-P7-012 日期边界

覆盖：

```text
今天到期
昨天到期
明天到期
月底
跨月
跨年
闰年日期
```

预期：

- remainingDays 计算正确；
- 临期 / 过期状态无 off-by-one 错误。

## TC-P7-013 月保质期计算

例如：

```text
生产日期：2026-01-31
保质期：1 MONTH
```

预期：

- 使用自然月规则；
- 不简单按固定 30 天换算；
- 结果符合项目统一日期规则。

## TC-P7-014 用户 A / B 全量隔离回归

分别验证：

- Item
- Batch
- Transaction
- Reminder
- RestockItem
- Settings
- 导出文件

预期：用户之间互不可见、不可修改。

---

# 11. 跨 Phase 核心回归测试集

## 11.1 修改库存 Service

必须回归：

```text
P1-002
P1-003
P1-004
P1-007
P1-008
P1-009
P2-004
P4-008
P4-012
P7-001
```

## 11.2 修改提醒系统

必须回归：

```text
P1-011 ~ P1-016
P4-001 ~ P4-015
P7-001
P7-012
```

## 11.3 修改数据 Schema

必须回归：

```text
Phase 1 全部
P6-005
P6-006
P6-007
P7-002
```

## 11.4 修改首页

必须回归：

```text
P2-001
P2-004
P3-001
P3-002
P3-003
P7-011
```

## 11.5 修改导入导出

必须回归：

```text
Phase 6 全部
P7-014
```

---

# 12. 发布前 Smoke Test

每次准备提交体验版或正式版前，至少执行以下最小集：

```text
[ ] 小程序正常启动
[ ] 当前用户身份正确
[ ] 新增一个新 Item
[ ] 为已有 Item 增加库存
[ ] 创建两个不同到期批次
[ ] 消耗并验证 FEFO
[ ] 修改 Item 属性
[ ] 修正库存并验证 ADJUST
[ ] 搜索库存
[ ] 分类筛选
[ ] 临期提醒
[ ] 低库存提醒
[ ] 零库存提醒
[ ] 加入待补货
[ ] 再次补货并自动完成待补货
[ ] 分析页正常
[ ] Excel 导出
[ ] JSON 备份
[ ] 页面重启后数据仍存在
[ ] 同一用户换设备仍可读取云数据
[ ] 不同测试用户无法读取彼此数据
```

---

# 13. Codex 每个 Phase 完成后的固定验收模板

每次 Codex 宣布某个 Phase 完成时，必须输出：

```text
Phase：
实现范围：

新增文件：
修改文件：

自动化测试：
- 总数：
- 通过：
- 失败：

手工测试：
- 已执行：
- 未执行：

本 Phase 已通过的 TC：
- TC-Px-xxx

未通过的 TC：
- TC-Px-xxx
- 原因：

Known Bugs：

Open Questions：

是否影响历史功能：
是 / 否

已执行的回归测试：

下一阶段是否可以开始：
是 / 否
```

如果存在失败的核心库存测试：

```text
addStock
consumeStock
FEFO
adjustStock
Reminder
```

则不得开始下一 Phase。

---

# 14. 测试失败的处理规则

## A. Bug

设计明确，但代码行为错误。

处理：

```text
修代码
→ 重跑失败测试
→ 重跑相关回归测试
```

不修改 Design Freeze。

## B. 产品规则缺失

例如：

```text
删除 Item 后历史流水是否保留？
价格字段表示单价还是批次总价？
```

处理：

```text
写入 OPEN_QUESTIONS.md
→ 产品讨论
→ 更新 Design Freeze
→ 再修改实现
```

不得由 Codex 自行决定。

## C. UI / 体验问题

业务正确，但按钮难找、信息过密、背景流水干扰或表格难滑动。

处理：

```text
记录 UI issue
→ 修改页面
→ 不改变 Domain 规则
```

## D. 测试本身错误

实现符合 Design Freeze，但测试预期错误。

处理：

```text
回查 Design Freeze
→ 修正测试文档
```

不得为了“让测试通过”修改正确业务代码。

---

# 15. V0.1 最终完成判定

以下条件全部满足，才认为 V0.1 完成：

1. Phase 0–7 的核心验收测试通过；
2. 增加 / 消耗 / 编辑闭环稳定；
3. 多批次 FEFO 稳定；
4. ADJUST 规则稳定；
5. Reminder 状态机稳定；
6. RestockItem 与 Reminder 分离；
7. 云端数据可跨设备恢复；
8. 用户之间数据隔离；
9. 导出与备份可用；
10. 所有 P0/P1 级严重 Bug 清零；
11. Design Freeze、Implementation Plan、Dev Status 与实际代码保持一致；
12. 发布前 Smoke Test 全部通过。

---

# 16. 建议的测试文档维护方式

仓库建议：

```text
docs/
├─ INVENTORY_APP_V0.1_DESIGN_FREEZE.md
├─ IMPLEMENTATION_PLAN.md
├─ MANUAL_TEST_CASES.md
├─ DEV_STATUS.md
├─ OPEN_QUESTIONS.md
└─ TEST_REPORTS/
   ├─ phase_0.md
   ├─ phase_1.md
   ├─ phase_2.md
   ├─ phase_3.md
   ├─ phase_4.md
   ├─ phase_5.md
   ├─ phase_6.md
   └─ phase_7.md
```

每个 Phase 结束后，在 `TEST_REPORTS/` 中保存一次测试结果，而不要覆盖历史测试记录。

这样可以追踪：

```text
什么版本通过了什么测试
哪个 Bug 从什么时候出现
某次 Schema 修改影响了哪些历史能力
```

---

# 17. 一句话测试原则

> 每个 Phase 都必须能独立证明“新增能力正确”，而整个项目必须持续证明“旧能力没有被新改动破坏”。

---

# Phase 0 / Phase 1 CloudBase Integration Addendum

## DEV-CLOUD-001 Developer Diagnostic Page

Purpose: verify the real chain:

```text
Mini Program -> Service -> wx.cloud.callFunction -> inventoryWrite -> server-side transaction -> Cloud Database
```

Path in WeChat DevTools:

```text
pages/dev-cloud-check/index
```

Steps:

1. Configure CloudBase environment in `miniprogram/config/env.ts` or keep it empty to use the currently selected DevTools environment.
2. Deploy `cloudfunctions/getOpenId`.
3. Deploy `cloudfunctions/inventoryWrite`.
4. Create required collections listed in `docs/CLOUDBASE_SETUP.md`.
5. Open the page `pages/dev-cloud-check/index` in WeChat DevTools.
6. Click `Run Cloud Check`.

Expected:

- Cloud initializes.
- `getOpenId` returns the current user's openid.
- The page creates a dev Item through `InventoryService.addStock`, routed to `inventoryWrite`.
- Output displays the add `operationId`, Item ID, Batch ID, and ADD Transaction ID.
- The page calls `InventoryService.consumeStock`, routed to `inventoryWrite`.
- Output displays the consume `operationId`, changed Batch rows, and CONSUME Transaction IDs.
- The page calls `InventoryService.adjustStock`, routed to `inventoryWrite`.
- Output displays the adjust `operationId`, target Batch ID, final quantity, and ADJUST Transaction ID.
- The page queries Batch and Transaction data through the Service / Cloud Repository read path.
- Batch quantity and Transaction records remain consistent.
- The cleanup step removes only this run's `dev-cloud-item-*` test data and reports success or a clear failure.

## DEV-CLOUD-002 User Isolation Manual Test

This must be verified with two real WeChat identities because local automation cannot simulate two platform-authenticated `_openid` values.

Steps:

1. User A runs `DEV-CLOUD-001` and notes the created Item `_id`.
2. User B opens the same environment.
3. User B queries inventory through the dev diagnostic path or a temporary console call using the same Service + Cloud Repository.
4. User B attempts to query User A's known `_id` via Repository `getById`.
5. User B attempts to update User A's known `_id` via Repository `update`.

Expected:

- User B list queries do not show User A records.
- Known `_id` read returns empty / not found.
- Known `_id` update returns not found or permission failure.
- No User A data is modified.

## DEV-CLOUD-003 Transaction Runtime Capability

Steps:

1. In WeChat DevTools, run `DEV-CLOUD-001`.
2. Observe whether `addStock`, `consumeStock`, and `adjustStock` complete through `inventoryWrite`.
3. Inspect Cloud Database for matching Batch and Transaction records.
4. Retry the same operation with the same `operationId` from a temporary console call or a controlled diagnostic edit.

Expected:

- The mini program client does not call `wx.cloud.database().runTransaction`.
- `inventoryWrite` uses CloudBase Node SDK server-side transaction support.
- Batch changes and Transaction creation commit together.
- If Transaction creation fails, Batch changes roll back.
- Retrying the same `operationId` returns the existing Transaction result and does not change stock twice.
