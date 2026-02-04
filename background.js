/**
 * Background script to handle Side Panel behavior
 */

chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Listen for tab updates to ensure the panel works correctly
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (!info.url) return;
    const url = new URL(info.url);
    // Optional: Enable/disable based on URL if needed
});
