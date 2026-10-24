# Design System: Runway

## 1. Visual Theme & Atmosphere
Runway is a Mezo testnet payment workspace for funding team payment schedules, viewing earned payments, organizing contractors and reviewing borrowing. Use a calm financial workspace: density 4, variance 5, motion 6. Preserve the recognizable green identity. Put the left-aligned page title and one primary action above a precise balance ledger. Use an asymmetric supporting grid, clear information hierarchy and generous space. Show real state; never invent balances or imply a wallet is connected.

## 2. Color Palette & Roles
- Canvas Zinc (#F7F7F8): page background.
- Surface White (#FFFFFF): forms and primary content surfaces.
- Charcoal Ink (#202225): primary text and sidebar background.
- Secondary Ink (#60646B): body copy and metadata.
- Quiet Border (#DFE1E4): separators and input boundaries.
- Forest Green (#31745A): the single accent, used for primary actions, selected navigation and focus rings. Saturation stays below 80%.
- Soft Forest (#EDF4F0): selected and explanatory backgrounds.
- Inverse Ink (#F7F7F8): sidebar text and primary button labels.
Errors use explicit text and icons, never color alone. Keep one neutral family throughout.

## 3. Typography Rules
Use Geist for headings and body; Geist Mono for balances, addresses and timestamps. Sans-serif fallbacks are required. Headings use weight 600-700, tracking -0.04em and fluid 1.75rem to 2.5rem sizing. Body copy is 0.9375rem with 1.65 leading and a 65ch reading measure; input text is at least 1rem. Labels are at least 0.75rem. Distinguish numerical values with tabular figures. Do not use Inter or serif fonts.

## 4. Component Stylings
- Buttons: minimum 44px height, 10px corners, forest primary fill, outlined secondary actions. Hover lifts by 1px; press returns with a subtle scale. Clear keyboard focus and disabled states. No glow.
- Navigation: charcoal desktop rail, white brand, inset forest selection and consistent line icons. Below 768px use compact always-visible two-column navigation below the brand. Documentation stays in a full-width footer row. Selected navigation remains explicit without opening a menu.
- Balance ledger: one divided surface, a wider first value and two smaller values on desktop; stacked rows on mobile. Never three equal independent cards.
- Panels: white with 16px corners, 1px quiet border and restrained tinted shadow only where hierarchy needs it. Dense rows use separators.
- Forms: labels above fields, helpers and errors below, 48px minimum input height, predictable spacing, single-column below 768px. Range controls have a 44px touch area.
- Empty states: small geometric line illustration, an explanation and a useful next action. No fabricated records.
- Loading: dimension-preserving skeletons with an opacity shimmer when data is actually pending; no fake activity. Inline errors retain retry controls.

## 5. Layout Principles
Grid-first shell: 232px desktop navigation and minmax(0, 1fr) content. The page uses all remaining width without a centered maximum-width container. Use min-height: 100dvh. Content gutters are 24px on desktop and 16px on mobile. At 768px all content grids become a single column, including forms and borrowing values. Support 320px without document overflow. Use wrapping addresses and min-width: 0. Every interactive target is at least 44px. On narrow screens headers and actions wrap without collisions. Popovers must remain inside the viewport. No overlapping content, percentage math or fixed-height content sections.

## 6. Motion & Interaction
Use transform and opacity only for animations. Use 180-240ms cubic-bezier(0.22, 1, 0.36, 1) for tactile controls and 320ms staggered entry for primary sections. If spring motion is introduced, use stiffness 100 and damping 20. Active navigation has a very subtle repeating opacity change on its marker; pending skeletons have a repeating opacity shimmer. Keep loops small and isolated. Disable decorative motion, transitions and smooth scrolling under prefers-reduced-motion. Never animate dimensions or add a heavy animation runtime for simple CSS effects.

## 7. Anti-Patterns (Banned)
No emoji icons, Inter, generic serif fonts, pure black, neon glows, oversaturated accents, gradient headline text, custom cursors, overlapping content, three equal feature cards, fake balances or generic placeholder people. No stock photography in the financial workspace. No centered marketing hero, filler scroll prompts, or copy such as Elevate, Seamless, Unleash or Next-Gen. Keep transaction terms, warnings, wallet status and testnet disclosures explicit.

## Stitch Reference
Project: https://stitch.withgoogle.com/projects/17991003567305310602
The implemented application remains the source for functionality; Stitch screens are visual references.

## October 18 refinement — approved theme, clearer hierarchy

Preserve every existing color and font above. The current task improves composition and usability rather than changing the theme. Use the Stitch reference `c7613e19b94f40999a300e325f0a0ab2` for layout direction only. Its invented filters, borrowing parameters and claimable metric are not product requirements and must not be implemented without real functionality and validated data.

- Navigation uses consistent 20px outline SVG icons with 1.6px strokes. Keep labels, selected-page semantics and always-visible mobile navigation. Use 6px vertical gaps and subtle separators around help and network information.
- Content remains full width. Use 32px desktop gutters, 24px tablet gutters and 16px mobile gutters. Page headings and primary actions share one row where space permits.
- The asymmetric treasury ledger retains the actual three metrics: available MUSD, funded obligations and BTC gas reserve. Tint its first cell very subtly to establish hierarchy. Disconnected values remain unavailable, never invented.
- Payment schedules have a divided header and a compact, left-aligned empty state with a wallet outline and clear next action. On desktop use an icon column and content column; stack below 768px.
- Explain funding, accrual and claiming in three numbered rows within one supporting panel. Use a smaller adjacent borrowing panel with its existing read-only purpose and link.
- Workspace sign-in pairs the real wallet login controls with a supporting three-step explanation. Stack both sections below 1101px. Keep gas and fund-movement disclosures visible.
- Forms separate headings from fields with a quiet rule and distinguish payment terms in a neutral inset. Saved records use consistent 24px padding and separated metadata.
- Assistant welcome content is left aligned, with a comfortable 900px maximum reading/composer surface. Suggested questions have legible 13–14px type. Send and stop buttons are at least 44px square. Keep all source, provider and privacy disclosures.
- Documentation uses a subtle rule to anchor its contents navigation. Keep the article measure and all existing anchor behavior.

Implementation: `apps/web/src/refinements.css` is the final refinement layer over the existing base stylesheet. No additional UI or animation dependency is required.
