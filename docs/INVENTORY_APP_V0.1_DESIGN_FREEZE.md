# 微信小程序个人库存管理系统 V0.1
## 产品原型与系统设计定稿

> 版本：V0.1 Design Freeze  
> 定位：个人 / 家庭库存管理（Personal Inventory Management）  
> 数据策略：云数据库为主，支持导入、导出与完整备份；本地仅作可选缓存  
> 核心目标：知道“有什么、在哪里、有多少、什么时候需要处理”
> 默认后端：微信小程序云开发 / CloudBase

---

## 1. 产品设计原则

V0.1 冻结以下基础规则，后续开发默认遵循，不在实现阶段自行修改：

1. 数据默认保存在云数据库中，以用户身份隔离数据；本地 Storage 仅用于缓存、临时草稿和性能优化，不作为最终真实数据源。
2. 分类仅作为逻辑分类和前端视图，不按“食品表、护肤品表”等方式建立独立数据库表。
3. 数据采用统一结构，一个物品可以拥有多个库存批次。
4. 库存模型分为三层：
   - `Item`：物品主档，描述“这是什么”
   - `Batch`：库存批次，描述“这一批是什么情况”
   - `Transaction`：库存流水，描述“库存为什么发生变化”
5. 首页高频操作固定为：
   - 增加
   - 消耗
   - 编辑
6. “增加”表示库存实际入库，并生成库存流水。
7. “消耗”表示库存实际减少，并生成库存流水。
8. “编辑属性”可以直接修改 Item / Batch 的描述性字段。
9. “编辑数量”不得直接覆盖当前数量，必须转化为 `ADJUST` 库存修正流水。
10. 默认采用 FEFO（First Expired, First Out，先到期先消耗）扣减库存。
11. 保质期状态与库存状态为两个独立维度：
    - 保质期状态：正常 / 临期 / 已过期
    - 库存状态：正常 / 低库存 / 零库存
12. “剩余天数”“临期状态”等可推导字段不作为永久主数据保存，而是在读取时动态计算。
13. AI 功能不进入 V0.1 核心库存链路。2026-10-10 用户授权 Phase 6B：AI 可选参与导入语义识别；标准导入不依赖 AI，所有候选必须经确定性校验、用户确认和既有入库链路执行。
14. 所有重要库存变化原则上应可追溯。
15. 云端数据必须支持完整导出和恢复；即使云数据库是主存储，也应避免形成数据锁定。

---

# 2. 信息架构

底部导航固定为五个一级页面：

```text
首页 ｜ 库存 ｜ 分析 ｜ 提醒 ｜ 设置
```

另外存在若干二级页面：

```text
首页
├─ 增加库存
├─ 消耗库存
└─ 编辑库存

库存
├─ 库存列表
├─ 表格模式
└─ 物品详情
   ├─ 批次详情
   ├─ 增加
   ├─ 消耗
   └─ 编辑

分析
├─ 分类结构
├─ 临期分布
└─ 库存变化趋势

提醒
├─ 临期提醒
├─ 已过期提醒
├─ 低库存提醒
├─ 零库存提醒
└─ 待补货

设置
├─ 分类管理
├─ 存放位置管理
├─ 单位管理
├─ 提醒规则
├─ 数据管理
└─ 高级设置
```

---

# 3. 页面低保真原型

## 3.1 首页

首页承担三个职责：

1. 展示当前最重要的库存状态；
2. 提供“增加 / 消耗 / 编辑”三个最高频入口；
3. 以背景流水形式弱化展示部分库存信息。

首页不承担完整库存浏览功能。

```text
┌──────────────────────────────┐
│          我的库存             │
│                              │
│ ┌──────────────────────────┐ │
│ │ ⚠ 重要提醒                │ │
│ │ 3 件物品将在 7 天内到期   │ │
│ │ 牛奶库存不足              │ │
│ └──────────────────────────┘ │
│                              │
│                              │
│   冷冻鸡腿 · 10包 · 冷冻室   │
│        酸奶 · 3盒 · 剩5天    │
│   洗面奶 · 2支 · 浴室柜      │
│        可乐 · 8罐 · 冰箱     │
│                              │
│        ↑ 背景流水区域 ↑       │
│                              │
│ ┌───────┐ ┌───────┐ ┌──────┐│
│ │ + 增加 │ │ - 消耗 │ │ 编辑 ││
│ └───────┘ └───────┘ └──────┘│
│                              │
│ 45种物品   4临期   2待补货    │
├──────────────────────────────┤
│ 首页   库存   分析   提醒 设置 │
└──────────────────────────────┘
```

### 背景流水规则

“背景流水”不是独立卡片，不设置标题，不要求用户主动操作，应作为首页中后景的信息层存在。

建议特征：

- 透明度低于主要内容；
- 缓慢纵向或横向移动；
- 不遮挡重要提醒与三个操作按钮；
- 点击可以进入对应物品详情，但点击不是必需行为；
- 信息内容简短，一条只包含一个库存事实。

示例：

```text
冷冻鸡腿 · 10包 · 冷冻室
酸奶 · 3盒 · 5天后临期
洗面奶 · 2支 · 浴室柜
可乐 · 8罐 · 冰箱
纸巾 · 4卷 · 储物柜
```

背景流水的目标不是承担功能，而是：

> 让用户打开小程序时，持续感知“自己拥有什么”。

背景流水的数据可以优先抽取：

1. 临期但未进入最高优先级提醒的物品；
2. 最近增加或消耗的物品；
3. 长时间未查看的库存；
4. 随机普通库存。

V0.1 可以先采用简单随机轮播，不需要个性化排序。

---

## 3.2 库存页

库存页负责完整查询与浏览。

```text
┌──────────────────────────────┐
│          库存一览             │
│                              │
│ [搜索物品................]    │
│                              │
│ [分类▼] [位置▼] [状态▼]      │
│ [排序：最近到期▼]            │
│                              │
│ 食品                         │
│ ┌──────────────────────────┐ │
│ │ 蒙牛牛奶 250ml            │ │
│ │ 8盒 · 冰箱                │ │
│ │ 最近到期：10月8日 · 临期   │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 鸡腿 500g                 │ │
│ │ 10包 · 冷冻室             │ │
│ │ 最近到期：11月20日 · 正常  │ │
│ └──────────────────────────┘ │
│                              │
│ [列表模式] [表格模式]         │
├──────────────────────────────┤
│ 首页   库存   分析   提醒 设置 │
└──────────────────────────────┘
```

### 筛选条件

至少支持：

- 分类
- 存放位置
- 保质期状态
- 库存状态

### 排序方式

至少支持：

- 最近到期
- 剩余天数
- 当前数量
- 最近增加
- 最近消耗
- 名称

### 表格模式

移动端默认使用列表模式。

表格模式支持横向滚动，可显示：

| 物品名称 | 规格 | 数量 | 单位 | 存放位置 | 最近到期 | 剩余天数 | 保质期状态 | 库存状态 |
|---|---|---:|---|---|---|---:|---|---|

---

## 3.3 物品详情页

```text
┌──────────────────────────────┐
│      蒙牛牛奶 250ml           │
│                              │
│ 当前库存：8盒                 │
│ 默认位置：冰箱                │
│ 低库存阈值：2盒               │
│                              │
│ 批次                         │
│ ┌──────────────────────────┐ │
│ │ 10/01购买                 │ │
│ │ 5盒 · 冰箱                │ │
│ │ 10/08到期 · 临期           │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 10/03购买                 │ │
│ │ 3盒 · 冰箱                │ │
│ │ 10/20到期 · 正常           │ │
│ └──────────────────────────┘ │
│                              │
│ [增加]   [消耗]   [编辑]      │
│                              │
│ 最近流水                     │
│ 10/03  +3                    │
│ 10/03  -1                    │
│ 10/02  -1                    │
└──────────────────────────────┘
```

---

## 3.4 分析页

V0.1 不追求复杂 BI，只保留真正有意义的统计。

```text
┌──────────────────────────────┐
│          库存分析             │
│                              │
│ 当前                         │
│ 45 种物品                    │
│ 72 个批次                    │
│ ¥1358 库存价值               │
│                              │
│ [分类 SKU 占比环形图]         │
│                              │
│ 食品 42%                     │
│ 日化 30%                     │
│ 护肤 18%                     │
│ 其他 10%                     │
│                              │
│ [近30日库存变化趋势]          │
│                              │
│ [临期分布]                   │
│ 已过期 | 7天 | 30天 | 其他   │
├──────────────────────────────┤
│ 首页   库存   分析   提醒 设置 │
└──────────────────────────────┘
```

### V0.1 固定统计

- 分类 SKU 占比
- 临期分布
- 库存变化趋势

如果购买价格存在，则额外展示：

- 当前库存总价值

注意：

不同单位的库存数量不能直接相加后作为“数量占比”。

`Batch.purchasePrice` 在 V0.1 中固定表示单位购买价格。库存价值按有价格记录的正库存 Batch 计算：

```text
库存价值 = Σ(Batch.quantity × Batch.purchasePrice)
```

没有价格记录的 Batch 不按 0 元计算，界面必须同时展示价格覆盖情况。

---

## 3.5 提醒页

```text
┌──────────────────────────────┐
│            提醒               │
│                              │
│ 需要处理                     │
│ ┌──────────────────────────┐ │
│ │ 🔴 酸奶已经过期 2 天      │ │
│ │ [查看] [忽略]             │ │
│ └──────────────────────────┘ │
│                              │
│ ┌──────────────────────────┐ │
│ │ 🟠 牛奶 3 天后到期        │ │
│ │ [查看] [忽略]             │ │
│ └──────────────────────────┘ │
│                              │
│ 低库存                       │
│ 洗发水 · 剩1瓶               │
│                              │
│ 待补货                       │
│ □ 牛奶                       │
│ □ 纸巾                       │
│                              │
├──────────────────────────────┤
│ 首页   库存   分析   提醒 设置 │
└──────────────────────────────┘
```

提醒与待补货为两个不同概念：

```text
提醒：
“牛奶库存已经归零。”

待补货：
“牛奶当前处于需要重新购买的状态。”
```

---

## 3.6 设置页

```text
┌──────────────────────────────┐
│            设置               │
│                              │
│ 基础数据                     │
│ 分类管理 >                   │
│ 存放位置管理 >               │
│ 单位管理 >                   │
│                              │
│ 提醒设置                     │
│ 默认临期阈值      30天 >      │
│ 食品临期阈值       7天 >      │
│ 低库存提醒         开 >       │
│                              │
│ 数据管理                     │
│ 导入 Excel >                 │
│ 导出 Excel >                 │
│ 导出完整备份 >               │
│ 恢复备份 >                   │
│                              │
│ 高级                         │
│ 默认扣减策略      FEFO >      │
│ AI智能导入        关闭        │
│                              │
├──────────────────────────────┤
│ 首页   库存   分析   提醒 设置 │
└──────────────────────────────┘
```

---

# 4. 本地数据 Schema

逻辑上划分为以下 Collection：

```text
categories
items
batches
transactions
locations
reminders
restock_items
settings
```

V0.1 使用云数据库作为主存储，并按照 Collection / Repository 思路组织，避免页面直接操作底层数据库接口。

推荐调用形式：

```text
categoryRepo
itemRepo
batchRepo
transactionRepo
locationRepo
reminderRepo
restockRepo
settingsRepo
```

---

## 4.1 Category

```json
{
  "id": "cat_food",
  "name": "食品",
  "icon": "food",
  "expiryWarningDays": 7,
  "defaultLowStock": null,
  "createdAt": 1791000000000,
  "updatedAt": 1791000000000
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | 是 | 唯一 ID |
| name | string | 是 | 分类名称 |
| icon | string | 否 | 图标 |
| expiryWarningDays | number | 否 | 分类默认临期阈值 |
| defaultLowStock | number | 否 | 分类默认低库存阈值 |
| createdAt | number | 是 | 创建时间 |
| updatedAt | number | 是 | 修改时间 |

临期阈值继承关系：

```text
物品单独配置
    ↓
分类配置
    ↓
系统默认配置
```

---

## 4.2 Item

```json
{
  "id": "item_001",
  "name": "蒙牛牛奶",
  "categoryId": "cat_food",
  "brand": "蒙牛",
  "specification": "250ml",
  "unit": "盒",
  "defaultLocationId": "loc_fridge",
  "lowStockThreshold": 2,
  "expiryWarningDays": null,
  "barcode": null,
  "note": "",
  "createdAt": 1791000000000,
  "updatedAt": 1791000000000
}
```

Item 只描述稳定属性，不保存某次购买特有的信息。

---

## 4.3 Batch

```json
{
  "id": "batch_001",
  "itemId": "item_001",
  "quantity": 5,
  "locationId": "loc_fridge",
  "purchaseDate": "2026-10-01",
  "productionDate": "2026-09-20",
  "shelfLifeValue": 30,
  "shelfLifeUnit": "DAY",
  "expiryDate": "2026-10-20",
  "purchasePrice": 15.9,
  "purchaseChannel": null,
  "openedDate": null,
  "openedExpiryDate": null,
  "note": "",
  "createdAt": 1791000000000,
  "updatedAt": 1791000000000
}
```

`shelfLifeUnit` 枚举：

```text
DAY
MONTH
YEAR
```

`purchasePrice` 表示单位购买价格，不是整批总价。若 Batch 已部分消耗，剩余库存价值按当前 `quantity × purchasePrice` 估算。

不永久保存：

```text
remainingDays
expiryStatus
```

动态计算：

```text
remainingDays = effectiveExpiryDate - currentDate
```

其中：

```text
effectiveExpiryDate =
min(expiryDate, openedExpiryDate)
```

如果没有开封信息，则直接使用 `expiryDate`。

---

## 4.4 Transaction

```json
{
  "id": "tx_001",
  "itemId": "item_001",
  "batchId": "batch_001",
  "type": "CONSUME",
  "quantity": -1,
  "reason": "USED",
  "createdAt": 1791000000000,
  "note": ""
}
```

`type` 枚举：

```text
ADD
CONSUME
ADJUST
DISCARD
DELETE
```

`reason` 可以进一步描述：

```text
PURCHASE
USED
EXPIRED
DAMAGED
GIFT
MANUAL_CORRECTION
OTHER
```

规则：

> Transaction 是账，Batch.quantity 是当前快照。

---

## 4.5 Location

```json
{
  "id": "loc_freezer",
  "name": "冷冻室",
  "parentId": "loc_fridge",
  "createdAt": 1791000000000,
  "updatedAt": 1791000000000
}
```

支持层级位置：

```text
家
└─ 厨房
   └─ 冰箱
      ├─ 冷藏室
      └─ 冷冻室
```

用户不必填写到最细层级。

---

## 4.6 Reminder

```json
{
  "id": "rem_001",
  "type": "EXPIRING",
  "itemId": "item_001",
  "batchId": "batch_001",
  "status": "ACTIVE",
  "cycleKey": "batch_001_expiring_2026-10",
  "createdAt": 1791000000000,
  "readAt": null,
  "dismissedAt": null,
  "resolvedAt": null
}
```

`type` 枚举：

```text
EXPIRING
EXPIRED
LOW_STOCK
ZERO_STOCK
```

`status` 枚举：

```text
ACTIVE
READ
DISMISSED
RESOLVED
```

---

## 4.7 RestockItem

待补货单独作为持续状态维护。

```json
{
  "id": "restock_001",
  "itemId": "item_001",
  "status": "NEEDED",
  "createdAt": 1791000000000,
  "resolvedAt": null,
  "note": ""
}
```

状态：

```text
NEEDED
PURCHASED
DISMISSED
```

---

## 4.8 Settings

```json
{
  "defaultExpiryWarningDays": 30,
  "defaultConsumeStrategy": "FEFO",
  "lowStockReminder": true,
  "expiryReminder": true,
  "zeroStockReminder": true,
  "autoAddRestock": false,
  "theme": "system",
  "schemaVersion": 1
}
```

---

# 5. 派生状态

## 5.1 保质期状态

```text
remainingDays < 0
→ EXPIRED

0 <= remainingDays <= warningDays
→ EXPIRING

remainingDays > warningDays
→ NORMAL
```

---

## 5.2 库存状态

```text
totalQuantity == 0
→ ZERO

0 < totalQuantity <= lowStockThreshold
→ LOW

totalQuantity > lowStockThreshold
→ NORMAL
```

如果物品没有设置低库存阈值，则不触发低库存状态。

---

# 6. 增加库存状态流

```text
点击“增加”
      ↓
选择物品
 ┌───────────────┐
 │               │
已有物品          新物品
 ↓               ↓
搜索/最近使用     创建 Item
 │               │
 └───────┬───────┘
         ↓
填写本次库存
         ↓
数量
位置
购买日期
生产日期
保质期 / 到期日
价格（可选）
备注（可选）
         ↓
判断是否可以与现有批次合并
      ↓       ↓
     是       否
      ↓       ↓
合并 Batch   新建 Batch
      \       /
        ↓
生成 ADD Transaction
        ↓
重新计算库存状态
        ↓
重新计算提醒状态
        ↓
如存在待补货记录
→ 自动处理为 PURCHASED
        ↓
完成
```

---

## 6.1 批次合并规则

V0.1 采用保守合并策略。

只有以下关键条件全部一致时，允许自动合并：

```text
itemId 相同
+
locationId 相同
+
purchaseDate 相同
+
expiryDate 相同
```

如果不能确定，则新建批次。

原则：

> 宁可多一个批次，也不要错误合并两个实际不同的批次。

---

# 7. 消耗库存状态流

```text
点击“消耗”
       ↓
选择物品
       ↓
输入消耗数量
       ↓
读取该 Item 所有 quantity > 0 的批次
       ↓
按 effectiveExpiryDate 从近到远排序
       ↓
FEFO 自动扣减
       ↓
库存是否足够？
   ┌────────────┐
   │            │
   否           是
   ↓            ↓
提示库存不足     更新 Batch
                ↓
      为实际扣减的每个 Batch
      生成 CONSUME Transaction
                ↓
        重新计算总库存
                ↓
          是否进入低库存？
                ↓
          产生 LOW_STOCK
                ↓
          是否变成库存 0？
                ↓
          产生 ZERO_STOCK
                ↓
       是否加入“待补货”？
                ↓
               完成
```

示例：

```text
A 批次：2盒，10/05 到期
B 批次：5盒，10/20 到期

用户消耗：3盒
```

FEFO 结果：

```text
A -2
B -1
```

分别留下对应批次流水。

---

# 8. 编辑状态流

```text
点击“编辑”
      ↓
选择物品
      ↓
选择编辑对象
  ┌───────────────┐
  │               │
物品属性          批次属性
  │               │
名称              位置
分类              日期
品牌              到期日
规格              价格
单位              备注
备注
  └───────┬───────┘
          ↓
       保存修改
```

如果修改的是数量：

```text
当前系统数量
      ↓
用户输入实际数量
      ↓
计算 diff
      ↓
diff == 0 ?
   ↓       ↓
  是       否
  ↓        ↓
结束     生成 ADJUST
           ↓
       修正 Batch
           ↓
     重新计算提醒
```

例如：

```text
系统记录：8盒
实际盘点：6盒

diff = -2
```

生成：

```text
ADJUST -2
reason = MANUAL_CORRECTION
```

而不是直接覆盖数量。

---

# 9. 删除规则

删除属于高风险操作。

V0.1 规则：

### 删除空物品

如果：

```text
所有 Batch.quantity == 0
```

允许删除 Item，但必须二次确认。

### 删除仍有库存的物品

默认禁止直接删除。

用户需要先：

```text
库存修正为 0
```

或执行：

```text
DISCARD
```

之后才能删除。

### 删除流水

V0.1 不提供普通用户直接删除历史流水的功能。

错误操作优先通过：

```text
撤销 / 反向流水
```

修正。

---

# 10. 提醒状态机

统一提醒生命周期：

```text
                条件首次满足
                    ↓
                 ACTIVE
                /      \
               /        \
           用户查看      用户忽略
              ↓            ↓
             READ       DISMISSED
               \          /
                \        /
                 ↓      ↓
                 条件解除
                    ↓
                 RESOLVED
```

`READ` 只是“看过”，条件仍然存在时可以继续显示。

`DISMISSED` 表示：

> 当前这一轮条件持续期间不再主动提示。

`RESOLVED` 表示：

> 导致提醒的条件已经消失。

---

# 11. 临期提醒状态机

```text
remainingDays > warningDays
→ 无提醒

remainingDays <= warningDays
→ ACTIVE

用户查看
→ READ

用户忽略
→ DISMISSED

库存被消耗完
或批次被修正
→ RESOLVED
```

如果用户已经 `DISMISSED`：

```text
7天 → 6天 → 5天
```

不重复产生同类型提醒。

如果该批次后来通过编辑使到期时间重新回到安全区：

```text
→ RESOLVED
```

以后再次进入临期区间：

```text
→ 新提醒周期
```

---

# 12. 已过期提醒

当：

```text
remainingDays < 0
```

触发：

```text
EXPIRED
```

如果此前存在临期提醒，则：

```text
EXPIRING → RESOLVED
EXPIRED → ACTIVE
```

已过期物品仍然保留在库存中，不自动删除、不自动归零。

用户可以：

```text
继续保留
消耗
丢弃
库存修正
```

系统只负责提示，不替用户决定实际库存。

---

# 13. 低库存提醒

```text
库存 > threshold
→ 无提醒

库存 <= threshold
→ ACTIVE

用户忽略
→ DISMISSED

库存重新 > threshold
→ RESOLVED
```

以后库存再次跌破阈值：

```text
→ 新建下一轮 ACTIVE
```

因此：

> 忽略本轮 ≠ 永久关闭这种提醒。

---

# 14. 零库存与待补货

库存归零时：

```text
库存 = 0
   ↓
ZERO_STOCK ACTIVE
   ↓
是否加入待补货？
```

如果用户选择“是”：

```text
RestockItem = NEEDED
```

如果用户选择“否”或叉掉：

```text
本轮不再询问
```

当物品重新增加库存：

```text
库存 > 0
↓
ZERO_STOCK → RESOLVED
↓
RestockItem → PURCHASED
```

以后再次归零，可以产生新的提醒周期。

---

# 15. 云数据库架构

V0.1 采用：

```text
微信小程序
    ↓
Service
    ↓
Repository
    ↓
Cloud Database / Cloud Functions
```

推荐使用微信小程序云开发 / CloudBase 作为第一版后端基础设施，云数据库作为库存事实的唯一主数据源。

页面不得直接散落调用数据库接口。统一通过业务 Service 和 Repository 层访问数据。

```text
页面
 ↓
InventoryService
ReminderService
StatisticsService
ImportService
 ↓
Repository
 ↓
Cloud Database
```

例如：

```text
inventoryService.addItem()
inventoryService.consumeItem()
inventoryService.adjustQuantity()

itemRepo.getById()
batchRepo.listByItem()
transactionRepo.add()
```

核心 Collection：

```text
categories
items
batches
transactions
locations
reminders
restock_items
settings
```

每条属于用户私有数据的记录都应包含用户归属信息，例如：

```json
{
  "_id": "xxx",
  "_openid": "user_openid",
  "...": "..."
}
```

实际字段是否由平台自动注入，可根据最终采用的云开发接口实现决定，但产品层必须保证：

> 不同用户的数据默认互相隔离。

涉及多个 Collection 的关键写操作，例如：

```text
消耗库存
= 更新 Batch
+ 新增 Transaction
+ 更新 Reminder
+ 更新 RestockItem
```

必须在 Service 层作为一个完整业务动作处理，避免页面分别修改多处数据后产生不一致。

如果平台和数据库能力允许，关键库存操作优先采用事务；若某些能力受限，则必须设计幂等 ID、失败补偿或操作回滚机制。

---

## 15.1 本地缓存

本地 Storage 可以保留，但职责仅包括：

```text
最近搜索
最近使用物品
页面筛选条件
未提交表单草稿
少量热点库存缓存
UI 设置
```

不得把本地缓存作为库存的最终事实来源。

推荐结构：

```text
云数据库
   ↓
Repository
   ↓
Service
   ↓
页面状态
   ↕
本地缓存
```

当本地缓存与云端不一致时：

> 以云端数据为准。

---

## 15.2 用户身份

第一版不需要额外设计传统“用户名 + 密码”账户系统。

小程序启动后通过微信用户身份获得当前用户上下文，所有 Inventory 数据必须与当前用户绑定。

业务查询必须天然带用户范围：

```text
当前用户
  ↓
items
batches
transactions
reminders
...
```

这样换手机后，只要仍使用同一微信身份进入小程序，就可以重新获取自己的库存数据。

---

## 15.3 云函数 / 后端逻辑

简单只读查询可以由 Repository 直接完成。

以下高风险写操作建议集中到云函数或受控 Service：

```text
增加库存
消耗库存
库存修正
删除物品
批次合并
提醒重算
批量 Excel 导入
完整备份恢复
```

原因是这些操作往往需要同时修改多个 Collection，并执行一致性校验。

AI API 如果以后加入，也必须由云函数 / 后端调用，不能把模型 API Key 放在小程序前端。

---

# 16. 数据备份

虽然主数据存储在云端，仍保留用户可控的数据导出与恢复能力。完整备份格式统一为 JSON。

例如：

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-10-03T13:00:00+08:00",
  "categories": [],
  "items": [],
  "batches": [],
  "transactions": [],
  "locations": [],
  "reminders": [],
  "restockItems": [],
  "settings": {}
}
```

设置页提供：

```text
数据管理
├─ 导入 Excel
├─ 导出 Excel
├─ 导出完整 JSON 备份
└─ 从 JSON 恢复
```

恢复前必须：

1. 检查 `schemaVersion`
2. 校验必要字段
3. 展示数据概况
4. 用户确认
5. 正式覆盖或合并

标准 Excel 导入字段固定为：

```text
物品名称
类别
品牌
规格
数量
单位
存放位置
购买日期
生产日期
保质期数值
保质期单位
到期日期
单位购买价格
购买渠道
低库存阈值
临期阈值
备注
```

其中 `物品名称` 与 `数量` 必填；`单位` 为空时默认为 `个`。Item 匹配规则为 `name + specification + brand + unit`，不得只按名称合并。Batch 合并沿用 `itemId + locationId + purchaseDate + expiryDate`。

Excel 导入必须生成 ADD Transaction，并通过 `importOperationId + rowNumber` 保证重复提交幂等。Excel 导出可以包含剩余天数、保质期状态、库存状态等派生展示列，但这些派生列不得作为主事实导入保存。

JSON 恢复是完整备份恢复：写入前必须完成 schemaVersion 与引用关系校验，恢复时不得信任备份中的 `_openid`，必须重新绑定为当前微信用户身份。

---

# 17. V0.1 开发范围

## 必须实现

- 云数据库初始化与用户数据隔离
- 基础云函数 / Service 层
- 首页
- 背景库存流水
- 增加
- 消耗
- 编辑
- 分类管理
- 存放位置管理
- Item
- Batch
- Transaction
- FEFO 消耗
- 库存列表
- 搜索
- 分类 / 位置 / 状态筛选
- 列表模式
- 表格模式
- 物品详情
- 临期计算
- 已过期状态
- 低库存状态
- 零库存状态
- 提醒中心
- 待补货
- 基础分析图表
- 设置
- JSON 完整备份与恢复
- Excel 导出
- 标准格式 Excel 导入
- 撤销 / 修正基本能力

## 暂不进入 V0.1

- LLM 文本导入
- 无边界的任意 Excel 自动理解（Phase 6B 仅支持可预览、可修改、校验后确认的有限智能导入）
- OCR / 小票识别
- 语音录入
- 个性化提醒学习
- 消耗速度预测
- 空间容量推断
- 多设备同步
- 云备份
- 家庭共享
- 自动购物建议
- 商品条码数据库匹配

---

# 18. V0.1 验收标准

V0.1 完成后，至少应可以完整跑通以下场景：

### 场景 A：新增物品

```text
新增“蒙牛牛奶”
→ 规格 250ml
→ 6盒
→ 冰箱
→ 10月20日到期
→ 保存
```

库存页正确显示：

```text
蒙牛牛奶
6盒
冰箱
最近到期 10月20日
```

### 场景 B：再次购买

```text
已有牛奶
→ 增加 3盒
→ 新到期日期
```

系统正确新增或合并 Batch，并记录 ADD 流水。

### 场景 C：FEFO 消耗

多个批次存在时：

```text
消耗 3盒
```

正确优先扣减最早到期批次。

### 场景 D：库存修正

```text
系统 5盒
实际盘点 4盒
```

生成：

```text
ADJUST -1
```

而不是静默覆盖。

### 场景 E：临期

批次进入阈值范围：

```text
→ 自动出现临期提醒
```

用户忽略后，本轮不重复弹出。

### 场景 F：过期

到期日过去：

```text
→ 状态变为已过期
```

物品仍然保留在库存中。

### 场景 G：低库存与归零

数量跌破阈值：

```text
→ LOW_STOCK
```

数量归零：

```text
→ ZERO_STOCK
→ 可加入待补货
```

重新购买：

```text
→ 旧提醒 RESOLVED
→ 待补货完成
```

### 场景 H：换设备恢复

用户在设备 A 创建库存数据后：

```text
→ 使用同一微信身份在设备 B 打开小程序
```

系统应从云数据库重新加载：

- 分类
- Item
- Batch
- 流水
- 提醒
- 待补货
- 设置

不依赖设备 A 的本地 Storage。

### 场景 I：备份恢复

完整导出 JSON：

```text
→ 清空本地数据
→ 导入备份
```

应能恢复：

- 分类
- Item
- Batch
- 流水
- 位置
- 提醒
- 待补货
- 设置

---

# 19. 开发约束

开发实现必须遵循：

1. 不允许页面自行发明新的产品状态。
2. 不允许为了简化实现取消 Batch 层。
3. 不允许直接覆盖库存数量而不留流水。
4. 不允许把临期状态与库存状态合并成一个字段。
5. 不允许把 Reminder 与 RestockItem 合并。
6. 不允许把背景流水实现成首页主要功能卡片。
7. 不允许把用户忽略提醒解释成永久关闭该类提醒。
8. 不允许自动删除已过期库存。
9. 云数据库结构必须考虑未来 schema migration，并保留 `schemaVersion` 或等价迁移机制。
10. 若实现过程中设计文件之间出现冲突，应记录 TODO，而不是开发者自行改变规则。

---

# 20. 建议项目文档结构

```text
docs/
├─ 01_product_rules.md
├─ 02_wireframes.md
├─ 03_data_schema.md
├─ 04_state_flows.md
└─ INVENTORY_APP_V0.1_DESIGN_FREEZE.md
```

其中本文件：

```text
INVENTORY_APP_V0.1_DESIGN_FREEZE.md
```

作为 V0.1 当前最高层级设计基线。

后续如果修改核心规则，需要显式更新版本，而不是在代码实现过程中隐式改变。

---

# 21. 一句话产品定义

> 一个云端同步、可追溯、以批次和流水为基础的个人库存账本：帮助用户随时知道自己有什么、在哪里、有多少，以及什么东西即将需要处理。
