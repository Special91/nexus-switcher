## 2026-08-22 - Adding Accessible ARIA Labels with Existing i18n System
**Learning:** Found that this vanilla JS app uses a lightweight custom i18n system via `data-i18n-*` attributes processed in `app.js`. Purely visual elements like theme color pickers and icon-only buttons lacked `aria-label` attributes, posing an accessibility issue.
**Action:** Extended the i18n parser in `app.js` to support `data-i18n-aria` attributes, automatically injecting translated `aria-label` strings for screen readers. This ensures accessibility remains localized as new languages are added.
