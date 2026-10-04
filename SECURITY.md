# Security policy

## Supported versions

Only the latest release of Marubako gets security fixes. If you are on an older version, update first and check whether the problem is still there.

## Reporting a vulnerability

Please report it privately. Do **not** open a public issue, a pull request or a discussion for a security problem.

1. Open the [Security tab of this repository](https://github.com/KaidoAsuka/marubako/security) and choose **Report a vulnerability**, or go straight to the [private report form](https://github.com/KaidoAsuka/marubako/security/advisories/new). This uses GitHub's private vulnerability reporting: only you and the maintainer can see the report.
2. Describe what you found: which version, what you did, what happened, and what an attacker could gain. A short proof of concept helps. Please do not attach real personal data.

This is a small project with one maintainer, so there is no service-level promise, but a report is normally answered within about a week. Once a fix is released, the report is published as a security advisory and you are credited, unless you prefer not to be.

## What the app sends

Marubako has no sign-up, no cloud sync and no telemetry. The only internet connection it makes by itself is to GitHub, to check for a new version and download it (shortly after it starts, then once a day). Those requests carry a random installation ID made by the updater and nothing you stored: no password, user name, site address, path, command or note is ever part of them. GitHub sees your IP address, as any server does. The portable copy asks GitHub at the same times, but only for the small file that names the newest version: it sends no ID and downloads nothing else, and tells you when there is a newer version. If an app you added is on a network share, Marubako reads its icon from that share when the Apps page is shown, as Explorer does.

## What counts

Things that are in scope:

- running commands or opening things the user did not ask for (for example through a crafted data file, import file, URL or path);
- reading or changing data outside what the app is meant to touch;
- weaknesses in the installer, in the update mechanism, or in how the release files are built and published.

Things that are known and documented, and so are not vulnerabilities:

- Passwords are a convenience, not a password manager. They are encrypted for your Windows account, but there is no master password, and a copied password stays on the clipboard. Anyone who can sign in to your Windows account can read them. See the README.
- A data file that was exported with passwords holds them as plain text.
- The installer is not code-signed, so Windows SmartScreen warns about it.
