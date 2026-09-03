// ==UserScript==
// @name            Discord CustomBadges
// @description     Fetches badges from custom-badges.shadow-164.workers.dev with Discord-native tooltips, popup cards, and a full in-page dashboard for editing/publishing your own badge.
// @version         12.1.0
// @match           https://discord.com/*
// @match           https://*.discord.com/*
// @icon            https://files.catbox.moe/i4wx32.png
// @grant           none
// @run-at          document-start
// @updateURL       https://raw.githubusercontent.com/ItzMeShadow999/CustomBadgesUS/main/CustomBadges.userscript.js
// @downloadURL     https://raw.githubusercontent.com/ItzMeShadow999/CustomBadgesUS/main/CustomBadges.userscript.js
// ==/UserScript==
(function() {
    "use strict";
    const API_BASE = "https://custom-badges.shadow-164.workers.dev";
    const CACHE_TTL = 3e4;
    const badgeCache = new Map;
    const MARKER = "data-cb-remote-v11";
    function log(...a) {
        console.log("[CustomBadges]", ...a);
    }
    const styleId = "cb-remote-styles";
    if (!document.getElementById(styleId)) {
        const css = document.createElement("style");
        css.id = styleId;
        css.textContent = `\n            .cb-badge-img {\n                object-fit: contain;\n                display: inline-block;\n                vertical-align: middle;\n                cursor: default;\n            }\n            .cb-badge-img.cb-hover-scale {\n                transition: transform 0.12s ease;\n            }\n            .cb-badge-img.cb-hover-glow {\n                transition: filter 0.18s cubic-bezier(0.16,1,0.3,1);\n            }\n            .cb-badge-img.cb-clickable {\n                cursor: pointer;\n            }\n            \n            .cb-tooltip-el {\n                position: fixed;\n                z-index: 10002;\n                pointer-events: none;\n                opacity: 0;\n                transform: translateY(4px);\n                transition: opacity 120ms ease, transform 120ms ease;\n                background: #000000;\n                color: #ffffff;\n                font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n                font-size: 14px;\n                font-weight: 500;\n                line-height: 18px;\n                padding: 8px 12px;\n                border-radius: 6px;\n                box-shadow: 0 8px 16px rgba(0,0,0,0.36);\n                white-space: nowrap;\n                max-width: 280px;\n                text-align: center;\n            }\n            .cb-tooltip-el.visible {\n                opacity: 1;\n                transform: translateY(0);\n            }\n            \n            .cb-badge-popup {\n                position: fixed;\n                z-index: 10001;\n                background: var(--cb-popup-bg, #1d1d1d);\n                border-radius: 8px;\n                padding: 20px 28px;\n                text-align: center;\n                box-shadow: 0 8px 24px rgba(0,0,0,0.5);\n                opacity: 0;\n                pointer-events: none;\n                transition: opacity 0.24s cubic-bezier(0.16,1,0.3,1),\n                            transform 0.24s cubic-bezier(0.16,1,0.3,1);\n                font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n                min-width: 180px;\n                width: fit-content;\n            }\n            .cb-badge-popup.visible {\n                opacity: 1;\n                pointer-events: auto;\n            }\n            \n            .cb-badge-popup.cb-anim-fade {\n                transform: translateY(8px) scale(0.96);\n            }\n            .cb-badge-popup.cb-anim-fade.visible {\n                transform: translateY(0) scale(1);\n            }\n            .cb-badge-popup.cb-anim-scale {\n                transform: scale(0.8);\n                transform-origin: 50% 100%;\n            }\n            .cb-badge-popup.cb-anim-scale.visible {\n                transform: scale(1);\n            }\n            .cb-badge-popup.cb-anim-slide {\n                transform: translateY(16px);\n            }\n            .cb-badge-popup.cb-anim-slide.visible {\n                transform: translateY(0);\n            }\n            \n            .cb-badge-popup::after {\n                content: "";\n                position: absolute;\n                top: 100%;\n                left: 50%;\n                transform: translateX(-50%);\n                border-width: 7px;\n                border-style: solid;\n                border-color: var(--cb-popup-arrow, var(--cb-popup-bg, #1d1d1d)) transparent transparent transparent;\n            }\n            .cb-badge-popup img {\n                width: 64px;\n                height: 64px;\n                border-radius: 50%;\n                object-fit: cover;\n                margin: 0 auto 14px auto;\n                display: block;\n            }\n            .cb-badge-popup .cb-name {\n                font-weight: 800;\n                font-size: 16px;\n                letter-spacing: 0.3px;\n                line-height: 1.2;\n            }\n            .cb-badge-popup .cb-by {\n                font-size: 12px;\n                color: #949ba4;\n                margin-top: 4px;\n            }\n        `;
        (document.head || document.documentElement).appendChild(css);
    }
    let _tooltipEl = null;
    function getTooltip() {
        if (_tooltipEl) return _tooltipEl;
        _tooltipEl = document.createElement("div");
        _tooltipEl.className = "cb-tooltip-el";
        document.body.appendChild(_tooltipEl);
        return _tooltipEl;
    }
    function showTooltip(text, rect) {
        const el = getTooltip();
        el.textContent = text;
        el.classList.add("visible");
        const ttRect = el.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - ttRect.width / 2;
        let top = rect.top - ttRect.height - 10;
        left = Math.max(8, Math.min(left, window.innerWidth - ttRect.width - 8));
        top = Math.max(8, top);
        el.style.left = left + "px";
        el.style.top = top + "px";
    }
    function hideTooltip() {
        _tooltipEl?.classList.remove("visible");
    }
    let _popupEl = null;
    let _popupOpenFor = null;
    let _followRaf = null;
    let _globalCloseAttached = false;
    let _onGlobalPointerDown = null;
    let _onGlobalScroll = null;
    function getPopupEl() {
        if (_popupEl) return _popupEl;
        _popupEl = document.createElement("div");
        _popupEl.className = "cb-badge-popup";
        document.body.appendChild(_popupEl);
        return _popupEl;
    }
    function positionPopup(target, el) {
        const rect = target.getBoundingClientRect();
        const top = rect.top - el.offsetHeight - 12;
        const left = rect.left + rect.width / 2 - el.offsetWidth / 2;
        el.style.top = `${Math.max(top, 4)}px`;
        el.style.left = `${Math.max(left, 4)}px`;
    }
    function isTargetVisible(target) {
        if (!document.body.contains(target)) return false;
        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) return false;
        let node = target.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            const cs = getComputedStyle(node);
            if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
                const nr = node.getBoundingClientRect();
                if (nr.width <= 0 || nr.height <= 0) return false;
                if (rect.bottom <= nr.top || rect.top >= nr.bottom || rect.right <= nr.left || rect.left >= nr.right) return false;
            }
            node = node.parentElement;
        }
        return true;
    }
    function startFollowingPopup(target) {
        stopFollowingPopup();
        const step = () => {
            if (!_popupOpenFor || _popupOpenFor !== target) return;
            if (!isTargetVisible(target)) {
                hidePopup();
                return;
            }
            positionPopup(target, getPopupEl());
            _followRaf = requestAnimationFrame(step);
        };
        _followRaf = requestAnimationFrame(step);
    }
    function stopFollowingPopup() {
        if (_followRaf != null) {
            cancelAnimationFrame(_followRaf);
            _followRaf = null;
        }
    }
    function hidePopup() {
        stopFollowingPopup();
        detachGlobalCloseListeners();
        getPopupEl().classList.remove("visible");
        _popupOpenFor = null;
    }
    function attachGlobalCloseListeners() {
        if (_globalCloseAttached) return;
        _globalCloseAttached = true;
        _onGlobalPointerDown = e => {
            const popupEl = _popupEl;
            const openTarget = _popupOpenFor;
            if (!openTarget) return;
            if (popupEl && popupEl.contains(e.target)) return;
            if (e.target === openTarget || openTarget.contains && openTarget.contains(e.target)) return;
            hidePopup();
        };
        _onGlobalScroll = () => {
            hidePopup();
        };
        document.addEventListener("pointerdown", _onGlobalPointerDown, true);
        document.addEventListener("scroll", _onGlobalScroll, true);
    }
    function detachGlobalCloseListeners() {
        if (!_globalCloseAttached) return;
        _globalCloseAttached = false;
        if (_onGlobalPointerDown) document.removeEventListener("pointerdown", _onGlobalPointerDown, true);
        if (_onGlobalScroll) document.removeEventListener("scroll", _onGlobalScroll, true);
        _onGlobalPointerDown = null;
        _onGlobalScroll = null;
    }
    const _sampledColorCache = new Map;
    function sampleImageColor(url) {
        if (_sampledColorCache.has(url)) return Promise.resolve(_sampledColorCache.get(url));
        return new Promise(resolve => {
            const img = new Image;
            img.crossOrigin = "anonymous";
            img.onload = () => {
                try {
                    const size = 32;
                    const canvas = document.createElement("canvas");
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return finish(null);
                    ctx.drawImage(img, 0, 0, size, size);
                    const data = ctx.getImageData(0, 0, size, size).data;
                    let r = 0, g = 0, b = 0, count = 0;
                    for (let i = 0; i < data.length; i += 4) {
                        if (data[i + 3] < 32) continue;
                        r += data[i];
                        g += data[i + 1];
                        b += data[i + 2];
                        count++;
                    }
                    if (!count) return finish(null);
                    finish(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
                } catch (e) {
                    finish(null);
                }
            };
            img.onerror = () => finish(null);
            img.src = url;
            function finish(color) {
                _sampledColorCache.set(url, color);
                resolve(color);
            }
        });
    }
    async function getPopupBackground(imageUrl, style) {
        if (style.popupBackgroundMode === "edit") {
            return {
                background: `radial-gradient(120% 100% at 50% 0%, ${style.popupGradientSecondary} 0%, ${style.popupGradientMain} 65%)`,
                edgeColor: style.popupGradientMain
            };
        }
        if (style.popupBackgroundMode === "sample") {
            const sampled = await sampleImageColor(imageUrl);
            if (sampled) {
                return {
                    background: `radial-gradient(120% 100% at 50% 0%, ${sampled} 0%, #1d1d1d 65%)`,
                    edgeColor: "#1d1d1d"
                };
            }
            return {
                background: "#1d1d1d",
                edgeColor: "#1d1d1d"
            };
        }
        return {
            background: "#1d1d1d",
            edgeColor: "#1d1d1d"
        };
    }
    async function showBadgePopup(target, imageUrl, rawName, ownerUsername, style) {
        const el = getPopupEl();
        const anim = style.popupAnimation || "fade";
        el.className = `cb-badge-popup cb-anim-${anim}`;
        const displayName = formatBadgeName(rawName, style.appendTag);
        const nameColor = style.nameColor || "#ffffff";
        const byLine = ownerUsername ? `<div class="cb-by">By ${ownerUsername}</div>` : "";
        el.innerHTML = `\n            <img src="${imageUrl}" alt="${displayName}" referrerpolicy="no-referrer">\n            <div class="cb-name" style="color: ${nameColor};">${displayName}</div>\n            ${byLine}\n        `;
        el.classList.add("visible");
        _popupOpenFor = target;
        positionPopup(target, el);
        startFollowingPopup(target);
        attachGlobalCloseListeners();
        const result = await getPopupBackground(imageUrl, style);
        if (_popupOpenFor === target) {
            el.style.setProperty("--cb-popup-bg", result.background);
            el.style.setProperty("--cb-popup-arrow", result.edgeColor);
        }
    }
    function getUserId(root) {
        const avatar = root.querySelector('img[src*="cdn.discordapp.com/avatars/"]');
        if (avatar) {
            const m = avatar.src.match(/avatars\/(\d+)\//);
            if (m) return m[1];
        }
        const el = root.querySelector("[data-user-id]");
        if (el) return el.dataset.userId;
        return null;
    }
    function getOwnerUsername(root) {
        const exactUsernameEl = root.querySelector('[class*="userTagUsername"]');
        if (exactUsernameEl && exactUsernameEl.textContent && exactUsernameEl.textContent.trim()) {
            const exact = sanitizeUsername(exactUsernameEl.textContent);
            if (exact) return exact;
        }
        const nameSelectors = [ '[class*="username"]', '[class*="userTag"]', '[class*="nameTag"]', '[class*="nickname"]', "h1" ];
        for (const sel of nameSelectors) {
            const candidates = root.querySelectorAll(sel);
            for (const el of candidates) {
                if (!el || !el.textContent || !el.textContent.trim()) continue;
                const candidate = sanitizeUsername(el.textContent);
                if (isLikelyUsername(candidate)) return candidate;
            }
        }
        const avatar = root.querySelector('img[src*="cdn.discordapp.com/avatars/"]');
        if (avatar && avatar.alt && avatar.alt.trim()) {
            const candidate = sanitizeUsername(avatar.alt);
            if (isLikelyUsername(candidate)) return candidate;
        }
        for (const sel of nameSelectors) {
            const el = root.querySelector(sel);
            if (el && el.textContent && el.textContent.trim()) return sanitizeUsername(el.textContent);
        }
        return null;
    }
    async function fetchBadge(userId) {
        if (!userId) return null;
        const cached = badgeCache.get(userId);
        if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
        try {
            const res = await fetch(`${API_BASE}?userId=${encodeURIComponent(userId)}`, {
                credentials: "omit",
                cache: "no-store"
            });
            if (res.status === 404) {
                badgeCache.set(userId, {
                    data: null,
                    time: Date.now()
                });
                return null;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            badgeCache.set(userId, {
                data: data,
                time: Date.now()
            });
            return data;
        } catch (e) {
            log("Fetch error:", e.message);
            return null;
        }
    }
    function makeBadge(data, userId, ownerUsername) {
        const style = data.style || {};
        const shape = style.iconShape || "circle";
        const hoverFx = style.hoverEffect || "none";
        const glowColor = style.glowColor || "#ffffff";
        const iconSize = style.iconSize || 22;
        const badgeTitle = data.description || "Custom Badge";
        const img = document.createElement("img");
        img.src = data.imageUrl;
        img.alt = badgeTitle;
        img.referrerPolicy = "no-referrer";
        img.className = "cb-badge-img cb-injected-badge";
        img.dataset.cbUserId = userId;
        if (ownerUsername) img.dataset.cbOwnerUsername = ownerUsername;
        if (hoverFx === "scale") img.classList.add("cb-hover-scale");
        if (hoverFx === "glow") img.classList.add("cb-hover-glow");
        if (data.link) img.classList.add("cb-clickable");
        const radius = shape === "circle" ? "50%" : shape === "rounded" ? "6px" : "0";
        Object.assign(img.style, {
            width: `${iconSize}px`,
            height: `${iconSize}px`,
            borderRadius: radius,
            marginLeft: "4px"
        });
        if (hoverFx === "scale") {
            img.addEventListener("mouseenter", () => {
                img.style.transform = "scale(1.15)";
            });
            img.addEventListener("mouseleave", () => {
                img.style.transform = "";
            });
        } else if (hoverFx === "glow") {
            img.addEventListener("mouseenter", () => {
                img.style.filter = `drop-shadow(0 0 6px ${glowColor})`;
            });
            img.addEventListener("mouseleave", () => {
                img.style.filter = "";
            });
        }
        img.addEventListener("mouseenter", () => {
            const rect = img.getBoundingClientRect();
            showTooltip(badgeTitle, rect);
        });
        img.addEventListener("mouseleave", hideTooltip);
        img.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            if (_popupOpenFor === img) {
                hidePopup();
            } else {
                showBadgePopup(img, data.imageUrl, data.description || "Custom Badge", img.dataset.cbOwnerUsername || null, style);
            }
        });
        return img;
    }
    async function process(root) {
        if (root.hasAttribute(MARKER)) return;
        const userId = getUserId(root);
        if (!userId) return;
        root.setAttribute(MARKER, "1");
        const data = await fetchBadge(userId);
        if (!data || !data.imageUrl) {
            log("No remote badge for", userId);
            return;
        }
        let container = root.querySelector('div[aria-label="User Badges"]');
        if (!container) {
            const nameEl = root.querySelector('h1, [class*="nameTag"], [class*="nickname"]');
            if (!nameEl) return;
            container = document.createElement("div");
            container.setAttribute("aria-label", "User Badges");
            container.setAttribute("role", "group");
            container.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:6px 0;";
            const parent = nameEl.closest("div[class]") || nameEl.parentElement;
            if (parent && parent.nextSibling) {
                parent.parentNode.insertBefore(container, parent.nextSibling);
            } else {
                return;
            }
        }
        container.querySelectorAll(".cb-injected-badge").forEach(el => el.remove());
        const ownerUsername = getOwnerUsername(root);
        container.appendChild(makeBadge(data, userId, ownerUsername));
        log("Injected remote badge for", userId);
    }
    function scan() {
        const roots = new Set;
        [ '[class*="userProfileModalInner"]', '[class*="userProfileModal"]', '[class*="userPopoutInner"]', '[class*="userPopout"]', '[class*="profilePanel"]', '[class*="accountProfilePopoutWrapper"]', '[role="dialog"]' ].forEach(sel => document.querySelectorAll(sel).forEach(el => roots.add(el)));
        document.querySelectorAll('img[src*="avatars"]').forEach(img => {
            if (img.getBoundingClientRect().width >= 64) {
                const p = img.closest("[class]");
                if (p) roots.add(p);
            }
        });
        document.querySelectorAll('div[aria-label="User Badges"]').forEach(badgesEl => {
            let anc = badgesEl;
            for (let i = 0; i < 8 && anc.parentElement; i++) {
                anc = anc.parentElement;
                if (anc.querySelector('img[src*="cdn.discordapp.com/avatars/"]')) break;
            }
            roots.add(anc);
        });
        roots.forEach(process);
    }
    function headerBarHtml() {
        return `\n            <section style="background:#000;border-bottom:1px solid rgba(255,255,255,0.06);flex-shrink:0;display:flex;align-items:center;height:48px;padding:0 16px;font-family:'gg sans','Noto Sans','Helvetica Neue',Helvetica,Arial,sans-serif;">\n                <svg aria-hidden="true" width="20" height="20" fill="none" viewBox="0 0 24 24" style="color:#949BA4;flex-shrink:0;margin-right:12px;">\n                    <path fill="currentColor" d="M4 13h6a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1zm1-8h4v6H5V5zm9 16h6a1 1 0 001-1v-8a1 1 0 00-1-1h-6a1 1 0 00-1 1v8a1 1 0 001 1zm1-8h4v6h-4v-6zM4 21h6a1 1 0 001-1v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v4a1 1 0 001 1zm1-4h4v2H5v-2zm9-8h6a1 1 0 001-1V4a1 1 0 00-1-1h-6a1 1 0 00-1 1v4a1 1 0 001 1zm1-4h4v2h-4V5z"/>\n                </svg>\n                <div id="ub-tabs-container" role="tablist" style="display:flex;align-items:stretch;height:100%;">\n                    <div class="ub-dash-tab" id="ub-tab-badges" role="tab" tabindex="0" aria-selected="true" data-tab="badges"\n                         style="display:flex;align-items:center;padding:0 16px;cursor:pointer;border-bottom:2px solid #5865F2;color:#fff;font-size:15px;font-weight:600;">\n                        Custom Badges\n                    </div>\n                    <div class="ub-dash-tab" id="ub-tab-style" role="tab" tabindex="0" aria-selected="false" data-tab="style"\n                         style="display:flex;align-items:center;padding:0 16px;cursor:pointer;border-bottom:2px solid transparent;color:#949BA4;font-size:15px;font-weight:500;">\n                        Style Studio\n                    </div>\n                </div>\n                <div id="ub-dash-close" role="button" aria-label="Close Dashboard" tabindex="0"\n                     style="margin-left:auto;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:4px;cursor:pointer;color:#949BA4;flex-shrink:0;">\n                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>\n                </div>\n            </section>\n        `;
    }
    function dashboardHtml(presetLabels = []) {
        const icon = {
            toggle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="15.5" cy="12" r="2.75" fill="currentColor" stroke="none"/></svg>`,
            pencil: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5l1-4L16 5l3 3-10.5 10.5-4 1z"/><path d="M14 6.5l3 3"/></svg>`,
            eye: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12c2.5-4.2 6.2-6.5 10-6.5s7.5 2.3 10 6.5c-2.5 4.2-6.2 6.5-10 6.5S4.5 16.2 2 12z"/><circle cx="12" cy="12" r="2.75"/></svg>`,
            bolt: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6 8 12 2 18"/><polyline points="9 6 15 12 9 18"/><polyline points="16 6 22 12 16 18"/></svg>`,
            grid: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
            box: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L20 6.5V15.5L12 20L4 15.5V6.5L12 2Z"/><path d="M12 2V11M12 11L20 6.5M12 11L4 6.5"/><path d="M14.5 5L14.5 9L17.5 7.5L17.5 3.7Z"/><path d="M6 13.2l3.4 1.7M6 15l2.6 1.3"/></svg>`,
            check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
            trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`,
            plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
            shield: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><polyline points="9 12 11 14 15 10"/></svg>`,
            clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>`
        };
        return `\n            <style>\n            \n                #ub-dashboard-settings {\n                    --ub-bg: #000000;\n                    --ub-bg-card: #050505;\n                    --ub-bg-card-hover: #0a0a0a;\n                    --ub-bg-input: #0a0a0a;\n                    --ub-bg-input-hover: #0f0f0f;\n                    --ub-border: rgba(255, 255, 255, 0.06);\n                    --ub-border-strong: rgba(255, 255, 255, 0.10);\n                    --ub-text: #F2F3F5;\n                    --ub-text-secondary: #DBDEE1;\n                    --ub-text-muted: #B5BAC1;\n                    --ub-text-faint: #949BA4;\n                    --ub-accent: #5865F2;\n                    --ub-accent-2: #7289DA;\n                    --ub-accent-hover: #4752C4;\n                    --ub-accent-soft: rgba(88, 101, 242, 0.15);\n                    --ub-danger: #DA373C;\n                    --ub-positive: #23A55A;\n                    --ub-warning: #F0B232;\n                    --ub-radius-lg: 12px;\n                    --ub-radius: 8px;\n                    --ub-radius-sm: 6px;\n                    --ub-font: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n                    background-color: var(--ub-bg);\n                    color: var(--ub-text);\n                    font-family: var(--ub-font);\n                    font-size: 16px;\n                    line-height: 1.5;\n                    -webkit-font-smoothing: antialiased;\n                }\n                #ub-dashboard-settings * {\n                    font-family: var(--ub-font);\n                    box-sizing: border-box;\n                }\n                #ub-dashboard-settings .ub-section {\n                    background: var(--ub-bg-card);\n                    border: 1px solid var(--ub-border);\n                    border-radius: var(--ub-radius-lg);\n                    padding: 20px;\n                    margin-bottom: 16px;\n                    transition: border-color 150ms ease, background-color 150ms ease;\n                }\n                #ub-dashboard-settings .ub-section:hover {\n                    border-color: var(--ub-border-strong);\n                }\n                #ub-dashboard-settings .ub-section-head {\n                    display: flex;\n                    align-items: center;\n                    gap: 10px;\n                    margin-bottom: 16px;\n                    padding-left: 10px;\n                    border-left: 2px solid var(--ub-accent-2);\n                }\n                #ub-dashboard-settings .ub-section-icon {\n                    display: flex;\n                    align-items: center;\n                    justify-content: center;\n                    width: 20px;\n                    height: 20px;\n                    color: var(--ub-accent-2);\n                    flex-shrink: 0;\n                    opacity: 0.9;\n                }\n                #ub-dashboard-settings .ub-eyebrow {\n                    font-size: 12px;\n                    font-weight: 700;\n                    letter-spacing: 0.03em;\n                    text-transform: uppercase;\n                    color: var(--ub-text-muted);\n                }\n                #ub-dashboard-settings .ub-section-title {\n                    font-size: 16px;\n                    font-weight: 600;\n                    color: var(--ub-text);\n                    margin: 0;\n                }\n                #ub-dashboard-settings .ub-field {\n                    margin-bottom: 16px;\n                }\n                #ub-dashboard-settings .ub-field:last-child {\n                    margin-bottom: 0;\n                }\n                #ub-dashboard-settings .ub-label {\n                    display: block;\n                    font-size: 12px;\n                    font-weight: 700;\n                    letter-spacing: 0.02em;\n                    text-transform: uppercase;\n                    color: var(--ub-text-muted);\n                    margin-bottom: 8px;\n                }\n                #ub-dashboard-settings .ub-hint {\n                    font-size: 14px;\n                    line-height: 1.5;\n                    color: var(--ub-text-faint);\n                    margin: 0 0 14px;\n                }\n                #ub-dashboard-settings .ub-write-budget-card {\n                    display: flex;\n                    flex-direction: column;\n                    gap: 8px;\n                }\n                #ub-dashboard-settings .ub-write-budget-toprow {\n                    display: flex;\n                    align-items: baseline;\n                    justify-content: space-between;\n                    gap: 10px;\n                    flex-wrap: wrap;\n                }\n                #ub-dashboard-settings .ub-write-budget-count {\n                    font-size: 15px;\n                    font-weight: 600;\n                    color: var(--ub-text-secondary);\n                }\n                #ub-dashboard-settings .ub-write-budget-reset {\n                    font-size: 13px;\n                    font-weight: 500;\n                    color: var(--ub-text-faint);\n                }\n                #ub-dashboard-settings .ub-write-budget-bar {\n                    height: 6px;\n                    border-radius: 999px;\n                    background: var(--ub-bg-input, rgba(255,255,255,0.06));\n                    overflow: hidden;\n                }\n                #ub-dashboard-settings .ub-write-budget-bar-fill {\n                    height: 100%;\n                    border-radius: 999px;\n                    background: var(--ub-positive);\n                    width: 100%;\n                    transition: width 200ms ease, background-color 200ms ease;\n                }\n                #ub-dashboard-settings .ub-write-budget-card.ub-write-budget-exhausted .ub-write-budget-count {\n                    color: var(--ub-warning);\n                }\n                #ub-dashboard-settings .ub-write-budget-card.ub-write-budget-exhausted .ub-write-budget-reset {\n                    color: var(--ub-warning);\n                }\n                #ub-dashboard-settings .ub-write-budget-card.ub-write-budget-exhausted .ub-write-budget-bar-fill {\n                    background: var(--ub-warning);\n                }\n                #ub-dashboard-settings .ub-input,\n                #ub-dashboard-settings .ub-select {\n                    width: 100%;\n                    background: rgba(255, 255, 255, 0.04);\n                    backdrop-filter: blur(12px);\n                    -webkit-backdrop-filter: blur(12px);\n                    border: 1px solid rgba(255, 255, 255, 0.10);\n                    border-top-color: rgba(255, 255, 255, 0.16);\n                    border-radius: var(--ub-radius-sm);\n                    padding: 10px 12px;\n                    min-height: 40px;\n                    color: var(--ub-text);\n                    font-size: 14px;\n                    font-weight: 400;\n                    box-shadow:\n                        inset 0 1px 0 rgba(255, 255, 255, 0.07),\n                        0 2px 8px rgba(0, 0, 0, 0.35);\n                    transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;\n                }\n                #ub-dashboard-settings .ub-input::placeholder {\n                    color: var(--ub-text-faint);\n                }\n                #ub-dashboard-settings .ub-input:hover,\n                #ub-dashboard-settings .ub-select:hover {\n                    background: rgba(255, 255, 255, 0.07);\n                    border-color: rgba(255, 255, 255, 0.18);\n                    border-top-color: rgba(255, 255, 255, 0.24);\n                    box-shadow:\n                        inset 0 1px 0 rgba(255, 255, 255, 0.10),\n                        0 2px 12px rgba(0, 0, 0, 0.4);\n                }\n                #ub-dashboard-settings .ub-input:focus-visible,\n                #ub-dashboard-settings .ub-select:focus-visible {\n                    outline: none;\n                    background: rgba(255, 255, 255, 0.06);\n                    border-color: rgba(88, 101, 242, 0.6);\n                    border-top-color: rgba(88, 101, 242, 0.8);\n                    box-shadow:\n                        inset 0 1px 0 rgba(255, 255, 255, 0.08),\n                        0 0 0 3px rgba(88, 101, 242, 0.18),\n                        0 2px 12px rgba(0, 0, 0, 0.4);\n                }\n                #ub-dashboard-settings .ub-select {\n                    cursor: pointer;\n                    appearance: none;\n                    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23949ba4' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>");\n                    background-repeat: no-repeat;\n                    background-position: right 12px center;\n                    padding-right: 36px;\n                }\n                #ub-dashboard-settings .ub-btn {\n                    appearance: none;\n                    display: inline-flex;\n                    align-items: center;\n                    justify-content: center;\n                    gap: 6px;\n                    border: none;\n                    border-radius: var(--ub-radius-sm);\n                    padding: 0 16px;\n                    min-height: 38px;\n                    font-size: 14px;\n                    font-weight: 600;\n                    cursor: pointer;\n                    color: var(--ub-text-secondary);\n                    background: #101010;\n                    border: 1px solid var(--ub-border-strong);\n                    transition: background-color 120ms ease, border-color 120ms ease, transform 80ms ease, color 120ms ease;\n                }\n                #ub-dashboard-settings .ub-btn:hover {\n                    background: #161616;\n                    border-color: rgba(255, 255, 255, 0.2);\n                    color: var(--ub-text);\n                }\n                #ub-dashboard-settings .ub-btn:active {\n                    transform: scale(0.97);\n                }\n                #ub-dashboard-settings .ub-btn:focus-visible {\n                    outline: none;\n                    box-shadow: 0 0 0 3px var(--ub-accent-soft);\n                    border-color: var(--ub-accent);\n                }\n                #ub-dashboard-settings .ub-btn-primary {\n                    background: var(--ub-accent);\n                    border-color: var(--ub-accent);\n                    color: #ffffff;\n                }\n                #ub-dashboard-settings .ub-btn-primary:hover {\n                    background: var(--ub-accent-hover);\n                    border-color: var(--ub-accent-hover);\n                    color: #ffffff;\n                }\n                #ub-dashboard-settings .ub-btn-danger {\n                    background: transparent;\n                    border-color: var(--ub-border-strong);\n                    color: var(--ub-danger);\n                }\n                #ub-dashboard-settings .ub-btn-danger:hover {\n                    background: rgba(218, 55, 60, 0.12);\n                    border-color: var(--ub-danger);\n                    color: #ff5c60;\n                }\n                #ub-dashboard-settings .ub-btn-danger-solid {\n                    background: var(--ub-danger);\n                    border-color: var(--ub-danger);\n                    color: #ffffff;\n                }\n                #ub-dashboard-settings .ub-btn-danger-solid:hover {\n                    background: #c42f33;\n                    border-color: #c42f33;\n                    color: #ffffff;\n                }\n                #ub-dashboard-settings .ub-btn-danger-solid:disabled {\n                    opacity: 0.5;\n                    cursor: default;\n                }\n                #ub-dashboard-settings .ub-btn-row {\n                    display: flex;\n                    flex-wrap: wrap;\n                    align-items: center;\n                    gap: 8px;\n                    margin-bottom: 16px;\n                }\n                #ub-dashboard-settings .ub-btn-link {\n                    appearance: none;\n                    background: none;\n                    border: none;\n                    padding: 0 4px;\n                    min-height: 38px;\n                    font-size: 13px;\n                    font-weight: 600;\n                    color: var(--ub-accent-2);\n                    cursor: pointer;\n                    transition: color 120ms ease;\n                }\n                #ub-dashboard-settings .ub-btn-link:hover {\n                    color: var(--ub-accent);\n                    text-decoration: underline;\n                }\n                #ub-dashboard-settings .ub-btn-link:focus-visible {\n                    outline: none;\n                    text-decoration: underline;\n                }\n            \n                #ub-dashboard-settings .ub-token-wrap {\n                    position: relative;\n                }\n                #ub-dashboard-settings .ub-token-wrap input#ub-session-token::selection {\n                    color: transparent;\n                    background: var(--ub-accent-soft);\n                }\n                #ub-dashboard-settings .ub-token-wrap input#ub-session-token {\n                    color: transparent;\n                    caret-color: var(--ub-text);\n                \n                    height: 40px;\n                    padding-top: 0;\n                    padding-bottom: 0;\n                \n                    font-family: var(--font-code, Consolas, "Courier New", monospace);\n                    font-size: 14px;\n                    letter-spacing: 0;\n                }\n                #ub-dashboard-settings .ub-token-wrap input#ub-session-token.ub-token-empty {\n                    color: var(--ub-text-faint);\n                }\n                #ub-dashboard-settings .ub-token-overlay {\n                    position: absolute;\n                    inset: 0;\n                    height: 40px;\n                \n                    border: 1px solid transparent;\n                    padding: 0 12px;\n                    pointer-events: none;\n                    overflow: hidden;\n                    font-family: var(--font-code, Consolas, "Courier New", monospace);\n                    font-size: 14px;\n                    line-height: 1;\n                    letter-spacing: 0;\n                }\n                #ub-dashboard-settings .ub-token-overlay-inner {\n                    display: block;\n                    height: 40px;\n                    line-height: 40px;\n                    white-space: nowrap;\n                    overflow-wrap: normal;\n                    word-break: keep-all;\n                    word-wrap: normal;\n                \n                }\n                #ub-dashboard-settings .ub-token-overlay,\n                #ub-dashboard-settings .ub-token-overlay * {\n                    font-family: var(--font-code, Consolas, "Courier New", monospace);\n                }\n                #ub-dashboard-settings .ub-token-char {\n                    position: relative;\n                    display: inline-block;\n                    vertical-align: middle;\n                    white-space: nowrap;\n                    overflow-wrap: normal;\n                    word-break: keep-all;\n                    word-wrap: normal;\n                \n                    width: 1ch;\n                    height: 1em;\n                    line-height: 1;\n                    text-align: center;\n                }\n                #ub-dashboard-settings .ub-token-glyph {\n                    position: absolute;\n                    inset: 0;\n                    display: flex;\n                    align-items: center;\n                    justify-content: center;\n                    opacity: 0;\n                    transition: opacity 240ms ease, transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1);\n                }\n                #ub-dashboard-settings .ub-token-glyph-letter {\n                    transform: translateY(-8px) scale(0.3) rotate(-20deg);\n                }\n                #ub-dashboard-settings .ub-token-glyph-dot {\n                    transform: translateY(8px) scale(0.3) rotate(20deg);\n                }\n                #ub-dashboard-settings .ub-token-glyph.ub-token-shown {\n                    opacity: 1;\n                    transform: translateY(0) scale(1) rotate(0deg);\n                }\n            \n                #ub-guidelines-backdrop {\n                    display: none;\n                    position: fixed;\n                    inset: 0;\n                    z-index: 9998;\n                    background: rgba(0, 0, 0, 0.6);\n                    backdrop-filter: blur(3px);\n                    -webkit-backdrop-filter: blur(3px);\n                    opacity: 0;\n                    transition: opacity 260ms ease;\n                    pointer-events: none;\n                }\n                #ub-guidelines-backdrop.ub-backdrop-open {\n                    display: block;\n                    opacity: 1;\n                    pointer-events: auto;\n                }\n            \n            \n                .ub-guidelines-panel {\n                    position: fixed;\n                    top: 50%;\n                    left: 50%;\n                    transform: translate(-50%, -50%) scale(0.94);\n                    width: 500px;\n                    max-width: 92vw;\n                    max-height: 84vh;\n                    z-index: 9999;\n                    background: #111214;\n                    border: 1px solid rgba(255,255,255,0.10);\n                    border-radius: 14px;\n                    box-shadow:\n                        0 0 0 1px rgba(255,255,255,0.04),\n                        0 8px 16px rgba(0,0,0,0.4),\n                        0 24px 56px rgba(0,0,0,0.7);\n                    display: flex;\n                    flex-direction: column;\n                    padding: 28px 32px 32px;\n                    color: #F2F3F5;\n                    font-size: 14px;\n                    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n                    line-height: 1.6;\n                    overflow-y: auto;\n                    opacity: 0;\n                    transform-origin: center center;\n                    pointer-events: none;\n                    scrollbar-width: thin;\n                    scrollbar-color: #4a4a50 #1a1a1d;\n                    box-sizing: border-box;\n                }\n                .ub-guidelines-panel * {\n                    box-sizing: border-box;\n                    font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n                }\n                .ub-guidelines-panel::-webkit-scrollbar {\n                    width: 10px;\n                }\n                .ub-guidelines-panel::-webkit-scrollbar-track {\n                    background: #1a1a1d;\n                    border-radius: 8px;\n                }\n                .ub-guidelines-panel::-webkit-scrollbar-thumb {\n                    background: #4a4a50;\n                    border-radius: 8px;\n                    border: 2px solid #1a1a1d;\n                }\n                .ub-guidelines-panel::-webkit-scrollbar-thumb:hover {\n                    background: #5c5c63;\n                }\n                .ub-guidelines-panel.ub-panel-open {\n                    transform: translate(-50%, -50%) scale(1);\n                    opacity: 1;\n                    pointer-events: auto;\n                    transition: transform 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 260ms ease-out;\n                }\n                .ub-guidelines-panel.ub-panel-closing {\n                    pointer-events: none;\n                    animation: ub-crt-off 340ms cubic-bezier(0.86, 0, 0.07, 1) forwards;\n                }\n                .ub-guidelines-panel.ub-panel-closing::after {\n                    content: "";\n                    position: absolute;\n                    inset: 0;\n                    background: #fff;\n                    opacity: 0;\n                    pointer-events: none;\n                    animation: ub-crt-flash 340ms ease-in forwards;\n                }\n                @keyframes ub-crt-off {\n                    0% { transform: translate(-50%, -50%) scaleY(1) scaleX(1); filter: brightness(1); opacity: 1; }\n                    45% { transform: translate(-50%, -50%) scaleY(0.015) scaleX(1); filter: brightness(2.2); opacity: 1; }\n                    70% { transform: translate(-50%, -50%) scaleY(0.015) scaleX(0.02); filter: brightness(2.6); opacity: 0.6; }\n                    100% { transform: translate(-50%, -50%) scaleY(0.015) scaleX(0.0001); filter: brightness(3); opacity: 0; }\n                }\n                @keyframes ub-crt-flash {\n                    0% { opacity: 0; }\n                    35% { opacity: 0.55; }\n                    55% { opacity: 0.15; }\n                    100% { opacity: 0; }\n                }\n                .ub-guidelines-close {\n                    position: absolute;\n                    top: 14px;\n                    right: 18px;\n                    background: none;\n                    border: none;\n                    color: #949BA4;\n                    font-size: 20px;\n                    cursor: pointer;\n                    line-height: 1;\n                    z-index: 1;\n                }\n                .ub-guidelines-close:hover {\n                    color: #F2F3F5;\n                }\n                .ub-guidelines-h2 {\n                    font-size: 20px;\n                    font-weight: 800;\n                    margin-bottom: 10px;\n                    color: #F2F3F5;\n                    letter-spacing: -0.01em;\n                    line-height: 1.3;\n                }\n                .ub-guidelines-h3 {\n                    font-size: 15px;\n                    font-weight: 700;\n                    margin: 18px 0 6px;\n                    color: #F2F3F5;\n                }\n                .ub-guidelines-code {\n                    display: block;\n                    background: #0a0a0a;\n                    border: 1px solid rgba(255,255,255,0.08);\n                    border-radius: 6px;\n                    padding: 14px 16px;\n                    font-family: "Consolas", "Menlo", "Courier New", monospace;\n                    font-size: 13px;\n                    line-height: 1.65;\n                    white-space: pre;\n                    overflow-x: auto;\n                    margin: 8px 0;\n                }\n                .ub-guidelines-code .k { color: #9cdcfe; }\n                .ub-guidelines-code .s { color: #ce9178; }\n                .ub-guidelines-code .n { color: #b5cea8; }\n                .ub-guidelines-code .p { color: #808080; }\n                .ub-guidelines-inline-code {\n                    background: #0a0a0a;\n                    border: 1px solid rgba(255,255,255,0.08);\n                    border-radius: 4px;\n                    padding: 1px 5px;\n                    font-family: "Consolas", "Menlo", "Courier New", monospace;\n                    font-size: 12px;\n                    color: #ce9178;\n                }\n                .ub-guidelines-note {\n                    background: #0f0f0f;\n                    border-radius: 6px;\n                    padding: 8px 12px;\n                    margin: 8px 0;\n                    border-left: 3px solid #949BA4;\n                    color: #DBDEE1;\n                    font-size: 13px;\n                }\n                .ub-guidelines-warn {\n                    background: #0f0f0f;\n                    border-radius: 6px;\n                    padding: 8px 12px;\n                    margin: 8px 0;\n                    border-left: 3px solid #F0B232;\n                    color: #DBDEE1;\n                    font-size: 13px;\n                }\n                .ub-guidelines-panel ul,\n                .ub-guidelines-panel ol {\n                    margin: 6px 0 0 18px;\n                    padding: 0;\n                    color: #DBDEE1;\n                    font-size: 13.5px;\n                }\n                .ub-guidelines-panel li {\n                    margin-bottom: 4px;\n                }\n                .ub-guidelines-panel a {\n                    color: #7289DA;\n                    text-decoration: none;\n                }\n                .ub-guidelines-panel a:hover {\n                    text-decoration: underline;\n                }\n                .ub-guidelines-panel strong {\n                    color: #F2F3F5;\n                    font-weight: 700;\n                }\n                .ub-guidelines-panel .ub-btn {\n                    appearance: none;\n                    display: inline-flex;\n                    align-items: center;\n                    justify-content: center;\n                    gap: 6px;\n                    border-radius: 6px;\n                    padding: 0 16px;\n                    min-height: 38px;\n                    font-size: 14px;\n                    font-weight: 600;\n                    cursor: pointer;\n                    transition: background-color 120ms ease, transform 80ms ease;\n                }\n                .ub-guidelines-panel .ub-btn-primary {\n                    background: #5865F2;\n                    border: 1px solid #5865F2;\n                    color: #ffffff;\n                }\n                .ub-guidelines-panel .ub-btn-primary:hover {\n                    background: #4752C4;\n                    border-color: #4752C4;\n                }\n                .ub-guidelines-panel .ub-btn-primary:active {\n                    transform: scale(0.97);\n                }\n                #ub-dashboard-settings .ub-preview-empty {\n                    font-size: 13px;\n                    color: var(--ub-text-faint);\n                    padding: 4px 0;\n                }\n                #ub-dashboard-settings .ub-preview-row {\n                    display: flex;\n                    align-items: center;\n                    gap: 10px;\n                    margin-bottom: 16px;\n                }\n                #ub-dashboard-settings .ub-preview-row-icon {\n                    object-fit: contain;\n                    flex-shrink: 0;\n                    display: block;\n                }\n                #ub-dashboard-settings .ub-preview-row-label {\n                    font-size: 12px;\n                    color: var(--ub-text-faint);\n                }\n                #ub-dashboard-settings .ub-popup-card {\n                    border-radius: 8px;\n                    padding: 20px 28px;\n                    text-align: center;\n                    min-width: 180px;\n                    width: fit-content;\n                    margin: 0;\n                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);\n                    font-family: var(--font-primary, "gg sans", sans-serif);\n                    transition: background 160ms ease;\n                }\n                #ub-dashboard-settings .ub-popup-card img {\n                    width: 64px;\n                    height: 64px;\n                    object-fit: cover;\n                    margin: 0 auto 14px;\n                    display: block;\n                }\n                #ub-dashboard-settings .ub-popup-name {\n                    font-weight: 800;\n                    font-size: 16px;\n                    letter-spacing: 0.3px;\n                    line-height: 1.2;\n                }\n                #ub-dashboard-settings .ub-popup-by {\n                    font-size: 12px;\n                    color: #949ba4;\n                    margin-top: 4px;\n                }\n                #ub-dashboard-settings .ub-preview-warning {\n                    font-size: 11px;\n                    color: #f0b132;\n                    margin-top: 12px;\n                    line-height: 1.5;\n                }\n                #ub-dashboard-settings .ub-badge-row {\n                    display: flex;\n                    align-items: center;\n                    gap: 12px;\n                    padding: 10px 14px;\n                    background: var(--ub-bg-input);\n                    border: 1px solid var(--ub-border);\n                    border-radius: var(--ub-radius-sm);\n                    margin-bottom: 8px;\n                    transition: background-color 120ms ease, border-color 120ms ease;\n                }\n                #ub-dashboard-settings .ub-badge-row:hover {\n                    background: var(--ub-bg-input-hover);\n                    border-color: var(--ub-border-strong);\n                }\n                #ub-dashboard-settings .ub-badge-row.ub-badge-active {\n                    background: rgba(88, 101, 242, 0.10);\n                    border-color: rgba(88, 101, 242, 0.45);\n                    box-shadow: inset 0 0 0 1px rgba(88, 101, 242, 0.15);\n                }\n                #ub-dashboard-settings .ub-badge-thumb {\n                    width: 28px;\n                    height: 28px;\n                    border-radius: 50%;\n                    object-fit: cover;\n                    flex-shrink: 0;\n                    background: rgba(255,255,255,0.06);\n                    border: 1px solid var(--ub-border-strong);\n                }\n                #ub-dashboard-settings .ub-badge-row-name {\n                    flex: 1;\n                    font-size: 14px;\n                    font-weight: 500;\n                    color: var(--ub-text);\n                    white-space: nowrap;\n                    overflow: hidden;\n                    text-overflow: ellipsis;\n                }\n                #ub-dashboard-settings .ub-badge-row-name .ub-badge-active-tag {\n                    font-size: 12px;\n                    font-weight: 600;\n                    color: var(--ub-text-muted);\n                    margin-left: 6px;\n                }\n                #ub-dashboard-settings .ub-badge-row-actions {\n                    display: flex;\n                    align-items: center;\n                    gap: 6px;\n                    flex-shrink: 0;\n                }\n                #ub-dashboard-settings .ub-badge-use-btn {\n                    appearance: none;\n                    display: inline-flex;\n                    align-items: center;\n                    justify-content: center;\n                    border-radius: var(--ub-radius-sm);\n                    padding: 0 14px;\n                    min-height: 32px;\n                    font-size: 13px;\n                    font-weight: 600;\n                    cursor: pointer;\n                    background: var(--ub-accent);\n                    border: 1px solid var(--ub-accent);\n                    color: #ffffff;\n                    transition: background-color 120ms ease, border-color 120ms ease, transform 80ms ease;\n                }\n                #ub-dashboard-settings .ub-badge-use-btn:hover {\n                    background: var(--ub-accent-hover);\n                    border-color: var(--ub-accent-hover);\n                }\n                #ub-dashboard-settings .ub-badge-use-btn:active { transform: scale(0.96); }\n                #ub-dashboard-settings .ub-badge-delete-btn {\n                    appearance: none;\n                    display: inline-flex;\n                    align-items: center;\n                    justify-content: center;\n                    border-radius: var(--ub-radius-sm);\n                    padding: 0 14px;\n                    min-height: 32px;\n                    font-size: 13px;\n                    font-weight: 600;\n                    cursor: pointer;\n                    background: var(--ub-danger);\n                    border: 1px solid var(--ub-danger);\n                    color: #ffffff;\n                    transition: background-color 120ms ease, border-color 120ms ease, transform 80ms ease;\n                }\n                #ub-dashboard-settings .ub-badge-delete-btn:hover {\n                    background: #c42f33;\n                    border-color: #c42f33;\n                }\n                #ub-dashboard-settings .ub-badge-delete-btn:active { transform: scale(0.96); }\n                #ub-dashboard-settings #ub-my-badges-list:empty::after {\n                    content: "No saved badges yet";\n                    font-size: 13px;\n                    color: var(--ub-text-faint);\n                    font-style: italic;\n                    display: block;\n                    padding: 4px 0 10px;\n                }\n                #ub-dashboard-settings .ub-divider {\n                    display: none;\n                }\n                #ub-dashboard-settings a:focus-visible,\n                #ub-dashboard-settings button:focus-visible {\n                    outline: none;\n                }\n                @keyframes ub-gradient-flow {\n                    0%   { background-position: 0% 50%; }\n                    20%  { background-position: 80% 50%; }\n                    40%  { background-position: 160% 50%; }\n                    60%  { background-position: 240% 50%; }\n                    80%  { background-position: 320% 50%; }\n                    100% { background-position: 400% 50%; }\n                }\n                .ub-gradient-text {\n                    background: linear-gradient(90deg,\n                        #2d3899,\n                        #3a45a8,\n                        #4752c4,\n                        #4f5ed6,\n                        #5865f2,\n                        #5f6ef3,\n                        #6677f4,\n                        #7289da,\n                        #6677f4,\n                        #5f6ef3,\n                        #5865f2,\n                        #4f5ed6,\n                        #4752c4,\n                        #3a45a8,\n                        #2d3899\n                    );\n                    background-size: 400% auto;\n                    -webkit-background-clip: text;\n                    background-clip: text;\n                    -webkit-text-fill-color: transparent;\n                    color: transparent;\n                    animation: ub-gradient-flow 14s ease-in-out infinite;\n                }\n                #ub-dashboard-settings .ub-dropdown {\n                    position: relative;\n                    width: 100%;\n                    user-select: none;\n                }\n                #ub-dashboard-settings .ub-dropdown-trigger {\n                    display: flex;\n                    align-items: center;\n                    justify-content: space-between;\n                    width: 100%;\n                    background: rgba(255, 255, 255, 0.04);\n                    backdrop-filter: blur(12px);\n                    -webkit-backdrop-filter: blur(12px);\n                    border: 1px solid rgba(255, 255, 255, 0.10);\n                    border-top-color: rgba(255, 255, 255, 0.16);\n                    border-radius: var(--ub-radius-sm);\n                    padding: 10px 12px;\n                    min-height: 40px;\n                    color: var(--ub-text);\n                    font-size: 14px;\n                    cursor: pointer;\n                    box-shadow:\n                        inset 0 1px 0 rgba(255, 255, 255, 0.07),\n                        0 2px 8px rgba(0, 0, 0, 0.35);\n                    transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;\n                }\n                #ub-dashboard-settings .ub-dropdown-trigger:hover {\n                    background: rgba(255, 255, 255, 0.07);\n                    border-color: rgba(255, 255, 255, 0.18);\n                    border-top-color: rgba(255, 255, 255, 0.24);\n                }\n                #ub-dashboard-settings .ub-dropdown.open .ub-dropdown-trigger {\n                    border-color: rgba(88, 101, 242, 0.6);\n                    border-top-color: rgba(88, 101, 242, 0.8);\n                    box-shadow:\n                        inset 0 1px 0 rgba(255, 255, 255, 0.08),\n                        0 0 0 3px rgba(88, 101, 242, 0.18);\n                    border-bottom-left-radius: 0;\n                    border-bottom-right-radius: 0;\n                }\n                #ub-dashboard-settings .ub-dropdown-arrow {\n                    flex-shrink: 0;\n                    color: var(--ub-text-faint);\n                    transition: transform 180ms ease;\n                }\n                #ub-dashboard-settings .ub-dropdown.open .ub-dropdown-arrow {\n                    transform: rotate(180deg);\n                }\n                #ub-dashboard-settings .ub-dropdown-menu {\n                    display: none;\n                    position: absolute;\n                    top: 100%;\n                    left: 0;\n                    right: 0;\n                    z-index: 999;\n                    background: rgba(10, 10, 18, 0.82);\n                    backdrop-filter: blur(20px);\n                    -webkit-backdrop-filter: blur(20px);\n                    border: 1px solid rgba(88, 101, 242, 0.4);\n                    border-top: none;\n                    border-bottom-left-radius: var(--ub-radius-sm);\n                    border-bottom-right-radius: var(--ub-radius-sm);\n                    box-shadow:\n                        0 8px 32px rgba(0, 0, 0, 0.6),\n                        inset 0 0 0 1px rgba(255, 255, 255, 0.04);\n                    overflow: hidden;\n                }\n                #ub-dashboard-settings .ub-dropdown.open .ub-dropdown-menu {\n                    display: block;\n                }\n                #ub-dashboard-settings .ub-dropdown-option {\n                    padding: 10px 12px;\n                    font-size: 14px;\n                    color: var(--ub-text-secondary);\n                    cursor: pointer;\n                    transition: background 100ms ease, color 100ms ease;\n                }\n                #ub-dashboard-settings .ub-dropdown-option:hover {\n                    background: rgba(88, 101, 242, 0.2);\n                    color: var(--ub-text);\n                }\n                #ub-dashboard-settings .ub-dropdown-option.selected {\n                    background: rgba(88, 101, 242, 0.3);\n                    color: #ffffff;\n                    font-weight: 600;\n                }\n                .ub-dash-tab { cursor: pointer; transition: color 120ms ease, border-bottom-color 120ms ease; }\n                .ub-dash-tab:not([aria-selected="true"]):hover { color: #DBDEE1 !important; }\n                .ub-tabpanel {\n                    opacity: 1;\n                    transform: translateY(0);\n                    transition: opacity 160ms ease, transform 160ms ease;\n                }\n                .ub-tabpanel.ub-hidden { display: none; }\n                .ub-tabpanel.ub-panel-fade-out {\n                    opacity: 0;\n                    transform: translateY(5px);\n                }\n                .ub-tabpanel.ub-panel-fade-in {\n                    opacity: 0;\n                    transform: translateY(-5px);\n                }\n                @media (prefers-reduced-motion: reduce) {\n                    .ub-tabpanel { transition: none; }\n                }\n                #ub-dashboard-settings .ub-choice-group {\n                    display: flex;\n                    flex-wrap: wrap;\n                    gap: 8px;\n                }\n                #ub-dashboard-settings .ub-choice {\n                    appearance: none;\n                    display: inline-flex;\n                    align-items: center;\n                    gap: 8px;\n                    flex: 1 1 0;\n                    justify-content: center;\n                    min-height: 40px;\n                    padding: 0 12px;\n                    background: rgba(255, 255, 255, 0.04);\n                    border: 1px solid rgba(255, 255, 255, 0.10);\n                    border-radius: var(--ub-radius-sm);\n                    color: var(--ub-text-secondary);\n                    font-size: 13px;\n                    font-weight: 600;\n                    cursor: pointer;\n                    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;\n                }\n                #ub-dashboard-settings .ub-choice:hover {\n                    background: rgba(255, 255, 255, 0.07);\n                    border-color: rgba(255, 255, 255, 0.18);\n                    color: var(--ub-text);\n                }\n                #ub-dashboard-settings .ub-choice.selected {\n                    background: var(--ub-accent-soft);\n                    border-color: rgba(88, 101, 242, 0.6);\n                    color: #ffffff;\n                }\n                #ub-dashboard-settings .ub-choice:focus-visible {\n                    outline: none;\n                    box-shadow: 0 0 0 3px var(--ub-accent-soft);\n                }\n                @keyframes ub-preview-fade {\n                    0%, 100% { opacity: 1; }\n                    50% { opacity: 0.35; }\n                }\n                #ub-dashboard-settings #ub-popup-anim-group .ub-choice:hover {\n                    animation: ub-preview-fade 1100ms ease-in-out infinite;\n                }\n                @media (prefers-reduced-motion: reduce) {\n                    #ub-dashboard-settings #ub-popup-anim-group .ub-choice:hover {\n                        animation: none;\n                    }\n                }\n                #ub-dashboard-settings .ub-shape-swatch {\n                    display: block;\n                    width: 16px;\n                    height: 16px;\n                    flex-shrink: 0;\n                    background: currentColor;\n                    opacity: 0.9;\n                }\n                #ub-dashboard-settings .ub-color-row {\n                    display: flex;\n                    align-items: center;\n                    gap: 10px;\n                }\n                #ub-dashboard-settings .ub-color-input {\n                    appearance: none;\n                    -webkit-appearance: none;\n                    width: 40px;\n                    height: 40px;\n                    flex-shrink: 0;\n                    padding: 0;\n                    border: 2px solid rgba(255, 255, 255, 0.16);\n                    border-radius: 50%;\n                    cursor: pointer;\n                    background: none;\n                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);\n                    transition: border-color 120ms ease, transform 80ms ease;\n                }\n                #ub-dashboard-settings .ub-color-input:hover {\n                    border-color: rgba(255, 255, 255, 0.32);\n                }\n                #ub-dashboard-settings .ub-color-input:active {\n                    transform: scale(0.95);\n                }\n                #ub-dashboard-settings .ub-color-input::-webkit-color-swatch-wrapper {\n                    padding: 0;\n                    border-radius: 50%;\n                }\n                #ub-dashboard-settings .ub-color-input::-webkit-color-swatch {\n                    border: none;\n                    border-radius: 50%;\n                }\n                #ub-dashboard-settings .ub-color-input::-moz-color-swatch {\n                    border: none;\n                    border-radius: 50%;\n                }\n                #ub-dashboard-settings .ub-color-hex {\n                    font-size: 13px;\n                    font-weight: 600;\n                    font-family: "Consolas", "Menlo", monospace;\n                    color: var(--ub-text-muted);\n                    text-transform: uppercase;\n                    letter-spacing: 0.02em;\n                }\n                #ub-dashboard-settings .ub-color-grid {\n                    display: grid;\n                    grid-template-columns: 1fr 1fr;\n                    gap: 16px;\n                }\n                #ub-dashboard-settings .ub-field.ub-disabled {\n                    opacity: 0.4;\n                    pointer-events: none;\n                }\n                #ub-dashboard-settings .ub-switch-row {\n                    display: flex;\n                    align-items: center;\n                    justify-content: space-between;\n                    gap: 16px;\n                    padding: 10px 0;\n                    border-bottom: 1px solid rgba(255, 255, 255, 0.06);\n                }\n                #ub-dashboard-settings .ub-switch-row:last-child {\n                    border-bottom: none;\n                }\n                #ub-dashboard-settings .ub-switch-row.ub-disabled {\n                    opacity: 0.4;\n                    pointer-events: none;\n                }\n                #ub-dashboard-settings .ub-switch-copy {\n                    flex: 1;\n                }\n                #ub-dashboard-settings .ub-switch-label {\n                    font-size: 14px;\n                    font-weight: 600;\n                    color: var(--ub-text);\n                    margin-bottom: 2px;\n                }\n                #ub-dashboard-settings .ub-switch-desc {\n                    font-size: 12px;\n                    line-height: 1.4;\n                    color: var(--ub-text-faint);\n                }\n                #ub-dashboard-settings .ub-switch {\n                    position: relative;\n                    flex-shrink: 0;\n                    width: 40px;\n                    height: 24px;\n                    border-radius: 999px;\n                    border: none;\n                    background: rgba(255, 255, 255, 0.14);\n                    cursor: pointer;\n                    padding: 0;\n                    transition: background 200ms ease;\n                }\n                #ub-dashboard-settings .ub-switch::after {\n                    content: "";\n                    position: absolute;\n                    top: 3px;\n                    left: 3px;\n                    width: 18px;\n                    height: 18px;\n                    border-radius: 50%;\n                    background: #ffffff;\n                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);\n                    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);\n                }\n                #ub-dashboard-settings .ub-switch.on {\n                    background: var(--ub-accent);\n                }\n                #ub-dashboard-settings .ub-switch.on::after {\n                    transform: translateX(16px);\n                }\n                #ub-dashboard-settings .ub-switch:disabled {\n                    opacity: 0.4;\n                    cursor: not-allowed;\n                }\n                #ub-dashboard-settings .ub-value-pill {\n                    display: inline-block;\n                    margin-left: 8px;\n                    padding: 1px 8px;\n                    background: rgba(255, 255, 255, 0.06);\n                    border-radius: 999px;\n                    color: var(--ub-text-secondary);\n                    font-size: 11px;\n                    font-weight: 700;\n                    letter-spacing: 0;\n                    text-transform: none;\n                    vertical-align: middle;\n                }\n                #ub-dashboard-settings .ub-range {\n                    appearance: none;\n                    -webkit-appearance: none;\n                    width: 100%;\n                    height: 6px;\n                    border-radius: 999px;\n                    background: rgba(255, 255, 255, 0.10);\n                    outline: none;\n                    cursor: pointer;\n                    margin-top: 4px;\n                }\n                #ub-dashboard-settings .ub-range::-webkit-slider-runnable-track {\n                    width: 100%;\n                    height: 6px;\n                    border-radius: 999px;\n                    background: rgba(255, 255, 255, 0.18);\n                }\n                #ub-dashboard-settings .ub-range::-webkit-slider-thumb {\n                    appearance: none;\n                    -webkit-appearance: none;\n                    width: 18px;\n                    height: 18px;\n                    border-radius: 50%;\n                    background: var(--ub-accent);\n                    border: 3px solid #ffffff;\n                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);\n                    cursor: pointer;\n                    transition: transform 80ms ease;\n                \n                    margin-top: -6px;\n                }\n                #ub-dashboard-settings .ub-range::-webkit-slider-thumb:hover {\n                    transform: scale(1.1);\n                }\n                #ub-dashboard-settings .ub-range::-moz-range-thumb {\n                    width: 18px;\n                    height: 18px;\n                    border-radius: 50%;\n                    background: var(--ub-accent);\n                    border: 3px solid #ffffff;\n                    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);\n                    cursor: pointer;\n                }\n                #ub-dashboard-settings .ub-range::-moz-range-track {\n                    height: 6px;\n                    border-radius: 999px;\n                    background: rgba(255, 255, 255, 0.18);\n                }\n                \n                #ub-dashboard-content .contentSection_b6bcee {\n                    display: flex !important;\n                    justify-content: center !important;\n                    width: 100%;\n                }\n                #ub-dashboard-content .content_b6bcee {\n                    margin: 0 auto !important;\n                    width: 100%;\n                }\n            </style>\n            <div class="scroller__23746 thin_d125d2 scrollerBase_d125d2" dir="ltr" style="overflow: hidden scroll; flex: 1 1 auto; min-height: 0; padding: 24px; background-color: #000000; font-family: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;">\n                <section class="contentSection_b6bcee">\n                    <div class="content_b6bcee" style="max-width: 960px; width: 100%;">\n                        <h2 id="ub-page-heading" class="display-lg_cf4812 ub-gradient-text" data-text-variant="display-lg" style="margin-bottom: 6px; font-weight: 800; font-size: 48px; letter-spacing: -0.02em; white-space: nowrap; line-height: 1.1;">\n                            Custom Badges\n                        </h2>\n                        <p id="ub-page-subtitle" class="text-md/normal_cf4812" data-text-variant="text-md/normal" style="color: #949ba4; margin-bottom: 24px; font-size: 15px; line-height: 1.5;">\n                            Adds a self-hosted custom badge with hover tooltip and click-to-view popup card, visible to anyone else running this plugin.\n                        </p>\n                        <div id="ub-dashboard-settings">\n                        <div id="ub-panel-badges" class="ub-tabpanel">\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.shield}</div>\n                                    <div class="ub-eyebrow">Account Verification</div>\n                                </div>\n                                <p class="ub-hint">\n                                    Prove you own this Discord account so the server accepts badge changes as coming from you. No passwords or long-lived Discord tokens are ever stored - just a short-lived, revocable proof.\n                                </p>\n                                <div class="ub-btn-row">\n                                    <button type="button" id="ub-verify-account" class="ub-btn ub-btn-primary">Verify Discord Account</button>\n                                    <button type="button" id="ub-revoke-token" class="ub-btn ub-btn-danger-solid" disabled>Revoke Your Token</button>\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Session Token</div>\n                                    <p class="ub-hint" style="margin-bottom: 8px;">Paste the token shown after verifying your account here.</p>\n                                    <div class="ub-token-wrap">\n                                        <input id="ub-session-token" type="text" class="ub-input" placeholder="Paste your session token here" autocomplete="off" spellcheck="false" />\n                                        <div id="ub-session-token-overlay" class="ub-token-overlay"><div id="ub-session-token-overlay-inner" class="ub-token-overlay-inner"></div></div>\n                                    </div>\n                                </div>\n                                <div class="ub-field" style="margin-bottom: 0;">\n                                    <div class="ub-label">Your Discord User ID (optional)</div>\n                                    <p class="ub-hint" style="margin-bottom: 8px;">This script normally auto-detects your account from the bottom-left user panel, but if publishing does nothing or a preview shows "Not detected", paste your ID here as a manual fallback. Enable Developer Mode in Discord (Settings → Advanced), then right-click your own avatar/username anywhere and choose "Copy User ID".</p>\n                                    <input id="ub-self-user-id" type="text" class="ub-input" placeholder="e.g. 123456789012345678" autocomplete="off" spellcheck="false" />\n                                </div>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.clock}</div>\n                                    <div class="ub-eyebrow">Write Budget</div>\n                                </div>\n                                <div id="ub-write-budget-card" class="ub-write-budget-card">\n                                    <div class="ub-write-budget-toprow">\n                                        <span id="ub-write-budget-count" class="ub-write-budget-count">Loading…</span>\n                                    </div>\n                                    <div class="ub-write-budget-bar"><div id="ub-write-budget-bar-fill" class="ub-write-budget-bar-fill" style="width:100%;"></div></div>\n                                    <span id="ub-write-budget-reset" class="ub-write-budget-reset"></span>\n                                </div>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.pencil}</div>\n                                    <div class="ub-eyebrow">Edit Active Badge</div>\n                                    <div id="ub-publish-status" style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ub-text-faint);">\n                                        <span id="ub-publish-status-dot" style="width:7px;height:7px;border-radius:50%;background:var(--ub-text-faint);flex-shrink:0;transition:background-color 150ms ease;"></span>\n                                        <span id="ub-publish-status-text">Not published yet</span>\n                                    </div>\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Api Base Url</div>\n                                    <input id="ub-api-base-url" type="text" class="ub-input" placeholder="https://custom-badges.shadow-164.workers.dev" />\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">My Badge Image Url</div>\n                                    <input id="ub-badge-image-url" type="text" class="ub-input" placeholder="https://..." />\n                                </div>\n                                <div class="ub-field" style="margin-bottom: 16px;">\n                                    <div class="ub-label">My Badge Name</div>\n                                    <input id="ub-badge-name" type="text" class="ub-input" placeholder="Your badge name" />\n                                </div>\n                                <button id="ub-apply-badge" class="ub-btn ub-btn-primary" style="margin-bottom: 0; width: 100%;">Apply Badge Changes</button>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.eye}</div>\n                                    <div class="ub-eyebrow">Live Preview</div>\n                                </div>\n                                <div id="ub-live-preview">\n                                    <div id="ub-preview-empty" class="ub-preview-empty">\n                                        Set your badge image and name above to see a live preview\n                                    </div>\n                                    <div id="ub-preview-content" class="ub-preview-content" style="display: none;">\n                                        <div class="ub-preview-row">\n                                            <img id="ub-preview-row-icon" class="ub-preview-row-icon" alt="" />\n                                            <span class="ub-preview-row-label">Badge row icon</span>\n                                        </div>\n                                        <div id="ub-popup-card" class="ub-popup-card">\n                                            <img id="ub-popup-img" class="ub-popup-img" alt="" />\n                                            <div id="ub-popup-name" class="ub-popup-name"></div>\n                                            <div id="ub-popup-by" class="ub-popup-by"></div>\n                                        </div>\n                                        <div id="ub-preview-warning" class="ub-preview-warning" style="display: none;">\n                                            Couldn't sample colors from this image, showing the flat fallback background instead. This can happen if the host blocks cross-origin image reads. What others see may look different from this preview.\n                                        </div>\n                                    </div>\n                                </div>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.bolt}</div>\n                                    <div class="ub-eyebrow">Quick Actions</div>\n                                </div>\n                                <div class="ub-btn-row">\n                                    <button id="ub-share-badge" class="ub-btn">Share Badge</button>\n                                    <button id="ub-revert-badge" class="ub-btn ub-btn-primary">Revert To Previous Badge</button>\n                                    <button id="ub-refresh-cache" class="ub-btn ub-btn-primary">Refresh Badge Cache</button>\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Import Badge Code</div>\n                                    <input id="ub-import-badge-code" type="text" class="ub-input" placeholder="Paste a badge code..." />\n                                </div>\n                                <button id="ub-import-badge" class="ub-btn" style="margin-bottom: 16px;">Import Badge</button>\n                                <div class="ub-field">\n                                    <div class="ub-label">Selected Preset</div>\n                                    <div class="ub-dropdown" id="ub-selected-preset-dropdown">\n                                        <div class="ub-dropdown-trigger" id="ub-selected-preset-trigger">\n                                            <span class="ub-dropdown-value" id="ub-selected-preset-value">${presetLabels[0] ?? "No presets"}</span>\n                                            <svg class="ub-dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>\n                                        </div>\n                                        <div class="ub-dropdown-menu" id="ub-selected-preset-menu">\n                                            ${presetLabels.map((label, i) => `<div class="ub-dropdown-option" data-value="${i}">${label}</div>`).join("\n                                        ")}\n                                        </div>\n                                    </div>\n                                    <input type="hidden" id="ub-selected-preset" value="0" />\n                                </div>\n                                <button id="ub-apply-preset" class="ub-btn" style="margin-bottom: 0;">Apply Preset</button>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.grid}</div>\n                                    <div class="ub-eyebrow">My Badges</div>\n                                </div>\n                                <p class="ub-hint">\n                                    Your saved badge slots. Click "Use" on any badge to make it active and publish it. Add a new slot to build another look - you can have up to 12.\n                                </p>\n                                <div id="ub-my-badges-list" style="margin-bottom: 10px;"></div>\n                                <button id="ub-new-badge-slot" class="ub-btn ub-btn-primary">${icon.plus} New Badge Slot</button>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.box}</div>\n                                    <div class="ub-eyebrow">Badge Packs</div>\n                                </div>\n                                <p class="ub-hint">\n                                    Import a pack of badges from a raw GitHub URL, or export your current badges as a pack to share with others.\n                                </p>\n                                <div class="ub-field">\n                                    <div class="ub-label">Import Pack from URL</div>\n                                    <p class="ub-hint" style="margin-bottom: 8px;">Raw GitHub URL to a badge pack JSON file (e.g. https://raw.githubusercontent.com/you/repo/main/packs/friend-group.json). Use the raw.githubusercontent.com link, not a github.com/blob/... page.</p>\n                                    <input id="ub-import-pack-url" type="text" class="ub-input" placeholder="https://raw.githubusercontent.com/ItzMeShadow999/Badges/main/packs/DiscordBadges.json" />\n                                </div>\n                                <div class="ub-btn-row" style="margin-bottom: 0; flex-wrap: wrap; gap: 8px;">\n                                    <button id="ub-import-pack" class="ub-btn ub-btn-primary">Import Pack</button>\n                                    <button id="ub-make-pack" class="ub-btn">Make Pack (Copy JSON)</button>\n                                    <button id="ub-browse-packs" class="ub-btn">Add More Packs</button>\n                                    <button id="ub-view-guidelines" type="button" class="ub-btn-link">View Publish Guide</button>\n                                </div>\n                            </div>\n                            <div class="ub-section" style="margin-bottom: 0;">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.toggle}</div>\n                                    <div class="ub-eyebrow">Behavior</div>\n                                </div>\n                                <div class="ub-switch-row">\n                                    <div class="ub-switch-copy">\n                                        <div class="ub-switch-label">Show Tooltip</div>\n                                        <div class="ub-switch-desc">Show a small tooltip when hovering a custom badge</div>\n                                    </div>\n                                    <button type="button" id="ub-show-tooltip" class="ub-switch on" role="switch" aria-checked="true"></button>\n                                </div>\n                                <div class="ub-switch-row" id="ub-show-popup-row">\n                                    <div class="ub-switch-copy">\n                                        <div class="ub-switch-label">Show Popup</div>\n                                        <div class="ub-switch-desc">Show a popup card when clicking a custom badge.</div>\n                                    </div>\n                                    <button type="button" id="ub-show-popup" class="ub-switch on" role="switch" aria-checked="true"></button>\n                                </div>\n                                <div class="ub-switch-row" id="ub-show-owner-tag-row">\n                                    <div class="ub-switch-copy">\n                                        <div class="ub-switch-label">Show Owner Tag</div>\n                                        <div class="ub-switch-desc">Show "By {username}" underneath the badge name in the popup. Always shows the real Discord display name - not editable.</div>\n                                    </div>\n                                    <button type="button" id="ub-show-owner-tag" class="ub-switch on" role="switch" aria-checked="true"></button>\n                                </div>\n                                <div class="ub-switch-row">\n                                    <div class="ub-switch-copy">\n                                        <div class="ub-switch-label">Append Tag</div>\n                                        <div class="ub-switch-desc">Add a [BD] suffix after your badge name. Seen by everyone who views your badge.</div>\n                                    </div>\n                                    <button type="button" id="ub-append-tag" class="ub-switch" role="switch" aria-checked="false"></button>\n                                </div>\n                                <div class="ub-switch-row">\n                                    <div class="ub-switch-copy">\n                                        <div class="ub-switch-label">Hide Own Badge</div>\n                                        <div class="ub-switch-desc">Don't show my own badge to myself when viewing my own profile</div>\n                                    </div>\n                                    <button type="button" id="ub-hide-own-badge" class="ub-switch" role="switch" aria-checked="false"></button>\n                                </div>\n                            </div>\n                        </div>\n                        <div id="ub-panel-style" class="ub-tabpanel ub-hidden">\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.eye}</div>\n                                    <div class="ub-eyebrow">Icon Appearance</div>\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Icon Shape</div>\n                                    <div class="ub-choice-group" id="ub-icon-shape-group">\n                                        <button type="button" class="ub-choice" data-value="circle">\n                                            <span class="ub-shape-swatch" style="border-radius: 50%;"></span>\n                                            Circle\n                                        </button>\n                                        <button type="button" class="ub-choice" data-value="rounded">\n                                            <span class="ub-shape-swatch" style="border-radius: 5px;"></span>\n                                            Rounded\n                                        </button>\n                                        <button type="button" class="ub-choice" data-value="square">\n                                            <span class="ub-shape-swatch" style="border-radius: 0;"></span>\n                                            Square\n                                        </button>\n                                    </div>\n                                    <input type="hidden" id="ub-icon-shape" value="circle" />\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Icon Size <span class="ub-value-pill" id="ub-icon-size-value">22px</span></div>\n                                    <input type="range" id="ub-icon-size" class="ub-range" min="12" max="48" step="1" value="22" />\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Hover Effect</div>\n                                    <div class="ub-choice-group" id="ub-hover-effect-group">\n                                        <button type="button" class="ub-choice" data-value="none">None</button>\n                                        <button type="button" class="ub-choice" data-value="scale">Scale Up</button>\n                                        <button type="button" class="ub-choice" data-value="glow">Glow</button>\n                                    </div>\n                                    <input type="hidden" id="ub-hover-effect" value="none" />\n                                </div>\n                                <div class="ub-field" id="ub-glow-color-field" style="margin-bottom: 0;">\n                                    <div class="ub-label">Glow Color</div>\n                                    <div class="ub-color-row">\n                                        <input type="color" id="ub-glow-color" class="ub-color-input" value="#ffffff" />\n                                        <span class="ub-color-hex" id="ub-glow-color-hex">#FFFFFF</span>\n                                    </div>\n                                </div>\n                            </div>\n                            <div class="ub-section">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.box}</div>\n                                    <div class="ub-eyebrow">Popup Card</div>\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Background</div>\n                                    <div class="ub-choice-group" id="ub-bg-mode-group">\n                                        <button type="button" class="ub-choice" data-value="base">Base</button>\n                                        <button type="button" class="ub-choice" data-value="sample">Sample Image</button>\n                                        <button type="button" class="ub-choice" data-value="edit">Edit Gradient</button>\n                                    </div>\n                                    <input type="hidden" id="ub-bg-mode" value="base" />\n                                </div>\n                                <div class="ub-field" id="ub-gradient-fields">\n                                    <div class="ub-color-grid">\n                                        <div>\n                                            <div class="ub-label">Main Color</div>\n                                            <div class="ub-color-row">\n                                                <input type="color" id="ub-gradient-main" class="ub-color-input" value="#1d1d1d" />\n                                                <span class="ub-color-hex" id="ub-gradient-main-hex">#1D1D1D</span>\n                                            </div>\n                                        </div>\n                                        <div>\n                                            <div class="ub-label">Second Color</div>\n                                            <div class="ub-color-row">\n                                                <input type="color" id="ub-gradient-secondary" class="ub-color-input" value="#2a2a38" />\n                                                <span class="ub-color-hex" id="ub-gradient-secondary-hex">#2A2A38</span>\n                                            </div>\n                                        </div>\n                                    </div>\n                                </div>\n                                <div class="ub-field">\n                                    <div class="ub-label">Name Color</div>\n                                    <div class="ub-color-row">\n                                        <input type="color" id="ub-name-color" class="ub-color-input" value="#ffffff" />\n                                        <span class="ub-color-hex" id="ub-name-color-hex">#FFFFFF</span>\n                                    </div>\n                                </div>\n                                <div class="ub-field" style="margin-bottom: 0;">\n                                    <div class="ub-label">Popup Animation</div>\n                                    <div class="ub-choice-group" id="ub-popup-anim-group">\n                                        <button type="button" class="ub-choice" data-value="fade">Fade</button>\n                                        <button type="button" class="ub-choice" data-value="scale">Scale</button>\n                                        <button type="button" class="ub-choice" data-value="slide">Slide</button>\n                                    </div>\n                                    <input type="hidden" id="ub-popup-anim" value="fade" />\n                                </div>\n                            </div>\n                            <div class="ub-section" style="margin-bottom: 0;">\n                                <div class="ub-section-head">\n                                    <div class="ub-section-icon">${icon.eye}</div>\n                                    <div class="ub-eyebrow">Live Preview</div>\n                                </div>\n                                <div>\n                                    <div class="ub-preview-empty">\n                                        Set your badge image and name in the Custom Badges tab to see a live preview\n                                    </div>\n                                    <div class="ub-preview-content" style="display: none;">\n                                        <div class="ub-preview-row">\n                                            <img class="ub-preview-row-icon" alt="" />\n                                            <span class="ub-preview-row-label">Badge row icon</span>\n                                        </div>\n                                        <div class="ub-popup-card">\n                                            <img class="ub-popup-img" alt="" />\n                                            <div class="ub-popup-name"></div>\n                                            <div class="ub-popup-by"></div>\n                                        </div>\n                                        <div class="ub-preview-warning" style="display: none;">\n                                            Couldn't sample colors from this image, showing the flat fallback background instead. This can happen if the host blocks cross-origin image reads. What others see may look different from this preview.\n                                        </div>\n                                    </div>\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                </section>\n            </div>\n            <div id="ub-guidelines-backdrop" class="ub-guidelines-backdrop" id="ub-guidelines-backdrop"></div>\n            <div id="ub-guidelines-panel" class="ub-guidelines-panel">\n                <button type="button" class="ub-guidelines-close" id="ub-guidelines-close" title="Close">✕</button>\n                <div class="ub-guidelines-h2">📦 Badge Pack Sharing Guidelines</div>\n                <div style="color: var(--ub-text-muted); font-size: 13.5px; margin-bottom: 18px; line-height: 1.55;">Before sharing a pack, make sure it meets these standards so everyone has a smooth experience importing it.</div>\n                <div class="ub-guidelines-h3">Format</div>\n                <div style="color: var(--ub-text-secondary); margin-bottom: 8px;">Your pack must be a valid JSON file hosted on <code class="ub-guidelines-inline-code">raw.githubusercontent.com</code> - no other hosts are accepted by the importer. The structure should look like this:</div>\n                <code class="ub-guidelines-code"><span class="p">{</span>\n      <span class="k">"version"</span><span class="p">:</span> <span class="n">1</span><span class="p">,</span>\n      <span class="k">"badges"</span><span class="p">:</span> <span class="p">[</span>\n        <span class="s">"base64encodedcode"</span><span class="p">,</span>\n        <span class="s">"base64encodedcode"</span>\n      <span class="p">]</span>\n    <span class="p">}</span></code>\n                <div style="color: var(--ub-text-secondary);">Each entry in the <code class="ub-guidelines-inline-code">badges</code> array is a badge code generated by the <strong>Make Pack</strong> button in your dashboard.</div>\n                <div class="ub-guidelines-h3">Pack Size</div>\n                <div class="ub-guidelines-note">ⓘ The importer only loads the <strong>first 6 badges</strong> from any pack. The <strong>Make Pack</strong> button exports up to <strong>12 badges</strong> (your current plugin save limit). Technically packs can be as large as you want, but we recommend a minimum of <strong>6</strong> and a maximum of <strong>10–15</strong> for the best experience.</div>\n                <div class="ub-guidelines-h3">Content Rules</div>\n                <div class="ub-guidelines-warn">⚠️ Packs that break these rules will be removed without warning.</div>\n                <ul>\n                    <li>Badges must use <strong>publicly accessible image URLs</strong> that won't die in a week (no Discord CDN links, no temp hosts)</li>\n                    <li>No NSFW, offensive, or hateful imagery</li>\n                    <li>No impersonation of other users, plugins, or brands</li>\n                </ul>\n                <div class="ub-guidelines-h3">How to Submit</div>\n                <ol>\n                    <li>Generate your pack JSON using the <strong>Make Pack (Copy JSON)</strong> button</li>\n                    <li>Push it to the packs repo as <code class="ub-guidelines-inline-code">packs/your-pack-name.json</code> in <a href="https://github.com/ItzMeShadow999/Badges" target="_blank" rel="noopener noreferrer">https://github.com/ItzMeShadow999/Badges</a></li>\n                    <li>Open a PR with a short description of the theme</li>\n                </ol>\n                <div class="ub-guidelines-h3">Tips for a Good Pack</div>\n                <ul>\n                    <li>Use a clear, descriptive filename (<code class="ub-guidelines-inline-code">anime-icons.json</code>, not <code class="ub-guidelines-inline-code">pack1.json</code>)</li>\n                    <li>All badges in a pack should share a <strong>theme or aesthetic</strong> - random assortments are harder to browse</li>\n                    <li>Test your pack with <strong>Import Pack from URL</strong> before submitting to make sure every badge imports cleanly</li>\n                </ul>\n                <div style="margin-top: 24px; display: flex; justify-content: flex-end; padding-top: 16px; border-top: 1px solid var(--ub-border);">\n                    <button type="button" id="ub-guidelines-close-btn" class="ub-btn ub-btn-primary">Got it</button>\n                </div>\n            </div>\n        `;
    }
    const BUILTIN_PRESETS = [ {
        label: "Hypesquad Legacy",
        imageUrl: "https://files.catbox.moe/lreui6.png",
        name: "Hypesquad legacy ",
        style: {
            iconShape: "circle",
            iconSize: 22,
            hoverEffect: "glow",
            glowColor: "#5865F2",
            nameColor: "#5865F2",
            appendTag: false
        },
        prefs: {
            showTooltip: true,
            hideOwnBadge: false
        }
    }, {
        label: "Minecraft Account",
        imageUrl: "https://i.pinimg.com/736x/82/b2/1f/82b21fe6d9166c673eed585a5fc38ef5.jpg",
        name: "Mincraft Account",
        style: {
            iconShape: "circle",
            iconSize: 22,
            hoverEffect: "glow",
            glowColor: "#f54e6d",
            nameColor: "#ffffff",
            appendTag: false
        },
        prefs: {
            showTooltip: true,
            hideOwnBadge: false
        }
    }, {
        label: "Konata Haii",
        imageUrl: "https://files.catbox.moe/lri82r.gif",
        name: "konata haii",
        style: {
            iconShape: "circle",
            iconSize: 22,
            hoverEffect: "glow",
            glowColor: "#4955e3",
            nameColor: "#ffffff",
            appendTag: false
        },
        prefs: {
            showTooltip: true,
            hideOwnBadge: false
        }
    }, {
        label: "Cat",
        imageUrl: "https://i.ibb.co/4gWjN4fN/5c3d6e5876ff2a6ea5372317c5a4fbd7-removebg-preview.png",
        name: "Cat",
        style: {
            iconShape: "circle",
            iconSize: 22,
            hoverEffect: "glow",
            glowColor: "#ffd6de",
            nameColor: "#ffffff",
            appendTag: false
        },
        prefs: {
            showTooltip: true,
            hideOwnBadge: false
        }
    }, {
        label: "Verified Discord User",
        imageUrl: "https://files.catbox.moe/aodhtf.png",
        name: "Verified Discord User",
        style: {
            iconShape: "circle",
            iconSize: 30,
            hoverEffect: "scale",
            glowColor: "#0095ff",
            nameColor: "#ffffff",
            appendTag: false
        },
        prefs: {
            showTooltip: true,
            hideOwnBadge: false
        }
    }, {
        label: "I like Vencord",
        imageUrl: "https://files.catbox.moe/g2sqaj.png",
        name: "I like Vencord",
        style: {
            iconShape: "square",
            iconSize: 22,
            hoverEffect: "glow",
            glowColor: "#FCC1CC",
            nameColor: "#ffffff",
            appendTag: true
        },
        prefs: {
            showTooltip: true,
            hideOwnBadge: false
        }
    } ];
    const MAX_BADGES = 12;
    const DEFAULT_PACKS_REPO_URL = "https://github.com/ItzMeShadow999/Badges";
    const BADGE_EXPIRY_WARNING_DAYS = 14;
    const BADGE_HISTORY_LIMIT = 2;
    const BADGE_HISTORY_DEBOUNCE_MS = 3e3;
    const REQUEST_TIMEOUT_MS = 1e4;
    const RATE_LIMIT_WINDOW_MS = 1e4;
    const RATE_LIMIT_MAX_REQUESTS = 50;
    const OWNER_TAG_FORMAT = "By {username}";
    function normalizeBadgeName(name) {
        return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
    }
    const BLOCKED_BADGE_NAMES = new Set([ "discord", "discord mod", "staff", "discord developer", "discord active developer", "discord staff", "discord moderator", "discord employee", "discord team", "discord partner", "discord support", "certified moderator", "verified bot developer" ].map(normalizeBadgeName));
    const BLOCKED_BADGE_NAME_MESSAGE = "That badge name isn't allowed - it impersonates an official Discord role/badge";
    function isBlockedBadgeName(name) {
        if (!name) return false;
        return BLOCKED_BADGE_NAMES.has(normalizeBadgeName(name));
    }
    const DEFAULT_BADGE_STYLE = {
        iconShape: "circle",
        iconSize: 22,
        hoverEffect: "none",
        glowColor: "#ffffff",
        nameColor: "#ffffff",
        appendTag: false,
        popupAnimation: "fade",
        popupBackgroundMode: "base",
        popupGradientMain: "#1d1d1d",
        popupGradientSecondary: "#2a2a38",
        firstUsedDate: ""
    };
    const DEFAULT_BADGE_PREFS = {
        showTooltip: true,
        hideOwnBadge: false,
        showPopup: true,
        showOwnerTag: true
    };
    const SETTINGS_KEY = "cb-dashboard-settings-v1";
    const HISTORY_KEY = "cb-dashboard-history-v1";
    const SELF_ID_KEY = "cb-dashboard-self-id";
    const DEFAULTS = {
        apiBaseUrl: API_BASE,
        sessionToken: "",
        selfUserId: "",
        myBadgeImageUrl: "",
        myBadgeName: "",
        selectedPreset: "0",
        showTooltip: true,
        appendTag: false,
        badgeNameColor: "#ffffff",
        badgeIconSize: 22,
        badgeIconShape: "circle",
        badgeHoverEffect: "none",
        badgeGlowColor: "#ffffff",
        hideOwnBadge: false,
        myBadgesJson: "[]",
        myActiveBadgeId: "",
        importBadgeCode: "",
        importPackUrl: "",
        packRepoUrl: DEFAULT_PACKS_REPO_URL,
        showPopup: true,
        showOwnerTag: true,
        popupBackgroundMode: "base",
        popupGradientMain: "#1d1d1d",
        popupGradientSecondary: "#2a2a38",
        popupAnimationStyle: "fade",
        firstUsedDate: "",
        packGuidelinesShown: false
    };
    let _settingsCache = null;
    function allSettings() {
        if (_settingsCache) return _settingsCache;
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            _settingsCache = raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
        } catch (e) {
            _settingsCache = Object.assign({}, DEFAULTS);
        }
        if (!_settingsCache.firstUsedDate) _settingsCache.firstUsedDate = (new Date).toISOString();
        return _settingsCache;
    }
    function persistSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(_settingsCache));
        } catch (e) {
            log("Failed to save dashboard settings:", e);
        }
    }
    function getSetting(key) {
        const all = allSettings();
        return all[key] === undefined ? DEFAULTS[key] : all[key];
    }
    function setSetting(key, value) {
        const all = allSettings();
        all[key] = value;
        persistSettings();
    }
    const dashboardSettingsProxy = new Proxy({}, {
        get(_t, prop) {
            return getSetting(String(prop));
        },
        set(_t, prop, value) {
            setSetting(String(prop), value);
            return true;
        }
    });
    function loadBadgeHistory() {
        try {
            const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
            return Array.isArray(v) ? v : [];
        } catch (e) {
            return [];
        }
    }
    function saveBadgeHistory(history) {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, BADGE_HISTORY_LIMIT)));
        } catch (e) {}
    }
    let lastHistoryPushAt = 0;
    function pushBadgeHistory(snapshot) {
        const now = Date.now();
        if (now - lastHistoryPushAt < BADGE_HISTORY_DEBOUNCE_MS) return;
        lastHistoryPushAt = now;
        const history = loadBadgeHistory();
        history.unshift(snapshot);
        saveBadgeHistory(history);
    }
    function toast(message, opts) {
        const type = opts && opts.type || "info";
        const colors = {
            success: "#23A55A",
            error: "#DA373C",
            info: "#5865F2"
        };
        const el = document.createElement("div");
        el.textContent = message;
        el.style.cssText = `position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);z-index:10050;background:${colors[type] || colors.info};color:#fff;padding:10px 18px;border-radius:8px;font-family:"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.4);opacity:0;transition:opacity .18s ease, transform .18s ease;max-width:420px;text-align:center;`;
        document.body.appendChild(el);
        requestAnimationFrame(() => {
            el.style.opacity = "1";
            el.style.transform = "translateX(-50%) translateY(0)";
        });
        setTimeout(() => {
            el.style.opacity = "0";
            el.style.transform = "translateX(-50%) translateY(20px)";
            setTimeout(() => el.remove(), 220);
        }, 3200);
    }
    const KNOWN_STATUS_SUFFIXES = [ "Online", "Idle", "Away", "Do Not Disturb", "Streaming", "Invisible", "Offline" ];
    const USERNAME_TOKEN_RE = /^@?[a-z0-9._]{2,32}$/;
    const ACTIVITY_WORD_BLOCKLIST = new Set([ "played", "playing", "listening", "watching", "streaming", "competing", "spotify", "editing", "ago", "hr", "hrs", "min", "mins", "now", "since", "elapsed" ]);
    function isLikelyUsername(s) {
        if (!s) return false;
        const clean = s.replace(/^@/, "");
        return USERNAME_TOKEN_RE.test(clean) && !ACTIVITY_WORD_BLOCKLIST.has(clean.toLowerCase());
    }
    function sanitizeUsername(raw) {
        let out = (raw || "").trim();
        for (const suffix of KNOWN_STATUS_SUFFIXES) {
            if (out.length > suffix.length && out.endsWith(suffix)) {
                out = out.slice(0, out.length - suffix.length).trim();
            }
        }
        out = out.trim();
        const bulletMatch = out.match(/^@?([a-z0-9._]{2,32})\s*(?:•|\u2022)/i);
        if (bulletMatch && isLikelyUsername(bulletMatch[1])) return bulletMatch[1].replace(/^@/, "");
        if (isLikelyUsername(out)) return out.replace(/^@/, "");
        const tokens = out.split(/\s+/).filter(Boolean);
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (isLikelyUsername(tokens[i])) return tokens[i].replace(/^@/, "");
        }
        const runs = out.match(/[a-z0-9._]{2,32}/g) || [];
        for (const run of runs) {
            if (isLikelyUsername(run)) return run;
        }
        return out;
    }
    function getCurrentUser() {
        const override = (getSetting("selfUserId") || "").trim();
        if (/^\d{15,25}$/.test(override)) {
            return {
                id: override,
                username: "you"
            };
        }
        let id = localStorage.getItem(SELF_ID_KEY) || null;
        let username = null;
        const exactUsernameEl = document.querySelector('[class*="userTagUsername"]');
        if (exactUsernameEl && exactUsernameEl.textContent && exactUsernameEl.textContent.trim()) {
            username = sanitizeUsername(exactUsernameEl.textContent);
        }
        const avatarSelectors = [ '[class*="panels"] img[src*="/avatars/"]', '[class*="panels"] img[src*="/embed/avatars/"]', '[class*="avatarStack"] img[src*="/avatars/"]', '[class*="accountProfile"] img[src*="/avatars/"]', '[class*="panelWrapper"] img[src*="/avatars/"]', '[class*="statusBox"] img[src*="/avatars/"]', '[data-list-item-id*="account"] img[src*="/avatars/"]' ];
        let panelAvatar = null;
        for (const sel of avatarSelectors) {
            panelAvatar = document.querySelector(sel);
            if (panelAvatar) break;
        }
        if (panelAvatar) {
            const m = panelAvatar.src.match(/avatars\/(\d+)\//);
            if (m) {
                id = m[1];
                try {
                    localStorage.setItem(SELF_ID_KEY, id);
                } catch (e) {}
            }
            if (!username && panelAvatar.alt && panelAvatar.alt.trim()) {
                username = sanitizeUsername(panelAvatar.alt);
            }
        }
        if (!username) {
            const nameSelectors = [ '[class*="panels"] [class*="userTag"]', '[class*="accountProfile"] [class*="userTag"]', '[class*="panels"] [class*="nameTag"]', '[class*="panels"] [class*="username"]', '[class*="accountProfile"] [class*="nameTag"]', '[class*="accountProfile"] [class*="username"]' ];
            for (const sel of nameSelectors) {
                const nameEl = document.querySelector(sel);
                if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
                    username = sanitizeUsername(nameEl.textContent);
                    break;
                }
            }
        }
        if (!id) return null;
        return {
            id: id,
            username: username || "you"
        };
    }
    function resolveBadgeStyle(remote, ownerFirstUsedDate) {
        const base = Object.assign({}, DEFAULT_BADGE_STYLE, remote || {});
        if (remote && typeof remote.appendVencordTag === "boolean") base.appendTag = remote.appendVencordTag;
        if (!base.firstUsedDate && ownerFirstUsedDate) base.firstUsedDate = ownerFirstUsedDate;
        return base;
    }
    function getMyBadgeStyle() {
        return {
            iconShape: getSetting("badgeIconShape"),
            iconSize: getSetting("badgeIconSize"),
            hoverEffect: getSetting("badgeHoverEffect"),
            glowColor: getSetting("badgeGlowColor"),
            nameColor: getSetting("badgeNameColor"),
            appendVencordTag: getSetting("appendTag"),
            popupAnimation: getSetting("popupAnimationStyle"),
            popupBackgroundMode: getSetting("popupBackgroundMode"),
            popupGradientMain: getSetting("popupGradientMain"),
            popupGradientSecondary: getSetting("popupGradientSecondary"),
            firstUsedDate: getSetting("firstUsedDate")
        };
    }
    function resolveBadgePrefs(remote) {
        return Object.assign({}, DEFAULT_BADGE_PREFS, remote || {});
    }
    function getMyBadgePrefs() {
        return {
            showTooltip: getSetting("showTooltip"),
            hideOwnBadge: getSetting("hideOwnBadge"),
            showPopup: getSetting("showPopup"),
            showOwnerTag: getSetting("showOwnerTag")
        };
    }
    function formatOwnerTag(ownerUsername) {
        if (!ownerUsername) return null;
        return OWNER_TAG_FORMAT.replace("{username}", ownerUsername);
    }
    function formatBadgeName(rawName, appendTag) {
        return appendTag ? `${rawName} [BD]` : rawName;
    }
    async function dashGetPopupBackground(imageUrl, style) {
        if (style.popupBackgroundMode === "edit") {
            return {
                background: `radial-gradient(120% 100% at 50% 0%, ${style.popupGradientSecondary} 0%, ${style.popupGradientMain} 65%)`,
                edgeColor: style.popupGradientMain,
                sampleFailed: false
            };
        }
        if (style.popupBackgroundMode === "sample") {
            const sampled = await sampleImageColor(imageUrl);
            if (sampled) return {
                background: `radial-gradient(120% 100% at 50% 0%, ${sampled} 0%, #1d1d1d 65%)`,
                edgeColor: "#1d1d1d",
                sampleFailed: false
            };
            return {
                background: "#1d1d1d",
                edgeColor: "#1d1d1d",
                sampleFailed: true
            };
        }
        return {
            background: "#1d1d1d",
            edgeColor: "#1d1d1d",
            sampleFailed: false
        };
    }
    async function getDashboardPreviewData() {
        const imageUrl = getSetting("myBadgeImageUrl");
        const name = getSetting("myBadgeName");
        if (!imageUrl || !name) return null;
        const style = getMyBadgeStyle();
        const me = getCurrentUser();
        const ownerUsername = me && me.username || null;
        const displayName = formatBadgeName(name, style.appendTag);
        const ownerTag = getSetting("showOwnerTag") ? formatOwnerTag(ownerUsername) : null;
        const {background: background, sampleFailed: sampleFailed} = await dashGetPopupBackground(imageUrl, style);
        return {
            imageUrl: imageUrl,
            displayName: displayName,
            ownerTag: ownerTag,
            nameColor: style.nameColor,
            iconShape: style.iconShape,
            iconSize: style.iconSize,
            background: background,
            sampleFailed: sampleFailed
        };
    }
    function genBadgeId() {
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    }
    function getMyBadges() {
        try {
            const parsed = JSON.parse(getSetting("myBadgesJson") || "[]");
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }
    function setMyBadgesLocal(list) {
        setSetting("myBadgesJson", JSON.stringify(list.slice(0, MAX_BADGES)));
    }
    function getActiveBadgeId() {
        return getSetting("myActiveBadgeId") || null;
    }
    function findBadgeEntry(id) {
        if (!id) return undefined;
        return getMyBadges().find(b => b.id === id);
    }
    function encodeBadgeCode() {
        const imageUrl = getSetting("myBadgeImageUrl");
        const name = getSetting("myBadgeName");
        if (!imageUrl || !name) return null;
        const payload = {
            imageUrl: imageUrl,
            name: name,
            style: getMyBadgeStyle(),
            prefs: getMyBadgePrefs()
        };
        return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    }
    function decodeBadgeCode(code) {
        return JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    }
    function shareMyBadge() {
        const code = encodeBadgeCode();
        if (!code) {
            toast("Set your badge image and name first", {
                type: "error"
            });
            return;
        }
        navigator.clipboard.writeText(code).then(() => toast("Badge code copied to clipboard", {
            type: "success"
        })).catch(() => toast("Couldn't copy to clipboard", {
            type: "error"
        }));
    }
    function validateBadgePayload(parsed) {
        if (!parsed || typeof parsed !== "object") return "That code isn't a valid badge, it didn't decode to an object";
        if (typeof parsed.imageUrl !== "string" || !parsed.imageUrl.trim()) return "That code is missing a valid image URL";
        if (typeof parsed.name !== "string" || !parsed.name.trim()) return "That code is missing a valid badge name";
        if (isBlockedBadgeName(parsed.name)) return BLOCKED_BADGE_NAME_MESSAGE;
        if (parsed.style !== undefined && parsed.style !== null && (typeof parsed.style !== "object" || Array.isArray(parsed.style))) return "That code has an invalid style block";
        if (parsed.prefs !== undefined && parsed.prefs !== null && (typeof parsed.prefs !== "object" || Array.isArray(parsed.prefs))) return "That code has an invalid preferences block";
        return null;
    }
    let suppressPublishOnChange = false;
    function applyBadgeState(state) {
        const style = resolveBadgeStyle(state.style);
        const prefs = resolveBadgePrefs(state.prefs);
        suppressPublishOnChange = true;
        try {
            setSetting("myBadgeImageUrl", state.imageUrl);
            setSetting("myBadgeName", state.name);
            setSetting("badgeIconShape", style.iconShape);
            setSetting("badgeIconSize", style.iconSize);
            setSetting("badgeHoverEffect", style.hoverEffect);
            setSetting("badgeGlowColor", style.glowColor);
            setSetting("badgeNameColor", style.nameColor);
            setSetting("appendTag", style.appendTag);
            setSetting("popupAnimationStyle", style.popupAnimation);
            setSetting("popupBackgroundMode", style.popupBackgroundMode);
            setSetting("popupGradientMain", style.popupGradientMain);
            setSetting("popupGradientSecondary", style.popupGradientSecondary);
            setSetting("showTooltip", prefs.showTooltip);
            setSetting("hideOwnBadge", prefs.hideOwnBadge);
            setSetting("showPopup", prefs.showPopup);
            setSetting("showOwnerTag", prefs.showOwnerTag);
        } finally {
            suppressPublishOnChange = false;
        }
        scheduleAutoPublish(0);
    }
    function importBadgeFromCode() {
        const code = getSetting("importBadgeCode");
        if (!code) {
            toast("Paste a badge code first", {
                type: "error"
            });
            return;
        }
        let parsed;
        try {
            parsed = decodeBadgeCode(code);
        } catch (e) {
            toast("That badge code isn't valid base64/JSON", {
                type: "error"
            });
            return;
        }
        const err = validateBadgePayload(parsed);
        if (err) {
            toast(err, {
                type: "error"
            });
            return;
        }
        applyBadgeState({
            imageUrl: parsed.imageUrl,
            name: parsed.name,
            style: parsed.style,
            prefs: parsed.prefs
        });
        setSetting("importBadgeCode", "");
        toast("Badge imported and saved", {
            type: "success"
        });
    }
    function applySelectedPreset() {
        const preset = BUILTIN_PRESETS[Number(getSetting("selectedPreset"))];
        if (!preset) {
            toast("Pick a preset first", {
                type: "error"
            });
            return;
        }
        applyBadgeState({
            imageUrl: preset.imageUrl,
            name: preset.name,
            style: preset.style,
            prefs: preset.prefs
        });
        toast(`Applied "${preset.label}" preset and published`, {
            type: "success"
        });
    }
    function revertBadge() {
        const history = loadBadgeHistory();
        if (!history.length) {
            toast("No previous badge saved to revert to yet", {
                type: "error"
            });
            return;
        }
        const previous = history.shift();
        saveBadgeHistory(history);
        applyBadgeState(previous);
        toast("Reverted to your previous badge", {
            type: "success"
        });
    }
    function apiBase() {
        return getSetting("apiBaseUrl") || API_BASE;
    }
    function taggedError(kind, detail) {
        return new Error(`${kind}:${detail}`);
    }
    async function fetchWithTimeout(url, options) {
        const controller = new AbortController;
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, Object.assign({}, options, {
                signal: controller.signal
            }));
        } catch (e) {
            if (e && e.name === "AbortError") {
                let host = url;
                try {
                    host = new URL(url).host;
                } catch (e2) {}
                throw taggedError("TIMEOUT", `Request to ${host} timed out`);
            }
            throw taggedError("NETWORK", e && e.message || "Network request failed");
        } finally {
            clearTimeout(timeout);
        }
    }
    async function parseJsonOrThrow(res) {
        let data = null;
        try {
            data = await res.json();
        } catch (e) {}
        if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After") ?? "";
            throw taggedError("SERVER_RATE_LIMIT", retryAfter || data && data.error || "Too many requests");
        }
        if (!res.ok) {
            throw taggedError("SERVER_ERROR", `${res.status}:${data && data.error || res.statusText || "Unknown error"}`);
        }
        return data;
    }
    let _writeRequestTimestamps = [];
    function checkClientRateLimit() {
        const timestamps = _writeRequestTimestamps;
        const now = Date.now();
        while (timestamps.length && now - timestamps[0] > RATE_LIMIT_WINDOW_MS) timestamps.shift();
        if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
            const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - timestamps[0]);
            throw taggedError("CLIENT_RATE_LIMIT", String(Math.max(retryAfterMs, 0)));
        }
        timestamps.push(now);
    }
    function authHeaders(sessionToken) {
        const headers = {
            "Content-Type": "application/json"
        };
        if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
        return headers;
    }
    function requireSessionToken(sessionToken) {
        if (!sessionToken) throw taggedError("NOT_VERIFIED", 'Verify your Discord account in settings first ("Verify Discord Account" button)');
        return sessionToken;
    }
    async function apiSetBadge(userId, badgeId, imageUrl, description, style) {
        checkClientRateLimit();
        const token = requireSessionToken(getSetting("sessionToken"));
        const res = await fetchWithTimeout(apiBase(), {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
                action: "setBadge",
                userId: userId,
                badgeId: badgeId,
                imageUrl: imageUrl,
                description: description,
                style: style
            })
        });
        return parseJsonOrThrow(res);
    }
    async function apiSetActiveBadge(userId, badgeId) {
        checkClientRateLimit();
        const token = requireSessionToken(getSetting("sessionToken"));
        const res = await fetchWithTimeout(apiBase(), {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
                action: "setActiveBadge",
                userId: userId,
                badgeId: badgeId
            })
        });
        return parseJsonOrThrow(res);
    }
    async function apiDeleteBadge(userId, badgeId) {
        checkClientRateLimit();
        const token = requireSessionToken(getSetting("sessionToken"));
        const res = await fetchWithTimeout(apiBase(), {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({
                action: "deleteBadge",
                userId: userId,
                badgeId: badgeId
            })
        });
        return parseJsonOrThrow(res);
    }
    async function apiRevokeToken() {
        const token = requireSessionToken(getSetting("sessionToken"));
        const res = await fetchWithTimeout(`${apiBase()}/self/revoke`, {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({})
        });
        return parseJsonOrThrow(res);
    }
    async function apiGetWriteBudget() {
        const token = requireSessionToken(getSetting("sessionToken"));
        const res = await fetchWithTimeout(`${apiBase()}/self/writes`, {
            method: "GET",
            headers: authHeaders(token)
        });
        return parseJsonOrThrow(res);
    }
    function describeBadgeApiError(e) {
        const message = e instanceof Error ? e.message : String(e);
        const sep = message.indexOf(":");
        const kind = sep === -1 ? message : message.slice(0, sep);
        const detail = sep === -1 ? "" : message.slice(sep + 1);
        switch (kind) {
          case "NOT_VERIFIED":
            return 'Verify your Discord account first (see the "Verify Discord Account" button in settings)';

          case "CLIENT_RATE_LIMIT":
            {
                const seconds = Math.max(1, Math.ceil(Number(detail) / 1e3) || 1);
                return `Slow down a little - try again in ${seconds}s`;
            }

          case "SERVER_RATE_LIMIT":
            return detail && /^\d+$/.test(detail) ? `Rate limited by the badge server - try again in ${detail}s` : "Rate limited by the badge server - try again shortly";

          case "TIMEOUT":
            return "Request timed out - the badge server didn't respond in time";

          case "NETWORK":
            return "Couldn't reach the badge server - check your connection";

          case "SERVER_ERROR":
            return "The badge server had a problem - try again in a bit";

          default:
            return "Something went wrong talking to the badge server";
        }
    }
    function primeOwnBadgeCache(userId, apiRes) {
        if (!userId || !apiRes || !apiRes.ok) return false;
        const active = (apiRes.badges || []).find(b => b.id === apiRes.activeId) || (apiRes.badges || [])[0];
        if (!active) return false;
        badgeCache.set(userId, {
            data: {
                firstRequestAt: apiRes.firstRequestAt,
                badges: apiRes.badges,
                activeId: apiRes.activeId,
                expiresAt: apiRes.expiresAt,
                imageUrl: active.imageUrl,
                description: active.description,
                ...active.style ? {
                    style: active.style
                } : {}
            },
            time: Date.now()
        });
        return true;
    }
    function refreshOwnBadgeDisplay(userId, apiRes) {
        const primed = primeOwnBadgeCache(userId, apiRes);
        if (!primed && userId) badgeCache.delete(userId);
        document.querySelectorAll(`[${MARKER}]`).forEach(el => {
            if (!userId || getUserId(el) === userId) el.removeAttribute(MARKER);
        });
        if (!primed) badgeCache.clear();
        scan();
    }
    let lastPublishedSnapshot = null;
    const AUTO_PUBLISH_DEBOUNCE_MS = 700;
    const AUTO_PUBLISH_RETRY_DELAYS_MS = [ 3e3, 8e3, 2e4, 45e3 ];
    let _autoPublishTimer = null;
    let _autoPublishRetryTimer = null;
    let _autoPublishRetryCount = 0;
    let _autoPublishGeneration = 0;
    let _publishStatusListeners = [];
    function onPublishStatusChange(fn) {
        _publishStatusListeners.push(fn);
        return () => {
            _publishStatusListeners = _publishStatusListeners.filter(f => f !== fn);
        };
    }
    function setPublishStatus(state, detail) {
        _publishStatusListeners.forEach(fn => {
            try {
                fn(state, detail);
            } catch (e) {}
        });
    }
    function cancelPendingAutoPublish() {
        if (_autoPublishTimer) {
            clearTimeout(_autoPublishTimer);
            _autoPublishTimer = null;
        }
        if (_autoPublishRetryTimer) {
            clearTimeout(_autoPublishRetryTimer);
            _autoPublishRetryTimer = null;
        }
        _autoPublishRetryCount = 0;
    }
    function scheduleAutoPublish(delay = AUTO_PUBLISH_DEBOUNCE_MS) {
        cancelPendingAutoPublish();
        const myGeneration = ++_autoPublishGeneration;
        setPublishStatus("pending");
        _autoPublishTimer = setTimeout(() => {
            _autoPublishTimer = null;
            runAutoPublish(myGeneration);
        }, delay);
    }
    async function runAutoPublish(generation) {
        if (generation !== _autoPublishGeneration) return;
        const imageUrl = getSetting("myBadgeImageUrl");
        const name = getSetting("myBadgeName");
        if (!imageUrl || !name) {
            setPublishStatus("idle");
            return;
        }
        if (isBlockedBadgeName(name)) {
            toast(BLOCKED_BADGE_NAME_MESSAGE, {
                type: "error"
            });
            setPublishStatus("error", "Blocked badge name");
            return;
        }
        setPublishStatus("publishing");
        const ok = await updateMyBadgeFromSettings();
        if (generation !== _autoPublishGeneration) return;
        if (ok) {
            _autoPublishRetryCount = 0;
            setPublishStatus("success");
        } else {
            const delay = AUTO_PUBLISH_RETRY_DELAYS_MS[Math.min(_autoPublishRetryCount, AUTO_PUBLISH_RETRY_DELAYS_MS.length - 1)];
            _autoPublishRetryCount++;
            setPublishStatus("error", `Retrying in ${Math.round(delay / 1e3)}s`);
            _autoPublishRetryTimer = setTimeout(() => {
                _autoPublishRetryTimer = null;
                runAutoPublish(generation);
            }, delay);
        }
    }
    async function setMyBadge(badgeId, imageUrl, description) {
        const me = getCurrentUser();
        if (!me) {
            log("Not logged in / could not detect current user");
            toast('Could not detect your Discord account - open the "Your Discord User ID" field in settings and paste it in manually', {
                type: "error"
            });
            return false;
        }
        try {
            const res = await apiSetBadge(me.id, badgeId, imageUrl, description, getMyBadgeStyle());
            refreshOwnBadgeDisplay(me.id, res);
            applyWriteBudget(res && res.writeBudget);
            log("Badge set:", res);
            if (res && res.ok && res.activeId && res.activeId !== badgeId) {
                setSetting("myActiveBadgeId", res.activeId);
                toast(`Saved, but your active badge is a different slot - switched local tracking to match. Use "Switch to badge" if you meant to edit ${badgeId === res.badgeId ? "this one" : "the one you just edited"}.`, {
                    type: "error"
                });
            }
            return true;
        } catch (e) {
            log("Failed to set badge:", e);
            toast(describeBadgeApiError(e), {
                type: "error"
            });
            return false;
        }
    }
    async function updateMyBadgeFromSettings() {
        if (suppressPublishOnChange) return true;
        const imageUrl = getSetting("myBadgeImageUrl");
        const name = getSetting("myBadgeName");
        if (!imageUrl || !name) return true;
        if (isBlockedBadgeName(name)) {
            toast(BLOCKED_BADGE_NAME_MESSAGE, {
                type: "error"
            });
            return false;
        }
        if (lastPublishedSnapshot) pushBadgeHistory(lastPublishedSnapshot);
        lastPublishedSnapshot = {
            imageUrl: imageUrl,
            name: name,
            style: getMyBadgeStyle(),
            prefs: getMyBadgePrefs()
        };
        let id = getActiveBadgeId();
        if (!id) {
            id = genBadgeId();
            setSetting("myActiveBadgeId", id);
        }
        const list = getMyBadges();
        const entry = {
            id: id,
            imageUrl: imageUrl,
            description: name,
            style: getMyBadgeStyle()
        };
        const idx = list.findIndex(b => b.id === id);
        if (idx === -1) list.push(entry); else list[idx] = entry;
        setMyBadgesLocal(list);
        return await setMyBadge(id, imageUrl, name);
    }
    function loadBadgeFieldsIntoSettings(entry) {
        suppressPublishOnChange = true;
        try {
            setSetting("myBadgeImageUrl", entry.imageUrl);
            setSetting("myBadgeName", entry.description);
            const style = resolveBadgeStyle(entry.style);
            setSetting("badgeIconShape", style.iconShape);
            setSetting("badgeIconSize", style.iconSize);
            setSetting("badgeHoverEffect", style.hoverEffect);
            setSetting("badgeGlowColor", style.glowColor);
            setSetting("badgeNameColor", style.nameColor);
            setSetting("appendTag", style.appendTag);
            setSetting("popupAnimationStyle", style.popupAnimation);
            setSetting("popupBackgroundMode", style.popupBackgroundMode);
            setSetting("popupGradientMain", style.popupGradientMain);
            setSetting("popupGradientSecondary", style.popupGradientSecondary);
        } finally {
            suppressPublishOnChange = false;
        }
    }
    async function switchToBadge(id) {
        const entry = findBadgeEntry(id);
        if (!entry) return;
        setSetting("myActiveBadgeId", id);
        loadBadgeFieldsIntoSettings(entry);
        const me = getCurrentUser();
        if (!me) {
            toast("Could not detect your Discord account - paste your User ID into settings manually", {
                type: "error"
            });
            return;
        }
        try {
            const res = await apiSetActiveBadge(me.id, id);
            refreshOwnBadgeDisplay(me.id, res);
            applyWriteBudget(res && res.writeBudget);
            toast("Switched active badge", {
                type: "success"
            });
        } catch (e) {
            log("Failed to switch active badge:", e);
            toast(describeBadgeApiError(e), {
                type: "error"
            });
        }
    }
    function createNewBadgeSlot() {
        const list = getMyBadges();
        if (list.length >= MAX_BADGES) {
            toast(`You can only have up to ${MAX_BADGES} badges`, {
                type: "error"
            });
            return;
        }
        const id = genBadgeId();
        const entry = {
            id: id,
            imageUrl: getSetting("myBadgeImageUrl") || "",
            description: getSetting("myBadgeName") || "New Badge",
            style: getMyBadgeStyle()
        };
        list.push(entry);
        setMyBadgesLocal(list);
        setSetting("myActiveBadgeId", id);
        loadBadgeFieldsIntoSettings(entry);
        if (entry.imageUrl) scheduleAutoPublish(0);
        toast("New badge slot added - edit the fields above to customize it", {
            type: "success"
        });
    }
    async function deleteBadgeSlot(id) {
        const list = getMyBadges();
        const remaining = list.filter(b => b.id !== id);
        setMyBadgesLocal(remaining);
        const me = getCurrentUser();
        if (me) {
            try {
                const res = await apiDeleteBadge(me.id, id);
                refreshOwnBadgeDisplay(me.id, res);
                applyWriteBudget(res && res.writeBudget);
            } catch (e) {
                log("Failed to delete badge:", e);
                toast(describeBadgeApiError(e), {
                    type: "error"
                });
            }
        } else {
            toast("Removed locally, but could not reach the server (Discord account not detected) - it may still show on your profile", {
                type: "error"
            });
        }
        if (getActiveBadgeId() === id) {
            const next = remaining[0];
            if (next) {
                switchToBadge(next.id);
            } else {
                setSetting("myActiveBadgeId", "");
                suppressPublishOnChange = true;
                try {
                    setSetting("myBadgeImageUrl", "");
                    setSetting("myBadgeName", "");
                } finally {
                    suppressPublishOnChange = false;
                }
            }
        }
    }
    function refreshBadgeCache() {
        badgeCache.clear();
        toast("Badge cache cleared", {
            type: "success"
        });
    }
    function verifyDiscordAccount() {
        window.open(`${apiBase()}/auth/start`, "_blank", "noopener,noreferrer");
    }
    async function revokeSessionToken() {
        try {
            await apiRevokeToken();
            setSetting("sessionToken", "");
            _writeBudgetInfo = null;
            renderWriteBudget();
            toast("Token revoked - re-verify to publish badge changes again", {
                type: "success"
            });
        } catch (e) {
            log("Failed to revoke token:", e);
            toast(describeBadgeApiError(e), {
                type: "error"
            });
        }
    }
    function packUrlLooksValid(url) {
        try {
            return new URL(url).hostname === "raw.githubusercontent.com";
        } catch (e) {
            return false;
        }
    }
    function makePack() {
        const badges = getMyBadges();
        if (!badges.length) {
            toast("You don't have any badges to pack yet", {
                type: "error"
            });
            return;
        }
        const codes = badges.map(b => btoa(unescape(encodeURIComponent(JSON.stringify({
            imageUrl: b.imageUrl,
            name: b.description,
            style: b.style
        })))));
        const pack = {
            version: 1,
            badges: codes
        };
        navigator.clipboard.writeText(JSON.stringify(pack, null, 2)).then(() => {
            const repoHint = getSetting("packRepoUrl") ? ` Push it to ${getSetting("packRepoUrl")} as packs/your-pack-name.json.` : ' Set "Pack Repo Url" below, then push this as packs/your-pack-name.json in that repo.';
            toast(`Pack JSON copied to clipboard.${repoHint}`, {
                type: "success"
            });
        }).catch(() => toast("Couldn't copy to clipboard", {
            type: "error"
        }));
    }
    function browsePacks() {
        window.open("https://github.com/ItzMeShadow999/Badges", "_blank", "noopener,noreferrer");
    }
    async function importPackFromUrl() {
        const url = (getSetting("importPackUrl") || "").trim();
        if (!url) {
            toast("Paste a pack URL first", {
                type: "error"
            });
            return;
        }
        if (!packUrlLooksValid(url)) {
            toast("Use a raw.githubusercontent.com link, not a github.com/blob/... page", {
                type: "error"
            });
            return;
        }
        let codes;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            codes = Array.isArray(data) ? data : Array.isArray(data && data.badges) ? data.badges : [];
            if (!codes.length) throw new Error("empty pack");
        } catch (e) {
            toast("Couldn't load that pack - check the URL", {
                type: "error"
            });
            return;
        }
        const list = getMyBadges();
        let imported = 0;
        for (const code of codes) {
            if (list.length + imported >= MAX_BADGES) break;
            try {
                const parsed = decodeBadgeCode(code);
                if (validateBadgePayload(parsed)) continue;
                list.push({
                    id: genBadgeId(),
                    imageUrl: parsed.imageUrl,
                    description: parsed.name,
                    style: parsed.style
                });
                imported++;
            } catch (e) {}
        }
        if (!imported) {
            toast("No valid badges found in that pack", {
                type: "error"
            });
            return;
        }
        setMyBadgesLocal(list);
        for (const entry of list.slice(-imported)) {
            await setMyBadge(entry.id, entry.imageUrl, entry.description);
        }
        toast(`Imported ${imported} badge(s) from pack and saved`, {
            type: "success"
        });
    }
    let _dashboardBridge = null;
    function setDashboardBridge(b) {
        _dashboardBridge = b;
    }
    function getDashboardBridge() {
        return _dashboardBridge;
    }
    let _writeBudgetInfo = null;
    let _writeBudgetCountdownTimer = null;
    function formatWriteBudgetDuration(ms) {
        if (ms <= 0) return "0m";
        const totalMinutes = Math.ceil(ms / 6e4);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
    function renderWriteBudget() {
        const countEl = document.getElementById("ub-write-budget-count");
        const resetEl = document.getElementById("ub-write-budget-reset");
        const cardEl = document.getElementById("ub-write-budget-card");
        const fillEl = document.getElementById("ub-write-budget-bar-fill");
        if (!countEl || !resetEl || !cardEl) return;
        if (!getSetting("sessionToken")) {
            countEl.textContent = "Verify your account to see your write budget";
            resetEl.textContent = "";
            cardEl.classList.remove("ub-write-budget-exhausted");
            if (fillEl) fillEl.style.width = "100%";
            return;
        }
        if (!_writeBudgetInfo) {
            countEl.textContent = "Loading…";
            resetEl.textContent = "";
            return;
        }
        const {remaining: remaining, limit: limit, resetAt: resetAt} = _writeBudgetInfo;
        const safeLimit = limit || 0;
        const exhausted = remaining <= 0;
        countEl.textContent = `${remaining} / ${safeLimit} writes remaining`;
        cardEl.classList.toggle("ub-write-budget-exhausted", exhausted);
        if (fillEl) fillEl.style.width = `${safeLimit > 0 ? Math.max(0, Math.min(100, remaining / safeLimit * 100)) : 100}%`;
        if (resetAt == null) {
            resetEl.textContent = "";
        } else {
            const msLeft = resetAt - Date.now();
            if (msLeft <= 0) {
                resetEl.textContent = "Refreshing…";
                fetchWriteBudget();
            } else {
                resetEl.textContent = `${exhausted ? "Available again" : "Resets"} in ${formatWriteBudgetDuration(msLeft)}`;
            }
        }
    }
    function applyWriteBudget(info) {
        if (!info) return;
        _writeBudgetInfo = {
            remaining: info.remaining,
            limit: info.limit,
            resetAt: info.resetAt ?? null
        };
        renderWriteBudget();
    }
    async function fetchWriteBudget() {
        if (!document.getElementById("ub-write-budget-count")) return;
        if (!getSetting("sessionToken")) {
            renderWriteBudget();
            return;
        }
        try {
            const data = await apiGetWriteBudget();
            applyWriteBudget(data);
        } catch (e) {
            log("Failed to fetch write budget:", e);
        }
    }
    function startWriteBudgetCountdown() {
        if (_writeBudgetCountdownTimer) return;
        _writeBudgetCountdownTimer = setInterval(() => {
            if (_writeBudgetInfo && _writeBudgetInfo.resetAt != null) renderWriteBudget();
        }, 3e4);
    }
    function stopWriteBudgetCountdown() {
        if (_writeBudgetCountdownTimer) {
            clearInterval(_writeBudgetCountdownTimer);
            _writeBudgetCountdownTimer = null;
        }
    }
    let _dashboardActive = false;
    function setDashboardActive(active) {
        _dashboardActive = active;
    }
    let _dashboardOverlay = null;
    function closeDashboard() {
        setDashboardActive(false);
        if (_dashboardOverlay) _dashboardOverlay.style.display = "none";
        stopWriteBudgetCountdown();
    }
    function mountDashboard() {
        const overlay = document.createElement("div");
        overlay.id = "ub-dashboard-content";
        overlay.style.cssText = "position:fixed;inset:0;z-index:10010;display:none;flex-direction:column;background:#000;";
        overlay.innerHTML = headerBarHtml() + dashboardHtml(BUILTIN_PRESETS.map(p => p.label));
        document.body.appendChild(overlay);
        document.addEventListener("keydown", e => {
            if (e.key === "Escape" && _dashboardActive) closeDashboard();
        });
        wireDashboardSettings(overlay);
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden && _dashboardActive) fetchWriteBudget();
        });
        _dashboardOverlay = overlay;
        return overlay;
    }
    function openDashboard() {
        setDashboardActive(true);
        const overlay = _dashboardOverlay || mountDashboard();
        overlay.style.display = "flex";
        renderWriteBudget();
        fetchWriteBudget();
        startWriteBudgetCountdown();
    }
    function initDashboard() {
        setDashboardBridge({
            settings: {
                store: dashboardSettingsProxy
            },
            presetLabels: BUILTIN_PRESETS.map(p => p.label),
            getPreviewData: () => getDashboardPreviewData(),
            shareMyBadge: () => shareMyBadge(),
            revertBadge: () => revertBadge(),
            refreshBadgeCache: () => refreshBadgeCache(),
            importBadgeFromCode: () => importBadgeFromCode(),
            applySelectedPreset: () => applySelectedPreset(),
            createNewBadgeSlot: () => createNewBadgeSlot(),
            importPackFromUrl: () => importPackFromUrl(),
            makePack: () => makePack(),
            browsePacks: () => browsePacks(),
            onBadgeModeChange: () => {},
            publishBadge: () => scheduleAutoPublish(),
            applyBadgeNow: () => scheduleAutoPublish(0),
            onPublishStatusChange: fn => onPublishStatusChange(fn),
            verifyAccount: () => verifyDiscordAccount(),
            revokeSessionToken: () => revokeSessionToken(),
            switchToBadge: id => switchToBadge(id),
            deleteBadgeSlot: id => deleteBadgeSlot(id)
        });
        createDashboardFab();
    }
    function createDashboardFab() {
        if (document.getElementById("cb-dashboard-fab")) return;
        const fab = document.createElement("button");
        fab.id = "cb-dashboard-fab";
        fab.type = "button";
        fab.title = "Custom Badges Dashboard";
        fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 13h6a1 1 0 001-1V4a1 1 0 00-1-1H4a1 1 0 00-1 1v8a1 1 0 001 1zm1-8h4v6H5V5zm9 16h6a1 1 0 001-1v-8a1 1 0 00-1-1h-6a1 1 0 00-1 1v8a1 1 0 001 1zm1-8h4v6h-4v-6zM4 21h6a1 1 0 001-1v-4a1 1 0 00-1-1H4a1 1 0 00-1 1v4a1 1 0 001 1zm1-4h4v2H5v-2zm9-8h6a1 1 0 001-1V4a1 1 0 00-1-1h-6a1 1 0 00-1 1v4a1 1 0 001 1zm1-4h4v2h-4V5z"/></svg>`;
        fab.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:9999;width:48px;height:48px;border-radius:50%;background:#5865F2;color:#fff;border:none;box-shadow:0 4px 14px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .15s ease,background .15s ease;";
        fab.addEventListener("mouseenter", () => {
            fab.style.background = "#4752C4";
            fab.style.transform = "scale(1.06)";
        });
        fab.addEventListener("mouseleave", () => {
            fab.style.background = "#5865F2";
            fab.style.transform = "scale(1)";
        });
        fab.addEventListener("click", () => openDashboard());
        document.body.appendChild(fab);
    }
    function wireDashboardSettings(root) {
        const bridge = getDashboardBridge();
        if (!bridge) {
            console.warn("[UserDashboard] Dashboard bridge not set yet - settings form will not be wired up.");
            return;
        }
        const {settings: settings} = bridge;
        const $ = id => root.querySelector(`#${id}`);
        const closeBtn = $("ub-dash-close");
        const publishStatusDot = $("ub-publish-status-dot");
        const publishStatusText = $("ub-publish-status-text");
        if (bridge.onPublishStatusChange) {
            bridge.onPublishStatusChange((state, detail) => {
                if (!publishStatusDot || !publishStatusText) return;
                const map = {
                    idle: {
                        color: "var(--ub-text-faint)",
                        text: "Not published yet"
                    },
                    pending: {
                        color: "var(--ub-warning)",
                        text: "Waiting for you to stop typing…"
                    },
                    publishing: {
                        color: "var(--ub-accent-2)",
                        text: "Sending to server…"
                    },
                    success: {
                        color: "var(--ub-positive)",
                        text: "Synced to server ✓"
                    },
                    error: {
                        color: "var(--ub-danger)",
                        text: detail || "Failed to sync - retrying"
                    }
                };
                const s = map[state] || map.idle;
                publishStatusDot.style.background = s.color;
                publishStatusText.textContent = s.text;
                publishStatusText.style.color = s.color;
            });
        }
        if (closeBtn && closeBtn.getAttribute("data-ub-listener") !== "true") {
            closeBtn.setAttribute("data-ub-listener", "true");
            closeBtn.addEventListener("click", () => {
                setDashboardActive(false);
                closeDashboard();
            });
            closeBtn.addEventListener("mouseenter", () => {
                closeBtn.style.background = "var(--background-modifier-hover,rgba(79,84,92,0.16))";
                closeBtn.style.color = "#fff";
            });
            closeBtn.addEventListener("mouseleave", () => {
                closeBtn.style.background = "transparent";
                closeBtn.style.color = "#949BA4";
            });
        }
        const apiBaseUrl = $("ub-api-base-url");
        const badgeImageUrl = $("ub-badge-image-url");
        const badgeName = $("ub-badge-name");
        const importBadgeCode = $("ub-import-badge-code");
        const importPackUrl = $("ub-import-pack-url");
        const sessionToken = $("ub-session-token");
        const selfUserId = $("ub-self-user-id");
        const sessionTokenOverlay = $("ub-session-token-overlay-inner");
        const revokeTokenBtn = $("ub-revoke-token");
        const badgeModeInput = $("ub-badge-mode");
        const selectedPresetInput = $("ub-selected-preset");
        const iconSize = $("ub-icon-size");
        const iconSizeValue = $("ub-icon-size-value");
        const hoverEffectInput = $("ub-hover-effect");
        const glowColorField = $("ub-glow-color-field");
        const glowColor = $("ub-glow-color");
        const glowColorHex = $("ub-glow-color-hex");
        const bgModeInput = $("ub-bg-mode");
        const gradientFields = $("ub-gradient-fields");
        const gradientMain = $("ub-gradient-main");
        const gradientMainHex = $("ub-gradient-main-hex");
        const gradientSecondary = $("ub-gradient-secondary");
        const gradientSecondaryHex = $("ub-gradient-secondary-hex");
        const nameColor = $("ub-name-color");
        const nameColorHex = $("ub-name-color-hex");
        const showTooltipSwitch = $("ub-show-tooltip");
        const showPopupSwitch = $("ub-show-popup");
        const showPopupRow = $("ub-show-popup-row");
        const showOwnerTagSwitch = $("ub-show-owner-tag");
        const showOwnerTagRow = $("ub-show-owner-tag-row");
        const appendTagSwitch = $("ub-append-tag");
        const hideOwnBadgeSwitch = $("ub-hide-own-badge");
        function wireDropdown(dropdownId, hiddenInputId, valueElId, onChange) {
            const dropdown = root.querySelector(`#${dropdownId}`);
            const hiddenInput = $(hiddenInputId);
            const valueEl = root.querySelector(`#${valueElId}`);
            const trigger = root.querySelector(`#${dropdownId} .ub-dropdown-trigger`);
            const menu = root.querySelector(`#${dropdownId} .ub-dropdown-menu`);
            if (!dropdown || !hiddenInput || !valueEl || !trigger || !menu) return;
            trigger.addEventListener("click", e => {
                e.stopPropagation();
                const isOpen = dropdown.classList.contains("open");
                root.querySelectorAll(".ub-dropdown.open").forEach(d => d.classList.remove("open"));
                if (!isOpen) dropdown.classList.add("open");
            });
            menu.querySelectorAll(".ub-dropdown-option").forEach(opt => {
                opt.addEventListener("click", () => {
                    const val = opt.dataset.value ?? "";
                    hiddenInput.value = val;
                    valueEl.textContent = opt.textContent ?? "";
                    menu.querySelectorAll(".ub-dropdown-option").forEach(o => o.classList.remove("selected"));
                    opt.classList.add("selected");
                    dropdown.classList.remove("open");
                    onChange?.(val);
                });
            });
        }
        document.addEventListener("click", () => {
            root.querySelectorAll(".ub-dropdown.open").forEach(d => d.classList.remove("open"));
        });
        const TAB_COPY = {
            badges: {
                title: "Custom Badges",
                subtitle: "Adds a self-hosted custom badge with hover tooltip and click-to-view popup card, visible to anyone else running this plugin."
            },
            style: {
                title: "Styles Menu",
                subtitle: "Shape, size, hover effects, popup background, name color, and animation - everything that controls how your badge looks. Every change here is visible to anyone who views your badge."
            }
        };
        const pageHeading = root.querySelector("#ub-page-heading");
        const pageSubtitle = root.querySelector("#ub-page-subtitle");
        const tabUnderline = root.querySelector("#ub-tab-underline");
        const tabsContainer = root.querySelector("#ub-tabs-container");
        let activeTab = "badges";
        const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        function positionUnderline(tabEl) {
            if (!tabUnderline || !tabsContainer || !tabEl) return;
            const containerRect = tabsContainer.getBoundingClientRect();
            const tabRect = tabEl.getBoundingClientRect();
            tabUnderline.style.left = `${tabRect.left - containerRect.left}px`;
            tabUnderline.style.width = `${tabRect.width}px`;
        }
        function switchTab(tab) {
            if (tab === activeTab) return;
            activeTab = tab;
            root.querySelectorAll(".ub-dash-tab").forEach(t => {
                const active = t.dataset.tab === tab;
                t.setAttribute("aria-selected", String(active));
                t.style.borderBottomColor = active ? "#5865F2" : "transparent";
                t.style.color = active ? "#fff" : "#949BA4";
                t.style.fontWeight = active ? "600" : "500";
                if (active) positionUnderline(t);
            });
            const copy = TAB_COPY[tab] ?? TAB_COPY.badges;
            if (pageHeading) pageHeading.textContent = copy.title;
            if (pageSubtitle) pageSubtitle.textContent = copy.subtitle;
            const targetPanel = root.querySelector(`#ub-panel-${tab}`);
            const currentPanel = root.querySelector(".ub-tabpanel:not(.ub-hidden)");
            if (!targetPanel || targetPanel === currentPanel) return;
            if (prefersReducedMotion) {
                currentPanel?.classList.add("ub-hidden");
                targetPanel.classList.remove("ub-hidden");
                return;
            }
            currentPanel?.classList.add("ub-panel-fade-out");
            setTimeout(() => {
                currentPanel?.classList.add("ub-hidden");
                currentPanel?.classList.remove("ub-panel-fade-out");
                targetPanel.classList.remove("ub-hidden");
                targetPanel.classList.add("ub-panel-fade-in");
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => targetPanel.classList.remove("ub-panel-fade-in"));
                });
            }, 150);
        }
        root.querySelectorAll(".ub-dash-tab").forEach(t => {
            t.addEventListener("click", () => switchTab(t.dataset.tab ?? "badges"));
        });
        positionUnderline(root.querySelector('.ub-dash-tab[aria-selected="true"]'));
        window.addEventListener("resize", () => {
            positionUnderline(root.querySelector(`#ub-tab-${activeTab}`));
        });
        function wireChoiceGroup(groupId, hiddenInputId, onChange) {
            const group = root.querySelector(`#${groupId}`);
            const hiddenInput = $(hiddenInputId);
            if (!group || !hiddenInput) return;
            group.querySelectorAll(".ub-choice").forEach(btn => {
                btn.addEventListener("click", () => {
                    const val = btn.dataset.value ?? "";
                    hiddenInput.value = val;
                    group.querySelectorAll(".ub-choice").forEach(b => b.classList.remove("selected"));
                    btn.classList.add("selected");
                    onChange?.(val);
                });
            });
        }
        function setChoiceGroupValue(groupId, hiddenInputId, val) {
            const group = root.querySelector(`#${groupId}`);
            const hiddenInput = $(hiddenInputId);
            if (!group || !hiddenInput) return;
            hiddenInput.value = val;
            group.querySelectorAll(".ub-choice").forEach(b => {
                b.classList.toggle("selected", b.dataset.value === val);
            });
        }
        function wireSwitch(btn, onChange) {
            if (!btn) return;
            btn.addEventListener("click", () => {
                if (btn.disabled) return;
                const next = !btn.classList.contains("on");
                btn.classList.toggle("on", next);
                btn.setAttribute("aria-checked", String(next));
                onChange(next);
            });
        }
        function setSwitchValue(btn, val) {
            if (!btn) return;
            btn.classList.toggle("on", val);
            btn.setAttribute("aria-checked", String(val));
        }
        let tokenMasked = !!settings.store.sessionToken;
        function escapeHtml(s) {
            return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        function syncOverlayScroll() {
            if (!sessionToken || !sessionTokenOverlay) return;
            sessionTokenOverlay.style.transform = `translateX(${-sessionToken.scrollLeft}px)`;
        }
        function buildTokenChars(masked) {
            if (!sessionToken || !sessionTokenOverlay) return;
            const value = sessionToken.value;
            sessionToken.classList.toggle("ub-token-empty", !value);
            if (!value) {
                sessionTokenOverlay.innerHTML = "";
                syncOverlayScroll();
                return;
            }
            const chars = value.split("");
            sessionTokenOverlay.innerHTML = chars.map((ch, i) => {
                const delay = masked ? i * 16 : (chars.length - 1 - i) * 16;
                return `<span class="ub-token-char">` + `<span class="ub-token-glyph ub-token-glyph-letter${!masked ? " ub-token-shown" : ""}" style="transition-delay:${delay}ms">${escapeHtml(ch)}</span>` + `<span class="ub-token-glyph ub-token-glyph-dot${masked ? " ub-token-shown" : ""}" style="transition-delay:${delay}ms">•</span>` + `</span>`;
            }).join("");
            syncOverlayScroll();
        }
        function setTokenMasked(masked) {
            if (!sessionTokenOverlay) return;
            const charEls = sessionTokenOverlay.querySelectorAll(".ub-token-char");
            const total = charEls.length;
            charEls.forEach((charEl, i) => {
                const delay = masked ? i * 16 : (total - 1 - i) * 16;
                const letter = charEl.querySelector(".ub-token-glyph-letter");
                const dot = charEl.querySelector(".ub-token-glyph-dot");
                if (letter) {
                    letter.style.transitionDelay = `${delay}ms`;
                    letter.classList.toggle("ub-token-shown", !masked);
                }
                if (dot) {
                    dot.style.transitionDelay = `${delay}ms`;
                    dot.classList.toggle("ub-token-shown", masked);
                }
            });
            syncOverlayScroll();
        }
        sessionToken?.addEventListener("focus", () => {
            tokenMasked = false;
            setTokenMasked(false);
        });
        sessionToken?.addEventListener("blur", () => {
            if (!sessionToken.value) {
                tokenMasked = true;
                return;
            }
            requestAnimationFrame(() => {
                tokenMasked = true;
                setTokenMasked(true);
            });
        });
        sessionToken?.addEventListener("input", () => {
            buildTokenChars(document.activeElement === sessionToken ? false : tokenMasked);
        });
        sessionToken?.addEventListener("scroll", syncOverlayScroll);
        const guidelinesPanel = $("ub-guidelines-panel");
        const guidelinesBackdrop = $("ub-guidelines-backdrop");
        const CRT_CLOSE_ANIM_MS = 340;
        let guidelinesClosing = false;
        function openGuidelines() {
            if (!guidelinesPanel) return;
            guidelinesClosing = false;
            guidelinesPanel.classList.remove("ub-panel-closing");
            void guidelinesPanel.offsetWidth;
            guidelinesPanel.classList.add("ub-panel-open");
            if (guidelinesBackdrop) guidelinesBackdrop.classList.add("ub-backdrop-open");
        }
        function closeGuidelines() {
            if (!guidelinesPanel || guidelinesClosing || !guidelinesPanel.classList.contains("ub-panel-open")) return;
            guidelinesClosing = true;
            if (guidelinesBackdrop) guidelinesBackdrop.classList.remove("ub-backdrop-open");
            guidelinesPanel.classList.add("ub-panel-closing");
            setTimeout(() => {
                guidelinesPanel.classList.remove("ub-panel-open", "ub-panel-closing");
                guidelinesClosing = false;
            }, CRT_CLOSE_ANIM_MS);
        }
        $("ub-view-guidelines")?.addEventListener("click", openGuidelines);
        $("ub-guidelines-close")?.addEventListener("click", closeGuidelines);
        $("ub-guidelines-close-btn")?.addEventListener("click", closeGuidelines);
        guidelinesBackdrop?.addEventListener("click", closeGuidelines);
        function updatePopupLockState() {
            const locked = settings.store.badgeMode === "vencord";
            showPopupRow?.classList.toggle("ub-disabled", locked);
            if (showPopupSwitch) showPopupSwitch.disabled = locked;
            showOwnerTagRow?.classList.toggle("ub-disabled", locked);
            if (showOwnerTagSwitch) showOwnerTagSwitch.disabled = locked;
        }
        wireDropdown("ub-badge-mode-dropdown", "ub-badge-mode", "ub-badge-mode-value", val => {
            settings.store.badgeMode = val;
            bridge.onBadgeModeChange(val);
            updatePopupLockState();
        });
        wireSwitch(showTooltipSwitch, val => {
            settings.store.showTooltip = val;
        });
        wireSwitch(showPopupSwitch, val => {
            settings.store.showPopup = val;
        });
        wireSwitch(showOwnerTagSwitch, val => {
            settings.store.showOwnerTag = val;
        });
        wireSwitch(appendTagSwitch, val => {
            settings.store.appendTag = val;
            updatePreview();
        });
        wireSwitch(hideOwnBadgeSwitch, val => {
            settings.store.hideOwnBadge = val;
        });
        wireDropdown("ub-selected-preset-dropdown", "ub-selected-preset", "ub-selected-preset-value", val => {
            settings.store.selectedPreset = val;
        });
        function updateGlowFieldState() {
            glowColorField?.classList.toggle("ub-disabled", hoverEffectInput?.value !== "glow");
        }
        function updateGradientFieldsState() {
            gradientFields?.classList.toggle("ub-disabled", bgModeInput?.value !== "edit");
        }
        wireChoiceGroup("ub-icon-shape-group", "ub-icon-shape", val => {
            settings.store.badgeIconShape = val;
            updatePreview();
        });
        iconSize?.addEventListener("input", () => {
            if (iconSizeValue) iconSizeValue.textContent = `${iconSize.value}px`;
            settings.store.badgeIconSize = Number(iconSize.value);
            updatePreview();
        });
        iconSize?.addEventListener("change", () => {
            settings.store.badgeIconSize = Number(iconSize.value);
            updatePreview();
        });
        wireChoiceGroup("ub-hover-effect-group", "ub-hover-effect", val => {
            settings.store.badgeHoverEffect = val;
            updateGlowFieldState();
        });
        glowColor?.addEventListener("input", () => {
            if (glowColorHex) glowColorHex.textContent = glowColor.value.toUpperCase();
            settings.store.badgeGlowColor = glowColor.value;
        });
        glowColor?.addEventListener("change", () => {
            settings.store.badgeGlowColor = glowColor.value;
        });
        wireChoiceGroup("ub-bg-mode-group", "ub-bg-mode", val => {
            settings.store.popupBackgroundMode = val;
            updateGradientFieldsState();
            updatePreview();
        });
        gradientMain?.addEventListener("input", () => {
            if (gradientMainHex) gradientMainHex.textContent = gradientMain.value.toUpperCase();
            settings.store.popupGradientMain = gradientMain.value;
            updatePreview();
        });
        gradientMain?.addEventListener("change", () => {
            settings.store.popupGradientMain = gradientMain.value;
            updatePreview();
        });
        gradientSecondary?.addEventListener("input", () => {
            if (gradientSecondaryHex) gradientSecondaryHex.textContent = gradientSecondary.value.toUpperCase();
            settings.store.popupGradientSecondary = gradientSecondary.value;
            updatePreview();
        });
        gradientSecondary?.addEventListener("change", () => {
            settings.store.popupGradientSecondary = gradientSecondary.value;
            updatePreview();
        });
        nameColor?.addEventListener("input", () => {
            if (nameColorHex) nameColorHex.textContent = nameColor.value.toUpperCase();
            settings.store.badgeNameColor = nameColor.value;
            updatePreview();
        });
        nameColor?.addEventListener("change", () => {
            settings.store.badgeNameColor = nameColor.value;
            updatePreview();
        });
        wireChoiceGroup("ub-popup-anim-group", "ub-popup-anim", val => {
            settings.store.popupAnimationStyle = val;
        });
        const previewEmpties = Array.from(root.querySelectorAll(".ub-preview-empty"));
        const previewContents = Array.from(root.querySelectorAll(".ub-preview-content"));
        const previewRowIcons = Array.from(root.querySelectorAll(".ub-preview-row-icon"));
        const popupCards = Array.from(root.querySelectorAll(".ub-popup-card"));
        const popupImgs = Array.from(root.querySelectorAll(".ub-popup-img"));
        const popupNames = Array.from(root.querySelectorAll(".ub-popup-name"));
        const popupBys = Array.from(root.querySelectorAll(".ub-popup-by"));
        const previewWarnings = Array.from(root.querySelectorAll(".ub-preview-warning"));
        const radiusFor = shape => shape === "circle" ? "50%" : shape === "rounded" ? "6px" : "0";
        let previewToken = 0;
        async function updatePreview() {
            const token = ++previewToken;
            const url = badgeImageUrl?.value.trim() ?? "";
            const name = badgeName?.value.trim() ?? "";
            if (!url || !name) {
                previewEmpties.forEach(el => el.style.display = "");
                previewContents.forEach(el => el.style.display = "none");
                return;
            }
            previewEmpties.forEach(el => el.style.display = "none");
            previewContents.forEach(el => el.style.display = "");
            const bridge = getDashboardBridge();
            const data = await (bridge?.getPreviewData());
            if (token !== previewToken) return;
            const radius = radiusFor(data?.iconShape ?? "circle");
            previewRowIcons.forEach(el => {
                el.src = data?.imageUrl ?? url;
                el.style.width = `${data?.iconSize ?? 22}px`;
                el.style.height = `${data?.iconSize ?? 22}px`;
                el.style.borderRadius = radius;
            });
            popupCards.forEach(el => {
                el.style.background = data?.background ?? "#1d1d1d";
            });
            popupImgs.forEach(el => {
                el.src = data?.imageUrl ?? url;
                el.style.borderRadius = radius;
            });
            popupNames.forEach(el => {
                el.textContent = data?.displayName ?? name;
                el.style.color = data?.nameColor ?? "#ffffff";
            });
            popupBys.forEach(el => {
                el.textContent = data?.ownerTag ?? "";
                el.style.display = data?.ownerTag ? "" : "none";
            });
            previewWarnings.forEach(el => {
                el.style.display = data?.sampleFailed ? "" : "none";
            });
        }
        const myBadgesListEl = $("ub-my-badges-list");
        function renderMyBadgesList() {
            if (!myBadgesListEl) return;
            let badges = [];
            try {
                badges = JSON.parse(settings.store.myBadgesJson || "[]");
            } catch {
                badges = [];
            }
            const activeId = settings.store.myActiveBadgeId ?? "";
            if (!badges.length) {
                myBadgesListEl.innerHTML = "";
                return;
            }
            myBadgesListEl.innerHTML = badges.map(b => {
                const isActive = b.id === activeId;
                return `\n                    <div class="ub-badge-row${isActive ? " ub-badge-active" : ""}" data-badge-id="${b.id}">\n                        <img class="ub-badge-thumb" src="${b.imageUrl || ""}" alt="${b.description || ""}" referrerpolicy="no-referrer" />\n                        <span class="ub-badge-row-name">\n                            ${b.description || "Unnamed badge"}${isActive ? `<span class="ub-badge-active-tag">(active)</span>` : ""}\n                        </span>\n                        <div class="ub-badge-row-actions">\n                            ${!isActive ? `<button type="button" class="ub-badge-use-btn" data-use-id="${b.id}">Use</button>` : ""}\n                            <button type="button" class="ub-badge-delete-btn" data-delete-id="${b.id}">Delete</button>\n                        </div>\n                    </div>\n                `;
            }).join("");
            myBadgesListEl.querySelectorAll(".ub-badge-use-btn").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const id = btn.dataset.useId;
                    if (!id) return;
                    btn.disabled = true;
                    btn.textContent = "...";
                    try {
                        await bridge.switchToBadge(id);
                    } finally {
                        syncFromStore();
                    }
                });
            });
            myBadgesListEl.querySelectorAll(".ub-badge-delete-btn").forEach(btn => {
                btn.addEventListener("click", async () => {
                    const id = btn.dataset.deleteId;
                    if (!id) return;
                    btn.disabled = true;
                    btn.textContent = "...";
                    try {
                        await bridge.deleteBadgeSlot(id);
                    } finally {
                        syncFromStore();
                    }
                });
            });
        }
        function syncFromStore() {
            if (apiBaseUrl) apiBaseUrl.value = settings.store.apiBaseUrl ?? "";
            if (badgeImageUrl) badgeImageUrl.value = settings.store.myBadgeImageUrl ?? "";
            if (badgeName) badgeName.value = settings.store.myBadgeName ?? "";
            if (sessionToken) sessionToken.value = settings.store.sessionToken ?? "";
            if (selfUserId) selfUserId.value = settings.store.selfUserId ?? "";
            tokenMasked = document.activeElement === sessionToken ? false : !!settings.store.sessionToken;
            buildTokenChars(tokenMasked);
            if (revokeTokenBtn) revokeTokenBtn.disabled = !settings.store.sessionToken;
            renderMyBadgesList();
            const modeVal = settings.store.badgeMode ?? "original";
            if (badgeModeInput) badgeModeInput.value = modeVal;
            const modeOpt = root.querySelector(`#ub-badge-mode-menu .ub-dropdown-option[data-value="${modeVal}"]`);
            if (modeOpt) {
                root.querySelector("#ub-badge-mode-value").textContent = modeOpt.textContent ?? "";
                root.querySelectorAll("#ub-badge-mode-menu .ub-dropdown-option").forEach(o => o.classList.remove("selected"));
                modeOpt.classList.add("selected");
            }
            const presetVal = String(settings.store.selectedPreset ?? "0");
            if (selectedPresetInput) selectedPresetInput.value = presetVal;
            const presetOpt = root.querySelector(`#ub-selected-preset-menu .ub-dropdown-option[data-value="${presetVal}"]`);
            if (presetOpt) {
                root.querySelector("#ub-selected-preset-value").textContent = presetOpt.textContent ?? "";
                root.querySelectorAll("#ub-selected-preset-menu .ub-dropdown-option").forEach(o => o.classList.remove("selected"));
                presetOpt.classList.add("selected");
            }
            setChoiceGroupValue("ub-icon-shape-group", "ub-icon-shape", settings.store.badgeIconShape ?? "circle");
            const sizeVal = settings.store.badgeIconSize ?? 22;
            if (iconSize) iconSize.value = String(sizeVal);
            if (iconSizeValue) iconSizeValue.textContent = `${sizeVal}px`;
            setChoiceGroupValue("ub-hover-effect-group", "ub-hover-effect", settings.store.badgeHoverEffect ?? "none");
            const glowVal = settings.store.badgeGlowColor ?? "#ffffff";
            if (glowColor) glowColor.value = glowVal;
            if (glowColorHex) glowColorHex.textContent = glowVal.toUpperCase();
            updateGlowFieldState();
            setChoiceGroupValue("ub-bg-mode-group", "ub-bg-mode", settings.store.popupBackgroundMode ?? "base");
            const gradMainVal = settings.store.popupGradientMain ?? "#1d1d1d";
            if (gradientMain) gradientMain.value = gradMainVal;
            if (gradientMainHex) gradientMainHex.textContent = gradMainVal.toUpperCase();
            const gradSecVal = settings.store.popupGradientSecondary ?? "#2a2a38";
            if (gradientSecondary) gradientSecondary.value = gradSecVal;
            if (gradientSecondaryHex) gradientSecondaryHex.textContent = gradSecVal.toUpperCase();
            updateGradientFieldsState();
            const nameColorVal = settings.store.badgeNameColor ?? "#ffffff";
            if (nameColor) nameColor.value = nameColorVal;
            if (nameColorHex) nameColorHex.textContent = nameColorVal.toUpperCase();
            setChoiceGroupValue("ub-popup-anim-group", "ub-popup-anim", settings.store.popupAnimationStyle ?? "fade");
            setSwitchValue(showTooltipSwitch, settings.store.showTooltip ?? true);
            setSwitchValue(showPopupSwitch, settings.store.showPopup ?? true);
            setSwitchValue(showOwnerTagSwitch, settings.store.showOwnerTag ?? true);
            setSwitchValue(appendTagSwitch, settings.store.appendTag ?? false);
            setSwitchValue(hideOwnBadgeSwitch, settings.store.hideOwnBadge ?? false);
            updatePopupLockState();
            updatePreview();
        }
        syncFromStore();
        apiBaseUrl?.addEventListener("change", () => {
            settings.store.apiBaseUrl = apiBaseUrl.value;
        });
        badgeImageUrl?.addEventListener("input", () => {
            settings.store.myBadgeImageUrl = badgeImageUrl.value;
            updatePreview();
        });
        badgeImageUrl?.addEventListener("change", () => {
            settings.store.myBadgeImageUrl = badgeImageUrl.value;
            updatePreview();
        });
        badgeName?.addEventListener("input", () => {
            settings.store.myBadgeName = badgeName.value;
            updatePreview();
        });
        badgeName?.addEventListener("change", () => {
            settings.store.myBadgeName = badgeName.value;
            updatePreview();
        });
        const applyBadgeBtn = $("ub-apply-badge");
        applyBadgeBtn?.addEventListener("click", async () => {
            if (applyBadgeBtn.disabled) return;
            applyBadgeBtn.disabled = true;
            const originalLabel = applyBadgeBtn.textContent;
            applyBadgeBtn.textContent = "Applying...";
            try {
                await bridge.applyBadgeNow();
            } finally {
                applyBadgeBtn.disabled = false;
                applyBadgeBtn.textContent = originalLabel;
            }
        });
        $("ub-share-badge")?.addEventListener("click", () => bridge.shareMyBadge());
        $("ub-revert-badge")?.addEventListener("click", () => {
            bridge.revertBadge();
            syncFromStore();
        });
        $("ub-refresh-cache")?.addEventListener("click", () => bridge.refreshBadgeCache());
        $("ub-import-badge")?.addEventListener("click", () => {
            settings.store.importBadgeCode = importBadgeCode?.value ?? "";
            bridge.importBadgeFromCode();
            if (importBadgeCode) importBadgeCode.value = "";
            syncFromStore();
        });
        $("ub-apply-preset")?.addEventListener("click", () => {
            bridge.applySelectedPreset();
            syncFromStore();
        });
        $("ub-new-badge-slot")?.addEventListener("click", () => {
            bridge.createNewBadgeSlot();
            syncFromStore();
        });
        $("ub-import-pack")?.addEventListener("click", () => {
            settings.store.importPackUrl = importPackUrl?.value ?? "";
            bridge.importPackFromUrl();
            syncFromStore();
        });
        $("ub-make-pack")?.addEventListener("click", () => {
            bridge.makePack();
            if (!settings.store.packGuidelinesShown) {
                settings.store.packGuidelinesShown = true;
                openGuidelines();
            }
        });
        $("ub-browse-packs")?.addEventListener("click", () => bridge.browsePacks());
        $("ub-verify-account")?.addEventListener("click", () => bridge.verifyAccount());
        sessionToken?.addEventListener("change", () => {
            settings.store.sessionToken = sessionToken.value;
            if (revokeTokenBtn) revokeTokenBtn.disabled = !settings.store.sessionToken;
            fetchWriteBudget();
        });
        selfUserId?.addEventListener("change", () => {
            const val = selfUserId.value.trim();
            if (val && !/^\d{15,25}$/.test(val)) {
                toast("That doesn't look like a Discord User ID (should be a 15-25 digit number)", {
                    type: "error"
                });
                return;
            }
            settings.store.selfUserId = val;
            if (val) toast("Manual User ID saved - publishing will use this instead of auto-detection", {
                type: "success"
            });
        });
        revokeTokenBtn?.addEventListener("click", async () => {
            if (!settings.store.sessionToken || revokeTokenBtn.disabled) return;
            revokeTokenBtn.disabled = true;
            const originalLabel = revokeTokenBtn.textContent;
            revokeTokenBtn.textContent = "Revoking...";
            try {
                await bridge.revokeSessionToken();
            } finally {
                syncFromStore();
                if (revokeTokenBtn.textContent === "Revoking...") revokeTokenBtn.textContent = originalLabel;
            }
        });
    }
    function init() {
        log("v11 tooltip + card initializing...");
        initDashboard();
        scan();
        new MutationObserver(scan).observe(document.body, {
            childList: true,
            subtree: true
        });
        setInterval(scan, 500);
    }
    if (document.body) init(); else document.addEventListener("DOMContentLoaded", init);
    window.refreshCustomBadges = () => {
        document.querySelectorAll(`[${MARKER}]`).forEach(el => el.removeAttribute(MARKER));
        badgeCache.clear();
        scan();
    };
})();
