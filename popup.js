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
  const checkedDomainSelect = $('checkedDomain');
  const resultsList = $('resultsList');
  const copyBtn = $('copyReportBtn');
  const statusMsg = $('statusMsg');
  const progressContainer = $('progressContainer');
  const progressBar = $('progressBar');
  const progressLabel = $('progressLabel');
  const progressPercent = $('progressPercent');

  let lastResults = [];

  // Load saved settings
  const settings = await chrome.storage.local.get(['selectors', 'autoDetect', 'showBroken', 'checkedDomain']);
  tocSelectorsTextarea.value = settings.selectors || DEFAULT_SELECTORS;
  autoDetectToggle.checked = settings.autoDetect !== false;
  showBrokenOnlyToggle.checked = settings.showBroken !== false;
  checkedDomainSelect.value = settings.checkedDomain || '';

  // Save settings on change
  const saveSettings = () => {
    chrome.storage.local.set({
      selectors: tocSelectorsTextarea.value,
      autoDetect: autoDetectToggle.checked,
      showBroken: showBrokenOnlyToggle.checked,
      checkedDomain: checkedDomainSelect.value
    });
  };

  [tocSelectorsTextarea, autoDetectToggle, showBrokenOnlyToggle, checkedDomainSelect].forEach(el => {
    el.addEventListener('change', () => {
      saveSettings();
      // Only re-render if we actually have scan results (not the initial empty array)
      const hasData = (Array.isArray(lastResults) && lastResults.length > 0) || (lastResults && !Array.isArray(lastResults));
      if (hasData) renderResults(lastResults);
    });
  });

  scanBtn.addEventListener('click', async () => {
    await runScanFlow();
  });

  function setProgress(value, label) {
    const normalized = Math.max(0, Math.min(100, value));
    progressContainer.style.display = 'block';
    progressBar.style.width = `${normalized}%`;
    progressPercent.textContent = `${Math.round(normalized)}%`;
    if (label) progressLabel.textContent = label;
  }

  function hideProgress() {
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
      progressPercent.textContent = '0%';
      progressLabel.textContent = 'Preparing scan...';
    }, 500);
  }

  async function runScanFlow() {


    statusMsg.textContent = 'Scanning...';
    try {
      setProgress(10, 'Starting scan...');
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

      if (!tab || !tab.id) {
        statusMsg.textContent = 'Error: Cannot find active tab';
        hideProgress();
        return;
      }

      const selectors = tocSelectorsTextarea.value.split('\n').map(s => s.trim()).filter(s => s);
      setProgress(35, 'Analyzing page structure...');
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: runScanner,
        args: [selectors, autoDetectToggle.checked, checkedDomainSelect.value]
      });

      if (!(results && results[0] && results[0].result)) {
        statusMsg.textContent = 'Error: No results returned';
        hideProgress();
        return;
      }

      lastResults = results[0].result;
      renderResults(lastResults);
      statusMsg.textContent = 'Scan complete';
      setProgress(65, 'Checking links...');

      const linkResponse = await chrome.runtime.sendMessage({
        type: 'START_LINK_CHECK',
        tabId: tab.id
      });

      const linkResults = (linkResponse && linkResponse.allLinks && linkResponse.results)
        ? linkResponse.allLinks.reduce((acc, link) => {
          const status = linkResponse.results.find(r => r.url === link.href)?.status;
          if (status && status !== 'OK') {
            acc.push({
              type: 'link-status',
              id: `link-err-${acc.length}`,
              ok: false,
              text: link.text,
              errorMessage: `${status} (${link.href})`
            });
          }
          return acc;
        }, [])
        : [];

      lastResults.linkStatusResults = linkResults;
      renderResults(lastResults);
      statusMsg.textContent = `Scan complete: ${linkResults.length} broken links`;
      setProgress(100, 'Completed');
      hideProgress();
    } catch (err) {
      console.error(err);
      statusMsg.textContent = 'Error: ' + err.message;
      hideProgress();
    }
  }

  function renderResults(results) {
    if (!results) return;
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
    const brResults = results.brResults || [];
    const captionResults = results.captionResults || [];
    const btnLinkResults = results.btnLinkResults || [];
    const yearResults = results.yearResults || [];
    const knowledgeResults = results.knowledgeResults || [];
    const extLinkResults = results.extLinkResults || [];
    const doctorAltResults = results.doctorAltResults || [];
    const bannerLinkResults = results.bannerLinkResults || [];
    const tocWrapResults = results.tocWrapResults || [];
    const doctorImageResults = results.doctorImageResults || [];
    const h3ImageResults = results.h3ImageResults || [];
    const h3AltResults = results.h3AltResults || [];
    const phoneResults = results.phoneResults || [];

    const total = tocResults.length;
    const okCount = tocResults.filter(r => r.ok).length;
    const brokenCount = total - okCount;

    const h2Total = h2Results.length;
    const h2Ok = h2Results.filter(r => r.ok).length;
    const usedSelector = results.usedSelector || 'None';

    const updatePill = (id, count, hideIfZero = true) => {
      const el = document.getElementById(id);
      if (!el) return; // Silent skip if element doesn't exist
      el.textContent = count;
      const pill = el.closest('.pill');
      if (pill && hideIfZero) {
        pill.style.display = count > 0 ? 'inline-block' : 'none';
      }
    };

    $('totalCount').textContent = total;
    $('okCount').textContent = okCount;
    $('brokenCount').textContent = brokenCount;

    // Safety check for h2TotalCount
    const h2TotalEl = document.getElementById('h2TotalCount');
    if (h2TotalEl) h2TotalEl.textContent = h2Total;

    updatePill('h2SepCount', h2Ok, false); // Always show H2 summary
    updatePill('misplacedCount', misplacedResults.length);
    updatePill('refCount', refResults.filter(r => !r.ok).length);
    updatePill('colCount', colResults.filter(r => !r.ok).length);
    updatePill('altCount', altResults.length);
    updatePill('listCount', listResults.length);
    updatePill('splitPCount', splitPResults.length);
    updatePill('typoCount', typoResults.length);
    updatePill('brCount', brResults.length);
    updatePill('captionCount', captionResults.length);
    updatePill('btnLinkCount', btnLinkResults.length);
    updatePill('yearCount', yearResults.length);
    updatePill('knowledgeCount', knowledgeResults.length);
    updatePill('extLinkCount', extLinkResults.length);
    updatePill('doctorAltCount', doctorAltResults.length);
    updatePill('bannerCount', bannerLinkResults.length);
    updatePill('wrapCount', tocWrapResults.length);
    updatePill('doctorImgCount', doctorImageResults.length);
    updatePill('h3ImgCount', h3ImageResults.length);
    updatePill('h3AltCount', h3AltResults.length);
    updatePill('phoneCount', phoneResults.length);

    const currentLinkStatusData = results.linkStatusResults || [];
    updatePill('linkStatusCount', currentLinkStatusData.length);

    $('usedSelector').textContent = usedSelector;

    $('summary').style.display = 'flex';
    $('postScanActions').style.display = 'flex';

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
      const h2Broken = h2Results.filter(r => !r.ok);
      if (!showBrokenOnly || h2Broken.length > 0) {
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

    // Render Section: Empty BR
    if (brResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#b45309';
      section.innerHTML = `<strong>Empty/Starting BR</strong> (${brResults.length})`;
      resultsList.appendChild(section);

      brResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Caption Check
    if (captionResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#86198f';
      section.innerHTML = `<strong>Possible Unstyled Captions</strong> (${captionResults.length})`;
      resultsList.appendChild(section);

      captionResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Button Link
    if (btnLinkResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#1e3a8a';
      section.innerHTML = `<strong>Broken Button Links</strong> (${btnLinkResults.length})`;
      resultsList.appendChild(section);

      btnLinkResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Year in Heading without current-year
    if (yearResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#dc2626';
      section.innerHTML = `<strong>Year in Heading (Missing current-year)</strong> (${yearResults.length})`;
      resultsList.appendChild(section);

      yearResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Knowledge Check
    if (knowledgeResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#15803d';
      section.innerHTML = `<strong>Knowledge Check (Missing Blockquote)</strong> (${knowledgeResults.length})`;
      resultsList.appendChild(section);

      knowledgeResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: External Link Check
    if (extLinkResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#92400e';
      section.innerHTML = `<strong>External VSQ Links (Missing _blank)</strong> (${extLinkResults.length})`;
      resultsList.appendChild(section);

      extLinkResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Doctor Alt Check
    if (doctorAltResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#0369a1';
      section.innerHTML = `<strong>Doctor Alt Check (Missing Name in Alt)</strong> (${doctorAltResults.length})`;
      resultsList.appendChild(section);

      doctorAltResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Banner Link Check
    if (bannerLinkResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#991b1b';
      section.innerHTML = `<strong>Broken Banner Link (Missing Link or Alt)</strong> (${bannerLinkResults.length})`;
      resultsList.appendChild(section);

      bannerLinkResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Link Wrap Check
    if (tocWrapResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#9a3412';
      section.innerHTML = `<strong>TOC Link Wrap Error (Text Outside Link)</strong> (${tocWrapResults.length})`;
      resultsList.appendChild(section);

      tocWrapResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Doctor Image Check
    if (doctorImageResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#0d9488';
      section.innerHTML = `<strong>Doctor Image Check (Identified by Source/Class)</strong> (${doctorImageResults.length})`;
      resultsList.appendChild(section);

      doctorImageResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: H3 Image Check
    if (h3ImageResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#9f1239';
      section.innerHTML = `<strong>H3 Image Check (Missing Image under H3)</strong> (${h3ImageResults.length})`;
      resultsList.appendChild(section);

      h3ImageResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: H3 Alt Check
    if (h3AltResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#c2410c';
      section.innerHTML = `<strong>H3 Clinic Alt Check (Name Mismatch)</strong> (${h3AltResults.length})`;
      resultsList.appendChild(section);

      h3AltResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }

    // Render Section: Phone Link Check
    if (phoneResults.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#1d4ed8';
      section.innerHTML = `<strong>Phone Link Check (Invalid Format)</strong> (${phoneResults.length})`;
      resultsList.appendChild(section);

      phoneResults.forEach(item => {
        resultsList.appendChild(createResultItem(item));
      });
    }



    // Render Section: Link Status Check
    const finalLinkStatus = results.linkStatusResults || [];
    if (finalLinkStatus.length > 0) {
      const section = document.createElement('li');
      section.className = 'section-header';
      section.style.marginTop = '15px';
      section.style.color = '#059669';
      section.innerHTML = `<strong>Broken External Links</strong> (${finalLinkStatus.length})`;
      resultsList.appendChild(section);

      finalLinkStatus.forEach(item => {
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
      if (item.type === 'empty-br') statusText = item.errorMessage;
      if (item.type === 'caption-check') statusText = item.errorMessage;
      if (item.type === 'btn-link') statusText = item.errorMessage;
      if (item.type === 'year-check') statusText = item.errorMessage;
      if (item.type === 'knowledge-check') statusText = item.errorMessage;
      if (item.type === 'ext-link') statusText = item.errorMessage;
      if (item.type === 'doctor-alt') statusText = item.errorMessage;
      if (item.type === 'banner-check') statusText = item.errorMessage;
      if (item.type === 'toc-wrap') statusText = item.errorMessage;
      if (item.type === 'doctor-img') statusText = item.errorMessage;
      if (item.type === 'h3-img') statusText = item.errorMessage;
      if (item.type === 'h3-alt') statusText = item.errorMessage;
      if (item.type === 'phone-check') statusText = item.errorMessage;
      if (item.type === 'missing-content') statusText = item.errorMessage;
      if (item.type === 'link-status') statusText = `ลิงก์เสีย: ${item.errorMessage}`;
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
    if (item.type === 'empty-br') label = 'BR';
    if (item.type === 'caption-check') label = 'Caption';
    if (item.type === 'btn-link') label = 'Button';
    if (item.type === 'year-check') label = 'Heading';
    if (item.type === 'knowledge-check') label = 'Knowledge';
    if (item.type === 'ext-link') label = 'External Link';
    if (item.type === 'doctor-alt') label = 'Doctor Alt';
    if (item.type === 'banner-check') label = 'Banner Link';
    if (item.type === 'toc-wrap') label = 'Link Wrap';
    if (item.type === 'doctor-img') label = 'Doctor Image';
    if (item.type === 'h3-img') label = 'H3 Image';
    if (item.type === 'h3-alt') label = 'H3 Alt';
    if (item.type === 'phone-check') label = 'Phone Link';
    if (item.type === 'missing-content') label = 'เนื้อหาหาย';
    if (item.type === 'link-status') label = 'Link Status';

    li.innerHTML = `
      <div class="status-indicator ${item.ok ? 'status-ok' : (item.isWarn ? 'status-warn' : 'status-broken')}"></div>
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

    if (lastResults.brResults && lastResults.brResults.length > 0) {
      report += `[ EMPTY BR ]\n`;
      lastResults.brResults.forEach(r => {
        report += `[WARN] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.captionResults && lastResults.captionResults.length > 0) {
      report += `[ CAPTION CHECK ]\n`;
      lastResults.captionResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.btnLinkResults && lastResults.btnLinkResults.length > 0) {
      report += `[ BUTTON LINK CHECK ]\n`;
      lastResults.btnLinkResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
    }

    if (lastResults.yearResults && lastResults.yearResults.length > 0) {
      report += `[ YEAR IN HEADING ]\n`;
      lastResults.yearResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
    }

    if (lastResults.knowledgeResults && lastResults.knowledgeResults.length > 0) {
      report += `[ KNOWLEDGE CHECK ]\n`;
      lastResults.knowledgeResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
    }

    if (lastResults.extLinkResults && lastResults.extLinkResults.length > 0) {
      report += `[ EXTERNAL VSQ LINKS ]\n`;
      lastResults.extLinkResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}" (${r.href})\n`;
      });
      report += `\n`;
    }

    if (lastResults.doctorAltResults && lastResults.doctorAltResults.length > 0) {
      report += `[ DOCTOR ALT CHECK ]\n`;
      lastResults.doctorAltResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.bannerLinkResults && lastResults.bannerLinkResults.length > 0) {
      report += `[ BANNER LINK CHECK ]\n`;
      lastResults.bannerLinkResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.tocWrapResults && lastResults.tocWrapResults.length > 0) {
      report += `[ TOC LINK WRAP ]\n`;
      lastResults.tocWrapResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.doctorImageResults && lastResults.doctorImageResults.length > 0) {
      report += `[ DOCTOR IMAGE CHECK ]\n`;
      lastResults.doctorImageResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.h3ImageResults && lastResults.h3ImageResults.length > 0) {
      report += `[ H3 IMAGE CHECK ]\n`;
      lastResults.h3ImageResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
    }

    if (lastResults.h3AltResults && lastResults.h3AltResults.length > 0) {
      report += `[ H3 CLINIC ALT CHECK ]\n`;
      lastResults.h3AltResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}" (Expected Name: ${r.clinicName})\n`;
      });
      report += `\n`;
    }

    if (lastResults.phoneResults && lastResults.phoneResults.length > 0) {
      report += `[ PHONE LINK CHECK ]\n`;
      lastResults.phoneResults.forEach(r => {
        report += `[FAIL] ${r.errorMessage} : "${r.text.trim()}"\n`;
      });
      report += `\n`;
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
function runScanner(selectors, autoDetect, checkedDomain, originalContentHtml, originalContentFileLabel) {
  const comparisonDebugLogs = [];
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
  function normalizeExclusionText(text) {
    return (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function isStructuralExcluded(el) {
    if (!el) return true;
    if (el.closest('#wpadminbar') || el.closest('.toc-checker-style')) return true;
    if (el.closest('header, nav, footer, aside, .header, .footer, .menu, .pdpa-hide, .sidebar, .widget-area')) return true;
    if (el.closest('.chat-now-footer, .vsq-blogs-related-article, .dpsp-content-wrapper, .dpsp-networks-btns-wrapper, .sharedaddy, .jp-relatedposts')) return true;
    return false;
  }

  const firstH1 = Array.from(document.querySelectorAll('h1, h2')).find((heading) => {
    if (!heading || isStructuralExcluded(heading)) return false;
    const style = window.getComputedStyle(heading);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return normalizeExclusionText(heading.innerText || heading.textContent || '').length > 0;
  }) || document.querySelector('h1, h2');

  function isBeforeFirstH1(el) {
    if (!el || !firstH1 || el === firstH1) return false;
    if (el.contains && el.contains(firstH1)) return false;
    return Boolean(el.compareDocumentPosition(firstH1) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function isSeoWriterNoteBlock(el) {
    if (!el) return false;

    const ownText = normalizeExclusionText((el.innerText || el.textContent || '').slice(0, 220));
    if (ownText.startsWith('note seo writer')) return true;

    let current = el;
    for (let depth = 0; current && depth < 2; depth++) {
      let prev = current.previousElementSibling;
      for (let steps = 0; prev && steps < 3; steps++) {
        const prevText = normalizeExclusionText((prev.innerText || prev.textContent || '').slice(0, 220));
        if (prevText.startsWith('note seo writer')) {
          return true;
        }
        prev = prev.previousElementSibling;
      }
      current = current.parentElement;
    }

    return false;
  }

  function isExcluded(el) {
    if (!el) return true;
    // Removed firstH1 and footerH2 based exclusions to avoid skipping legitimate content
    if (isStructuralExcluded(el)) return true;
    if (isBeforeFirstH1(el)) return true;
    if (isSeoWriterNoteBlock(el)) return true;
    return false;
  }

  function hasSeparatorAbove(el) {
    let current = el;
    for (let level = 0; level < 2; level++) {
      let sib = current.previousElementSibling;
      while (sib) {
        if (sib.tagName === 'HR' || Array.from(sib.classList).some(c => /separator|divider|line|vsq-tb-gtb/i.test(c))) return true;

        // UPGRADE: Check for ps2id target but no HR
        if (sib.classList.contains('wp-block-ps2id-block-target') || (sib.id && sib.id.includes('ps2id'))) {
          // We found a jump target. It's often paired with an HR in a previous sibling or same container
          // Marking as "likely has separator if ps2id is used correctly" OR we can flag it if NO real HR is found earlier (but let's not be too strict yet)
        }

        if (/^H[1-6]$/.test(sib.tagName)) return false;
        if (['P', 'DIV', 'UL', 'TABLE'].includes(sib.tagName) && !/target|anchor|blog-doctorbanner/i.test(sib.className)) break;
        sib = sib.previousElementSibling;
      }
      if (current.parentElement && current.parentElement.firstElementChild === current) current = current.parentElement;
      else break;
    }
    return false;
  }

  // UPGRADE: Dynamic Year Calculation
  const now = new Date();
  const yearAD = now.getFullYear();
  const yearBE = yearAD + 543;
  const yearKeywords = [yearAD.toString(), yearBE.toString(), (yearAD - 1).toString(), (yearBE - 1).toString()];

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
    return { type: 'toc', id, ok: !!target, text: (link.innerText || link.textContent || '').trim().substring(0, 100) };
  }).filter(r => r);

  // 2. H2 SEPARATOR SCAN
  const tocKW = ['สารบัญ', 'table of content', 'content', '目录'];
  const h2Results = [];
  let h2Count = 0;

  // Include .blog-doctorbanner in the mandatory separator check
  const h2Targets = Array.from(document.querySelectorAll('h2, .blog-doctorbanner'));

  h2Targets.forEach((el, idx) => {
    if (isExcluded(el) || (container && container.contains(el))) return;

    if (el.tagName === 'H2') {
      const text = el.innerText.toLowerCase();
      if (tocKW.some(t => text.includes(t))) return;
    }

    h2Count++;
    if (h2Count === 1) return; // Skip first heading/banner

    if (!el.id) el.id = 'toc-h2-' + idx;
    h2Results.push({
      type: 'h2-separator',
      id: el.id,
      ok: hasSeparatorAbove(el),
      text: el.innerText.trim() || 'Blog Doctor Banner'
    });
  });

  // 3. MISPLACED SEP
  const misplacedResults = [];
  Array.from(document.querySelectorAll('hr, div, span')).filter(el => {
    if (el.tagName === 'HR') return true;
    return /separator|divider|line|vsq-tb-gtb/i.test(el.className);
  }).forEach((sep, idx) => {
    if (isExcluded(sep) || (container && container.contains(sep))) return;
    let next = sep.nextElementSibling;
    while (next && (next.tagName === 'A' || next.style.display === 'none' || /target|anchor/i.test(next.className))) next = next.nextElementSibling;
    if (next && (/^H[13456]$/.test(next.tagName) || next.tagName === 'P')) {
      // Whitelist: Allow separator above summary headings even if they are H3/H4 etc.
      const hText = next.innerText.toLowerCase();
      if (hText.includes('สรุป') || hText.includes('conclusion') || hText.includes('อ้างอิง') || hText.includes('reference') || next.classList.contains('blog-doctorbanner')) return;

      // Whitelist: Allow separator BELOW references (e.g., between references and footer)
      let prev = sep.previousElementSibling;
      while (prev && (prev.tagName === 'A' || prev.style.display === 'none' || /target|anchor/i.test(prev.className))) prev = prev.previousElementSibling;
      if (prev) {
        const pText = prev.innerText.toLowerCase();
        if (pText.includes('อ้างอิง') || pText.includes('reference') || prev.classList.contains('references')) return;
      }

      if (!sep.id) sep.id = 'toc-sep-' + idx;
      const label = next.tagName === 'P' ? 'ย่อหน้า (P)' : `หัวข้อ ${next.tagName}`;
      misplacedResults.push({ type: 'misplaced-separator', id: sep.id, ok: false, text: `${label}: "${next.innerText.substring(0, 20)}..."` });
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
      // Intentional styles check: Bold or Centered
      const style = window.getComputedStyle(nextP);
      const isBold = style.fontWeight >= 600 || nextP.querySelector('strong, b');
      const isCentered = style.textAlign === 'center' || nextP.classList.contains('has-text-align-center') || nextP.style.textAlign === 'center';

      if (isBold || isCentered) return;

      if (!nextP.id) nextP.id = 'split-' + idx;
      splitPResults.push({ type: 'split-p', id: nextP.id, ok: false, isWarn: true, text: nxt.substring(0, 70), errorMessage: msg });
    }
  });

  // 8. CLASS TYPO CHECK
  const typoResults = [];
  const typoMap = {
    'captiom': 'caption-img', // Corrected typo
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

  // 9. EMPTY/STARTING BR CHECK
  const brResults = [];
  Array.from(document.querySelectorAll('p')).forEach((p, idx) => {
    if (isExcluded(p)) return;

    let issue = null;
    let msg = '';

    const first = p.firstElementChild;
    const text = p.innerText.trim();

    // Check if only BR (Empty paragraph with BR)
    if (text === '' && p.querySelector('br')) {
      issue = true;
      msg = 'มีเพียง <br> อยู่ในย่อหน้า';
    }
    // Check start with BR
    else if (first && first.tagName === 'BR') {
      issue = true;
      msg = 'ขึ้นต้นด้วย <br>';
    }

    if (issue) {
      if (!p.id) p.id = 'br-check-' + idx;
      brResults.push({
        type: 'empty-br',
        id: p.id,
        ok: false,
        text: text || '(Empty P)',
        errorMessage: msg
      });
    }
  });

  // 10. CAPTION CHECK
  const captionResults = [];

  // Find all possible text blocks that could be captions
  const potentialCaptions = Array.from(document.querySelectorAll('p, div, span, figcaption')).filter(el => {
    if (isExcluded(el)) return false;
    const t = el.innerText.trim();

    // RED FLAG: Exclude common doctor contact banner text
    const contactKeywords = ['ยินดีให้คำปรึกษาฟรี', 'หมอตอบเอง', 'ปรึกษาหมอทาง', 'สอบถามเพิ่มเติม', 'ปรึกษาฟรี'];
    if (contactKeywords.some(kw => t.includes(kw))) return false;

    // RED FLAG: Captions rarely have 2 or more links
    if (el.querySelectorAll('a').length >= 2) return false;

    // Captions are usually short
    return t.length > 0 && t.length < 400;
  });

  potentialCaptions.forEach((el, idx) => {
    // Skip if it's already correctly marked
    const hasClass = el.classList.contains('caption-img');
    const isFigCap = el.tagName === 'FIGCAPTION' || el.closest('figcaption') || el.classList.contains('wp-caption-text') || el.classList.contains('wp-element-caption');
    const isSliderBranch = el.closest('.slide-branch');
    const isBlockquote = el.closest('blockquote');
    if (hasClass || isFigCap || isSliderBranch || isBlockquote) return;

    // Check style: is it centered or italic?
    const style = window.getComputedStyle(el);
    const textAlign = style.textAlign;
    const fontStyle = style.fontStyle;

    const isCentered = textAlign === 'center' ||
      el.classList.contains('has-text-align-center') ||
      el.style.textAlign === 'center' ||
      (el.parentElement && window.getComputedStyle(el.parentElement).textAlign === 'center');

    const isItalic = fontStyle === 'italic' ||
      el.querySelector('em, i') ||
      el.style.fontStyle === 'italic';

    if (!isCentered && !isItalic) return;

    // Look for an image block appearing just before this text
    let foundImg = false;
    let alreadyHasCaption = false;

    // Check immediate siblings up
    let sib = el.previousElementSibling;
    while (sib) {
      const hasImg = sib.tagName === 'IMG' || sib.querySelector('img');
      if (hasImg) {
        foundImg = true;
        // Check if it already has an HTML5 figcaption
        if (sib.tagName === 'FIGCAPTION' || sib.querySelector('figcaption') || sib.classList.contains('wp-caption-text')) {
          alreadyHasCaption = true;
        }
        break;
      }
      if ((sib.innerText || sib.textContent || '').trim() !== '') break;
      sib = sib.previousElementSibling;
    }

    // If not found and we are a first child, check parent containers' siblings (up to 3 levels)
    if (!foundImg && el.parentElement && el === el.parentElement.firstElementChild) {
      let currentParent = el.parentElement;
      let depth = 0;

      while (!foundImg && currentParent && depth < 3) {
        let containerSib = currentParent.previousElementSibling;

        while (containerSib) {
          const hasImg = containerSib.tagName === 'IMG' || containerSib.querySelector('img');
          if (hasImg) {
            foundImg = true;
            if (containerSib.tagName === 'FIGCAPTION' || containerSib.querySelector('figcaption') || containerSib.classList.contains('wp-caption-text')) {
              alreadyHasCaption = true;
            }
            break;
          }
          const sibText = (containerSib.innerText || containerSib.textContent || '').trim();
          if (sibText.length > 50) break;

          containerSib = containerSib.previousElementSibling;
        }

        if (!foundImg && currentParent.parentElement) {
          if (currentParent.className && typeof currentParent.className === 'string' && currentParent.className.includes('row-layout')) break;
          currentParent = currentParent.parentElement;
          depth++;
        } else {
          break;
        }
      }
    }

    if (foundImg && !alreadyHasCaption) {
      let msg = '';
      if (isCentered && isItalic) msg = 'ข้อความจัดกลางและตัวเอียง (ไม่ได้ใส่ class caption-img)';
      else if (isCentered) msg = 'ข้อความจัดกลางใต้รูป (ไม่ได้ใส่ class caption-img)';
      else if (isItalic) msg = 'ข้อความตัวเอียงใต้รูป (ไม่ได้ใส่ class caption-img)';

      if (msg) {
        if (!el.id) el.id = 'caption-check-' + idx;
        captionResults.push({
          type: 'caption-check',
          id: el.id,
          ok: false,
          text: el.innerText.trim().substring(0, 50),
          errorMessage: msg
        });
      }
    }
  });

  // 11. BUTTON LINK CHECK
  const btnLinkResults = [];
  const buttons = Array.from(document.querySelectorAll('a.wp-element-button, a.wp-block-button__link, a.btn'));
  buttons.forEach((btn, idx) => {
    if (isExcluded(btn)) return;

    const href = btn.getAttribute('href');
    if (!href || href.trim() === '' || href === '#') {
      if (!btn.id) btn.id = 'btn-link-' + idx;
      btnLinkResults.push({
        type: 'btn-link',
        id: btn.id,
        ok: false,
        text: (btn.innerText || btn.textContent || '').trim() || 'Button',
        errorMessage: 'ปุ่มไม่มีลิงก์ (Empty HREF)'
      });
    }
  });

  // 12. YEAR IN HEADING CHECK (without current-year in ID)
  const yearResults = [];
  const yearPattern = /\b(19|20)\d{2}\b/; // Matches years like 2024, 2025, 2026, etc.
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));

  headings.forEach((heading, idx) => {
    if (isExcluded(heading)) return;

    const text = heading.innerText.trim();
    const id = heading.getAttribute('id') || '';

    // Check if heading text contains a year
    if (yearPattern.test(text)) {
      // Check if ID contains 'current-year' or 'current_year'
      if (!id.includes('current-year') && !id.includes('current_year')) {
        if (!heading.id) heading.id = 'year-check-' + idx;
        yearResults.push({
          type: 'year-check',
          id: heading.id,
          ok: false,
          text: text.substring(0, 100),
          errorMessage: 'พบปีในหัวข้อแต่ ID ไม่มี current-year'
        });
      }
    }
  });

  // 13. KNOWLEDGE BLOCKQUOTE CHECK
  const knowledgeResults = [];
  const pTags = Array.from(document.querySelectorAll('p'));
  pTags.forEach((p, idx) => {
    if (isExcluded(p)) return;
    const text = (p.innerText || p.textContent || '').trim();
    if (text.startsWith('ข้อควรรู้')) {
      const parent = p.parentElement;
      if (!parent || parent.tagName !== 'BLOCKQUOTE') {
        if (!p.id) p.id = 'knowledge-check-' + idx;
        knowledgeResults.push({
          type: 'knowledge-check',
          id: p.id,
          ok: false,
          text: text.substring(0, 100),
          errorMessage: 'ข้อควรรู้ ไม่อยู่ใน Blockquote'
        });
      }
    }
  });

  // 14. EXTERNAL VSQ LINK CHECK
  const extLinkResults = [];
  const VSQ_DOMAINS = [
    'vsquareconsult.com',
    'vsquareclinic.co',
    'vsq-injector.com',
    'vsquare.clinic',
    'vsqclinic.com',
    'drvsquare.com',
    'doctorvsquareclinic.com',
    'bestbrandclinic.com',
    'monghaclinic.com',
    'vsquareclinic.com',
    'vsquareclinic.com/cn/',
    'vsquareclinic.com/en/'
  ];

  if (checkedDomain) {
    const allLinks = Array.from(document.querySelectorAll('a'));
    allLinks.forEach((link, idx) => {
      if (isExcluded(link) || (container && container.contains(link))) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // Check if it's an absolute URL
      if (!href.startsWith('http')) return;

      // If link is to the SAME domain as checkedDomain, skip (it's internal)
      // We check if the href contains the checkedDomain
      if (href.includes(checkedDomain)) return;

      // Check if it's in the other VSQ domains
      let isOtherVSQ = false;
      let targetDomainName = '';

      for (const domain of VSQ_DOMAINS) {
        if (domain === checkedDomain) continue;
        if (href.includes(domain)) {
          isOtherVSQ = true;
          targetDomainName = domain;
          break;
        }
      }

      if (isOtherVSQ) {
        const target = link.getAttribute('target');
        if (target !== '_blank') {
          if (!link.id) link.id = 'ext-vsq-' + idx;
          extLinkResults.push({
            type: 'ext-link',
            id: link.id,
            ok: false,
            text: (link.innerText || link.textContent || '').trim().substring(0, 50) || 'Link',
            href: href,
            errorMessage: `โดเมนนอก (${targetDomainName}) แต่ไม่ได้เปิด New Tab`
          });
        }
      }
    });
  }

  // 15. DOCTOR ALT CHECK
  const doctorAltResults = [];
  const doctorPattern = /(พญ\.|นพ\.)\s*([ก-๙\s]+)\s+เลข\s*ว\.\d+/;

  const figures = Array.from(document.querySelectorAll('figure'));
  figures.forEach((figure, idx) => {
    if (isExcluded(figure) || (container && container.contains(figure))) return;

    const img = figure.querySelector('img');
    const caption = figure.querySelector('figcaption, .wp-element-caption, .wp-caption-text');

    if (img && caption) {
      const captionText = (caption.innerText || caption.textContent || '').trim();
      const match = captionText.match(doctorPattern);

      if (match) {
        const doctorFullname = (match[1] + match[2]).trim();
        const alt = (img.getAttribute('alt') || '').trim();

        if (!alt.includes(doctorFullname)) {
          if (!figure.id) figure.id = 'doctor-alt-' + idx;
          doctorAltResults.push({
            type: 'doctor-alt',
            id: figure.id,
            ok: false,
            text: captionText.substring(0, 100),
            errorMessage: `พบชื่อแพทย์ใน Caption (${doctorFullname}) แต่ไม่มีใน Alt Tag`
          });
        }
      }
    }
  });

  // 16. BANNER LINK CHECK (Detection for images that are buttons)
  const bannerLinkResults = [];
  const bannerKeywords = ['แบนเนอร์', 'โปรโมชัน', 'banner', 'promotion', 'promo', 'cta', 'btn', 'button', 'คลิก', 'จอง', 'ปรึกษา'];

  const allImgs = Array.from(document.querySelectorAll('img'));
  allImgs.forEach((img, idx) => {
    if (isExcluded(img) || (container && container.contains(img))) return;

    const alt = (img.getAttribute('alt') || '').toLowerCase();
    const src = (img.getAttribute('src') || '').toLowerCase();
    const isPotentialBanner = bannerKeywords.some(kw => alt.includes(kw) || src.includes(kw));
    const isDoctorConsultFooter = alt.includes('ปรึกษาหมอ') || src.includes('ปรึกษาหมอ');

    if (isPotentialBanner && !isDoctorConsultFooter) {
      const link = img.closest('a');
      const href = link ? link.getAttribute('href') : null;

      let error = '';
      if (!link) error = 'แบนเนอร์/ปุ่ม รูปภาพนี้ไม่มีลิงก์ครอบ';
      else if (!href || href === '#' || href === '') error = 'แบนเนอร์/ปุ่ม รูปภาพนี้มีลิงก์แต่ค่าว่างหรือเป็น #';

      if (error) {
        if (!img.id) img.id = 'banner-img-' + idx;
        bannerLinkResults.push({
          type: 'banner-check',
          id: img.id,
          ok: false,
          text: alt || src.split('/').pop() || 'Banner Image',
          errorMessage: error
        });
      }
    }
  });

  // 17. TOC LINK WRAP CHECK
  const tocWrapResults = [];
  if (container) {
    const listItems = Array.from(container.querySelectorAll('li'));
    listItems.forEach((li, idx) => {
      const link = li.querySelector('a');
      if (!link) return;

      // Check for direct child text nodes of the LI that have actual content
      let hasOutsideText = false;
      let outsideSnippet = '';

      Array.from(li.childNodes).forEach(node => {
        // We only care about text nodes or other elements that might contain visible text (but skip sub-lists)
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text.length > 0) {
            hasOutsideText = true;
            outsideSnippet = text;
          }
        } else if (node.tagName !== 'A' && node.tagName !== 'UL' && node.tagName !== 'OL') {
          const text = (node.innerText || node.textContent || '').trim();
          if (text.length > 0) {
            hasOutsideText = true;
            outsideSnippet = text;
          }
        }
      });

      if (hasOutsideText) {
        if (!li.id) li.id = 'toc-wrap-' + idx;
        tocWrapResults.push({
          type: 'toc-wrap',
          id: li.id,
          ok: false,
          text: (li.innerText || li.textContent || '').trim().substring(0, 70),
          errorMessage: `สารบัญครอบลิงก์ไม่ครบ (พบข้อความ "${outsideSnippet}" อยู่นอกลิงก์)`
        });
      }
    });
  }

  // 18. DOCTOR IMAGE DETECTION (When no caption is present)
  const doctorImageResults = [];
  const drKeywords = ['พญ', 'นพ', 'doctor', 'dr-', 'vsq-dr'];

  allImgs.forEach((img, idx) => {
    if (isExcluded(img) || (container && container.contains(img))) return;

    // Skip if already handled by Figure/Caption check
    const isAlreadyChecked = img.id && img.id.startsWith('doctor-alt-');
    if (isAlreadyChecked) return;

    const src = (img.getAttribute('src') || '').toLowerCase();
    const cls = (img.className || '').toLowerCase();
    const parentCls = img.parentElement ? (img.parentElement.className || '').toLowerCase() : '';

    const looksLikeDoctor = drKeywords.some(kw => src.includes(kw) || cls.includes(kw) || parentCls.includes(kw)) ||
      parentCls.includes('doctorbanner');

    if (looksLikeDoctor) {
      const alt = (img.getAttribute('alt') || '').trim();
      const lowerAlt = alt.toLowerCase();

      // EXCLUSION: If it contains "clinic" or "คลินิก", it's likely a banner, not a portrait.
      const isClinicBanner = lowerAlt.includes('clinic') || lowerAlt.includes('คลินิก');

      if (!isClinicBanner && !alt.includes('พญ.') && !alt.includes('นพ.')) {
        if (!img.id) img.id = 'dr-img-detect-' + idx;
        doctorImageResults.push({
          type: 'doctor-img',
          id: img.id,
          ok: false,
          text: src.split('/').pop() || 'Doctor Image',
          errorMessage: 'ตรวจพบว่าเป็นรูปหมอ (จากชื่อไฟล์หรือคลาส) แต่ใน ALT ไม่มีชื่อ พญ./นพ.'
        });
      }
    }
  });

  // 19. H3 IMAGE & ALT CHECK (Improved with Absolute Position Comparison)
  const h3ImageResults = [];
  const h3AltResults = [];
  const targetH3Domains = ['bestbrandclinic.com', 'monghaclinic.com', 'vsquareclinic.co', 'vsquareclinic.com'];

  if (targetH3Domains.includes(checkedDomain)) {
    const headings = Array.from(document.querySelectorAll('h2, h3'));
    const faqKeywords = ['คำถามที่พบบ่อย', 'faq', 'q&a', 'สรุป', 'บทความที่เกี่ยวข้อง'];
    const allImgs = Array.from(document.querySelectorAll('img'));

    // 1. Find the FAQ limit
    let faqLimitNode = null;
    for (const h of headings) {
      if (h.tagName === 'H2') {
        const text = h.innerText.toLowerCase();
        if (faqKeywords.some(kw => text.includes(kw))) {
          faqLimitNode = h;
          break;
        }
      }
    }

    const h3s = headings.filter(h => h.tagName === 'H3');
    const h3Analyzed = [];

    h3s.forEach((h3, idx) => {
      // Skip if it's excluded or inside TOC
      if (isExcluded(h3) || (container && container.contains(h3))) return;

      // Only check H3s that appear BEFORE the FAQ limit (if limit exists)
      if (faqLimitNode) {
        const position = h3.compareDocumentPosition(faqLimitNode);
        if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) return;
      }

      // Find the next boundary (next H2 or H3)
      const myIdx = headings.indexOf(h3);
      const nextBoundary = headings[myIdx + 1];

      // Check for image and ALT match
      let foundImg = null;
      for (const img of allImgs) {
        const isAfter = (h3.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING);
        const isBefore = nextBoundary ? (img.compareDocumentPosition(nextBoundary) & Node.DOCUMENT_POSITION_FOLLOWING) : true;

        if (isAfter && isBefore && !isExcluded(img)) {
          // EXCLUDE BANNERS & LOGOS from being considered as the "Clinic Image"
          const alt = (img.getAttribute('alt') || '').toLowerCase();
          const src = (img.getAttribute('src') || '').toLowerCase();
          const cls = (img.className || '').toLowerCase();

          const aTag = img.closest('a');
          const href = aTag ? (aTag.getAttribute('href') || '').toLowerCase() : '';

          const bannerKeywords = [
            'แบนเนอร์', 'โปรโมชัน', 'โปรโมชั่น', 'banner', 'promotion', 'promo',
            'cta', 'btn', 'button', 'คลิก', 'จอง', 'ปรึกษา', 'ราคา',
            'line.me', 'lin.ee', 'facebook.com', 'm.me', 'bit.ly'
          ];
          const isBanner = bannerKeywords.some(kw => alt.includes(kw) || src.includes(kw) || cls.includes(kw) || href.includes(kw));
          const isLogo = alt.includes('logo') || src.includes('logo') || cls.includes('logo');

          // Only accept it as the main image if it's not a banner/logo
          if (!isBanner && !isLogo) {
            foundImg = img;
            break; // Stop at the first valid image found
          }
        }
      }

      h3Analyzed.push({ h3, foundImg, idx });
    });

    // SMART LOGIC: Only warn about missing images if it's a listicle pattern or explicit clinic
    const totalValidH3s = h3Analyzed.length;
    const h3sWithImages = h3Analyzed.filter(d => d.foundImg).length;
    const isImagePatternArticle = h3sWithImages >= 2 || (totalValidH3s > 0 && h3sWithImages / totalValidH3s >= 0.3);

    h3Analyzed.forEach(d => {
      const { h3, foundImg, idx } = d;
      const h3Text = h3.innerText.trim();

      if (!foundImg) {
        const startsWithNumber = /^\d+\.\s*/.test(h3Text);
        const hasClinicKeyword = /(คลินิก|clinic|ศูนย์|โรงพยาบาล)/i.test(h3Text);
        const isLikelyClinic = startsWithNumber || hasClinicKeyword;

        // Apply smart logic only to specific domains
        const targetSmartDomains = ['bestbrandclinic.com', 'monghaclinic.com'];
        let shouldWarn = false;

        if (targetSmartDomains.includes(checkedDomain)) {
          // Smart behavior: warn only if pattern matches or it's a clinic
          shouldWarn = isImagePatternArticle || isLikelyClinic;
        } else {
          // Original behavior: always warn if missing
          shouldWarn = true;
        }

        if (shouldWarn) {
          if (!h3.id) h3.id = 'h3-img-err-' + idx;
          h3ImageResults.push({
            type: 'h3-img',
            id: h3.id,
            ok: false,
            text: h3Text || 'H3 Heading',
            errorMessage: targetSmartDomains.includes(checkedDomain) ? 'ไม่พบรูปภาพประกอบภายใต้หัวข้อ H3 (หัวข้ออื่นมีรูป/หรือเป็นชื่อคลินิก)' : 'ไม่พบรูปภาพประกอบภายใต้หัวข้อ H3 นี้ (ตรวจจนถึงส่วน FAQ/สรุป)'
          });
        }
      } else if (checkedDomain === 'bestbrandclinic.com') {
        // Only trigger Alt Check for bestbrandclinic.com
        const h3Text = h3.innerText.trim();
        const cleanH3 = h3Text.replace(/^\d+\.\s*/, "").toLowerCase().replace(/\s+/g, ' ');
        const imgAlt = (foundImg.getAttribute('alt') || '');
        const cleanImgAlt = imgAlt.toLowerCase().replace(/\s+/g, ' ');

        // 1. Remove common filler phrases from H3 to isolate the "Core Clinic Name"
        const fillers = [
          'ฉีดโบท็อกผู้ชาย', 'โบท็อกผู้ชาย', 'ฉีดโบท็อกซ์', 'ฉีดโบท็อก', 'โบท็อกซ์', 'โบท็อก',
          'ฉีดฟิลเลอร์ใต้ตา', 'ฟิลเลอร์ใต้ตา', 'ฉีดฟิลเลอร์ปาก', 'ฟิลเลอร์ปาก', 'ฉีดฟิลเลอร์', 'ฟิลเลอร์',
          'ร้อยไหมหน้าเรียว', 'ร้อยไหมจมูก', 'ร้อยไหม',
          'เมโสหน้าใส', 'เมโสแฟต', 'ฉีดเมโส', 'เมโส',
          'ไฮฟู่', 'hifu', 'ulthera', 'thermage', 'อัลเทอร่า', 'เทอร์มาจ',
          'เลเซอร์หน้าใส', 'เลเซอร์ขน', 'ทำเลเซอร์', 'เลเซอร์', 'pico laser', 'pico plus', 'picosure pro', 'discovery pico', 'fotona', 'sylfirm x plus', 'bellalux lite', 'pico',
          'โปรแกรม', 'ที่ไหนดี', 'ที่ไหน', 'ดีไหม', 'รีวิว', 'แนะนำ', 'ล่าสุด', 'ราคา', 'ปี', '2023', '2024', '2025', '2026'
        ];

        let coreName = cleanH3;
        // Drop any branch mentions (สาขา...) to focus on the main brand
        coreName = coreName.replace(/\s*สาขา.*$/, '');

        // Remove filler words
        fillers.forEach(word => {
          coreName = coreName.split(word).join(' ');
        });

        // Remove standalone generic words safely
        coreName = coreName.split('คลินิก').join(' ');
        coreName = coreName.replace(/\bclinic\b/gi, ' ');
        coreName = coreName.split(' ที่ ').join(' ');
        if (coreName.startsWith('ที่ ')) coreName = coreName.substring(2);

        coreName = coreName.replace(/\s+/g, ' ').trim();

        let isMatch = false;
        if (coreName.length >= 2 && cleanImgAlt.includes(coreName)) {
          isMatch = true;
        } else if (cleanH3.length > 0 && cleanImgAlt.includes(cleanH3)) {
          isMatch = true;
        } else {
          // Fallback word overlap: check if any significant English words in H3 appears in Alt
          const engWordsInH3 = cleanH3.match(/[a-z0-9]+/g) || [];
          const engWordsInAlt = cleanImgAlt.match(/[a-z0-9]+/g) || [];
          const sharedEng = engWordsInH3.filter(w => engWordsInAlt.includes(w) && w.length > 2);

          if (sharedEng.length > 0) {
            isMatch = true;
          } else {
            // Try matching without spaces (handles "v square" vs "vsquare")
            const coreNoSpace = coreName.replace(/\s+/g, '');
            const altNoSpace = cleanImgAlt.replace(/\s+/g, '');
            if (coreNoSpace.length >= 3 && altNoSpace.includes(coreNoSpace)) {
              isMatch = true;
            }
          }
        }

        if (!isMatch && coreName.length > 0) {
          if (!h3.id) h3.id = 'h3-alt-err-' + idx;
          h3AltResults.push({
            type: 'h3-alt',
            id: h3.id,
            ok: false,
            clinicName: coreName || cleanH3,
            text: h3Text,
            errorMessage: `Alt ของรูปภาพไม่ตรงกับชื่อคลินิก (คาดหวังส่วนประกอบสำคัญ: "${coreName}")`
          });
        }
      }
    });
  }

  // 20. PHONE NUMBER LINK CHECK
  const phoneResults = [];
  const allLinksForPhone = Array.from(document.querySelectorAll('a'));
  allLinksForPhone.forEach((link, idx) => {
    if (isExcluded(link) || (container && container.contains(link))) return;

    const href = link.getAttribute('href') || '';
    let isPhone = false;
    let rawStr = '';

    if (href.startsWith('tel:')) {
      isPhone = true;
      rawStr = href.replace('tel:', '');
    } else if (/^(https?:\/\/)?0\d{1,2}[\-\s]?\d{3}[\-\s]?\d{4}$/.test(href)) {
      isPhone = true;
      rawStr = href.replace(/^(https?:\/\/)/, '');
    } else if (/^0\d{1,2}[\-\s]?\d{3}[\-\s]?\d{4}$/.test((link.innerText || '').trim()) && !href.startsWith('http') && href !== '#') {
      isPhone = true;
      rawStr = href;
    }

    if (isPhone) {
      const cleanNumber = rawStr.replace(/[^\d+]/g, '');
      if (!cleanNumber) return;

      let errors = [];
      if (!href.startsWith('tel:')) {
        errors.push(`ควรใช้ href="tel:${cleanNumber}"`);
      } else if (href !== `tel:${cleanNumber}`) {
        errors.push('href ห้ามมีขีดหรือเว้นวรรค (ต้องมีแค่ตัวเลข)');
      }

      if (link.getAttribute('type') !== 'tel') {
        errors.push('ลืม type="tel"');
      }

      if (link.getAttribute('id') !== `tel:${cleanNumber}`) {
        errors.push(`ลืม id="tel:${cleanNumber}"`);
      }

      if (errors.length > 0) {
        if (!link.id) link.id = 'phone-err-' + idx;
        phoneResults.push({
          type: 'phone-check',
          id: link.id,
          ok: false,
          text: (link.innerText || '').trim() || href,
          errorMessage: errors.join(' / ')
        });
      }
    }
  });

  // 21. MISSING CONTENT CHECK (BLOCK-BY-BLOCK HTML DIFF)
  const missingContentResults = [];
  if (originalContentHtml && originalContentHtml.trim().length > 10) {
    function normalizeReadableText(text) {
      return (text || '')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function cleanTextForDiff(text) {
      const normalized = normalizeReadableText(text);
      if (!normalized) return '';
      return normalized.replace(/[\s\u200B-\u200D\uFEFF\u00A0\u00AD"“'”\(\)\[\]{}.,:;!?\-*#\/\\_|+–—]/g, '')
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
        .toLowerCase();
    }

    const compareCore = window.HtmlCompareCore;
    const contentRootSelector = '.entry-content, .blog-wrapper, .cs-site-content, .post-content, .content, .single-content, .elementor-widget-theme-post-content';
    const articleRootSelector = `${contentRootSelector}, article, main, #main, #primary, .content-area, .site-main, .site-content, .single-post, .single, .post, .hentry`;

    function findCommonAncestor(leftNode, rightNode) {
      if (!leftNode || !rightNode) return null;
      const ancestors = new Set();
      let current = leftNode;
      while (current) {
        ancestors.add(current);
        current = current.parentElement;
      }
      current = rightNode;
      while (current) {
        if (ancestors.has(current)) return current;
        current = current.parentElement;
      }
      return null;
    }

    function pushUniqueRoot(roots, seen, node) {
      if (!node || !node.tagName || seen.has(node)) return;
      seen.add(node);
      roots.push(node);
    }

    function elementDepth(node) {
      let depth = 0;
      let current = node;
      while (current && current !== document.body) {
        depth += 1;
        current = current.parentElement;
      }
      return depth;
    }

    function getPageComparisonRootCandidates() {
      const roots = [];
      const seen = new Set();
      const contentRoot = document.querySelector(contentRootSelector);
      const articleRoot = firstH1 && firstH1.closest ? firstH1.closest(articleRootSelector) : null;
      const genericRoot = document.querySelector('article, main, #main, #primary, .content-area, .site-main, .site-content');

      pushUniqueRoot(roots, seen, contentRoot);
      pushUniqueRoot(roots, seen, articleRoot);
      pushUniqueRoot(roots, seen, genericRoot);

      if (firstH1 && contentRoot) {
        const sharedRoot = findCommonAncestor(firstH1, contentRoot);
        pushUniqueRoot(roots, seen, sharedRoot);
      }

      if (firstH1 && firstH1.parentElement) {
        pushUniqueRoot(roots, seen, firstH1.parentElement);
      }

      pushUniqueRoot(roots, seen, document.body);
      return roots;
    }

    function getPageComparisonRoot() {
      return getPageComparisonRootCandidates()[0] || document.body;
    }

    function countComparisonRows(rows, kind) {
      return rows.reduce((count, row) => count + (row.kind === kind ? 1 : 0), 0);
    }

    function selectBestPageComparison(docBlocks) {
      const roots = getPageComparisonRootCandidates();
      let best = null;

      roots.forEach((root) => {
        const blocks = compareCore.extractBlocksFromRoot(root, {
          startAtFirstH1: true,
          stopAtNoteSeoWriter: true,
          filterEditorMeta: true,
          shouldSkip: shouldSkipPageCompareElement
        }).blocks || [];
        const comparison = compareCore.compareBlockSequences(docBlocks, blocks);
        const firstDoc = docBlocks[0] || null;
        const firstWeb = blocks[0] || null;
        const firstExactMatch = Boolean(firstDoc && firstWeb && compareCore.blockKey(firstDoc) === compareCore.blockKey(firstWeb));
        const firstTextMatch = Boolean(firstDoc && firstWeb && compareCore.textForCompareKey(firstDoc) === compareCore.textForCompareKey(firstWeb));
        const missingCount = countComparisonRows(comparison.rows, 'missing_on_web');
        const extraCount = countComparisonRows(comparison.rows, 'extra_on_web');
        const mismatchCount = countComparisonRows(comparison.rows, 'mismatch') + countComparisonRows(comparison.rows, 'reordered');
        const depth = elementDepth(root);
        const score =
          (firstExactMatch ? 100000 : 0) +
          (firstTextMatch ? 50000 : 0) +
          comparison.matchCount * 1000 -
          missingCount * 120 -
          extraCount * 80 -
          mismatchCount * 40 -
          Math.abs(blocks.length - docBlocks.length) * 10 +
          depth;

        if (!best || score > best.score || (score === best.score && depth > best.depth)) {
          best = { root, blocks, comparison, score, depth };
        }
      });

      if (best) return best;

      const fallbackRoot = getPageComparisonRoot();
      const fallbackBlocks = compareCore.extractBlocksFromRoot(fallbackRoot, {
        startAtFirstH1: true,
        stopAtNoteSeoWriter: true,
        filterEditorMeta: true,
        shouldSkip: shouldSkipPageCompareElement
      }).blocks || [];

      return {
        root: fallbackRoot,
        blocks: fallbackBlocks,
        comparison: compareCore.compareBlockSequences(docBlocks, fallbackBlocks),
        score: 0,
        depth: elementDepth(fallbackRoot)
      };
    }

    function shouldSkipPageCompareElement(el) {
      if (!el || !el.tagName) return true;
      if (isExcluded(el) || (container && container.contains(el))) return true;
      const style = window.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    }

    function blockTypeLabel(block) {
      return compareCore.blockLabel(block) || block.type || '-';
    }

    function blockTypeKey(block) {
      if (!block || !block.type) return '';
      if (block.type === 'heading') return `heading-${block.level || 0}`;
      return block.type;
    }

    function blockText(block) {
      return compareCore.blockFullText(block) || '-';
    }

    function blockKeyText(block) {
      return compareCore.textForCompareKey(block) || '';
    }

    function makeComparisonMessage(docBlock, pageBlock, index, prefixMessage) {
      const issues = [];
      const docType = blockTypeLabel(docBlock);
      const webType = blockTypeLabel(pageBlock);
      const docTypeKey = blockTypeKey(docBlock);
      const webTypeKey = blockTypeKey(pageBlock);
      const docKey = blockKeyText(docBlock);
      const webKey = blockKeyText(pageBlock);

      if (prefixMessage) {
        issues.push(prefixMessage);
      }

      if (docTypeKey !== webTypeKey) {
        issues.push(`ชนิดบล็อกไม่ตรงกัน: DOC=${docType} WEB=${webType}`);
      }

      if (docKey !== webKey) {
        // LOG FOR USER IMPROVEMENT
        comparisonDebugLogs.push({
          type: 'mismatch',
          index: index + 1,
          docType: docTypeKey,
          webType: webTypeKey,
          docKey: docKey,
          webKey: webKey
        });

        console.warn(`[MissingContentCheck] Mismatch at Block ${index + 1}:`, {
          docType: docTypeKey,
          webType: webTypeKey,
          docKey: docKey,
          webKey: webKey,
          docText: blockText(docBlock),
          webText: blockText(pageBlock)
        });

        // SPECIAL CASE: Images. If alts match, ignore filename differences in the composite key.
        const isImageMatch = docBlock && pageBlock && docBlock.type === 'image' && pageBlock.type === 'image';
        let shouldCheckTextDiff = true;
        if (isImageMatch) {
          const docAlt = (docBlock.alt || '').trim();
          const webAlt = (pageBlock.alt || '').trim();
          if (docAlt === webAlt) {
            shouldCheckTextDiff = false;
          }
        }

        if (shouldCheckTextDiff) {
          const docContainsPage = docKey && webKey && docKey.includes(webKey);
          const pageContainsDoc = docKey && webKey && webKey.includes(docKey);

          if (docContainsPage && docKey.length > webKey.length) {
            issues.push('ข้อความบนเว็บไม่ครบเมื่อเทียบกับ HTML DOCS');
          } else if (pageContainsDoc && webKey.length > docKey.length) {
            issues.push('ข้อความบนเว็บมีเกินจาก HTML DOCS');
          } else {
            issues.push('ข้อความไม่ตรงกัน');
          }
        }
      }

      const docAlt = cleanTextForDiff(docBlock && docBlock.alt ? docBlock.alt : '');
      const pageAlt = cleanTextForDiff(pageBlock && pageBlock.alt ? pageBlock.alt : '');
      if ((docBlock && docBlock.type === 'image') || (pageBlock && pageBlock.type === 'image') || docAlt || pageAlt) {
        if (docAlt !== pageAlt) {
          issues.push(`Alt รูปไม่ตรงกัน: DOC="${(docBlock && docBlock.alt) || '-'}" | WEB="${(pageBlock && pageBlock.alt) || '-'}"`);
        }
      }

      if (!issues.length) return null;

      return {
        type: 'missing-content',
        id: `block-${index}`,
        ok: false,
        label: `Block ${index + 1}: ${webType} ↔ ${docType}`,
        webText: blockText(pageBlock),
        docText: blockText(docBlock),
        text: `Block ${index + 1}: ${docType} → ${webType}`,
        errorMessage: issues.join(' | ')
      };
    }

    if (!compareCore || typeof compareCore.extractBlocksFromRoot !== 'function') {
      missingContentResults.push({
        type: 'missing-content',
        id: 'compare-core-missing',
        ok: false,
        text: originalContentFileLabel || 'HTML DOCS',
        errorMessage: 'ไม่สามารถโหลด compare engine สำหรับเทียบข้อความได้'
      });
    } else {
      const doc = new DOMParser().parseFromString(originalContentHtml, 'text/html');
      const docBlocks = compareCore.extractBlocksFromRoot(doc.body, {
        startAtFirstH1: true,
        stopAtNoteSeoWriter: true,
        filterEditorMeta: true
      }).blocks || [];
      const bestPageComparison = selectBestPageComparison(docBlocks);
      const pageBlocks = bestPageComparison.blocks || [];
      const alignment = compareCore.computeAlignment(docBlocks, pageBlocks);
      const comparison = bestPageComparison.comparison || compareCore.compareBlockSequences(docBlocks, pageBlocks);

      alignment.forEach((row) => {
        if (row.type !== 'match') return;
        const issue = makeComparisonMessage(row.docBlock, row.webBlock, row.docIndex, '');
        if (issue) {
          issue.id = `match-${row.docIndex}-${row.webIndex}`;
          issue.label = `Block D${row.docIndex + 1} / W${row.webIndex + 1}: ${blockTypeLabel(row.webBlock)} ↔ ${blockTypeLabel(row.docBlock)}`;
          issue.text = `Match block D${row.docIndex + 1} / W${row.webIndex + 1}`;
          missingContentResults.push(issue);
        }
      });

      comparison.rows.forEach((row, idx) => {
        if (row.kind === 'missing_on_web') {
          comparisonDebugLogs.push({
            type: 'missing',
            index: row.docIndex + 1,
            docType: blockTypeKey(row.docBlock),
            webType: '-',
            docKey: blockKeyText(row.docBlock),
            webKey: '-'
          });
          console.warn(`[MissingContentCheck] Missing Block: D${row.docIndex + 1}`, {
            kind: row.kind,
            docIndex: row.docIndex,
            docBlock: row.docBlock,
            docText: blockText(row.docBlock)
          });
          missingContentResults.push({
            type: 'missing-content',
            id: `doc-only-${row.docIndex}`,
            ok: false,
            label: `Block ${row.docIndex + 1}: HTML DOCS หายไป`,
            webText: '-',
            docText: blockText(row.docBlock),
            text: `DOC block ${row.docIndex + 1}`,
            errorMessage: `บล็อกจากไฟล์ HTML DOCS หายไปบนเว็บที่บล็อก ${row.docIndex + 1}`
          });
          return;
        }

        if (row.kind === 'extra_on_web') {
          comparisonDebugLogs.push({
            type: 'extra',
            index: row.webIndex + 1,
            docType: '-',
            webType: blockTypeKey(row.webBlock),
            docKey: '-',
            webKey: blockKeyText(row.webBlock)
          });
          console.warn(`[MissingContentCheck] Extra Block: W${row.webIndex + 1}`, {
            kind: row.kind,
            webIndex: row.webIndex,
            webBlock: row.webBlock,
            webText: blockText(row.webBlock)
          });
          missingContentResults.push({
            type: 'missing-content',
            id: `web-only-${row.webIndex}`,
            ok: false,
            label: `Block ${row.webIndex + 1}: WEB เกินมา`,
            webText: blockText(row.webBlock),
            docText: '-',
            text: `WEB block ${row.webIndex + 1}`,
            errorMessage: `พบบล็อกบนเว็บเกินไฟล์ HTML DOCS ที่บล็อก ${row.webIndex + 1}`
          });
          return;
        }

        const prefixMessage = row.kind === 'reordered'
          ? `บล็อกสลับลำดับ (DOC ${row.docIndex + 1} ↔ WEB ${row.webIndex + 1})`
          : `ข้อความใกล้เคียงแต่ไม่ตรงกัน (${Math.round((row.score || 0) * 100)}%)`;

        const issue = makeComparisonMessage(row.docBlock, row.webBlock, idx + docBlocks.length, prefixMessage);
        if (issue) {
          issue.id = `${row.kind}-${row.docIndex != null ? row.docIndex : 'x'}-${row.webIndex != null ? row.webIndex : 'x'}`;
          issue.label = `Block D${(row.docIndex || 0) + 1} / W${(row.webIndex || 0) + 1}: ${blockTypeLabel(row.webBlock)} ↔ ${blockTypeLabel(row.docBlock)}`;
          issue.text = `${row.kind} D${(row.docIndex || 0) + 1} / W${(row.webIndex || 0) + 1}`;
          missingContentResults.push(issue);
        }
      });

      if (docBlocks.length === 0) {
        missingContentResults.push({
          type: 'missing-content',
          id: 'doc-empty',
          ok: false,
          text: originalContentFileLabel || 'HTML DOCS',
          errorMessage: 'ไม่พบบล็อก HTML ที่ใช้เทียบในไฟล์ที่อัปโหลด'
        });
      }
    }
  }

  return { tocResults, h2Results, misplacedResults, refResults, colResults, altResults, listResults, splitPResults, typoResults, brResults, captionResults, btnLinkResults, yearResults, knowledgeResults, extLinkResults, doctorAltResults, bannerLinkResults, tocWrapResults, doctorImageResults, h3ImageResults, h3AltResults, phoneResults, missingContentResults, comparisonDebugLogs, usedSelector };
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

/**
 * LINK STATUS CHECKER (REMOVED - MOVED TO BACKGROUND)
 */

/**
 * LINK STATUS CHECKER (REMOVED - MOVED TO BACKGROUND)
 */

