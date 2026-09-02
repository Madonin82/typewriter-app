const fs = require('fs');
let css = fs.readFileSync('style.css', 'utf-8');
css = css.replace(
  /@media \(max-width: 860px\) {[\s\S]*?#panel-center {\n    padding: 36px 20px;\n  }/,
  `@media (max-width: 860px) {
  #esc-overlay {
    flex-direction: column;
    overflow-y: auto;
  }
  #panel-left, #panel-right {
    width: 100%;
    transform: none !important;
    border: none;
  }
  #panel-center {
    order: -1;
    padding: 48px 20px 36px;
    border-bottom: 1px solid #333;
  }
  #panel-left {
    order: 0;
    border-bottom: 1px solid #333;
  }
  #panel-right {
    order: 1;
  }`
);
fs.writeFileSync('style.css', css);
