## 2025-05-15 - Missing Global Focus Indicator
**Learning:** This Electron application lacks a global focus indicator for interactive elements, which makes keyboard navigation extremely difficult for users who rely on the tab key to move through the interface.
**Action:** Always add a global `*:focus-visible` rule using the primary theme color to ensure that keyboard focus is visibly clear and accessible.

## 2025-05-15 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Icon-only buttons without `aria-label` attributes are completely inaccessible to screen readers, as there's no textual content to describe their function.
**Action:** Always ensure that icon-only interactive elements contain a descriptive `aria-label` attribute to maintain accessibility.
