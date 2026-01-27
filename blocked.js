var href = window.location.href;
var match = href.match(/[?&]reason=([^&]*)/);
if (match && match[1]) {
  try {
    document.getElementById('reason').textContent = decodeURIComponent(match[1].replace(/\+/g, ' '));
  } catch(e) {
    document.getElementById('reason').textContent = match[1].replace(/\+/g, ' ');
  }
}
