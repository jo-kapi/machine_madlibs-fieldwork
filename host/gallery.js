// Host gallery: the Visual Poetry images that participants sent to the screen.
// The host can browse them full-screen and delete any that shouldn't be shown.
const Gallery = (() => {
  const view = document.querySelector(".host__gallery");
  const grid = document.querySelector(".gallery__grid");
  const emptyMessage = document.querySelector(".gallery__empty");
  const lightbox = document.querySelector(".lightbox");
  const lightboxImage = lightbox.querySelector(".lightbox__image");
  const lightboxCaption = lightbox.querySelector(".lightbox__caption");

  let items = []; // image details from the server, oldest first
  let openId = null; // the image shown in the lightbox, if any
  let onChange = () => {};

  const imageUrl = (item) => `/api/host/gallery/image/${item.id}`;
  const caption = (item) =>
    item.pronouns ? `${item.name} (${item.pronouns})` : item.name;

  function init(changeHandler) {
    onChange = changeHandler;
    const source = new EventSource("/api/host/gallery/events");
    source.onmessage = (event) => {
      items = JSON.parse(event.data);
      render();
      onChange(items.length);
    };

    lightbox.querySelector(".lightbox__delete").addEventListener("click", () => {
      const item = items.find((entry) => entry.id === openId);
      if (item) remove(item);
    });
    // Clicking the dark area around the picture closes it.
    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) close();
    });
  }

  // Draws the grid. Names are added as text, never as HTML.
  function render() {
    emptyMessage.hidden = items.length > 0;
    grid.replaceChildren(...items.map(card));

    // Keep the lightbox in step if the open image was deleted.
    if (openId && !items.some((item) => item.id === openId)) close();
  }

  function card(item) {
    const figure = MM.el("figure", "gallery__item");

    const open = MM.el("button", "gallery__open");
    open.type = "button";
    const image = MM.el("img", "gallery__image");
    image.src = imageUrl(item);
    image.alt = `Visual poem by ${item.name}`;
    image.loading = "lazy";
    open.append(image);
    open.addEventListener("click", () => show(item.id));

    const remover = MM.el("button", "gallery__delete", "×");
    remover.type = "button";
    remover.setAttribute("aria-label", `Delete the poem by ${item.name}`);
    remover.addEventListener("click", () => remove(item));

    figure.append(open, MM.el("figcaption", "gallery__caption", caption(item)), remover);
    return figure;
  }

  async function remove(item) {
    if (!confirm(`Delete the poem by ${item.name} from the gallery?`)) return;
    try {
      await MM.api(`host/gallery/${item.id}`, undefined, "DELETE");
    } catch {
      // The list updates itself when the server confirms; nothing to do on failure.
    }
  }

  // ---------- lightbox ----------

  function show(id) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    openId = id;
    lightboxImage.src = imageUrl(item);
    lightboxImage.alt = `Visual poem by ${item.name}`;
    lightboxCaption.textContent = caption(item);
    lightbox.hidden = false;
  }

  function close() {
    openId = null;
    lightbox.hidden = true;
    lightboxImage.removeAttribute("src");
  }

  // Moves to the next or previous image, wrapping round at the ends.
  function step(direction) {
    if (items.length === 0) return;
    const index = items.findIndex((item) => item.id === openId);
    const next = (index + direction + items.length) % items.length;
    show(items[next].id);
  }

  // Returns true if the key was used here.
  function handleKey(event) {
    if (lightbox.hidden) {
      // From the grid, any arrow or Enter opens the first image.
      if (["ArrowRight", "ArrowLeft", "Enter"].includes(event.key) && items.length > 0) {
        show(items[0].id);
        return true;
      }
      return false;
    }

    switch (event.key) {
      case "ArrowRight":
      case " ":
        step(1);
        return true;
      case "ArrowLeft":
        step(-1);
        return true;
      case "Escape":
        close();
        return true;
      case "Delete":
      case "Backspace": {
        const item = items.find((entry) => entry.id === openId);
        if (item) remove(item);
        return true;
      }
      default:
        return false;
    }
  }

  return { init, handleKey, element: view };
})();
