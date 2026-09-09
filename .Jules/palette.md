## 2024-05-18 - Improve Keyboard Accessibility and Screen Reader Support
**Learning:** Found multiple instances of interactive elements lacking focus outlines and screen-reader accessible names on icon-only buttons. The lack of `:focus-visible` styles makes keyboard navigation difficult.
**Action:** Added global `:focus-visible` styles to `styles.css` and `aria-label`/`data-i18n-title` to icon-only buttons in `index.html` to improve the keyboard & screen reader UX.
