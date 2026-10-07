// ==UserScript==
// @name         Bilibili 动态瀑布流 (v7.10 自适应修正版)
// @namespace    http://tampermonkey.net/
// @version      7.26
// @description  B站动态页清爽改造：瀑布流、原生最近访问、发布框折叠、右下角快捷设置、壁纸、栏数、透明度与毛玻璃。
// @author       Gemini Enterprise / 小晚
// @license      MIT
// @match        https://t.bilibili.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    // 双实例守卫：同一页面只允许一个脚本实例生效（防止旧版脚本残留导致弹窗叠加/页面无法点击）
    if (document.documentElement && document.documentElement.hasAttribute('data-bdw-active')) return;

    const STORAGE_KEY = 'bili_dynamic_waterfall_settings_v7';
    const SCRIPT_VERSION = '7.26';
    const LIVE_PAGE_SIZE = 5;
    const DEFAULT_SETTINGS = Object.freeze({
        enabled: true,
        wallpaperEnabled: false,
        livePaginationEnabled: true,
        wallpaper: '',
        columns: '2',
        itemOpacity: 0.9,
        itemOpacityEnabled: true,
        glassEnabled: false,
        glassBlur: 14,
        upListSticky: true,
        quickComment: true
    });

    let settings = normalizeSettings(readStoredSettings());
    let loopScheduled = false;
    let observer = null;
    let dynamicFilterScheduled = false;
    let lastDynamicSignature = '';
    const seenDynamicKeys = new Map();
    const css = `
:root{--bdw-wallpaper:none;--bdw-columns:3;--bdw-item-opacity-percent:90%;--bdw-card-bg:color-mix(in srgb,var(--bg1,#fff) 90%,transparent);--bdw-glass-blur:14px;--bdw-floating-stack-bottom:24px;--bdw-fab-size:60px;--bdw-header-offset:76px}
#bdw-wallpaper-layer{display:none;position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:transparent}
#bdw-wallpaper-layer .bdw-wallpaper-image{position:absolute;inset:0;background-image:var(--bdw-wallpaper);background-size:cover;background-position:center;background-repeat:no-repeat;transform:scale(1.01);transition:filter .2s ease,transform .2s ease}
#bdw-wallpaper-layer .bdw-wallpaper-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.2),rgba(255,255,255,.42)),rgba(255,255,255,.08)}
html.bdw-enabled.bdw-has-background #bdw-wallpaper-layer{display:block}
html.bdw-enabled.bdw-has-wallpaper.bdw-glass #bdw-wallpaper-layer .bdw-wallpaper-image{inset:calc(var(--bdw-glass-blur) * -2);filter:blur(var(--bdw-glass-blur));transform:scale(1.06)}
html.bdw-enabled.bdw-bg-image,html.bdw-enabled.bdw-bg-image body{background-image:var(--bdw-wallpaper)!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
html.bdw-enabled.bdw-bg-image #app>div:nth-child(2),html.bdw-enabled.bdw-bg-image body>div:nth-of-type(4)>div:nth-of-type(2).bg{background-image:var(--bdw-wallpaper)!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important;background-attachment:fixed!important}
html.bdw-enabled.bdw-has-background #app,html.bdw-enabled.bdw-has-background .bili-dyn-home,html.bdw-enabled.bdw-has-background .bili-dyn-home--member,html.bdw-enabled.bdw-has-background .bili-dyn-home--member main,html.bdw-enabled.bdw-has-background .bili-dyn-list,html.bdw-enabled.bdw-has-background .bili-dyn-list__items{position:relative;z-index:1;background:transparent!important}
html.bdw-enabled .bili-dyn-home--member{display:flex!important;width:100%!important;max-width:100%!important;padding:0 40px!important;box-sizing:border-box;justify-content:center}
/* 左侧栏实体：sticky 贴顶栏下方 + 高层级，蓝区永不被顶栏遮挡 */
html.bdw-enabled .bili-dyn-home--member aside.left{display:flex!important;flex-direction:column;flex-shrink:0!important;width:260px!important;margin-right:30px!important;max-height:calc(100vh - var(--bdw-header-offset));overflow-y:auto;position:sticky!important;top:var(--bdw-header-offset)!important;transform:none!important;align-self:flex-start;box-sizing:border-box;padding-bottom:50px;z-index:999}
html.bdw-enabled .bili-dyn-home--member aside.left::-webkit-scrollbar{width:0}
html.bdw-enabled .bili-dyn-home--member aside.right,html.bdw-enabled .bili-dyn-home--member .bili-dyn-sidebar{display:none!important}
html.bdw-enabled .bili-dyn-home--member main{flex:1;min-width:0}
/* One sticky group: profile and live users keep their normal document order.
   Bilibili writes a scroll-dependent transform onto live users; disable that inner sticky. */
html.bdw-enabled .bili-dyn-home--member aside.left>section,html.bdw-enabled .bili-dyn-home--member aside.left .bili-dyn-my-info,html.bdw-enabled .bili-dyn-home--member aside.left .bili-dyn-live-users{position:static!important;top:auto!important;bottom:auto!important;transform:none!important;flex-shrink:0}
html.bdw-enabled .bili-dyn-home--member aside.left .bili-dyn-my-info{margin-bottom:12px!important}
html.bdw-enabled .bili-dyn-list__items{column-gap:clamp(16px,1.5vw,28px);display:block!important;column-fill:balance;transition:height .3s ease}
html.bdw-enabled .bili-dyn-list__items{column-count:var(--bdw-columns)!important}
html.bdw-enabled .bili-dyn-list__item{display:inline-block!important;width:100%!important;max-width:100%!important;break-inside:avoid;break-inside:avoid-column;page-break-inside:avoid;margin-bottom:clamp(14px,1.4vw,24px)!important;vertical-align:top;border-width:0!important;background:transparent!important;border-radius:8px;box-shadow:0 6px 24px rgba(22,24,35,.08);contain:layout style!important;overflow:visible!important;transform:none!important}
html.bdw-enabled .bili-dyn-list__item[data-bdw-hidden="true"]{display:none!important;width:0!important;height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;overflow:hidden!important;visibility:hidden!important}
html.bdw-enabled .bili-dyn-list__item:has(>.bili-dyn-item):not(:has(.bili-dyn-item__main)){display:none!important;width:0!important;height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;overflow:hidden!important;visibility:hidden!important}
html.bdw-enabled .bili-dyn-list__item>.bili-dyn-item,html.bdw-enabled .bili-dyn-item{display:block!important;position:relative!important;width:100%!important;max-width:100%!important;min-width:0!important;background:var(--bdw-card-bg)!important;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent)!important;border-radius:8px!important;box-sizing:border-box!important;padding:0!important;overflow:visible!important}
html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__main,html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__header,html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__body,html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__footer,html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__orig,html.bdw-enabled .bili-dyn-list__item .bili-dyn-content__orig,html.bdw-enabled .bili-dyn-list__item .bili-dyn-content__orig__major{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__body,html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__footer,html.bdw-enabled .bili-dyn-list__item .bili-dyn-item__orig,html.bdw-enabled .bili-dyn-list__item .bili-dyn-content__orig,html.bdw-enabled .bili-dyn-list__item .bili-dyn-content__orig__major,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-goods,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-article,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-reserve,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-live,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-vote{width:100%!important;max-width:100%!important;min-width:0!important;box-sizing:border-box!important;overflow:visible!important}
html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video__stat,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video__info,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video__body,html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video__desc{width:100%!important;max-width:100%!important;min-width:0!important}
html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video__stat{display:flex!important;flex-wrap:wrap!important;gap:6px 10px!important;justify-content:flex-start!important;overflow:hidden!important}
html.bdw-enabled .bili-dyn-list__item .bili-dyn-card-video__stat__item{min-width:0!important;max-width:100%!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;flex:0 1 auto!important}
html.bdw-enabled .bili-dyn-list__item .bili-dyn-content,html.bdw-enabled .bili-dyn-list__item .bili-dyn-title,html.bdw-enabled .bili-dyn-list__item .bili-dyn-content__forwards,html.bdw-enabled .bili-dyn-list__item .opus-module-content{min-width:0!important;max-width:100%!important;overflow-wrap:anywhere}
html.bdw-enabled .bili-dyn-list-tabs,html.bdw-enabled .bili-dyn-list-tabs__list,html.bdw-enabled .bili-dyn-my-info{background:var(--bdw-card-bg)!important;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent)!important;border-radius:8px!important;overflow:hidden}
html.bdw-enabled .bili-dyn-live-users{background:var(--bdw-card-bg)!important;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent)!important;border-radius:8px!important}
html.bdw-enabled .bili-dyn-live-users__body{display:block!important;visibility:visible!important;opacity:1!important;overflow:visible!important;background:transparent!important}
html.bdw-enabled .bili-dyn-live-users__body>*[data-bdw-live-hidden="true"]{display:none!important}
html.bdw-enabled .bili-dyn-list-tabs,html.bdw-enabled .bili-dyn-my-info,html.bdw-enabled .bili-dyn-live-users{box-shadow:0 6px 24px rgba(22,24,35,.08);border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)!important}
html.bdw-enabled .bili-rich-textarea__inner,html.bdw-enabled .bili-rich-textarea__inner.empty{background:var(--bdw-card-bg)!important;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent)!important;border-radius:8px!important}
html.bdw-enabled .bili-dyn-item{width:100%!important;max-width:100%!important}
html.bdw-enabled .bili-dyn-item__main,html.bdw-enabled .bili-dyn-item__body,html.bdw-enabled .bili-dyn-item__orig,html.bdw-enabled .bili-dyn-content__orig,html.bdw-enabled .bili-dyn-content__orig__major,html.bdw-enabled .bili-dyn-card-video,html.bdw-enabled .bili-dyn-card-goods,html.bdw-enabled .bili-dyn-card-article,html.bdw-enabled .bili-dyn-card-reserve,html.bdw-enabled .bili-dyn-card-live,html.bdw-enabled .bili-dyn-card-vote{background:transparent!important}
html.bdw-enabled.bdw-glass .bili-dyn-list__item>.bili-dyn-item,html.bdw-enabled.bdw-glass .bili-dyn-item,html.bdw-enabled.bdw-glass .bili-dyn-list-tabs,html.bdw-enabled.bdw-glass .bili-dyn-list-tabs__list,html.bdw-enabled.bdw-glass .bili-dyn-my-info,html.bdw-enabled.bdw-glass .bili-dyn-live-users,html.bdw-enabled.bdw-glass .bili-rich-textarea__inner,html.bdw-enabled.bdw-glass .bili-dyn-publishing.show{backdrop-filter:blur(var(--bdw-glass-blur));-webkit-backdrop-filter:blur(var(--bdw-glass-blur))}
html.bdw-enabled .bili-dyn-publishing{display:none;overflow:hidden;margin-bottom:20px;background:var(--bdw-card-bg);background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent);border-radius:8px}
html.bdw-enabled .bili-dyn-publishing.show{display:block;animation:bdwFadeIn .3s ease-in-out}
@keyframes bdwFadeIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
html.bdw-enabled .my-control-panel{margin:12px 0 0}
html.bdw-enabled .my-custom-btn{background:color-mix(in srgb,var(--bg1,#fff) 88%,transparent);color:var(--text1);border:1px solid var(--line_regular);padding:8px 12px;border-radius:6px;font-size:13px;cursor:pointer;margin-bottom:10px;font-weight:700;display:flex;align-items:center;justify-content:center;transition:background .2s ease,border-color .2s ease,color .2s ease,box-shadow .2s ease;width:100%;box-sizing:border-box;box-shadow:0 1px 3px rgba(0,0,0,.05)}
html.bdw-enabled .my-custom-btn:hover{background:var(--brand_blue);color:#fff;border-color:var(--brand_blue);box-shadow:0 2px 6px rgba(0,161,214,.3)}
.bdw-icon-svg{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;flex:none}
.bdw-live-pager{display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 10px 10px;background:transparent}
.bdw-live-page-btn{width:26px;height:26px;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);border-radius:50%;background:var(--bdw-card-bg);background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent);color:var(--text2,#61666d);cursor:pointer;display:flex;align-items:center;justify-content:center}
.bdw-live-page-btn:hover{color:var(--brand_blue,#00aeec);border-color:var(--brand_blue,#00aeec)}
.bdw-live-page-btn .bdw-icon-svg{width:14px;height:14px}
.bdw-live-dots{display:flex;align-items:center;justify-content:center;gap:6px;min-width:120px;flex-wrap:nowrap}
.bdw-live-dot{min-width:26px;height:24px;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);border-radius:6px;padding:0 6px;background:transparent;color:var(--text2,#61666d);cursor:pointer;font-size:12px;line-height:1;display:flex;align-items:center;justify-content:center}
.bdw-live-dot.is-active{background:var(--brand_blue,#00aeec);border-color:var(--brand_blue,#00aeec);color:#fff}
.bdw-settings-fab-zone{position:fixed;right:0;bottom:var(--bdw-floating-stack-bottom);z-index:2147483646;display:grid;gap:12px;width:var(--bdw-fab-size);pointer-events:auto;opacity:.35;transform:translateX(15%);transition:opacity .25s ease,transform .25s ease}
.bdw-settings-fab-zone:hover,.bdw-settings-fab-zone:has(.is-open){opacity:1;transform:translateX(0)}
.bdw-settings-fab,.bdw-top-fab{position:relative}
.bdw-fab-label{position:absolute;right:calc(100% + 12px);top:50%;transform:translateY(-50%);white-space:nowrap;padding:5px 10px;border-radius:6px;background:rgba(24,25,28,.82);color:#fff;font-size:12px;line-height:1.4;opacity:0;pointer-events:none;transition:opacity .2s ease .1s;box-shadow:0 4px 12px rgba(22,24,35,.2);z-index:1}
.bdw-settings-fab-zone:hover .bdw-fab-label{opacity:1}
.bdw-settings-fab,.bdw-top-fab{display:grid;place-items:center;width:var(--bdw-fab-size)!important;height:var(--bdw-fab-size)!important;min-width:0!important;min-height:0!important;max-width:var(--bdw-fab-size)!important;max-height:var(--bdw-fab-size)!important;padding:0!important;margin:0!important;box-sizing:border-box!important;flex:none!important;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);border-radius:50%;background:var(--bdw-card-bg);background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent);color:#00aeec;box-shadow:0 10px 30px rgba(22,24,35,.16);cursor:pointer;transition:transform .2s ease,background .2s ease,border-color .2s ease,box-shadow .2s ease,color .2s ease}
.bdw-settings-fab:hover,.bdw-top-fab:hover,.bdw-settings-fab.is-open{transform:translateY(-1px);border-color:var(--brand_blue,#00aeec);color:var(--brand_blue,#00aeec);box-shadow:0 14px 32px rgba(22,24,35,.18)}
.bdw-settings-fab .bdw-icon-svg,.bdw-top-fab .bdw-icon-svg{width:26px;height:26px}
.bdw-top-fab .bdw-icon-svg{width:26px;height:26px}
.bdw-settings-panel{position:fixed;left:50%;top:50%;z-index:2147483646;width:460px;max-width:calc(100vw - 32px);max-height:min(780px,calc(100vh - 40px));overflow:hidden;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);border-radius:8px;background:color-mix(in srgb,var(--bg1,#fff) 72%,transparent);color:var(--text1,#18191c);box-shadow:0 18px 52px rgba(22,24,35,.2);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);opacity:0;pointer-events:none;transform:translate(-50%,calc(-50% + 10px));transition:opacity .2s ease,transform .2s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;grid-template-rows:auto minmax(0,1fr)}
.bdw-settings-panel.is-open{opacity:1;pointer-events:auto;transform:translate(-50%,-50%)}
.bdw-settings-panel *{box-sizing:border-box;letter-spacing:0}
.bdw-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 16px 12px;border-bottom:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)}
.bdw-settings-title{display:grid;gap:3px}
.bdw-settings-title strong{font-size:16px;line-height:1.35}
.bdw-settings-title span,.bdw-toggle-copy small,.bdw-row-label small,.bdw-note{color:var(--text2,#61666d);font-size:12px;line-height:1.4}
.bdw-icon-btn{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:6px;background:color-mix(in srgb,var(--text1,#18191c) 8%,transparent);color:var(--text1,#18191c);cursor:pointer}
.bdw-icon-btn:hover{background:color-mix(in srgb,var(--text1,#18191c) 15%,transparent)}
.bdw-icon-btn .bdw-icon-svg{width:16px;height:16px}
.bdw-settings-body{display:grid;gap:14px;padding:14px 16px 16px;overflow:auto}
.bdw-row,.bdw-field{display:grid;gap:8px}
.bdw-row-label{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--text1,#18191c);font-size:13px;font-weight:700}
.bdw-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-bottom:2px;cursor:pointer}
.bdw-toggle-copy{display:grid;gap:3px}
.bdw-toggle-copy b{font-size:14px;line-height:1.35}
.bdw-toggle-row input{position:absolute;opacity:0;pointer-events:none}
.bdw-toggle-track{position:relative;flex:0 0 auto;width:44px;height:24px;border-radius:8px;background:#d8dce2;transition:background .2s ease}
.bdw-toggle-track:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:6px;background:#fff;box-shadow:0 2px 6px rgba(22,24,35,.18);transition:transform .2s ease}
.bdw-toggle-row input:checked+.bdw-toggle-track{background:#00aeec}
.bdw-toggle-row input:checked+.bdw-toggle-track:after{transform:translateX(20px)}
.bdw-input-line{display:grid;grid-template-columns:1fr auto;gap:8px}
.bdw-input-line.single{grid-template-columns:1fr}
.bdw-input,.bdw-select{width:100%;min-width:0;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);border-radius:6px;background:color-mix(in srgb,var(--bg3,#f1f2f3) 82%,transparent);color:var(--text1,#18191c);font-size:13px;outline:none}
.bdw-input{height:34px;padding:0 10px}
.bdw-select{height:34px;padding:0 8px}
.bdw-input:focus,.bdw-select:focus{border-color:#00aeec;box-shadow:0 0 0 3px rgba(0,174,236,.14)}
.bdw-button{height:34px;border:1px solid color-mix(in srgb,var(--brand_blue,#00aeec) 45%,transparent);border-radius:6px;padding:0 12px;background:transparent;color:var(--brand_blue,#00aeec);cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;transition:background .2s,border-color .2s}
.bdw-button:hover{background:color-mix(in srgb,var(--brand_blue,#00aeec) 10%,transparent);border-color:var(--brand_blue,#00aeec)}
.bdw-button.secondary{background:transparent;color:var(--text1,#18191c);border-color:color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)}
.bdw-button.secondary:hover{background:color-mix(in srgb,var(--text1,#18191c) 8%,transparent);border-color:color-mix(in srgb,var(--line_regular,#e3e5e7) 90%,transparent)}
.bdw-actions{display:grid;grid-template-columns:1fr;gap:8px}
.bdw-footer-actions{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px -16px -16px;padding:12px 16px 16px;background:color-mix(in srgb,var(--bg1,#fff) 72%,transparent);border-top:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.bdw-range-line{display:grid;grid-template-columns:1fr 48px;gap:10px;align-items:center}
.bdw-range{width:100%;accent-color:#00aeec}
.bdw-output{color:var(--text1,#18191c);font-size:12px;font-weight:700;text-align:right}
.bdw-note{line-height:1.55}
.bdw-top-tip{padding:8px 10px;border:1px solid rgba(0,174,236,.35);background:rgba(0,174,236,.07);border-radius:6px;color:#0089b3;font-weight:700}

/* Preserve the native main padding (88px avatar gutter) and native author header. */
/* 多图相册：强制流式网格，修复固定像素列宽导致的越界图片 */
html.bdw-enabled .bili-dyn-list__item .bili-album,html.bdw-enabled .bili-dyn-list__item .bili-album__preview{max-width:100%!important;min-width:0!important;box-sizing:border-box!important}
html.bdw-enabled .bili-dyn-list__item .bili-album__preview.grid3{width:100%!important;grid-template-columns:repeat(3,minmax(0,1fr))!important}
html.bdw-enabled .bili-dyn-list__item .bili-album__preview.grid2{width:100%!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}
html.bdw-enabled .bili-dyn-list__item .bili-album__preview.grid4{width:100%!important;grid-template-columns:repeat(4,minmax(0,1fr))!important}
html.bdw-enabled .bili-dyn-list__item .bili-album__preview:is(.grid2,.grid3,.grid4)>.bili-album__preview__picture{width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important;aspect-ratio:1;box-sizing:border-box!important}
html.bdw-enabled .bili-dyn-list__item .bili-album__preview__picture,html.bdw-enabled .bili-dyn-list__item .bili-album__preview__picture picture,html.bdw-enabled .bili-dyn-list__item .bili-album__preview__picture .b-img__inner{max-width:100%!important;min-width:0!important}
html.bdw-enabled .bili-dyn-list__item .bili-album__preview__picture__img{max-width:100%!important;object-fit:cover}
/* 图片查看器工具栏：防止按钮被挤压导致文字竖排 */
html.bdw-enabled .bili-album__watch__control{flex-wrap:nowrap!important;align-items:center!important}
html.bdw-enabled .bili-album__watch__control__option{flex:0 0 auto!important;min-width:76px!important;white-space:nowrap!important;writing-mode:horizontal-tb!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;height:32px!important;box-sizing:border-box!important;padding:0 12px!important}
html.bdw-enabled .bili-dyn-home--member main>.bili-dyn-list-tabs,html.bdw-enabled .bili-dyn-home--member main .bili-dyn-list>.bili-dyn-list-tabs{top:var(--bdw-header-offset)!important}
.bdw-settings-panel [hidden]{display:none!important}
.bdw-info{display:inline-grid;place-items:center;width:16px;height:16px;border:1px solid #00aeec;border-radius:50%;color:#00aeec;font:12px Georgia,serif;vertical-align:middle}
.bdw-toggle-row input:focus-visible+.bdw-toggle-track{outline:2px solid #00aeec;outline-offset:3px}
@media(max-width:900px){html.bdw-enabled .bili-dyn-home--member{padding:0 12px!important}html.bdw-enabled .bili-dyn-home--member aside.left{display:none!important}}
@media(max-width:640px){.bdw-settings-panel{width:calc(100vw - 24px);max-height:calc(100vh - 48px)}}
/* 评论区固定抽屉 + 收起评论项 */
.bdw-comment-pinned{position:fixed!important;margin:0!important;box-shadow:0 -8px 30px rgba(22,24,35,.16)!important;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)!important;border-radius:12px 12px 0 0!important;background:var(--bdw-card-bg)!important;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent)!important;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);max-height:calc(100vh - 16px);overflow-y:auto;z-index:2147483645!important}
.bdw-comment-collapse{display:block!important;width:100%;box-sizing:border-box;text-align:center;padding:10px 0;color:var(--text2,#61666d);font-size:13px;cursor:pointer;user-select:none;border-top:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 45%,transparent)}
.bdw-comment-collapse:hover{color:#00aeec;background:rgba(0,174,236,.06)}
/* UP主列表常驻：整个 section 吸顶固定 */
html.bdw-enabled.bdw-up-list-sticky .bili-dyn-home--member main>section:has(>.bili-dyn-up-list){position:sticky!important;top:var(--bdw-header-offset)!important;z-index:900!important;background:var(--bdw-card-bg)!important;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent)!important;box-shadow:0 6px 24px rgba(22,24,35,.08);border-bottom:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)}
html.bdw-enabled.bdw-up-list-sticky .bili-dyn-home--member main>.bili-dyn-list-tabs,html.bdw-enabled.bdw-up-list-sticky .bili-dyn-home--member main .bili-dyn-list>.bili-dyn-list-tabs{top:calc(var(--bdw-header-offset) + 131px)!important}
/* 查看更多评论浮窗：顶层遮罩 + 左右分栏卡片 */
.bdw-comment-popup-overlay{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:grid;place-items:center}
.bdw-comment-popup{position:relative;z-index:2147483647;width:min(1080px,calc(100vw - 48px));max-height:calc(100vh - 48px);display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);background:var(--bdw-card-bg);background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent);border-radius:12px;box-shadow:0 24px 64px rgba(22,24,35,.35);border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);overflow:hidden}
.bdw-comment-popup-close{position:absolute;top:12px;right:12px;z-index:2;display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:8px;background:color-mix(in srgb,var(--text1,#18191c) 8%,transparent);color:var(--text1,#18191c);cursor:pointer}
.bdw-comment-popup-close:hover{background:color-mix(in srgb,var(--text1,#18191c) 16%,transparent)}
.bdw-comment-popup-left{overflow-y:auto;max-height:calc(100vh - 48px);padding:48px 12px 12px;box-sizing:border-box;border-right:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)}
.bdw-comment-popup-left .bili-dyn-list__item{box-shadow:none!important;margin:0!important;background:transparent!important}
.bdw-comment-popup-left .bili-dyn-list__item>.bili-dyn-item,.bdw-comment-popup-left .bili-dyn-item{background:transparent!important}
/* 弹窗左栏为移动的原生卡片：完整保留组件与点击；底部动作行保留，评论按钮仅显示数量、点击无效果 */
.bdw-comment-popup-left{position:relative}
.bdw-comment-popup-left .bili-dyn-list__item{width:100%;margin:0}
.bdw-comment-popup-left .bili-dyn-action.comment{pointer-events:none!important;cursor:default}
/* 弹窗内滚动容器隐藏滚动条（保留滚动能力） */
.bdw-comment-popup-left::-webkit-scrollbar,.bdw-comment-popup-list::-webkit-scrollbar{width:0;height:0;display:none}
.bdw-comment-popup-left,.bdw-comment-popup-list{scrollbar-width:none;-ms-overflow-style:none}
.bdw-comment-popup-right{display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-height:0;max-height:calc(100vh - 48px);overflow:hidden}
.bdw-comment-popup-head{display:flex;align-items:center;gap:10px;padding:14px 16px;padding-right:48px;border-bottom:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);font-size:15px;font-weight:700;color:var(--text1,#18191c)}
.bdw-comment-popup-count{color:var(--text2,#61666d);font-weight:400;font-size:13px}
.bdw-comment-popup-sort{margin-left:auto;display:flex;gap:4px}
.bdw-comment-popup-sort button{border:0;background:transparent;color:var(--text2,#61666d);font-size:13px;cursor:pointer;padding:4px 10px;border-radius:6px}
.bdw-comment-popup-sort button.is-active{color:#00aeec;background:rgba(0,174,236,.08);font-weight:700}
.bdw-comment-popup-list{overflow-y:auto;padding:10px 16px;display:grid;gap:14px}
.bdw-comment-popup-item{display:flex;gap:10px}
.bdw-comment-popup-avatar{width:36px;height:36px;border-radius:50%;flex:none}
.bdw-comment-popup-item-main{min-width:0;flex:1}
.bdw-comment-popup-item-name{font-size:13px;color:var(--text2,#61666d);margin-bottom:3px}
.bdw-comment-popup-item-content{font-size:14px;line-height:1.55;color:var(--text1,#18191c);overflow-wrap:anywhere}
.bdw-comment-popup-item-meta{font-size:12px;color:var(--text3,#99a2aa);margin-top:4px;display:flex;gap:12px}
.bdw-comment-popup-loadmore{display:block;width:100%;border:0;background:transparent;text-align:center;padding:10px;color:var(--text2,#61666d);font-size:13px;cursor:pointer;border-top:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 45%,transparent)}
.bdw-comment-popup-loadmore:hover{color:#00aeec}
.bdw-comment-popup-input-wrap{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)}
.bdw-comment-popup-input{flex:1;min-width:0;height:36px;border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);border-radius:18px;padding:0 14px;font-size:13px;outline:none;background:color-mix(in srgb,var(--bg3,#f1f2f3) 82%,transparent);color:var(--text1,#18191c);box-sizing:border-box;transition:border-color .2s}
.bdw-comment-popup-input::placeholder{color:var(--text3,#99a2aa)}
.bdw-comment-popup-input:focus{border-color:var(--brand_blue,#00aeec)}
.bdw-comment-popup-send{height:36px;border:0;border-radius:18px;padding:0 20px;background:var(--brand_blue,#00aeec);color:#fff;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s}
.bdw-comment-popup-send:hover{background:#0098d8}
.bdw-comment-popup-send:disabled{opacity:.6;cursor:default}
.bdw-comment-popup-empty{text-align:center;color:var(--text3,#99a2aa);padding:40px 0;font-size:13px}
@media(max-width:720px){.bdw-comment-popup{grid-template-columns:1fr;grid-template-rows:minmax(0,42vh) minmax(0,1fr);max-height:calc(100vh - 24px)}.bdw-comment-popup-left{max-height:none;border-right:0;border-bottom:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent)}.bdw-comment-popup-right{max-height:none}}
/* 评论隐藏挂载（点击/悬停读取 oid 时避免闪烁） */
html.bdw-enabled .bili-dyn-item.bdw-comment-read-mode .bili-comment-container{display:none!important}
/* 快速查看评论浮窗 */
.bdw-quickview{position:fixed;z-index:2147483646;width:min(340px,calc(100vw - 24px));max-height:min(440px,60vh);background:var(--bdw-card-bg);background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent);border-radius:10px;box-shadow:0 8px 32px rgba(22,24,35,.22);border:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 72%,transparent);display:flex;flex-direction:column;overflow:hidden}
.bdw-quickview-head{display:flex;align-items:center;gap:6px;padding:8px 12px;font-size:13px;font-weight:700;color:var(--text1,#18191c);border-bottom:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 55%,transparent)}
.bdw-quickview-loading{margin-left:auto;color:var(--text3,#99a2aa);font-weight:400;font-size:12px}
.bdw-quickview-list{overflow-y:auto;overscroll-behavior:contain;padding:8px 12px;display:grid;gap:10px;max-height:calc(60vh - 36px)}
.bdw-quickview-empty{text-align:center;color:var(--text3,#99a2aa);padding:24px 0;font-size:12px}
.bdw-quickview-item{display:flex;gap:8px}
.bdw-quickview-item .bdw-quickview-avatar{width:28px;height:28px;border-radius:50%;flex:none}
.bdw-quickview-item-main{min-width:0;flex:1}
.bdw-quickview-item-name{font-size:12px;color:var(--text2,#61666d);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bdw-quickview-item-content{font-size:13px;line-height:1.5;color:var(--text1,#18191c);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bdw-quickview-item-meta{font-size:11px;color:var(--text3,#99a2aa);margin-top:3px;display:flex;gap:10px}
/* UP主列表 item 卡片化 + 圆角 */
html.bdw-enabled .bili-dyn-up-list__content .bili-dyn-up-list__item{margin:0 4px;padding:6px 8px;border-radius:8px;background:color-mix(in srgb,var(--bg1,#fff) var(--bdw-item-opacity-percent),transparent);box-shadow:0 1px 4px rgba(22,24,35,.06);transition:background .15s,box-shadow .15s}
html.bdw-enabled .bili-dyn-up-list__content .bili-dyn-up-list__item:hover{box-shadow:0 2px 8px rgba(22,24,35,.12)}
html.bdw-enabled .bili-dyn-up-list__content .bili-dyn-up-list__item.active{background:color-mix(in srgb,#e3f5fd var(--bdw-item-opacity-percent),transparent);box-shadow:0 0 0 1px rgba(0,174,236,.4)}
html.bdw-enabled.bdw-up-list-sticky .bili-dyn-home--member main>section:has(>.bili-dyn-up-list){border-radius:8px!important;border-bottom:none!important;margin-bottom:8px}
    `;

    addStyle(css);

    function $(selector, root = document) { return root.querySelector(selector); }
    function $$(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

    function getIconSvg(name) {
        const paths = {
            settings: '<circle cx="12" cy="12" r="3.2"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82 1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
            arrowUp: '<path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path>',
            close: '<path d="M6 6 18 18"></path><path d="M18 6 6 18"></path>',
            chevronLeft: '<path d="m15 18-6-6 6-6"></path>',
            chevronRight: '<path d="m9 18 6-6-6-6"></path>'
        };

        return `<svg class="bdw-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
    }

    function readStoredSettings() {
        try {
            const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, null) : localStorage.getItem(STORAGE_KEY);
            return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        } catch (error) {
            console.warn('[Bilibili 动态瀑布流] 读取设置失败，已使用默认值。', error);
            return {};
        }
    }

    function saveSettings() {
        try {
            const payload = JSON.stringify(settings);
            if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, payload);
            else localStorage.setItem(STORAGE_KEY, payload);
        } catch (error) {
            console.warn('[Bilibili 动态瀑布流] 保存设置失败。', error);
        }
    }

    function normalizeSettings(value) {
        const merged = Object.assign({}, DEFAULT_SETTINGS, value || {});
        const columns = String(merged.columns);
        const wallpaper = normalizeWallpaper(merged.wallpaper);
        return {
            enabled: Boolean(merged.enabled),
            wallpaper,
            wallpaperEnabled: Boolean(merged.wallpaperEnabled),
            livePaginationEnabled: Boolean(merged.livePaginationEnabled),
            columns: ['1', '2', '3'].includes(columns) ? columns : DEFAULT_SETTINGS.columns,
            itemOpacity: clamp(Number(merged.itemOpacity), 0.35, 1),
            itemOpacityEnabled: Boolean(merged.itemOpacityEnabled),
            glassEnabled: Boolean(merged.glassEnabled),
            glassBlur: Math.round(clamp(Number(merged.glassBlur), 0, 30)),
            upListSticky: Boolean(merged.upListSticky),
            quickComment: Boolean(merged.quickComment)
        };
    }

    function normalizeWallpaper(value) {
        if (typeof value !== 'string') return '';
        let wallpaper = value.trim();
        const cssUrlMatch = wallpaper.match(/^url\((.*)\)$/i);
        if (cssUrlMatch) wallpaper = cssUrlMatch[1].trim().replace(/^['"]|['"]$/g, '');
        if (wallpaper.startsWith('blob:') || wallpaper.startsWith('data:')) return '';
        return wallpaper.length > 2048 ? '' : wallpaper;
    }

    function clamp(value, min, max) {
        return Number.isNaN(value) ? min : Math.min(max, Math.max(min, value));
    }

    function setSettings(patch) {
        settings = normalizeSettings(Object.assign({}, settings, patch));
        saveSettings();
        applySettings();
    }

    function applySettings() {
        const root = document.documentElement;
        const activeWallpaper = settings.wallpaperEnabled ? settings.wallpaper : '';
        const hasWallpaper = Boolean(activeWallpaper);
        root.classList.toggle('bdw-enabled', settings.enabled);
        root.classList.toggle('bdw-has-background', settings.enabled && hasWallpaper);
        root.classList.toggle('bdw-has-wallpaper', settings.enabled && hasWallpaper);
        root.classList.toggle('bdw-bg-image', settings.enabled && hasWallpaper);
        root.classList.toggle('bdw-glass', settings.enabled && settings.glassEnabled && settings.wallpaperEnabled);
        root.classList.toggle('bdw-up-list-sticky', settings.enabled && settings.upListSticky);
        root.style.setProperty('--bdw-wallpaper', hasWallpaper ? `url(${JSON.stringify(activeWallpaper)})` : 'none');
        root.style.removeProperty('--bew-homepage-bg');
        updateResponsiveColumns();
        const effectiveOpacity = settings.itemOpacityEnabled ? settings.itemOpacity : 1;
        root.style.setProperty('--bdw-item-opacity-percent', `${Math.round(effectiveOpacity * 100)}%`);
        root.style.setProperty('--bdw-card-bg', `color-mix(in srgb,var(--bg1,#fff) ${Math.round(effectiveOpacity * 100)}%,transparent)`);
        root.style.setProperty('--bdw-glass-blur', `${settings.glassBlur}px`);
        applyBiliBackground();
        updateSettingsControls();
        if (settings.enabled) scheduleMainLoop();
        else {
            restoreBiliBackground();
            restoreOriginalDom();
        }
    }

    function applyBiliBackground() {
        if (!document.body) return;

        const body = document.body;
        const activeWallpaper = settings.wallpaperEnabled ? settings.wallpaper : '';
        const hasWallpaper = settings.enabled && Boolean(activeWallpaper);

        const app = document.getElementById('app');

        body.style.removeProperty('--bew-homepage-bg');
        app?.style.removeProperty('--bew-homepage-bg');

        const bg = getBiliBackgroundNode();
        if (!bg) return;

        bg.dataset.bdwBgApplied = 'true';
        bg.style.setProperty('background-size', 'cover', 'important');
        bg.style.setProperty('background-position', 'center', 'important');
        bg.style.setProperty('background-repeat', 'no-repeat', 'important');
        bg.style.setProperty('background-attachment', 'fixed', 'important');

        if (hasWallpaper) {
            bg.style.setProperty('display', 'block', 'important');
            bg.style.removeProperty('background-color');
            bg.style.setProperty('background-image', `url(${JSON.stringify(activeWallpaper)})`, 'important');
            return;
        }

        restoreBiliBackground();
    }

    function updateResponsiveColumns() {
        const root = document.documentElement;
        let columns = Number.parseInt(settings.columns, 10);
        if (Number.isNaN(columns)) columns = Number.parseInt(DEFAULT_SETTINGS.columns, 10);
        columns = Math.round(clamp(columns, 1, 3));
        const list = $('.bili-dyn-list__items');
        const width = list?.getBoundingClientRect().width || window.innerWidth;
        const gap = list ? Number.parseFloat(getComputedStyle(list).columnGap) || 16 : 16;
        columns = Math.min(columns, Math.max(1, Math.floor((width + gap) / (340 + gap))));
        root.style.setProperty('--bdw-columns', String(columns));
        root.style.setProperty('--bdw-header-offset', `${getHeaderOffset() + 12}px`);
    }

    function restoreBiliBackground() {
        document.documentElement.style.removeProperty('--bew-homepage-bg');
        document.body?.style.removeProperty('--bew-homepage-bg');
        document.getElementById('app')?.style.removeProperty('--bew-homepage-bg');

        const bg = getBiliBackgroundNode();
        if (!bg || bg.dataset.bdwBgApplied !== 'true') return;

        [
            'background-color',
            'background-image',
            'background-size',
            'background-position',
            'background-repeat',
            'background-attachment',
            'display'
        ].forEach(prop => bg.style.removeProperty(prop));
        delete bg.dataset.bdwBgApplied;
    }

    function getBiliBackgroundNode() {
        const appBg = document.evaluate('//*[@id="app"]/div[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (appBg instanceof HTMLElement) return appBg;

        const oldXpathNode = document.evaluate('/html/body/div[4]/div[2]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (oldXpathNode instanceof HTMLElement && oldXpathNode.classList.contains('bg')) return oldXpathNode;

        return document.querySelector('#app>div:nth-child(2)')
            || document.querySelector('#app>.bg')
            || document.querySelector('body>div:nth-of-type(4)>div:nth-of-type(2).bg')
            || document.querySelector('.bg[data-bdw-bg-applied="true"]')
            || document.querySelector('body .bg');
    }

    function addStyle(styleText) {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(styleText);
            return;
        }
        const style = document.createElement('style');
        style.textContent = styleText;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureWallpaperLayer() {
        if (!document.body || $('#bdw-wallpaper-layer')) return;
        const layer = document.createElement('div');
        layer.id = 'bdw-wallpaper-layer';
        layer.innerHTML = '<div class="bdw-wallpaper-image"></div><div class="bdw-wallpaper-overlay"></div>';
        document.body.prepend(layer);
    }

    function ensureSettingsUi() {
        if (!document.body) return;
        const existingPanel = $('.bdw-settings-panel');
        if ($('.bdw-settings-fab') && existingPanel?.dataset.bdwVersion === SCRIPT_VERSION) return;
        $$('.bdw-settings-fab-zone,.bdw-settings-panel').forEach(node => node.remove());

        const fabZone = document.createElement('div');
        fabZone.className = 'bdw-settings-fab-zone';
        const topButton = document.createElement('button');
        topButton.type = 'button';
        topButton.className = 'bdw-top-fab';
        topButton.setAttribute('aria-label', '返回顶部');
        topButton.innerHTML = getIconSvg('arrowUp') + '<span class="bdw-fab-label">返回顶部</span>';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'bdw-settings-fab';
        button.setAttribute('aria-label', '打开瀑布流设置');
        button.innerHTML = getIconSvg('settings') + '<span class="bdw-fab-label">瀑布流设置</span>';
        fabZone.append(topButton, button);

        const panel = document.createElement('section');
        panel.className = 'bdw-settings-panel';
        panel.dataset.bdwVersion = SCRIPT_VERSION;
        panel.setAttribute('aria-label', 'Bilibili 动态瀑布流设置');
        panel.setAttribute('aria-hidden', 'true');
        panel.innerHTML = `
            <div class="bdw-settings-head">
                <div class="bdw-settings-title"><strong>瀑布流设置</strong><span>改完立即生效，刷新后继续保留。</span></div>
                <button class="bdw-icon-btn" type="button" data-bdw-action="close" aria-label="关闭设置"></button>
            </div>
            <div class="bdw-settings-body">
                <div class="bdw-note bdw-top-tip">建议用 ctrl+减号 控制页面大小至 80 左右</div>
                <label class="bdw-toggle-row"><span class="bdw-toggle-copy"><b>整体开关</b><small>关闭后停止套用瀑布流布局。</small></span><input type="checkbox" data-bdw-control="enabled"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <label class="bdw-toggle-row"><span class="bdw-toggle-copy"><b>背景壁纸 <span class="bdw-info" title="测试功能：部分站内主题可能不兼容" aria-label="测试功能：部分站内主题可能不兼容">i</span></b><small>测试功能，打开后可输入图片链接。</small></span><input type="checkbox" data-bdw-control="wallpaper-enabled"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <div class="bdw-field bdw-wallpaper-field" hidden>
                    <div class="bdw-row-label"><span>背景壁纸</span><small>留空时使用站内默认背景</small></div>
                    <div class="bdw-input-line single"><input class="bdw-input" type="url" data-bdw-control="wallpaper" aria-label="背景壁纸链接" aria-describedby="bdw-wallpaper-tip" placeholder="粘贴图片链接" disabled></div>
                    <div class="bdw-note" id="bdw-wallpaper-tip">小提示：图片壁纸请使用普通 http/https 图片链接，不填也能保存当前设置。</div>
                    <div class="bdw-actions"><button class="bdw-button secondary" type="button" data-bdw-action="clear-wallpaper">清空壁纸</button></div>
                    <div class="bdw-note" data-bdw-output="wallpaper-status">图片壁纸只支持链接；留空也可以直接应用保存。</div>
                </div>
                <label class="bdw-toggle-row"><span class="bdw-toggle-copy"><b>直播分页</b><small>每页显示 5 位，关闭后显示全部直播。</small></span><input type="checkbox" data-bdw-control="live-pagination"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <label class="bdw-toggle-row"><span class="bdw-toggle-copy"><b>UP主列表常驻</b><small>顶栏下方固定显示，不随滚动隐藏。</small></span><input type="checkbox" data-bdw-control="up-list-sticky"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <label class="bdw-toggle-row"><span class="bdw-toggle-copy"><b>快速查看评论</b><small>点击评论按钮弹出评论预览，再点一次打开全部评论；关闭后点一次直接打开全部评论。</small></span><input type="checkbox" data-bdw-control="quick-comment"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <div class="bdw-row"><label class="bdw-row-label" for="bdw-columns"><span>页面栏数</span><small>最多 1-3 列，随窗口自适应</small></label><select class="bdw-select" id="bdw-columns" data-bdw-control="columns"><option value="1">1 列</option><option value="2">2 列</option><option value="3">3 列</option></select></div>
                <label class="bdw-toggle-row"><span class="bdw-toggle-copy"><b>item 背景透明度</b><small>关闭后卡片保持不透明。</small></span><input type="checkbox" data-bdw-control="opacity-enabled"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <div class="bdw-row bdw-opacity-field"><div class="bdw-row-label"><span>item 背景透明度</span><small data-bdw-output="opacity">90%</small></div><div class="bdw-range-line"><input class="bdw-range" type="range" min="35" max="100" step="1" data-bdw-control="opacity"><output class="bdw-output" data-bdw-output="opacity-short">90%</output></div></div>
                <label class="bdw-toggle-row bdw-glass-toggle-row"><span class="bdw-toggle-copy"><b>毛玻璃效果</b><small>壁纸与卡片会一起变柔和。</small></span><input type="checkbox" data-bdw-control="glass"><span class="bdw-toggle-track" aria-hidden="true"></span></label>
                <div class="bdw-row bdw-blur-field"><div class="bdw-row-label"><span>毛玻璃强度</span><small data-bdw-output="blur">14px</small></div><div class="bdw-range-line"><input class="bdw-range" type="range" min="0" max="30" step="1" data-bdw-control="blur"><output class="bdw-output" data-bdw-output="blur-short">14px</output></div></div>
                <div class="bdw-footer-actions"><button class="bdw-button secondary bdw-reset-button" type="button" data-bdw-action="reset">恢复默认</button><button class="bdw-button" type="button" data-bdw-action="apply-all">应用</button></div>
            </div>`;
        $('[data-bdw-action="close"]', panel).innerHTML = getIconSvg('close');

        document.body.append(fabZone, panel);
        topButton.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        button.addEventListener('click', () => setPanelOpen(!panel.classList.contains('is-open')));
        panel.addEventListener('click', handleSettingsClick);
        panel.addEventListener('input', handleSettingsInput);
        panel.addEventListener('change', handleSettingsChange);
        $('[data-bdw-control="wallpaper"]', panel).addEventListener('keydown', event => {
            if (event.key === 'Enter') applyWallpaperFromInput();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setPanelOpen(false);
        });
        if (document.documentElement.dataset.bdwCommentAnchorListener !== 'true') {
            document.addEventListener('click', handleCommentOpenClick, true);
            document.documentElement.dataset.bdwCommentAnchorListener = 'true';
        }
        updateSettingsControls();
    }

    function setPanelOpen(open) {
        const button = $('.bdw-settings-fab');
        const panel = $('.bdw-settings-panel');
        if (!button || !panel) return;
        button.classList.toggle('is-open', open);
        panel.classList.toggle('is-open', open);
        panel.setAttribute('aria-hidden', String(!open));
    }

    function handleSettingsClick(event) {
        const target = event.target.closest('[data-bdw-action]');
        if (!target) return;
        const action = target.dataset.bdwAction;
        if (action === 'close') setPanelOpen(false);
        if (action === 'cancel') setPanelOpen(false);
        if (action === 'apply-all') applyPendingSettings();
        if (action === 'clear-wallpaper') {
            setSettings({ wallpaper: '' });
            setWallpaperStatus('图片壁纸已清空，当前使用站内默认背景。');
        }
        if (action === 'reset') {
            setSettings(DEFAULT_SETTINGS);
            setWallpaperStatus('已恢复默认设置。');
        }
    }

    function handleSettingsInput(event) {
        const control = event.target.dataset.bdwControl;
        if (control === 'opacity') setSettings({ itemOpacity: Number(event.target.value) / 100 });
        if (control === 'blur') setSettings({ glassBlur: Number(event.target.value) });
    }

    function handleSettingsChange(event) {
        const control = event.target.dataset.bdwControl;
        if (control === 'wallpaper-enabled') setSettings({ wallpaperEnabled: event.target.checked });
        if (control === 'live-pagination') setSettings({ livePaginationEnabled: event.target.checked });
        if (control === 'enabled') setSettings({ enabled: event.target.checked });
        if (control === 'columns') setSettings({ columns: event.target.value });
        if (control === 'glass') setSettings({ glassEnabled: event.target.checked });
        if (control === 'opacity-enabled') setSettings({ itemOpacityEnabled: event.target.checked });
        if (control === 'up-list-sticky') setSettings({ upListSticky: event.target.checked });
        if (control === 'quick-comment') setSettings({ quickComment: event.target.checked });
    }

    function applyPendingSettings() {
        if (!settings.wallpaperEnabled) { saveSettings(); return; }
        const wallpaperInput = $('[data-bdw-control="wallpaper"]');
        const patch = {};
        const inputValue = wallpaperInput?.value.trim() || '';
        const wallpaper = inputValue ? normalizeWallpaper(inputValue) : '';

        if (inputValue && !wallpaper) {
            alert('图片链接太长，或不是可长期保存的链接。建议使用普通 http/https 图片链接。');
            updateSettingsControls();
            return;
        }

        patch.wallpaper = wallpaper;
        setSettings(patch);
        setWallpaperStatus(wallpaper ? '图片链接已应用，并会在刷新后保留。' : '未填写图片链接，已保存并继续使用站内默认背景。');
    }

    function applyWallpaperFromInput() {
        if (!settings.wallpaperEnabled) return;
        const input = $('[data-bdw-control="wallpaper"]');
        if (!input) return;

        const wallpaper = normalizeWallpaper(input.value);
        if (input.value.trim() && !wallpaper) {
            alert('图片链接太长，或不是可长期保存的链接。建议使用普通 http/https 图片链接。');
            updateSettingsControls();
            return;
        }

        setSettings({ wallpaper });
        setWallpaperStatus(wallpaper ? '图片链接已应用，并会在刷新后保留。' : '未填写图片链接，已保存并继续使用站内默认背景。');
    }

    function setWallpaperStatus(text) {
        const status = $('[data-bdw-output="wallpaper-status"]');
        if (status) status.textContent = text;
    }

    function updateSettingsControls() {
        const panel = $('.bdw-settings-panel');
        if (!panel) return;
        const opacityText = `${Math.round(settings.itemOpacity * 100)}%`;
        const blurText = `${settings.glassBlur}px`;
        const controls = {
            enabled: $('[data-bdw-control="enabled"]', panel),
            wallpaper: $('[data-bdw-control="wallpaper"]', panel),
            columns: $('[data-bdw-control="columns"]', panel),
            opacity: $('[data-bdw-control="opacity"]', panel),
            glass: $('[data-bdw-control="glass"]', panel),
            blur: $('[data-bdw-control="blur"]', panel)
        };
        $('[data-bdw-control="wallpaper-enabled"]', panel).checked = settings.wallpaperEnabled;
        $('[data-bdw-control="live-pagination"]', panel).checked = settings.livePaginationEnabled;
        $('[data-bdw-control="up-list-sticky"]', panel).checked = settings.upListSticky;
        $('[data-bdw-control="quick-comment"]', panel).checked = settings.quickComment;
        $('[data-bdw-control="opacity-enabled"]', panel).checked = settings.itemOpacityEnabled;
        $('.bdw-wallpaper-field', panel).hidden = !settings.wallpaperEnabled;
        $('.bdw-glass-toggle-row', panel).hidden = !settings.wallpaperEnabled;
        $('.bdw-blur-field', panel).hidden = !settings.glassEnabled;
        $('.bdw-opacity-field', panel).hidden = !settings.itemOpacityEnabled;
        controls.wallpaper.disabled = !settings.wallpaperEnabled;
        if (controls.enabled) controls.enabled.checked = settings.enabled;
        if (controls.wallpaper && document.activeElement !== controls.wallpaper) controls.wallpaper.value = settings.wallpaper;
        if (controls.columns) controls.columns.value = settings.columns;
        if (controls.opacity) controls.opacity.value = String(Math.round(settings.itemOpacity * 100));
        if (controls.glass) controls.glass.checked = settings.glassEnabled;
        if (controls.blur) controls.blur.value = String(settings.glassBlur);
        $$('[data-bdw-output="opacity"],[data-bdw-output="opacity-short"]', panel).forEach(node => { node.textContent = opacityText; });
        $$('[data-bdw-output="blur"],[data-bdw-output="blur-short"]', panel).forEach(node => { node.textContent = blurText; });
    }

    function filterInvalidItems() {
        seenDynamicKeys.clear();
        // 只处理动态流容器内的卡片，排除弹窗/快速查看窗等脚本 UI 子树（避免克隆卡片被误判为重复而隐藏）
        $$('.bili-dyn-list__items .bili-dyn-list__item').filter(item => !item.closest('.bdw-comment-popup,.bdw-quickview,.bdw-comment-pinned')).forEach(item => {
            const inner = $('.bili-dyn-item', item);
            const hasMain = Boolean(inner?.querySelector('.bili-dyn-item__main'));
            const textLength = getCleanText(inner).length;

            if (!hasMain && textLength < 5) {
                item.dataset.bdwKey = '';
                hideDynamicItem(item, 'empty');
                return;
            }

            const key = getDynamicItemKey(item);
            item.dataset.bdwKey = key || '';
            if (!key) {
                showDynamicItem(item);
                return;
            }

            const firstItem = seenDynamicKeys.get(key);
            if (firstItem && firstItem !== item && isDynamicItemUsable(firstItem)) {
                hideDynamicItem(item, 'duplicate');
                return;
            }

            seenDynamicKeys.set(key, item);
            showDynamicItem(item);
        });
    }

    function hideDynamicItem(item, reason) {
        item.dataset.bdwHidden = 'true';
        item.dataset.bdwHiddenReason = reason;
        item.setAttribute('aria-hidden', 'true');
        item.style.setProperty('display', 'none', 'important');
    }

    function showDynamicItem(item) {
        item.style.removeProperty('display');
        item.removeAttribute('aria-hidden');
        delete item.dataset.bdwHidden;
        delete item.dataset.bdwHiddenReason;
    }

    function getCleanText(node) {
        return (node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getDynamicItemKey(item) {
        const datasetKey = getDynamicDatasetKey(item);
        if (datasetKey) return datasetKey;

        const linkKey = getDynamicLinkKey(item);
        if (linkKey) return linkKey;

        const mediaKey = getDynamicMediaKey(item);
        if (mediaKey) return mediaKey;

        return getDynamicTextFallbackKey(item);
    }

    function isDynamicItemUsable(item) {
        if (!item?.isConnected) return false;
        if (item.dataset.bdwHiddenReason === 'empty') return false;
        const style = window.getComputedStyle(item);
        return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function getDynamicDatasetKey(item) {
        const ownId = item.dataset.id
            || item.dataset.dynId
            || item.dataset.dynamicId
            || item.dataset.did
            || item.getAttribute('data-id')
            || item.getAttribute('data-dyn-id')
            || item.getAttribute('data-dynamic-id')
            || item.getAttribute('data-did')
            || item.getAttribute('biliscope-dynamicid')
            || item.getAttribute('data-rid')
            || item.getAttribute('data-oid')
            || item.getAttribute('data-bvid')
            || item.getAttribute('data-avid');
        if (ownId) return `data:${ownId}`;

        const idNode = item.querySelector('[data-did],[data-dyn-id],[data-dynamic-id],[data-id],[biliscope-dynamicid],[biliscope-vid],[data-rid],[data-oid],[data-bvid],[data-avid],[data-roomid]');
        const nestedId = idNode?.getAttribute('data-did')
            || idNode?.getAttribute('data-dyn-id')
            || idNode?.getAttribute('data-dynamic-id')
            || idNode?.getAttribute('data-id')
            || idNode?.getAttribute('biliscope-dynamicid')
            || idNode?.getAttribute('biliscope-vid')
            || idNode?.getAttribute('data-rid')
            || idNode?.getAttribute('data-oid')
            || idNode?.getAttribute('data-bvid')
            || idNode?.getAttribute('data-avid')
            || idNode?.getAttribute('data-roomid');
        return nestedId ? `nested:${nestedId}` : '';
    }

    function getDynamicLinkKey(item) {
        const links = Array.from(item.querySelectorAll('a[href]'));
        for (const link of links) {
            const href = link.getAttribute('href') || '';
            const match = href.match(/(?:opus\/|t\.bilibili\.com\/)(\d{6,})|(?:video\/)(BV[0-9A-Za-z]+)|(?:live\.bilibili\.com\/)(\d+)|(?:bangumi\/play\/)(ep\d+|ss\d+)/i);
            if (match) return `link:${match[1] || match[2] || match[3] || match[4]}`;
        }
        return '';
    }

    function getDynamicMediaKey(item) {
        const mediaNode = item.querySelector('img[src],source[srcset],video[src],[poster],[data-src]');
        const mediaValue = mediaNode?.getAttribute('src')
            || mediaNode?.getAttribute('srcset')
            || mediaNode?.getAttribute('poster')
            || mediaNode?.getAttribute('data-src')
            || '';
        const normalizedMedia = normalizeMediaValue(mediaValue);
        if (normalizedMedia) return `media:${normalizedMedia}`;

        const reserveLink = item.querySelector('.bili-dyn-card-reserve a[href],.bili-dyn-card-live a[href],.bili-dyn-card-video a[href]');
        const reserveHref = normalizeHref(reserveLink?.getAttribute('href') || '');
        return reserveHref ? `media-link:${reserveHref}` : '';
    }

    function getDynamicTextFallbackKey(item) {
        const author = normalizeDynamicText(getCleanText($('.bili-dyn-title__text,.bili-dyn-title__text--author,.opus-module-author__name', item)));
        const body = normalizeDynamicText(
            getCleanText($('.bili-dyn-item__body', item))
            || getCleanText($('.bili-dyn-content', item))
            || getCleanText($('.dyn-card-opus', item))
            || getCleanText($('.opus-module-content', item))
        );
        let text = [author, body].filter(Boolean).join(' ');

        if (text.length < 20) {
            const main = $('.bili-dyn-item__main', item);
            const clone = main?.cloneNode(true);
            clone?.querySelectorAll('.bili-dyn-item__avatar,.bili-dyn-item__footer,.bili-dyn-item__more,.bili-dyn-item__panel,.bili-dyn-action,.bili-dyn-card-video__stat,.bili-dyn-card-live__stat,.bili-dyn-card-reserve__desc,.bili-dyn-up-list,.bili-dyn-item__interaction').forEach(node => node.remove());
            text = normalizeDynamicText(getCleanText(clone || item));
        }

        if (text.length < 20) return '';
        return `text:${text.slice(0, 260)}`;
    }

    function normalizeDynamicText(text) {
        return (text || '')
            .replace(/\b\d+\s*(分钟前|小时前|天前|秒前)\b/g, ' ')
            .replace(/\b(今天|昨天|刚刚)\b/g, ' ')
            .replace(/\b\d+(?:\.\d+)?\s*(万|亿)?\b/g, match => /^\d{5,}$/.test(match.replace(/\D/g, '')) ? ' ' : match)
            .replace(/\b(展开|收起|关注|已关注|预约|直播中|投稿了视频|发布了动态视频|转发|评论|点赞|播放|弹幕|阅读|浏览)\b/g, ' ')
            .replace(/[|·•]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeMediaValue(value) {
        if (!value) return '';
        const first = String(value).split(',')[0].trim().split(/\s+/)[0];
        return first
            .replace(/^https?:/, '')
            .replace(/@[\w.-]+/g, '')
            .replace(/\?.*$/, '')
            .trim();
    }

    function normalizeHref(value) {
        if (!value) return '';
        return String(value)
            .replace(/^https?:\/\/[^/]+/i, '')
            .replace(/\?.*$/, '')
            .replace(/#.*$/, '')
            .trim();
    }

    function togglePublishing() {
        const pubBox = $('.bili-dyn-publishing');
        if (!pubBox) return;
        pubBox.classList.toggle('show');
        if (pubBox.classList.contains('show')) {
            setTimeout(() => pubBox.querySelector('.bili-rich-textarea__inner')?.focus(), 100);
        }
    }

    function mainLoop() {
        if (!settings.enabled) {
            restoreBiliBackground();
            restoreOriginalDom();
            return;
        }

        runLoopTask('background', applyBiliBackground);
        const sidebar = $('aside.left');
        runLoopTask('write-panel', () => {
            if (sidebar) ensureSideControlPanel(sidebar);
        });
        runLoopTask('live-pagination', updateLiveUsersPagination);
        runLoopTask('comment-pin', syncCommentPinning);
        queueDynamicFilter(false);
    }

    function runLoopTask(name, task) {
        try {
            task();
        } catch (error) {
            console.warn(`[BDW] ${name} failed`, error);
        }
    }

    function queueDynamicFilter(force) {
        if (force) lastDynamicSignature = '';
        if (dynamicFilterScheduled) return;
        dynamicFilterScheduled = true;
        requestAnimationFrame(() => {
            dynamicFilterScheduled = false;
            runLoopTask('dynamic-filter', () => {
                filterInvalidItemsIfNeeded(force);
            });
        });
    }

    function filterInvalidItemsIfNeeded(force) {
        const items = $$('.bili-dyn-list__item');
        const signature = getDynamicListSignature(items);
        if (!force && signature && signature === lastDynamicSignature) return;
        lastDynamicSignature = signature;
        filterInvalidItems();
    }

    function getDynamicListSignature(items) {
        return items.slice(0, 18).map(item => {
            return item.getAttribute('data-id')
                || item.getAttribute('data-dyn-id')
                || item.getAttribute('data-dynamic-id')
                || item.getAttribute('data-did')
                || item.querySelector('a[href]')?.getAttribute('href')
                || getCleanText(item).slice(0, 48);
        }).join('||') + `::${items.length}`;
    }

    function resetDynamicItemState() {
        $$('.bili-dyn-list__item').forEach(item => {
            item.style.removeProperty('display');
            item.removeAttribute('aria-hidden');
            delete item.dataset.bdwHidden;
            delete item.dataset.bdwHiddenReason;
            delete item.dataset.bdwKey;
        });
        seenDynamicKeys.clear();
        lastDynamicSignature = '';
    }

    function handleDynamicSourceClick(event) {
        if (!event.target.closest?.('.bili-dyn-up-list__item,.bili-dyn-list-tabs__item,.bili-dyn-list-tabs__list')) return;
        scheduleMainLoop(true);
    }

    function updateLiveUsersPagination() {
        $$('.bili-dyn-live-users').forEach(container => {
            const body = $('.bili-dyn-live-users__body', container);
            if (!body) return;

            const items = getLiveUserItems(body);
            const totalPages = Math.ceil(items.length / LIVE_PAGE_SIZE);

            if (!settings.livePaginationEnabled || totalPages <= 1) {
                items.forEach(item => {
                    item.style.display = '';
                    delete item.dataset.bdwLiveHidden;
                });
                $('.bdw-live-pager', container)?.remove();
                delete container.dataset.bdwLivePage;
                return;
            }

            const currentPage = clampPage(container.dataset.bdwLivePage, totalPages);
            container.dataset.bdwLivePage = String(currentPage);

            items.forEach((item, index) => {
                const visible = index >= currentPage * LIVE_PAGE_SIZE && index < (currentPage + 1) * LIVE_PAGE_SIZE;
                item.style.display = visible ? '' : 'none';
                if (visible) delete item.dataset.bdwLiveHidden;
                else item.dataset.bdwLiveHidden = 'true';
            });

            updateLivePager(container, totalPages, currentPage);
        });
    }

    function getLiveUserItems(body) {
        return Array.from(body.children).filter(item => !item.classList.contains('bdw-live-pager'));
    }

    function updateLivePager(container, totalPages, currentPage) {
        let pager = $('.bdw-live-pager', container);
        if (!pager) {
            pager = document.createElement('div');
            pager.className = 'bdw-live-pager';
            pager.innerHTML = `
                <button class="bdw-live-page-btn" type="button" data-bdw-live-page="prev" aria-label="上一页">${getIconSvg('chevronLeft')}</button>
                <div class="bdw-live-dots" aria-label="直播分页"></div>
                <button class="bdw-live-page-btn" type="button" data-bdw-live-page="next" aria-label="下一页">${getIconSvg('chevronRight')}</button>
            `;
            pager.addEventListener('click', handleLivePagerClick);
            container.appendChild(pager);
        }

        const dots = $('.bdw-live-dots', pager);
        if (dots) {
            const signature = `${totalPages}:${currentPage}`;
            if (dots.dataset.bdwPages === signature) return;
            dots.dataset.bdwPages = signature;
            dots.innerHTML = '';
            const start = Math.max(0, Math.min(currentPage - 2, totalPages - 5));
            const end = Math.min(totalPages, start + 5);
            for (let index = start; index < end; index += 1) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `bdw-live-dot${index === currentPage ? ' is-active' : ''}`;
                button.dataset.bdwLivePage = String(index);
                button.setAttribute('aria-label', `第 ${index + 1} 页`);
                button.textContent = String(index + 1);
                dots.appendChild(button);
            }
        }
    }

    function handleLivePagerClick(event) {
        const target = event.target.closest('[data-bdw-live-page]');
        if (!target) return;

        const container = target.closest('.bili-dyn-live-users');
        const body = container?.querySelector('.bili-dyn-live-users__body');
        if (!container || !body) return;

        const totalPages = Math.ceil(getLiveUserItems(body).length / LIVE_PAGE_SIZE);
        let page = clampPage(container.dataset.bdwLivePage, totalPages);
        const action = target.dataset.bdwLivePage;

        if (action === 'prev') page -= 1;
        else if (action === 'next') page += 1;
        else page = Number.parseInt(action, 10);

        container.dataset.bdwLivePage = String(clampPage(String(page), totalPages));
        updateLiveUsersPagination();
    }

    function clampPage(value, totalPages) {
        if (totalPages <= 0) return 0;
        const page = Number.parseInt(value, 10);
        if (Number.isNaN(page)) return 0;
        return Math.min(totalPages - 1, Math.max(0, page));
    }

    function handleCommentOpenClick(event) {
        if (!settings.enabled) return;

        const item = event.target.closest?.('.bili-dyn-list__item');
        if (!item) return;

        const footer = event.target.closest?.('.bili-dyn-item__footer');
        if (!footer || !item.contains(footer)) return;

        const targetText = (event.target.innerText || event.target.textContent || '').replace(/\s+/g, ' ').trim();
        const ariaText = event.target.getAttribute?.('aria-label') || event.target.getAttribute?.('title') || '';
        const looksLikeComment = /评论|回复|comment/i.test(`${targetText} ${ariaText}`)
            || isLikelyMiddleFooterAction(event.target, footer);
        if (!looksLikeComment) return;

        scheduleCommentAnchorScroll(item);
    }

    function isLikelyMiddleFooterAction(target, footer) {
        const actions = Array.from(footer.children).filter(node => node.getBoundingClientRect().width > 0);
        const directAction = actions.find(node => node.contains(target));
        const action = target.closest?.('button,a,[role="button"],.bili-dyn-action,.bili-dyn-item__footer__item') || directAction;
        if (!action || !footer.contains(action)) return false;

        const index = actions.indexOf(action);
        return actions.length === 3 && (index === 1 || action === directAction && actions.indexOf(directAction) === 1);
    }

    function scheduleCommentAnchorScroll(item) {
        [120, 360, 760].forEach(delay => {
            setTimeout(() => scrollDynamicItemIntoComfortView(item), delay);
        });
    }

    function scrollDynamicItemIntoComfortView(item) {
        if (!item?.isConnected) return;

        const headerOffset = getHeaderOffset();
        const rect = item.getBoundingClientRect();
        const targetTop = Math.max(0, window.scrollY + rect.top - headerOffset - 12);

        if (Math.abs(window.scrollY - targetTop) > 10) {
            window.scrollTo({ top: targetTop, behavior: 'smooth' });
        }
    }

    let pinnedCommentEl = null;
    let commentPinTimer = null;

    // —— 刷新后自动定位：若首屏视口内没有可见评论按钮，自动滚到第一张卡片的评论按钮处，立即可点击 ——
    let reachabilityDone = false;
    let reachabilityTimer = null;

    function scheduleCommentButtonReachability() {
        if (reachabilityTimer) return;
        let tries = 0;
        reachabilityTimer = setInterval(() => {
            tries += 1;
            try { ensureCommentButtonReachable(); } catch (error) { console.warn('[BDW] reachability failed', error); }
            if (reachabilityDone || tries >= 20) {
                clearInterval(reachabilityTimer);
                reachabilityTimer = null;
            }
        }, 400);
    }

    function ensureCommentButtonReachable() {
        if (reachabilityDone) return;
        // 首屏视口内已有可见评论按钮：说明布局正常，不打扰用户浏览
        const visible = $$('.bili-dyn-action.comment').some(b => {
            const r = b.getBoundingClientRect();
            return r.height > 0 && r.top > 60 && r.top < window.innerHeight - 40;
        });
        if (visible) { reachabilityDone = true; return; }
        // 取第一张卡片的评论按钮，滚到其上方舒适位置（避开顶栏）
        const first = document.querySelector('.bili-dyn-list__item .bili-dyn-action.comment');
        if (!first) return; // 卡片还没渲染，等下一轮
        const r = first.getBoundingClientRect();
        if (r.height <= 0 || r.bottom < 0) return; // 尚未渲染完成
        reachabilityDone = true;
        const headerOffset = getHeaderOffset();
        const targetTop = Math.max(0, window.scrollY + r.top - headerOffset - 12);
        if (Math.abs(window.scrollY - targetTop) > 10) {
            window.scrollTo({ top: targetTop, behavior: 'smooth' });
        }
    }

    function scheduleCommentPinWatch() {
        if (commentPinTimer) return;
        commentPinTimer = setInterval(() => {
            if (!settings.enabled) return;
            try { syncCommentPinning(); } catch (error) { console.warn('[BDW] comment-pin watch failed', error); }
            try { recoverStuckReadMode(); } catch (error) { console.warn('[BDW] read-mode recovery failed', error); }
        }, 800);
    }

    function syncCommentPinning() {
        const visible = $$('.bili-comment-container.bili-dyn-comment').filter(c => {
            const style = getComputedStyle(c);
            return style.display !== 'none' && c.getBoundingClientRect().height > 30;
        });

        if (pinnedCommentEl && (!pinnedCommentEl.isConnected || !visible.includes(pinnedCommentEl))) {
            unpinCommentContainer(pinnedCommentEl);
            pinnedCommentEl = null;
        }
        if (!visible.length) return;
        if (pinnedCommentEl && visible.length === 1) {
            ensureCommentCollapseItem(pinnedCommentEl);
            try { ensureMoreCommentsReplacement(pinnedCommentEl); } catch (error) { console.warn('[BDW] more-comments replace failed', error); }
            return;
        }
        if (pinnedCommentEl) unpinCommentContainer(pinnedCommentEl);
        pinnedCommentEl = pinCommentContainer(visible[0]);
        visible.forEach(container => { try { ensureMoreCommentsReplacement(container); } catch (error) { console.warn('[BDW] more-comments replace failed', error); } });
    }

    function recoverStuckReadMode() {
        // 隐藏挂载流程若因组件未挂载而中断，read-mode 会卡在卡片上导致评论按钮失效，这里超时自动清理
        document.querySelectorAll('.bili-dyn-item.bdw-comment-read-mode').forEach(item => {
            const at = parseInt(item.dataset.bdwReadModeAt || '0', 10);
            if (!at || Date.now() - at < 8000) return;
            item.classList.remove('bdw-comment-read-mode');
            delete item.dataset.bdwReadModeAt;
            const wrapper = item.closest('.bili-dyn-list__item');
            wrapper?.classList.remove('bdw-comment-read-mode');
            const button = item.querySelector('.bili-dyn-action.comment');
            if (button?.isConnected && button.classList.contains('active')) {
                try { button.click(); } catch (error) { /* 忽略 */ }
            }
            if (commentTrigger?.item === item) commentTrigger = null;
        });
    }

    function pinCommentContainer(container) {
        const item = container.closest('.bili-dyn-item');
        if (!item) return container;
        const button = item.querySelector('.bili-dyn-action.comment');
        container.__bdwCommentOrigin = { parent: container.parentNode, next: container.nextSibling, item, button };

        const rect = item.getBoundingClientRect();
        const width = Math.min(Math.round(rect.width), Math.max(200, window.innerWidth - 16));
        const left = Math.max(8, Math.min(Math.round(rect.left), window.innerWidth - width - 8));

        document.body.appendChild(container);
        container.classList.add('bdw-comment-pinned');
        container.style.left = `${left}px`;
        container.style.width = `${width}px`;
        container.style.bottom = '0px';
        container.style.top = 'auto';
        ensureCommentCollapseItem(container);
        return container;
    }

    function unpinCommentContainer(container) {
        if (!container.isConnected) return;
        const origin = container.__bdwCommentOrigin;
        container.classList.remove('bdw-comment-pinned');
        container.style.removeProperty('left');
        container.style.removeProperty('width');
        container.style.removeProperty('bottom');
        container.style.removeProperty('top');
        if (origin?.parent && origin.parent.isConnected) {
            if (origin.next && origin.next.isConnected) origin.parent.insertBefore(container, origin.next);
            else origin.parent.appendChild(container);
        }
        delete container.__bdwCommentOrigin;
    }

    function ensureCommentCollapseItem(container, buttonOverride) {
        if (!container.isConnected) return;
        const button = buttonOverride || container.__bdwCommentOrigin?.button || container.__bdwCommentOrigin?.item?.querySelector('.bili-dyn-action.comment');
        const host = container.querySelector('bili-comments');
        if (host?.shadowRoot) {
            try {
                const sr = host.shadowRoot;
                if (!sr.getElementById('bdw-comment-style')) {
                    const styleEl = document.createElement('style');
                    styleEl.id = 'bdw-comment-style';
                    styleEl.textContent = '.bdw-comment-collapse{display:block!important;width:100%;box-sizing:border-box;text-align:center;padding:10px 0;color:var(--text2,#61666d);font-size:13px;cursor:pointer;user-select:none;border-top:1px solid color-mix(in srgb,var(--line_regular,#e3e5e7) 45%,transparent)}.bdw-comment-collapse:hover{color:#00aeec;background:rgba(0,174,236,.06)}';
                    sr.appendChild(styleEl);
                }
                if (!sr.querySelector('.bdw-comment-collapse')) {
                    const collapse = document.createElement('div');
                    collapse.className = 'bdw-comment-collapse';
                    collapse.textContent = '收起评论';
                    const boxHost = sr.querySelector('bili-comment-box');
                    const boxWrapper = boxHost?.parentElement;
                    const threadWrapper = boxWrapper?.parentElement;
                    if (boxWrapper && threadWrapper) threadWrapper.insertBefore(collapse, boxWrapper);
                    else sr.appendChild(collapse);
                    collapse.addEventListener('click', () => { if (button?.isConnected) button.click(); });
                }
                return;
            } catch (error) {
                console.warn('[BDW] 评论收起按钮注入失败', error);
            }
        }
        if (!container.querySelector('.bdw-comment-collapse')) {
            const collapse = document.createElement('div');
            collapse.className = 'bdw-comment-collapse';
            collapse.textContent = '收起评论';
            container.appendChild(collapse);
            collapse.addEventListener('click', () => { if (button?.isConnected) button.click(); });
        }
    }

    let commentPopup = null;
    let commentTrigger = null;
    let quickView = null;
    const oidCache = new WeakMap();

    function handleCommentSectionMounted(container) {
        if (!container) return;
        const host = container.querySelector('bili-comments');
        const params = host?.getAttribute('data-params');
        if (!host || !params) return;
        const parts = params.split(',').map(s => s.trim());
        if (parts.length < 2) return;
        const type = parts[0];
        const oid = parts[1];
        const wrapper = container.closest('.bili-dyn-list__item');
        const innerItem = container.closest('.bili-dyn-item');
        if (innerItem) oidCache.set(innerItem, { type, oid });
        wrapper?.classList.remove('bdw-comment-read-mode');
        innerItem?.classList.remove('bdw-comment-read-mode');
        if (innerItem) delete innerItem.dataset.bdwReadModeAt;
        const item = wrapper || innerItem;
        const trigger = commentTrigger;
        commentTrigger = null;
        const button = item?.querySelector('.bili-dyn-action.comment');
        const nativeContainer = item?.querySelector('.bili-comment-container');
        if (button?.isConnected && (button.classList.contains('active') || nativeContainer)) {
            try { button.click(); } catch (error) { /* 忽略 */ }
        }
        if (!trigger || !item) return;
        if (trigger.kind === 'hover') openQuickViewData(item, trigger.button, type, oid);
        else openCommentPopupData(item, type, oid);
    }

    function ensureQuickView(button) {
        if (!settings.enabled || !settings.quickComment) return;
        const item = button.closest('.bili-dyn-item');
        if (!item) return;
        if (quickView && quickView.button === button) return;
        if (quickView) closeQuickView();
        quickView = { el: buildQuickView(button, item), button, item, type: null, oid: null };
        const cached = oidCache.get(item);
        if (cached) openQuickViewData(item, button, cached.type, cached.oid);
        else acquireCommentData(item, button);
    }

    function buildQuickView(button, item) {
        const el = document.createElement('div');
        el.className = 'bdw-quickview';
        el.innerHTML = '<div class="bdw-quickview-head"><span>评论</span><span class="bdw-quickview-loading">加载中…</span></div><div class="bdw-quickview-list"><div class="bdw-quickview-empty">加载中…</div></div>';
        document.body.appendChild(el);
        positionQuickView(el, button.getBoundingClientRect());
        return el;
    }

    function positionQuickView(el, rect) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.min(340, vw - 24);
        const estH = Math.min(440, vh * 0.6);
        el.style.width = width + 'px';
        el.style.top = 'auto';
        el.style.bottom = 'auto';
        let left = rect.left - 8;
        left = Math.max(12, Math.min(left, vw - width - 12));
        el.style.left = left + 'px';
        if (rect.top - 12 >= estH + 12) {
            // 上方空间足够：底部锚定在按钮上方 12px，窗口向上生长，加载后不位移、不遮挡按钮
            el.style.bottom = (vh - rect.top + 12) + 'px';
            el.style.maxHeight = Math.max(100, rect.top - 24) + 'px';
        } else {
            // 上方不足：放在按钮下方 12px，高度封顶到视口底部——绝不回弹覆盖按钮
            const top = Math.min(rect.bottom + 12, vh - 24);
            el.style.top = top + 'px';
            el.style.maxHeight = Math.max(100, vh - top - 12) + 'px';
        }
    }

    function openCommentPopupByItem(item, button) {
        const cached = oidCache.get(item);
        if (cached) {
            const wrapper = item.closest('.bili-dyn-list__item');
            openCommentPopupData(wrapper || item, cached.type, cached.oid);
            return;
        }
        item.classList.add('bdw-comment-read-mode');
        item.dataset.bdwReadModeAt = Date.now();
        commentTrigger = { item, button, kind: 'click' };
    }

    function acquireCommentData(item, button) {
        // 不派发合成点击：B 站当前构建会忽略非信任点击。
        // 快速查看窗由用户真实点击触发，真实点击本身就会让 B 站挂载评论组件，
        // 挂载后由 observer 读到 type/oid 再填充数据。
        item.classList.add('bdw-comment-read-mode');
        item.dataset.bdwReadModeAt = Date.now();
        commentTrigger = { item, button, kind: 'hover' };
    }

    function openQuickViewData(item, button, type, oid) {
        if (!quickView || quickView.button !== button) return;
        quickView.type = type;
        quickView.oid = oid;
        loadQuickViewComments(quickView, type, oid);
    }

    async function loadQuickViewComments(qv, type, oid) {
        const listEl = $('.bdw-quickview-list', qv.el);
        const url = `https://api.bilibili.com/x/v2/reply?type=${type}&oid=${oid}&sort=2&pn=1&ps=20`;
        try {
            const response = await fetch(url, { credentials: 'include' });
            const json = await response.json();
            if (!document.body.contains(qv.el)) return;
            if (json.code !== 0) {
                listEl.innerHTML = `<div class="bdw-quickview-empty">加载失败：${escapeHtml(json.message || json.code)}</div>`;
                return;
            }
            const replies = json.data?.replies || [];
            const count = json.data?.page?.acount || replies.length;
            $('.bdw-quickview-loading', qv.el).textContent = `${count} 条`;
            listEl.innerHTML = '';
            replies.slice(0, 10).forEach(reply => listEl.appendChild(renderQuickViewItem(reply)));
        } catch (error) {
            if (document.body.contains(qv.el)) listEl.innerHTML = `<div class="bdw-quickview-empty">加载失败：${escapeHtml(String(error))}</div>`;
        }
    }

    function renderQuickViewItem(reply) {
        const member = reply.member || {};
        const content = reply.content || {};
        const item = document.createElement('div');
        item.className = 'bdw-quickview-item';
        const avatar = (member.avatar || '').replace(/^\/\//, 'https://');
        const avatarHtml = avatar
            ? `<img class="bdw-quickview-avatar" src="${escapeHtml(avatar)}@64w_64h.webp" alt="" onerror="this.style.visibility='hidden'">`
            : '<span class="bdw-quickview-avatar"></span>';
        const replyCount = reply.rcount || 0;
        item.innerHTML = `${avatarHtml}<div class="bdw-quickview-item-main"><div class="bdw-quickview-item-name">${escapeHtml(member.uname || '')}</div><div class="bdw-quickview-item-content">${escapeHtml(content.message || '')}</div><div class="bdw-quickview-item-meta"><span>${formatCommentTime(reply.ctime)}</span><span>${reply.like || 0} 赞</span>${replyCount ? `<span>${replyCount} 回复</span>` : ''}</div></div>`;
        return item;
    }

    function closeQuickView() {
        if (!quickView) return;
        quickView.el.remove();
        quickView = null;
    }

    function ensureMoreCommentsReplacement(container) {
        const host = container.querySelector('bili-comments');
        const sr = host?.shadowRoot;
        if (!sr) return;
        const bar = Array.from(sr.querySelectorAll('div')).find(el => {
            const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
            return t === '查看更多评论';
        });
        if (!bar || bar.classList.contains('bdw-more-comments')) return;
        const cs = getComputedStyle(bar);
        const replacement = document.createElement('div');
        replacement.className = 'bdw-more-comments';
        replacement.textContent = '查看更多评论';
        replacement.style.cssText = `padding:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft};text-align:center;color:${cs.color};font-size:${cs.fontSize};cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:${Math.round(bar.getBoundingClientRect().height)}px;box-sizing:border-box`;
        replacement.addEventListener('click', () => openCommentPopup(container));
        bar.parentNode.replaceChild(replacement, bar);
    }

    function openCommentPopup(container) {
        const host = container.querySelector('bili-comments');
        if (!host) return;
        const params = (host.getAttribute('data-params') || '').split(',').map(s => s.trim());
        if (params.length < 2) return;
        const item = container.closest('.bili-dyn-list__item') || container.__bdwCommentOrigin?.item;
        if (!item) return;
        openCommentPopupData(item, params[0], params[1]);
    }

    function openCommentPopupData(item, type, oid) {
        if (!settings.enabled) return;
        if (commentPopup) closeCommentPopup();
        closeQuickView();

        // 记录原卡片在列表中的位置，供关闭时还原（原生组件直接移入弹窗，保留全部点击事件，无需隐藏任何组件）
        if (!item.__bdwPopupReturn) {
            item.__bdwPopupReturn = { parent: item.parentNode, next: item.nextSibling };
        }
        // 移入前清理卡片内的原生评论区挂载节点，避免弹窗内重复
        item.querySelectorAll('.bili-comment-container').forEach(node => node.remove());
        const commentButton = item.querySelector('.bili-dyn-action.comment');
        if (commentButton) commentButton.classList.remove('active');

        const overlay = document.createElement('div');
        overlay.className = 'bdw-comment-popup-overlay';
        const card = document.createElement('div');
        card.className = 'bdw-comment-popup';
        card.innerHTML = `
            <button class="bdw-comment-popup-close" type="button" aria-label="关闭评论"></button>
            <div class="bdw-comment-popup-left"></div>
            <div class="bdw-comment-popup-right">
                <div class="bdw-comment-popup-head"><span>评论</span><span class="bdw-comment-popup-count">0</span><div class="bdw-comment-popup-sort"><button type="button" data-bdw-sort="2" class="is-active">最热</button><button type="button" data-bdw-sort="0">最新</button></div></div>
                <div class="bdw-comment-popup-list"><div class="bdw-comment-popup-empty">加载中…</div></div>
                <div class="bdw-comment-popup-input-wrap"><input class="bdw-comment-popup-input" placeholder="说点什么…"><button class="bdw-comment-popup-send" type="button">发送</button></div>
            </div>`;
        $('.bdw-comment-popup-close', card).innerHTML = getIconSvg('close');
        $('.bdw-comment-popup-left', card).appendChild(item);
        enhanceMovedCardInteractions($('.bdw-comment-popup-left', card));
        overlay.appendChild(card);
        overlay.addEventListener('click', event => {
            // 点击评论窗口以外的遮罩区域：关闭快速查看窗与评论窗口
            if (event.target === overlay) {
                closeQuickView();
                closeCommentPopup();
            }
        });
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        commentPopup = { overlay, card, type, oid, sort: 2, pn: 1, count: 0, item };

        $('.bdw-comment-popup-close', card).addEventListener('click', closeCommentPopup);
        card.addEventListener('click', event => {
            const sortButton = event.target.closest('[data-bdw-sort]');
            if (sortButton) {
                commentPopup.sort = Number(sortButton.dataset.bdwSort);
                commentPopup.pn = 1;
                $$('.bdw-comment-popup-sort button', card).forEach(button => button.classList.toggle('is-active', button === sortButton));
                loadCommentPopup();
                return;
            }
            if (event.target.closest('.bdw-comment-popup-send')) sendComment();
        });
        $('.bdw-comment-popup-input', card).addEventListener('keydown', event => { if (event.key === 'Enter') sendComment(); });
        document.addEventListener('keydown', commentPopupEscHandler, true);
        loadCommentPopup();
    }

    function closeCommentPopup() {
        if (!commentPopup) return;
        document.removeEventListener('keydown', commentPopupEscHandler, true);
        // 把移入弹窗的原卡片移回列表原位
        const item = commentPopup.item;
        if (item) {
            // 移除弹窗期间绑定的接管监听（避免污染原列表卡片的头像/名称/三点/展开交互）
            if (item.__bdwBoundListeners) {
                item.__bdwBoundListeners.forEach(([el, fn]) => el.removeEventListener('click', fn));
                delete item.__bdwBoundListeners;
            }
            // 清理历史版本可能写下的评论按钮内联 pointer-events（防止原列表评论按钮失灵）
            item.querySelectorAll('.bili-dyn-action.comment').forEach(btn => btn.style.removeProperty('pointer-events'));
            if (item.__bdwPopupReturn) {
                const ret = item.__bdwPopupReturn;
                const back = ret.parent && (ret.next ? ret.next.isConnected : ret.parent.isConnected);
                if (back) ret.parent.insertBefore(item, ret.next);
                delete item.__bdwPopupReturn;
            }
        }
        commentPopup.overlay.remove();
        document.body.style.removeProperty('overflow');
        commentPopup = null;
    }

    function getCardMid(cardEl) {
        // 卡片装扮（dyn-decoration-card）的链接 window_params 内携带 UP 主 mid
        const a = cardEl.querySelector('.bili-dyn-item__ornament a,.dyn-decoration-card a,a[href*="window_params"]');
        const href = a?.getAttribute('href') || '';
        const m = href.match(/mid["']?\s*:\s*(\d+)/i) || href.match(/[?&]mid=(\d+)/);
        return m ? m[1] : null;
    }

    function enhanceMovedCardInteractions(left) {
        // B 站动态卡片的头像/名称/三点跳转依赖列表容器内的事件委托；卡片被移入弹窗后委托失配，
        // 由脚本接管：点击头像/名称/三点 → 新标签打开该 UP 主空间（mid 取自装扮链接）
        // 注意：所有绑定监听记录在 __bdwBoundListeners，关闭弹窗移回原列表时必须移除，避免污染原页面交互
        const cardEl = left.firstElementChild;
        if (!cardEl) return;
        const mid = getCardMid(cardEl);
        const spaceUrl = mid ? `https://space.bilibili.com/${mid}` : null;
        const bound = [];
        cardEl.querySelectorAll('.bili-dyn-item__avatar,.bili-dyn-title,.bili-dyn-item__more').forEach(el => {
            const fn = event => {
                event.preventDefault();
                event.stopPropagation();
                if (spaceUrl) window.open(spaceUrl, '_blank', 'noopener');
            };
            el.addEventListener('click', fn);
            bound.push([el, fn]);
        });
        // 弹窗左栏卡片底部动作行的评论按钮：点击无效果由弹窗作用域 CSS 实现（不写内联样式，避免污染原列表卡片）
        // 正文"展开"按钮：脚本接管展开逻辑（阻止冒泡与无反应的默认行为）
        cardEl.querySelectorAll('.bili-dyn-more__btn,.bili-dyn-more').forEach(btn => {
            if (btn.classList.contains('bili-cascader') || btn.closest('.bili-cascader')) return;
            const fn = event => {
                event.stopPropagation();
                const wrap = btn.closest('.bili-dyn-content__orig,[class*="dyn-content"]');
                if (wrap) {
                    wrap.style.maxHeight = 'none';
                    wrap.style.overflow = 'visible';
                    wrap.style.webkitLineClamp = 'unset';
                    wrap.style.display = 'block';
                }
                btn.style.display = 'none';
                btn.closest('.bili-dyn-more')?.style.setProperty('display', 'none');
            };
            btn.addEventListener('click', fn);
            bound.push([btn, fn]);
        });
        cardEl.__bdwBoundListeners = bound;
    }

    function commentPopupEscHandler(event) {
        if (event.key !== 'Escape') return;
        closeQuickView();
        closeCommentPopup();
    }

    async function loadCommentPopup() {
        if (!commentPopup) return;
        const { card, type, oid, sort, pn } = commentPopup;
        const listEl = $('.bdw-comment-popup-list', card);
        if (pn === 1) listEl.innerHTML = '<div class="bdw-comment-popup-empty">加载中…</div>';
        const url = `https://api.bilibili.com/x/v2/reply?type=${type}&oid=${oid}&sort=${sort}&pn=${pn}&ps=20`;
        try {
            const response = await fetch(url, { credentials: 'include' });
            const json = await response.json();
            if (json.code !== 0) {
                if (commentPopup) listEl.innerHTML = `<div class="bdw-comment-popup-empty">加载失败：${escapeHtml(json.message || json.code)}</div>`;
                return;
            }
            const replies = json.data?.replies || [];
            const page = json.data?.page || {};
            if (pn === 1) {
                commentPopup.count = page.acount || replies.length;
                $('.bdw-comment-popup-count', card).textContent = String(commentPopup.count);
                listEl.innerHTML = '';
            }
            replies.forEach(reply => listEl.appendChild(renderCommentPopupItem(reply)));
            if (pn * 20 < commentPopup.count) {
                const loadButton = document.createElement('button');
                loadButton.type = 'button';
                loadButton.className = 'bdw-comment-popup-loadmore';
                loadButton.textContent = '加载更多评论';
                loadButton.addEventListener('click', () => { commentPopup.pn += 1; loadCommentPopup(); });
                listEl.appendChild(loadButton);
            }
        } catch (error) {
            if (commentPopup) listEl.innerHTML = `<div class="bdw-comment-popup-empty">加载失败：${escapeHtml(String(error))}</div>`;
        }
    }

    function renderCommentPopupItem(reply) {
        const member = reply.member || {};
        const content = reply.content || {};
        const item = document.createElement('div');
        item.className = 'bdw-comment-popup-item';
        const avatar = (member.avatar || '').replace(/^\/\//, 'https://');
        const avatarHtml = avatar
            ? `<img class="bdw-comment-popup-avatar" src="${escapeHtml(avatar)}@80w_80h.webp" alt="" onerror="this.style.visibility='hidden'">`
            : '<span class="bdw-comment-popup-avatar"></span>';
        const time = formatCommentTime(reply.ctime);
        const replyCount = reply.rcount || 0;
        item.innerHTML = `${avatarHtml}<div class="bdw-comment-popup-item-main"><div class="bdw-comment-popup-item-name">${escapeHtml(member.uname || '')}</div><div class="bdw-comment-popup-item-content">${escapeHtml(content.message || '')}</div><div class="bdw-comment-popup-item-meta"><span>${time}</span><span>${reply.like || 0} 赞</span>${replyCount ? `<span>${replyCount} 回复</span>` : ''}</div></div>`;
        return item;
    }

    async function sendComment() {
        if (!commentPopup) return;
        const input = $('.bdw-comment-popup-input', commentPopup.card);
        const message = input.value.trim();
        if (!message) return;
        const csrf = (document.cookie.match(/bili_jct=([^;]+)/) || [])[1] || '';
        const sendButton = $('.bdw-comment-popup-send', commentPopup.card);
        sendButton.disabled = true;
        try {
            const response = await fetch('https://api.bilibili.com/x/v2/reply/add', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: `type=${commentPopup.type}&oid=${commentPopup.oid}&message=${encodeURIComponent(message)}&plat=1&csrf=${encodeURIComponent(csrf)}`
            });
            const json = await response.json();
            if (json.code === 0) {
                input.value = '';
                commentPopup.sort = 2;
                commentPopup.pn = 1;
                loadCommentPopup();
            } else {
                alert(`评论发送失败：${json.message || json.code}`);
            }
        } catch (error) {
            alert(`评论发送失败：${String(error)}`);
        } finally {
            if (commentPopup) {
                const button = $('.bdw-comment-popup-send', commentPopup.card);
                if (button) button.disabled = false;
            }
        }
    }

    function formatCommentTime(ctime) {
        const diff = Math.floor(Date.now() / 1000) - ctime;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
        if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
        const date = new Date(ctime * 1000);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function getHeaderOffset() {
        // 顶栏可能是 fixed/sticky（滚动后仍停在视口顶部）或静态（会随页面滚走）。
        // 必须优先测 fixed/sticky 顶栏：静态顶栏滚动后 bottom 变负，若直接钳成 0，
        // 吸顶偏移会被算成 12px，左侧蓝区就被固定在顶部的真实顶栏盖住。
        const selectors = ['#bili-header-container', '.bili-header__bar', '.bili-header', '.z-top-container'];
        let staticHeader = null;
        let staticBottom = 0;
        for (const selector of selectors) {
            const header = $(selector);
            if (!header) continue;
            const position = getComputedStyle(header).position;
            const bottom = header.getBoundingClientRect().bottom;
            if (position === 'fixed' || position === 'sticky') {
                return Math.ceil(Math.max(0, bottom));
            }
            if (!staticHeader) {
                staticHeader = header;
                staticBottom = bottom;
            }
        }
        if (staticHeader && staticBottom > 0) return Math.ceil(staticBottom);
        return 64;
    }

    function ensureSideControlPanel(sidebar) {
        const panel = ensureWritePanel();
        const myInfo = $('.bili-dyn-my-info', sidebar) || $('.bili-dyn-my-info');

        if (myInfo?.parentNode) {
            if (!myInfo.contains(panel)) myInfo.appendChild(panel);
        } else if (!sidebar.contains(panel)) {
            sidebar.prepend(panel);
        }
    }

    function ensureWritePanel() {
        let panel = $('.my-control-panel');
        if (panel) return panel;

        panel = document.createElement('div');
        const btn = document.createElement('button');
        panel.className = 'my-control-panel';
        btn.type = 'button';
        btn.className = 'my-custom-btn';
        btn.textContent = '写动态';
        btn.addEventListener('click', togglePublishing);
        panel.appendChild(btn);
        return panel;
    }

    function restoreOriginalDom() {
        closeCommentPopup();
        closeQuickView();
        commentTrigger = null;
        $$('.bdw-comment-read-mode').forEach(el => el.classList.remove('bdw-comment-read-mode'));
        if (pinnedCommentEl) {
            unpinCommentContainer(pinnedCommentEl);
            pinnedCommentEl = null;
        }
        $$('.bdw-comment-collapse').forEach(node => node.remove());
        $$('.my-control-panel').forEach(panel => panel.remove());
        $$('.bdw-recent-dock').forEach(panel => panel.remove());
        $$('.bili-dyn-up-list.bdw-source-hidden').forEach(node => node.classList.remove('bdw-source-hidden'));
        $$('.bdw-live-pager').forEach(pager => pager.remove());
        $$('.bili-dyn-live-users__body>*[data-bdw-live-hidden="true"]').forEach(item => {
            item.style.removeProperty('display');
            delete item.dataset.bdwLiveHidden;
        });
        $$('.bili-dyn-live-users[data-bdw-live-page]').forEach(container => {
            delete container.dataset.bdwLivePage;
        });
        resetDynamicItemState();
    }

    function scheduleMainLoop(forceFilter = false) {
        if (!document.body || loopScheduled) return;
        loopScheduled = true;
        requestAnimationFrame(() => {
            loopScheduled = false;
            updateResponsiveColumns();
            mainLoop();
            if (forceFilter) queueDynamicFilter(true);
        });
    }

    function start() {
        ensureWallpaperLayer();
        ensureSettingsUi();
        scheduleCommentPinWatch();
        scheduleCommentButtonReachability();
        resetDynamicItemState();
        saveSettings();
        applySettings();
        if (!observer) {
            observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        const host = node.matches?.('bili-comments') ? node : node.querySelector?.('bili-comments');
                        if (host) handleCommentSectionMounted(host.closest('.bili-comment-container'));
                    });
                    mutation.removedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        const host = node.matches?.('bili-comments') ? node : node.querySelector?.('bili-comments');
                        if (host) {
                            const inner = host.closest('.bili-dyn-item');
                            inner?.classList.remove('bdw-comment-read-mode');
                            const wrapper = host.closest('.bili-dyn-list__item');
                            wrapper?.classList.remove('bdw-comment-read-mode');
                        }
                    });
                });
                const touchedDynamicList = mutations.some(mutation => {
                    const target = mutation.target;
                    return target instanceof Element && (target.closest('.bili-dyn-list') || target.matches('.bili-dyn-list,.bili-dyn-list__items'));
                });
                scheduleMainLoop(touchedDynamicList);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
        window.addEventListener('resize', scheduleMainLoop, { passive: true });
        window.addEventListener('scroll', scheduleMainLoop, { passive: true });
        document.addEventListener('click', handleDynamicSourceClick, true);
        document.addEventListener('click', event => {
            if (!settings.enabled) return;
            // 脚本内部派发的合成点击（读取评论 oid 用）不参与自身交互逻辑
            if (event.__bdwInternal) return;
            // 点击评论按钮/快速查看窗以外的区域：关闭快速查看窗
            if (quickView && !event.target.closest('.bdw-quickview,.bili-dyn-action.comment')) {
                closeQuickView();
            }
            const button = event.target.closest?.('.bili-dyn-action.comment');
            if (!button) return;
            if (button.classList.contains('active')) return;
            const item = button.closest('.bili-dyn-item');
            if (!item) return;
            if (item.querySelector('.bili-comment-container')) return;
            if (commentTrigger?.item === item && commentTrigger.kind === 'click') {
                // 评论 oid 尚未就绪：阻止 B 站默认跳转（避免点击评论按钮误跳动态/视频详情页）
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (settings.quickComment) {
                // 快速评论开启：点一次=快速查看，再点同一按钮=完整评论
                if (quickView && quickView.button === button) {
                    closeQuickView();
                    openCommentPopupByItem(item, button);
                    return;
                }
                if (quickView) closeQuickView();
                ensureQuickView(button);
                return;
            }
            // 快速评论关闭：点一次=完整评论
            openCommentPopupByItem(item, button);
        }, true);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) scheduleMainLoop();
        });
        document.addEventListener('fullscreenchange', scheduleMainLoop);
        scheduleMainLoop(true);
        document.documentElement.setAttribute('data-bdw-active', '1');
        console.log('%c Bilibili 动态瀑布流 v7.26 加载完成 ', 'background:#00A1D6;color:#fff;border-radius:3px;padding:2px 5px;');
    }

    if (document.body) {
        start();
    } else {
        const bodyObserver = new MutationObserver(() => {
            if (!document.body) return;
            bodyObserver.disconnect();
            start();
        });
        bodyObserver.observe(document.documentElement, { childList: true });
    }
})();

