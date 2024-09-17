import { MODULE, MODULE_ID } from "../constants.mjs";
import { FtCModule } from "../data/models.mjs";
import { debug, oxfordList, shuffleArray } from "../helpers.mjs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const standardWidth = 425;
export class FindTheCulpritApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: FindTheCulpritApp.#startRun,
      closeOnSubmit: true,
      submitOnChange: false,
    },
    classes: ["find-the-culprit-app", "standard-form"],
    id: "find-the-culprit",
    position: {
      width: standardWidth,
    },
    actions: {
      clearAll: FindTheCulpritApp.#clearAll,
      lockLibraries: FindTheCulpritApp.#toggleButton,
      deterministic: FindTheCulpritApp.#toggleButton,
      mute: FindTheCulpritApp.#toggleButton,
      reloadAll: FindTheCulpritApp.#toggleButton,
      zeroMods: FindTheCulpritApp.#zeroMods,
      cycle: {
        buttons: [0, 2],
        handler: FindTheCulpritApp.#cycle,
      },
    },
    window: {
      title: "FindTheCulprit.FindTheCulprit",
      icon: "fa-solid fa-search",
      controls: [
        {
          action: "zeroMods",
          icon: "fa-solid fa-table-list",
          label: "FindTheCulprit.SelectMods.Action.zeroMods.Label",
        },
        {
          action: "mute", // the rest is handled in initializeToggleControls()
        },
        {
          action: "deterministic",
          giveTooltip: true,
        },
      ],
    },
  };

  static PARTS = {
    form: {
      id: "form",
      template: `modules/${MODULE_ID}/templates/main.hbs`,
      scrollable: [".ftc-module-list"],
    },
  };

  #icons = {
    deterministic: ["fa-shuffle", "fa-bars"],
    lockLibraries: ["fa-lock-open", "fa-lock"],
    mute: ["fa-volume-high", "fa-volume-xmark"],
    reloadAll: ["fa-user", "fa-users"],
    module: {
      active: "fa-magnifying-glass-plus",
      culprit: "fa-handcuffs",
      excluded: "fa-ban",
      exonerated: "fa-thumbs-up",
      exoneratedButActive: "fa-check",
      inactive: "fa-magnifying-glass-minus",
      pinned: "fa-thumbtack",
      suspect: "fa-search",
    },
  };
  #search;
  #data;
  #error;
  #dialog;

  constructor() {
    if (MODULE().app instanceof FindTheCulpritApp) throw new Error("Only one FindTheCulprit app is allowed to exist.");
    super();
    this.#data = game.settings.get(MODULE_ID, "data");

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
      modules[id] ??= new FtCModule({ id });
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
        control.label = `FindTheCulprit.SelectMods.Action.${action}.Label.${value ? "Enabled" : "Disabled"}`;
        control.icon = `fa-solid ${this.#icons[action][value ? 1 : 0]}`;
      }
    }
  }

  #playLock(locking = true) {
    if (this.#data.mute) return;
    foundry.audio.AudioHelper.play({
      src: `sounds/doors/industrial/${locking ? "" : "un"}lock.ogg`,
      volume: game.settings.get("core", "globalInterfaceVolume"),
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
    btn.innerHTML = `<i class="fa-solid fa-search"></i> ${game.i18n.localize("FindTheCulprit.FindTheCulprit")}`;
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
    if (this.#data.currentStep !== null) {
      this.doStep();
      return this;
    }
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

  _renderHeaderControl(control) {
    debug("rendering control", control);
    const li = super._renderHeaderControl(control);
    const action = control.action;
    const isToggle = action in this.#icons;
    const value = isToggle ? this.#data[action] : undefined;
    if (control.giveTooltip) {
      const localizationKey =
        `FindTheCulprit.SelectMods.Action.${action}.Tooltip` + (isToggle ? (value ? ".Enabled" : ".Disabled") : "");
      li.dataset.tooltip = game.i18n.localize(localizationKey);
    }
    if (isToggle) {
      const icons = this.#icons[action];
      const iconElement = li.querySelector("i.control-icon");
      const [oldIcon, newIcon] = value ? icons : icons.toReversed();
      iconElement.classList.remove(oldIcon);
      iconElement.classList.add(newIcon);
      const labelSpan = li.querySelector("button span");
      labelSpan.innerText = game.i18n.localize(
        `FindTheCulprit.SelectMods.Action.${action}.Label.${value ? "Enabled" : "Disabled"}`
      );
    }
    return li;
  }

  _onRender(context, options) {
    this.search.bind(this.element);
  }

  async #update(changes = {}, { render = true, renderOptions = {} } = {}) {
    try {
      this.#data.updateSource(changes);
      if (render) this.render(renderOptions);
      return game.settings.set(MODULE_ID, "data", this.#data);
    } catch (error) {
      console.error("FindTheCulpritApp#update | Encountered an error, logging", { changes, render });
      throw error;
    }
  }

  /**
   * @this {FindTheCulpritApp}
   */
  static async #toggleButton(event, target) {
    const action = target.dataset.action;
    const newValue = !this.#data[action];
    const updateControls = !!this.options.window.controls.find((c) => c.action === action);
    await this.#update(
      { [action]: newValue },
      // only rerender the header controls if this was a header control toggle
      { renderOptions: { window: { ...(updateControls && { controls: updateControls }) } } }
    );
    if (action === "lockLibraries") this.#playLock(newValue);
    if (action === "mute") this.#playLock(true);
    return newValue;
  }

  /**
   * @this {FindTheCulpritApp}
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
   * @this {FindTheCulpritApp}
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

  async _prepareContext() {
    const context = {
      lockLibraries: {
        icon: this.#icons.lockLibraries[this.#data.lockLibraries ? 1 : 0],
        value: this.#data.lockLibraries,
      },
      reloadAll: {
        icon: this.#icons.reloadAll[this.#data.reloadAll ? 1 : 0],
        value: this.#data.reloadAll,
      },
      icons: this.#icons,
      modules: this.#modules
        .map((data) => {
          const { library, title } = game.modules.get(data.id);
          const pinnedDependants = data.dependencyOf.filter((id) => this.#data.modules[id].pinned);
          const excludedDependencies = data.requires.filter((id) => this.#data.modules[id].pinned === null);
          const isLockedLibrary = library && this.#data.lockLibraries;
          let state;
          let forced = false;
          if (pinnedDependants.size > 0 || isLockedLibrary) {
            state = "pinned";
            forced = true;
          } else if (excludedDependencies.size > 0) {
            state = "excluded";
            forced = true;
          } else {
            switch (data.pinned) {
              case null:
                state = "excluded";
                break;
              case true:
                state = "pinned";
                break;
              case false:
              default:
                state = "suspect";
            }
          }

          return {
            id: data.id,
            title,
            state,
            forced,
            excludedDependencies,
            excludedDependenciesFormatted:
              excludedDependencies.size > 0
                ? oxfordList([...excludedDependencies.map((id) => game.modules.get(id).title)], { and: "&" })
                : null,
            pinnedDependants,
            pinnedDependantsFormatted:
              pinnedDependants.size > 0
                ? oxfordList([...pinnedDependants.map((id) => game.modules.get(id).title)], { and: "&" })
                : null,
            isLockedLibrary,
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    // account for 'excluded' dependencies being force pinned because library or pinned dependant
    const mightNeedUpdating = context.modules.filter(
      (m) => m.forced && m.state === "excluded" && m.excludedDependencies.size > 0
    );
    for (const mod of mightNeedUpdating) {
      const stillExcluded = mod.excludedDependencies.filter(
        (id) => context.modules.find((m) => m.id === id).state === "excluded"
      );
      if (stillExcluded.size === 0) {
        // previous state couldn't be pinned, logistically
        mod.state = this.#data.modules[mod.id].pinned === null ? "excluded" : "suspect";
        mod.forced = false;
      }
    }
    return context;
  }
  /**
   * @this {FindTheCulpritApp}
   */
  static async #zeroMods() {
    await this.#update({ zero: true }, { render: false });
    FindTheCulpritApp.#startRun.call(this);
  }

  /**
   * @this {FindTheCulpritApp}
   */
  static async #startRun(event, form, formData) {
    const modUpdate = {};
    if (this.rendered) {
      const forcedList = Array.from(this.element.querySelectorAll(`button[disabled]`)).map((n) => ({
        id: n.closest("[data-module]").dataset.module,
        state: n.dataset.state,
      }));

      for (const mod of forcedList) {
        // updateSource so searchablesCount is accurate
        modUpdate[mod.id] = this.#data.modules[mod.id].updateSource({
          // forced will only be pinned or excluded, there's no 'forced suspect'
          pinned: mod.state === "pinned" ? true : null,
          priorPinned: this.#data.modules[mod.id].pinned,
        });
      }
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
    if (remainingSearchables.length === 1) {
      this.#dialog = null;
      return this.#foundTheCulprit(remainingSearchables[0]);
    }

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
            if (MODULE().debug) debugger;
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
      // if (MODULE().debug) debugger;
    }
    await this.#update({ modules: afterSplitUpdate }, { render: false });
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, coreModuleList);
    this.#reload();
  }

  async doStep() {
    if (typeof this.#data.currentStep !== "number") return;
    if (this.#error !== null) return this.#errorDialog();
    if (this.#dialog) {
      await this.#dialog.render({ force: true });
      this.#dialog.bringToFront();
      return;
    }
    if (this.#data.currentStep === 0) {
      if (this.#data.zero) this.#zeroModsDialog();
      else this.#onlyPinnedMods();
    } else {
      this.#binarySearchStep();
    }
  }

  async #zeroModsDialog() {
    if (this.#dialog) return this.#dialog.render({ force: true });
    this.#dialog ??= new DialogV2({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: `${this.title} - ${game.i18n.localize("FindTheCulprit.ZeroModules.Title")}`,
        icon: this.options.window.icon,
      },
      content: `<p>${game.i18n.localize("FindTheCulprit.StartOfRun.AllModulesDeactivated")}</p>`,
      buttons: [
        {
          action: "reset",
          icon: "fa-solid fa-rotate-left",
          label: "Reset",
          callback: this.reactivateOriginals.bind(this),
        },
      ],
      close: () => null,
      position: {
        width: standardWidth,
      },
    }).render({ force: true });
  }

  async #onlyPinnedMods() {
    if (this.#dialog) return this.#dialog.render({ force: true });
    const template = `modules/${MODULE_ID}/templates/onlySelectedActive.hbs`;
    const anyPinned = this.#modules.filter((m) => m.pinned).length > 0;
    const content = await renderTemplate(template, {
      anyPinned, // we only care about some or none pinned
      maxSteps: this.#data.maxSteps,
    });
    const titleKey = "FindTheCulprit.StartOfRun." + (anyPinned ? "Some" : "None") + "PinnedTitle";
    this.#dialog = await new DialogV2({
      window: {
        title: `${this.title} - ${game.i18n.localize(titleKey)}`,
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "yes",
          label: "Yes",
          icon: "fa-solid fa-check",
          default: true,
          callback: this.#issuePeristsWithOnlyPinned.bind(this),
        },
        {
          action: "no",
          label: game.i18n.localize("No") + " - " + game.i18n.localize("FILES.Search"),
          icon: "fa-solid fa-search",
          callback: this.#updateModListAndReload.bind(this),
        },
      ],
      classes: ["ftc-dialog", "find-the-culprit-app"],
      close: () => null,
      position: {
        width: standardWidth,
      },
    }).render({ force: true });
  }

  async #issuePeristsWithOnlyPinned() {
    const template = `modules/${MODULE_ID}/templates/issuePersistsWithOnlyPinned.hbs`;
    const templateContext = {
      icon: this.#icons.module.pinned,
      pinned: this.#modules.filter((m) => m.pinned).map((m) => game.modules.get(m.id).title),
    };
    const content = await renderTemplate(template, templateContext);
    const titleKey = `FindTheCulprit.IPWOP.${templateContext.pinned.length > 0 ? "Some" : "None"}PinnedTitle`;
    // secondary dialog doesn't get registered for rerendering if closed
    new DialogV2({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: this.title + " - " + game.i18n.localize(titleKey),
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "reset",
          default: true,
          icon: "fa-solid fa-rotate-left",
          label: "Reset",
          callback: this.reactivateOriginals.bind(this),
        },
      ],
      close: () => null,
      position: {
        width: standardWidth,
      },
    }).render({ force: true });
  }

  async #binarySearchStep() {
    if (this.#dialog) return this.#dialog.render({ force: true });
    const template = `modules/${MODULE_ID}/templates/binarySearchStep.hbs`;
    const templateData = {
      numRemaining: this.#modules.filter((m) => m.pinned === false && m.active !== null).length,
      currentStep: this.#data.currentStep,
      stepsLeft: this.#data.maxSteps - this.#data.currentStep,
      icons: this.#icons.module,
      groups: this.#modules.reduce(
        (groups, mod) => {
          mod.title = game.modules.get(mod.id).title;
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
    this.#dialog = await new DialogV2({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: this.title + " - " + game.i18n.localize("FindTheCulprit.BinarySearchStep.Title"),
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "yes",
          label: "Yes",
          icon: "fa-solid fa-check",
          callback: this.#updateModListAndReload.bind(this, true),
        },
        {
          action: "no",
          label: "No",
          icon: "fa-solid fa-xmark",
          default: true,
          callback: this.#updateModListAndReload.bind(this, false),
        },
        {
          action: "reset",
          icon: "fa-solid fa-rotate-left",
          label: "Reset",
          callback: this.reactivateOriginals.bind(this),
        },
      ],
      close: () => null,
      position: {
        width: standardWidth,
      },
    }).render({ force: true });
  }

  async #foundTheCulprit(culprit) {
    if (this.#dialog) return this.#dialog.render({ force: true });
    const template = `modules/${MODULE_ID}/templates/foundTheCulprit.hbs`;
    const content = await renderTemplate(template, {
      culprit: game.modules.get(culprit.id).title,
      pinned: this.#modules.filter((m) => m.pinned).map((m) => game.modules.get(m.id).title),
      icons: this.#icons.module,
    });
    this.#dialog = await new DialogV2({
      classes: ["ftc-dialog", "find-the-culprit-app"],
      window: {
        title: "FindTheCulprit.FindTheCulprit",
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "reset",
          default: true,
          icon: "fa-solid fa-rotate-left",
          label: "Reset",
          callback: this.reactivateOriginals.bind(this),
        },
        //TODO: reevaluate this option. Needs some way to say 'yep got to the end and no problem'
        // {
        //   action: "rerun",
        //   icon: "fa-solid fa-power-off",
        //   label: "Rerun Without Culprit",
        //   callback: this.#rerunWithoutCulprit.bind(this, culprit),
        // },
      ],
      close: () => null,
      position: {
        width: standardWidth,
      },
    }).render(true);
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
    const coreModList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    for (const modID in this.#data.modules) {
      if (this.#data.modules[modID].originallyActive) coreModList[modID] = true;
    }
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, coreModList);
    await this.#resetSetting();
    this.#reload();
  }

  async #rerunWithoutCulprit(culprit) {
    const update = {
      modules: this.#modules.reduce((mods, mod) => {
        mods[mod.id] = { active: true };
        if (mod.id === culprit.id) {
          mods[mod.id].priorPinned = false;
          mods[mod.id].pinned = null;
        }
        return mods;
      }, {}),
    };
    await this.#update(update);
    FindTheCulpritApp.#startRun.call(this);
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
    this.#dialog = await new DialogV2({
      window: {
        title: this.title + ` - ` + game.i18n.localize("Error"),
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "reset",
          default: true,
          icon: "fa-solid fa-rotate-left",
          label: "Reset",
          callback: this.reactivateOriginals.bind(this),
        },
      ],
      close: this.reactivateOriginals.bind(this),
      position: {
        width: standardWidth,
      },
    }).render({ force: true });
    throw new Error(message);
  }
}
