import { deactivationStep } from "./find-the-culprit.mjs";
import { MODULE_ID, reactivateModules, resetSettings } from "./find-the-culprit.mjs";

export async function stepZero(ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const original = game.settings.get("core", ModuleManagement.CONFIG_SETTING);
  const settings = {
    original,
    active: Object.keys(original).filter((e) => original[e] && e !== MODULE_ID),
    step: 0,
  };
  const locks = game.settings.get(MODULE_ID, "locks");
  const template = `modules/${MODULE_ID}/templates/selectMods.hbs`;
  const templateData = {
    activeModules: settings.active.map((m) => ({
      id: m,
      title: game.modules.get(m).title,
    })),
    locks,
  };
  const content = await renderTemplate(template, templateData);
  const app = new Dialog({
    title: "Find the culprit",
    content,
    buttons: {
      yes: {
        icon: '<i class="fa-solid fa-check"></i>',
        label: "Start",
        callback: async (html) => {
          const chosen = Array.from(html[0].querySelectorAll('input[type="checkbox"].ftc-checkbox:checked') || []).map(
            (e) => e.dataset.module
          );

          settings.active = settings.active.filter((e) => !chosen.includes(e));
          settings.chosen = chosen;
          await game.settings.set(MODULE_ID, "modules", settings);
          deactivationStep([]);
        },
      },
      no: {
        icon: '<i class="fa-solid fa-times"></i>',
        label: "Cancel",
      },
    },
  }).render(true);
  const search = new SearchFilter({
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

  async function _onChangeCheckbox(ev) {
    const input = ev.target;
    const name = input.getAttribute("data-module");
    const module = game.modules.get(name);
    const lock = app.element.find(`input.lock-btn[data-module=${name}]`)[0];
    if (!module.relationships.requires.size) return;
    const allCheckboxes = app.element.find("input.ftc-checkbox").toArray();
    const checkBoxes = [];
    const locks = [];

    const dependenciesNotMatchingDesiredState = Array.from(
      module.relationships.requires.filter((x) => {
        const dependency = allCheckboxes.find((checkbox) => checkbox.getAttribute("data-module") === x.id);
        if (dependency && dependency.checked !== input.checked) {
          checkBoxes.push(dependency);
          const dependencyLock = app.element.find(`input.lock-btn[data-module=${x.id}]`)[0];
          if (lock.checked !== dependencyLock.checked) locks.push(dependencyLock);
          return true;
        }
        return false;
      })
    ).map((d) => {
      d.title = game.modules.get(d.id)?.title ?? "";
      return d;
    });

    if (dependenciesNotMatchingDesiredState.length == 0) return;
    const template = `modules/${MODULE_ID}/templates/dependenciesDialog.hbs`;

    const templateData = {
      enabling: input.checked,
      dependencies: dependenciesNotMatchingDesiredState,
    };
    const content = await renderTemplate(template, templateData);
    return Dialog.confirm({
      title: game.i18n.localize("MODMANAGE.Dependencies"),
      content,
      yes: () => {
        locks.forEach((checkbox) => {
          checkbox.checked = lock.checked;
          $(checkbox).trigger("change");
        });
        checkBoxes.forEach((checkbox) => {
          checkbox.checked = input.checked;
          $(checkbox).trigger("change");
        });
      },
      no: () => { },
    });
  }

  const renderHook = Hooks.on("renderDialog", (dialog, html) => {
    if (dialog.appId === app.appId) {
      search.bind(html[0]);
      html.find("input.lock-btn").on("change", (ev) => {
        const el = ev.target;
        const name = el.getAttribute("data-module");
        const target = html.find(`input.ftc-checkbox[data-module=${name}]`)[0];
        target.checked = el.checked;
        locks[name] = target.checked;
        $(target).trigger("change");
      });
      html.find("input.ftc-checkbox").on("change", _onChangeCheckbox);
      const closeHook = Hooks.on("closeDialog", (dialog, html) => {
        if (dialog.appId === app.appId) {
          game.settings.set(MODULE_ID, "locks", locks);
        }
        Hooks.off("closeDialog", closeHook);
      });
      Hooks.off("renderDialog", renderHook);
    }
  });
}

export async function renderFinalDialog(culprit) {
  const template = `modules/${MODULE_ID}/templates/foundTheCulprit.hbs`;
  const templateData = {
    culpritTitle: game.modules.get(culprit).title
  };
  const content = await renderTemplate(template, templateData);
  new Dialog({
    title: "Found the culprit!",
    content,
    buttons: {
      yes: {
        label: "Reactivate all modules?",
        callback: async () => {
          await reactivateModules();
          resetSettings();
        },
      },
      no: {
        icon: '<i class="fa-solid fa-times"></i>',
        label: "No",
        callback: resetSettings,
      },
    },
  }).render(true);
}
