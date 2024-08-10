import { fu, MODULE, MODULE_ID } from "../constants.mjs";
import { actionLabel, actionTooltip, debug, lockTooltip } from "../helpers.mjs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class FindTheCulpritAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: FindTheCulpritAppV2.#startRun,
      closeOnSubmit: true,
      submitOnChange: false,
    },
    classes: ["find-the-culprit-app2", "standard-form"],
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

  static STATES = Object.freeze({
    DORMANT: 0,
    INITIAL: 1,
    SEARCHING: 2,
  });

  #toggles = {
    lockLibraries: ["fa-lock-open", "fa-lock"],
    mute: ["fa-volume-high", "fa-volume-xmark"],
    reloadAll: ["fa-user", "fa-users"],
  };
  #search;
  #persists = null;
  #data;
  #dependencies;

  constructor() {
    if (MODULE().app2 instanceof FindTheCulpritAppV2)
      throw new Error(game.i18n.localize("FindTheCulprit.Error.SelectModsSingleton"));
    super();

    this.#data = game.settings.get(MODULE_ID, "data");

    this.#initializeToggleControls();

    //This is to prune out modules that have a saved value in this world but are no longer installed.
    //Not sure if only my broken test world requires it, but I can't see how it'd hurt.
    if (this.#data.original.size === 0 && this.#data.runState === this.constructor.STATES.DORMANT) {
      const storedConfig = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
      const validOriginals = Object.keys(storedConfig).reduce((valid, modID) => {
        if (game.modules.get(modID)?.active) valid.push(modID);
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
    this.#updateSet("selected", this.#data.locks, true);

    //do this after initial locks/selected are updated
    this.#dependencies = this.#generateDependencies();

    Hooks.on("renderModuleManagement", this.#onRenderModuleManagement.bind(this));
  }

  #generateDependencies() {
    return game.modules.reduce((mods, mod) => {
      if (!mod.active) return mods;
      const modDependencies = mod.relationships.requires.filter((rel) => rel.type === "module");
      if (modDependencies.size === 0) return mods;
      const depData = modDependencies.reduce((deps, dep) => {
        const data = (deps[dep.id] = {
          installed: false,
          active: false,
        });
        const installed = game.modules.get(dep.id);
        if (!installed) return deps;
        data.installed = true;

        if (!installed.active) return deps;
        data.active = true;
        return deps;
      }, {});
      mods[mod.id] = depData;
      return mods;
    }, {});
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
    debug("#updateSet", { setName, ids, value, save });
    if (save) return this.#update({ [setName]: this.#data[setName] });
  }

  #toggleButtonValue(target) {
    const action = target.dataset.action;
    const newValue = !this.#data[action];
    this.#update({ [action]: newValue });
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
  static #toggleLockLibraries(event, target) {
    const enabled = this.#toggleButtonValue(target);
    this.#toggleButtonDOM(target);
    const libraries = game.modules.reduce((libs, mod) => {
      if (mod.active && mod.library) libs.push(`[name="locks.${mod.id}"]`);
      return libs;
    }, []);
    const selector = `input[type="checkbox"]:is(${libraries.join(", ")})`;
    this.#checkSelector(selector, enabled, { disabled: true });
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static #toggleMute(event, target) {
    const playSound = !this.#toggleButtonValue(target);
    this.#toggleButtonDOM(target);
    if (playSound)
      foundry.audio.AudioHelper.play({
        src: `sounds/doors/industrial/lock.ogg`,
        volume: game.settings.get("core", "globalAmbientVolume"),
      });
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static #clearAll() {
    if (this.#data.lockLibraries) {
      const llbtn = this.element.querySelector('[data-action="lockLibraries"]');
      FindTheCulpritAppV2.#toggleLockLibraries.call(this, null, llbtn);
    }
    this.#checkSelector('input[type="checkbox"]', false, { disabled: true });
  }

  /**
   * @this {FindTheCulpritAppV2}
   */
  static #zeroMods(event, target) {
    debug("#zeroMods", { event, target });
  }

  #check(checkbox, value, { bubbles = true, event = true } = {}) {
    const changed = checkbox.checked !== value;
    if (changed) {
      checkbox.checked = value;
      if (event) checkbox.dispatchEvent(new Event("change", { bubbles }));
    }
    return changed;
  }

  #checkSelector(query, checked = true, { callback = null, bubbles = true, event = true, disabled = false } = {}) {
    const checkboxen = this.element.querySelectorAll(query);
    if (typeof callback !== "function" && disabled)
      callback = (c) => {
        c.disabled = checked;
      };
    checkboxen.forEach((c) => {
      this.#check(c, checked, { bubbles, event });
      if (typeof callback === "function") callback(c);
    });
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
    await this.#updateSet("selected", id, checked);
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
      classes: ["ftc-dialog"],
    });
    if (!response) return;
    debug("dep response", { response });
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

    if (!this.#data.mute) {
      foundry.audio.AudioHelper.play({
        src: `sounds/doors/industrial/${checked ? "lock" : "unlock"}.ogg`,
        volume: game.settings.get("core", "globalAmbientVolume"),
      });
    }
    // debug("#onToggleLock", { selectedCheckbox, checked, locks: this.#data.locks, selected: this.#data.selected });

    const labelElement = target.closest("label");
    const wasTooltip = game.tooltip.element === labelElement;
    if (wasTooltip) game.tooltip.deactivate();
    labelElement.dataset.tooltip = game.i18n.localize(
      lockTooltip(checked, this.#data.lockLibraries, game.modules.get(id).library)
    );
    if (wasTooltip) game.tooltip.activate(labelElement);

    this.#toggleButtonIcon(labelElement, this.#toggles.lockLibraries, checked);
  }

  // #checkDependencyValidity(modID) {
  //   const deps = this.#dependencies[modID];
  //   const out = { valid: true };
  //   if (!deps) return out;
  //   return Object.entries(deps).reduce((out, [id,data]) => {
  //     if (!data.installed) {
  //       out.valid = false;
  //       out[id] = 
  //     }
  //     return out;
  //   }, out);
  // }

  // async #dependenciesDialog(modID, enabling) {
  //   const mod = game.modules.get(modID);
  //   const deps = this.#dependencies[modID];
  //   if (!deps) return true;    
  //   const templateData = {
  //     enabling,
  //     valid: this.#checkDependencyValidity(modID),
  //     title: mod.title,
  //     deps: this.#dependencies[]
  //   };
  // }

  _onRender(context, options) {
    //bind the searchfilter
    this.search.bind(this.element);
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
          selected: this.#data.selected.has(m.id),
          library: m.library,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    return context;
  }

  async resetSetting() {
    const defaultValue = game.settings.settings.get(`${MODULE_ID}.data`).default;
    return game.settings.set(MODULE_ID, "data", defaultValue);
  }

  #checkDepenencies(modID) {
    if (!(modID in this.#dependencies)) return;
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
  static #startRun(event, form, formData) {
    debug("#startRun", { event, form, formData });
  }

  doStep() {
    debug("doStepV2", fu.invertObject(this.constructor.STATES)[this.#data.runState]);
  }
}
