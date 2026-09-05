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
