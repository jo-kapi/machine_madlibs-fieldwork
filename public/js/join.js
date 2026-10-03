// First-visit screen: collects a name and optional pronouns, then continues to
// the page the person was heading for.
const form = document.querySelector(".join__form");
const submit = form.querySelector(".join__submit");

// Only follow same-site paths, so the link can't send people elsewhere.
function destination() {
  const next = new URLSearchParams(location.search).get("next");
  return next && /^\/(?!\/)/.test(next) ? next : "/activity_01.html";
}

// Returning visitors see their details filled in and can change them.
const existing = MM.getIdentity();
if (existing) {
  form.elements.name.value = existing.name;
  form.elements.pronouns.value = existing.pronouns ?? "";
  submit.textContent = "Continue";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  if (!name) {
    MM.notice("Please enter your name.", "error");
    form.elements.name.focus();
    return;
  }

  submit.disabled = true;
  MM.clearNotice();
  try {
    await MM.joinSession({ name, pronouns: form.elements.pronouns.value.trim() });
  } catch (error) {
    MM.notice(error.message, "error");
    submit.disabled = false;
    return;
  }

  // If the browser refuses to store anything, the other pages would send
  // people straight back here, so say so instead of looping.
  if (!MM.getIdentity()) {
    MM.notice(
      "Your browser is blocking storage. Allow it for this site, then try again.",
      "error"
    );
    submit.disabled = false;
    return;
  }
  location.assign(destination());
});
