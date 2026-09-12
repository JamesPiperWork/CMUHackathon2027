import React from "react";
import { Redirect } from "expo-router";

// Older bookmarks keep working after retiring the video recap.
export default function RetiredRecap() {
  return <Redirect href="/matchups" />;
}
