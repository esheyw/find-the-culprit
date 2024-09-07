import { fu, MODULE, MODULE_ID } from "../constants.mjs";
import { actionLabel, actionTooltip, debug, getDependencies, lockTooltip, shuffleArray } from "../helpers.mjs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class FindTheCulpritAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: FindTheCulpritAppV2.#startRun,
      closeOnSubmit: true,
      submitOnChange: false,
    },
    classes: ["find-the-culprit-app", "standard-form"],
    id: "find-the-culprit",
    position: {
      width: 450,
    },
    actions: {
      clearAll: FindTheCulpritAppV2.#clearAll,
      lockLibraries: FindTheCulpritAppV2.#toggleLockLibraries,
      mute: FindTheCulpritAppV2.#toggleMute,
      reloadAll: FindTheCulpritAppV2.#toggleReloadAll,
      zeroMods: FindTheCulpritAppV2.#zeroMods,
    },
    window: {
      title: "FindTheCulprit.FindTheCulprit",
      icon: "fa-solid fa-search",
      controls: [
        {
          action: "mute",
        },
        {
          action: "zeroMods",
          icon: "fa-solid fa-table-list",
          label: actionLabel("zeroMods"),
        },
      ],
    },
  };

  static PARTS = {
    form: {
      id: "form",
      template: `modules/${MODULE_ID}/templates/FindTheCulpritMain.hbs`,
      scrollable: [".ftc-module-chooser"],
    },
  };

  #toggles = {
    lockLibraries: ["fa-lock-open", "fa-lock"],
    mute: ["fa-volume-high", "fa-volume-xmark"],
    reloadAll: ["fa-user", "fa-users"],
  };
  #search;
  #persists = null;
  #data;
  #debouncedPlayLock;
  #selected = new Set();

  constructor() {
    if (MODULE().app instanceof FindTheCulpritAppV2)
      throw new Error(game.i18n.localize("FindTheCulprit.Error.Singleton"));
    super();

    this.#data = game.settings.get(MODULE_ID, "data");

    this.#initializeToggleControls();

    this.#debouncedPlayLock = fu.debounce(this.#playLock.bind(this), 50);

    if (this.#data.original.size === 0 && this.#data.currentStep === null) {
      const storedConfig = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
      //This to prune out modules that have a saved value in this world but are no longer installed.
      //Not sure if only my broken test world requires it, but I can't see how it'd hurt.
      const validOriginals = Object.keys(storedConfig).reduce((valid, modID) => {
        if (game.modules.get(modID)?.active && modID !== MODULE_ID) valid.push(modID);
        return valid;
      }, []);
      this.#updateSet("original", validOriginals, true);
    }

    //preload locked libraries
    if (this.#data.lockLibraries) {
      const libraries = game.modules.filter((m) => m.active && m.library);
      this.#updateSet(
        "locks",
        libraries.map((m) => m.id),
        true
      );
    }
    // pre-select everything locked
    this.#selected = new Set([...this.#data.locks]);

    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));
  }

  #initializeToggleControls() {
    for (const control of this.options.window.controls) {
      const action = control.action;
      if (action in this.#toggles) {
        const value = this.#data[action];
        control.label = actionLabel(action, value);
        control.icon = `fa-solid ${this.#toggles[action][value ? 1 : 0]}`;
      }
    }
  }

  #playLock(locking = true) {
    if (this.#data.mute) return;
    foundry.audio.AudioHelper.play({
      src: `sounds/doors/industrial/${locking ? "" : "un"}lock.ogg`,
      volume: game.settings.get("core", "globalAmbientVolume"),
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

  #onRenderModuleManagement(app, html) {
    html = html instanceof jQuery ? html[0] : html;
    const footer = html.querySelector("footer");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<i class="fa-solid fa-search"></i> ${game.i18n.localize("FindTheCulprit.FindTheCulprit")}`;
    btn.addEventListener("click", this.#conditionallyRender.bind(this));
    footer.append(btn);
    app.setPosition();
  }

  #conditionallyRender() {
    if (this.#data.currentStep !== null) return this.doStep();
    if (this.rendered) {
      this.bringToFront();
      if (this._minimized) this.maximize();
    } else this.render(true);
  }

  async #update(changes = {}, { save = true } = {}) {
    try {
      const diff = this.#data.updateSource(changes);
      return save ? game.settings.set(MODULE_ID, "data", this.#data) : diff;
    } catch (e) {
      console.error("FindTheCulpritAppV2#update | ", e.message);
    }
  }

  async #updateSet(setName, ids, value, { save = true } = {}) {
    if (ids instanceof Set) ids = [...ids];
    if (!Array.isArray(ids)) ids = [ids];
    for (const id of ids) {
      this.#data[setName][value ? "add" : "delete"](id);
    }
    // debug("#updateSet", { setName, ids, value, save });
    if (save) return this.#update({ [setName]: this.#data[setName] });
  }

  async #toggleButtonValue(target) {
    const action = target.dataset.action;
    const newValue = !this.#data[action];
    await this.#update({ [action]: newValue });
    return newValue;
  }

  #toggleButtonDOM(target) {
    const action = target.dataset.action;
    const value = this.#data[action];
    this.#toggleButtonIcon(target);

    // buttons hold the tooltips
    const button = target.nodeName === "BUTTON" ? target : target.querySelector("button");
    if (button && button.dataset.tooltip) {
      const wasTooltip = game.tooltip.element === button;
      if (wasTooltip) game.tooltip.deactivate();
      button.dataset.tooltip = game.i18n.localize(actionTooltip(action, value));
      if (wasTooltip) game.tooltip.activate(button);
    }

    // spans hold the label text
    const labelSpan = target.querySelector("button span");
    if (labelSpan) {
      labelSpan.innerText = game.i18n.localize(actionLabel(action, value));
    }
    return target;
  }

  #toggleButtonIcon(target, icons, value) {
    const action = target.dataset.action;
    value ??= this.#data[action];
    icons ??= this.#toggles[action];
    const iconElement = target.querySelector("i.fa-solid");
    const priorIcon = icons[value ? 0 : 1];
    const newIcon = icons[value ? 1 : 0];
    iconElement.classList.remove(priorIcon);
    iconElement.classList.add(newIcon);
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static #toggleReloadAll(event, target) {
    this.#toggleButtonValue(target);
    this.#toggleButtonDOM(target);
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static async #toggleLockLibraries(event, target) {
    const enabled = await this.#toggleButtonValue(target);
    this.#toggleButtonDOM(target);
    const libraryLocks = game.modules.reduce((libs, mod) => {
      if (mod.active && mod.library) libs.push(`locks.${mod.id}`);
      return libs;
    }, []);
    this.#check(libraryLocks, enabled, { disabled: true });
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static async #toggleMute(event, target) {
    await this.#toggleButtonValue(target);
    this.#toggleButtonDOM(target);
    this.#debouncedPlayLock();
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static #clearAll() {
    if (this.#data.lockLibraries) {
      const llbtn = this.element.querySelector('[data-action="lockLibraries"]');
      FindTheCulpritAppV2.#toggleLockLibraries.call(this, null, llbtn);
    }
    this.#check(false, false, { disabled: true, all: true });
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static async #zeroMods() {
    await this.#update({ zero: true });
    FindTheCulpritAppV2.#startRun.call(this);
  }

  #check(targets, value, { bubbles = true, event = true, disabled = false, all = false, callback } = {}) {
    if (!targets && all) targets = Object.values(this.element).filter((n) => n.type === "checkbox");
    if (!Array.isArray(targets)) targets = [targets];

    const toggleDisabled = (c) => {
      c.disabled = value;
    };
    if (typeof callback !== "function" && disabled) callback = toggleDisabled;

    //support passing a `name` attribute value in addition to an element object
    targets = targets.map((t) => (t instanceof HTMLInputElement ? t : this.element[t]));
    const changed = {};
    for (const target of targets) {
      changed[target.name] = target.checked !== value;
      if (changed[target.name]) {
        target.checked = value;
        if (typeof callback === "function") callback(target);
        if (event) target.dispatchEvent(new Event("change", { bubbles }));
      }
    }
    return Object.keys(changed).length > 1 ? changed : Object.values(changed)[0];
  }

  _onChangeForm(formConfig, event) {
    const target = event.target;
    if (target.type === "checkbox") {
      if (target.name.startsWith("locks")) {
        this.#onToggleLock(target);
      } else {
        this.#onToggleModule(target);
      }
    }
  }

  async #onToggleModule(target) {
    const id = target.name.split(/\.(.*)/)[1];
    const checked = target.checked;
    this.#selected[checked ? "add" : "delete"](id);
    const wrongStateDeps = this.#checkDepenencies(id) ?? [];
    if (wrongStateDeps.length === 0) return;
    const template = `modules/${MODULE_ID}/templates/dependenciesDialog.hbs`;
    const templateData = {
      enabling: checked,
      dependencies: wrongStateDeps,
    };
    const content = await renderTemplate(template, templateData);
    const response = await DialogV2.confirm({
      title: game.i18n.localize("MODMANAGE.Dependencies"),
      content,
      yes: { callback: (event, button, dialog) => new FormDataExtended(button.form).object },
      classes: ["ftc-dialog", "find-the-culprit-app"],
    });
    if (!response) {
      target.checked = !checked;
      this.#selected[!checked ? "add" : "delete"](id);
      return;
    }
    for (const mod in response) {
      const modLockInput = this.element[`locks.${mod}`];
      const modInput = this.element[`modules.${mod}`];
      if (checked) {
        this.#check(modInput, true);
      } else {
        //todo: improve this whole deal, dont' just quietly do nothing if locked
        if (modLockInput.checked) continue;
        this.#check(modInput, false);
      }
    }
  }

  // #checkDeps2(id, enabling) {
  //   const mod = game.modules.get(id);
  //   return mod.relationships.requires.reduce((acc, rel) => {
  //     const depInstalled = game.modules.get(rel.id);
  //     if (!depInstalled) {
  //       ui.notifications.error(
  //         game.i18n.format("FindTheCulprit.MissingDependency", { module: mod.title, dependency: rel.id }),
  //         { permanent: true }
  //       );
  //       return acc;
  //     }
  //     if (!depInstalled.active) {
  //       ui.notifications.error(
  //         game.i18n.format("FindTheCulprit.DisabledDependency", { module: mod.title, dependency: depInstalled.title }),
  //         { permanent: true }
  //       );
  //       return acc;
  //     }
  //     const depCheckbox = this.element?.[`modules.${rel.id}`];
  //     if (depCheckbox && depCheckbox.checked !== modCheckbox.checked) {
  //       rel.title = game.modules.get(rel.id).title;
  //       acc.push(rel);
  //     }
  //     return acc;
  //   }, []);
  // }

  // #getDeps(id) {
  //   const mod = game.modules.get(id);
  //   const deps = mod.relationships.requires.filter((r) => r.type === "module").map((r) => r.id);
  //   const allDeps = [...deps];
  //   for (const dep of deps) {
  //     allDeps.push(...this.#getDeps(dep));
  //   }
  //   return [...new Set(allDeps)];
  // }

  // async #onToggleModule2(target) {
  //   const id = target.name.split(/\.(.*)/)[1];
  //   const mod = game.modules.get(id);
  //   const checked = target.checked;
  //   const deps = this.#getDeps(id);
  //   if (checked) {
  //     if (deps.length > 0) {
  //     }
  //   } else {
  //   }
  // }

  get data() {
    return this.#data;
  }

  async #onToggleLock(target) {
    const checked = target.checked;
    const id = target.name.split(/\.(.*)/)[1];

    const selectedCheckbox = this.element.querySelector(`input[name="modules.${id}"]`);

    if (checked) {
      this.#check(selectedCheckbox, checked);
      selectedCheckbox.dataset.tooltip = game.i18n.localize("FindTheCulprit.SelectMods.DisabledBecauseLocked");
    } else {
      delete selectedCheckbox.dataset.tooltip;
    }
    selectedCheckbox.disabled = checked;
    await this.#updateSet("locks", id, checked);

    this.#debouncedPlayLock(checked);

    const labelElement = target.closest("label");
    const wasTooltip = game.tooltip.element === labelElement;
    if (wasTooltip) game.tooltip.deactivate();
    labelElement.dataset.tooltip = game.i18n.localize(
      lockTooltip(checked, this.#data.lockLibraries, game.modules.get(id).library)
    );
    if (wasTooltip) game.tooltip.activate(labelElement);

    this.#toggleButtonIcon(labelElement, this.#toggles.lockLibraries, checked);
  }

  _onRender(context, options) {
    //bind the searchfilter
    this.search.bind(this.element);
    // make sure all toggle buttons have the correct icon/label/tooltip
    const buttons = this.element.querySelectorAll("div.button-row button");
    buttons.forEach((b) => {
      if (b.dataset.action in this.#toggles) this.#toggleButtonDOM(b);
    });
  }

  async _prepareContext(options = {}) {
    const context = {
      lockLibraries: {
        icon: this.#toggles.lockLibraries[this.#data.lockLibraries ? 1 : 0],
        value: this.#data.lockLibraries,
      },
      reloadAll: {
        icon: this.#toggles.reloadAll[this.#data.reloadAll ? 1 : 0],
        value: this.#data.reloadAll,
      },
      activeModules: game.modules
        .filter((m) => m.active && m.id !== MODULE_ID)
        .map((m) => ({
          id: m.id,
          title: m.title,
          locked: this.#data.locks.has(m.id),
          selected: this.#selected.has(m.id),
          library: m.library,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    return context;
  }

  #checkDepenencies(modID) {
    const mod = game.modules.get(modID);
    const modCheckbox = this.element[`modules.${modID}`];
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
      const depCheckbox = this.element?.[`modules.${rel.id}`];
      if (depCheckbox && depCheckbox.checked !== modCheckbox.checked) {
        rel.title = game.modules.get(rel.id).title;
        acc.push(rel);
      }
      return acc;
    }, []);
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static async #startRun() {
    await this.#update({
      selected: this.#data.zero ? [] : [...this.#selected],
      currentStep: -1, //updateModListAndReload increments
      maxSteps: Math.ceil(Math.log2(this.data.original.size - this.#selected.size)) + 1,
      active: this.#data.original.difference(this.#selected),
    });
    this.#updateModListAndReload();
  }

  #reload() {
    if (this.#data.reloadAll) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }

  async #updateModListAndReload(list = new Set()) {
    list = list.difference(this.#data.selected);
    if (list.size === 1) return this.#renderFinalDialog(list.first());
    await this.#update({
      currentStep: this.#data.currentStep + 1,
    });
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    //everything except the selected list gets disabled (unless zero is passed)
    for (const modID of Object.keys(currentModList)) {
      if (modID === MODULE_ID) continue;
      currentModList[modID] = this.#data.selected.has(modID) && !this.#data.zero;
    }
    // list size will be zero for initial refresh as #startRun doesn't pass in this.#data.active
    if (list.size > 0) {
      const { active, inactive } = this.#splitMods(list);
      await this.#update({
        active,
        inactive,
      });
      for (const id of this.#data.active) currentModList[id] = true;
    }
    // debugger;
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    this.#reload();
  }

  #splitMods(list) {
    // remove selected from consideration
    const selected = this.#data.selected;
    list = list.difference(selected);
    const half = Math.ceil(list.size / 2);
    const inactive = new Set();
    const active = new Set();
    const depList = [...list].map((id) => ({
      id,
      deps: getDependencies(id),
    }));
    depList.sort((a, b) => b.deps.length - a.deps.length);
    let shuffled = false;
    do {
      if (depList[0].deps.length === 0 && !shuffled) {
        // all remaing should have no dependencies, we can randomize
        shuffleArray(depList);
        shuffled = true;
      }
      const pick = depList.shift();
      //some of our deps might have been put in active already by previous picks or be in the selected list
      const effectiveSize = 1 + pick.deps.filter((d) => !active.has(d) && !selected.has(d)).length;
      if (effectiveSize + active.size > half) {
        inactive.add(pick.id);
      } else {
        active.add(pick.id);
        for (const depID of pick.deps) {
          depList.findSplice((d) => d.id === depID);
          // don't add things already in the selected list back into the active list
          if (!selected.has(depID)) active.add(depID);
        }
      }
    } while (active.size < half);
    for (const dep of depList) inactive.add(dep.id);
    return { active, inactive };
  }

  doStep() {
    if (typeof this.#data.currentStep !== "number") return;
    if (this.#data.currentStep === 0) {
      if (this.#data.zero) this.#zeroModsDialog();
      else this.#onlySelectedMods();
    } else {
      this.#binarySearchStep();
    }
  }

  async #zeroModsDialog() {
    DialogV2.prompt({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: `${this.title} - Zero Modules`,
        icon: this.options.window.icon,
      },
      content: `<p>${game.i18n.localize("FindTheCulprit.StartOfRun.AllModulesDeactivated")}</p>`,
      ok: {
        icon: "fa-solid fa-list-check",
        label: "FindTheCulprit.ReactivateAllModules",
        callback: this.reactivateOriginals.bind(this),
      },
      rejectClose: false,
      position: {
        width: 450,
      },
    });
  }
  async #onlySelectedMods() {
    const template = `modules/${MODULE_ID}/templates/onlySelectedActive.hbs`;
    const content = await renderTemplate(template, {
      maxSteps: this.#data.maxSteps,
    });

    this.#persists = await DialogV2.confirm({
      window: {
        title: `${this.title} - Only Selected Modules`,
        icon: this.options.window.icon,
      },
      content,
      no: {
        label: game.i18n.localize("No") + " - " + game.i18n.localize("FILES.Search"),
        icon: "fa-solid fa-search",
      },
      classes: ["ftc-dialog", "find-the-culprit-app"],
      rejectClose: false,
      position: {
        width: 450,
      },
    });

    switch (this.#persists) {
      case true:
        this.#issuePeristsWithOnlySelected();
        break;
      case false:
        this.#updateModListAndReload(this.#data.active);
        break;
      case null:
      default:
        // allow closing the dialog without making a choice; it'll return on page refresh
        return;
    }
  }

  async #issuePeristsWithOnlySelected() {
    const template = `modules/${MODULE_ID}/templates/issuePersistsWithOnlySelected.hbs`;
    const content = await renderTemplate(template, {
      selected: this.#data.selected,
    });
    DialogV2.prompt({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: this.title,
        icon: this.options.window.icon,
      },
      content,
      ok: {
        icon: "fa-solid fa-list-check",
        label: "FindTheCulprit.ReactivateAllModules",
        callback: this.reactivateOriginals.bind(this),
      },
      rejectClose: false,
      position: {
        width: 450,
      },
    });
  }

  async #binarySearchStep() {
    const template = `modules/${MODULE_ID}/templates/binarySearchStep.hbs`;
    const templateData = {
      numRemaining: this.#data.active.size + this.#data.inactive.size,
      currentStep: this.#data.currentStep,
      stepsLeft: this.#data.maxSteps - this.#data.currentStep,
      active: this.#data.active,
      inactive: this.#data.inactive,
      selected: this.#data.selected,
    };
    const content = await renderTemplate(template, templateData);
    const response = await DialogV2.confirm({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: this.title,
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "reset",
          icon: "fa-solid fa-rotate-right",
          label: "Reset", //Actually a localization key
          callback: () => "reset",
        },
      ],
      rejectClose: false,
      position: {
        width: 450,
      },
    });
    switch (response) {
      case "reset":
        this.reactivateOriginals();
        break;
      case true:
        this.#updateModListAndReload(this.#data.active);
        break;
      case false:
        this.#updateModListAndReload(this.#data.inactive);
        break;
      case null:
      default:
        // allow closing the dialog without making a choice; it'll return on page refresh
        break;
    }
  }

  async #resetSetting() {
    const resetValue = fu.mergeObject(
      game.settings.settings.get(`${MODULE_ID}.data`).default,
      {
        lockLibraries: this.#data.lockLibraries,
        reloadAll: this.#data.reloadAll,
        mute: this.#data.mute,
      },
      { inplace: false }
    );

    return game.settings.set(MODULE_ID, "data", resetValue);
  }

  async reactivateOriginals() {
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    for (const id of this.#data.original) {
      currentModList[id] = true;
    }
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    await this.#resetSetting();
    this.#reload();
  }

  async #renderFinalDialog(culprit) {
    const template = `modules/${MODULE_ID}/templates/foundTheCulprit.hbs`;
    const content = await renderTemplate(template, {
      culprit,
      selected: this.#data.selected,
    });
    DialogV2.prompt({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: "FindTheCulprit.FindTheCulprit",
        icon: this.options.window.icon,
      },
      content,
      ok: {
        icon: "fa-solid fa-list-check",
        label: "FindTheCulprit.ReactivateAllModules",
        callback: this.reactivateOriginals.bind(this),
      },
      rejectClose: false,
      position: {
        width: 450,
      },
    });
  }
}
