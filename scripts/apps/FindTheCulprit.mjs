import { MODULE, MODULE_ID } from "../constants.mjs";
import { FtCModule } from "../data/models.mjs";
import { debug, oxfordList, shuffleArray } from "../helpers.mjs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const standardWidth = 425;
export class FindTheCulprit extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["find-the-culprit-app"],
    id: "find-the-culprit",
    position: {
      width: standardWidth,
    },
    actions: {
      clearAll: FindTheCulprit.#clearAll,
      cycle: {
        buttons: [0, 2],
        handler: FindTheCulprit.#cycle,
      },
      deterministic: FindTheCulprit.#toggleButton,
      instructions: FindTheCulprit.#instructions,
      lockLibraries: FindTheCulprit.#toggleButton,
      mute: FindTheCulprit.#toggleButton,
      reloadAll: FindTheCulprit.#toggleButton,
      startRun: FindTheCulprit.#startRun,
      zeroMods: FindTheCulprit.#zeroMods,
    },
    window: {
      title: "FindTheCulprit.FindTheCulprit",
      icon: "fa-solid fa-search",
      contentClasses: ["ftc-main"],
    },
  };

  static PARTS = {
    form: {
      id: "form",
      template: `modules/${MODULE_ID}/templates/main.hbs`,
      scrollable: [".ftc-module-list"],
    },
  };

  static #instance = null;

  static get instance() {
    return this.#instance;
  }

  #icons = {
    acknowledge: ["fa-eye-slash", "fa-eye"],
    clearAll: "fa-arrow-rotate-left",
    deterministic: ["fa-shuffle", "fa-bars"],
    instructions: "fa-list-ol",
    lockLibraries: ["fa-lock-open", "fa-lock"],
    module: {
      suspect: "fa-search",
      pinned: "fa-thumbtack",
      excluded: "fa-ban",
      active: "fa-magnifying-glass-plus",
      inactive: "fa-magnifying-glass-minus",
      exonerated: "fa-thumbs-up",
      exoneratedButActive: "fa-check",
      culprit: "fa-handcuffs",
    },
    mute: ["fa-volume-high", "fa-volume-xmark"],
    reloadAll: ["fa-user", "fa-users"],
    startRun: "fa-play",
    zeroMods: "fa-genderless",
  };
  #searchFilter;
  #data;
  #error;
  #instructionsSession;
  #excludedIDs = [MODULE_ID, "forge-vtt"];
  #modPrep;

  /**
   * An array of FtCModules where `originallyActive === true`
   *
   * @type {FtCModule[]}
   */
  get #modules() {
    return Object.values(this.#data.modules).filter((m) => m.originallyActive);
  }

  get instructions() {
    return this.#data.instructionsAcknowledged || this.#instructionsSession;
  }

  constructor() {
    if (FindTheCulprit.instance) return FindTheCulprit.instance;

    super();

    FindTheCulprit.#instance = MODULE().app = this;
    if (MODULE().debug && !("ftc" in globalThis)) globalThis.ftc = this;

    this.#data = game.settings.get(MODULE_ID, "data");

    this.#searchFilter = new SearchFilter({
      inputSelector: 'input[name="search"]',
      contentSelector: ".ftc-module-list",
      callback: (event, query, rgx, html) => {
        for (let li of html.children) {
          if (!query) {
            li.classList.remove("hidden");
            continue;
          }
          const modID = li.dataset.module;
          const title = (li.querySelector(".module-title")?.textContent || "").trim();
          const match = rgx.test(SearchFilter.cleanQuery(modID)) || rgx.test(SearchFilter.cleanQuery(title));
          li.classList.toggle("hidden", !match);
        }
      },
    });

    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));

    // don't prepare modules if we're in an error state to preserve source
    // only prepare modules if we're not mid-run
    this.#error = game.settings.get(MODULE_ID, "error");
    this.doStep();
  }

  async #update(changes = {}, { render = true, renderOptions = {} } = {}) {
    try {
      this.#data.updateSource(changes);
      if (render && this.rendered) this.render();
      return game.settings.set(MODULE_ID, "data", this.#data);
    } catch (error) {
      console.error("FindTheCulpritApp#update | Encountered an error, logging", { changes, render });
      throw error;
    }
  }

  async #prepareModules() {
    const activeModIDs = game.modules.filter((m) => m.active && !this.#excludedIDs.includes(m.id)).map((m) => m.id);
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
    return (this.#modPrep = this.#update({ modules }, { render: false }));
  }

  #getAllDependencies(modID) {
    const allDeps = new Set();
    const mod =
      modID instanceof foundry.packages.BaseModule ? modID : game.modules.get(modID?.id) ?? game.modules.get(modID);
    if (!mod || !mod.active) {
      this.#errorDialog(
        `#getAllDependencies | Attempted to get module ${
          mod ? `"${mod.title}"` : `ID "${modID}"`
        } which is required by at least one other module but is not ${mod?.active ? "installed" : "active"}`
      );
    }
    const modDeps = mod.relationships.requires.filter((r) => r.type === "module").map((r) => r.id);
    for (const req of modDeps) {
      allDeps.add(req);
      const depDeps = this.#getAllDependencies(req);
      depDeps.forEach((m) => allDeps.add(m));
    }
    return allDeps;
  }

  #playLock(locking = true) {
    if (this.#data.mute) return;
    foundry.audio.AudioHelper.play({
      src: `sounds/doors/industrial/${locking ? "" : "un"}lock.ogg`,
      volume: game.settings.get("core", "globalInterfaceVolume"),
    });
  }

  #onRenderModuleManagement(app, html) {
    html = html instanceof jQuery ? html[0] : html;
    const footer = html.querySelector("footer");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerHTML = `<i class="fa-solid fa-search"></i> ${game.i18n.localize("FindTheCulprit.FindTheCulprit")}`;
    btn.addEventListener("click", async () => {
      await this.render({ force: true });
      this.bringToFront();
    });
    footer.append(btn);
    app.setPosition();
  }

  async render(options = {}, _options = {}) {
    if (this.#data.currentStep !== null) {
      this.doStep();
      return this;
    }
    if (!this.instructions) {
      FindTheCulprit.#instructions.call(this);
      return this;
    }
    if (this.#modPrep) {
      await this.#modPrep;
      this.#modPrep = null;
    }
    return super.render(options, _options);
  }

  _preRender(context, options) {
    // only bother on the Select Mods window, and only on 2nd+ render
    if (this.#data.currentStep !== null || options.isFirstRender) return;
    for (const modData of context.modules) {
      modData.hidden =
        this.element.querySelector(`li[data-module="${modData.id}"]`)?.classList?.contains("hidden") ?? false;
    }
  }

  _onRender(context, options) {
    this.#searchFilter.bind(this.element);
    const modLabels = this.element.querySelectorAll("label.module-title[for]");
    for (const label of modLabels) {
      const button = document.getElementById(label.getAttribute("for"));
      label.addEventListener("contextmenu", (event) => {
        FindTheCulprit.#cycle.call(this, event, button);
      });
    }
  }

  #actionTooltip(name) {
    let key = `FindTheCulprit.Action.${name}.Tooltip`;
    if (name in this.#data) key += this.#data[name] ? ".Enabled" : ".Disabled";
    return new Handlebars.SafeString(game.i18n.localize(key));
  }

  #actionLabel(name) {
    let key = `FindTheCulprit.Action.${name}.Label`;
    if (name in this.#data) key += this.#data[name] ? ".Enabled" : ".Disabled";
    return new Handlebars.SafeString(game.i18n.localize(key));
  }

  async _prepareContext() {
    const context = {
      ftcActionTooltip: this.#actionTooltip.bind(this),
      ftcActionLabel: this.#actionLabel.bind(this),
      // convert values to numbers so handlebars can index icon arrays with them
      lockLibraries: this.#data.lockLibraries ? 1 : 0,
      reloadAll: this.#data.reloadAll ? 1 : 0,
      mute: this.#data.mute ? 1 : 0,
      deterministic: this.#data.deterministic ? 1 : 0,
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
   * @this {FindTheCulprit}
   */
  static async #toggleButton(event, target) {
    const action = target.dataset.action;
    const newValue = !this.#data[action];
    await this.#update({ [action]: newValue });
    if (action === "lockLibraries") this.#playLock(newValue);
    if (action === "mute") this.#playLock(true);
  }

  /**
   * @this {FindTheCulprit}
   */
  static async #clearAll() {
    const update = {
      lockLibraries: false,
      modules: this.#modules.reduce((mods, mod) => Object.assign(mods, { [mod.id]: { pinned: false } }), {}),
    };
    await this.#update(update);
  }

  /**
   * @this {FindTheCulprit}
   */
  static async #cycle(event, target) {
    const modID = target.closest("[data-module]").dataset.module;
    const state = target.dataset.ftcState;
    const states = ["suspect", "pinned", "excluded"];
    const newState =
      states[(states.indexOf(state) + (event.type === "contextmenu" ? -1 : 1) + states.length) % states.length];
    return this.#update({
      [`modules.${modID}.pinned`]: newState === "pinned" ? true : newState === "excluded" ? null : false,
    });
  }

  /**
   * @this {FindTheCulprit}
   */
  static async #zeroMods() {
    await this.#update({ zero: true }, { render: false });
    FindTheCulprit.#startRun.call(this);
  }

  /**
   * @this {FindTheCulprit}
   */
  static async #instructions(event, target) {
    if (typeof this.#data.currentStep === "number") return;
    const id = "find-the-culprit-instructions-dialog";
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      await existing.render({ force: true });
      return existing.bringToFront();
    }
    const template = `modules/${MODULE_ID}/templates/instructions.hbs`;
    const templateContext = {
      icons: this.#icons,
    };
    const content = await renderTemplate(template, templateContext);
    const dialogOptions = {
      classes: ["find-the-culprit-app"],
      id,
      window: {
        title: this.title + " - " + game.i18n.localize("FindTheCulprit.Action.instructions.Label"),
        icon: this.options.window.icon,
      },
      content,
      buttons: [
        {
          action: "acknowledge",
          label: `FindTheCulprit.Action.acknowledge.Label.${
            this.#data.instructionsAcknowledged ? "Enabled" : "Disabled"
          }`,
          icon: "fa-solid " + this.#icons.acknowledge[this.#data.instructionsAcknowledged ? 1 : 0],
          callback: async () => {
            this.#instructionsSession = true;
            await this.render({ force: true });
            this.#update({ instructionsAcknowledged: !this.#data.instructionsAcknowledged });
          },
        },
        {
          action: "close",
          label: "FindTheCulprit.Continue",
          icon: "fa-solid fa-arrow-right",
          default: true,
        },
      ],
      close: () => {
        this.#instructionsSession = true;
        this.render({ force: true });
      },
      rejectClose: false,
      position: {
        width: standardWidth * 1.5,
        ...(this.rendered && { left: this.position.left + standardWidth }),
      },
    };
    // using wait despite not awaiting for consolidated close behaviour
    DialogV2.wait(dialogOptions);
  }

  /**
   * @this {FindTheCulprit}
   */
  static async #startRun(event, form, formData) {
    const modules = this.#modules.reduce((mods, mod) => Object.assign(mods, { [mod.id]: { active: true } }), {});
    if (this.rendered) {
      const forcedList = Array.from(this.element.querySelectorAll(`button[disabled]`)).map((n) => ({
        id: n.closest("[data-module]").dataset.module,
        state: n.dataset.ftcState,
      }));

      for (const mod of forcedList) {
        modules[mod.id] = {
          // forced will only be pinned or excluded, there's no 'forced suspect'
          pinned: mod.state === "pinned" ? true : null,
          priorPinned: this.#data.modules[mod.id].pinned,
        };
      }
      this.close();
    }
    await this.#update(
      {
        modules: modules,
        currentStep: -1,
      },
      { render: false }
    );
    this.#updateModListAndReload();
  }

  async #updateModListAndReload(culpritInActiveHalf = true, { confirmStep = false } = {}) {
    if (typeof this.#data.currentStep !== "number") return;

    const active = this.#modules.filter((m) => m.pinned === false && m.active === true);
    const inactive = this.#modules.filter((m) => m.pinned === false && m.active === false);
    const [newlyExonerated, remainingSearchables] = culpritInActiveHalf ? [inactive, active] : [active, inactive];
    // if this is the confirmStep, pass through to regular handling if the culprit wasn't active
    if ((!confirmStep || culpritInActiveHalf) && remainingSearchables.length === 1)
      return this.#foundTheCulprit(remainingSearchables[0]);

    if (remainingSearchables.length === 0) {
      return FindTheCulprit.#startRun.call(this);
    }
    const coreModuleList = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
    // Disable every module that isn't pinned. If zero is passed, disable those too.
    for (const modID in coreModuleList) {
      if (this.#excludedIDs.includes(modID)) continue;
      const activeMod = this.#modules.find((m) => m.id === modID);
      coreModuleList[modID] = activeMod && activeMod.pinned && !this.#data.zero;
    }

    const update = {
      currentStep: this.#data.currentStep + 1,
      modules: newlyExonerated.reduce((mods, mod) => {
        // update the in-memory list now so the filtering below is accurate
        mods[mod.id] = mod.updateSource({ active: null });
        return mods;
      }, {}),
    };
    // Only split active mods *after* step 0, which is 'only pinned active' or 'zero mods active'
    // saved currentStep lags by 1 at this point because the update is delayed til after the split
    if (this.#data.currentStep > -1) {
      //TODO: possibly add option for fully dumb searching
      // create filtered requires/dependencyOf lists for use in sorting remainingSearchables and costing picks when splitting
      for (const mod of remainingSearchables) {
        mod.filteredRequires = mod.requires.filter((id) => {
          const dependency = this.#data.modules[id];
          return dependency.active !== null && !dependency.pinned;
        });
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
        // Dependencies that are already picked this split, pinned, or exonerated don't count towards module effectiveSize
        let effectiveSize = 1;
        const unpickedDependencyIDs = [];
        const exoneratedDependencyIDs = [];
        let possiblyErroneouslyExonerated;
        for (const id of pick.requires) {
          if (newActive.find((m) => m.id === id) || this.#data.modules[id].pinned) {
            // already picked or pinned, no cost, no action required
            continue;
          } else if (this.#data.modules[id].active === null) {
            // store for activation *if* pick goes to newActive
            exoneratedDependencyIDs.push(id);
            continue;
          } else if ((possiblyErroneouslyExonerated = newInactive.find((m) => m.id === id))) {
            // dependency discarded before dependant; this should never happen
            this.#errorDialog(
              `#updateModListAndReload | Module "${game.modules.get(pick.id).title}" requires module "${
                game.modules.get(possiblyErroneouslyExonerated).title
              }" which FtC's algorithm has erroneously discarded before its dependant this step.`
            );
          } else if (this.#data.modules[id].pinned === null) {
            // run was started with a dependency excluded; this should never happen
            this.#errorDialog(
              `#updateModListAndReload | Module "${game.modules.get(pick.id).title}" requires module "${
                game.modules.get(id).title
              }" which has been Excluded this run somehow.`
            );
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
        update.modules[modData.id] = { active: false };
      }
      for (const modData of newActive) {
        update.modules[modData.id] = { active: true };
      }
      const modIDsToEnable = newActive.map((m) => m.id).concat([...exoneratedModulesRequired]);
      for (const id of modIDsToEnable) coreModuleList[id] = true;
    }
    await this.#update(update, { render: false });
    await game.settings.set("core", ModuleManagement.CONFIG_SETTING, coreModuleList);
    this.#reload();
  }

  async doStep() {
    if (this.#error) return this.#errorDialog();
    if (typeof this.#data.currentStep !== "number") return this.#prepareModules();
    if (this.#data.currentStep === 0) {
      if (this.#data.zero) this.#zeroModsDialog();
      else this.#onlyPinnedMods();
    } else {
      this.#binarySearchStep();
    }
  }

  async #zeroModsDialog() {
    const id = "find-the-culprit-zero-mods-dialog";
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      await existing.render({ force: true });
      return existing.bringToFront();
    }
    new DialogV2({
      classes: ["find-the-culprit-app"],
      window: {
        title: `${this.title} - ${game.i18n.localize("FindTheCulprit.ZeroModules.Title")}`,
        icon: this.options.window.icon,
      },
      id,
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
    const id = "find-the-culprit-only-pinned-mods";
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      await existing.render({ force: true });
      return existing.bringToFront();
    }
    const template = `modules/${MODULE_ID}/templates/onlyPinnedActive.hbs`;
    const anyPinned = this.#modules.filter((m) => m.pinned).length > 0;
    const content = await renderTemplate(template, {
      anyPinned, // we only care about some or none pinned
      maxSteps: this.#data.maxSteps,
    });
    const titleKey = "FindTheCulprit.StartOfRun." + (anyPinned ? "Some" : "None") + "PinnedTitle";
    new DialogV2({
      window: {
        title: `${this.title} - ${game.i18n.localize(titleKey)}`,
        icon: this.options.window.icon,
      },
      id,
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
      classes: ["find-the-culprit-app"],
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
      classes: ["find-the-culprit-app"],
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
    const id = "find-the-culprit-binary-search-step";
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      await existing.render({ force: true });
      return existing.bringToFront();
    }
    const isConfirmStep = this.#data.remainingSteps === 0;
    const template = `modules/${MODULE_ID}/templates/binarySearchStep.hbs`;
    const templateData = {
      numRemaining: this.#data.searchablesCount,
      currentStep: this.#data.currentStep,
      remainingSteps: this.#data.remainingSteps,
      icons: this.#icons,
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
    const titleKey = `FindTheCulprit.BinarySearchStep.${isConfirmStep ? "ConfirmStep" : ""}Title`;
    new DialogV2({
      classes: ["find-the-culprit-app"],
      window: {
        title: this.title + " - " + game.i18n.localize(titleKey),
        icon: this.options.window.icon,
      },
      id,
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
          label: isConfirmStep ? "FindTheCulprit.BinarySearchStep.WrongCulprit" : "No",
          icon: `fa-solid ${isConfirmStep ? "fa-thumbs-down" : "fa-xmark"}`,
          default: !isConfirmStep,
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
    const id = "find-the-culprit-found-the-culprit";
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      await existing.render({ force: true });
      return existing.bringToFront();
    }
    const confirmStep = this.#data.remainingSteps === 0;
    const template = `modules/${MODULE_ID}/templates/foundTheCulprit.hbs`;
    const content = await renderTemplate(template, {
      //TODO: why am I passing in the rest of the data for the culprit? I had a reason at one point...
      culprit: {
        ...culprit,
        title: game.modules.get(culprit.id).title,
      },
      confirmStep,
      pinned: this.#modules.filter((m) => m.pinned).map((m) => game.modules.get(m.id).title),
      icons: this.#icons,
    });
    const dialogOptions = {
      classes: ["find-the-culprit-app"],
      window: {
        title: this.title + " - " + game.i18n.localize("FindTheCulprit.FoundTheCulprit.Title"),
        icon: this.options.window.icon,
      },
      id,
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
    };
    // only include the confirm button if the culprit isn't already active
    if (!culprit.active) {
      dialogOptions.buttons.push({
        action: "confirm",
        icon: "fa-solid fa-check-double",
        label: "Confirm",
        callback: this.#updateModListAndReload.bind(this, false, { confirmStep: true }),
      });
    }
    new DialogV2(dialogOptions).render(true);
  }

  async #resetSetting() {
    const update = {
      modules: this.#modules.reduce(
        (mods, mod) =>
          Object.assign(mods, {
            [mod.id]: {
              active: true,
              pinned: mod.priorPinned === undefined ? mod.pinned : mod.priorPinned,
              priorPinned: undefined,
            },
          }),
        {}
      ),
      zero: false,
      currentStep: null,
      maxSteps: 0,
    };
    await game.settings.set(MODULE_ID, "error", null);
    return this.#update(update, { render: false });
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

  async #errorDialog(message) {
    const id = "find-the-culprit-error-dialog";
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      await existing.render({ force: true });
      return existing.bringToFront();
    }
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
    await new DialogV2({
      classes: ["find-the-culprit-app"],
      window: {
        title: this.title + ` - ` + game.i18n.localize("Error"),
        icon: this.options.window.icon,
      },
      id,
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
    if (MODULE().debug > 1) debugger;
    throw new Error(message);
  }

  #reload() {
    if (this.#data.reloadAll) game.socket.emit("reload");
    foundry.utils.debouncedReload();
  }
}
