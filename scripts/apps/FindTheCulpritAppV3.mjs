import { fu, MODULE, MODULE_ID } from "../constants.mjs";
import { FtCModuleModel } from "../data/models.mjs";
import { actionLabel, actionTooltip, debug, getDependencies, oxfordList, shuffleArray } from "../helpers.mjs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class FindTheCulpritAppV3 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: FindTheCulpritAppV3.#startRun,
      closeOnSubmit: true,
      submitOnChange: false,
    },
    classes: ["find-the-culprit-app3", "standard-form"],
    id: "find-the-culprit",
    position: {
      width: 450,
    },
    actions: {
      clearAll: FindTheCulpritAppV3.#clearAll,
      lockLibraries: FindTheCulpritAppV3.#toggleButton,
      mute: FindTheCulpritAppV3.#toggleMute,
      reloadAll: FindTheCulpritAppV3.#toggleButton,
      zeroMods: FindTheCulpritAppV3.#zeroMods,
      cycle: {
        buttons: [0, 2],
        handler: FindTheCulpritAppV3.#cycle,
      },
    },
    window: {
      title: "FindTheCulprit.FindTheCulprit",
      icon: "fa-solid fa-search",
      controls: [
        {
          action: "mute", // the rest is handled in initializeToggleControls()
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
      template: `modules/${MODULE_ID}/templates/main3.hbs`,
      scrollable: [".ftc-module-list"],
    },
  };

  #icons = {
    lockLibraries: ["fa-lock-open", "fa-lock"],
    mute: ["fa-volume-high", "fa-volume-xmark"],
    reloadAll: ["fa-user", "fa-users"],
    module: {
      search: "fa-search",
      pinned: "fa-thumbtack",
      excluded: "fa-ban",
      forced: "fa-lock",
    },
  };
  #search;
  #data;
  #debouncedPlayLock = fu.debounce(this.#playLock.bind(this), 50);

  constructor() {
    if (MODULE().app2 instanceof FindTheCulpritAppV3)
      throw new Error("Only one FindTheCulprit app is allowed to exist.");
    super();

    this.#data = game.settings.get(MODULE_ID, "data2");

    this.#initializeToggleHeaderControls();

    if (this.#data.currentStep === null) {
      this.#prepareModules();
    }

    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));
  }

  #getAllDependencies(mod) {
    const allDeps = new Set();
    mod = mod instanceof foundry.packages.BaseModule ? mod : game.modules.get(mod?.id) ?? game.modules.get(mod);
    const modDeps = mod.relationships.requires.filter((r) => r.type === "module").map((r) => r.id);
    for (const req of modDeps) {
      allDeps.add(req);
      const depDeps = this.#getAllDependencies(req);
      depDeps.forEach((m) => allDeps.add(m));
    }
    return allDeps;
  }

  async #prepareModules() {
    const activeModIDs = game.modules.filter((m) => m.active && m.id !== MODULE_ID).map((m) => m.id);
    const modules = fu.deepClone(this.#data.modules);
    // debug('modules as saved ', modules)
    //prune all disabled modules first so we have a list to remove from dependcyOf
    const disabledSinceLastLoad = Object.keys(this.#data.modules).filter((modID) => !activeModIDs.includes(modID));
    for (const modID of disabledSinceLastLoad) {
      delete modules[modID];
      modules[`-=${modID}`] = true;
    }
    //add all new modules and reset non-persistent properties
    for (const modID of activeModIDs) {
      modules[modID] ??= new FtCModuleModel({ id: modID });
      modules[modID].updateSource({
        dependencyOf: [],
        requires: [],
      });
    }

    //process dependencies - has to be its own loop to guarantee all modules have a dependencyOf set to add to
    for (const modID in modules) {
      if (modID.startsWith("-=")) continue;
      modules[modID].updateSource({
        requires: this.#getAllDependencies(modID),
      });
      for (const reqID of modules[modID].requires) {
        if (!activeModIDs.includes(reqID)) {
          ui.notifications.error(
            `Find The Culprit | Active module ${mod.title} requires module "${reqID}" which is not active. This should never happen.`
          );
          continue;
        }
        modules[reqID].updateSource({
          dependencyOf: modules[reqID].dependencyOf.add(modID),
        });
      }
    }
    debug("preparing modules", modules);
    return this.#update({ modules }, { render: false });
  }

  #initializeToggleHeaderControls() {
    for (const control of this.options.window.controls) {
      const action = control.action;
      if (action in this.#icons) {
        const value = this.#data[action];
        control.label = actionLabel(action, value);
        control.icon = `fa-solid ${this.#icons[action][value ? 1 : 0]}`;
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
            li.classList.remove("ftc-hidden");
            continue;
          }
          const name = li.dataset.module;
          const title = (li.querySelector(".module-title")?.textContent || "").trim();
          const match = rgx.test(SearchFilter.cleanQuery(name)) || rgx.test(SearchFilter.cleanQuery(title));
          li.classList.toggle("ftc-hidden", !match);
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
    btn.innerHTML = `<i class="fa-solid fa-search"></i> ${game.i18n.localize("FindTheCulprit.FindTheCulprit")}*`;
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

  async #update(changes, { render = true, recursive = true } = {}) {
    changes ??= this.#data.toObject(false);
    try {
      const beforeUpdate = this.#data.toObject();
      for (const modID in beforeUpdate.modules) {
        beforeUpdate.modules[modID] = beforeUpdate.modules[modID].toObject();
      }
      debug("changes for update, initial state", changes, beforeUpdate);
      this.#data.updateSource(changes, { recursive });
      const afterUpdate = this.#data.toObject();
      for (const modID in afterUpdate.modules) {
        afterUpdate.modules[modID] = afterUpdate.modules[modID].toObject();
      }
      debug("after update, diff", afterUpdate, fu.diffObject(beforeUpdate, afterUpdate));
      if (render) this.render();
      return game.settings.set(MODULE_ID, "data2", this.#data);
    } catch (error) {
      console.error("FindTheCulpritApp#update | ", error, { changes });
    }
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #toggleButton(event, target) {
    const action = target.dataset.action;
    const newValue = !this.#data[action];
    await this.#update({ [action]: newValue });
    if (action === "mute" || (newValue && action === "lockLibraries")) this.#debouncedPlayLock();
    return newValue;
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #toggleMute(event, target) {
    await this.#update({ mute: !this.#data.mute });
    this.#debouncedPlayLock();
    console.warn(target);
    this.#toggleButtonDOM(target);
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
    icons ??= this.#icons[action];
    const iconElement = target.querySelector("i.fa-solid");
    const priorIcon = icons[value ? 0 : 1];
    const newIcon = icons[value ? 1 : 0];
    iconElement.classList.remove(priorIcon);
    iconElement.classList.add(newIcon);
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #clearAll() {
    const update = {
      lockLibraries: false,
      modules: Object.entries(this.#data.modules).reduce((mods, [modID, data]) => {
        mods[modID] = {
          pinned: false,
        };
        return mods;
      }, {}),
    };
    await this.#update(update);
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #cycle(event, target) {
    const modID = target.closest("[data-module]").dataset.module;
    const state = target.dataset.state;
    const states = ["search", "pinned", "excluded"];
    const newState =
      states[(states.indexOf(state) + (event.type === "contextmenu" ? -1 : 1) + states.length) % states.length];
    debug("cycle", { modID, state, newState });
    return this.#update({
      [`modules.${modID}.pinned`]: newState === "pinned" ? true : newState === "excluded" ? null : false,
    });
  }

  #findPinnedDependants(data) {
    const effectivelyPinnedIDs = new Set();
    for (const dID of data.dependencyOf) {
      if (this.#data.modules[dID].pinned) effectivelyPinnedIDs.add(dID);
      this.#findPinnedDependants(this.#data.modules[dID]).forEach((id) => effectivelyPinnedIDs.add(id));
    }
    return effectivelyPinnedIDs;
  }

  async _prepareContext(options = {}) {
    // debug("before deps", this.#data.modules);
    // this.#processDependencies();
    // debug("after deps", this.#data.modules);
    const modEntries = Object.entries(this.#data.modules);
    const context = {
      lockLibraries: {
        icon: this.#icons.lockLibraries[this.#data.lockLibraries ? 1 : 0],
        value: this.#data.lockLibraries,
      },
      reloadAll: {
        icon: this.#icons.reloadAll[this.#data.reloadAll ? 1 : 0],
        value: this.#data.reloadAll,
      },
      modules: modEntries
        .reduce((mods, [modID, data]) => {
          const mod = game.modules.get(modID);
          const pinnedDependants = this.#findPinnedDependants(data);
          const isLockedLibrary = mod.library && this.#data.lockLibraries;
          const state =
            pinnedDependants.size > 0 || isLockedLibrary
              ? "forced"
              : data.pinned === null
              ? "excluded"
              : data.pinned
              ? "pinned"
              : "search";

          const modData = {
            id: mod.id,
            title: mod.title,
            icon: this.#icons.module[state],
            state,
            pinnedDependants:
              pinnedDependants.size > 0
                ? oxfordList([...pinnedDependants.map((d) => game.modules.get(d).title)], { and: "&" })
                : null,
            isLockedLibrary,
          };

          mods.push(modData);
          return mods;
        }, [])
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    return context;
  }
  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #zeroMods() {
    await this.#update({ zero: true });
    FindTheCulpritAppV3.#startRun.call(this);
  }

  _onClickAction(event, target) {
    debug(event, target);
  }

  _preRender(context, options) {
    // only bother on the Select Mods window, and only on 2nd+ render
    if (this.#data.currentStep !== null || options.isFirstRender) return;
    for (const modData of context.modules) {
      modData.hidden =
        this.element.querySelector(`li[data-module="${modData.id}"]`)?.classList?.contains("ftc-hidden") ?? false;
    }
  }

  _onRender(context, options) {
    //bind the searchfilter
    this.search.bind(this.element);
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #startRun(event, form, formData) {
    const forcedList = Array.from(this.element.querySelectorAll(`button[data-state="forced"]`)).map(
      (n) => n.closest("[data-module]").dataset.module
    );
    debug("v3 start run", forcedList);
    for (const id of forcedList) {
      this.#data.modules[id].updateSource({
        pinned: true,
        priorPinned: this.#data.modules[id].pinned,
      });
    }
    const searchableCount = Object.values(this.#data.modules).filter((d) => !d.pinned).length;
    await this.#update({
      modules: this.#data.modules,
      currentStep: -1, //updateModListAndReload increments
      maxSteps: Math.ceil(Math.log2(searchableCount)) + 1,
    });
    debugger;
    this.#updateModListAndReload();
  }

  #reload() {
    if (this.#data.reloadAll) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }

  async #updateModListAndReload(culpritInActiveHalf = true) {
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    // can't be a simple .partition() because active === false means 'passed'
    const { active, inactive } = Object.values(this.#data.modules).reduce(
      (acc, modData) => {
        if (modData.active === true) acc.active.push(modData);
        else if (modData.active === false) acc.inactive.push(modData);
        return acc;
      },
      { active: [], inactive: [] }
    );

    if (active.length === 1) return this.#renderFinalDialog(active[0].id);

    await this.#update({
      currentStep: this.#data.currentStep + 1,
    });

    //Disable every module that isn't pinned. If zero is passed, disable those too.
    for (const modID in currentModList) {
      if (modID === MODULE_ID) continue;
      currentModList[modID] = this.#data.modules[modID]?.pinned && !this.#data.zero;
    }

    // Only split active mods *after* step 0, which is 'only pinned active' or 'zero mods active'
    if (currentStep > 0) {
      const [newlyPassed, remainingSearchables] = culpritInActiveHalf ? [inactive, active] : [active, inactive];
      for (const mod of newlyPassed) {
        mod.updateSource({ active: null });
      }

      for (const mod of remainingSearchables) {
        mod.unpinnedDependencies = mod.requires.filter((r) => !this.#data.modules[r].pinned);
      }
      remainingSearchables.sort((a, b) => b.unpinnedDependencies.size - a.unpinnedDependencies.size);
      let shuffled = false;
      const newActive = [];
      const newInactive = [];
      const half = Math.ceil(remainingSearchables.length / 2);
      // divide the remaining searchables, attempting to keep dependency chains together as long as possible
      // and cutting from the top when impossible
      do {
        if (remainingSearchables[0].unpinnedDependencies.size === 0 && !shuffled) {
          // all remaing should have no dependencies, we can randomize
          shuffleArray(remainingSearchables);
          shuffled = true;
        }
        const pick = remainingSearchables.shift();
        //some of our deps might have been put in active already by previous picks or be in the selected list
        const effectiveSize =
          1 + pick.unpinnedDependencies.filter((depID) => !newActive.find((modData) => modData.id === depID)).length;
        if (effectiveSize + newActive.length > half) {
          newInactive.push(pick);
        } else {
          newActive.push(pick);
          for (const depID of pick.unpinnedDependencies) {
            const depData = remainingSearchables.findSplice((modData) => modData.id === depID);
            if (depData) newActive.push(depData);
          }
        }
      } while (newActive.length < half);

      for (const modData of newInactive) modData.updateSource({ active: false });
      for (const modData of newActive) currentModList[modData.id] = true;
      await this.#update();
    }
    debugger;
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    this.#reload();
  }

  doStep() {
    debug("V3 do step");
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
      classes: ["ftc-dialog", "find-the-culprit-app3"],
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

    const persists = await DialogV2.confirm({
      window: {
        title: `${this.title} - Only Selected Modules`,
        icon: this.options.window.icon,
      },
      content,
      no: {
        label: game.i18n.localize("No") + " - " + game.i18n.localize("FILES.Search"),
        icon: "fa-solid fa-search",
      },
      classes: ["ftc-dialog", "find-the-culprit-app3"],
      rejectClose: false,
      position: {
        width: 450,
      },
    });

    switch (persists) {
      case true:
        this.#issuePeristsWithOnlySelected();
        break;
      case false:
        this.#updateModListAndReload();
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
      classes: ["ftc-dialog", "find-the-culprit-app3"],
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
      classes: ["ftc-dialog", "find-the-culprit-app3"],
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
    for (const modData of Object.values(this.#data.modules)) {
      modData.updateSource({
        pinned: modData.priorPinned === undefined ? modData.pinned : modData.priorPinned,
        priorPinned: undefined,
      });
    }
    const update = {
      modules: this.#data.modules,
      zero: false,
      currentStep: null,
      maxSteps: 0,
    };
    return this.#update(update);
  }

  async reactivateOriginals() {
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    for (const id of Object.keys(this.#data.modules)) {
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
      classes: ["ftc-dialog", "find-the-culprit-app3"],
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
