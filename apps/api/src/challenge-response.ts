/** Keep the native POST fallback, but avoid webview navigation handlers losing a POST body. */
export const challengeResponseScript = `<script>
(() => {
  const form = document.getElementById('challenge-response');
  const status = document.getElementById('challenge-response-status');
  if (!form || !status || !window.fetch || !window.FormData) return;
  form.addEventListener('submit', async event => {
    const choice = event.submitter && event.submitter.value;
    if (choice !== 'trust' && choice !== 'flag') return;
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    const body = new URLSearchParams(new FormData(form));
    body.set('choice', choice);
    const buttons = form.querySelectorAll('button');
    form.dataset.submitting = 'true';
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = 'Saving your response…';
    try {
      const response = await fetch(form.action, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString()
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Your response could not be saved. Please try again.');
      }
      status.textContent = 'Response saved. Loading your reveal…';
      window.location.replace(form.action);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Your connection was interrupted. Try again to check your saved response.';
      delete form.dataset.submitting;
      buttons.forEach(button => { button.disabled = false; });
    }
  });
})();
</script>`;
