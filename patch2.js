function updateDraftInputCursorAlignment() {
  const inkCursorAnchor = document.getElementById('ink-cursor-anchor') || document.getElementById('ink-cursor');
  if (!inkCursorAnchor || !DOM.pageSheet || !DOM.draftInput || !DOM.draftBox) return;

  const pageRect = DOM.pageSheet.getBoundingClientRect();
  const cursorRect = inkCursorAnchor.getBoundingClientRect();
