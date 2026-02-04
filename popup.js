/**
 * VSQ CHECKER - Side Panel Script
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
  const refCount = $('refCount');
  const colCount = $('colCount');
  const altCount = $('altCount');
  const listCount = $('listCount');
  const splitPCount = $('splitPCount');
  const typoCount = $('typoCount');

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
    try {
      // Correctly query the active tab in the main window from the side panel
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

      if (!tab || !tab.id) {
        statusMsg.textContent = 'Error: Cannot find active tab';
        return;
      }

      const selectors = tocSelectorsTextarea.value.split('\n').map(s => s.trim()).filter(s => s);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runScanner,
        args: [selectors, autoDetectToggle.checked]
      });

      if (results && results[0]) {
        lastResults = results[0].result;
        renderResults(lastResults);
        statusMsg.textContent = 'Scan complete';
      } else {
        statusMsg.textContent = 'Error: No results returned';
      }
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
    const misplacedResults = results.misplacedResults || [];
    const refResults = results.refResults || [];
    const colResults = results.colResults || [];
    const altResults = results.altResults || [];
    const listResults = results.listResults || [];
    const splitPResults = results.splitPResults || [];
    const typoResults = results.typoResults || [];

    const total = tocResults.length;
    const okCount = tocResults.filter(r => r.ok).length;
    const brokenCount = total - okCount;

    const h2Total = h2Results.length;
    const h2Ok = h2Results.filter(r => r.ok).length;
    const usedSelector = results.usedSelector || 'None';

    $('totalCount').textContent = total;
    $('okCount').textContent = okCount;
    $('brokenCount').textContent = brokenCount;
    h2SepCount.textContent = h2Ok;
    $('h2TotalCount').textContent = h2Total;
    misplacedCount.textContent = misplacedResults.length;
    refCount.textContent = refResults.filter(r => !r.ok).length;
    colCount.textContent = colResults.filter(r => !r.ok).length;
    altCount.textContent = altResults.length;
    listCount.textContent = listResults.length;
    splitPCount.textContent = splitPResults.length;
    typoCount.textContent = typoResults.length;
    $('usedSelector').textContent = usedSelector;

    summaryArea.style.display = 'flex';
    postScanActions.style.display = 'flex';

    // Render Section: TOC Link Results
    if (tocResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.innerHTML = `<strong>TOC Anchor Links</strong> (${okCount}/${total})`;
      resultsList.appendChild(section);

      tocResults.forEach(item => {
        if (showBrokenOnly && item.ok) return;
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: H2 Separators
    if (h2Results.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.innerHTML = `<strong>H2 Separators</strong> (${h2Ok}/${h2Total})`;
      resultsList.appendChild(section);

      h2Results.forEach(item => {
        if (showBrokenOnly && item.ok) return;
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Misplaced Separators
    if (misplacedResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#9a3412';
      section.innerHTML = `<strong>Misplaced Separators</strong> (${misplacedResults.length})`;
      resultsList.appendChild(section);

      misplacedResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Missing Classes
    const classIssues = [...refResults, ...colResults].filter(r => !r.ok);
    if (classIssues.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#7e22ce';
      section.innerHTML = `<strong>Missing Classes</strong> (${classIssues.length})`;
      resultsList.appendChild(section);

      classIssues.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Alt Word Found
    if (altResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#e11d48';
      section.innerHTML = `<strong>Alt Word Found</strong> (${altResults.length})`;
      resultsList.appendChild(section);

      altResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Consecutive Lists
    if (listResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#0891b2';
      section.innerHTML = `<strong>Consecutive Lists</strong> (${listResults.length})`;
      resultsList.appendChild(section);

      listResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Split Paragraphs
    if (splitPResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#c2410c';
      section.innerHTML = `<strong>Split Paragraphs</strong> (${splitPResults.length})`;
      resultsList.appendChild(section);

      splitPResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Class Typos
    if (typoResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#854d0e';
      section.innerHTML = `<strong>Class Typos</strong> (${typoResults.length})`;
      resultsList.appendChild(section);

      typoResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    if (resultsList.children.length === 0) {
      resultsList.innerHTML = '<li class="result-item" style="justify-content:center; color:gray;">No issues found</li>';
    }
  }

  function createResultItem(item) {
    const li = document.createElement('li');
    li.className = 'result-item';

    let statusText = item.ok ? 'ปกติ' : (item.errorMessage || (item.type === 'toc' ? 'ลิงก์เสีย' : 'ลืมใส่เส้นคั่น'));
    if (!item.errorMessage) {
      if (item.type === 'misplaced-separator') statusText = 'ตำแหน่งผิด';
      if (item.type === 'class-check') statusText = 'ลืมใส่ class';
      if (item.type === 'alt-word') statusText = 'ตรวจพบคำว่า Alt :';
      if (item.type === 'consecutive-list') statusText = 'รายการแยกย่อหน้า (ควรรวมกลุ่มให้เป็น List เดียวกัน)';
      if (item.type === 'split-p') statusText = 'อาจเป็นประโยคเดียวกันที่ถูกแยกย่อหน้า';
      if (item.type === 'class-typo') statusText = 'พิมพ์ชื่อ class ผิด';
    }

    let label = 'จุดที่เช็ค';
    if (item.type === 'toc') label = 'ลิงก์';
    if (item.type === 'h2-separator') label = 'หัวข้อ H2';
    if (item.type === 'misplaced-separator') label = 'เส้นคั่น';
    if (item.type === 'class-check') label = 'ตรวจสอบ Class';
    if (item.type === 'alt-word') label = 'ตรวจพบคำผิด';
    if (item.type === 'consecutive-list') label = 'รายการแยกกัน';
    if (item.type === 'split-p') label = 'ย่อหน้าแยก';
    if (item.type === 'class-typo') label = 'ชื่อคลาสผิด';

    li.innerHTML = `
      <div class="status-indicator ${item.ok ? 'status-ok' : 'status-broken'}"></div>
      <div class="link-content">
        <span class="link-text" title="${cleanText(item.text)}">${cleanText(item.text)}</span>
        <span class="link-href">${label} | ${statusText}</span>
      </div>
      <button class="goto-btn" title="เลื่อนไปดูจุดนี้">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h6v6M10 14L21 3M21 21H3V3h7" />
        </svg>
        ไปที่จุดนี้
      </button>
    `;

    const btn = li.querySelector('.goto-btn');
    btn.onclick = async (e) => {
      e.stopPropagation();
      // Side Panel specific: Find the tab in the last focused window
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab && tab.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: highlightElement,
          args: [item.id]
        });
      } else {
        // Fallback for some window configurations
        const [fallbackTab] = await chrome.tabs.query({ active: true, currentWindow: false });
        if (fallbackTab && fallbackTab.id) {
          chrome.scripting.executeScript({
            target: { tabId: fallbackTab.id },
            func: highlightElement,
            args: [item.id] // Corrected: use item.id, not tab id
          });
        }
      }
    };
    return li;
  }

  function cleanText(text) {
    return text.trim().replace(/\s+/g, ' ') || '(Empty Text)';
  }

  copyBtn.addEventListener('click', () => {
    const total = $('totalCount').textContent;
    const broken = $('brokenCount').textContent;
    const h2Sep = $('h2SepCount').textContent;
    const h2Total = $('h2TotalCount').textContent;
    const misplaced = $('misplacedCount').textContent;
    const selector = $('usedSelector').textContent;

    let report = `TOC & SEO Report\n`;
    report += `-----------------------------------\n`;
    report += `TOC Status: ${broken === '0' ? '✅ Pass' : '❌ Issues'}\n`;
    report += `TOC Links: ${total}, Broken: ${broken}\n`;
    report += `H2 Separators: ${h2Sep}/${h2Total}\n`;
    report += `Misplaced: ${misplaced}\n`;
    report += `Using: ${selector}\n\n`;

    // Compact summary details
    if (lastResults.tocResults) {
      report += `[ TOC LINKS ]\n`;
      lastResults.tocResults.filter(r => !r.ok).forEach(r => {
        report += `[FAIL] "${r.text.trim()}" -> #${r.id}\n`;
      });
      report += `\n`;
    }

    if (lastResults.h2Results) {
      report += `[ H2 SEPARATORS ]\n`;
      lastResults.h2Results.filter(r => !r.ok).forEach(r => {
        report += `[MISSING] "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    const classResults = [...(lastResults.refResults || []), ...(lastResults.colResults || [])].filter(r => !r.ok);
    if (classResults.length > 0) {
      report += `[ MISSING CLASSES ]\n`;
      classResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} ใน "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.altResults && lastResults.altResults.length > 0) {
      report += `[ ALT WORD ]\n`;
      lastResults.altResults.forEach(r => {
        report += `[FAIL] "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.listResults && lastResults.listResults.length > 0) {
      report += `[ CONSECUTIVE LISTS ]\n`;
      lastResults.listResults.forEach(r => {
        report += `[FAIL] ${r.text.trim()}\n`;
      });
      report += `\n`;
    }

    if (lastResults.splitPResults && lastResults.splitPResults.length > 0) {
      report += `[ SPLIT P ]\n`;
      lastResults.splitPResults.forEach(r => {
        report += `[WARN] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.typoResults && lastResults.typoResults.length > 0) {
      report += `[ CLASS TYPOS ]\n`;
      lastResults.typoResults.forEach(r => {
        report += `[FAIL] ${r.text} ${r.errorMessage}\n`;
      });
    }

    navigator.clipboard.writeText(report).then(() => {
      statusMsg.textContent = 'Report copied!';
      setTimeout(() => { statusMsg.textContent = ''; }, 2000);
    });
  });
});

/**
 * CORE SCANNER LOGIC (Runs in Page Context)
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

  // Helper Index for Article Footer
  const allH2 = Array.from(document.querySelectorAll('h2'));
  const footerKeywords = ['อ้างอิง', 'reference', '参考', 'related article', 'บทความที่เกี่ยวข้อง', 'แนะนำ', 'recommended'];

  function findArticleFooterIndex() {
    for (let i = 0; i < allH2.length; i++) {
      const h2 = allH2[i];
      const text = (h2.innerText || h2.textContent || '').trim().toLowerCase();
      if (footerKeywords.some(keyword => text.includes(keyword))) return i;

      let parent = h2.parentElement;
      while (parent && parent !== document.body) {
        const cn = parent.className ? String(parent.className).toLowerCase() : '';
        const id = parent.id ? String(parent.id).toLowerCase() : '';
        if (cn.includes('footer') || cn.includes('related') || id.includes('footer')) return i;
        parent = parent.parentElement;
      }
    }
    return -1;
  }

  const footerIndex = findArticleFooterIndex();
  const footerH2 = footerIndex !== -1 ? allH2[footerIndex] : null;
  const firstH1 = document.querySelector('h1');

  function isExcluded(el) {
    if (!el) return true;
    if (firstH1 && (el.compareDocumentPosition(firstH1) & Node.DOCUMENT_POSITION_FOLLOWING)) return true;
    if (el.closest('#wpadminbar') || el.closest('.toc-checker-style')) return true;
    if (el.closest('header, nav, footer, aside, .header, .footer, .menu, .widget-area')) return true;
    if (el.closest('.chat-now-footer, .box-widget, .pdpa-hide, .vsq-blogs-related-article, .vsq-blog-article-title')) return true;
    if (el.closest('.dpsp-content-wrapper, .dpsp-networks-btns-wrapper')) return true;
    if (footerH2 && (el === footerH2 || (footerH2.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))) return true;
    return false;
  }

  function hasSeparatorAbove(el) {
    let current = el;
    for (let level = 0; level < 2; level++) {
      let sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName === 'HR' || Array.from(sib.classList).some(c => /separator|divider|line/i.test(c))) return true;
        if (/^H[1-6]$/.test(sib.tagName)) return false;
        if (['P', 'DIV', 'UL', 'TABLE'].includes(sib.tagName) && !/target|anchor/i.test(sib.className)) break;
        sib = sib.previousElementSibling;
      }
      if (current.parentElement && current.parentElement.firstElementChild === current) current = current.parentElement;
      else break;
    }
    return false;
  }

  // 1. TOC SCAN
  const root = container || document;
  const links = Array.from(root.querySelectorAll('a[href^="#"]'));
  const tocResults = links.map(link => {
    const href = link.getAttribute('href');
    if (!href || href.length <= 1) return null;
    let id = href.substring(1);
    try { id = decodeURIComponent(id); } catch (e) { }
    if (!container && link.closest('header, nav, .menu')) return null;
    const target = document.getElementById(id);
    return { type: 'toc', id, ok: !!target, text: link.innerText.trim().substring(0, 100) };
  }).filter(r => r);

  // 2. H2 SEPARATOR SCAN
  const tocKW = ['สารบัญ', 'table of content', 'content', '目录'];
  const h2Results = [];
  let h2Count = 0;
  allH2.forEach((h2, idx) => {
    const text = h2.innerText.toLowerCase();
    if (tocKW.some(t => text.includes(t)) || (container && container.contains(h2))) return;
    h2Count++;
    if (h2Count === 1) return; // Skip first
    if (footerIndex !== -1 && idx >= footerIndex) return;
    if (!h2.id) h2.id = 'toc-h2-' + idx;
    h2Results.push({ type: 'h2-separator', id: h2.id, ok: hasSeparatorAbove(h2), text: h2.innerText.trim() });
  });

  // 3. MISPLACED SEP
  const misplacedResults = [];
  Array.from(document.querySelectorAll('hr, div, span')).filter(el => {
    if (el.tagName === 'HR') return true;
    return /separator|divider|line/i.test(el.className);
  }).forEach((sep, idx) => {
    if (isExcluded(sep) || (container && container.contains(sep))) return;
    let next = sep.nextElementSibling;
    while (next && (next.tagName === 'A' || next.style.display === 'none' || /target|anchor/i.test(next.className))) next = next.nextElementSibling;
    if (next && /^H[13456]$/.test(next.tagName)) {
      // Whitelist: Allow separator above summary headings even if they are H3/H4 etc.
      const hText = next.innerText.toLowerCase();
      if (hText.includes('สรุป') || hText.includes('conclusion')) return;

      if (!sep.id) sep.id = 'toc-sep-' + idx;
      misplacedResults.push({ type: 'misplaced-separator', id: sep.id, ok: false, text: `หัวข้อ ${next.tagName}: "${next.innerText.substring(0, 20)}..."` });
    }
  });

  // 4. CLASS CHECK (TOC subtext-gtb, listmenu, references)
  const refResults = [];
  const colResults = [];
  const detectedTocLists = new Set();

  Array.from(document.querySelectorAll('p, h1, h2, h3, h4, h5, h6')).forEach((el, idx) => {
    const text = el.innerText.trim();
    if (text.length < 2 || text.length > 200) return;
    if (isExcluded(el)) return;

    if (tocKW.some(kw => text.toLowerCase().includes(kw))) {
      if (!el.id) el.id = 'toc-head-' + idx;
      if (!el.classList.contains('subtext-gtb')) colResults.push({ type: 'class-check', id: el.id, ok: false, text: `หัวข้อ: "${text.substring(0, 30)}"`, errorMessage: 'ลืมใส่ class: subtext-gtb' });

      let next = el.nextElementSibling;
      while (next && (next.tagName === 'A' || next.tagName === 'SPAN' || /target/i.test(next.className))) next = next.nextElementSibling;
      if (next && (next.tagName === 'UL' || next.tagName === 'OL')) {
        detectedTocLists.add(next);
        if (!next.id) next.id = 'toc-list-' + idx;
        const missing = [];
        if (!next.classList.contains('listmenu')) missing.push('listmenu');
        if (!next.classList.contains('two-column')) missing.push('two-column');
        if (missing.length) colResults.push({ type: 'class-check', id: next.id, ok: false, text: `รายการสารบัญ`, errorMessage: `ลืมใส่ class: ${missing.join(' ')}` });
      }
    }

    if (text.includes('อ้างอิง') || /reference|参考/i.test(text)) {
      if (isExcluded(el)) return;
      if (!el.id) el.id = 'ref-head-' + idx;
      if (!el.classList.contains('references')) refResults.push({ type: 'class-check', id: el.id, ok: false, text: `หัวข้ออ้างอิง`, errorMessage: 'ลืมใส่ class: references' });

      let next = el.nextElementSibling;
      while (next && (next.tagName === 'A' || next.tagName === 'SPAN' || next.tagName === 'HR' || /target/i.test(next.className))) next = next.nextElementSibling;
      if (next && (next.tagName === 'UL' || next.tagName === 'OL')) {
        if (!next.id) next.id = 'ref-list-' + idx;
        if (!next.classList.contains('references')) refResults.push({ type: 'class-check', id: next.id, ok: false, text: `รายการอ้างอิง`, errorMessage: 'ลืมใส่ class: references (ที่ List)' });
      }
    }
  });

  // 5. ALT WORD
  const altResults = [];
  const altSelectors = 'p, h1, h2, h3, h4, h5, h6, li, td, figcaption, .wp-caption-text, .wp-element-caption';
  const altElements = Array.from(new Set(document.querySelectorAll(altSelectors)));
  altElements.forEach((el, idx) => {
    if (isExcluded(el)) return;
    const text = (el.innerText || el.textContent || '').trim();
    // Improved regex: Case-insensitive, handles various colons, and robust word boundaries
    if (/(?:^|[^a-zA-Z0-9])alt\s*[:：]/i.test(text)) {
      if (!el.id) el.id = 'alt-' + idx;
      altResults.push({ type: 'alt-word', id: el.id, ok: false, text: text.substring(0, 100) });
    }
  });

  // 6. CONSECUTIVE LISTS
  const listResults = [];
  const allLists = Array.from(document.querySelectorAll('ul, ol'));
  allLists.forEach((list, idx) => {
    if (isExcluded(list)) return;
    let next = list.nextElementSibling;
    // Skip invisible/anchor elements
    while (next && (next.tagName === 'A' || next.tagName === 'SPAN' || (next.style && next.style.display === 'none') || /target|anchor/i.test(next.className))) {
      next = next.nextElementSibling;
    }

    if (next && (next.tagName === 'UL' || next.tagName === 'OL')) {
      if (!next.id) next.id = 'list-gap-' + idx;
      listResults.push({
        type: 'consecutive-list',
        id: next.id,
        ok: false,
        text: `${next.tagName === 'UL' ? 'Unordered' : 'Ordered'} List ต่อกัน: "${next.innerText.substring(0, 40).trim()}..."`
      });
    }
  });

  // 7. SPLIT PARAGRAPH
  const splitPResults = [];
  const thaiConjs = ['และ', 'หรือ', 'ซึ่ง', 'ที่', 'แต่', 'รวมถึง', 'เพราะฉะนั้น', 'เช่น', 'โดย', 'ว่า'];
  const pList = Array.from(document.querySelectorAll('p'));
  pList.forEach((p, idx) => {
    if (isExcluded(p)) return;
    const nextP = p.nextElementSibling;
    if (!nextP || nextP.tagName !== 'P') return;
    const cur = p.innerText.trim();
    const nxt = nextP.innerText.trim();
    if (!cur || !nxt) return;
    let suspect = false; let msg = '';
    if (/^[a-z]/.test(nxt)) { suspect = true; msg = 'ขึ้นต้นด้วยตัวพิมพ์เล็ก'; }
    else if (thaiConjs.some(c => nxt.startsWith(c))) { suspect = true; msg = `ขึ้นต้นด้วยคำเชื่อม "${thaiConjs.find(c => nxt.startsWith(c))}"`; }
    else if (p.innerText.length < 50 && nextP.innerText.length < 50 && !/[\.\!\?]$/.test(cur) && !/^[\d\-\*\•]/.test(cur)) { suspect = true; msg = 'ย่อหน้าสั้นเกินไป/ไม่จบประโยค'; }

    if (suspect) {
      if (!nextP.id) nextP.id = 'split-' + idx;
      splitPResults.push({ type: 'split-p', id: nextP.id, ok: false, text: nxt.substring(0, 70), errorMessage: msg });
    }
  });

  // 8. CLASS TYPO CHECK
  const typoResults = [];
  const typoMap = {
    'captiom-img': 'caption-img',
    'caption-image': 'caption-img',
    'captions-img': 'caption-img',
    'list-menu': 'listmenu',
    'two-columns': 'two-column',
    '2-column': 'two-column',
    'subtext-gbt': 'subtext-gtb',
    'sub-text-gtb': 'subtext-gtb',
    'reference': 'references',
    'refrences': 'references'
  };

  const allElementsWithClass = document.querySelectorAll('[class]');
  allElementsWithClass.forEach((el, idx) => {
    if (isExcluded(el)) return;
    const classes = Array.from(el.classList);
    classes.forEach(cls => {
      if (typoMap[cls]) {
        if (!el.id) el.id = 'typo-' + idx;
        typoResults.push({
          type: 'class-typo',
          id: el.id,
          ok: false,
          text: `พบคลาสผิด: "${cls}"`,
          errorMessage: `ควรเป็น "${typoMap[cls]}"`
        });
      }
    });
  });

  return { tocResults, h2Results, misplacedResults, refResults, colResults, altResults, listResults, splitPResults, typoResults, usedSelector };
}

/**
 * HIGHLIGHT LOGIC (Page Context)
 */
function highlightElement(id) {
  const el = document.getElementById(id);
  if (!el) return;

  // Enhance targeting: If it's an empty anchor, target the next visible element
  let target = el;
  if ((el.tagName === 'A' || el.tagName === 'SPAN') && el.innerText.trim() === '' && el.nextElementSibling) {
    target = el.nextElementSibling;
  }

  const styleId = 'toc-checker-clean-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      @keyframes toc-simple-blink {
        0% { outline: 5px solid #ef4444; background-color: rgba(239, 68, 68, 0.1); }
        50% { outline: 5px solid transparent; background-color: transparent; }
        100% { outline: 5px solid #ef4444; background-color: rgba(239, 68, 68, 0.1); }
      }
      .toc-simple-highlight {
        position: relative !important;
        outline-offset: 4px !important;
        z-index: 999999 !important;
        animation: toc-simple-blink 0.5s ease-in-out 6 !important;
        border-radius: 4px !important;
      }
    `;
    document.head.appendChild(s);
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('toc-simple-highlight');

  setTimeout(() => {
    target.classList.remove('toc-simple-highlight');
  }, 3500);
}
