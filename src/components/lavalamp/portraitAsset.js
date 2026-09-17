let portraitBytes;

// Fetch during the menu's idle time so the outline can join the first ink wave.
export function warmPortrait() {
  if (!portraitBytes) {
    portraitBytes = fetch('/seena/portrait-bust.glb').then(response => {
      if (!response.ok) throw new Error('Portrait could not load');
      return response.arrayBuffer();
    }).catch(error => { portraitBytes = null; throw error; });
  }
  return portraitBytes;
}
