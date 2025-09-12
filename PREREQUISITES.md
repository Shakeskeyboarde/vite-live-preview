# Seahax Dev Container: Prerequisites

For dev containers to work correctly, some host configuration changes may be necessary

- [Docker Desktop](#docker-desktop)
- [Dev Container Extension](#dev-container-extension)
- [SSH Agent](#ssh-agent)
- [GPG Agent](#gpg-agent)

## Docker Desktop

The following settings are strongly recommended.

- **Resources (page) > Advanced (tab)**
  - **CPU limit (slider):** Set to about half the available cores (min 4).
  - **Memory Limit (slider):** Set to about half the available memory (min 8GB).
  - **Swap (slider):** Set to maximum (4GB).
  - **Disk usage limit (slider):** Set to about 1/4 of the available storage (~128 GB).

## Dev Container Extension

Install the VSCode [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension.

## SSH Agent

This is used for SSH with public key auth, including Git (over SSH). You must have an SSH private key (eg. `~/.ssh/id_ed25519`)

1. Ensure the `AllowAgentForwarding` option is set to `yes`.
   - Restart the computer if you change this option.
2. Ensure your SSH identities are added to (loaded in) the SSH agent before using SSH in the dev container. Run `ssh-add` (or `ssh-add --apple-use-keychain` on macOS).
   - You will need to do this once each time you log back into your computer.
   - **macOS:** Use `ssh-add --apple-load-keychain` to reload the identities from the Apple keychain without needing to enter the passphrase again. Running it in your `.zprofile` is enough to load them automatically before VSCode starts.

If you added your public key to Github for SSH auth, then you can test your credentials by running `ssh -T git@github.com`. If it works on the host, but not in the dev container, then SSH agent forwarding is not working correctly. The `ssh-add -L` command should also list the same identities when run on the host and in the dev container.

## GPG Agent 

Only necessary if the host has GnuPG (gpg) installed. You can check by running the `gpg --help` command. If the command is not found, then you can skip the following steps.

Run `gpg -k` before using GPG in the dev container. This will create the `keyboxd` socket in your `~/.gnupg` directory, which will prevent errors when using gpg to verify signatures (eg. during Mise install).
   - You will need to do this once each time you log back into your computer.
   - **macOS:** Running it in your `.zprofile` is enough to create the socket automatically before VSCode starts.
