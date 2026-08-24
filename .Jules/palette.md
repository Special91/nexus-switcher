## 2024-05-18 - Accessibility Improvements
**Learning:** The application uses custom `data-i18n-*` attributes for localization, which can be extended to support ARIA labels (`data-i18n-aria-label`) for dynamic, translated screen reader support on icon-only buttons.
**Action:** Always leverage the `data-i18n-aria-label` attribute and update the `app.js` translation loop when adding new icon-only buttons to ensure localized accessibility.
