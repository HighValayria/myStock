"use strict";
/// <reference path="../../types/wechat.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
const fieldChoices = [
    ['UNKNOWN', '待指定'], ['IGNORE', '忽略'], ['item.name', '物品名称'], ['item.category', '类别'],
    ['item.brand', '品牌'], ['item.specification', '规格'], ['item.unit', '单位'], ['batch.quantity', '数量'],
    ['batch.location', '存放位置'], ['batch.purchaseDate', '购买日期'], ['batch.productionDate', '生产日期'],
    ['batch.shelfLifeValue', '保质期数值'], ['batch.shelfLifeUnit', '保质期单位'], ['batch.expiryDate', '到期日期'],
    ['batch.purchasePrice', '单位购买价格'], ['batch.purchaseChannel', '购买渠道'], ['batch.note', '备注'],
    ['item.lowStockThreshold', '低库存阈值'], ['item.expiryWarningDays', '临期阈值'],
].map(([field, label]) => ({ field, label }));
const editableFieldChoices = fieldChoices.filter(choice => choice.field !== 'IGNORE' && choice.field !== 'UNKNOWN');
const sheetRoleLabels = {
    CURRENT_INVENTORY: '当前库存',
    HISTORICAL_DATA: '历史记录',
    INSTRUCTIONS: '说明',
    ANALYTICS: '统计',
    REFERENCE: '参考资料',
    IGNORE: '忽略',
    UNKNOWN: '待判断',
};
function candidateView(candidate, validationErrors = []) {
    const values = candidate.values;
    const hasValidationError = validationErrors.length > 0;
    const needsReview = hasValidationError || (!candidate.confirmed && Boolean(candidate.warnings.length || candidate.confidence < 0.85));
    const sourceLabel = [
        candidate.source.sheet || candidate.source.file,
        candidate.source.row ? `第${candidate.source.row}行` : '',
    ].filter(Boolean).join(' ');
    return {
        ...candidate,
        sourceLabel,
        summary: `${values['item.name'] || '名称缺失'} · ${values['batch.quantity'] || '数量缺失'}${values['item.unit'] || '个'} · ${values['batch.location'] || '位置未指定'}`,
        reviewLabel: hasValidationError ? '需要修改' : candidate.confirmed ? '已核对' : needsReview ? '需要核对' : '可直接导入',
        reviewClass: hasValidationError ? 'error' : candidate.confirmed ? 'confirmed' : '',
        needsReview,
        hasValidationError,
        validationErrors,
        editFields: editableFieldChoices.map(choice => ({
            ...choice,
            value: values[choice.field] || '',
            required: choice.field === 'item.name' || choice.field === 'batch.quantity',
        })),
    };
}
function smartView(preview, showAllCandidates = false) {
    const errorsByCandidateIndex = new Map();
    preview.errors.forEach(error => {
        const candidateIndex = error.rowNumber - 2;
        const messages = errorsByCandidateIndex.get(candidateIndex) || [];
        messages.push(error.message);
        errorsByCandidateIndex.set(candidateIndex, messages);
    });
    const candidates = preview.candidates.map((candidate, index) => candidateView(candidate, errorsByCandidateIndex.get(index) || []));
    const reviewCandidates = candidates.filter(candidate => candidate.needsReview);
    const tables = preview.plan.tables.map(table => {
        const recognizedFields = table.mapping.map(mapping => mapping.targetField);
        const missingKeyFields = [
            recognizedFields.includes('item.name') ? '' : '物品名称',
            recognizedFields.includes('batch.quantity') ? '' : '数量',
        ].filter(Boolean);
        return {
            ...table,
            headerRowLabel: table.headerRow + 1,
            endRowLabel: table.endRow + 1,
            startColumnLabel: table.startColumn + 1,
            endColumnLabel: table.endColumn + 1,
            itemCount: Math.max(0, table.endRow - table.headerRow),
            keyFieldStatus: missingKeyFields.length ? `需要指定${missingKeyFields.join('、')}` : '关键字段已识别',
            unresolvedCount: table.mapping.filter(mapping => mapping.targetField === 'UNKNOWN').length,
            mappingSummary: `${table.mapping.filter(mapping => mapping.targetField !== 'UNKNOWN' && mapping.targetField !== 'IGNORE').length} 列已识别 · ${table.mapping.filter(mapping => mapping.targetField === 'UNKNOWN').length} 列未使用`,
            mapping: table.mapping.map(mapping => ({
                ...mapping,
                choiceIndex: Math.max(0, fieldChoices.findIndex(field => field.field === mapping.targetField)),
                label: fieldChoices.find(field => field.field === mapping.targetField)?.label || '待指定',
            })),
        };
    });
    const selectedTables = tables.filter(table => table.selected);
    return {
        ...preview,
        candidates,
        reviewCandidates,
        displayCandidates: showAllCandidates ? candidates : reviewCandidates,
        reviewCandidateCount: reviewCandidates.length,
        readyCandidateCount: candidates.length - reviewCandidates.length,
        selectedTableCount: selectedTables.length,
        plan: {
            ...preview.plan,
            sheets: preview.plan.sheets.map(sheet => ({ ...sheet, roleLabel: sheetRoleLabels[sheet.role] || '待判断' })),
            tables,
            selectedTables,
        },
    };
}
function getPhase2Service() {
    return require('../../services/phase2-ui-service');
}
function modal(title, content) {
    return new Promise((resolve) => {
        wx.showModal({
            title,
            content,
            confirmText: '确认',
            cancelText: '取消',
            success: (res) => resolve(Boolean(res.confirm)),
            fail: () => resolve(false),
        });
    });
}
function copyText(text) {
    const api = wx;
    if (!api.setClipboardData) {
        wx.showToast({ title: '当前环境不支持复制', icon: 'none' });
        return;
    }
    api.setClipboardData({
        data: text,
        success: () => wx.showToast({ title: '已复制', icon: 'success' }),
        fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
}
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('JSON 格式不正确');
    }
}
function isXlsxFile(name, base64) {
    return /\.(xlsx|xls)$/i.test(name) || base64.startsWith('UEs');
}
async function validateSmartPage(page, nextStep) {
    const preview = page.data.smartPreview;
    if (!preview || page.data.loading)
        return false;
    page.setData({ loading: true, error: '' });
    try {
        const updated = await getPhase2Service().previewSmartImport({
            jobId: preview.jobId,
            revision: preview.revision,
            changes: {
                sheets: preview.plan.sheets.map(sheet => ({ index: sheet.index, selected: sheet.selected })),
                tables: preview.plan.tables.map(table => ({
                    id: table.id,
                    headerRow: table.headerRow,
                    endRow: table.endRow,
                    startColumn: table.startColumn,
                    endColumn: table.endColumn,
                    selected: table.selected,
                    categoryHint: table.categoryHint || '',
                    locationHint: table.locationHint || '',
                    mapping: table.mapping.filter(mapping => mapping.method === 'USER').map(mapping => ({ column: mapping.column, targetField: mapping.targetField })),
                })),
            },
            candidateEdits: page.data.candidateEdits,
        });
        page.setData({
            smartPreview: smartView(updated, page.data.showAllCandidates),
            smartDirty: false,
            smartStep: nextStep || page.data.smartStep,
            smartCommitDisabled: Boolean(updated.errorRows || updated.needsConfirmation || !updated.validRows),
        });
        return true;
    }
    catch (error) {
        page.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        return false;
    }
    finally {
        page.setData({ loading: false });
    }
}
Page({
    data: {
        loading: false,
        error: '',
        importText: '',
        importFileName: '',
        importFileBase64: '',
        importOperationId: '',
        importPreview: null,
        importResult: null,
        exportFileName: '',
        exportText: '',
        restoreText: '',
        restorePreview: null,
        smartPreview: null,
        smartMode: 'file',
        allowAI: false,
        fieldChoices,
        candidateEdits: [],
        smartDirty: false,
        editingCandidateId: '',
        smartDialogOpen: false,
        smartStep: 1,
        expandedTableId: '',
        smartCommitDisabled: true,
        showSmartAdvanced: false,
        showAllCandidates: false,
    },
    onImportInput(event) {
        this.setData({ importText: event.detail.value, importFileName: '', importFileBase64: '', importPreview: null, importResult: null, error: '', smartPreview: null, candidateEdits: [], importOperationId: '' });
    },
    onRestoreInput(event) {
        this.setData({ restoreText: event.detail.value, restorePreview: null, error: '' });
    },
    async chooseImportFile() {
        const file = await this.readChosenImportFile();
        if (!file)
            return;
        this.setData({
            importText: file.text || '',
            importFileName: file.name,
            importFileBase64: file.base64 || '',
            importPreview: null,
            importResult: null,
            error: '',
            smartPreview: null,
            candidateEdits: [],
            importOperationId: '',
        });
    },
    setSmartMode(event) {
        this.setData({ smartMode: event.currentTarget.dataset.mode, smartPreview: null, candidateEdits: [], importResult: null });
    },
    onAIChange(event) {
        this.setData({ allowAI: event.detail.value });
    },
    copyTemplate() {
        copyText(['物品名称', '类别', '品牌', '规格', '数量', '单位', '存放位置', '购买日期', '生产日期', '保质期数值', '保质期单位', '到期日期', '单位购买价格', '购买渠道', '低库存阈值', '临期阈值', '备注'].join('\t'));
    },
    async recognizeSmart() {
        if (this.data.loading)
            return;
        if (!this.data.importText.trim() && !this.data.importFileBase64) {
            wx.showToast({ title: '请先选择文件或输入文本', icon: 'none' });
            return;
        }
        if (this.data.smartMode === 'text' && this.data.importFileBase64) {
            wx.showToast({ title: '请切换文件导入', icon: 'none' });
            return;
        }
        this.setData({ loading: true, error: '', smartPreview: null, importResult: null, candidateEdits: [] });
        try {
            const preview = await getPhase2Service().previewSmartImport({ text: this.data.importText, fileBase64: this.data.importFileBase64, fileName: this.data.importFileName, sourceType: this.data.smartMode === 'text' ? 'text' : undefined, allowAI: this.data.allowAI || this.data.smartMode === 'text' });
            this.setData({
                smartPreview: smartView(preview),
                smartDirty: false,
                smartDialogOpen: true,
                smartStep: 1,
                expandedTableId: '',
                smartCommitDisabled: Boolean(preview.errorRows || preview.needsConfirmation || !preview.validRows),
                showSmartAdvanced: false,
                showAllCandidates: false,
            });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    onSheetChange(event) {
        const preview = this.data.smartPreview;
        if (!preview)
            return;
        const sheet = preview.plan.sheets.find(s => s.index === Number(event.currentTarget.dataset.index));
        if (sheet)
            sheet.selected = event.detail.value;
        this.setData({ smartPreview: preview, smartDirty: true, smartCommitDisabled: true });
    },
    onTableChange(event) {
        const preview = this.data.smartPreview;
        const table = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id);
        if (table) {
            table.selected = event.detail.value;
            if (event.detail.value) {
                const sheet = preview?.plan.sheets.find(item => item.name === table.sheet);
                if (sheet)
                    sheet.selected = true;
            }
        }
        this.setData({ smartPreview: preview ? smartView(preview, this.data.showAllCandidates) : null, smartDirty: true, smartCommitDisabled: true });
    },
    onMappingChange(event) {
        const preview = this.data.smartPreview;
        const mapping = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id)?.mapping.find(m => m.column === Number(event.currentTarget.dataset.column));
        const choice = fieldChoices[Number(event.detail.value)];
        if (mapping && choice)
            Object.assign(mapping, { targetField: choice.field, choiceIndex: Number(event.detail.value), label: choice.label, method: 'USER' });
        this.setData({ smartPreview: preview ? smartView(preview, this.data.showAllCandidates) : null, smartDirty: true, smartCommitDisabled: true });
    },
    onHintInput(event) {
        const preview = this.data.smartPreview;
        const table = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id);
        if (table)
            table[event.currentTarget.dataset.field] = event.detail.value;
        this.setData({ smartPreview: preview ? smartView(preview, this.data.showAllCandidates) : null, smartDirty: true, smartCommitDisabled: true });
    },
    onRegionInput(event) {
        const preview = this.data.smartPreview;
        const table = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id);
        if (!table || !event.detail.value)
            return;
        table[event.currentTarget.dataset.field] = Number(event.detail.value) - 1;
        table.mapping.forEach(mapping => { mapping.method = 'UNRESOLVED'; });
        this.setData({ smartPreview: preview ? smartView(preview, this.data.showAllCandidates) : null, smartDirty: true, smartCommitDisabled: true });
    },
    onCandidateInput(event) {
        const edits = [...this.data.candidateEdits];
        let edit = edits.find(e => e.id === event.currentTarget.dataset.id);
        if (!edit) {
            edit = { id: event.currentTarget.dataset.id, values: {}, confirmed: false };
            edits.push(edit);
        }
        edit.values[event.currentTarget.dataset.field] = event.detail.value;
        edit.confirmed = false;
        const preview = this.data.smartPreview;
        const candidate = preview?.candidates.find(item => item.id === event.currentTarget.dataset.id);
        if (candidate) {
            candidate.values[event.currentTarget.dataset.field] = event.detail.value;
            candidate.confirmed = false;
        }
        this.setData({ candidateEdits: edits, smartPreview: preview ? smartView(preview, this.data.showAllCandidates) : null, smartDirty: true, smartCommitDisabled: true });
    },
    confirmCandidate(event) {
        const edits = [...this.data.candidateEdits];
        let edit = edits.find(e => e.id === event.currentTarget.dataset.id);
        if (!edit) {
            edit = { id: event.currentTarget.dataset.id, values: {}, confirmed: false };
            edits.push(edit);
        }
        edit.confirmed = event.detail.value;
        const preview = this.data.smartPreview;
        const candidate = preview?.candidates.find(item => item.id === event.currentTarget.dataset.id);
        if (candidate)
            candidate.confirmed = event.detail.value;
        this.setData({ candidateEdits: edits, smartPreview: preview ? smartView(preview, this.data.showAllCandidates) : null, smartDirty: true, smartCommitDisabled: true });
    },
    addManualCandidate() {
        const preview = this.data.smartPreview;
        if (!preview)
            return;
        const candidate = { id: `manual:${Date.now()}`, values: {}, source: { file: '手动录入', sourceText: '' }, confidence: 1, warnings: ['用户手动录入'], confirmed: false };
        preview.candidates.push(candidate);
        this.setData({ smartPreview: smartView(preview, this.data.showAllCandidates), candidateEdits: [...this.data.candidateEdits, { id: candidate.id, values: {}, confirmed: false }], editingCandidateId: candidate.id, smartDirty: true, smartCommitDisabled: true });
    },
    editCandidate(event) {
        this.setData({ editingCandidateId: this.data.editingCandidateId === event.currentTarget.dataset.id ? '' : event.currentTarget.dataset.id });
    },
    showSmartDialog() {
        const preview = this.data.smartPreview;
        if (preview)
            this.setData({ smartDialogOpen: true, smartPreview: smartView(preview), showAllCandidates: false });
    },
    closeSmartDialog() {
        if (this.data.loading)
            return;
        const preview = this.data.smartPreview;
        this.setData({ smartDialogOpen: false, smartPreview: preview ? smartView(preview) : null, editingCandidateId: '', expandedTableId: '', showSmartAdvanced: false, showAllCandidates: false });
    },
    stopPropagation() { },
    preventTouchMove() { },
    toggleSmartAdvanced() {
        this.setData({ showSmartAdvanced: !this.data.showSmartAdvanced, expandedTableId: '' });
    },
    toggleAllCandidates() {
        const preview = this.data.smartPreview;
        if (!preview)
            return;
        const showAllCandidates = !this.data.showAllCandidates;
        this.setData({
            showAllCandidates,
            smartPreview: { ...preview, displayCandidates: showAllCandidates ? preview.candidates : preview.reviewCandidates },
        });
    },
    toggleTableDetails(event) {
        const id = event.currentTarget.dataset.id;
        this.setData({ expandedTableId: this.data.expandedTableId === id ? '' : id });
    },
    async goSmartStep(event) {
        const step = Number(event.currentTarget.dataset.step);
        if (step < this.data.smartStep) {
            this.setData({ smartStep: step });
            return;
        }
        if (this.data.smartDirty)
            await validateSmartPage(this, step);
        else
            this.setData({ smartStep: step });
    },
    confirmAllCandidates() {
        const preview = this.data.smartPreview;
        if (!preview)
            return;
        const edits = [...this.data.candidateEdits];
        for (const candidate of preview.candidates) {
            let edit = edits.find(item => item.id === candidate.id);
            if (!edit) {
                edit = { id: candidate.id, values: {}, confirmed: true };
                edits.push(edit);
            }
            else
                edit.confirmed = true;
            candidate.confirmed = true;
        }
        this.setData({ candidateEdits: edits, smartPreview: smartView(preview, this.data.showAllCandidates), smartDirty: true, smartCommitDisabled: true });
    },
    async revalidateSmart() {
        await validateSmartPage(this);
    },
    async commitSmart() {
        const preview = this.data.smartPreview;
        if (!preview || this.data.loading)
            return;
        if (this.data.smartDirty || preview.errorRows || preview.needsConfirmation || !preview.validRows) {
            wx.showToast({ title: '请校验并核对候选记录', icon: 'none' });
            return;
        }
        if (!await modal('确认导入', `将导入 ${preview.validRows} 条库存，并生成入库流水。`))
            return;
        this.setData({ loading: true, error: '' });
        try {
            const result = await getPhase2Service().commitSmartImport(preview.jobId, preview.revision);
            this.setData({ importResult: result, smartDialogOpen: false });
            wx.showToast({ title: result.failedRows.length ? '部分导入失败，可重试' : '导入完成', icon: 'none' });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    async chooseRestoreFile() {
        const text = await this.readChosenTextFile();
        if (text != null)
            this.setData({ restoreText: text, restorePreview: null, error: '' });
    },
    async readChosenTextFile() {
        const wxAny = wx;
        if (!wxAny.chooseMessageFile || !wxAny.getFileSystemManager) {
            wx.showToast({ title: '可直接粘贴文件内容', icon: 'none' });
            return null;
        }
        return new Promise((resolve) => {
            wxAny.chooseMessageFile?.({
                count: 1,
                type: 'file',
                success: (res) => {
                    try {
                        const path = res.tempFiles[0]?.path;
                        const text = path ? wxAny.getFileSystemManager?.().readFileSync(path, 'utf8') : '';
                        resolve(text || null);
                    }
                    catch {
                        wx.showToast({ title: '读取文件失败', icon: 'none' });
                        resolve(null);
                    }
                },
                fail: () => resolve(null),
            });
        });
    },
    async readChosenImportFile() {
        const wxAny = wx;
        if (!wxAny.chooseMessageFile || !wxAny.getFileSystemManager) {
            wx.showToast({ title: '可直接粘贴表格内容', icon: 'none' });
            return null;
        }
        return new Promise((resolve) => {
            wxAny.chooseMessageFile?.({
                count: 1,
                type: 'file',
                success: (res) => {
                    try {
                        const file = res.tempFiles[0];
                        const path = file?.path;
                        if (!path) {
                            resolve(null);
                            return;
                        }
                        const name = file.name || path.split('/').pop() || 'import.xlsx';
                        const fs = wxAny.getFileSystemManager?.();
                        const base64 = fs?.readFileSync(path, 'base64') || '';
                        if (isXlsxFile(name, base64)) {
                            resolve({ name, base64 });
                            return;
                        }
                        resolve({ name, text: fs?.readFileSync(path, 'utf8') || '' });
                    }
                    catch {
                        wx.showToast({ title: '读取文件失败', icon: 'none' });
                        resolve(null);
                    }
                },
                fail: () => resolve(null),
            });
        });
    },
    async previewImport() {
        if (!this.data.importText.trim() && !this.data.importFileBase64) {
            wx.showToast({ title: '请先粘贴或选择 Excel 内容', icon: 'none' });
            return;
        }
        this.setData({ loading: true, error: '', importResult: null });
        try {
            const { previewExcelImport } = getPhase2Service();
            const preview = await previewExcelImport({
                text: this.data.importText,
                fileBase64: this.data.importFileBase64,
                fileName: this.data.importFileName,
            }, this.data.importOperationId || undefined);
            this.setData({ loading: false, importPreview: preview, importOperationId: preview.importOperationId });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async commitImport() {
        const preview = this.data.importPreview;
        if (!preview) {
            await this.previewImport();
            return;
        }
        if (preview.errorRows > 0) {
            wx.showToast({ title: '请先修正错误行', icon: 'none' });
            return;
        }
        const confirmed = await modal('确认导入', `将导入 ${preview.validRows} 行库存，并生成 ADD 流水。`);
        if (!confirmed)
            return;
        this.setData({ loading: true, error: '' });
        try {
            const { commitExcelImport } = getPhase2Service();
            const result = await commitExcelImport({
                text: this.data.importText,
                fileBase64: this.data.importFileBase64,
                fileName: this.data.importFileName,
            }, preview.importOperationId);
            this.setData({ loading: false, importResult: result });
            wx.showToast({ title: '导入完成', icon: 'success' });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async exportExcel() {
        this.setData({ loading: true, error: '' });
        try {
            const { exportExcelText } = getPhase2Service();
            const output = await exportExcelText();
            this.setData({ loading: false, exportFileName: output.fileName, exportText: output.text });
            copyText(output.text);
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async exportJson() {
        this.setData({ loading: true, error: '' });
        try {
            const { exportBackup } = getPhase2Service();
            const backup = await exportBackup();
            const text = JSON.stringify(backup, null, 2);
            this.setData({ loading: false, exportFileName: `youbeilu_backup_${backup.exportedAt.slice(0, 10)}.json`, exportText: text });
            copyText(text);
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    copyExport() {
        if (!this.data.exportText) {
            wx.showToast({ title: '暂无可复制内容', icon: 'none' });
            return;
        }
        copyText(this.data.exportText);
    },
    async previewRestore() {
        if (!this.data.restoreText.trim()) {
            wx.showToast({ title: '请先粘贴或选择 JSON 备份', icon: 'none' });
            return;
        }
        this.setData({ loading: true, error: '', restorePreview: null });
        try {
            const backup = parseJson(this.data.restoreText);
            const { previewRestoreBackup } = getPhase2Service();
            const preview = await previewRestoreBackup(backup);
            this.setData({ loading: false, restorePreview: preview });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
    async restoreBackup() {
        if (!this.data.restorePreview) {
            await this.previewRestore();
            return;
        }
        if (!this.data.restorePreview.valid) {
            wx.showToast({ title: '备份校验未通过', icon: 'none' });
            return;
        }
        const confirmed = await modal('确认恢复', '恢复会完整替换当前账号的数据，并重新绑定到当前微信用户。');
        if (!confirmed)
            return;
        this.setData({ loading: true, error: '' });
        try {
            const backup = parseJson(this.data.restoreText);
            const { restoreBackup } = getPhase2Service();
            const result = await restoreBackup(backup);
            this.setData({ loading: false, restorePreview: result });
            wx.showToast({ title: '恢复完成', icon: 'success' });
        }
        catch (error) {
            this.setData({ loading: false, error: (0, phase2_form_1.mapUserError)(error) });
        }
    },
});
