import { registerSettings } from "./settings.mjs";
import { renderFinalDialog, stepZero } from "./steps.mjs";
export const MODULE_ID = "find-the-culprit";

Hooks.once("init", () => {
  registerSettings();
});

Hooks.on("renderModuleManagement", onRenderModuleManagement);

function onRenderModuleManagement(app, html, options) {
  html = html instanceof jQuery ? html[0] : html;
  const footer = html.querySelector("footer");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.innerHTML = '<i class="fa-solid fa-search"></i> Find the culprit!';
  btn.addEventListener("click", stepZero);
  footer.append(btn);
  app.setPosition();
}

Hooks.on("ready", doStep);

async function doStep() {
  const curr = game.settings.get(MODULE_ID, "modules");
  if (curr.step === undefined) return;
  if (curr.step === 0) return stepOne();
  return doBinarySearchStep();
}

export async function stepOne() {
  const curr = game.settings.get(MODULE_ID, "modules");
  new Dialog({
    title: "Find the culprit!",
    content: `<p>All modules, except your chosen ones, are deactivated.</p>
							<p>Does your issue persist?</p>`,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: "Yes",
        callback: () => {
          const chosen = curr.chosen;
          new Dialog({
            title: "Find the Culprit",
            content: `<p>Seems like the issue is a bug in ${
              chosen?.length
                ? `your chosen module list:
								<ul class='ftc-module-list'>
									${chosen.map((e) => `<li>- ${game.modules.get(e).title}</li>`).join("")}
								</ul>`
                : "the core software."
            }</p>`,
            buttons: {
              yes: {
                label: "Reactivate all modules",
                callback: async () => {
                  await reactivateModules();
                  resetSettings();
                },
              },
              no: {
                icon: '<i class="fas fa-times"></i>',
                label: "No",
              },
            },
          }).render(true);
        },
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: "No",
        callback: async () => {
          const curr = game.settings.get(MODULE_ID, "modules");
          curr.step = 1;
          await game.settings.set(MODULE_ID, "modules", curr);
          deactivationStep(curr.active);
        },
      },
    },
  }).render(true);
}

function doBinarySearchStep() {
  const curr = game.settings.get(MODULE_ID, "modules");
  const numActive = curr.active?.length || 0,
    numInactive = curr.inactive?.length || 0,
    stepsLeft = Math.ceil(Math.log2(numActive > numInactive ? numActive : numInactive)) + 1;
  new Dialog({
    title: `Find the culprit`,
    content: `<h2>Current statistics</h2>
							<p>${numActive + numInactive} modules still in list.<br>
							Remaining steps &leq; ${stepsLeft}.<br>
							Current module list:
								<ul class='ftc-module-list'>
									${(curr.active || [])
                    .map(
                      (e) =>
                        `<li title="Currently active."><i class="fas fa-check ftc-active"></i>${
                          game.modules.get(e)?.title ?? `| No Title Found for ${e} |`
                        }</li>`
                    )
                    .join("")}
									${(curr.inactive || [])
                    .map(
                      (e) =>
                        `<li title="Currently inactive."><i class="fas fa-times ftc-inactive"></i>${
                          game.modules.get(e)?.title ?? `| No Title Found for ${e} |`
                        }</li>`
                    )
                    .join("")}
								</ul>
							</p>
							<h2></h2>
							<h2 style="text-align:center; border-bottom: none;">Does your issue persist?</h2>`,
    buttons: {
      yes: {
        icon: '<i class="fas fa-check"></i>',
        label: "Yes",
        callback: async () => {
          deactivationStep(curr.active);
        },
      },
      no: {
        icon: '<i class="fas fa-times"></i>',
        label: "No",
        callback: async () => {
          deactivationStep(curr.inactive);
        },
      },
      reset: {
        icon: '<i class="fas fa-redo-alt"></i>',
        label: "Reset",
        callback: async () => {
          await reactivateModules();
          resetSettings();
        },
      },
    },
  }).render(true);
}

export async function deactivationStep(chosenModules = []) {
  if (chosenModules.length === 1) return renderFinalDialog(chosenModules[0]);

  const currSettings = game.settings.get(MODULE_ID, "modules");

  let original = game.settings.get("core", ModuleManagement.CONFIG_SETTING);

  // deactivate all modules
  const deactivate = Object.keys(original).filter((e) => !currSettings.chosen.includes(e) && e !== MODULE_ID);
  for (let module of deactivate) original[module] = false;

  if (chosenModules.length > 0) {
    const half = Math.ceil(chosenModules.length / 2);
    currSettings.inactive = chosenModules.slice(half);
    currSettings.active = chosenModules.slice(0, half);
    // activate only first half
    for (let module of currSettings.active) original[module] = true;

    await game.settings.set(MODULE_ID, "modules", currSettings);
  }

  await game.settings.set("core", ModuleManagement.CONFIG_SETTING, original);
  (foundry.utils.debouncedReload ?? window.location.reload)(); // Temporarily required by foundryvtt/foundryvtt#7740
}

export async function reactivateModules() {
  const curr = game.settings.get(MODULE_ID, "modules");
  let original = duplicate(game.settings.get("core", ModuleManagement.CONFIG_SETTING));
  for (let mod in curr.original) original[mod] = curr.original[mod];

  await game.settings.set("core", ModuleManagement.CONFIG_SETTING, original);
  (foundry.utils.debouncedReload ?? window.location.reload)(); // Temporarily required by foundryvtt/foundryvtt#7740
}

export async function resetSettings() {
  return game.settings.set(MODULE_ID, "modules", {
    "-=step": null,
    "-=active": null,
    "-=original": null,
    "-=inactive": null,
  });
}
