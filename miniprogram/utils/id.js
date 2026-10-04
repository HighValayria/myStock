"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createId = createId;
exports.createOperationId = createOperationId;
exports.resetIdSequenceForTests = resetIdSequenceForTests;
let sequence = 0;
function createId(prefix) {
    sequence += 1;
    return `${prefix}_${Date.now().toString(36)}_${sequence.toString(36)}`;
}
function createOperationId(prefix = 'op') {
    return createId(prefix);
}
function resetIdSequenceForTests() {
    sequence = 0;
}
