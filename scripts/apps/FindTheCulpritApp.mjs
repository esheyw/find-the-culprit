import { MODULE, MODULE_ID } from "../find-the-culprit.mjs";
const fu = foundry.utils;
export class FindTheCulpritApp extends FormApplication {
  #search;
  #selectedModules = {};
  #lockLibraries;
  #stepData;
  #persists = null;

  constructor(object = {}, options = {}) {
    if (MODULE().app instanceof FindTheCulpritApp)
      throw new Error(game.i18n.localize("FindTheCulprit.Error.SelectModsSingleton"));

    super(object, options);

    this.#stepData = game.settings.get(MODULE_ID, "stepData");

    //This is to prune out modules that have a saved value in this world but are no longer installed.
    //Not sure if only my broken test world requires it, but I can't see how it'd hurt.
    const existingMods = game.modules.map((m) => m.id);
    this.#stepData.original ??= Object.entries(game.settings.get("core", ModuleManagement.CONFIG_SETTING)).reduce(
      (acc, [mod, active]) => {
        if (existingMods.includes(mod)) acc[mod] = active;
        return acc;
      },
      {}
    );
    this.#lockLibraries = game.settings.get(MODULE_ID, "lockLibraries");
    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Find the Cuprit",
      id: "find-the-culprit-app",
      classes: ["form", "find-the-culprit-app", "dialog"], //dialog to steal core styles
      width: 400,
      closeOnSubmit: false,
      submitOnChange: true,
      scrollY: [".ftc-module-chooser"],
    });
  }

  get search() {
    this.#search ??= new SearchFilter({
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
    return this.#search;
  }

  get template() {
    return `modules/${MODULE_ID}/templates/SelectMods.hbs`;
  }

  doStep() {
    if (typeof this.#stepData.step !== "number") return;
    if (this.#stepData === 0) return this.onlySelectedMods();
    this.binarySearchStep();
  }
  async onlySelectedMods() {}

  async binarySearchStep() {}

  async deactivationStep(chosenModules = []) {
    if (chosenModules.length === 1) return renderFinalDialog(chosenModules[0]);
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    //everything except the stored chosen list gets disabled
    const modsToDisable = Object.keys(currentModList).reduce((acc, mod) => {
      if (!this.#stepData.chosen.includes(mod)) acc[mod] = false;
      return acc;
    }, {});
    foundry.utils.mergeObject(currentModList, modsToDisable);
    if (chosenModules.length > 0) {
      const half = Math.ceil(chosenModules.length / 2);
      this.#stepData.inactive = chosenModules.slice(half);
      this.#stepData.active = chosenModules.slice(0, half);
      //active half gets enabled
      for (const mod of this.#stepData.active) currentModList[mod] = true;
      await game.settings.set(MODULE_ID, "stepData", this.#stepData);
    }
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    foundry.utils.debouncedReload();
  }

  async reactivateModules() {
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    foundry.utils.mergeObject(currentModList, this.#stepData.original);
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    foundry.utils.debouncedReload();
  }

  async renderFinalDialog(culprit) {
    const template = `modules/${MODULE_ID}/templates/foundTheCulprit.hbs`;
    const templateData = {
      culpritTitle: game.modules.get(culprit).title,
    };
    const content = await renderTemplate(template, templateData);
    const reactivate = await Dialog.wait({
      title: game.i18n.localize("FindTheCulprit.FindTheCulprit"),
      content,
      buttons: {
        yes: {
          icon: `<i class="fa-solid fa-list-check"></i>`,
          label: game.i18n.localize("FindTheCulprit.ReactivateAllModules"),
          callback: () => true,
        },
        no: {
          icon: '<i class="fa-solid fa-xmark"></i>',
          label: game.i18n.localize("Close"),
          callback: () => false,
        },
      },
    });
    if (reactivate) await this.reactivateModules();
    this.resetSettings();
  }

  async resetSettings() {
    const defaultValue = game.settings.settings.get(`${MODULE_ID}.stepData`).default;
    return game.settings.set(MODULE_ID, "stepData", defaultValue);
  }

  async startRun() {
    console.warn("starting run", this.#selectedModules);
    this.#stepData.chosen = Object.keys(this.#selectedModules).filter((m) => this.#selectedModules[m]);
    this.#stepData.step = 0;
    await game.settings.set(MODULE_ID, "stepData", this.#stepData);
    this.deactivationStep();
  }

  async _onSubmit(event, options = {}) {
    await super._onSubmit(event, options);
    if (event?.submitter?.dataset?.button === "start") this.startRun();
  }

  async _render(force, options) {
    if (typeof this.#stepData.step === "number") return this.doStep();
    await super._render(force, options);
  }

  getData(options = {}) {
    const context = super.getData(options);
    const locks = game.settings.get(MODULE_ID, "locks-2");
    context.lockLibraries = this.#lockLibraries;
    context.activeModules = game.modules
      .filter((m) => m.active && m.id !== MODULE_ID)
      .map((m) => ({
        id: m.id,
        title: m.title,
        locked: locks[m.id] || (m.library && this.#lockLibraries),
        selected: this.#selectedModules[m.id],
        library: m.library,
      }));
    return context;
  }
  async _onChangeCheckbox(event) {
    const el = event.currentTarget;
    // console.warn(el)
    if (el.name === "lockLibraries") return;
    if (el.name.startsWith("locks")) {
      AudioHelper.play({
        src: `sounds/doors/industrial/${el.checked ? "lock" : "unlock"}.ogg`,
        volume: game.settings.get("core", "globalAmbientVolume"),
      });
    }
    const modID = el.name.split(".")[1];
    const wrongStateDeps = this.#checkDepenencies(modID) ?? [];
    // console.warn({ modID, wrongStateDeps });
    if (wrongStateDeps.length === 0) return;
    const template = `modules/${MODULE_ID}/templates/dependenciesDialog.hbs`;
    const templateData = {
      enabling: el.checked,
      dependencies: wrongStateDeps,
    };
    const content = await renderTemplate(template, templateData);
    const response = await Dialog.confirm(
      {
        title: game.i18n.localize("MODMANAGE.Dependencies"),
        content,
        yes: ([html]) => new FormDataExtended(html.querySelector("form")).object,
        no: () => false,
      },
    );
    if (!response) return;
    for (const mod in response) {
      const modLockInput = this.form[`locks.${mod}`];
      const modInput = this.form[`modules.${mod}`];
      if (el.checked) {
        modInput.checked = true;
        await this.submit();
        modInput.dispatchEvent(new Event('change'));
      } else { //todo: improve this whole deal, dont' just quietly do nothing if locked
        if (modLockInput.checked) continue;
        modInput.checked = false;
        await this.submit();
        modInput.dispatchEvent(new Event('change'));
      }
    }
  }
  #checkDepenencies(modID) {
    const mod = game.modules.get(modID);
    const modCheckbox = this.form[`modules.${modID}`];
    if (!("requires" in mod.relationships) || !mod.relationships.requires.size) return;
    console.warn(`${modID} has dependencies`);
    return mod.relationships.requires.reduce((acc, rel) => {
      const depInstalled = game.modules.get(rel.id);
      if (!depInstalled) {
        ui.notifications.error(
          game.i18n.format("FindTheCulprit.MissingDependency", { module: mod.title, dependency: rel.id }),
          { permanent: true }
        );
        return acc;
      }
      if (!depInstalled.active) {
        ui.notifications.error(
          game.i18n.format("FindTheCulprit.DisabledDependency", { module: mod.title, dependency: depInstalled.title }),
          { permanent: true }
        );
        return acc;
      }
      const depCheckbox = this.form?.[`modules.${rel.id}`];
      if (depCheckbox && depCheckbox.checked !== modCheckbox.checked) {
        rel.title = game.modules.get(rel.id).title;
        acc.push(rel);
      }
      return acc;
    }, []);
  }
  activateListeners(jq) {
    super.activateListeners(jq);
    const html = jq[0];
    this.search.bind(html);
    const allCheckboxes = html.querySelectorAll(`input[type="checkbox"]`);
    for (const checkbox of allCheckboxes) {
      checkbox.addEventListener("change", this._onChangeCheckbox.bind(this));
    }
    const cancelButton = html.querySelector(`[data-button="cancel"]`);
    cancelButton.addEventListener("click", this.close.bind(this));
    const clearAllButton = html.querySelector(`[data-button="clear"]`);
    clearAllButton.addEventListener("click", this.#clearAll.bind(this));
  }

  #clearAll() {
    const allCheckboxes = this.form.querySelectorAll(`input[type=checkbox]`);
    for (const checkbox of allCheckboxes) {
      checkbox.disabled = false;
      checkbox.checked = false;
    }
    this.submit();
  }

  async _updateObject(event, formData) {
    console.warn("updateObject");
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

  #onRenderModuleManagement(app, html, options) {
    html = html instanceof jQuery ? html[0] : html;
    const footer = html.querySelector("footer");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<i class="fa-solid fa-search"></i> ${game.i18n.localize("FindTheCulprit.FindTheCulprit")}`;
    btn.addEventListener(
      "click",
      function () {
        if (this.rendered) {
          this.bringToTop();
          if (this._minimized) this.maximize();
        } else this.render(true);
      }.bind(this)
    );
    footer.append(btn);
    app.setPosition();
  }
}
