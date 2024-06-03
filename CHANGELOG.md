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
