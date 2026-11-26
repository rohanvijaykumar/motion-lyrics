# Your own presets

Put a `.json` file here to create a named look you can reuse. It starts from a built-in
preset (`extends`) and changes only what you list. Any style field works; see
[docs/styles.md](../docs/styles.md).

```json
{
  "extends": "golden-sparkle",
  "description": "Our brand: teal fill, Montserrat, no sparkles",
  "text": {
    "primary": { "fontFamily": "Montserrat", "sungColor": "#2ec4b6" },
    "secondary": { "fontFamily": "Montserrat", "sungColor": "#2ec4b6" }
  },
  "effects": { "sparkles": { "enabled": false } }
}
```

Save it as `presets/our-brand.json`, then:

```bash
npm run presets                                   # lists it under "Your presets"
npm run make -- my-song --video song.mp4 --lyrics lyrics.txt --preset our-brand
```

A preset can extend another of your presets. When a project is created, the preset is copied
into its `project.json`, so later edits to this file do not change videos you already made.
