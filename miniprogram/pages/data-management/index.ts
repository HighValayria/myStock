/// <reference path="../../types/wechat.d.ts" />

import { mapUserError } from '../../utils/phase2-form';

type ImportPreview = import('../../services/phase2-ui-service').Phase6ImportPreview;
type ImportResult = import('../../services/phase2-ui-service').Phase6ImportResult;
type BackupValidation = import('../../services/phase2-ui-service').Phase6BackupValidation;

interface DataManagementPageData {
  loading: boolean;
  error: string;
  importText: string;
  importFileName: string;
  importFileBase64: string;
  importOperationId: string;
  importPreview: ImportPreview | null;
  importResult: ImportResult | null;
  exportFileName: string;
  exportText: string;
  restoreText: string;
  restorePreview: BackupValidation | null;
}

interface DataManagementPage {
  data: DataManagementPageData;
  setData(data: Partial<DataManagementPageData>): void;
  readChosenTextFile(): Promise<string | null>;
  readChosenImportFile(): Promise<{ name: string; text?: string; base64?: string } | null>;
  previewImport(): Promise<void>;
  commitImport(): Promise<void>;
  exportExcel(): Promise<void>;
  exportJson(): Promise<void>;
  previewRestore(): Promise<void>;
  restoreBackup(): Promise<void>;
}

function getPhase2Service(): typeof import('../../services/phase2-ui-service') {
  return require('../../services/phase2-ui-service') as typeof import('../../services/phase2-ui-service');
}

function modal(title: string, content: string): Promise<boolean> {
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

function copyText(text: string): void {
  const api = wx as unknown as { setClipboardData?: (options: { data: string; success?: () => void; fail?: (err: unknown) => void }) => void };
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

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('JSON 格式不正确');
  }
}

function isXlsxFile(name: string, base64: string): boolean {
  return /\.xlsx$/i.test(name) || base64.startsWith('UEs');
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
  } as DataManagementPageData,

  onImportInput(this: DataManagementPage, event: { detail: { value: string } }) {
    this.setData({ importText: event.detail.value, importFileName: '', importFileBase64: '', importPreview: null, importResult: null, error: '' });
  },

  onRestoreInput(this: DataManagementPage, event: { detail: { value: string } }) {
    this.setData({ restoreText: event.detail.value, restorePreview: null, error: '' });
  },

  async chooseImportFile(this: DataManagementPage) {
    const file = await this.readChosenImportFile();
    if (!file) return;
    this.setData({
      importText: file.text || '',
      importFileName: file.name,
      importFileBase64: file.base64 || '',
      importPreview: null,
      importResult: null,
      error: '',
    });
  },

  async chooseRestoreFile(this: DataManagementPage) {
    const text = await this.readChosenTextFile();
    if (text != null) this.setData({ restoreText: text, restorePreview: null, error: '' });
  },

  async readChosenTextFile(this: DataManagementPage): Promise<string | null> {
    const wxAny = wx as unknown as {
      chooseMessageFile?: (options: { count: number; type: string; success?: (res: { tempFiles: Array<{ path: string; name?: string }> }) => void; fail?: (err: unknown) => void }) => void;
      getFileSystemManager?: () => { readFileSync: (path: string, encoding: string) => string };
    };
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
          } catch {
            wx.showToast({ title: '读取文件失败', icon: 'none' });
            resolve(null);
          }
        },
        fail: () => resolve(null),
      });
    });
  },

  async readChosenImportFile(this: DataManagementPage): Promise<{ name: string; text?: string; base64?: string } | null> {
    const wxAny = wx as unknown as {
      chooseMessageFile?: (options: { count: number; type: string; success?: (res: { tempFiles: Array<{ path: string; name?: string }> }) => void; fail?: (err: unknown) => void }) => void;
      getFileSystemManager?: () => { readFileSync: (path: string, encoding: string) => string };
    };
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
          } catch {
            wx.showToast({ title: '读取文件失败', icon: 'none' });
            resolve(null);
          }
        },
        fail: () => resolve(null),
      });
    });
  },

  async previewImport(this: DataManagementPage) {
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
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  async commitImport(this: DataManagementPage) {
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
    if (!confirmed) return;
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
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  async exportExcel(this: DataManagementPage) {
    this.setData({ loading: true, error: '' });
    try {
      const { exportExcelText } = getPhase2Service();
      const output = await exportExcelText();
      this.setData({ loading: false, exportFileName: output.fileName, exportText: output.text });
      copyText(output.text);
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  async exportJson(this: DataManagementPage) {
    this.setData({ loading: true, error: '' });
    try {
      const { exportBackup } = getPhase2Service();
      const backup = await exportBackup();
      const text = JSON.stringify(backup, null, 2);
      this.setData({ loading: false, exportFileName: `youbeilu_backup_${backup.exportedAt.slice(0, 10)}.json`, exportText: text });
      copyText(text);
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  copyExport(this: DataManagementPage) {
    if (!this.data.exportText) {
      wx.showToast({ title: '暂无可复制内容', icon: 'none' });
      return;
    }
    copyText(this.data.exportText);
  },

  async previewRestore(this: DataManagementPage) {
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
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },

  async restoreBackup(this: DataManagementPage) {
    if (!this.data.restorePreview) {
      await this.previewRestore();
      return;
    }
    if (!this.data.restorePreview.valid) {
      wx.showToast({ title: '备份校验未通过', icon: 'none' });
      return;
    }
    const confirmed = await modal('确认恢复', '恢复会完整替换当前账号的数据，并重新绑定到当前微信用户。');
    if (!confirmed) return;
    this.setData({ loading: true, error: '' });
    try {
      const backup = parseJson(this.data.restoreText);
      const { restoreBackup } = getPhase2Service();
      const result = await restoreBackup(backup);
      this.setData({ loading: false, restorePreview: result });
      wx.showToast({ title: '恢复完成', icon: 'success' });
    } catch (error) {
      this.setData({ loading: false, error: mapUserError(error) });
    }
  },
});
