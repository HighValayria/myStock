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
function smartView(preview) {
    return { ...preview, plan: { ...preview.plan, tables: preview.plan.tables.map(table => ({ ...table, mapping: table.mapping.map(mapping => ({ ...mapping, choiceIndex: Math.max(0, fieldChoices.findIndex(f => f.field === mapping.targetField)), label: fieldChoices.find(f => f.field === mapping.targetField)?.label || '待指定' })) })) } };
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
            this.setData({ smartPreview: smartView(preview), smartDirty: false });
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
        this.setData({ smartPreview: preview, smartDirty: true });
    },
    onTableChange(event) {
        const preview = this.data.smartPreview;
        const table = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id);
        if (table)
            table.selected = event.detail.value;
        this.setData({ smartPreview: preview, smartDirty: true });
    },
    onMappingChange(event) {
        const preview = this.data.smartPreview;
        const mapping = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id)?.mapping.find(m => m.column === Number(event.currentTarget.dataset.column));
        const choice = fieldChoices[Number(event.detail.value)];
        if (mapping && choice)
            Object.assign(mapping, { targetField: choice.field, choiceIndex: Number(event.detail.value), label: choice.label, method: 'USER' });
        this.setData({ smartPreview: preview, smartDirty: true });
    },
    onHintInput(event) {
        const preview = this.data.smartPreview;
        const table = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id);
        if (table)
            table[event.currentTarget.dataset.field] = event.detail.value;
        this.setData({ smartPreview: preview, smartDirty: true });
    },
    onRegionInput(event) {
        const preview = this.data.smartPreview;
        const table = preview?.plan.tables.find(t => t.id === event.currentTarget.dataset.id);
        if (!table || !event.detail.value)
            return;
        table[event.currentTarget.dataset.field] = Number(event.detail.value) - 1;
        table.mapping.forEach(mapping => { mapping.method = 'UNRESOLVED'; });
        this.setData({ smartPreview: preview, smartDirty: true });
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
        this.setData({ candidateEdits: edits, smartDirty: true });
    },
    confirmCandidate(event) {
        const edits = [...this.data.candidateEdits];
        let edit = edits.find(e => e.id === event.currentTarget.dataset.id);
        if (!edit) {
            edit = { id: event.currentTarget.dataset.id, values: {}, confirmed: false };
            edits.push(edit);
        }
        edit.confirmed = event.detail.value;
        this.setData({ candidateEdits: edits, smartDirty: true });
    },
    addManualCandidate() {
        const preview = this.data.smartPreview;
        if (!preview)
            return;
        const candidate = { id: `manual:${Date.now()}`, values: {}, source: { file: '手动录入', sourceText: '' }, confidence: 1, warnings: ['用户手动录入'], confirmed: false };
        preview.candidates.push(candidate);
        this.setData({ smartPreview: preview, candidateEdits: [...this.data.candidateEdits, { id: candidate.id, values: {}, confirmed: false }], editingCandidateId: candidate.id, smartDirty: true });
    },
    editCandidate(event) {
        this.setData({ editingCandidateId: this.data.editingCandidateId === event.currentTarget.dataset.id ? '' : event.currentTarget.dataset.id });
    },
    async revalidateSmart() {
        const preview = this.data.smartPreview;
        if (!preview || this.data.loading)
            return;
        this.setData({ loading: true, error: '' });
        try {
            const updated = await getPhase2Service().previewSmartImport({ jobId: preview.jobId, revision: preview.revision, changes: { sheets: preview.plan.sheets.map(s => ({ index: s.index, selected: s.selected })), tables: preview.plan.tables.map(t => ({ id: t.id, headerRow: t.headerRow, endRow: t.endRow, startColumn: t.startColumn, endColumn: t.endColumn, selected: t.selected, categoryHint: t.categoryHint || '', locationHint: t.locationHint || '', mapping: t.mapping.filter(m => m.method === 'USER').map(m => ({ column: m.column, targetField: m.targetField })) })) }, candidateEdits: this.data.candidateEdits });
            this.setData({ smartPreview: smartView(updated), smartDirty: false });
        }
        catch (error) {
            this.setData({ error: (0, phase2_form_1.mapUserError)(error) });
        }
        finally {
            this.setData({ loading: false });
        }
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
            this.setData({ importResult: result });
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
