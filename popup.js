/**
 * TOC Anchor Checker - Popup Script
 */

const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found in DOM`);
  return el;
};

// Default selectors list
const DEFAULT_SELECTORS = [
  '.ez-toc-container',
  '.rank-math-toc',
  '.lwptoc',
  '.table-of-contents',
  '.toc',
  '.listmenu'
].join('\n');

document.addEventListener('DOMContentLoaded', async () => {
  const scanBtn = $('scanBtn');
  const showBrokenOnlyToggle = $('showBrokenOnly');
  const autoDetectToggle = $('autoDetectToc');
  const tocSelectorsTextarea = $('tocSelectors');
  const resultsList = $('resultsList');
  const summaryArea = $('summary');
  const postScanActions = $('postScanActions');
  const copyBtn = $('copyReportBtn');
  const statusMsg = $('statusMsg');
  const h2SepCount = $('h2SepCount');
  const misplacedCount = $('misplacedCount');

  let lastResults = [];

  // Load saved settings
  const settings = await chrome.storage.local.get(['selectors', 'autoDetect', 'showBroken']);
  tocSelectorsTextarea.value = settings.selectors || DEFAULT_SELECTORS;
  autoDetectToggle.checked = settings.autoDetect !== false;
  showBrokenOnlyToggle.checked = settings.showBroken || false;

  // Save settings on change
  const saveSettings = () => {
    chrome.storage.local.set({
      selectors: tocSelectorsTextarea.value,
      autoDetect: autoDetectToggle.checked,
      showBroken: showBrokenOnlyToggle.checked
    });
  };

  [tocSelectorsTextarea, autoDetectToggle, showBrokenOnlyToggle].forEach(el => {
    el.addEventListener('change', () => {
      saveSettings();
      if (lastResults.length > 0) renderResults(lastResults);
    });
  });

  scanBtn.addEventListener('click', async () => {
    statusMsg.textContent = 'Scanning...';
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      statusMsg.textContent = 'Error: No active tab';
      return;
    }

    const selectors = tocSelectorsTextarea.value.split('\n').map(s => s.trim()).filter(s => s);

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runScanner,
        args: [selectors, autoDetectToggle.checked]
      });

      lastResults = results[0].result;
      renderResults(lastResults);
      statusMsg.textContent = 'Scan complete';
    } catch (err) {
      console.error(err);
      statusMsg.textContent = 'Error: ' + err.message;
    }
  });

  function renderResults(results) {
    resultsList.innerHTML = '';
    const showBrokenOnly = showBrokenOnlyToggle.checked;

    const tocResults = results.tocResults || [];
    const h2Results = results.h2Results || [];

    const total = tocResults.length;
    const okCount = tocResults.filter(r => r.ok).length;
    const brokenCount = total - okCount;

    const h2Total = h2Results.length;
    const h2Ok = h2Results.filter(r => r.ok).length;
    const misplacedResults = results.misplacedResults || [];
    const usedSelector = tocResults.length > 0 ? tocResults[0].usedSelector : 'None';

    $('totalCount').textContent = total;
    $('okCount').textContent = okCount;
    $('brokenCount').textContent = brokenCount;
    h2SepCount.textContent = h2Ok;
    $('h2TotalCount').textContent = h2Total;
    misplacedCount.textContent = misplacedResults.length;
    $('usedSelector').textContent = usedSelector;

    summaryArea.style.display = 'flex';
    postScanActions.style.display = 'flex';

    // Render TOC Section
    if (tocResults.length > 0) {
      const tocHeader = document.createElement('li');
      tocHeader.className = 'section-header';
      tocHeader.innerHTML = `<strong>TOC Anchor Links</strong> (${okCount}/${total})`;
      resultsList.appendChild(tocHeader);

      tocResults.forEach(item => {
        if (showBrokenOnly && item.ok) return;
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render H2 Section
    if (h2Results.length > 0) {
      const h2Header = document.createElement('li');
      h2Header.className = 'section-header';
      h2Header.style.marginTop = '15px';
      h2Header.innerHTML = `<strong>H2 Separators</strong> (${h2Ok}/${h2Total})`;
      resultsList.appendChild(h2Header);

      h2Results.forEach(item => {
        if (showBrokenOnly && item.ok) return;
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Misplaced Section
    if (misplacedResults.length > 0) {
      const mHeader = document.createElement('li');
      mHeader.className = 'section-header';
      mHeader.style.marginTop = '15px';
      mHeader.style.color = '#9a3412';
      mHeader.innerHTML = `<strong>Misplaced Separators</strong> (${misplacedResults.length})`;
      resultsList.appendChild(mHeader);

      misplacedResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    if (resultsList.children.length === 0) {
      resultsList.innerHTML = '<li class="result-item" style="justify-content:center; color:gray;">All issues resolved or no items found</li>';
    }
  }

  function createResultItem(item) {
    const li = document.createElement('li');
    li.className = 'result-item';
    let statusText = item.ok ? 'ปกติ' : (item.type === 'toc' ? 'ลิงก์เสีย' : 'ลืมใส่เส้นคั่น');
    if (item.type === 'misplaced-separator') statusText = 'ตำแหน่งผิด';

    let label = 'หัวข้อ';
    if (item.type === 'toc') label = 'ลิงก์';
    if (item.type === 'misplaced-separator') label = 'เส้นคั่น';

    li.innerHTML = `
      <div class="status-indicator ${item.ok ? 'status-ok' : 'status-broken'}"></div>
      <div class="link-content">
        <span class="link-text">${cleanText(item.text)}</span>
        <span class="link-href">${label}: ${item.type === 'toc' ? '#' + item.id : (item.type === 'misplaced-separator' ? 'จุดที่ผิด' : 'H2')} | ${statusText}</span>
      </div>
    `;

    li.onclick = () => {
      chrome.scripting.executeScript({
        target: { tabId: getTabId() },
        func: highlightElement,
        args: [item.id]
      });
    };
    return li;
  }

  async function getTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab.id;
  }

  function cleanText(text) {
    return text.trim().replace(/\s+/g, ' ') || '(Empty Link)';
  }

  copyBtn.addEventListener('click', () => {
    const total = $('totalCount').textContent;
    const broken = $('brokenCount').textContent;
    const h2Sep = $('h2SepCount').textContent;
    const h2Total = $('h2TotalCount').textContent;
    const misplaced = $('misplacedCount').textContent;
    const selector = $('usedSelector').textContent;

    let report = `TOC Anchor & H2 Separator Report\n`;
    report += `-----------------------------------\n`;
    report += `TOC Status: ${broken === '0' ? '✅ All Clear' : '❌ Issues Found'}\n`;
    report += `TOC Links: ${total}, Broken: ${broken}\n`;
    report += `H2 Separators: ${h2Sep}/${h2Total}\n`;
    report += `Misplaced Separators: ${misplaced}\n`;
    report += `Selector: ${selector}\n\n`;

    if (lastResults.tocResults) {
      report += `[ TOC LINKS ]\n`;
      lastResults.tocResults.forEach(r => {
        report += `[${r.ok ? 'OK' : 'FAIL'}] "${r.text.trim()}" -> #${r.id}\n`;
      });
      report += `\n`;
    }

    if (lastResults.h2Results) {
      report += `[ H2 SEPARATORS ]\n`;
      lastResults.h2Results.forEach(r => {
        report += `[${r.ok ? 'OK' : 'MISSING'}] "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.misplacedResults && lastResults.misplacedResults.length > 0) {
      report += `[ MISPLACED SEPARATORS ]\n`;
      lastResults.misplacedResults.forEach(r => {
        report += `[WRONG] "${r.text.trim()}"\n`;
      });
    }

    navigator.clipboard.writeText(report).then(() => {
      statusMsg.textContent = 'Report copied!';
      setTimeout(() => { statusMsg.textContent = ''; }, 2000);
    });
  });
});

/**
 * This function runs inside the webpage context
 */
function runScanner(selectors, autoDetect) {
  let container = null;
  let usedSelector = 'document fallback';

  if (autoDetect) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        container = el;
        usedSelector = sel;
        break;
      }
    }
  }

  // 1. TOC LINK SCANNING
  const root = container || document;
  const links = Array.from(root.querySelectorAll('a[href^="#"]'));

  const tocResults = links.map(link => {
    const href = link.getAttribute('href');
    const text = link.innerText || link.textContent || '';

    if (!href || href.length <= 1) return null;

    let id = href.substring(1);
    try {
      id = decodeURIComponent(id);
    } catch (e) {
      console.warn('Could not decode href:', id);
    }

    if (!container) {
      if (link.closest('header') || link.closest('nav') || link.closest('.menu')) {
        return null;
      }
    }

    const target = document.getElementById(id);
    return {
      type: 'toc',
      href,
      id,
      ok: !!target,
      text: text.substring(0, 100).trim(),
      usedSelector
    };
  }).filter(r => r !== null);

  // 2. H2 SEPARATOR SCANNING
  const tocTexts = ['table of contents', 'สารบัญ', 'content', 'สารบัญเนื้อหา', 'หัวข้อที่น่าสนใจ', 'คลิกที่หัวข้อ'];
  const footerKeywords = ['อ้างอิง', 'reference', '参考', 'related article', 'บทความที่เกี่ยวข้อง', 'แนะนำ', 'recommended'];
  const allH2 = Array.from(document.querySelectorAll('h2'));
  const h2Results = [];

  // Find the first footer-like heading to mark the end of main article content
  function findArticleFooterIndex() {
    for (let i = 0; i < allH2.length; i++) {
      const h2 = allH2[i];
      const text = (h2.innerText || h2.textContent || '').trim().toLowerCase();

      // Check if this H2 contains footer keywords
      if (footerKeywords.some(keyword => text.includes(keyword))) {
        return i;
      }

      // Check if H2 is inside a footer-like container
      let parent = h2.parentElement;
      while (parent && parent !== document.body) {
        const className = parent.className ? parent.className.toLowerCase() : '';
        const idName = parent.id ? parent.id.toLowerCase() : '';

        if (className.includes('footer') ||
          className.includes('reference') ||
          className.includes('related') ||
          className.includes('recommend') ||
          idName.includes('footer') ||
          idName.includes('reference') ||
          idName.includes('related')) {
          return i;
        }
        parent = parent.parentElement;
      }
    }
    return -1; // No footer found
  }

  const footerStartIndex = findArticleFooterIndex();

  function hasSeparatorAbove(el) {
    let current = el;

    // Check up to 2 levels of parents if the heading is the first child
    for (let level = 0; level < 2; level++) {
      let extra = current.previousElementSibling;
      while (extra) {
        // Skip small elements like anchors or empty spacing
        if (extra.tagName === 'HR' || Array.from(extra.classList).some(c =>
          c.toLowerCase().includes('separator') ||
          c.toLowerCase().includes('divider') ||
          c.toLowerCase().includes('line')
        )) return true;

        if (/^H[1-6]$/.test(extra.tagName)) return false;

        // If it's a significant block element that isn't a separator, stop
        if (['P', 'DIV', 'SECTION', 'UL', 'OL', 'TABLE'].includes(extra.tagName) &&
          !Array.from(extra.classList).some(c => c.toLowerCase().includes('target') || c.toLowerCase().includes('anchor'))) {
          // But wait, some themes have separators with text. Let's be less strict.
          // For now, let's just check the immediate few siblings.
          break;
        }

        extra = extra.previousElementSibling;
      }

      if (current.parentElement && current.parentElement.firstElementChild === current) {
        current = current.parentElement;
      } else {
        break;
      }
    }

    // Fallback: simple check 3 siblings up
    let sib = el.previousElementSibling;
    for (let i = 0; i < 3; i++) {
      if (!sib) break;
      if (sib.tagName === 'HR' || Array.from(sib.classList).some(c => c.toLowerCase().includes('separator'))) return true;
      sib = sib.previousElementSibling;
    }

    return false;
  }

  let h2CheckIndex = 0;
  allH2.forEach((h2, index) => {
    const text = (h2.innerText || h2.textContent || '').trim().toLowerCase();

    if (tocTexts.some(t => text.includes(t))) return;
    if (container && container.contains(h2)) return;

    // Skip the very first H2 content heading
    h2CheckIndex++;
    if (h2CheckIndex === 1) return;

    // Skip H2 headings that are after the article footer
    if (footerStartIndex !== -1 && index >= footerStartIndex) return;

    if (!h2.id) {
      h2.id = 'toc-checker-h2-' + index;
    }

    h2Results.push({
      type: 'h2-separator',
      id: h2.id,
      ok: hasSeparatorAbove(h2),
      text: (h2.innerText || h2.textContent || '').substring(0, 100).trim(),
      usedSelector: 'H2 Check'
    });
  });

  // 3. MISPLACED SEPARATOR SCANNING
  const misplacedResults = [];
  const separators = Array.from(document.querySelectorAll('hr, div, span')).filter(el => {
    if (el.tagName === 'HR') return true;
    const className = el.className ? String(el.className).toLowerCase() : '';
    return className.includes('separator') || className.includes('divider') || className.includes('line');
  });

  separators.forEach((sep, index) => {
    // Skip if inside footer or TOC
    if (footerStartIndex !== -1) {
      const allH2 = Array.from(document.querySelectorAll('h2'));
      const footerH2 = allH2[footerStartIndex];
      if (footerH2 && (sep.compareDocumentPosition(footerH2) & Node.DOCUMENT_POSITION_PRECEDING)) {
        return; // Separator is after footer
      }
    }
    if (container && container.contains(sep)) return;

    // Check what's below it
    let next = sep.nextElementSibling;
    while (next && (
      next.tagName === 'A' ||
      next.style.display === 'none' ||
      (next.className && typeof next.className === 'string' && (next.className.toLowerCase().includes('target') || next.className.toLowerCase().includes('anchor')))
    )) {
      next = next.nextElementSibling;
    }

    // Check if the next thing is a Heading but NOT H2
    const otherHeadings = ['H1', 'H3', 'H4', 'H5', 'H6'];
    if (next && otherHeadings.includes(next.tagName)) {
      // Create an ID for highlighting if not exists
      if (!sep.id) sep.id = 'toc-checker-sep-' + index;

      let contextText = (next.innerText || next.textContent || '').trim().substring(0, 50);
      contextText = `หัวข้อ ${next.tagName}: "${contextText}..."`;

      misplacedResults.push({
        type: 'misplaced-separator',
        id: sep.id,
        ok: false,
        text: `พบเส้นคั่นวางผิดที่อยู่เหนือ ${contextText} (ต้องอยู่เหนือ H2 เท่านั้น)`,
        usedSelector: 'Pos Check'
      });
    }
  });

  return {
    tocResults,
    h2Results,
    misplacedResults
  };
}

/**
 * Highlight logic injected into page
 */
function highlightElement(id) {
  const el = document.getElementById(id);
  if (!el) return;

  // Add styles if not present
  const styleId = 'toc-checker-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes toc-pulse {
        0% { outline: 4px solid rgba(99, 102, 241, 0.8); outline-offset: 4px; }
        100% { outline: 4px solid rgba(99, 102, 241, 0); outline-offset: 10px; }
      }
      .toc-highlight {
        animation: toc-pulse 0.8s ease-in-out 2;
        transition: all 0.3s;
      }
    `;
    document.head.appendChild(style);
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('toc-highlight');

  setTimeout(() => {
    el.classList.remove('toc-highlight');
  }, 1600);
}
