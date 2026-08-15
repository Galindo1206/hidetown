(function () {
  "use strict";

  class ScreenNavigation {
    constructor({ screenSelector = "[data-screen]", initialScreen = "loading", onChange } = {}) {
      this.screens = new Map(
        Array.from(document.querySelectorAll(screenSelector), (screen) => [screen.id, screen])
      );
      this.currentId = initialScreen;
      this.onChange = onChange;
      this.isTransitioning = false;
      this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    }

    goTo(nextId, { focus = true } = {}) {
      if (this.isTransitioning || nextId === this.currentId || !this.screens.has(nextId)) return;

      const currentScreen = this.screens.get(this.currentId);
      const nextScreen = this.screens.get(nextId);
      const transitionTime = this.motionQuery.matches ? 0 : 180;

      this.isTransitioning = true;
      currentScreen.classList.remove("is-active");
      currentScreen.classList.add("is-leaving");

      window.setTimeout(() => {
        currentScreen.hidden = true;
        currentScreen.classList.remove("is-leaving");
        nextScreen.hidden = false;
        void nextScreen.offsetWidth;
        nextScreen.classList.add("is-active");
        this.currentId = nextId;
        this.isTransitioning = false;

        if (focus) this.focusScreen(nextScreen);
        if (typeof this.onChange === "function") this.onChange(nextId);
      }, transitionTime);
    }

    focusScreen(screen) {
      const target = screen.querySelector("h1, h2, input, button");
      if (!target) return;
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
  }

  window.ScreenNavigation = ScreenNavigation;
})();
