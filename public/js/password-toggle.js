function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  button.textContent = isHidden ? 'Hide' : 'Show';
  button.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
  button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}
