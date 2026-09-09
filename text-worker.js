/**
 * Note to Self — Dedicated Web Worker for Heavy Text Analysis, Search & Export
 * Offloads compute-intensive text operations (word counts, readability metrics, 
 * regex searches, export format transformations) from the main UI thread.
 */

self.onmessage = function (e) {
  const { id, type, payload } = e.data || {};
  if (!type) return;

  try {
    let result;
    switch (type) {
      case 'ANALYZE_MANUSCRIPT':
        result = analyzeManuscript(payload.book, payload.wordsPerPage || 300);
        break;

      case 'ANALYZE_TEXT':
        result = analyzeRawText(payload.text || '', payload.title || 'Draft');
        break;

      case 'SEARCH_MANUSCRIPT':
        result = searchManuscript(payload.book, payload.query, payload.options);
        break;

      case 'COUNT_WORDS_BATCH':
        result = countWordsBatch(payload.pages || []);
        break;

      case 'COMPILE_EXPORT':
        result = compileExportText(payload.book, payload.format);
        break;

      case 'FORMAT_BACKDROP':
        result = formatDraftBackdrop(payload.text || '', payload.maxChars || 200);
        break;

      case 'PING':
        result = { pong: true, timestamp: Date.now() };
        break;

      default:
        throw new Error(`Unknown worker task type: ${type}`);
    }

    self.postMessage({ id, success: true, result });
  } catch (err) {
    self.postMessage({ id, success: false, error: err.message || String(err) });
  }
};

/**
 * Fast word counting algorithm
 */
function fastCountWords(str) {
  if (!str || typeof str !== 'string') return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  // Match non-whitespace character sequences
  const matches = trimmed.match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Heuristic syllable counter for English text (Flesch metrics)
 */
function countSyllablesInWord(word) {
  if (!word) return 0;
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;

  // Handle special endings
  w = w.replace(/(?:[^laeiouy]|ed|es|e)$/, '');
  w = w.replace(/^y/, '');

  // Count vowel groups
  const syllables = w.match(/[aeiouy]{1,2}/g);
  return syllables ? Math.max(1, syllables.length) : 1;
}

function countTotalSyllables(text) {
  if (!text) return 0;
  const words = text.match(/[a-zA-Z]+/g) || [];
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    total += countSyllablesInWord(words[i]);
  }
  return total;
}

/**
 * Extract clean string from chunk object or string
 */
function getWorkerChunkText(chunk) {
  if (!chunk) return '';
  if (typeof chunk === 'string') return chunk;
  return typeof chunk.text === 'string' ? chunk.text : '';
}

/**
 * Comprehensive readability and linguistic metrics for raw text
 */
function analyzeRawText(fullText, title = 'Document') {
  const text = fullText || '';
  const trimmed = text.trim();

  const wordsArray = trimmed ? (trimmed.match(/\S+/g) || []) : [];
  const totalWords = wordsArray.length;
  const totalCharsWithSpaces = text.length;
  const totalCharsNoSpaces = text.replace(/\s/g, '').length;

  // Sentences: split on period, exclamation, question mark, or newlines
  const sentencesArray = trimmed ? trimmed.split(/[.!?]+(?:\s+|\n+|$)/).filter(s => s.trim().length > 0) : [];
  const totalSentences = Math.max(1, sentencesArray.length);

  // Paragraphs
  const paragraphsArray = trimmed ? trimmed.split(/\n+/).filter(p => p.trim().length > 0) : [];
  const totalParagraphs = Math.max(1, paragraphsArray.length);

  // Syllables
  const totalSyllables = totalWords > 0 ? countTotalSyllables(trimmed) : 0;

  // Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  let fleschReadingEase = 0;
  let fleschGradeLevel = 0;

  if (totalWords > 0 && totalSentences > 0) {
    const wordsPerSentence = totalWords / totalSentences;
    const syllablesPerWord = totalSyllables / totalWords;

    fleschReadingEase = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
    fleschReadingEase = Math.max(0, Math.min(100, Math.round(fleschReadingEase * 10) / 10));

    fleschGradeLevel = (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59;
    fleschGradeLevel = Math.max(0, Math.round(fleschGradeLevel * 10) / 10);
  }

  // Reading & Speaking Time
  const readingTimeMinutes = totalWords / 225; // 225 wpm average silent reading
  const speakingTimeMinutes = totalWords / 130; // 130 wpm average reading aloud

  // Unique words / Lexical Diversity
  const uniqueWordsSet = new Set();
  for (let i = 0; i < wordsArray.length; i++) {
    uniqueWordsSet.add(wordsArray[i].toLowerCase().replace(/[^a-z0-9]/g, ''));
  }
  uniqueWordsSet.delete('');
  const uniqueWordsCount = uniqueWordsSet.size;
  const lexicalDensity = totalWords > 0 ? Math.round((uniqueWordsCount / totalWords) * 100) : 0;

  // Qualitative Reading Ease descriptor
  let readingEaseLabel = 'Standard';
  let readingEaseColor = '#7ee896'; // Green
  if (fleschReadingEase >= 90) {
    readingEaseLabel = 'Very Easy (5th Grade)';
  } else if (fleschReadingEase >= 80) {
    readingEaseLabel = 'Easy (6th Grade)';
  } else if (fleschReadingEase >= 70) {
    readingEaseLabel = 'Fairly Easy (7th Grade)';
  } else if (fleschReadingEase >= 60) {
    readingEaseLabel = 'Standard / Plain English (8th-9th Grade)';
  } else if (fleschReadingEase >= 50) {
    readingEaseLabel = 'Fairly Difficult (High School)';
    readingEaseColor = '#e5a93b';
  } else if (fleschReadingEase >= 30) {
    readingEaseLabel = 'Difficult (College Level)';
    readingEaseColor = '#e5a93b';
  } else {
    readingEaseLabel = 'Very Complex (Academic / Specialized)';
    readingEaseColor = '#ff6b6b';
  }

  return {
    title,
    totalWords,
    totalCharsWithSpaces,
    totalCharsNoSpaces,
    totalSentences,
    totalParagraphs,
    totalSyllables,
    fleschReadingEase,
    readingEaseLabel,
    readingEaseColor,
    fleschGradeLevel,
    readingTimeMinutes: Math.ceil(readingTimeMinutes) || 1,
    readingTimeSeconds: Math.round(readingTimeMinutes * 60),
    speakingTimeMinutes: Math.ceil(speakingTimeMinutes) || 1,
    speakingTimeSeconds: Math.round(speakingTimeMinutes * 60),
    uniqueWordsCount,
    lexicalDensity,
    averageWordsPerSentence: totalSentences > 0 ? Math.round((totalWords / totalSentences) * 10) / 10 : 0,
    averageCharsPerWord: totalWords > 0 ? Math.round((totalCharsNoSpaces / totalWords) * 10) / 10 : 0
  };
}

/**
 * Deep analysis of an entire book/manuscript structure
 */
function analyzeManuscript(book, targetWordsPerPage = 300) {
  if (!book || !Array.isArray(book.pages)) {
    return analyzeRawText('', 'Empty Manuscript');
  }

  const pagesAnalysis = [];
  let combinedText = '';

  book.pages.forEach((page, idx) => {
    const pageChunks = Array.isArray(page.chunks) ? page.chunks : [];
    const pageText = pageChunks.map(c => getWorkerChunkText(c)).join('');
    const pageWords = fastCountWords(pageText);
    const pageChars = pageText.length;
    const target = page.targetWordCount || targetWordsPerPage;
    const progressPercent = Math.min(100, Math.round((pageWords / Math.max(1, target)) * 100));

    pagesAnalysis.push({
      pageId: page.id || `page_${idx}`,
      pageNumber: page.number || (idx + 1),
      description: page.description || '',
      words: pageWords,
      characters: pageChars,
      targetWords: target,
      progressPercent: progressPercent,
      locked: Boolean(page.locked)
    });

    combinedText += pageText + '\n\n';
  });

  const baseAnalysis = analyzeRawText(combinedText, book.title || 'Untitled Manuscript');

  return {
    ...baseAnalysis,
    totalPages: book.pages.length,
    pages: pagesAnalysis,
    averageWordsPerPage: book.pages.length > 0 ? Math.round(baseAnalysis.totalWords / book.pages.length) : 0
  };
}

/**
 * Fast non-blocking search across large manuscripts
 */
function searchManuscript(book, query, options = {}) {
  if (!book || !Array.isArray(book.pages) || !query || !query.trim()) {
    return { query: query || '', matches: [], totalMatches: 0, matchedPagesCount: 0 };
  }

  const q = query.trim();
  const caseSensitive = Boolean(options.caseSensitive);
  const regexMode = Boolean(options.regex);
  const matches = [];
  const matchedPagesSet = new Set();

  let searchRegex;
  try {
    if (regexMode) {
      searchRegex = new RegExp(q, caseSensitive ? 'g' : 'gi');
    } else {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchRegex = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }
  } catch (e) {
    // Fallback to literal search
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    searchRegex = new RegExp(escaped, 'gi');
  }

  book.pages.forEach((page, pIdx) => {
    const pageChunks = Array.isArray(page.chunks) ? page.chunks : [];
    const pageNum = page.number || (pIdx + 1);
    const pageDesc = page.description || '';

    pageChunks.forEach((chunk, cIdx) => {
      const chunkText = getWorkerChunkText(chunk);
      if (!chunkText) return;

      searchRegex.lastIndex = 0;
      let match;
      while ((match = searchRegex.exec(chunkText)) !== null) {
        matchedPagesSet.add(page.id || `p_${pIdx}`);

        // Generate context snippet around match
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;
        const snippetStart = Math.max(0, matchStart - 40);
        const snippetEnd = Math.min(chunkText.length, matchEnd + 40);

        let beforeSnippet = chunkText.substring(snippetStart, matchStart);
        let matchSnippet = chunkText.substring(matchStart, matchEnd);
        let afterSnippet = chunkText.substring(matchEnd, snippetEnd);

        if (snippetStart > 0) beforeSnippet = '...' + beforeSnippet;
        if (snippetEnd < chunkText.length) afterSnippet = afterSnippet + '...';

        matches.push({
          pageId: page.id,
          pageNumber: pageNum,
          pageDescription: pageDesc,
          chunkId: chunk.id || `chunk_${cIdx}`,
          chunkIndex: cIdx,
          matchText: match[0],
          beforeSnippet,
          matchSnippet,
          afterSnippet,
          fullSnippet: `${beforeSnippet}<mark>${matchSnippet}</mark>${afterSnippet}`
        });

        // Prevent infinite loops on zero-width regex matches
        if (match.index === searchRegex.lastIndex) {
          searchRegex.lastIndex++;
        }
      }
    });
  });

  return {
    query: q,
    matches,
    totalMatches: matches.length,
    matchedPagesCount: matchedPagesSet.size
  };
}

/**
 * Batch word counting for multiple pages
 */
function countWordsBatch(pages) {
  if (!Array.isArray(pages)) return { totalWords: 0, pageCounts: [] };
  let total = 0;
  const pageCounts = pages.map((page, idx) => {
    const chunks = Array.isArray(page.chunks) ? page.chunks : [];
    const text = chunks.map(c => getWorkerChunkText(c)).join('');
    const count = fastCountWords(text);
    total += count;
    return {
      pageId: page.id || `page_${idx}`,
      pageNumber: page.number || (idx + 1),
      wordCount: count
    };
  });
  return { totalWords: total, pageCounts };
}

/**
 * Fast export text compiler in worker
 */
function compileExportText(book, format = 'txt') {
  if (!book || !Array.isArray(book.pages)) return '';

  let output = '';
  if (format === 'md') {
    output = `# ${book.title || 'Untitled Manuscript'}\n\n`;
    book.pages.forEach(page => {
      const descSuffix = (page.description && page.description.trim()) ? ` (${page.description.trim()})` : '';
      output += `## Page ${page.number}${descSuffix}\n\n`;
      const chunks = Array.isArray(page.chunks) ? page.chunks : [];
      const pageText = chunks.map(c => getWorkerChunkText(c)).join('');
      output += pageText + '\n\n';
    });
  } else if (format === 'html') {
    output = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(book.title || 'Manuscript')}</title><style>body{font-family:'Courier Prime',monospace;max-width:800px;margin:40px auto;padding:20px;line-height:1.7;}h1{border-bottom:2px solid #333;padding-bottom:10px;}.page{margin-bottom:40px;border-top:1px dashed #ccc;padding-top:20px;}.page-hdr{font-size:12px;color:#777;text-transform:uppercase;margin-bottom:10px;}</style></head><body>`;
    output += `<h1>${escapeHtml(book.title || 'Untitled Manuscript')}</h1>`;
    book.pages.forEach(page => {
      const descSuffix = (page.description && page.description.trim()) ? ` (${escapeHtml(page.description.trim())})` : '';
      output += `<div class="page"><div class="page-hdr">Page ${page.number}${descSuffix}</div>`;
      const chunks = Array.isArray(page.chunks) ? page.chunks : [];
      const pageText = chunks.map(c => getWorkerChunkText(c)).join('');
      const paragraphs = pageText.split(/\n\n+/).filter(p => p.trim());
      paragraphs.forEach(p => {
        output += `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`;
      });
      output += `</div>`;
    });
    output += `</body></html>`;
  } else {
    // Plain text (.txt)
    output = `# ${book.title || 'Untitled Manuscript'}\n\n`;
    book.pages.forEach(page => {
      const descSuffix = (page.description && page.description.trim()) ? ` (${page.description.trim()})` : '';
      output += `--- PAGE ${page.number}${descSuffix.toUpperCase()} ---\n\n`;
      const chunks = Array.isArray(page.chunks) ? page.chunks : [];
      const pageText = chunks.map(c => getWorkerChunkText(c)).join('');
      output += pageText + '\n\n';
    });
  }

  return output;
}

/**
 * Format draft input backdrop with highlight markup
 */
function formatDraftBackdrop(rawVal, maxChars) {
  const len = rawVal.length;
  let htmlVal = '';
  if (len > maxChars) {
    let validPart = rawVal.substring(0, maxChars);
    let overPart = rawVal.substring(maxChars);
    validPart = escapeHtml(validPart);
    overPart = escapeHtml(overPart);
    htmlVal = validPart + '<span class="over-limit">' + overPart + '</span>';
  } else {
    htmlVal = escapeHtml(rawVal);
  }
  if (rawVal.endsWith('\n')) {
    htmlVal += '\n&#8203;';
  }
  return htmlVal;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
