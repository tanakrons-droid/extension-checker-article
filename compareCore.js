(function (global) {
  'use strict';

  var BLOCK_TAGS = {
    h1: 'heading',
    h2: 'heading',
    h3: 'heading',
    h4: 'heading',
    h5: 'heading',
    h6: 'heading',
    p: 'paragraph',
    blockquote: 'blockquote',
    figcaption: 'caption',
    ul: 'list',
    ol: 'list',
    table: 'table'
  };

  var SKIP_TAGS = {
    script: true,
    style: true,
    noscript: true,
    template: true,
    iframe: true,
    svg: true,
    canvas: true,
    pre: true,
    code: true
  };

  var NOISE_NODE_SELECTOR = [
    '[hidden]',
    '[aria-hidden="true"]',
    '.screen-reader-text',
    '.sr-only',
    '.visually-hidden',
    '.visuallyhidden',
    '[style*="display:none"]',
    '[style*="display: none"]',
    '[style*="visibility:hidden"]',
    '[style*="visibility: hidden"]'
  ].join(',');

  var SKIP_SUBTREE_SELECTOR = [
    '.vsq-blogs-related-article',
    '.blog-doctorbanner',
    '#dpsp-content-bottom',
    '.dpsp-content-wrapper',
    '[id^="dpsp-"]',
    '.dpsp-networks-btns-wrapper',
    '.sharedaddy',
    '.jp-relatedposts',
    '.ez-toc-container',
    '.rank-math-toc',
    '.lwptoc',
    '.table-of-contents',
    '.toc-container'
  ].join(',');

  var LIST_LCS_SIMILARITY = 0.88;
  var TABLE_LCS_SIMILARITY = 0.98;
  var FUZZY_ROW_SIMILARITY = 0.85;
  var SOFT_ROW_SIMILARITY = 0.55;

  function normalizeText(value) {
    if (value == null) return '';
    return String(value)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[\u200b-\u200d\ufeff\u00a0]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function removeNoiseNodes(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('script,style,noscript,template,iframe,svg,canvas,pre,code').forEach(function (node) {
      node.remove();
    });
    root.querySelectorAll(NOISE_NODE_SELECTOR).forEach(function (node) {
      node.remove();
    });
    var doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.createTreeWalker || typeof NodeFilter === 'undefined') return;
    var walker = doc.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    var comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function looksLikeCodeText(text) {
    if (!text) return false;
    var trimmed = text.trim();
    if (!trimmed) return false;
    if (/<\/?[a-z][^>]*>/i.test(trimmed)) return true;
    if (/(?:class|href|src|style)=["']/i.test(trimmed)) return true;
    if (/\b(?:const|let|var|function|return|document\.|window\.|@media|font-family:)\b/i.test(trimmed)) return true;
    var symbolCount = (trimmed.match(/[{}<>;=]/g) || []).length;
    var charCount = (trimmed.match(/[\p{L}\p{N}]/gu) || []).length;
    return symbolCount >= 6 && symbolCount > charCount * 0.35;
  }

  function shouldSkipSubtree(el) {
    if (!el || !el.closest) return false;
    return Boolean(el.closest(SKIP_SUBTREE_SELECTOR));
  }

  function stripBadges(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('.htr-tag-badge').forEach(function (badge) {
      badge.remove();
    });
    return clone;
  }

  function elementTextForCompare(el) {
    if (!el) return '';
    var clone = stripBadges(el);
    removeNoiseNodes(clone);
    var doc = clone.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (doc) {
      clone.querySelectorAll('a').forEach(function (link) {
        var textNode = doc.createTextNode(link.textContent || '');
        if (link.parentNode) link.parentNode.replaceChild(textNode, link);
      });
    }
    var text = normalizeText(clone.innerText || clone.textContent || '');
    if (!text || looksLikeCodeText(text) || /^note\s+seo\s+writer\b/i.test(text)) return '';
    return text;
  }

  function subtreeTextExcludingMedia(el) {
    if (!el || !el.cloneNode) return '';
    var clone = el.cloneNode(true);
    removeNoiseNodes(clone);
    clone.querySelectorAll('img,picture,source,svg,video,iframe,object,noscript,canvas').forEach(function (node) {
      node.remove();
    });
    for (var pass = 0; pass < 3; pass++) {
      clone.querySelectorAll('a').forEach(function (link) {
        if (!normalizeText(link.textContent || '')) link.remove();
      });
    }
    return normalizeText(clone.innerText || clone.textContent || '');
  }

  function isStandaloneLinkMediaOnly(el) {
    if (!el || !el.tagName || el.tagName.toLowerCase() !== 'a') return false;
    if (!el.getAttribute || !el.getAttribute('href')) return false;
    return !subtreeTextExcludingMedia(el);
  }

  function looksLikeRawHtmlBlockText(text) {
    if (!text || typeof text !== 'string') return false;
    var trimmed = text.trim();
    if (trimmed.length < 8) return false;
    if (trimmed.charCodeAt(0) !== 60) return false;
    return /<\s*(figure|picture|img|svg|iframe|video|source)\b/i.test(trimmed);
  }

  function parseEditorHeadingPrefix(text) {
    var normalized = normalizeText(text || '');
    var match = /^(?:header\s+tag\s+([1-6])|h([1-6]))(?=\s*[:：]|\s|$)\s*[:：]?\s*([\s\S]*)$/i.exec(normalized);
    if (!match) return null;
    return {
      level: parseInt(match[1] || match[2], 10),
      text: normalizeText(match[3] || '')
    };
  }

  function stripLeadingEditorHeadingTag(text) {
    var normalized = normalizeText(text || '');
    var headingInfo = parseEditorHeadingPrefix(normalized);
    if (headingInfo) return headingInfo.text;
    return normalizeText(normalized);
  }

  function applyCompareKeyWhitespaceAndPunctuation(text) {
    if (!text) return '';
    text = text.replace(/\u00a0/g, ' ');
    text = text.replace(/\u2007|\u202f/g, ' ');
    text = text.replace(/[？]/g, '?');
    text = text.replace(/[：]/g, ':');
    text = text.replace(/\u2013|\u2014|\u2212/g, '-');
    text = text.replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb]/g, '"');
    text = text.replace(/[\u2018\u2019]/g, "'");
    return normalizeText(text);
  }

  function normalizeLeadColonLabelForCompareKey(text) {
    if (!text) return text;
    var match = /^([^:]+)\s*:\s*/.exec(text);
    if (!match) return text;
    var label = match[1].trim().replace(/\s+/g, ' ');
    if (!label) return text;
    if (/^https?$/i.test(label) && /^https?:\/\//i.test(text)) return text;
    return label + ' : ' + text.slice(match[0].length);
  }

  function stripOuterWrappingDoubleQuotesForCompareKey(text) {
    if (!text || typeof text !== 'string') return text;
    var normalized = text.trim();
    if (normalized.length < 2) return text;
    var first = normalized.charAt(0);
    var last = normalized.charAt(normalized.length - 1);
    var open = first === '"' || first === '\u201c';
    var close = last === '"' || last === '\u201d';
    if (open && close) return normalizeText(normalized.slice(1, -1));
    return text;
  }

  function normalizeBodyTextForCompareKey(text) {
    if (!text) return '';
    let t = text || '';
    // Call existing helpers to strip "H1 :", "H2 :", "Alt :" etc.
    t = stripLeadingEditorHeadingTag(normalizeText(t));
    t = normalizeLeadColonLabelForCompareKey(t);
    t = stripOuterWrappingDoubleQuotesForCompareKey(t);
    
    t = t.toLowerCase();
    // Strip HTML tags for clean text comparison
    t = t.replace(/<[^>]+>/g, ' ');
    // Strip editorial markers like [a], [b], [1], [2] commonly found in Doc manuscripts
    t = t.replace(/\[[a-z0-9]\]/gi, '');
    // Remove non-alphanumeric/thai characters
    t = t.replace(/[^a-z0-9ก-ฮะ-์]/gi, ' ');
    // Handle &nbsp; and other heavy whitespace
    t = t.replace(/\u00A0/g, ' ');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  }

  function normalizeTableTextForCompareKey(text) {
    var normalized = normalizeText(text || '');
    normalized = applyCompareKeyWhitespaceAndPunctuation(normalized);
    if (!normalized) return '';
    normalized = normalizeText(normalized);
    normalized = stripOuterWrappingDoubleQuotesForCompareKey(normalized);
    return normalizeText(normalized);
  }

  function normalizeListItemForCompareKey(text) {
    return applyCompareKeyWhitespaceAndPunctuation(stripLeadingEditorHeadingTag(normalizeText(text || '')));
  }

  function createImageBlock(img, sourceTag) {
    if (!img) return null;
    var alt = normalizeText(img.getAttribute('alt') || '');
    var src = (img.getAttribute('src') || '').trim();
    if (!alt && !src) return null;
    return {
      type: 'image',
      text: '',
      alt: alt,
      src: src,
      sourceTag: sourceTag || 'img'
    };
  }

  function convertTextBlock(tag, kind, text) {
    if (!text) return null;
    var headingInfo = parseEditorHeadingPrefix(text);
    if (headingInfo) {
      if (!headingInfo.text) return null;
      return {
        type: 'heading',
        level: headingInfo.level,
        text: headingInfo.text,
        sourceTag: tag
      };
    }
    if (kind === 'heading') {
      return {
        type: 'heading',
        level: parseInt(tag.charAt(1), 10),
        text: text,
        sourceTag: tag
      };
    }
    if (kind === 'caption') {
      return {
        type: 'paragraph',
        text: text,
        fromCaption: true,
        sourceTag: tag
      };
    }
    if (kind === 'list-item') {
      return {
        type: 'list-item',
        text: text,
        sourceTag: tag
      };
    }
    return {
      type: (kind === 'blockquote' || kind === 'list-item') ? kind : 'paragraph',
      text: text,
      sourceTag: tag
    };
  }

  function isMainHeadingAnchorBlock(block) {
    if (!block) return false;
    // Prioritize actual H1 or H2 tag (Style Heading 1 or 2)
    if (block.type === 'heading' && (block.level === 1 || block.level === 2)) {
      if (block.sourceTag === 'h1' || block.sourceTag === 'h2') return true;
    }

    // If it is a paragraph, the user wants us to ignore it as an anchor
    if (block.sourceTag === 'p') return false;

    // Fallback logic for cases where H1/H2 markers were used in other tags (non-paragraph)
    var text = normalizeText(block.text || '');
    var headingInfo = parseEditorHeadingPrefix(text);
    if (headingInfo && (headingInfo.level === 1 || headingInfo.level === 2)) return true;

    if (/^h[12]\s*[:：]/i.test(text)) return true;
    if (/^h[12]\s+./i.test(text)) return true;
    if (/^h[12]\s*$/i.test(text)) return true;

    return false;
  }

  function isNoteSeoWriterAnchorBlock(block) {
    if (!block) return false;
    if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'list-item') return false;
    return /^note\s+seo\s+writer\b/i.test(normalizeText(block.text || ''));
  }

  function isHeadingMetaBlock(block) {
    if (!block) return false;
    if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'list-item') return false;
    var text = normalizeText(block.text || '');
    var headingInfo = parseEditorHeadingPrefix(text);
    if (headingInfo && (headingInfo.level === 1 || headingInfo.level === 2) && !headingInfo.text) return true;
    return /^h[12]\s*[:：]?\s*$/i.test(text);
  }

  function parseAltMetaText(blockOrText) {
    var text = typeof blockOrText === 'string'
      ? normalizeText(blockOrText)
      : normalizeText(blockOrText && blockOrText.text ? blockOrText.text : '');
    var match = /^alt\s*[:：]\s*([\s\S]*)$/i.exec(text);
    if (!match) return null;
    return normalizeText(match[1] || '');
  }

  function isAltMetaBlock(block) {
    if (!block) return false;
    if (block.type !== 'heading' && block.type !== 'paragraph' && block.type !== 'list-item') return false;
    return parseAltMetaText(block) !== null;
  }

  function isHttpsUrlParagraph(block) {
    if (!block || (block.type !== 'paragraph' && block.type !== 'list-item')) return false;
    return /^https:/i.test(normalizeText(block.text || ''));
  }

  function trimBlocksBeforeMainH1(blocks, elements) {
    if (!blocks || !blocks.length) return { blocks: blocks || [], elements: elements || [] };
    var els = elements || [];
    for (var i = 0; i < blocks.length; i++) {
      if (isMainHeadingAnchorBlock(blocks[i])) {
        if (els.length === blocks.length) return { blocks: blocks.slice(i), elements: els.slice(i) };
        return { blocks: blocks.slice(i), elements: [] };
      }
    }
    return { blocks: blocks, elements: els };
  }

  function trimBlocksBeforeNoteSeoWriter(blocks, elements) {
    if (!blocks || !blocks.length) return { blocks: blocks || [], elements: elements || [] };
    var els = elements || [];
    for (var i = 0; i < blocks.length; i++) {
      if (isNoteSeoWriterAnchorBlock(blocks[i])) {
        if (els.length === blocks.length) return { blocks: blocks.slice(0, i), elements: els.slice(0, i) };
        return { blocks: blocks.slice(0, i), elements: [] };
      }
    }
    return { blocks: blocks, elements: els };
  }

  function applyAltMetaToImages(blocks, elements) {
    if (!blocks || !blocks.length) return { blocks: blocks || [], elements: elements || [] };
    var els = elements || [];
    var keptBlocks = [];
    var keptElements = [];
    var lastImageIndex = -1;
    var gapCount = 0;

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var altText = parseAltMetaText(block);
      if (altText !== null) {
        if (lastImageIndex >= 0) {
          keptBlocks[lastImageIndex] = Object.assign({}, keptBlocks[lastImageIndex], {
            alt: altText,
            altFromMeta: true
          });
          continue;
        } else {
          // Fallback: Create a virtual image block if an 'Alt :' marker is found without an image
          var virtualImg = {
            type: 'image',
            text: '',
            alt: altText,
            sourceTag: block.sourceTag,
            isVirtual: true
          };
          keptBlocks.push(virtualImg);
          if (els.length === blocks.length) keptElements.push(els[i]);
          lastImageIndex = keptBlocks.length - 1;
          gapCount = 0;
          continue;
        }
      }

      keptBlocks.push(block);
      if (els.length === blocks.length) keptElements.push(els[i]);

      if (block.type === 'image') {
        lastImageIndex = keptBlocks.length - 1;
        gapCount = 0;
      } else if (block.type === 'paragraph' && block.fromCaption) {
        // Keep the image anchor alive across captions
      } else {
        // Allow a small gap (up to 3 blocks) between an image and its alt text marker
        gapCount++;
        if (gapCount > 3) {
          lastImageIndex = -1;
        }
      }
    }
    return { blocks: keptBlocks, elements: keptElements };
  }

  function filterEditorMetaBlocks(blocks, elements) {
    if (!blocks || !blocks.length) return { blocks: [], elements: [] };
    var els = elements || [];
    var keptBlocks = [];
    var keptElements = [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (isHeadingMetaBlock(block) || isAltMetaBlock(block) || isHttpsUrlParagraph(block)) continue;
      keptBlocks.push(block);
      if (els.length === blocks.length) keptElements.push(els[i]);
    }
    return { blocks: keptBlocks, elements: keptElements };
  }

  function filterRawHtmlNoiseBlocks(blocks, elements) {
    var keptBlocks = [];
    var keptElements = [];
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var text = block.type === 'list' ? (block.items || []).join('\n') : (block.text || '');
      if (looksLikeRawHtmlBlockText(text)) continue;
      keptBlocks.push(block);
      if ((elements || []).length === blocks.length) keptElements.push(elements[i]);
    }
    return { blocks: keptBlocks, elements: keptElements };
  }

  function extractBlocksFromRoot(root, options) {
    options = options || {};
    var blocks = [];
    var elements = [];

    function pushBlock(block, el) {
      if (!block) return;
      blocks.push(block);
      elements.push(el);
    }

    function shouldSkip(el) {
      if (!el || !el.tagName) return true;
      var tag = el.tagName.toLowerCase();
      if (SKIP_TAGS[tag]) return true;
      if (shouldSkipSubtree(el)) return true;
      if (options.shouldSkipSubtree && options.shouldSkipSubtree(el)) return true;
      if (options.shouldSkip && options.shouldSkip(el)) return true;
      return false;
    }

    function walk(node) {
      if (!node || !node.children) return;
      Array.from(node.children).forEach(function (el) {
        if (shouldSkip(el)) return;

        var tag = el.tagName.toLowerCase();
        var kind = BLOCK_TAGS[tag];

        if (tag === 'a' && isStandaloneLinkMediaOnly(el)) return;

        if (tag === 'figure') {
          var image = el.querySelector('img');
          var captionEl = el.querySelector('figcaption');
          var imageBlock = createImageBlock(image, 'figure');
          var captionText = captionEl ? elementTextForCompare(captionEl) : '';

          if (imageBlock) pushBlock(imageBlock, el);
          if (captionText) {
            pushBlock(convertTextBlock('figcaption', 'caption', captionText), captionEl || el);
          } else if (!imageBlock) {
            pushBlock(convertTextBlock('figure', 'paragraph', elementTextForCompare(el)), el);
          }
          return;
        }

        if (kind === 'list') {
          var children = Array.from(el.children);
          children.forEach(function (child) {
            if (child.tagName && child.tagName.toLowerCase() === 'li') {
              var liText = elementTextForCompare(child);
              if (liText) {
                pushBlock({
                  type: 'list-item',
                  text: liText,
                  ordered: tag === 'ol',
                  sourceTag: 'li'
                }, child);
              }
            }
          });
          return;
        }

        if (kind === 'table') {
          var tableText = elementTextForCompare(el);
          if (tableText) {
            pushBlock({
              type: 'table',
              text: tableText,
              sourceTag: tag
            }, el);
          }
          return;
        }

        if (kind) {
          // Split by <br> tags to handle multi-line paragraphs/headings
          const html = el.innerHTML;
          if (html.toLowerCase().includes('<br')) {
            const lines = html.split(/<br\s*\/?>/i);
            lines.forEach(line => {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = line;
              const text = elementTextForCompare(tempDiv);
              if (text) {
                pushBlock(convertTextBlock(tag, kind, text), el);
              }
            });
          } else {
            pushBlock(convertTextBlock(tag, kind, elementTextForCompare(el)), el);
          }
          return;
        }

        if (tag === 'img') {
          pushBlock(createImageBlock(el, 'img'), el);
          return;
        }

        if (tag === 'a') {
          var href = el.getAttribute && el.getAttribute('href');
          var linkText = elementTextForCompare(el);
          if (href && normalizeText(linkText)) {
            pushBlock({
              type: 'paragraph',
              text: linkText,
              fromStandaloneLink: true,
              sourceTag: tag
            }, el);
            return;
          }
        }

        walk(el);
      });
    }

    walk(root);

    var filtered = filterRawHtmlNoiseBlocks(blocks, elements);
    if (options.startAtFirstH1) filtered = trimBlocksBeforeMainH1(filtered.blocks, filtered.elements);
    if (options.stopAtNoteSeoWriter) filtered = trimBlocksBeforeNoteSeoWriter(filtered.blocks, filtered.elements);
    filtered = applyAltMetaToImages(filtered.blocks, filtered.elements);
    if (options.filterEditorMeta !== false) filtered = filterEditorMetaBlocks(filtered.blocks, filtered.elements);
    return filtered;
  }

  function srcFileName(src) {
    if (!src) return '';
    var clean = String(src).split('#')[0].split('?')[0];
    var parts = clean.split('/');
    return normalizeText(parts[parts.length - 1] || '');
  }

  function blockTextForCompare(block) {
    if (!block) return '';
    if (block.type === 'list') return (block.items || []).join('\n');
    if (block.type === 'image') {
      const alt = (block.alt || '').trim();
      const filename = srcFileName(block.src || '');
      // If we have an ALT, it's the primary identifier.
      // Filename is only appended as a secondary specific if Alt is empty,
      // to allow matching Doc (Virtual Alt) with Web (Alt + Real URL).
      if (alt) return normalizeText(alt);
      return normalizeText(filename);
    }
    return normalizeText(block.text || '');
  }

  function textForCompareKey(block) {
    if (!block) return '';
    if (block.type === 'list') {
      return (block.items || [])
        .map(function (item) {
          return normalizeListItemForCompareKey(item);
        })
        .filter(function (item) {
          return item.length > 0;
        })
        .join('\n');
    }
    if (block.type === 'list-item') return normalizeListItemForCompareKey(block.text || '');
    if (block.type === 'table') return normalizeTableTextForCompareKey(blockTextForCompare(block));
    if (block.type === 'image') return normalizeBodyTextForCompareKey(blockTextForCompare(block));
    return normalizeBodyTextForCompareKey(blockTextForCompare(block));
  }

  function blockKey(block) {
    var text = textForCompareKey(block);
    if (block.type === 'list') return 'list:' + (block.ordered ? 'ol' : 'ul') + ':' + text;
    if (block.type === 'list-item') return (block.ordered ? 'oli:' : 'li:') + text;
    if (block.type === 'heading') return 'h' + (block.level || 1) + ':' + text;
    if (block.type === 'blockquote') return 'blockquote:' + text;
    if (block.type === 'table') return 'table:' + text;
    if (block.type === 'image') return 'image:' + text;
    return 'p:' + text;
  }

  function imageSourceKey(block) {
    return srcFileName(block && block.src ? block.src : '');
  }

  function imageAltKey(block) {
    return normalizeBodyTextForCompareKey(block && block.alt ? block.alt : '');
  }

  function joinNormalizedListItems(block) {
    return (block.items || [])
      .map(function (item) {
        return normalizeListItemForCompareKey(item);
      })
      .filter(function (item) {
        return item.length > 0;
      })
      .join('\n');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var la = a.length;
    var lb = b.length;
    if (la === 0) return lb;
    if (lb === 0) return la;
    if (Math.abs(la - lb) > Math.max(la, lb) * 0.5) return Math.max(la, lb);
    var prev = new Array(lb + 1);
    var cur = new Array(lb + 1);
    for (var j = 0; j <= lb; j++) prev[j] = j;
    for (var i = 1; i <= la; i++) {
      cur[0] = i;
      var ca = a.charCodeAt(i - 1);
      for (j = 1; j <= lb; j++) {
        var cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      var temp = prev;
      prev = cur;
      cur = temp;
    }
    return prev[lb];
  }

  function stringSimilarity(a, b) {
    var left = normalizeText(a);
    var right = normalizeText(b);
    if (!left && !right) return 1;
    if (!left || !right) return 0;
    if (left === right) return 1;
    var dist = levenshtein(left, right);
    var maxLen = Math.max(left.length, right.length);
    return maxLen === 0 ? 1 : 1 - dist / maxLen;
  }

  function listBlockSimilarityForLcs(docBlock, webBlock) {
    return stringSimilarity(joinNormalizedListItems(docBlock), joinNormalizedListItems(webBlock));
  }

  function tableBlockSimilarityForLcs(docBlock, webBlock) {
    return stringSimilarity(normalizeTableTextForCompareKey(blockTextForCompare(docBlock)), normalizeTableTextForCompareKey(blockTextForCompare(webBlock)));
  }

  function blockSimilarity(left, right) {
    if (left && right && left.type === 'image' && right.type === 'image') {
      var altScore = stringSimilarity(imageAltKey(left), imageAltKey(right));
      var srcScore = stringSimilarity(imageSourceKey(left), imageSourceKey(right));
      return Math.max(altScore, srcScore);
    }
    return stringSimilarity(textForCompareKey(left), textForCompareKey(right));
  }

  function canFuzzyPairBlocks(left, right) {
    if (!left || !right) return false;
    if (left.type === right.type) return true;
    if (left.type === 'heading' && right.type === 'heading') return true;
    if (left.type === 'paragraph' && right.type === 'blockquote') return true;
    if (left.type === 'blockquote' && right.type === 'paragraph') return true;
    return false;
  }

  function isStructuralExcluded(el) {
    if (!el) return true;
    // H1 and H2 are almost always part of the content we want,
    // even if the theme places them in a <header> or <aside>.
    if (el.tagName === 'H1' || el.tagName === 'H2') return false;

    if (el.closest('#wpadminbar') || el.closest('.toc-checker-style')) return true;
    if (el.closest('header, nav, footer, aside, .footer, .menu, .pdpa-hide, .sidebar, .widget-area')) return true;
    if (el.closest('.chat-now-footer, .vsq-blogs-related-article, .dpsp-content-wrapper, .dpsp-networks-btns-wrapper, .sharedaddy, .jp-relatedposts')) return true;
    return false;
  }

  function headingsMatchByTextIgnoringLevel(left, right) {
    if (!left || !right) return false;
    if (left.type !== 'heading' || right.type !== 'heading') return false;
    return textForCompareKey(left) === textForCompareKey(right);
  }

  function paragraphBlockquoteMatch(left, right) {
    if (!left || !right) return false;
    if (left.type === 'paragraph' && right.type === 'blockquote') return textForCompareKey(left) === textForCompareKey(right);
    if (left.type === 'blockquote' && right.type === 'paragraph') return textForCompareKey(left) === textForCompareKey(right);
    return false;
  }

  function isStandaloneLinkParagraph(block) {
    return Boolean(block && block.type === 'paragraph' && block.fromStandaloneLink);
  }

  function tableAndStandaloneLinkMatch(left, right) {
    if (!left || !right) return false;
    if (left.type === 'table' && isStandaloneLinkParagraph(right)) return textForCompareKey(left) === textForCompareKey(right);
    if (right.type === 'table' && isStandaloneLinkParagraph(left)) return textForCompareKey(left) === textForCompareKey(right);
    return false;
  }

  function blocksMatchForLcs(docBlocks, webBlocks, docIndex, webIndex) {
    var docBlock = docBlocks[docIndex];
    var webBlock = webBlocks[webIndex];
    if (docBlock.type === 'list' && webBlock.type === 'list') {
      if (blockKey(docBlock) === blockKey(webBlock)) return true;
      return listBlockSimilarityForLcs(docBlock, webBlock) >= LIST_LCS_SIMILARITY;
    }
    if (docBlock.type === 'list-item' && webBlock.type === 'list-item') {
      if (blockKey(docBlock) === blockKey(webBlock)) return true;
      return stringSimilarity(textForCompareKey(docBlock), textForCompareKey(webBlock)) >= LIST_LCS_SIMILARITY;
    }
    if (docBlock.type === 'table' && webBlock.type === 'table') {
      if (blockKey(docBlock) === blockKey(webBlock)) return true;
      return tableBlockSimilarityForLcs(docBlock, webBlock) >= TABLE_LCS_SIMILARITY;
    }
    if (docBlock.type === 'image' && webBlock.type === 'image') {
      if (blockKey(docBlock) === blockKey(webBlock)) return true;
      if (imageSourceKey(docBlock) && imageSourceKey(docBlock) === imageSourceKey(webBlock)) return true;
      if (imageAltKey(docBlock) && imageAltKey(docBlock) === imageAltKey(webBlock)) return true;
    }
    if (blockKey(docBlock) === blockKey(webBlock)) return true;
    if (headingsMatchByTextIgnoringLevel(docBlock, webBlock)) return true;
    if (paragraphBlockquoteMatch(docBlock, webBlock)) return true;
    return tableAndStandaloneLinkMatch(docBlock, webBlock);
  }

  function lcsDiffBlocks(docBlocks, webBlocks) {
    var n = docBlocks.length;
    var m = webBlocks.length;
    var dp = [];
    for (var i = 0; i <= n; i++) {
      dp[i] = new Array(m + 1);
      for (var j = 0; j <= m; j++) dp[i][j] = 0;
    }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        if (blocksMatchForLcs(docBlocks, webBlocks, i - 1, j - 1)) {
          dp[i][j] = Math.max(dp[i - 1][j - 1] + 1, dp[i - 1][j], dp[i][j - 1]);
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    var ops = [];
    i = n;
    j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && blocksMatchForLcs(docBlocks, webBlocks, i - 1, j - 1) && dp[i][j] === dp[i - 1][j - 1] + 1) {
        ops.unshift({ op: 'match', di: i - 1, wj: j - 1 });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] > dp[i - 1][j])) {
        ops.unshift({ op: 'insert', wj: j - 1 });
        j--;
      } else if (i > 0) {
        ops.unshift({ op: 'delete', di: i - 1 });
        i--;
      } else {
        ops.unshift({ op: 'insert', wj: j - 1 });
        j--;
      }
    }
    return ops;
  }

  function compareBlockSequences(docBlocks, webBlocks) {
    var ops = lcsDiffBlocks(docBlocks, webBlocks);
    var matchedDoc = {};
    var matchedWeb = {};
    for (var k = 0; k < ops.length; k++) {
      if (ops[k].op === 'match') {
        matchedDoc[ops[k].di] = true;
        matchedWeb[ops[k].wj] = true;
      }
    }

    var docUnmatched = [];
    var webUnmatched = [];
    for (k = 0; k < docBlocks.length; k++) if (!matchedDoc[k]) docUnmatched.push(k);
    for (k = 0; k < webBlocks.length; k++) if (!matchedWeb[k]) webUnmatched.push(k);

    var webLeft = {};
    for (k = 0; k < webUnmatched.length; k++) webLeft[webUnmatched[k]] = true;

    var rows = [];
    var reordered = [];

    for (k = 0; k < docUnmatched.length; k++) {
      var docIndex = docUnmatched[k];
      var bestWebIndex = -1;
      var bestScore = 0;
      for (var webKey in webLeft) {
        if (!webLeft.hasOwnProperty(webKey)) continue;
        var candidateWebIndex = parseInt(webKey, 10);
        if (!canFuzzyPairBlocks(docBlocks[docIndex], webBlocks[candidateWebIndex])) continue;
        var score = blockSimilarity(docBlocks[docIndex], webBlocks[candidateWebIndex]);
        if (score > bestScore) {
          bestScore = score;
          bestWebIndex = candidateWebIndex;
        }
      }
      if (bestWebIndex >= 0 && bestScore >= FUZZY_ROW_SIMILARITY) {
        delete webLeft[bestWebIndex];
        reordered.push({ docIndex: docIndex, webIndex: bestWebIndex, score: bestScore });
        rows.push({
          kind: 'reordered',
          docIndex: docIndex,
          webIndex: bestWebIndex,
          docBlock: docBlocks[docIndex],
          webBlock: webBlocks[bestWebIndex],
          score: bestScore
        });
      } else if (bestWebIndex >= 0 && bestScore >= SOFT_ROW_SIMILARITY) {
        delete webLeft[bestWebIndex];
        rows.push({
          kind: 'mismatch',
          docIndex: docIndex,
          webIndex: bestWebIndex,
          docBlock: docBlocks[docIndex],
          webBlock: webBlocks[bestWebIndex],
          score: bestScore
        });
      } else {
        rows.push({
          kind: 'missing_on_web',
          docIndex: docIndex,
          docBlock: docBlocks[docIndex]
        });
      }
    }

    for (webKey in webLeft) {
      if (!webLeft.hasOwnProperty(webKey)) continue;
      var webIndex = parseInt(webKey, 10);
      rows.push({
        kind: 'extra_on_web',
        webIndex: webIndex,
        webBlock: webBlocks[webIndex]
      });
    }

    var matchCount = 0;
    for (k = 0; k < ops.length; k++) {
      if (ops[k].op === 'match') matchCount++;
    }

    return {
      docCount: docBlocks.length,
      webCount: webBlocks.length,
      matchCount: matchCount,
      rows: rows,
      reorderedCount: reordered.length
    };
  }

  function computeAlignment(docBlocks, webBlocks) {
    var ops = lcsDiffBlocks(docBlocks, webBlocks);
    var out = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.op === 'match') {
        out.push({
          type: 'match',
          docIndex: op.di,
          webIndex: op.wj,
          docBlock: docBlocks[op.di],
          webBlock: webBlocks[op.wj]
        });
      } else if (op.op === 'delete') {
        out.push({
          type: 'doc_only',
          docIndex: op.di,
          docBlock: docBlocks[op.di]
        });
      } else if (op.op === 'insert') {
        out.push({
          type: 'web_only',
          webIndex: op.wj,
          webBlock: webBlocks[op.wj]
        });
      }
    }
    return out;
  }

  function blockLabel(block) {
    if (!block) return '';
    if (block.type === 'heading') return 'H' + block.level;
    if (block.type === 'list') return block.ordered ? 'ลำดับ (OL)' : 'รายการ (UL)';
    if (block.type === 'list-item') return 'รายการย่อย (LI)';
    if (block.type === 'blockquote') return 'อ้างอิง';
    if (block.type === 'table') return 'ตาราง';
    if (block.type === 'image') return 'รูปภาพ';
    if (block.type === 'paragraph' && block.fromCaption) return 'คำอธิบายรูป';
    if (block.type === 'paragraph' && block.fromStandaloneLink) return 'ปุ่ม/ลิงก์';
    return 'ย่อหน้า';
  }

  function blockFullText(block) {
    if (!block) return '';
    if (block.type === 'list') {
      return (block.items || []).map(function (item, index) {
        return (index + 1) + '. ' + item;
      }).join('\n');
    }
    if (block.type === 'image') {
      if (block.alt) return '[ALT] ' + block.alt;
      return srcFileName(block.src || '') || '[ALT] -';
    }
    return block.text || '';
  }

  global.HtmlCompareCore = {
    normalizeText: normalizeText,
    elementTextForCompare: elementTextForCompare,
    extractBlocksFromRoot: extractBlocksFromRoot,
    compareBlockSequences: compareBlockSequences,
    computeAlignment: computeAlignment,
    blockLabel: blockLabel,
    blockFullText: blockFullText,
    blockKey: blockKey,
    textForCompareKey: textForCompareKey,
    blockSimilarity: blockSimilarity,
    trimBlocksBeforeMainH1: trimBlocksBeforeMainH1,
    trimBlocksBeforeNoteSeoWriter: trimBlocksBeforeNoteSeoWriter,
    filterEditorMetaBlocks: filterEditorMetaBlocks,
    isMainH1AnchorBlock: isMainHeadingAnchorBlock,
    isNoteSeoWriterAnchorBlock: isNoteSeoWriterAnchorBlock,
    srcFileName: srcFileName
  };
})(window);
