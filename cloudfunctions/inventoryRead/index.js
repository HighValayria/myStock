"use strict";

const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = {
  items: "items",
  batches: "batches",
  transactions: "transactions",
  reminders: "reminders",
  restockItems: "restock_items",
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const [year, month, day] = String(value).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function effectiveExpiry(batch) {
  if (!batch.openedExpiryDate) return batch.expiryDate;
  return dateMs(batch.openedExpiryDate) < dateMs(batch.expiryDate) ? batch.openedExpiryDate : batch.expiryDate;
}

function remainingDays(expiryDate, today = new Date()) {
  const todayDate = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;
  return Math.floor((dateMs(expiryDate) - dateMs(todayDate)) / MS_PER_DAY);
}

function expiryStatus(batch, warningDays) {
  const days = remainingDays(effectiveExpiry(batch));
  if (days < 0) return "EXPIRED";
  if (days <= warningDays) return "EXPIRING";
  return "NORMAL";
}

function stockStatus(total, threshold) {
  if (total === 0) return "ZERO";
  if (threshold == null) return "NORMAL";
  return total <= threshold ? "LOW" : "NORMAL";
}

function compareBatch(a, b) {
  const expiryDiff = dateMs(effectiveExpiry(a)) - dateMs(effectiveExpiry(b));
  if (expiryDiff !== 0) return expiryDiff;
  return a.createdAt - b.createdAt;
}

async function queryMany(collectionName, where) {
  const result = await db.collection(collectionName).where(where).get();
  return result.data || [];
}

async function queryOne(collectionName, where) {
  const result = await db.collection(collectionName).where(where).limit(1).get();
  return (result.data || [])[0] || null;
}

function itemLabel(item) {
  return `${item.name}${item.specification ? ` ${item.specification}` : ""}`;
}

function rowFromItem(item, batches) {
  const warningDays = item.expiryWarningDays == null ? 30 : item.expiryWarningDays;
  const itemBatches = batches.filter((batch) => batch.itemId === item._id);
  const positive = itemBatches.filter((batch) => batch.quantity > 0).sort(compareBatch);
  const totalQuantity = itemBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const nearest = positive[0] || null;
  return {
    item,
    totalQuantity,
    nearestExpiryDate: nearest ? effectiveExpiry(nearest) : null,
    nearestRemainingDays: nearest ? remainingDays(effectiveExpiry(nearest)) : null,
    expiryStatus: positive.some((batch) => expiryStatus(batch, warningDays) === "EXPIRED")
      ? "EXPIRED"
      : positive.some((batch) => expiryStatus(batch, warningDays) === "EXPIRING")
        ? "EXPIRING"
        : "NORMAL",
    stockStatus: stockStatus(totalQuantity, item.lowStockThreshold),
  };
}

async function listInventoryRows(openid, payload) {
  const search = String((payload && payload.search) || "").trim().toLowerCase();
  const categoryId = payload && payload.categoryId ? String(payload.categoryId) : "";
  const positiveOnly = Boolean(payload && payload.positiveOnly);
  const [items, batches, transactions] = await Promise.all([
    queryMany(COLLECTIONS.items, { _openid: openid }),
    queryMany(COLLECTIONS.batches, { _openid: openid }),
    queryMany(COLLECTIONS.transactions, { _openid: openid }),
  ]);
  const recentAtByItem = new Map();
  for (const tx of transactions) {
    const current = recentAtByItem.get(tx.itemId) || 0;
    if (tx.createdAt > current) recentAtByItem.set(tx.itemId, tx.createdAt);
  }
  return items
    .filter((item) => !categoryId || item.categoryId === categoryId)
    .filter((item) => !search || itemLabel(item).toLowerCase().includes(search) || String(item.brand || "").toLowerCase().includes(search))
    .map((item) => rowFromItem(item, batches))
    .filter((row) => !positiveOnly || row.totalQuantity > 0)
    .map((row) => ({
      ...row,
      recentAt: recentAtByItem.get(row.item._id) || 0,
      label: itemLabel(row.item),
    }))
    .sort((a, b) => {
      if (b.recentAt !== a.recentAt) return b.recentAt - a.recentAt;
      return a.label.localeCompare(b.label, "zh-Hans-CN");
    });
}

async function getItemDetail(openid, payload) {
  const itemId = payload && payload.itemId;
  if (!itemId) throw inventoryError("VALIDATION_ERROR", "itemId is required");
  const item = await queryOne(COLLECTIONS.items, { _id: itemId, _openid: openid });
  if (!item) throw inventoryError("NOT_FOUND", "Item not found");
  const [batches, transactions, reminders, restocks] = await Promise.all([
    queryMany(COLLECTIONS.batches, { _openid: openid, itemId }),
    queryMany(COLLECTIONS.transactions, { _openid: openid, itemId }),
    queryMany(COLLECTIONS.reminders, { _openid: openid, itemId }),
    queryMany(COLLECTIONS.restockItems, { _openid: openid, itemId, status: "NEEDED" }),
  ]);
  const warningDays = item.expiryWarningDays == null ? 30 : item.expiryWarningDays;
  const batchesWithStatus = batches
    .map((batch) => ({
      ...batch,
      remainingDays: remainingDays(effectiveExpiry(batch)),
      expiryStatus: expiryStatus(batch, warningDays),
    }))
    .sort(compareBatch);
  const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
  transactions.sort((a, b) => b.createdAt - a.createdAt);
  return {
    item,
    batches: batchesWithStatus,
    recentTransactions: transactions.slice(0, 20),
    totalQuantity,
    stockStatus: stockStatus(totalQuantity, item.lowStockThreshold),
    reminders,
    restockItem: restocks[0] || null,
  };
}

exports.main = async function main(event) {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) throw inventoryError("UNAUTHENTICATED", "Missing OPENID");
    if (!event || !event.action) throw inventoryError("VALIDATION_ERROR", "action is required");
    if (event.action === "listInventoryRows") return ok(await listInventoryRows(openid, event.payload || {}));
    if (event.action === "getItemDetail") return ok(await getItemDetail(openid, event.payload || {}));
    throw inventoryError("VALIDATION_ERROR", `Unsupported action: ${event.action}`);
  } catch (error) {
    return fail(error);
  }
};
