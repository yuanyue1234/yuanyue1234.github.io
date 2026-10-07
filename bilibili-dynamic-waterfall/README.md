# B 站动态页优化插件

一个用于优化 `t.bilibili.com` 浏览体验的 Tampermonkey 脚本。当前版本 v7.26。

## 主要功能

- 避开固定顶栏，动态瀑布流默认双列，多图自适应防越界。
- 修复图片查看器工具栏挤压。
- 设置面板支持壁纸、毛玻璃、item 背景透明度与快速评论开关联动。
- 评论按钮支持快速预览与完整双栏评论弹窗。
- 完整评论支持最热/最新排序、分页加载与发送评论。
- UP 主列表常驻、深色模式适配、双实例防护与异常恢复。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [`bilibili-dynamic-waterfall-settings.user.js`](https://raw.githubusercontent.com/yuanyue1234/yuanyue1234.github.io/main/bilibili-dynamic-waterfall/bilibili-dynamic-waterfall-settings.user.js)。
3. 在 Tampermonkey 中确认安装，刷新 B 站动态首页。

多图场景配合浏览器缩放至约 80% 效果最佳，脚本设置面板顶部也会显示提示。

## 使用范围

脚本仅匹配：`https://t.bilibili.com/*`

## License

MIT
