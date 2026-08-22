<div align="center">

<img src="https://files.catbox.moe/o5dhdh.png" alt="Custom Badges logo" width="200" />

# Custom Badges — Userscript

[![Userscript](https://img.shields.io/badge/Userscript-Tampermonkey%20%2F%20Violentmonkey-1E9E56?style=for-the-badge&logo=tampermonkey&logoColor=fff&labelColor=1B3B2A)](https://www.tampermonkey.net/)
[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-2E8B57?style=for-the-badge&labelColor=15291D&logoColor=fff)](https://www.gnu.org/licenses/gpl-3.0.html)
[![Cloudflare Workers](https://img.shields.io/badge/Backend-Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=fff&labelColor=1B3B2A)](https://workers.cloudflare.com/)
[![Discord Server](https://img.shields.io/badge/Discord-Join%20Server-2E8B57?style=for-the-badge&logo=discord&logoColor=fff&labelColor=1B3B2A)](https://discord.gg/PUYaka9Hy8)

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=323330&labelColor=15291D)
![Single File](https://img.shields.io/badge/Format-Single%20File%20Userscript-6FA98A?style=flat&labelColor=15291D&color=6FA98A)
![Third-Party](https://img.shields.io/badge/Third--Party-Not%20affiliated%20with%20Discord-4C7A63?style=flat&labelColor=15291D&color=4C7A63)
![Status](https://img.shields.io/badge/Status-Active-3BA55D?style=flat&labelColor=15291D&logoColor=fff)
</div>

A userscript that gives you a custom profile badge  image, description,
hover tooltip, and click popup card  visible to anyone else running the
script. It injects its own in-page **Dashboard** directly into Discord,
covering badge slots, presets, importable/exportable badge packs, and a
full **Style Studio** section for theming the badge itself (name color,
icon size/shape, hover effects), plus a dark, black-based dashboard UI
styled to match Discord, with its own green accent color variables.

- Custom profile badge: image, description, and per-badge styling
- Up to 12 saved badge slots, one active at a time  switch between them from the in-page dashboard
- Built-in presets, plus importable/exportable badge packs (raw GitHub JSON, or paste-a-code sharing)
- **Style Studio**: badge name color, icon size, icon shape (circle / rounded / square), and hover effect (none / scale / glow, with a configurable glow color)
- Dark, black-themed dashboard UI with CSS custom properties so the panel itself is easy to re-skin
- Badge data synced through a small Cloudflare Worker + KV backend
- Behavior toggles: tooltip on/off, owner tag on the popup card, append a tag to your badge name, hide your own badge from yourself

---

<details>
<summary><img src="https://files.catbox.moe/jhnu1h.png" width="30" height="30" align="absmiddle" /> $\Huge{\color{#2E8B57}\textsf{Installation (click to expand)}}$</summary>

### 1. Install a userscript manager

You need a userscript manager installed in your browser first:

- **[Tampermonkey](https://www.tampermonkey.net/)** (Chrome, Firefox, Edge, Safari, Opera)
- **[Violentmonkey](https://violentmonkey.github.io/)** (Chrome, Firefox, Edge)
- **[Greasemonkey](https://www.greasespot.net/)** (Firefox)

### 2. Install the script

Open `CustomBadges_userscript.js`, your userscript manager should detect it
automatically and prompt you to install it. If it doesn't open on its own,
open your userscript manager's dashboard and use **Create a new script** /
**Import**, then paste in the file's contents.

### 3. Confirm it's enabled

Open your userscript manager's dashboard and make sure **Discord Custom
Badges** is toggled on and matches `discord.com`.

### 4. Reload Discord

Refresh any open Discord tabs (`Ctrl/Cmd + R`) so the script can inject.

</details>

---

## Usage

- Open the in-page **Dashboard** (a button/icon is injected into Discord's UI) to manage everything  badge image/name, slots, presets, packs, behavior, and the Style Studio.
- Your badge is stored server-side, keyed to your Discord user ID, so it follows you across devices as long as the script is installed and enabled in your userscript manager.
- **My Badges** lets you keep multiple saved looks and switch which one is live without re-entering the image/description each time.
- **Badge Packs** let you import a themed set of badges from a raw GitHub URL, or copy your own badges out as JSON to share.

## Color Theme (Style Studio)

The Style Studio section controls how *your badge* looks to other people:

| Setting | Controls |
|---|---|
| Badge Name Color | Hex color of your badge's name text |
| Badge Icon Size | Pixel size of the badge icon in the badge row |
| Badge Icon Shape | Circle, rounded square, or square |
| Badge Hover Effect | None, scale-up, or glow (with a separate hex glow color) |

Separately, the **dashboard itself** ships with a dark, Discord-style
theme built on its own set of CSS variables, scoped so it doesn't leak
into the rest of the page. If you want to reskin the dashboard to match a
different look, override those variables from a browser style extension
rather than editing the script file directly  it keeps your changes
intact across script updates.

## Backend (Self-Hosting / Contributors)

Badge data is served from a Cloudflare Worker (default:
`custom-badges.shadow-164.workers.dev`). To run your own instance:

1. Deploy your own Worker + KV namespace for badge storage.
2. Open the in-page dashboard and set **Api Base Url** to your Worker's URL.

### Account Verification

Setting, switching, or deleting a badge requires proving you own the
Discord account you're doing it as:

1. Click **Verify Discord Account** in the dashboard  this opens `{apiBase}/auth/start` in your browser via Discord OAuth (identify scope only).
2. Confirm you're signed in as the right account and follow the prompt there.
3. Copy the code it gives you back and paste it into the **Session Token** field in the dashboard.

That token authorizes every write from then on, sent as a `Bearer` header 
reading badges (yours or anyone else's) never required it and still
doesn't. The token doesn't expire on its own; if a publish/switch/delete
ever fails with a `NOT_VERIFIED` error, just re-verify and paste a fresh
code.

If you ever lose track of your token, or think someone else got hold of
it, hit **Revoke Your Token**  this immediately kills that token
server-side, and you'll need to verify again to get a new one.

---

## License

This userscript is distributed under **GPL-3.0-or-later**. You're free to
use, study, modify, and share it, but if you distribute a modified
version, you must also make its source available under the same license.
See the full license text at https://www.gnu.org/licenses/gpl-3.0.html.

This is a third-party script and isn't affiliated with, endorsed by, or
supported by Discord Inc. Use of client modifications may be against
Discord's Terms of Service  use at your own risk.

## Community & Support

- **Found someone using this script to display NSFW, hateful, or otherwise abusive badge content?** Please report it  don't just block and move on.
- **Something broken or not working as expected?**
  1. Check the FAQs channel first  your issue may already be answered there.
  2. If it's not covered, ask in the issues help chat.
  3. To report a bug, abuse, or a badge that violates the rules, use the Reports chat.
- Join the server here: https://discord.gg/PUYaka9Hy8
