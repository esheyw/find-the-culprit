# Find the Culprit

<img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/release/esheyw/find-the-culprit?style=for-the-badge"> <img alt="GitHub Releases" src="https://img.shields.io/github/downloads/esheyw/find-the-culprit/latest/total?style=for-the-badge">

This module helps you debug compatibility issues of modules, by finding the module that is responsible for the issue, without having to manually activate and deactivate all your modules yourself. Just click the **Find the Culprit** button in **Module Management** to start the process.

- You will be asked to select a module to keep active at all times. Choose the module that you want to debug.
- Your page will refresh, deactivating all modules, except the chosen one and this.
- Check whether your issue still persists.
- If the issue persists, the module will start a binary search by only reactivating half of your previously active modules, refreshing the page, going on like this until the culprit is found.
  - Just follow the prompts appearing after each refresh.
  - Depending on the number of modules you have installed this process could take a while, but at most `log(n) + 2` iterations, where _n_ is the number of modules you have activated.
- If you accidently close one of the prompts, just refresh the page manually and it will reappear.

## [Patch Notes](https://github.com/esheyw/find-the-culprit/blob/main/CHANGELOG.md)

## Current Dev Status

With v12 finally fully removing some deprecated code paths, this module has been picked up by a new author and is under active development again. Please report bugs to the tracker, feel free to make PRs, I'll accept useful help from anywhere.

<details><summary>Moerill's original Maintenance Mode message</summary>
This repository is no longer receiving active attention. In my opinion this module is complete and stable, and i'll be focusing my efforts on other modules/stuff. PR's are welcome and i'll try to investigate bugs and keep this module up to date with Foundry, when i find the time to do so.  
That said, feel free to keep suggesting features, if i find something interesting i may end up implementing it.
</details>

## Licensing

<img alt="GitHub" src="https://img.shields.io/github/license/moerill/fvtt-find-the-culprit?style=for-the-badge">

This work is licensed under Foundry Virtual Tabletop [EULA - Limited License Agreement for module development](https://foundryvtt.com/article/license/).

## Support the Development

I see no reason to change Moerill's original message on the subject:

> I'm doing this project mostly alone (with partial help of some wonderful people) in my spare time and for free.  
If you want to encourage me to keep doing this, i am happy about all kind of tokens of appreciation. (Like some nice words, recommending this project or contributions to the project).  
What about donations? I do feel very honored that you think about giving me a donation! But instead I'd prefer if you send the cash to a good cause of your choosing. :)
