## Version 3.1.2

- Fix release screw-up

## Version 3.1.1

- Update pr-BR Translation for 3.1

## Version 3.1.0

- New Missing Dependencies handling
  - If you have an active module with one or more dependencies that are not active/not installed, you'll get a prompt on world load to fix your list
  - Replaces old behaviour of essentially 'Kernel Panic'
- Added Debug Level setting
  - Ideally no user will ever have to change this
- Full DorakoUI Compatibility
  - As far as I can tell, anyway. If you feel like your theme isn't being catered to, reach out.
- Partial PathfinderUI v3 Compatilibity
  - Pending their next release with the css class on body to key off of
- Actually enable pt-BR translation

## Version 3.0.1

- Add pt-BR translation (thanks @Kharmans !)
- Initial DorakoUI compatibility

## Version 3.0.0

- Foundry v12+ only release
- Converted the mod to ApplicationV2 exclusively
  - Rewrote the whole module more or less
  - Medium confidence in new CSS. Should work with all font sizes
  - Should be at least as accessible as the old UI, post an issue if you have advice on this front
  - Modules now have three possible states
    - Suspect, equivalent to unlocked & unchecked, enabled and disabled as normal
    - Pinned, equivalent to locked or checked, always active during the search
    - Excluded, new option to remove a module from the search (useful for pure asset modules etc)
  - Left click cycles up the state list, right click down
  - Usage instructions have been moved to their own dialog, along with caveats and disclaimers
    - Dialog will appear the first time you open the main FtC app each page refresh
    - Has an option to disable the above behaviour
    - Can be rendered via the Instructions button in the main app
  - Added button to restart with "Zero Modules" (other than FtC) enabled, for quick sanity checks  
- Implemented new algorithm for splitting mods in half between steps
  - Attempts to keep dependency chains together when possible, should reduce false positives
  - By default will shuffle the members of the list once dependencies are accounted for
    - This behaviour is toggleable via the Shuffle/Deterministic toggle button

## v2.1.3

- Fix closing the Only Selected Mods step dialog without clicking a button being treated as clicking No

## v2.1.2

- Remove debug code

## v2.1.1

- Fix the mute toggle saving to the wrong setting, overwriting lock libraries
- Fix the Clear All button clearing the mute and reload all checkboxen

## v2.1.0

- Add support for reloading all connected clients along with the culprit-finder's
- New toggle button in the main window
- The CSS is potentially flaky, please let me know if you experience weirdness

## v2.0.3

- Prevent running dependency checks when unlocking a module

## v2.0.2

- Attempt number two at fixing packaging issue

## v2.0.1

- Hopefully fix bizarre packaging issue around template file case and packaging

## v2.0.0

- Refactored the whole module
- New initial module selection FormApp has several new UI features
  - Force lock libraries toggle
  - Clear all button (removes all locks and deselects all modules)
  - Sound indicator on module lock/unlock (mute button included top right)
- Moved all UI text to localization strings. Localization PRs welcome!

## v1.5.0

- First release under new management
- v12 Compatibility
- Capitalization normalization

## V1.4.9

- Test of new release process

## v1.4.6

- Added semicolon to end of `await game.settings.set(...)` was causing reload logic to error

## v1.4.5

- Moved window reload logic to `await` instead of core settings `onchange` event. Fixes incompatibility between MM+ and Ftc

## v1.4.4

- Now compatible with FVTT v10, thanks to @arcanist

## v1.4.0

- Thanks to GitHub user @elizeuangelo for providing this patch!
- _New_ Search filter
- _New_ Dependency checking
- _New_ Lock/unlock button for remembering always active modules

## v1.3.3

- fixed all manifest failures now.. hopefully!

## v1.3.2

- reverted the "fail" save from 1.3.0, since it resulted in even more bugs, ooopsie.

## v1.3.1

- Fixed packaging, removed unecessary files from the package.
- now using some manifest+ features (created an icon)

## v1.3.0

- Added reset button to each step
- Fixed button (position) in settings
- Added "fail save" for some weird cases, where only 0 modules were left

## v1.2.1

- More missing manifest updates... Should return to doing this automatically..

## v1.2.0

- Updated manifest version....

## v1.1.0

- You may now select a list of modules to keep active.
- Added statistics to each step:
  - remaining modules in list
  - remaining steps
  - list of (in-)active modules
- Fixed some bug where (at least sometimes) the wrong result was shown
- Moved the "Find the culprit" button in module management to the bottom, right beside the "Save Module Settings" button.
- Cleaned up the code a bit.

## v1.0.0

- Initial release
