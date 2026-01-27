// Track current video to avoid re-checking
let currentVideoId = null;

function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

function getVideoData() {
  return {
    videoId: getVideoId(),
    title: document.querySelector('h1.ytd-video-primary-info-renderer, h1.ytd-watch-metadata')?.textContent?.trim() || document.title,
    channelName: document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '',
    descriptionPreview: document.querySelector('#description-inline-expander, #description')?.textContent?.slice(0, 200) || ''
  };
}

function checkVideo() {
  const videoId = getVideoId();
  if (!videoId || videoId === currentVideoId) return;

  // Wait for page to load data
  setTimeout(() => {
    const data = getVideoData();
    if (data.videoId && data.title) {
      currentVideoId = data.videoId;
      chrome.runtime.sendMessage({ type: 'VIDEO_DATA', data });
    }
  }, 2000);
}

// Check on page load and URL changes
checkVideo();
const observer = new MutationObserver(() => {
  if (getVideoId() !== currentVideoId) checkVideo();
});
observer.observe(document.body, { childList: true, subtree: true });
