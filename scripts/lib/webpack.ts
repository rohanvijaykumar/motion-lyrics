/**
 * Bundler settings shared by renders (scripts/lib/render.ts, webpack) and
 * Studio (remotion.config.ts, Rspack): React Native Skia runs on the web
 * through react-native-web, and its CanvasKit WebAssembly file is copied into
 * the bundle.
 */
import type { WebpackOverrideFn } from "@remotion/bundler";
import { enableSkia } from "@remotion/skia/enable";

export function makeWebpackOverride(
  bundler: "webpack" | "rspack" = "webpack",
): WebpackOverrideFn {
  return (config) => {
    const withSkia = enableSkia(config, { bundler });
    return {
      ...withSkia,
      resolve: {
        ...withSkia.resolve,
        alias: {
          ...(withSkia.resolve?.alias as Record<string, string | false>),
          "react-native$": "react-native-web",
        },
      },
    };
  };
}

export const webpackOverride = makeWebpackOverride("webpack");
