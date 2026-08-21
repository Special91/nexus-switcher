## 2026-08-21 - [Aria labels in multilingual apps]
**Learning:** In multilingual apps (like those toggling English/Arabic), hardcoding `aria-label` attributes breaks accessibility for non-English users. Attributes like `aria-label` need to be dynamically translated just like visible text.
**Action:** When adding ARIA labels in apps with an existing i18n system, ensure the accessibility attributes are also integrated into the translation framework (e.g., adding a custom `data-i18n-aria-label` handling in the translation function).
