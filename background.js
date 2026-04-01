/**
 * Background script to handle Side Panel behavior
 */

chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Listen for tab updates to ensure the panel works correctly
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!info.url) return;
});

// UPGRADE: LINK STATUS CHECKER (Bypass CORS via background)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_LINK_CHECK') {
        const run = async () => {
            const tabId = message.tabId;
            if (!tabId) return { total: 0, broken: 0, results: [] };

            const extracted = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => Array.from(document.querySelectorAll('a[href^="http"]')).map(a => ({
                    href: a.href,
                    text: (a.innerText || a.textContent || '').trim() || a.href
                }))
            });

            const allLinks = extracted?.[0]?.result || [];
            const uniqueUrls = [...new Set(allLinks.map(l => l.href))];
            const results = [];
            let broken = 0;

            for (const url of uniqueUrls) {
                try {
                    const response = await fetch(url, { method: 'HEAD' });
                    if (!response.ok) {
                        broken++;
                        results.push({ url, status: response.status });
                    }
                } catch (e) {
                    broken++;
                    results.push({ url, status: 'Connection Error' });
                }
            }

            return { total: uniqueUrls.length, broken, results, allLinks };
        };

        run().then(sendResponse);
        return true;
    }

    if (message.type === 'CHECK_LINKS') {
        const checkAll = async () => {
            let broken = 0;
            const results = [];
            
            for (const url of message.urls) {
                try {
                    const response = await fetch(url, { method: 'HEAD' });
                    if (!response.ok) {
                        broken++;
                        results.push({ url, status: response.status });
                    }
                } catch (e) {
                    broken++;
                    results.push({ url, status: 'Connection Error' });
                }
            }
            return { total: message.urls.length, broken, results };
        };

        checkAll().then(sendResponse);
        return true; // Keep channel open for async
    }
});
