# inventory-miniapp

微信小程序项目。本仓库根目录保留微信开发者工具项目配置，实际小程序源码位于 `miniprogram/`。

## 目录结构

```text
inventory-miniapp/
├─ miniprogram/      # 小程序源码
├─ cloudfunctions/   # 云函数
├─ docs/             # 项目文档
├─ tests/            # 测试
├─ README.md
└─ AGENTS.md
```

## 开发

1. 使用微信开发者工具打开仓库根目录。
2. 小程序入口由 `project.config.json` 中的 `miniprogramRoot` 指向 `miniprogram/`。
3. 如需添加云函数，放入 `cloudfunctions/`。

## GitHub

目标远端仓库：

```text
https://github.com/HighValayria/myStock.git
```
