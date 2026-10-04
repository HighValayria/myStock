"use strict";

const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const SCHEMA_VERSION = 1;
const COLLECTIONS = {
  categories: "categories",
  locations: "locations",
};
const DEFAULT_CATEGORIES = ["食品", "护肤品", "日化用品", "其他"];
const DEFAULT_LOCATIONS = ["厨房", "冰箱", "冷藏室", "冷冻室", "浴室柜"];

function ok(data) {
  return { ok: true, data };
}

function fail(error) {
  return {
    ok: false,
    error: {
      code: error.code || "TAXONOMY_FAILED",
      message: error.message || String(error),
    },
  };
}

function taxonomyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function now() {
  return Date.now();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function assertName(name, label) {
  const normalized = normalizeName(name);
  if (!normalized) throw taxonomyError("VALIDATION_ERROR", `请输入${label}`);
  return normalized;
}

async function listAll(collectionName, openid) {
  const result = await db.collection(collectionName).where({ _openid: openid }).get();
  return result.data || [];
}

async function findByName(collectionName, openid, name) {
  const items = await listAll(collectionName, openid);
  const normalized = normalizeName(name).toLowerCase();
  return items.find((item) => normalizeName(item.name).toLowerCase() === normalized) || null;
}

async function ensureDefaults(openid) {
  const timestamp = now();
  const [categories, locations] = await Promise.all([
    listAll(COLLECTIONS.categories, openid),
    listAll(COLLECTIONS.locations, openid),
  ]);
  const categoryNames = new Set(categories.map((item) => normalizeName(item.name).toLowerCase()));
  const locationNames = new Set(locations.map((item) => normalizeName(item.name).toLowerCase()));

  for (const name of DEFAULT_CATEGORIES) {
    if (!categoryNames.has(name.toLowerCase())) {
      await db.collection(COLLECTIONS.categories).add({
        data: {
          _id: createId("cat"),
          _openid: openid,
          schemaVersion: SCHEMA_VERSION,
          name,
          icon: null,
          expiryWarningDays: null,
          defaultLowStock: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }
  }

  for (const name of DEFAULT_LOCATIONS) {
    if (!locationNames.has(name.toLowerCase())) {
      await db.collection(COLLECTIONS.locations).add({
        data: {
          _id: createId("loc"),
          _openid: openid,
          schemaVersion: SCHEMA_VERSION,
          name,
          parentId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }
  }
}

function locationLabel(location, byId) {
  const names = [location.name];
  let parentId = location.parentId || null;
  const seen = new Set([location._id]);
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    seen.add(parent._id);
    parentId = parent.parentId || null;
  }
  return names.join(" / ");
}

async function getOptions(openid) {
  await ensureDefaults(openid);
  const [categories, locations] = await Promise.all([
    listAll(COLLECTIONS.categories, openid),
    listAll(COLLECTIONS.locations, openid),
  ]);
  const locationById = new Map(locations.map((location) => [location._id, location]));
  return {
    categories: categories
      .map((category) => ({ id: category._id, name: category.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN")),
    locations: locations
      .map((location) => ({
        id: location._id,
        name: location.name,
        parentId: location.parentId || null,
        label: locationLabel(location, locationById),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN")),
  };
}

async function createCategory(openid, payload) {
  const name = assertName(payload && payload.name, "类别名称");
  const existing = await findByName(COLLECTIONS.categories, openid, name);
  if (existing) return { id: existing._id, name: existing.name };
  const timestamp = now();
  const doc = {
    _id: createId("cat"),
    _openid: openid,
    schemaVersion: SCHEMA_VERSION,
    name,
    icon: null,
    expiryWarningDays: null,
    defaultLowStock: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.collection(COLLECTIONS.categories).add({ data: doc });
  return { id: doc._id, name: doc.name };
}

async function createLocation(openid, payload) {
  const name = assertName(payload && payload.name, "位置名称");
  const existing = await findByName(COLLECTIONS.locations, openid, name);
  if (existing) return { id: existing._id, name: existing.name, parentId: existing.parentId || null, label: existing.name };
  const timestamp = now();
  const doc = {
    _id: createId("loc"),
    _openid: openid,
    schemaVersion: SCHEMA_VERSION,
    name,
    parentId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.collection(COLLECTIONS.locations).add({ data: doc });
  return { id: doc._id, name: doc.name, parentId: null, label: doc.name };
}

exports.main = async function main(event) {
  try {
    const wxContext = cloud.getWXContext();
    const openid = wxContext.OPENID;
    if (!openid) throw taxonomyError("UNAUTHENTICATED", "Missing OPENID");
    if (!event || !event.action) throw taxonomyError("VALIDATION_ERROR", "action is required");
    if (event.action === "getOptions") return ok(await getOptions(openid));
    if (event.action === "createCategory") return ok(await createCategory(openid, event.payload || {}));
    if (event.action === "createLocation") return ok(await createLocation(openid, event.payload || {}));
    throw taxonomyError("VALIDATION_ERROR", `Unsupported action: ${event.action}`);
  } catch (error) {
    return fail(error);
  }
};
