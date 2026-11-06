# Jung's Service Desk — signed Windows updates

This repository distributes Windows installers, signed update metadata and distribution-only verification helpers. It contains no customer records or private application development checkout. Customer records remain local to the user's computer.

Install the first update-enabled version manually over the existing copy with the same Windows account. Then use **Settings > Program updates > Check for updates > Download update > Install and restart**. The app checks at startup and verifies a maintainer signature and the complete installer hash. It saves and backs up records before installation and never installs without the user's action.

The **updates** release is the download endpoint. Unpublished **candidate-…** releases are tested first. Maintainers manually run **Verify and sign update candidate** with the exact version and SHA256. An isolated standard Windows runner installs, checks and uninstalls the app. A separate runner signs only the verified artifact. This does not replace a recipient Windows 11 walkthrough.

The private key is an encrypted Actions secret, never a source file, installer credential or log entry. Ordinary users need no GitHub account or token to download published updates. Standard public runners are free; no paid service is configured.
