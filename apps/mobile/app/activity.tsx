import React from "react";
import { Redirect } from "expo-router";

// Keep old bookmarks working after moving challenges to participants' email.
export default function FormerInbox() {
  return <Redirect href="/" />;
}
