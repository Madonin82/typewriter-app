    if (!page.locked) {
      const anchor = document.createElement('span');
      anchor.id = 'ink-cursor-anchor';
      DOM.inkStream.appendChild(anchor);

      const ghost = document.createElement('span');
      ghost.id = 'ink-ghost';
      ghost.className = 'ink-ghost';
      // populate with current buffer if any
      ghost.textContent = state.buffer || '';
      DOM.inkStream.appendChild(ghost);

      const cursor = document.createElement('span');
      cursor.className = 'ink-cursor';
      cursor.id = 'ink-cursor';
      DOM.inkStream.appendChild(cursor);
    }
