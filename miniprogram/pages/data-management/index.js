"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const phase2_form_1 = require("../../utils/phase2-form");
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
Page({
    data: {
        loading: false,
        error: '',
        importText: '',
        importOperationId: '',
        importPreview: null,
        importResult: null,
        exportFileName: '',
        exportText: '',
        restoreText: '',
        restorePreview: null,
    },
    onImportInput(event) {
        this.setData({ importText: event.detail.value, importPreview: null, importResult: null, error: '' });
    },
    onRestoreInput(event) {
        this.setData({ restoreText: event.detail.value, restorePreview: null, error: '' });
    },
    async chooseImportFile() {
        const text = await this.readChosenFile();
        if (text != null)
            this.setData({ importText: text, importPreview: null, importResult: null, error: '' });
    },
    async chooseRestoreFile() {
        const text = await this.readChosenFile();
        if (text != null)
            this.setData({ restoreText: text, restorePreview: null, error: '' });
    },
    async readChosenFile() {
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
    async previewImport() {
        if (!this.data.importText.trim()) {
            wx.showToast({ title: '请先粘贴或选择 Excel 内容', icon: 'none' });
            return;
        }
        this.setData({ loading: true, error: '', importResult: null });
        try {
            const { previewExcelImport } = getPhase2Service();
            const preview = await previewExcelImport(this.data.importText, this.data.importOperationId || undefined);
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
            const result = await commitExcelImport(this.data.importText, preview.importOperationId);
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
