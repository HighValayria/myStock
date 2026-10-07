"use strict";

const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const COLLECTIONS = {
  items: "items",
  batches: "batches",
  transactions: "transactions",
  reminders: "reminders",
  restockItems: "restock_items",
  categories: "categories",
  locations: "locations",
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const RECENT_TX_LIMIT = 300;
const DETAIL_TX_LIMIT = 10;
const UNKNOWN_EXPIRY_DATE = "9999-12-31";

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  return {
    ok: false,
    error: {
      code: error.code || "INVENTORY_READ_FAILED",
      message: error.message || String(error),
    },
  };
}

function inventoryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function dateMs(value) {
  const [year, month, day] = String(value || UNKNOWN_EXPIRY_DATE).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayText(today = new Date()) {
  return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
}

function effectiveExpiry(batch) {
  if (!batch.openedExpiryDate) return batch.expiryDate;
  return dateMs(batch.openedExpiryDate) < dateMs(batch.expiryDate) ? batch.openedExpiryDate : batch.expiryDate;
}

function remainingDays(expiryDate, today = new Date()) {
  return Math.floor((dateMs(expiryDate) - dateMs(todayText(today))) / MS_PER_DAY);
}

function expiryStatusForDate(expiryDate, warningDays) {
  if (expiryDate === UNKNOWN_EXPIRY_DATE) return "NORMAL";
  const days = remainingDays(expiryDate);
  if (days < 0) return "EXPIRED";
  if (days <= warningDays) return "EXPIRING";
  return "NORMAL";
}

function expiryStatus(batch, warningDays) {
  return expiryStatusForDate(effectiveExpiry(batch), warningDays);
}

function stockStatus(total, threshold) {
  if (total === 0) return "ZERO";
  if (threshold == null) return "NORMAL";
  return total <= threshold ? "LOW" : "NORMAL";
}

function compareBatch(a, b) {
  const expiryDiff = dateMs(effectiveExpiry(a)) - dateMs(effectiveExpiry(b));
  if (expiryDiff !== 0) return expiryDiff;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

async function queryAll(collectionName, where) {
  const collection = db.collection(collectionName).where(where);
  const output = [];
  let offset = 0;
  while (true) {
    const result = await collection.skip(offset).limit(PAGE_SIZE).get();
    const data = result.data || [];
    output.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return output;
}

async function queryRecentTransactions(openid, options = {}) {
  let query = db.collection(COLLECTIONS.transactions).where({ _openid: openid });
  if (options.itemId) query = db.collection(COLLECTIONS.transactions).where({ _openid: openid, itemId: options.itemId });
  if (options.type) query = db.collection(COLLECTIONS.transactions).where({ _openid: openid, type: options.type });
  const result = await query.orderBy("createdAt", "desc").limit(options.limit || RECENT_TX_LIMIT).get();
  return result.data || [];
}

async function queryOne(collectionName, where) {
  const result = await db.collection(collectionName).where(where).limit(1).get();
  return (result.data || [])[0] || null;
}

function itemLabel(item) {
  return `${item.name}${item.specification ? ` ${item.specification}` : ""}`;
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function activeReminder(reminder) {
  return reminder.status === "ACTIVE" || reminder.status === "READ";
}

function openReminder(reminder) {
  return reminder.status === "ACTIVE" || reminder.status === "READ" || reminder.status === "DISMISSED";
}

function buildNameMap(items) {
  return new Map(items.map((item) => [item._id, item.name]));
}

function buildLocationLabel(location, locationById) {
  const names = [location.name];
  let parentId = location.parentId || null;
  const seen = new Set([location._id]);
  while (parentId && !seen.has(parentId)) {
    const parent = locationById.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    seen.add(parent._id);
    parentId = parent.parentId || null;
  }
  return names.join(" / ");
}

function buildLocationMaps(locations) {
  const byId = new Map(locations.map((location) => [location._id, location]));
  const labels = {};
  for (const location of locations) labels[location._id] = buildLocationLabel(location, byId);
  return { byId, labels };
}

function locationSummary(locationIds, item, locationLabels) {
  const unique = Array.from(new Set(locationIds.filter(Boolean)));
  if (unique.length > 0) {
    const first = locationLabels[unique[0]] || "未知位置";
    return unique.length === 1 ? first : `${first}等${unique.length}处`;
  }
  if (item.defaultLocationId) return locationLabels[item.defaultLocationId] || "默认位置";
  return "未设置位置";
}

function buildRecentMaps(transactions) {
  const recentAtByItem = new Map();
  const recentAddAtByItem = new Map();
  const recentConsumeAtByItem = new Map();
  for (const tx of transactions) {
    const current = recentAtByItem.get(tx.itemId) || 0;
    if (tx.createdAt > current) recentAtByItem.set(tx.itemId, tx.createdAt);
    if (tx.type === "ADD") {
      const addAt = recentAddAtByItem.get(tx.itemId) || 0;
      if (tx.createdAt > addAt) recentAddAtByItem.set(tx.itemId, tx.createdAt);
    }
    if (tx.type === "CONSUME") {
      const consumeAt = recentConsumeAtByItem.get(tx.itemId) || 0;
      if (tx.createdAt > consumeAt) recentConsumeAtByItem.set(tx.itemId, tx.createdAt);
    }
  }
  return { recentAtByItem, recentAddAtByItem, recentConsumeAtByItem };
}

function rowFromItem(item, context) {
  const warningDays = item.expiryWarningDays == null ? 30 : item.expiryWarningDays;
  const itemBatches = context.batches.filter((batch) => batch.itemId === item._id);
  const positive = itemBatches.filter((batch) => batch.quantity > 0).sort(compareBatch);
  const totalQuantity = itemBatches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
  const nearest = positive[0] || null;
  const nearestExpiryDate = nearest ? effectiveExpiry(nearest) : null;
  const expiryStatuses = Array.from(new Set(positive.map((batch) => expiryStatus(batch, warningDays))));
  const positiveLocationIds = Array.from(new Set(positive.map((batch) => batch.locationId).filter(Boolean)));
  const reminders = context.reminders.filter((reminder) => reminder.itemId === item._id && activeReminder(reminder));
  const restockNeeded = context.restocks.some((restock) => restock.itemId === item._id && restock.status === "NEEDED");
  const activeReminderTypes = Array.from(new Set(reminders.map((reminder) => reminder.type)));
  const rowStockStatus = stockStatus(totalQuantity, item.lowStockThreshold);
  return {
    item,
    totalQuantity,
    nearestExpiryDate,
    nearestRemainingDays: nearestExpiryDate ? remainingDays(nearestExpiryDate) : null,
    expiryStatus: nearest ? expiryStatus(nearest, warningDays) : "NORMAL",
    expiryStatuses,
    stockStatus: rowStockStatus,
    batchCount: itemBatches.length,
    positiveBatchCount: positive.length,
    locationIds: positiveLocationIds,
    locationSummary: locationSummary(positiveLocationIds, item, context.locationLabels),
    activeReminderTypes,
    restockNeeded,
    recentAt: context.recentMaps.recentAtByItem.get(item._id) || 0,
    recentAddAt: context.recentMaps.recentAddAtByItem.get(item._id) || 0,
    recentConsumeAt: context.recentMaps.recentConsumeAtByItem.get(item._id) || 0,
    label: itemLabel(item),
  };
}

function applyFilters(rows, payload) {
  const search = normalizeSearch(payload.search);
  const categoryId = payload.categoryId ? String(payload.categoryId) : "";
  const locationId = payload.locationId ? String(payload.locationId) : "";
  const expiryStatus = payload.expiryStatus ? String(payload.expiryStatus) : "";
  const rowStockStatus = payload.stockStatus ? String(payload.stockStatus) : "";
  const positiveOnly = Boolean(payload.positiveOnly);
  return rows
    .filter((row) => !categoryId || row.item.categoryId === categoryId)
    .filter((row) => !locationId || row.locationIds.includes(locationId))
    .filter((row) => !expiryStatus || row.expiryStatuses.includes(expiryStatus))
    .filter((row) => !rowStockStatus || row.stockStatus === rowStockStatus)
    .filter((row) => !positiveOnly || row.totalQuantity > 0)
    .filter((row) => !search || itemLabel(row.item).toLowerCase().includes(search) || String(row.item.brand || "").toLowerCase().includes(search));
}

function expirySortValue(row) {
  if (!row.nearestExpiryDate || row.nearestExpiryDate === UNKNOWN_EXPIRY_DATE) return Number.MAX_SAFE_INTEGER;
  return dateMs(row.nearestExpiryDate);
}

function sortRows(rows, sortBy) {
  const sorted = rows.slice();
  if (sortBy === "quantity") sorted.sort((a, b) => b.totalQuantity - a.totalQuantity || a.label.localeCompare(b.label, "zh-Hans-CN"));
  else if (sortBy === "recentAdd") sorted.sort((a, b) => b.recentAddAt - a.recentAddAt || a.label.localeCompare(b.label, "zh-Hans-CN"));
  else if (sortBy === "recentConsume") sorted.sort((a, b) => b.recentConsumeAt - a.recentConsumeAt || a.label.localeCompare(b.label, "zh-Hans-CN"));
  else if (sortBy === "name") sorted.sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
  else sorted.sort((a, b) => expirySortValue(a) - expirySortValue(b) || a.label.localeCompare(b.label, "zh-Hans-CN"));
  return sorted;
}

async function buildInventoryContext(openid) {
  const [items, batches, categories, locations, reminders, restocks, recentTransactions] = await Promise.all([
    queryAll(COLLECTIONS.items, { _openid: openid }),
    queryAll(COLLECTIONS.batches, { _openid: openid }),
    queryAll(COLLECTIONS.categories, { _openid: openid }),
    queryAll(COLLECTIONS.locations, { _openid: openid }),
    queryAll(COLLECTIONS.reminders, { _openid: openid }),
    queryAll(COLLECTIONS.restockItems, { _openid: openid, status: "NEEDED" }),
    queryRecentTransactions(openid, { limit: RECENT_TX_LIMIT }),
  ]);
  const locationMaps = buildLocationMaps(locations);
  return {
    items,
    batches,
    categories,
    locations,
    categoryNames: buildNameMap(categories),
    locationLabels: locationMaps.labels,
    reminders,
    restocks,
    recentTransactions,
    recentMaps: buildRecentMaps(recentTransactions),
  };
}

async function listInventoryRows(openid, payload = {}) {
  const context = await buildInventoryContext(openid);
  const rows = context.items.map((item) => rowFromItem(item, context));
  const filtered = applyFilters(rows, payload);
  const sorted = sortRows(filtered, payload.sortBy || "nearestExpiry");
  const offset = Math.max(0, Number(payload.offset || 0));
  const limit = payload.limit == null ? sorted.length : Math.max(1, Number(payload.limit));
  return sorted.slice(offset, offset + limit);
}

function backgroundFact(row) {
  if (row.expiryStatus === "EXPIRING" && row.nearestRemainingDays != null && row.nearestExpiryDate !== UNKNOWN_EXPIRY_DATE) {
    return `${row.label} · ${row.totalQuantity}${row.item.unit} · ${row.nearestRemainingDays}天后到期`;
  }
  return `${row.label} · ${row.totalQuantity}${row.item.unit} · ${row.locationSummary}`;
}

function reminderTypeText(type) {
  const map = {
    EXPIRED: "已过期",
    EXPIRING: "临期",
    LOW_STOCK: "低库存",
    ZERO_STOCK: "零库存",
  };
  return map[type] || type;
}

function reminderStatusText(status) {
  const map = {
    ACTIVE: "新提醒",
    READ: "已查看",
    DISMISSED: "已忽略",
    RESOLVED: "已解决",
  };
  return map[status] || status;
}

function reminderPriority(reminder) {
  const statusOffset = reminder.status === "RESOLVED" ? 100 : reminder.status === "DISMISSED" ? 40 : reminder.status === "READ" ? 10 : 0;
  const typePriority = { EXPIRED: 0, EXPIRING: 1, ZERO_STOCK: 2, LOW_STOCK: 3 };
  return statusOffset + (typePriority[reminder.type] == null ? 9 : typePriority[reminder.type]);
}

function reminderTitle(reminder, item, batch) {
  const label = item ? itemLabel(item) : "未知物品";
  if (reminder.type === "EXPIRED") {
    const days = batch ? Math.abs(remainingDays(effectiveExpiry(batch))) : null;
    return days == null ? `${label} 已过期` : `${label} 已过期 ${days} 天`;
  }
  if (reminder.type === "EXPIRING") {
    const days = batch ? remainingDays(effectiveExpiry(batch)) : null;
    return days == null ? `${label} 即将到期` : `${label} ${days} 天后到期`;
  }
  if (reminder.type === "ZERO_STOCK") return `${label} 库存已经归零`;
  if (reminder.type === "LOW_STOCK") return `${label} 库存不足`;
  return label;
}

function reminderMeta(reminder, item, batch, locationLabels, totalByItem) {
  if (!item) return "";
  if (batch) {
    const location = locationLabels[batch.locationId] || "未知位置";
    return `${batch.quantity}${item.unit} · ${location}`;
  }
  const total = totalByItem.get(item._id) || 0;
  return `${total}${item.unit}`;
}

async function listReminderCenter(openid, payload = {}) {
  const [items, batches, reminders, restocks, locations] = await Promise.all([
    queryAll(COLLECTIONS.items, { _openid: openid }),
    queryAll(COLLECTIONS.batches, { _openid: openid }),
    queryAll(COLLECTIONS.reminders, { _openid: openid }),
    queryAll(COLLECTIONS.restockItems, { _openid: openid }),
    queryAll(COLLECTIONS.locations, { _openid: openid }),
  ]);
  const itemById = new Map(items.map((item) => [item._id, item]));
  const batchById = new Map(batches.map((batch) => [batch._id, batch]));
  const totalByItem = new Map();
  for (const batch of batches) totalByItem.set(batch.itemId, (totalByItem.get(batch.itemId) || 0) + Number(batch.quantity || 0));
  const locationLabels = buildLocationMaps(locations).labels;
  const typeFilter = payload.type ? String(payload.type) : "";
  const statusFilter = payload.status ? String(payload.status) : "open";
  const rows = reminders
    .filter((reminder) => !typeFilter || reminder.type === typeFilter)
    .filter((reminder) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "open") return openReminder(reminder);
      return reminder.status === statusFilter;
    })
    .map((reminder) => {
      const item = itemById.get(reminder.itemId) || null;
      const batch = reminder.batchId ? (batchById.get(reminder.batchId) || null) : null;
      const remaining = batch ? remainingDays(effectiveExpiry(batch)) : null;
      return {
        id: reminder._id,
        reminder,
        item,
        batch,
        itemId: reminder.itemId,
        batchId: reminder.batchId || null,
        type: reminder.type,
        status: reminder.status,
        typeText: reminderTypeText(reminder.type),
        statusText: reminderStatusText(reminder.status),
        title: reminderTitle(reminder, item, batch),
        meta: reminderMeta(reminder, item, batch, locationLabels, totalByItem),
        remainingDays: remaining,
        priority: reminderPriority(reminder),
        canView: reminder.status === "ACTIVE" || reminder.status === "READ" || reminder.status === "DISMISSED",
        canDismiss: reminder.status === "ACTIVE" || reminder.status === "READ",
        canAddRestock: reminder.type === "ZERO_STOCK" && (reminder.status === "ACTIVE" || reminder.status === "READ"),
      };
    })
    .sort((a, b) => a.priority - b.priority || b.reminder.createdAt - a.reminder.createdAt);
  const restockRows = restocks
    .filter((restock) => payload.includeClosedRestock ? true : restock.status === "NEEDED")
    .map((restock) => {
      const item = itemById.get(restock.itemId) || null;
      const total = totalByItem.get(restock.itemId) || 0;
      return {
        id: restock._id,
        restock,
        item,
        itemId: restock.itemId,
        status: restock.status,
        statusText: restock.status === "NEEDED" ? "待补货" : restock.status === "PURCHASED" ? "已购买" : "已移除",
        title: item ? itemLabel(item) : "未知物品",
        meta: item ? `${total}${item.unit}` : "",
        canRecordPurchase: restock.status === "NEEDED",
        canDismiss: restock.status === "NEEDED",
      };
    })
    .sort((a, b) => b.restock.createdAt - a.restock.createdAt);
  return {
    reminders: rows,
    restocks: restockRows,
    summary: {
      activeCount: reminders.filter((reminder) => reminder.status === "ACTIVE").length,
      readCount: reminders.filter((reminder) => reminder.status === "READ").length,
      dismissedCount: reminders.filter((reminder) => reminder.status === "DISMISSED").length,
      resolvedCount: reminders.filter((reminder) => reminder.status === "RESOLVED").length,
      restockCount: restockRows.filter((row) => row.status === "NEEDED").length,
    },
  };
}

async function getHomeDashboard(openid) {
  const context = await buildInventoryContext(openid);
  const rows = context.items.map((item) => rowFromItem(item, context));
  const activeRows = rows.filter((row) => row.totalQuantity > 0);
  const expiringCount = rows.filter((row) => row.expiryStatuses.includes("EXPIRING")).length;
  const expiredCount = rows.filter((row) => row.expiryStatuses.includes("EXPIRED")).length;
  const lowStockCount = rows.filter((row) => row.stockStatus === "LOW").length;
  const zeroStockCount = rows.filter((row) => row.stockStatus === "ZERO").length;
  const restockCount = context.restocks.length;
  const alertLines = [];
  if (expiredCount) alertLines.push(`${expiredCount} 件物品已过期`);
  if (expiringCount) alertLines.push(`${expiringCount} 件物品近期临期`);
  if (lowStockCount) alertLines.push(`${lowStockCount} 件物品库存不足`);
  if (zeroStockCount) alertLines.push(`${zeroStockCount} 件物品已经归零`);
  if (!alertLines.length) alertLines.push(rows.length ? "当前没有需要立即处理的库存" : "还没有库存，先记录第一件物品");
  const backgroundRows = activeRows
    .slice()
    .sort((a, b) => {
      const priorityA = a.expiryStatus === "EXPIRING" ? 0 : 1;
      const priorityB = b.expiryStatus === "EXPIRING" ? 0 : 1;
      if (priorityA !== priorityB) return priorityA - priorityB;
      if (b.recentAt !== a.recentAt) return b.recentAt - a.recentAt;
      return a.label.localeCompare(b.label, "zh-Hans-CN");
    })
    .slice(0, 12);
  return {
    summary: {
      itemCount: rows.length,
      batchCount: context.batches.length,
      expiringCount,
      expiredCount,
      lowStockCount,
      zeroStockCount,
      restockCount,
    },
    alertLines,
    backgroundFacts: backgroundRows.map((row, index) => ({ itemId: row.item._id, text: backgroundFact(row), lane: index % 3 })),
  };
}

async function getItemDetail(openid, payload) {
  const itemId = payload && payload.itemId;
  if (!itemId) throw inventoryError("VALIDATION_ERROR", "itemId is required");
  const item = await queryOne(COLLECTIONS.items, { _id: itemId, _openid: openid });
  if (!item) throw inventoryError("NOT_FOUND", "Item not found");
  const [batches, transactions, reminders, restocks, locations, categories] = await Promise.all([
    queryAll(COLLECTIONS.batches, { _openid: openid, itemId }),
    queryRecentTransactions(openid, { itemId, limit: DETAIL_TX_LIMIT }),
    queryAll(COLLECTIONS.reminders, { _openid: openid, itemId }),
    queryAll(COLLECTIONS.restockItems, { _openid: openid, itemId, status: "NEEDED" }),
    queryAll(COLLECTIONS.locations, { _openid: openid }),
    queryAll(COLLECTIONS.categories, { _openid: openid }),
  ]);
  const locationMaps = buildLocationMaps(locations);
  const categoryNames = buildNameMap(categories);
  const warningDays = item.expiryWarningDays == null ? 30 : item.expiryWarningDays;
  const batchesWithStatus = batches
    .map((batch) => {
      const batchExpiry = effectiveExpiry(batch);
      return {
        ...batch,
        effectiveExpiryDate: batchExpiry,
        remainingDays: batchExpiry === UNKNOWN_EXPIRY_DATE ? null : remainingDays(batchExpiry),
        expiryStatus: expiryStatusForDate(batchExpiry, warningDays),
        locationLabel: locationMaps.labels[batch.locationId] || "未知位置",
      };
    })
    .sort(compareBatch);
  const totalQuantity = batches.reduce((sum, batch) => sum + Number(batch.quantity || 0), 0);
  return {
    item,
    categoryName: categoryNames.get(item.categoryId) || "未分类",
    defaultLocationLabel: item.defaultLocationId ? (locationMaps.labels[item.defaultLocationId] || "默认位置") : "未设置位置",
    batches: batchesWithStatus,
    recentTransactions: transactions,
    totalQuantity,
    stockStatus: stockStatus(totalQuantity, item.lowStockThreshold),
    reminders,
    restockItem: restocks[0] || null,
    locationLabels: locationMaps.labels,
  };
}

exports.main = async function main(event) {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) throw inventoryError("UNAUTHENTICATED", "Missing OPENID");
    if (!event || !event.action) throw inventoryError("VALIDATION_ERROR", "action is required");
    if (event.action === "listInventoryRows") return ok(await listInventoryRows(openid, event.payload || {}));
    if (event.action === "getHomeDashboard") return ok(await getHomeDashboard(openid));
    if (event.action === "getItemDetail") return ok(await getItemDetail(openid, event.payload || {}));
    if (event.action === "listReminderCenter") return ok(await listReminderCenter(openid, event.payload || {}));
    throw inventoryError("VALIDATION_ERROR", `Unsupported action: ${event.action}`);
  } catch (error) {
    return fail(error);
  }
};
