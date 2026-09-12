import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(__dirname, "../../.env") });
export default {
  expo: {
    name: "Fantasy Phishing",
    slug: "fantasy-phishing",
    scheme: "fantasyphishing",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "dark",
    web: { bundler: "metro", output: "single", name: "Fantasy Phishing" },
    ios: { bundleIdentifier: "com.fantasyphishing.demo" },
    android: { package: "com.fantasyphishing.demo" },
    plugins: [
      "expo-router",
      "expo-secure-store",
      ...(process.env.EXPO_PUBLIC_AUTH0_DOMAIN
        ? [
            [
              "react-native-auth0",
              {
                domain: process.env.EXPO_PUBLIC_AUTH0_DOMAIN,
                customScheme: "fantasyphishing",
              },
            ],
          ]
        : []),
    ],
    experiments: { typedRoutes: false },
  },
};
