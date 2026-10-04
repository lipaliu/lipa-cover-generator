# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, visible content, and hierarchy.

## Design Direction (v2 — Mac Minimal Editorial)

Selected direction: macOS-native minimal editorial. The UI should feel like a premium Apple utility app with magazine-quality typography:

- **Palette**: Light mode only. Background `#f5f5f7`, surfaces white with `backdrop-filter: blur(20px) saturate(180%)`, ink `#1d1d1f`, secondary `#6e6e73`, tertiary `#aeaeb2`.
- **Typography**: SF Pro Display / system font stack for body. Serif headings (New York / Georgia / Noto Serif SC) for section titles — editorial magazine feel. SF Mono for data/hex values.
- **Surfaces**: Frosted glass (`rgba(255,255,255,0.72)` + blur), hairline borders (`rgba(0,0,0,0.06)`), subtle shadows. No loud gradients or decoration.
- **Spacing**: Generous whitespace, compact controls, 20px panel padding, 14–20px gaps.
- **Radius**: 8/12/16/20px scale. Cards 12px, panels 20px, buttons 8–12px.
- **Interactions**: Subtle hover lifts on cards, 0.15s transitions, no heavy animations.
- **Responsive**: Desktop two-column (setup + output), tablet single-column, mobile shows bottom tab bar.
- **Accent**: Apple blue `#0071e3` for focus states and active indicators only — used sparingly.

Logo direction: use a macOS-style rounded-square app icon with four letters in a 2x2 grid: L I on the first row, P A on the second row. Dark background (#1d1d1f), white text. Use it for the header logo and PWA icon.

## Durable visual feedback (2026-09-26)

- The user explicitly wants the complete BAKABAKA website to feel more like a major premium brand (“更具大牌感”) through the Lipa UI system.
- For BAKABAKA, premium does not mean replacing its identity with a generic black-and-white luxury template. Preserve the purple brand field and the existing BAKABAKA logo, but reduce candy gradients, repeated glass cards, glow, and decorative chrome.
- The discovery surface should read like an art-directed cover; the working surface should read like a calm professional creative console. Use bolder editorial scale, fewer visible containers, disciplined spacing, and one clear action per stage.

## Selected visual supersedes the premium interpretation (2026-09-26)

- The user rejected the dark purple hero and stacked entry sheet as ugly. The exact source of truth is `/Users/lipaliu/Downloads/Codex 图像 2026年9月26日 16_22_46.png`, linked from `https://chatgpt.com/s/cx_6ab78114edd08191ad8563fd43b8cb1b`.
- Match the luminous pale lavender/blue field, floating original logo, centered bold Chinese serif headline, five photographic cover examples fanned across the page, round carousel controls, purple pill upload CTA, and underlined full-text entry.
- Do not reintroduce the dark hero panel, giant repeated logo, decorative B, numbered two-card entry sheet, or independently reinterpret "premium". Use the screenshot as the visual authority.
- The carousel is an example gallery; the real creation workflow, Title Master fields, all model options, credits, and back navigation remain functional.

## Showcase content correction (2026-09-26)

- User wants the homepage gallery to use previously supplied Xiaohongshu-style or 小Lin说 cover references, not newly generated lifestyle posters. Preserve the selected homepage layout while changing its content.
- The corpus descriptions in `references/aesthetic-profile.md` are not the original images. Locate the actual supplied assets before replacing the gallery; do not pass unrelated generated samples off as the user's reference library.
- User supplied two exact cover JPGs: 马尔代夫 VLOG and 三伏天养生. These replace the initial center portrait and adjacent mountain cover respectively; keep the remaining three samples until additional replacements are supplied. Use the supplied files without regenerating their artwork.

## Liquid-glass homepage supersedes the lavender gallery (2026-10-04)

- The user approved a new homepage after several rounds (record: `docs/apple-redesign-decision.md`): the structure of nikdelvin/liquid-glass — full-bleed moving backdrop, centred glass slabs for the white logo and 「下一张封面，换一种可能。」, a dark glass pill 「上传底图，做我的封面」 and a light glass pill 「从完整原文开始」, and a glass palette dock at the bottom. No cover gallery on the homepage.
- Colour: coral red (palette `blush`) is the default; the dock also offers Tahoe blue, mint, iris and silver, remembered per browser.
- Background: our flowing-glass shader plus the fluid-glow layer adapted from PavelDoGreat/WebGL-Fluid-Simulation (MIT). The pointer drags glowing fluid, wisps drift in on their own, a tap bursts light.
- Code: `src/components/GlassHome.tsx`, `src/glass/glassHome.ts`, `src/glass/glass-home.css`, static scripts and licences in `public/glass/`. The two buttons call the existing cover and Title Master flows unchanged. `CoverShowcase.tsx` is kept but no longer rendered.
- Only the homepage has changed so far; the creation steps, results, login and recharge screens still use the lavender theme until the user approves their redesign.

## Title Master Integration Guardrails

- Keep BAKABAKA's Image2, Seedream, SeeDance, design-matrix, prompt, regeneration, and queue pipelines unchanged.
- Start with a two-path choice. With a full script: generate and select the publishing title + cover copy first, then enter BAKABAKA's existing image workflow with those fields prefilled. Without a full script: skip Title Master and enter the existing BAKABAKA workflow immediately.
- Title Master remains a separate service owned by `lipaliu/changdao-title-h5`; call its API through the thin server proxy instead of copying or rewriting its model prompts inside BAKABAKA.
- A selected title plan may only fill the publishing title, cover main text, and cover subtitle before handing control back to the existing cover-generation pipeline.
- Treat generated title plans as optional inspiration, never a forced choice. Keep editable fields for publishing title, cover main text, and cover subtitle; users may mix suggestions, rewrite them, or enter their own copy before continuing.
- Final delivery should keep the generated cover image together with the publishing title and cover copy for the publishing team.

## Commercial Launch Guardrails

- Public mode uses phone/SMS registration, database-backed credits, and WeChat Native QR payments. Keep the old username/password gate only for `/admin` and private fallback access.
- Prices come only from `server/pricing.js`; never hard-code a second price list in the frontend.
- Credit deductions, refunds, payment callbacks, and fulfillment must remain transactional and idempotent. A repeated WeChat callback must never add credits twice.
- Do not enable `PUBLIC_SIGNUP_MODE=1` until the database, SMS, JWT secret, WeChat Pay credentials, and legal operator information are all configured.
- Commercial/account changes remain outside the established BAKABAKA generation and Title Master model pipelines.
