# Marubako

[English](README.md) | [简体中文](README.zh-CN.md)

[![CI](https://github.com/KaidoAsuka/marubako/actions/workflows/ci.yml/badge.svg)](https://github.com/KaidoAsuka/marubako/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Marubako is a small panel for Windows that keeps the things you open again and again at work in one place: folders and documents, the pages of every environment, accounts and passwords, the commands you keep typing, notes and the tasks of the day. Most of the time it is a small bubble at the edge of the screen; one shortcut brings it up.

<p align="center">
  <img src="docs/images/demo-open.gif" width="460" alt="The shortcut brings the panel out of the floating bubble; one click opens the folder of the design documents, and on the Sites page one click opens the admin console of the test environment">
</p>

## Why I made it

I thought of this tool while working as a software developer.

There was too much to keep track of: reference material and design documents, documents that live online, more development and test pages than I could count, and the user names and passwords that go with them. The server accounts came as one set per environment. Every time I needed one of these, I first had to open some document and look it up, and switching between environments made it worse.

Now all of it is in Marubako, and it is much simpler: one shortcut, one click to open what I need, one click to copy what I have to type. My desktop is empty too. It used to be covered with files and shortcuts; they are all in here now.

## How it helps

The demos below use made-up data.

### Documents and pages open with one click

`Ctrl + Shift + Space` brings the panel up from any program (see the demo at the top). Folders, sites and apps each have a page, and you can group them by project or by environment; `Alt + 1` to `Alt + 7` switch categories. Adding something needs no form: drop files, folders or web addresses onto the panel, or paste a link or a path with `Ctrl + V`, and Marubako files it in the right category.

### The accounts, passwords and commands of every environment copy with one click

<p align="center">
  <img src="docs/images/demo-copy.gif" width="460" alt="On the Passwords page one click copies the user name of a test account and another copies its password; on the Commands page one click copies the command that follows the logs">
</p>

One group each for development, test and staging. User name and password are copied separately, and the password stays hidden. The commands you use all the time (log in to a server, follow the logs, restart a service) are kept here as well, with syntax highlighting; a click copies a command and never runs it.

### When you cannot remember where it is, search

<p align="center">
  <img src="docs/images/demo-search.gif" width="460" alt="Ctrl + K, the word test, and the results from every category are listed; the arrow keys choose one and Enter opens it">
</p>

`Ctrl + K` searches every category. `Enter` opens an item or copies its content, `Shift + Enter` edits it, and `Alt + 1` to `Alt + 9` jump straight to a result.

### A small bubble when you do not need it, and an empty desktop

<p align="center">
  <img src="docs/images/demo-ball.gif" width="560" alt="The button in the title bar collapses the panel into the floating bubble; a double click on the bubble opens it again; dragging the panel takes the bubble along">
</p>

`Esc` or the purple button in the title bar collapses the panel into a small bubble that stays on top. Click the bubble to peek (the panel collapses again when the pointer leaves); double-click it to keep the panel open. The bubble and the panel are a pair: drag either one and the other comes along.

### And also

- **Daily tasks.** A task list per day with subtasks, a week strip and a calendar.
- **Notes.** Release steps, contacts, anything you want to jot down; one click copies a note.
- **Local only.** No account and no cloud. Your data is one plain JSON file on your PC, with automatic daily backups and export and import. The only network traffic is the update check.
- **Yours to style.** Light and dark themes (or whichever Windows is in), six accent colors including a Monokai palette, items as a list or as tiles, interface size, opacity and animation speed. The interface comes in English, Chinese and Japanese and follows your system language at first start.

<table>
  <tr>
    <td><img src="docs/images/group.png" width="380" alt="A group of folders opened as a popup, in the dark theme with items as tiles"></td>
    <td><img src="docs/images/settings.png" width="380" alt="The settings dialog: three theme choices and six accent colors"></td>
  </tr>
</table>

## Download and install

Requires Windows 10 or 11 (64-bit).

1. Open the [latest release](https://github.com/KaidoAsuka/marubako/releases/latest) and download `Marubako-Setup-<version>.exe` from its **Assets**.
2. Run the installer. Windows will probably stop you with a blue window that says **Windows protected your PC**. This is expected: the installer is not code-signed yet (certificates cost money, and this is a free hobby project), and SmartScreen warns about every new program that is not signed. To go on:
   1. Click **More info**. A second button appears.
   2. Click **Run anyway**.
3. The installer has no wizard and asks nothing: it installs Marubako for your Windows account only (no administrator prompt) into `%LOCALAPPDATA%\Programs\Marubako` and starts it.

If you want to be sure the file is the one published here, download it only from the Releases page of this repository and compare its checksum with the SHA-256 shown next to the file there:

```powershell
Get-FileHash .\Marubako-Setup-<version>.exe -Algorithm SHA256
```

**Updates.** Marubako looks for a new version on GitHub Releases shortly after it starts, and then once a day. A newer version is downloaded in the background. **Settings > Language & data** shows the version you are running and has a **Check for updates** button; when a version is downloaded, **Restart and update** installs it at once. It is also installed when you quit Marubako from the tray menu (closing the window only hides it to the tray, and Windows does not run the installer when it shuts down or restarts).

**Uninstalling.** Use **Settings > Apps > Installed apps** in Windows. The uninstaller asks whether to delete your data too (items, settings and saved passwords in `%APPDATA%\marubako`); the default is **No**, and updates and silent uninstalls always keep it.

## Getting started

- A new installation comes with a sample in every category. Replace them with your own: the **+** button, `Ctrl + N`, a drop or a paste all add an item.
- `Ctrl + Shift + Space` opens the panel from anywhere. You can change this shortcut, or turn it off, in the settings.
- The bubble <img src="docs/images/ball.png" width="22" alt="the floating bubble"> is where the panel goes when you press `Esc`. The close button hides Marubako to the system tray instead; use the tray menu to quit.
- Right-click an item for the menu, or press `F2` to rename or edit it and `Del` to delete it. A delete can be undone for a few seconds with `Ctrl + Z`.

All the details of how the panel behaves are in the [behavior notes](docs/behavior.zh-CN.md) (written in Chinese).

## Where your data lives, and backups

Everything is in `%APPDATA%\marubako\` (paste that into the Explorer address bar):

| File or folder          | What it holds                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `quicklaunch-data.json` | All your items. Plain JSON that you can open in Notepad; only the passwords are encrypted, one by one. (The file kept its old name on purpose.) |
| `window-state.json`     | Window position, size and the position of the bubble.                                                                                           |
| `backups\`              | One automatic backup per day (the last 7 days), and a copy of your data right before every import (the last 3).                                 |
| `logs\main.log`         | The log. Attach the relevant lines when you report a problem, after removing anything private.                                                  |

To make a backup, or to move to another computer, use **Settings > Language & data > Export data**, and **Import data** on the other side. Copying the folder does not work across computers: passwords are encrypted for one Windows account on one PC. When your data contains passwords, the export asks whether to include them; a file that includes them holds them as **plain text**, so keep it somewhere safe. To restore from an automatic backup, import one of the files in `backups\`.

## About the passwords category

The passwords category is for accounts you want at hand, such as those of test environments and development servers. It is a convenience, not a password manager: each password is encrypted for your Windows account on this PC, but there is no master password, so anyone who can sign in to that Windows account can read them, and a copied password stays on the clipboard until you copy something else. Keep the passwords that really matter (banking, your main e-mail, recovery codes) in a dedicated password manager.

## Build from source

You need Windows, [Node.js](https://nodejs.org/) 22.13 or newer, and Git.

```powershell
git clone https://github.com/KaidoAsuka/marubako.git
cd marubako
npm ci
npm run dev       # run the app from source; it uses %APPDATA%\marubako-dev, not your real data
npm test          # unit tests
npm run dist      # build the installer into release\<version>\
```

[CONTRIBUTING.md](CONTRIBUTING.md) has the rest: tests, code style and how to open a pull request.

## Contributing and support

Bug reports and ideas are welcome in the [issue tracker](https://github.com/KaidoAsuka/marubako/issues); pick the form that fits. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you open a pull request. Security problems go through [SECURITY.md](SECURITY.md), not a public issue.

If you change interface text: the words of the interface follow the glossary at the top of `src/renderer/src/i18n/translations.ts`, and `src/renderer/src/i18n/__tests__/glossary.test.ts` fails when a banned wording comes back.

## License

[MIT](LICENSE). Third-party software and its licenses are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
