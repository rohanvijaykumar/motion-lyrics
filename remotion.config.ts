/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 * (npm run render does that in scripts/lib/render.ts, with the same webpack
 * settings from scripts/lib/webpack.ts.)
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { makeWebpackOverride } from "./scripts/lib/webpack";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
// Skia (shader layers) runs through react-native-web; GPU effects need WebGL.
Config.overrideWebpackConfig(makeWebpackOverride("rspack"));
Config.setChromiumOpenGlRenderer("angle");
