const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf-8');
css = css.replace(
  /@media \(max-width: 860px\) {[\s\S]*?#panel-right {\n    order: 1;\n  }/,
  `@media (max-width: 860px) {
  #esc-overlay {
    flex-direction: column;
    overflow-y: auto;
    justify-content: flex-start;
  }
  #panel-left, #panel-center, #panel-right {
    width: 100%;
    transform: none !important;
    border: none;
    overflow-y: visible;
    flex: none;
  }
  #panel-center {
    order: -1;
    padding: 64px 20px 48px;
    border-bottom: 1px solid var(--panel-border);
  }
  #panel-left {
    order: 0;
    border-bottom: 1px solid var(--panel-border);
  }
  #panel-right {
    order: 1;
    padding-bottom: 64px;
  }`
);
fs.writeFileSync('style.css', css);
