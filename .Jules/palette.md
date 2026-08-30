## 2024-05-24 - Initial Journal
**Learning:** Initial journal setup.
**Action:** None.

## 2024-05-24 - Missing Focus Indicators for Keyboard Users
**Learning:** The application lacked global focus indicators, which severely impairs keyboard navigation accessibility. This highlights a common issue in custom UI implementations where native focus outlines are omitted or overridden without being replaced.
**Action:** Implemented a global `:focus-visible` rule in the main stylesheet (`styles.css`) using the existing `--primary` design token to ensure consistent, accessible focus states across all interactive elements without relying on custom CSS classes.
