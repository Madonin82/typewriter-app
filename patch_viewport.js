  // Window Resize & Cursor Alignment
  window.addEventListener('resize', () => {
    updateDraftInputCursorAlignment();
  });

  // Mobile Visual Viewport Adjustment for Keyboard
  if (window.visualViewport) {
    const adjustForKeyboard = () => {
      const draftOverlay = document.getElementById('draft-overlay');
      if (draftOverlay) {
        const layoutHeight = window.innerHeight;
        const visualHeight = window.visualViewport.height;
        const offsetTop = window.visualViewport.offsetTop;
        // On iOS Safari, the visual viewport height shrinks when keyboard appears
        const diff = layoutHeight - visualHeight - offsetTop;
        draftOverlay.style.bottom = Math.max(24, diff + 24) + 'px';
      }
    };
    window.visualViewport.addEventListener('resize', adjustForKeyboard);
    window.visualViewport.addEventListener('scroll', adjustForKeyboard);
    adjustForKeyboard();
  }

  // Mobile Tap-to-Focus
  if (DOM.writingSurface) {
    DOM.writingSurface.addEventListener('click', (e) => {
      // Don't intercept clicks on buttons or the draft overlay itself
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      if (e.target.closest('#draft-overlay')) return;
      
      const page = getCurrentPage();
      if (page && !page.locked && DOM.draftInput) {
        DOM.draftInput.focus();
      }
    });
  }
