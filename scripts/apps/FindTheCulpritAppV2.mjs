import { MODULE, MODULE_ID } from "../find-the-culprit.mjs";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class FindTheCulpritAppV2 extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      closeOnSubmit: true,
      submitOnChange: false,
    },
    classes: ["find-the-culprit-app2", "standard-form"],
    uniqueId: "find-the-culprit",
    position: {
      width: 400,
    },
    window: {
      controls: [
        {
          action: "zeroMods",
          icon: "fa-solid fa-0",
          label: "No Module Quick Check",
        },
      ],
    },
  };

  static PARTS = {
    form: {
      id: "main",
      template: `modules/${MODULE_ID}/templates/FindTheCulpritMain.hbs`,
      scrollable: [".ftc-module-chooser"],
    },
  };

  static STATES = Object.freeze({
    DORMANT: 0,
    INITIAL: 1,
    BINARY: 2,
  });

  #search;
  #selectedModules = new Set();
  #lockLibraries;
  #stepData;
  #persists = null;
  #reloadAll;
  #mute;
  #data;

  constructor() {
    if (MODULE().app instanceof FindTheCulpritAppV2)
      throw new Error(game.i18n.localize("FindTheCulprit.Error.SelectModsSingleton"));
    super();
    this.#data = game.settings.get(MODULE_ID, "data");
    //This is to prune out modules that have a saved value in this world but are no longer installed.
    //Not sure if only my broken test world requires it, but I can't see how it'd hurt.
    const existingMods = game.modules.map((m) => m.id);
    this.#data.original ??= Object.entries(game.settings.get("core", ModuleManagement.CONFIG_SETTING)).reduce(
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

  _initializeApplicationOptions(options) {
    delete options.uniqueId; // this should never matter but why not guard anyway
    super._initalizeApplicationOptions(options);
  }

  async _prepareContext(options = {}) {
    const locks = game.settings.get(MODULE_ID, "locks");
    const context = {
      mute: this.#mute,
      lockLibraries: this.#lockLibraries,
      reloadAll: this.#reloadAll,
      activeModules: game.modules
        .filter((m) => m.active && m.id !== MODULE_ID)
        .map((m) => ({
          id: m.id,
          title: m.title,
          locked: locks[m.id] || (m.library && this.#lockLibraries),
          selected: this.#selectedModules[m.id],
          library: m.library,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    };
    return context;
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
}
