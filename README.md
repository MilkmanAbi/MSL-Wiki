# MSL Guide

The complete guide to [MSL](https://github.com/MilkmanAbi) — real Linux on your Mac.

**Read it at: https://milkmanabi.github.io/MSL-Wiki/**

117 articles across 19 chapters, covering everything from installing your
first distro to running a managed fleet.

## What's in it

| Chapter | |
|---|---|
| Welcome, Getting Started | Installing a distro, creating an instance, your first Linux app |
| The Main Window, Applications, Terminal | The app itself, and running Linux programs with their own Dock tiles |
| Managing Instances | Renaming and copying, provenance, encrypted images, port forwarding |
| Sandbox, Files, Graphics | Cutting an instance off, moving files, GPU acceleration |
| Power, Public Access, Admin Portal | Sleep and battery, reaching an instance from the internet, locking a Mac down |
| Troubleshooting, Command Line, Reference | When something goes wrong, and every command |

## How this is built

These pages are generated from the guide that ships **inside MSL**, by the
same parser the app uses:

```
swift run help-export ./site
```

There is no second copy of the text. Add an article to the app and it
appears here; a broken cross-reference fails the app's own tests long
before it could reach the web.

## Licence

MIT, like MSL itself — except mslgd, MSL's X11 server, which is GPL-3.0.
