# Hand-written chapters

Chapters that aren't in the guide inside MSL. Each folder here becomes one
chapter of the site, and the folder's name becomes its URL (`placeholder/`).

```
_extras/
  placeholder/
    chapter.json      the chapter's title, blurb, colour and article order
    my-article.html   one file per article (copy _template.html)
```

`chapter.json`:

| Key | Means |
|---|---|
| `title` | Chapter title |
| `blurb` | One line under the title |
| `topic` | Colour group: `basics`, `app`, `apps`, `shell`, `instances`, `upkeep`, `security`, `trouble`, `reference` or `extras` |
| `after` | The chapter it comes after, by folder name (`reference` is the last app chapter). Leave it out to go last. |
| `articles` | Article file names, in order. Leave it out to list every `.html` file alphabetically. |

Then run `node _build/build.mjs`. The build fails if any link is broken.
Files and folders starting with `_` are ignored.
