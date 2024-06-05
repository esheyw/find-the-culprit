import { AllSelection } from "../../app/common/prosemirror/_module.mjs";
import { MODULE, MODULE_ID } from "../find-the-culprit.mjs";
const fu = foundry.utils;
export class FindTheCulpritApp extends FormApplication {
  #search;
  #selectedModules = {};
  #lockLibraries;
  #stepData;

  constructor(object = {}, options = {}) {
    if (MODULE().app instanceof FindTheCulpritApp)
      throw new Error(game.i18n.localize("FindTheCulprit.Error.SelectModsSingleton"));
    super(object, options);
    this.#stepData = game.settings.get(MODULE_ID, "stepData");
    this.#lockLibraries = game.settings.get(MODULE_ID, "lockLibraries");
    this.#search = new SearchFilter({
      inputSelector: 'input[name="search"]',
      contentSelector: ".ftc-module-list-2",
      callback: (event, query, rgx, html) => {
        for (let li of html.children) {
          if (!query) {
            li.classList.remove("hidden");
            continue;
          }
          const name = li.dataset.module;
          const title = (li.querySelector(".package-title")?.textContent || "").trim();
          const match = rgx.test(SearchFilter.cleanQuery(name)) || rgx.test(SearchFilter.cleanQuery(title));
          li.classList.toggle("hidden", !match);
        }
      },
    });
  }
  get template() {
    switch (this.#stepData.step) {
      case null:
      default:
        return `modules/${MODULE_ID}/templates/SelectMods.hbs`;
    }
  }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Find the Cuprit",
      classes: ["form", "find-the-culprit-app", "dialog"], //dialog to steal core styles
      width: 400,
      closeOnSubmit: false,
      submitOnChange: true,
      scrollY: [".ftc-module-chooser"],
    });
  }

  async startRun() {
    console.warn("starting run", this.#selectedModules);
  }

  async _onSubmit(event, options = {}) {
    await super._onSubmit(event, options);
    console.warn("submitted");
    if (event?.submitter?.dataset?.button === "start") this.startRun();
  }

  getData(options = {}) {
    const context = super.getData(options);
    const locks = game.settings.get(MODULE_ID, "locks-2");
    context.lockLibraries = this.#lockLibraries;
    context.activeModules = game.modules
      .filter((m) => m.active)
      .map((m) => ({
        id: m.id,
        title: m.title,
        locked: locks[m.id] || (m.library && this.#lockLibraries),
        selected: this.#selectedModules[m.id],
        library: m.library,
      }));
    return context;
  }
  activateListeners(jq) {
    super.activateListeners(jq);
    const html = jq[0];
    switch (this.#stepData.step) {
      case null:
      default:
        this.#activateNullStepListeners(html);
    }
  }
  #activateNullStepListeners(html) {
    this.#search.bind(html);
    const lockInputs = Array.from(html.querySelectorAll(`input[name^="locks"]`));
    for (const lockInput of lockInputs) {
      lockInput.addEventListener("change", async (ev) => {
        await AudioHelper.play({
          src: `sounds/doors/industrial/${ev.target.checked ? "lock" : "unlock"}.ogg`,
          volume: game.settings.get("core", "globalAmbientVolume"),
        });
      });
    }
    const cancelButton = html.querySelector(`[data-button="cancel"]`);
    cancelButton.addEventListener("click", this.close.bind(this));
    const clearAllButton = html.querySelector(`button.ftc-clear`);
    clearAllButton.addEventListener("click", (ev) => {
      const allCheckboxes = html.querySelectorAll(`input[type=checkbox]`);
      for (const checkbox of allCheckboxes) {
        checkbox.disabled = false;
        checkbox.checked = false;
      }
    });
  }
  #toggleLockIcon(el, setLocked = null) {
    if (!(el instanceof HTMLElement)) return;
    setLocked = typeof setLocked === Boolean ? setLocked : !el.classList.includes("fa-lock");
    if (setLocked) {
      el.classList.remove("fa-lock-open");
      el.classList.add("fa-lock");
    } else {
      el.classList.remove("fa-lock");
      el.classList.add("fa-lock-open");
    }
  }

  async _updateObject(event, formData) {
    formData = fu.expandObject(new FormDataExtended(this.form, { disabled: true }).object);
    this.#lockLibraries = formData.lockLibraries;
    await game.settings.set(MODULE_ID, "lockLibraries", this.#lockLibraries);
    fu.mergeObject(this.#selectedModules, formData.modules);
    await game.settings.set(MODULE_ID, "locks-2", formData.locks);
    this.render();
  }

  async close() {
    this.#selectedModules = {};
    return super.close();
  }
}
