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
          label: "FindTheCulprit.SelectMods.Action.zeroMods.Label",
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
    lockLibraries: ["fa-solid fa-lock-open", "fa-solid fa-lock"],
    mute: ["fa-solid fa-volume-high", "fa-solid fa-volume-xmark"],
    reloadAll: ["fa-solid fa-user", "fa-solid fa-users"],
    module: {
      active: "fa-solid fa-magnifying-glass-plus",
      culprit: "fa-solid fa-handcuffs",
      excluded: "fa-solid fa-ban",
      exonerated: "fa-solid fa-thumbs-up",
      exoneratedButActive: "fa-solid fa-check",
      forced: "fa-solid fa-lock",
      inactive: "fa-solid fa-magnifying-glass-minus",
      pinned: "fa-solid fa-thumbtack",
      suspect: "fa-solid fa-search",
    },
  };
  #search;
  #data;
  #error;

  #debouncedPlayLock = fu.debounce(this.#playLock.bind(this), 50);

  constructor() {
    if (MODULE().app2 instanceof FindTheCulpritAppV3)
      throw new Error("Only one FindTheCulprit app is allowed to exist.");
    super();
    this.#data = game.settings.get(MODULE_ID, "data2");

    this.#initializeToggleHeaderControls();

    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));

    // don't prepare modules if we're in an error state to preserve source
    // only prepare modules if we're not mid-run
    this.#error = game.settings.get(MODULE_ID, "error");
    if (this.#error === null && this.#data.currentStep === null) {
      this.#prepareModules();
    }
  }

  get #modules() {
    return Object.values(this.#data.modules).filter((m) => m.originallyActive);
  }

  async #prepareModules() {
    const activeModIDs = game.modules.filter((m) => m.active && m.id !== MODULE_ID).map((m) => m.id);
    const modules = this.#data.modules;
    //add all new modules and reset non-persistent properties
    for (const id of activeModIDs) {
      modules[id] ??= new FtCModuleModel({ id });
      modules[id].updateSource({
        originallyActive: true,
        dependencyOf: [],
        requires: [],
      });
    }
    // process dependencies and originallyActive status
    // has to be its own loop to guarantee all modules have models associated already
    for (const modID in modules) {
      // keep uninstalled modules state
      const mod = game.modules.get(modID);
      if (!mod || !mod.active) {
        modules[modID].updateSource({ originallyActive: false });
        continue;
      }
      const requires = this.#getAllDependencies(modID);
      modules[modID].updateSource({
        requires,
      });
      for (const reqID of modules[modID].requires) {
        if (!activeModIDs.includes(reqID)) {
          this.#errorDialog(
            `#prepareModules | Active module "${mod.title}" requires module ID "${reqID}" which is not active.`
          );
        }
        modules[reqID].updateSource({
          dependencyOf: modules[reqID].dependencyOf.add(modID),
        });
      }
    }
    // process inner datamodels so we don't pollute the source with complex objects
    for (const modID in modules) {
      modules[modID] = modules[modID].toObject();
    }
    return this.#update({ modules }, { render: false });
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
          const modID = li.dataset.module;
          const title = (li.querySelector(".module-title")?.textContent || "").trim();
          const match = rgx.test(SearchFilter.cleanQuery(modID)) || rgx.test(SearchFilter.cleanQuery(title));
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
    btn.addEventListener("click", () => {
      if (this.rendered) {
        this.bringToFront();
        if (this._minimized) this.maximize();
      } else this.render({ force: true });
    });
    footer.append(btn);
    app.setPosition();
  }

  async render(options = {}, _options = {}) {
    if (this.#data.currentStep !== null) return this.doStep();
    return super.render(options, _options);
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
    this.search.bind(this.element);
  }

  async #update(changes, { render = true, recursive = true } = {}) {
    changes ??= this.#data.toObject(false);
    try {
      this.#data.updateSource(changes, { recursive });
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
    const iconElement = target.querySelector("i");
    iconElement.classList.value = icons[value ? 1 : 0];
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #clearAll() {
    const update = {
      lockLibraries: false,
      modules: this.#modules.reduce((mods, data) => {
        mods[data.id] = {
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
    const states = ["suspect", "pinned", "excluded"];
    const newState =
      states[(states.indexOf(state) + (event.type === "contextmenu" ? -1 : 1) + states.length) % states.length];
    return this.#update({
      [`modules.${modID}.pinned`]: newState === "pinned" ? true : newState === "excluded" ? null : false,
    });
  }

  async _prepareContext(options = {}) {
    const context = {
      lockLibraries: {
        icon: this.#icons.lockLibraries[this.#data.lockLibraries ? 1 : 0],
        value: this.#data.lockLibraries,
      },
      reloadAll: {
        icon: this.#icons.reloadAll[this.#data.reloadAll ? 1 : 0],
        value: this.#data.reloadAll,
      },
      modules: this.#modules
        .map((data) => {
          const mod = game.modules.get(data.id);
          const pinnedDependants = data.dependencyOf.filter((modID) => this.#data.modules[modID].pinned);
          const isLockedLibrary = mod.library && this.#data.lockLibraries;
          const state =
            pinnedDependants.size > 0 || isLockedLibrary
              ? "forced"
              : data.pinned === null
              ? "excluded"
              : data.pinned
              ? "pinned"
              : "suspect";

          return {
            id: data.id,
            title: mod.title,
            icon: this.#icons.module[state],
            state,
            pinnedDependants:
              pinnedDependants.size > 0
                ? oxfordList([...pinnedDependants.map((d) => game.modules.get(d).title)], { and: "&" })
                : null,
            isLockedLibrary,
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    return context;
  }
  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #zeroMods() {
    await this.#update({ zero: true }, { render: false });
    FindTheCulpritAppV3.#startRun.call(this);
  }

  /**
   * @this {FindTheCulpritAppV3}
   */
  static async #startRun(event, form, formData) {
    const forcedList = Array.from(this.element.querySelectorAll(`button[data-state="forced"]`)).map(
      (n) => n.closest("[data-module]").dataset.module
    );
    const modUpdate = {};
    for (const id of forcedList) {
      // updateSource so searchablesCount is accurate
      modUpdate[id] = this.#data.modules[id].updateSource({
        pinned: true,
        priorPinned: this.#data.modules[id].pinned,
      });
    }
    // searchables aren't pinned (true) or excluded (null) and aren't exonerated
    const searchablesCount = this.#modules.filter((m) => m.pinned === false && m.active !== null).length;
    await this.#update(
      {
        modules: modUpdate,
        currentStep: -1, // updateModListAndReload increments
        maxSteps: Math.ceil(Math.log2(searchablesCount)) + 1,
      },
      { render: false }
    );
    this.#updateModListAndReload();
  }

  #reload() {
    if (this.#data.reloadAll) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }

  async #updateModListAndReload(culpritInActiveHalf = true) {
    if (this.#data.currentStep === null) return;

    const active = this.#modules.filter((m) => m.pinned === false && m.active === true);
    const inactive = this.#modules.filter((m) => m.pinned === false && m.active === false);
    const [newlyExonerated, remainingSearchables] = culpritInActiveHalf ? [inactive, active] : [active, inactive];
    if (remainingSearchables.length === 1) return this.#renderFinalDialog(remainingSearchables[0].id);

    const coreModuleList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    // Disable every module that isn't pinned. If zero is passed, disable those too.
    for (const modID in coreModuleList) {
      if (modID === MODULE_ID) continue;
      const activeMod = this.#modules.find((m) => m.id === modID);
      coreModuleList[modID] = activeMod && activeMod.pinned && !this.#data.zero;
    }

    const initialUpdate = {
      currentStep: this.#data.currentStep + 1,
    };

    const afterSplitUpdate = {};
    for (const mod of newlyExonerated) {
      afterSplitUpdate[mod.id] = mod.updateSource({ active: null });
    }

    if (this.#data.currentStep === -1 && this.#modules.some((m) => m.pinned)) {
      // on run start, filter pinned modules from requires listings, since pinned state wont change from here
      initialUpdate.modules = {};
      for (const mod of this.#modules) {
        initialUpdate.modules[mod.id] = mod.updateSource({
          requires: mod.requires.filter((id) => !this.#data.modules[id].pinned),
        });
      }
    }
    // update requires/dependencyOf prior to any list splitting
    await this.#update(initialUpdate, { render: false });

    // Only split active mods *after* step 0, which is 'only pinned active' or 'zero mods active'
    if (this.#data.currentStep > 0) {
      //TODO: possibly add options for deterministic and/or fully dumb searching
      // create filtered requires/dependencyOf lists for use in sorting remainingSearchables and costing picks when splitting
      for (const mod of remainingSearchables) {
        mod.filteredRequires = mod.requires.filter((id) => this.#data.modules[id].active !== null);
        mod.filteredDependencyOf = mod.dependencyOf.filter((id) => this.#data.modules[id].active !== null);
      }
      // We want to pick mods with larger requires lists first, to more easily fit their dependencies in with them
      // We also otherwise want to test modules that are dependencyOf other modules first so that they can go into the
      // exonerated but active list, if not already pinned.
      remainingSearchables.sort(
        (a, b) =>
          b.filteredRequires.size - a.filteredRequires.size || b.filteredDependencyOf.size - a.filteredDependencyOf.size
      );
      let shuffled = false;
      const newActive = [];
      const newInactive = [];
      const half = Math.ceil(remainingSearchables.length / 2);
      const exoneratedModulesRequired = new Set();
      // divide the remaining searchables, attempting to keep dependency chains together as long as possible
      // and cutting from the top when impossible
      debugger;
      do {
        if (
          !this.#data.deterministic &&
          remainingSearchables[0].filteredRequires.size + remainingSearchables[0].filteredDependencyOf.size === 0 &&
          !shuffled
        ) {
          // all remaing should have no, and not be, dependencies, so we can randomize
          shuffleArray(remainingSearchables);
          shuffled = true;
        }
        const pick = remainingSearchables.shift();
        // some of our deps might have been put in active already by previous picks
        // so we only care about the number of *new* deps coming along
        // dependencies that are already exonerated also don't cost anything from a search perspective
        let effectiveSize = 1;
        const unpickedDependencyIDs = [];
        const exoneratedDependencyIDs = [];
        for (const id of pick.requires) {
          if (newActive.find((m) => m.id === id)) {
            // already picked, no cost, no action required
            continue;
          } else if (this.#data.modules[id].active === null) {
            // store for activation *if* pick goes to newActive
            exoneratedDependencyIDs.push(id);
            continue;
          } else if (newInactive.find((m) => m.id === id)) {
            // this should never happen
            //TODO: error dialog
            debugger;
          } else {
            unpickedDependencyIDs.push(id);
            effectiveSize++;
          }
        }
        if (effectiveSize + newActive.length > half) {
          newInactive.push(pick);
        } else {
          newActive.push(pick);
          for (const depID of unpickedDependencyIDs) {
            const depData = remainingSearchables.findSplice((m) => m.id === depID);
            if (depData) {
              newActive.push(depData);
            } else {
              this.#errorDialog(
                `#updateModListAndReload | Module "${
                  game.modules.get(pick.id).title
                }" requires module ID "${depID}" which is not in the current Searchable or Exonerated modules.`
              );
              return;
            }
          }
          for (const id of exoneratedDependencyIDs) exoneratedModulesRequired.add(id);
        }
      } while (newActive.length < half);

      // consolidate unpicked modules
      newInactive.push(...remainingSearchables);

      for (const modData of newInactive) {
        afterSplitUpdate[modData.id] = { active: false };
      }
      for (const modData of newActive) {
        afterSplitUpdate[modData.id] = { active: true };
      }
      const modIDsToEnable = newActive.map((m) => m.id).concat([...exoneratedModulesRequired]);
      for (const id of modIDsToEnable) coreModuleList[id] = true;
      debugger;
    }
    await this.#update({ modules: afterSplitUpdate }, { render: false });
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, coreModuleList);
    this.#reload();
  }

  doStep() {
    if (typeof this.#data.currentStep !== "number") return;
    if (this.#error !== null) return void this.#errorDialog();
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
        title: `${this.title} - ${game.i18n.localize("FindTheCulprit.ZeroModules.Title")}`,
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
    const template = `modules/${MODULE_ID}/templates/onlySelectedActive3.hbs`;
    const anyPinned = this.#modules.filter((m) => m.pinned).length > 0;
    const content = await renderTemplate(template, {
      anyPinned, // we only care about some or none pinned
      maxSteps: this.#data.maxSteps,
    });
    const titleKey = "FindTheCulprit.StartOfRun." + (anyPinned ? "Some" : "None") + "PinnedTitle";
    const persists = await DialogV2.confirm({
      window: {
        title: `${this.title} - ${game.i18n.localize(titleKey)}`,
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
    const template = `modules/${MODULE_ID}/templates/issuePersistsWithOnlySelected3.hbs`;
    const content = await renderTemplate(template, {
      pinned: this.#modules
        .filter((m) => m.pinned)
        .map((m) => ({
          id: m.id,
          icon: m.priorPinned === undefined ? "fa-thumbtack" : "fa-lock",
        })),
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
    const template = `modules/${MODULE_ID}/templates/binarySearchStep3.hbs`;
    const templateData = {
      numRemaining: this.#modules.filter((m) => m.pinned === false && m.active !== null).length,
      currentStep: this.#data.currentStep,
      stepsLeft: this.#data.maxSteps - this.#data.currentStep,
      icons: this.#icons.module,
      groups: this.#modules.reduce(
        (groups, mod) => {
          if (mod.pinned === null) {
            groups.excluded.push(mod);
          } else if (mod.pinned === true) {
            groups.pinned.push(mod);
          } else if (mod.active === null) {
            if (game.modules.get(mod.id).active) groups.exoneratedButActive.push(mod);
            else groups.exonerated.push(mod);
          } else if (mod.active === true) {
            groups.active.push(mod);
          } else {
            groups.inactive.push(mod);
          }
          return groups;
        },
        {
          active: [],
          exoneratedButActive: [],
          inactive: [],
          pinned: [],
          exonerated: [],
          excluded: [],
        }
      ),
    };
    for (const group in templateData.groups) {
      templateData.groups[group].sort((a, b) =>
        game.modules.get(a.id).title.localeCompare(game.modules.get(b.id).title)
      );
    }
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
          icon: "fa-solid fa-list-check",
          label: "FindTheCulprit.ReactivateAllModules",
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
      case false:
        this.#updateModListAndReload(response);
        break;
      case null:
      default:
        // allow closing the dialog without making a choice; it'll return on page refresh
        break;
    }
  }

  async #resetSetting() {
    const update = {
      modules: this.#modules.reduce((modUpdate, modData) => {
        modUpdate[modData.id] = {
          active: true,
          pinned: modData.priorPinned === undefined ? modData.pinned : modData.priorPinned,
          priorPinned: undefined,
        };
        return modUpdate;
      }, {}),
      zero: false,
      currentStep: null,
      maxSteps: 0,
    };
    await game.settings.set(MODULE_ID, "error", null);
    return this.#update(update);
  }

  async reactivateOriginals() {
    const currentModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    for (const modID in this.#data.modules) {
      if (this.#data.modules[modID].originallyActive) currentModList[modID] = true;
    }
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, currentModList);
    await this.#resetSetting();
    this.#reload();
  }

  async #renderFinalDialog(culprit) {
    const template = `modules/${MODULE_ID}/templates/foundTheCulprit3.hbs`;
    const content = await renderTemplate(template, {
      culprit,
      pinned: this.#modules.filter((m) => m.pinned),
      icons: this.#icons.module,
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

  async #errorDialog(message) {
    if (message === undefined) {
      message = this.#error;
    } else {
      this.#error = message;
      await game.settings.set(MODULE_ID, "error", message);
    }
    if (!message) return;

    const source = this.#data.toObject();
    // for (const id in source.modules) source.modules[id] = source.modules[id].toObject();

    console.error("Find The Culprit | Error encountered, dumping source.", source);
    const content = await renderTemplate(`modules/${MODULE_ID}/templates/errorDialog.hbs`, {
      message,
    });
    DialogV2.prompt({
      window: {
        title: this.title + ` - ` + game.i18n.localize("Error"),
        icon: this.options.window.icon,
      },
      content,
      ok: {
        icon: "fa-solid fa-list-check",
        label: "FindTheCulprit.ReactivateAllModules",
        callback: this.reactivateOriginals.bind(this),
      },
      close: this.reactivateOriginals.bind(this),
      position: {
        width: 450,
      },
    });
    throw new Error(message);
  }
}
