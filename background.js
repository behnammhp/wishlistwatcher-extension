chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "track-link",
    title: "Track this product 🏷️",
    contexts: ["link"]
  });
  chrome.contextMenus.create({
    id: "track-page",
    title: "Track this page 🏷️",
    contexts: ["page"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  chrome.storage.local.set({ pendingUrl: url }, () => {
    chrome.action.openPopup();
  });
});
