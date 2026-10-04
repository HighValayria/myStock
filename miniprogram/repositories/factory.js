"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRepositories = createRepositories;
const cloud_1 = require("./cloud");
const memory_1 = require("./memory");
function createRepositories(mode = 'cloud') {
    return mode === 'memory' ? (0, memory_1.createMemoryRepositories)() : (0, cloud_1.createCloudRepositories)();
}
