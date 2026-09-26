# Selected-reference QA · 2026-09-26

## Findings

No actionable P0/P1/P2 findings in the tested UI scope.

## Evidence

- Visual source: `/Users/lipaliu/Downloads/Codex 图像 2026年9月26日 16_22_46.png`.
- Shared link: https://chatgpt.com/s/cx_6ab78114edd08191ad8563fd43b8cb1b (body unavailable; supplied image is authoritative).
- Desktop: `qa/reference-implementation-desktop.png`, 1487 × 1058, production build, initial gallery state.
- Combined comparison: `qa/reference-comparison.png`, source left / browser render right; visually reviewed in full.
- Mobile: `qa/reference-implementation-mobile.png`, 390 × 844.
- Responsive browser checks: 320 × 740, 390 × 844, 768 × 1024 and 1487 × 1058.

## Required fidelity surfaces

- Typography: centered dark Chinese serif heading, spaced eyebrow, quiet sans-serif supporting copy; title, subtitle and CTA copy match the selected source.
- Layout: floating original logo and top navigation, five perspective cover cards, central portrait, round carousel controls, pagination, pill upload CTA and underlined text-entry route.
- Colors: pale lavender-to-blue field, dark purple ink, translucent light work surfaces and purple primary action. Removed the rejected dark hero and two-entry card sheet.
- Images: five separately generated WebP posters follow the source themes, composition and cover text. These are regenerated artworks, not exact source-image crops.
- Responsive: small screens center the main cover with adjacent covers visible; all five examples remain accessible via arrows/dots. Fixed center offset, hidden Favorites label and 320px CTA wrapping.

## Interaction verification

- Next carousel arrow changes active example and label.
- Full-text entry opens the existing Title Master form.
- Custom publishing title and cover main text enable entry into the existing image workflow.
- Return selection returns to the gallery; re-entering Title Master preserves the entered publishing title.
- Logo returns to homepage.
- Upload CTA opens the existing source/ratio selection step; return selection works.
- Browser console: no captured errors in the tested local session.
- Typecheck, production build and all 10 existing tests pass.
- No paid model generation, SMS, payment or account mutation was triggered during UI checks. This QA does not claim those external services were exercised.

## Remaining P3 differences

- Generated photographs and embedded typography are close to, but not pixel-identical with, the reference.
- Background uses a soft CSS light field, not the reference's exact reflective-floor artwork.
- Chinese serif rendering depends on installed system fonts.

final result: passed (selected-reference visual and navigation scope)
