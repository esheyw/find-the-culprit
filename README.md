# Find the Culprit

<img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/esheyw/find-the-culprit?style=for-the-badge"> <img alt="GitHub Releases" src="https://img.shields.io/github/downloads/esheyw/find-the-culprit/latest/total?style=for-the-badge">

This module automates the process of going through your module list to figure out which module is causing issues by repeated halving of your enabled modules. Just click the **Find the Culprit** button in **Module Management** to start the process.

## [Patch Notes](https://github.com/esheyw/find-the-culprit/blob/main/CHANGELOG.md)

## UI Overview

### Main UI

![Screenshot of the Find the Culprit main app with UI elements labelled with numbers](https://i.imgur.com/Og61Qp7.png)

1. Button to render the instructions dialog (see below)
2. Toggle button for deterministic vs shuffled splitting
   - Shuffled is the default. In this state, once the algorithm has split all the modules in the current searchables list that either are dependent upon or are a dependency of another module, the remaining modules are shuffled out of their default order (alphabetically by module ID)
   - Deterministic simply removes the shuffle step. This should never meaningfully impact the results, I'm including it as a toggle out of an abundance of caution
3. Mute sounds toggle
   - Right now the only actions that make sound are disabling this toggle itself or toggling Lock Libraries
   - Taking suggestions for suitable 'pin'/'unpin' sound effects
4. Search filter
   - Filters the module list by the input. Checks both title and ID
5. Module state cycle button
   - See Instructions below
6. Module title labels can also be left/right clicked like the buttons
7. The Clear All button sets Lock Libraries false and resets all modules to be Suspect
8. The Lock Libraries toggle will force-pin all modules marked as Library in their module.json
   - Enabled by default. Libraries are usually less likely to be the problem, and having them pinned allows for more shuffling quicker
   - That said, shouldn't be necessary with the new algorithm keeping depenencies active better.
9. Reload GM Only/All Toggle specifies whether connected player clients will reload along with the GM running the search
   - By default, only the GM client reloads, my logic being that in the case where you're troubleshooting mid-session, you want to minimize the disruption to your players, only making them reload their clients once you've got the culprit disabled or otherwise neutralized
   - However, this means that during the search you will be in a state where player clients have module code loaded that the GM doesn't, and if they're interacting with things while the search is running all sorts of badness could happen, and sometimes the issue at hand only manifests on non-gm clients, so the option is there
10. The Start Run button will immediately being the search process, no confirmation dialogs
11. The Zero Modules button is for doing quick sanity checks with no modules but Find the Culprit itself active.
    - After reloading, only prompts to reactivate previous modules, does not start a full search process

### Instructions dialog

The Instructions dialog will appear prior to the main UI the first time you open Find the Culprit each page refresh, unless it has been told not to. It can always be accessed via the button in the main UI.

![Screenshot of the Find the Culprit instructions dialog](https://i.imgur.com/SLT3dqn.png)

<details>
<summary>Text of the Instructions Dialog</summary>
<h4>Module States</h4>

- <strong>Suspect:</strong> A potential culprit, enabled and disabled as normal
- <strong>Pinned:</strong> Active at all times during the search
- <strong>Excluded:</strong> Disabled for the duration of the search
- <strong>Exonerated:</strong> You indicated that the issue did not persist while this module was active
- <strong>Exonerated (Active):</strong> Despite being exonerated, this module is active because one or more active suspect modules require it as a dependency
- <strong>Inactive:</strong> Still suspect, but not active this step
- <strong>Pinned:</strong> Active at all times during the search
- <strong>Suspect:</strong> A potential culprit, enabled and disabled as normal

Module states can be cycled through by clicking the module title or the button next to it, unless that module's state has been forced. Right clicking the button will cycle backwards. By default all modules are Suspect, except for those marked library by their authors, because the Lock Libraries toggle defaults to on.

Most interactive elements have tooltips explaining their function and/or current toggle state.

When the search starts, the page will refresh and you will be prompted to indicate if your issue persists. Follow the prompts through the steps of the search, which will narrow down the list of suspects until a single Culprit is found, after which you can return to the current active module list.

While this will be accurate for many types of issue, this process does not guarantee that the found culprit is the only module &ndash; or indeed <em>a module</em> &ndash; causing problems, as it cannot account for all module-module interactions. The module list splitting algorithm prevent a module from being enabled without its depdendencies, but not all module relationships are defined well enough to be accounted for this way.

Any closed search step dialogs can be retrieved by reloading the page or clicking the Find the Culprit button in Module Management.

</details>

1. Button to acknowledge the instructions dialog and prevent it from displaying prior to main UI load
   - Once so acknowledged, this button will be replaced with a "Show Every Time" button.
2. Clicking Continue (or closing the dialog) will render the main Find the Culprit UI

## Licensing

<img alt="GitHub" src="https://img.shields.io/github/license/esheyw/find-the-culprit?style=for-the-badge">

This work is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development](https://foundryvtt.com/article/license/).

## Support the Development

I see no reason to change Moerill's original message on the subject:

> I'm doing this project mostly alone (with partial help of some wonderful people) in my spare time and for free.  
> If you want to encourage me to keep doing this, i am happy about all kind of tokens of appreciation. (Like some nice words, recommending this project or contributions to the project).  
> What about donations? I do feel very honored that you think about giving me a donation! But instead I'd prefer if you send the cash to a good cause of your choosing. :)
