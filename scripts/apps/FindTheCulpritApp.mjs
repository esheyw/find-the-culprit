import { MODULE, MODULE_ID } from "../find-the-culprit.mjs";
const fu = foundry.utils;
export class FindTheCulpritApp extends FormApplication {
  #search;
  #selectedModules = {};
  #lockLibraries;
  #stepData;
  #persists = null;
  #reloadAll;
  #mute;

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
    this.#mute = game.settings.get(MODULE_ID, "mute");
    this.#lockLibraries = game.settings.get(MODULE_ID, "lockLibraries");
    this.#reloadAll = game.settings.get(MODULE_ID, "reloadAll");
    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "find-the-culprit-app",
      classes: ["form", "find-the-culprit-app"],
      width: 400,
      closeOnSubmit: false,
      submitOnChange: true,
      scrollY: [".ftc-module-chooser"],
    });
  }

  get search() {
    this.#search ??= new SearchFilter({
      inputSelector: 'input[name="search"]',
      contentSelector: ".ftc-module-list",
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
    return `modules/${MODULE_ID}/templates/initialSelectMods.hbs`;
  }

  get title() {
    return game.i18n.localize("FindTheCulprit.FindTheCulprit");
  }

  doStep() {
    if (typeof this.#stepData.step !== "number") return;
    if (this.#stepData.step === 0) {
      this.onlySelectedMods();
    } else {
      this.binarySearchStep();
    }
  }

  async onlySelectedMods() {
    this.#persists = await Dialog.confirm({
      title: this.title,
      content: await renderTemplate(`modules/${MODULE_ID}/templates/onlySelectedActive.hbs`),
    });
    switch (this.#persists) {
      case true:
        return this.issuePeristsWithOnlySelected();
      case false:
        this.#stepData.step = 1;
        await game.settings.set(MODULE_ID, "stepData", this.#stepData);
        this.deactivationStep(this.#stepData.active);
        break;
      case null:
      default:
        return;
    }
  }

  async issuePeristsWithOnlySelected() {
    const template = `modules/${MODULE_ID}/templates/issuePersistsWithOnlySelected.hbs`;
    const templateData = {
      chosen: this.#stepData.chosen.map((m) => {
        const mod = game.modules.get(m);
        return {
          id: m,
          title: mod.title,
        };
      }),
    };
    const content = await renderTemplate(template, templateData);
    const reactivate = await Dialog.wait(
      {
        title: this.title,
        content,
        buttons: {
          yes: {
            icon: `<i class="fa-solid fa-arrow-rotate-left"></i>`,
            label: game.i18n.localize("FindTheCulprit.ReactivateAllModules"),
            callback: () => true,
          },
          no: {
            icon: '<i class="fa-solid fa-xmark"></i>',
            label: game.i18n.localize("Close"),
            callback: () => false,
          },
        },
        close: () => false,
      },
      { classes: ["dialog", "find-the-culprit-app"] }
    );
    //reactiveModules also calls resetSettings
    if (reactivate) await this.reactivateModules();
    else this.resetStepDataSetting();
  }

  async binarySearchStep() {
    const numActive = this.#stepData.active?.length || 0;
    const numInactive = this.#stepData.inactive?.length || 0;
    const stepsLeft = Math.ceil(Math.log2(numActive > numInactive ? numActive : numInactive)) + 1;
    const template = `modules/${MODULE_ID}/templates/binarySearchStep.hbs`;
    const templateData = {
      numRemaining: numActive + numInactive,
      stepsLeft,
      active: this.#stepData.active.map((m) => ({
        id: m,
        title: game.modules.get(m).title,
      })),
      inactive: this.#stepData.inactive.map((m) => ({
        id: m,
        title: game.modules.get(m).title,
      })),
    };
    const content = await renderTemplate(template, templateData);
    new Dialog(
      {
        title: this.title,
        content,
        buttons: {
          yes: {
            icon: '<i class="fa-solid fa-check"></i>',
            label: game.i18n.localize("Yes"),
            callback: async function () {
              this.deactivationStep(this.#stepData.active);
            }.bind(this),
          },
          no: {
            icon: '<i class="fa-solid fa-xmark"></i>',
            label: game.i18n.localize("No"),
            callback: async function () {
              this.deactivationStep(this.#stepData.inactive);
            }.bind(this),
          },
          reset: {
            icon: '<i class="fa-solid fa-rotate-right"></i>',
            label: game.i18n.localize("Reset"),
            callback: async function () {
              await this.reactivateModules();
              this.resetSettings();
            }.bind(this),
          },
        },
        close: () => false,
      },
      { classes: ["dialog", "find-the-culprit-app"] }
    ).render(true);
  }

  async deactivationStep(chosenModules = []) {
    if (chosenModules.length === 1) return this.renderFinalDialog(chosenModules[0]);
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    //everything except the stored chosen list gets disabled
    const modsToDisable = Object.keys(currentModList).reduce((acc, mod) => {
      if (mod === MODULE_ID) return acc;
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
    if (this.#reloadAll) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }

  async reactivateModules() {
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    foundry.utils.mergeObject(currentModList, this.#stepData.original);
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    await this.resetStepDataSetting();
    if (this.#reloadAll) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }

  async renderFinalDialog(culprit) {
    const template = `modules/${MODULE_ID}/templates/foundTheCulprit.hbs`;
    const templateData = {
      culpritTitle: game.modules.get(culprit).title,
    };
    const content = await renderTemplate(template, templateData);
    const reactivate = await Dialog.wait(
      {
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
        close: () => false,
      },
      { classes: ["dialog", "find-the-culprit-app"] }
    );
    //reactiveModules also calls resetStepDataSetting
    if (reactivate) this.reactivateModules();
    else this.resetStepDataSetting();
  }

  async resetStepDataSetting() {
    const defaultValue = game.settings.settings.get(`${MODULE_ID}.stepData`).default;
    return game.settings.set(MODULE_ID, "stepData", defaultValue);
  }

  async startRun() {
    this.#stepData.chosen = Object.keys(this.#selectedModules).filter((m) => this.#selectedModules[m]);
    this.#stepData.step = 0;
    this.#stepData.active = game.modules.filter((m) => m.active && m.id !== MODULE_ID).map((m) => m.id);
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
    const locks = game.settings.get(MODULE_ID, "locks");
    context.mute = this.#mute;
    context.lockLibraries = this.#lockLibraries;
    context.reloadAll = this.#reloadAll;
    context.activeModules = game.modules
      .filter((m) => m.active && m.id !== MODULE_ID)
      .map((m) => ({
        id: m.id,
        title: m.title,
        locked: locks[m.id] || (m.library && this.#lockLibraries),
        selected: this.#selectedModules[m.id],
        library: m.library,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
    return context;
  }

  async _onChangeCheckbox(event) {
    const el = event.currentTarget;
    const ignoreCheckboxen = ["lockLibraries", "mute"];
    if (ignoreCheckboxen.includes(el.name)) return;
    if (el.name.startsWith("locks")) {
      if (!this.#mute) {
        AudioHelper.play({
          src: `sounds/doors/industrial/${el.checked ? "lock" : "unlock"}.ogg`,
          volume: game.settings.get("core", "globalAmbientVolume"),
        });
      }
      if (!el.checked) return; // don't trigger dependency checks for unlocking
    }
    const modID = el.name.split(".")[1];
    const wrongStateDeps = this.#checkDepenencies(modID) ?? [];
    if (wrongStateDeps.length === 0) return;
    const template = `modules/${MODULE_ID}/templates/dependenciesDialog.hbs`;
    const templateData = {
      enabling: el.checked,
      dependencies: wrongStateDeps,
    };
    const content = await renderTemplate(template, templateData);
    const response = await Dialog.confirm({
      title: game.i18n.localize("MODMANAGE.Dependencies"),
      content,
      yes: ([html]) => new FormDataExtended(html.querySelector("form")).object,
      no: () => false,
    });
    if (!response) return;
    for (const mod in response) {
      const modLockInput = this.form[`locks.${mod}`];
      const modInput = this.form[`modules.${mod}`];
      if (el.checked) {
        modInput.checked = true;
        await this.submit();
        modInput.dispatchEvent(new Event("change"));
      } else {
        //todo: improve this whole deal, dont' just quietly do nothing if locked
        if (modLockInput.checked) continue;
        modInput.checked = false;
        await this.submit();
        modInput.dispatchEvent(new Event("change"));
      }
    }
  }

  #checkDepenencies(modID) {
    const mod = game.modules.get(modID);
    const modCheckbox = this.form[`modules.${modID}`];
    if (!("requires" in (mod?.relationships ?? {})) || !mod.relationships.requires.size) return;
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
    const almostAllCheckboxes = this.form.querySelectorAll(
      `:is(.ftc-module-list, .library-toggle) input[type=checkbox]`
    );
    for (const checkbox of almostAllCheckboxes) {
      checkbox.disabled = false;
      checkbox.checked = false;
    }
    this.submit();
  }

  async _updateObject(event, formData) {
    formData = fu.expandObject(new FormDataExtended(this.form, { disabled: true }).object);
    this.#lockLibraries = formData.lockLibraries;
    await game.settings.set(MODULE_ID, "lockLibraries", this.#lockLibraries);
    this.#mute = formData.mute;
    await game.settings.set(MODULE_ID, "mute", this.#mute);
    this.#reloadAll = formData.reloadAll;
    await game.settings.set(MODULE_ID, "reloadAll", this.#reloadAll);
    fu.mergeObject(this.#selectedModules, formData.modules);
    await game.settings.set(MODULE_ID, "locks", formData.locks);
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
